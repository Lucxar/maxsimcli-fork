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

        return mcpSuccess(
          {
            issue_number: result.data.number,
            issue_id: result.data.id,
          },
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

        return mcpSuccess(
          {
            issue_number: result.data.number,
            issue_id: result.data.id,
            parent_issue_number,
          },
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
    'Close a GitHub issue as completed.',
    {
      issue_number: z.number().describe('GitHub issue number'),
      reason: z
        .string()
        .optional()
        .describe('Optional reason comment to post before closing'),
    },
    async ({ issue_number, reason }) => {
      try {
        try {
          requireAuth();
        } catch (e) {
          if (e instanceof AuthError) {
            return mcpAuthError(e);
          }
          throw e;
        }

        const result = await closeIssue(issue_number, reason);
        if (!result.ok) {
          return mcpError(`Close failed: ${result.error}`, 'Close failed');
        }

        return mcpSuccess(
          { issue_number, closed: true },
          `Issue #${issue_number} closed`,
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
}
