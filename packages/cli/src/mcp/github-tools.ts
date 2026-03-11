/**
 * GitHub Issue Lifecycle MCP Tools -- GitHub operations exposed as MCP tools
 *
 * Provides MCP tools for issue CRUD, board setup, sync checking, and PR creation.
 * Every tool calls requireAuth() as its first operation and returns a structured
 * error with setup instructions if auth fails (AuthError).
 *
 * Uses the new Octokit-based adapter modules (client.ts, issues.ts, labels.ts,
 * milestones.ts, projects.ts) -- uses Octokit adapter exclusively.
 *
 * CRITICAL: Never import output() or error() from core -- they call process.exit().
 * CRITICAL: Never write to stdout -- it is reserved for MCP JSON-RPC protocol.
 * CRITICAL: Never call process.exit() -- the server must stay alive after every tool call.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
  requireAuth,
  getRepoInfo,
} from '../github/index.js';
import { AuthError } from '../github/types.js';
import {
  createPhaseIssue,
  createTaskSubIssue,
  postPlanComment,
  closeIssue,
  reopenIssue,
  getPhaseIssue,
  listPhaseSubIssues,
  postCompletionComment,
  postComment,
} from '../github/issues.js';
import {
  ensureProjectBoard,
  addItemToProject,
  moveItemToStatus,
  getProjectBoard,
} from '../github/projects.js';
import { ensureLabels } from '../github/labels.js';
import { ensureMilestone } from '../github/milestones.js';
import { installIssueTemplates } from '../github/templates.js';
import type { IssueStatus } from '../github/types.js';
import { loadMapping, updateTaskMapping, hashBody } from '../github/mapping.js';

import { detectProjectRoot, mcpSuccess, mcpError } from './utils.js';

/**
 * Return a structured MCP auth error response with setup instructions.
 */
function mcpAuthError(e: AuthError) {
  return mcpError(
    `GitHub auth required: ${e.message}`,
    'Authentication required',
  );
}

/**
 * Register all GitHub issue lifecycle tools on the MCP server.
 */
export function registerGitHubTools(server: McpServer): void {
  // -- mcp_github_setup ---------------------------------------------------------

  server.tool(
    'mcp_github_setup',
    'Set up GitHub integration: create project board, labels, milestone, and issue templates.',
    {
      milestone_title: z
        .string()
        .optional()
        .describe('Milestone title (defaults to current milestone from STATE.md)'),
    },
    async ({ milestone_title }) => {
      try {
        try {
          requireAuth();
        } catch (e) {
          if (e instanceof AuthError) {
            return mcpAuthError(e);
          }
          throw e;
        }

        const cwd = detectProjectRoot();
        if (!cwd) {
          return mcpError('No .planning/ directory found', 'Project not detected');
        }

        // Full mode: create board, labels, milestone, templates
        const boardTitle = 'MAXSIM Task Board';
        const boardResult = await ensureProjectBoard(boardTitle);
        if (!boardResult.ok) {
          return mcpError(`Board setup failed: ${boardResult.error}`, 'Setup failed');
        }

        const labelsResult = await ensureLabels();
        if (!labelsResult.ok) {
          return mcpError(`Label setup failed: ${labelsResult.error}`, 'Setup failed');
        }

        let milestoneData: { number: number } | null = null;
        if (milestone_title) {
          const msResult = await ensureMilestone(milestone_title);
          if (msResult.ok) {
            milestoneData = msResult.data;
          }
        }

        installIssueTemplates(cwd);

        return mcpSuccess(
          {
            board: {
              projectNumber: boardResult.data.projectNumber,
              projectId: boardResult.data.projectId,
            },
            labels_created: true,
            milestone: milestoneData
              ? {
                  number: milestoneData.number,
                  title: milestone_title,
                }
              : null,
            templates_installed: true,
          },
          `GitHub integration set up: board #${boardResult.data.projectNumber}, labels, ${milestoneData ? `milestone "${milestone_title}"` : 'no milestone'}, templates`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // -- mcp_create_phase_issue ---------------------------------------------------

  server.tool(
    'mcp_create_phase_issue',
    'Create a GitHub Issue for a MAXSIM phase with sub-issue linking support.',
    {
      phase_number: z.string().describe('Phase number (e.g. "01")'),
      phase_name: z.string().describe('Phase name (e.g. "GitHub Issues Foundation")'),
      goal: z.string().describe('Phase goal description'),
      requirements: z
        .array(z.string())
        .optional()
        .default([])
        .describe('Requirement IDs this phase covers'),
      success_criteria: z
        .array(z.string())
        .optional()
        .default([])
        .describe('Phase success criteria'),
    },
    async ({ phase_number, phase_name, goal, requirements, success_criteria }) => {
      try {
        try {
          requireAuth();
        } catch (e) {
          if (e instanceof AuthError) {
            return mcpAuthError(e);
          }
          throw e;
        }

        const result = await createPhaseIssue(
          phase_number,
          phase_name,
          goal,
          requirements,
          success_criteria,
        );

        if (!result.ok) {
          return mcpError(`Phase issue creation failed: ${result.error}`, 'Creation failed');
        }

        const responseData: Record<string, unknown> = {
          issue_number: result.data.number,
          issue_id: result.data.id,
        };

        // Auto-add to board and set status "To Do"
        const cwd = detectProjectRoot();
        if (cwd) {
          const mapping = loadMapping(cwd);
          if (mapping && mapping.project_number) {
            const addResult = await addItemToProject(mapping.project_number, result.data.number);
            if (addResult.ok) {
              responseData.item_id = addResult.data.itemId;
              responseData.project_number = mapping.project_number;

              const moveResult = await moveItemToStatus(
                mapping.project_number,
                addResult.data.itemId,
                'To Do',
              );
              if (!moveResult.ok) {
                responseData.board_warning = `Added to board but could not set status: ${moveResult.error}`;
              }
            } else {
              responseData.board_warning = `Issue created but could not add to board: ${addResult.error}`;
            }
          }
        }

        return mcpSuccess(
          responseData,
          `Created phase issue #${result.data.number}: [Phase ${phase_number}] ${phase_name}`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // -- mcp_create_task_issue ----------------------------------------------------

  server.tool(
    'mcp_create_task_issue',
    'Create a task sub-issue and link it to a parent phase issue.',
    {
      phase_number: z.string().describe('Phase number (e.g. "01")'),
      task_id: z.string().describe('Task ID within the phase'),
      title: z.string().describe('Task title'),
      body: z.string().describe('Task body (markdown)'),
      parent_issue_number: z.number().describe('Parent phase issue number'),
    },
    async ({ phase_number, task_id, title, body, parent_issue_number }) => {
      try {
        try {
          requireAuth();
        } catch (e) {
          if (e instanceof AuthError) {
            return mcpAuthError(e);
          }
          throw e;
        }

        const result = await createTaskSubIssue(
          phase_number,
          task_id,
          title,
          body,
          parent_issue_number,
        );

        if (!result.ok) {
          return mcpError(`Task issue creation failed: ${result.error}`, 'Creation failed');
        }

        const responseData: Record<string, unknown> = {
          issue_number: result.data.number,
          issue_id: result.data.id,
          parent_issue_number,
        };

        // Auto-update mapping cache
        const cwd = detectProjectRoot();
        if (cwd) {
          try {
            updateTaskMapping(cwd, phase_number, task_id, {
              number: result.data.number,
              id: result.data.id,
              node_id: '',
              item_id: '',
              status: 'To Do',
            });
          } catch (mappingErr) {
            responseData.mapping_warning = `Issue created but mapping update failed: ${(mappingErr as Error).message}`;
          }
        }

        return mcpSuccess(
          responseData,
          `Created task sub-issue #${result.data.number}: ${title}`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // -- mcp_post_plan_comment ----------------------------------------------------

  server.tool(
    'mcp_post_plan_comment',
    'Post a structured plan comment on a phase issue.',
    {
      phase_issue_number: z.number().describe('Phase issue number'),
      plan_number: z.string().describe('Plan number (e.g. "01")'),
      plan_content: z.string().describe('Plan content (markdown)'),
    },
    async ({ phase_issue_number, plan_number, plan_content }) => {
      try {
        try {
          requireAuth();
        } catch (e) {
          if (e instanceof AuthError) {
            return mcpAuthError(e);
          }
          throw e;
        }

        const result = await postPlanComment(
          phase_issue_number,
          plan_number,
          plan_content,
        );

        if (!result.ok) {
          return mcpError(`Plan comment failed: ${result.error}`, 'Comment failed');
        }

        return mcpSuccess(
          {
            phase_issue_number,
            plan_number,
            comment_id: result.data.commentId,
          },
          `Plan ${plan_number} comment posted on issue #${phase_issue_number}`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // -- mcp_close_issue ----------------------------------------------------------

  server.tool(
    'mcp_close_issue',
    'Close a GitHub issue as completed or not planned.',
    {
      issue_number: z.number().describe('GitHub issue number'),
      reason: z
        .string()
        .optional()
        .describe('Optional reason comment to post before closing'),
      state_reason: z
        .enum(['completed', 'not_planned'])
        .optional()
        .default('completed')
        .describe('Close reason: completed (default) or not_planned (rollback)'),
    },
    async ({ issue_number, reason, state_reason }) => {
      try {
        try {
          requireAuth();
        } catch (e) {
          if (e instanceof AuthError) {
            return mcpAuthError(e);
          }
          throw e;
        }

        const result = await closeIssue(issue_number, reason, state_reason);
        if (!result.ok) {
          return mcpError(`Close failed: ${result.error}`, 'Close failed');
        }

        return mcpSuccess(
          { issue_number, closed: true, state_reason },
          `Issue #${issue_number} closed (${state_reason})`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // -- mcp_reopen_issue ---------------------------------------------------------

  server.tool(
    'mcp_reopen_issue',
    'Reopen a closed GitHub issue.',
    {
      issue_number: z.number().describe('GitHub issue number'),
    },
    async ({ issue_number }) => {
      try {
        try {
          requireAuth();
        } catch (e) {
          if (e instanceof AuthError) {
            return mcpAuthError(e);
          }
          throw e;
        }

        const result = await reopenIssue(issue_number);
        if (!result.ok) {
          return mcpError(`Reopen failed: ${result.error}`, 'Reopen failed');
        }

        return mcpSuccess(
          { issue_number, reopened: true },
          `Issue #${issue_number} reopened`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // -- mcp_get_issue ------------------------------------------------------------

  server.tool(
    'mcp_get_issue',
    'Get details of a specific GitHub issue.',
    {
      issue_number: z.number().describe('GitHub issue number'),
    },
    async ({ issue_number }) => {
      try {
        try {
          requireAuth();
        } catch (e) {
          if (e instanceof AuthError) {
            return mcpAuthError(e);
          }
          throw e;
        }

        const result = await getPhaseIssue(issue_number);
        if (!result.ok) {
          return mcpError(`Fetch failed: ${result.error}`, 'Fetch failed');
        }

        const issue = result.data;

        return mcpSuccess(
          {
            number: issue.number,
            id: issue.id,
            title: issue.title,
            state: issue.state,
            body: issue.body,
            updated_at: issue.updated_at,
            labels: issue.labels,
            comments_url: issue.comments_url,
          },
          `Issue #${issue.number}: ${issue.title} (${issue.state})`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // -- mcp_list_sub_issues ------------------------------------------------------

  server.tool(
    'mcp_list_sub_issues',
    'List all sub-issues of a phase issue.',
    {
      phase_issue_number: z.number().describe('Phase issue number'),
    },
    async ({ phase_issue_number }) => {
      try {
        try {
          requireAuth();
        } catch (e) {
          if (e instanceof AuthError) {
            return mcpAuthError(e);
          }
          throw e;
        }

        const result = await listPhaseSubIssues(phase_issue_number);
        if (!result.ok) {
          return mcpError(`List failed: ${result.error}`, 'List failed');
        }

        return mcpSuccess(
          {
            phase_issue_number,
            sub_issues: result.data,
            count: result.data.length,
          },
          `Found ${result.data.length} sub-issues for issue #${phase_issue_number}`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // -- mcp_post_completion ------------------------------------------------------

  server.tool(
    'mcp_post_completion',
    'Post a structured completion comment on an issue with commit SHA and files changed.',
    {
      issue_number: z.number().describe('GitHub issue number'),
      commit_sha: z.string().describe('Commit SHA'),
      files_changed: z
        .array(z.string())
        .describe('List of files changed'),
    },
    async ({ issue_number, commit_sha, files_changed }) => {
      try {
        try {
          requireAuth();
        } catch (e) {
          if (e instanceof AuthError) {
            return mcpAuthError(e);
          }
          throw e;
        }

        const result = await postCompletionComment(issue_number, commit_sha, files_changed);
        if (!result.ok) {
          return mcpError(`Completion comment failed: ${result.error}`, 'Comment failed');
        }

        return mcpSuccess(
          {
            issue_number,
            commit_sha,
            comment_id: result.data.commentId,
          },
          `Completion comment posted on issue #${issue_number}`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // -- mcp_move_issue -----------------------------------------------------------

  server.tool(
    'mcp_move_issue',
    'Move a GitHub issue to a new status column on the project board (To Do, In Progress, In Review, Done).',
    {
      project_number: z.number().describe('Project number'),
      item_id: z.string().describe('Project item ID'),
      status: z
        .enum(['To Do', 'In Progress', 'In Review', 'Done'])
        .describe('Target status column'),
    },
    async ({ project_number, item_id, status }) => {
      try {
        try {
          requireAuth();
        } catch (e) {
          if (e instanceof AuthError) {
            return mcpAuthError(e);
          }
          throw e;
        }

        const result = await moveItemToStatus(
          project_number,
          item_id,
          status as IssueStatus,
        );

        if (!result.ok) {
          return mcpError(`Move failed: ${result.error}`, 'Move failed');
        }

        return mcpSuccess(
          { project_number, item_id, status, moved: true },
          `Item moved to "${status}"`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // -- mcp_post_comment ---------------------------------------------------------

  server.tool(
    'mcp_post_comment',
    'Post a comment on a GitHub issue.',
    {
      issue_number: z.number().describe('GitHub issue number'),
      body: z.string().describe('Comment body (markdown)'),
      type: z
        .enum(['research', 'context', 'summary', 'verification', 'uat', 'general'])
        .optional()
        .describe('Comment type for structured header'),
    },
    async ({ issue_number, body, type }) => {
      try {
        try {
          requireAuth();
        } catch (e) {
          if (e instanceof AuthError) {
            return mcpAuthError(e);
          }
          throw e;
        }

        // Prefix body with type marker if provided
        const commentBody = type
          ? `<!-- maxsim:type=${type} -->\n${body}`
          : body;

        const result = await postComment(issue_number, commentBody);
        if (!result.ok) {
          return mcpError(`Comment failed: ${result.error}`, 'Comment failed');
        }

        return mcpSuccess(
          {
            issue_number,
            comment_id: result.data.commentId,
            type: type ?? 'general',
          },
          `Comment posted on issue #${issue_number}`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // -- mcp_batch_create_tasks ---------------------------------------------------

  server.tool(
    'mcp_batch_create_tasks',
    'Create multiple task sub-issues for a phase with automatic rollback on failure.',
    {
      phase_number: z.string().describe('Phase number (e.g. "01")'),
      parent_issue_number: z.number().describe('Parent phase issue number'),
      tasks: z.array(z.object({
        task_id: z.string().describe('Task ID within the phase'),
        title: z.string().describe('Task title'),
        body: z.string().describe('Task body (markdown)'),
      })).describe('List of tasks to create'),
    },
    async ({ phase_number, parent_issue_number, tasks }) => {
      try {
        try {
          requireAuth();
        } catch (e) {
          if (e instanceof AuthError) {
            return mcpAuthError(e);
          }
          throw e;
        }

        const succeeded: Array<{ task_id: string; issue_number: number }> = [];
        const failed: Array<{ task_id: string; error: string }> = [];
        const created: Array<{ issueNumber: number; taskId: string }> = [];

        for (const task of tasks) {
          const result = await createTaskSubIssue(
            phase_number,
            task.task_id,
            task.title,
            task.body,
            parent_issue_number,
          );

          if (result.ok) {
            created.push({ issueNumber: result.data.number, taskId: task.task_id });
            succeeded.push({ task_id: task.task_id, issue_number: result.data.number });

            // Update mapping cache (best-effort)
            const cwd = detectProjectRoot();
            if (cwd) {
              try {
                updateTaskMapping(cwd, phase_number, task.task_id, {
                  number: result.data.number,
                  id: result.data.id,
                  node_id: '',
                  item_id: '',
                  status: 'To Do',
                });
              } catch {
                // Mapping update failure does not block batch
              }
            }
          } else {
            failed.push({ task_id: task.task_id, error: result.error });

            // Rollback: close all previously created issues with 'not_planned'
            const rolledBack: number[] = [];
            for (const c of [...created].reverse()) {
              const rollbackResult = await closeIssue(
                c.issueNumber,
                '[MAXSIM-ROLLBACK] Partial batch failure',
                'not_planned',
              );
              if (rollbackResult.ok) {
                rolledBack.push(c.issueNumber);
              }
            }

            return mcpSuccess(
              {
                succeeded,
                failed,
                rolled_back: rolledBack,
                partial: true,
              },
              `Batch failed at task "${task.task_id}". Rolled back ${rolledBack.length} issue(s).`,
            );
          }
        }

        return mcpSuccess(
          {
            succeeded,
            failed,
            rolled_back: [],
            partial: false,
          },
          `Batch created ${succeeded.length} task issue(s) for phase ${phase_number}`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // -- mcp_detect_external_edits ------------------------------------------------

  server.tool(
    'mcp_detect_external_edits',
    'Check if a phase issue body was modified outside MAXSIM.',
    {
      phase_number: z.string().describe('Phase number (e.g. "01")'),
    },
    async ({ phase_number }) => {
      try {
        try {
          requireAuth();
        } catch (e) {
          if (e instanceof AuthError) {
            return mcpAuthError(e);
          }
          throw e;
        }

        const cwd = detectProjectRoot();
        if (!cwd) {
          return mcpError('No .planning/ directory found', 'Project not detected');
        }

        const mapping = loadMapping(cwd);
        if (!mapping) {
          return mcpError('github-issues.json not found. Run project setup first.', 'Mapping missing');
        }

        const phaseMapping = mapping.phases[phase_number];
        if (!phaseMapping) {
          return mcpError(`Phase ${phase_number} not found in mapping`, 'Phase not found');
        }

        const storedHash = phaseMapping.body_hash;
        const issueNumber = phaseMapping.tracking_issue.number;

        // Fetch live issue body
        const issueResult = await getPhaseIssue(issueNumber);
        if (!issueResult.ok) {
          return mcpError(`Failed to fetch issue #${issueNumber}: ${issueResult.error}`, 'Fetch failed');
        }

        const liveHash = hashBody(issueResult.data.body);

        // If no stored hash, we can't compare — treat as unmodified
        if (!storedHash) {
          return mcpSuccess(
            {
              modified: false,
              phase_number,
              issue_number: issueNumber,
              note: 'No stored hash — baseline not yet established',
            },
            `Phase ${phase_number}: no baseline hash stored`,
          );
        }

        const modified = liveHash !== storedHash;

        return mcpSuccess(
          {
            modified,
            phase_number,
            issue_number: issueNumber,
          },
          modified
            ? `Phase ${phase_number} issue #${issueNumber} has been externally modified`
            : `Phase ${phase_number} issue #${issueNumber} matches stored hash`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );
}
