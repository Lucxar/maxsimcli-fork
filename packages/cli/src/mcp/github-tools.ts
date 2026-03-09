/**
 * GitHub Issue Lifecycle MCP Tools — GitHub operations exposed as MCP tools
 *
 * Provides MCP tools for issue CRUD, PR creation with auto-close linking (AC-08),
 * sync checking (AC-09), and issue import. Every tool checks detectGitHubMode()
 * and degrades gracefully to local-only behavior when GitHub is not configured.
 *
 * CRITICAL: Never import output() or error() from core — they call process.exit().
 * CRITICAL: Never write to stdout — it is reserved for MCP JSON-RPC protocol.
 * CRITICAL: Never call process.exit() — the server must stay alive after every tool call.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { detectGitHubMode, ghExec } from '../github/gh.js';
import {
  createAllPlanIssues,
  createTodoIssue,
  closeIssue,
  postComment,
  importExternalIssue,
  supersedePlanIssues,
  buildPrBody,
} from '../github/issues.js';
import {
  ensureProjectBoard,
  addItemToProject,
  moveItemToStatus,
  setEstimate,
} from '../github/projects.js';
import { ensureLabels } from '../github/labels.js';
import { ensureMilestone } from '../github/milestones.js';
import { installIssueTemplates } from '../github/templates.js';
import { loadMapping, saveMapping, updateTaskMapping } from '../github/mapping.js';
import { syncCheck } from '../github/sync.js';

import { detectProjectRoot, mcpSuccess, mcpError } from './utils.js';

/**
 * Register all GitHub issue lifecycle tools on the MCP server.
 */
export function registerGitHubTools(server: McpServer): void {
  // ── mcp_github_setup ─────────────────────────────────────────────────────────

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
        const cwd = detectProjectRoot();
        if (!cwd) {
          return mcpError('No .planning/ directory found', 'Project not detected');
        }

        const mode = await detectGitHubMode();

        // In local-only mode, only install issue templates (local files)
        if (mode === 'local-only') {
          installIssueTemplates(cwd);
          return mcpSuccess(
            {
              mode: 'local-only',
              templates_installed: true,
              board_created: false,
              labels_created: false,
              milestone_created: false,
            },
            'Local-only mode: installed issue templates only. Run `gh auth login` with project scope for full GitHub integration.',
          );
        }

        // Full mode: create board, labels, milestone, templates
        const boardTitle = 'MAXSIM Task Board';
        const boardResult = await ensureProjectBoard(boardTitle, cwd);
        if (!boardResult.ok) {
          return mcpError(`Board setup failed: ${boardResult.error}`, 'Setup failed');
        }

        const labelsResult = await ensureLabels();
        if (!labelsResult.ok) {
          return mcpError(`Label setup failed: ${labelsResult.error}`, 'Setup failed');
        }

        let milestoneData: { number: number; id: number; created: boolean } | null = null;
        if (milestone_title) {
          const msResult = await ensureMilestone(milestone_title);
          if (msResult.ok) {
            milestoneData = msResult.data;

            // Update mapping with milestone info
            const mapping = loadMapping(cwd);
            if (mapping) {
              mapping.milestone_id = msResult.data.number;
              mapping.milestone_title = milestone_title;
              saveMapping(cwd, mapping);
            }
          }
        }

        installIssueTemplates(cwd);

        return mcpSuccess(
          {
            mode: 'full',
            board: {
              number: boardResult.data.number,
              created: boardResult.data.created,
            },
            labels_created: true,
            milestone: milestoneData
              ? {
                  number: milestoneData.number,
                  title: milestone_title,
                  created: milestoneData.created,
                }
              : null,
            templates_installed: true,
          },
          `GitHub integration set up: board #${boardResult.data.number}, labels, ${milestoneData ? `milestone "${milestone_title}"` : 'no milestone'}, templates`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // ── mcp_create_plan_issues ───────────────────────────────────────────────────

  server.tool(
    'mcp_create_plan_issues',
    'Create GitHub issues for all tasks in a finalized plan. Creates task issues and parent tracking issue.',
    {
      phase: z.string().describe('Phase number (e.g. "01")'),
      plan: z.string().describe('Plan number (e.g. "01")'),
      phase_name: z.string().describe('Phase description for the tracking issue title'),
      tasks: z
        .array(
          z.object({
            taskId: z.string(),
            title: z.string(),
            summary: z.string(),
            actions: z.array(z.string()),
            acceptanceCriteria: z.array(z.string()),
            dependencies: z.array(z.string()).optional(),
            estimate: z.number().optional(),
          }),
        )
        .describe('Array of task objects to create issues for'),
      milestone: z.string().optional().describe('Milestone title to assign'),
    },
    async ({ phase, plan, phase_name, tasks, milestone }) => {
      try {
        const cwd = detectProjectRoot();
        if (!cwd) {
          return mcpError('No .planning/ directory found', 'Project not detected');
        }

        const mode = await detectGitHubMode();

        if (mode === 'local-only') {
          return mcpSuccess(
            {
              mode: 'local-only',
              warning: 'GitHub not configured, issues not created',
              tasks_count: tasks.length,
            },
            'Local-only mode: GitHub issues not created. Run `gh auth login` for full integration.',
          );
        }

        // Get project title for auto-adding to board
        const mapping = loadMapping(cwd);
        const projectTitle = mapping?.project_number
          ? undefined // Will be added separately via addItemToProject
          : undefined;

        const result = await createAllPlanIssues({
          phaseNum: phase,
          planNum: plan,
          phaseName: phase_name,
          tasks,
          milestone,
          projectTitle,
          cwd,
        });

        if (!result.ok) {
          return mcpError(`Issue creation failed: ${result.error}`, 'Creation failed');
        }

        // Add all issues to project board and set estimates
        if (mapping && mapping.project_number > 0) {
          const repo = mapping.repo;
          const allIssueNumbers = [
            result.data.parentIssue,
            ...result.data.taskIssues.map(t => t.issueNumber),
          ];

          for (const issueNum of allIssueNumbers) {
            const issueUrl = `https://github.com/${repo}/issues/${issueNum}`;
            const addResult = await addItemToProject(mapping.project_number, issueUrl);
            if (addResult.ok) {
              // Store item_id in mapping for board operations
              const taskEntry = result.data.taskIssues.find(t => t.issueNumber === issueNum);
              if (taskEntry) {
                updateTaskMapping(cwd, phase, taskEntry.taskId, {
                  item_id: addResult.data.item_id,
                });
              }

              // Move to "To Do" status
              if (mapping.status_options['To Do'] && mapping.status_field_id) {
                await moveItemToStatus(
                  mapping.project_id,
                  addResult.data.item_id,
                  mapping.status_field_id,
                  mapping.status_options['To Do'],
                );
              }

              // Set estimate if task has one
              if (taskEntry && mapping.estimate_field_id) {
                const taskDef = tasks.find(t => t.taskId === taskEntry.taskId);
                if (taskDef?.estimate) {
                  await setEstimate(
                    mapping.project_id,
                    addResult.data.item_id,
                    mapping.estimate_field_id,
                    taskDef.estimate,
                  );
                }
              }
            }
          }
        }

        return mcpSuccess(
          {
            mode: 'full',
            parent_issue: result.data.parentIssue,
            task_issues: result.data.taskIssues,
            total_created: result.data.taskIssues.length + 1,
          },
          `Created ${result.data.taskIssues.length} task issues + parent tracking issue #${result.data.parentIssue}`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // ── mcp_create_todo_issue ────────────────────────────────────────────────────

  server.tool(
    'mcp_create_todo_issue',
    'Create a GitHub issue for a todo item.',
    {
      title: z.string().describe('Todo title'),
      description: z.string().optional().describe('Todo description'),
      acceptance_criteria: z
        .array(z.string())
        .optional()
        .describe('Acceptance criteria list'),
    },
    async ({ title, description, acceptance_criteria }) => {
      try {
        const cwd = detectProjectRoot();
        if (!cwd) {
          return mcpError('No .planning/ directory found', 'Project not detected');
        }

        const mode = await detectGitHubMode();

        if (mode === 'local-only') {
          return mcpSuccess(
            {
              mode: 'local-only',
              warning: 'GitHub not configured. Use mcp_add_todo for local todo tracking.',
              title,
            },
            'Local-only mode: GitHub todo issue not created.',
          );
        }

        const mapping = loadMapping(cwd);
        const result = await createTodoIssue({
          title,
          description,
          acceptanceCriteria: acceptance_criteria,
          milestone: mapping?.milestone_title || undefined,
        });

        if (!result.ok) {
          return mcpError(`Todo issue creation failed: ${result.error}`, 'Creation failed');
        }

        // Add to project board
        if (mapping && mapping.project_number > 0) {
          const issueUrl = `https://github.com/${mapping.repo}/issues/${result.data.number}`;
          const addResult = await addItemToProject(mapping.project_number, issueUrl);
          if (addResult.ok && mapping) {
            // Update mapping
            if (!mapping.todos) {
              mapping.todos = {};
            }
            mapping.todos[`todo-${result.data.number}`] = {
              number: result.data.number,
              node_id: result.data.node_id,
              item_id: addResult.data.item_id,
              status: 'To Do',
            };
            saveMapping(cwd, mapping);
          }
        }

        return mcpSuccess(
          {
            mode: 'full',
            issue_number: result.data.number,
            url: result.data.url,
          },
          `Created todo issue #${result.data.number}: ${title}`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // ── mcp_move_issue ───────────────────────────────────────────────────────────

  server.tool(
    'mcp_move_issue',
    'Move a GitHub issue to a new status column (To Do, In Progress, In Review, Done).',
    {
      issue_number: z.number().describe('GitHub issue number'),
      status: z
        .enum(['To Do', 'In Progress', 'In Review', 'Done'])
        .describe('Target status column'),
    },
    async ({ issue_number, status }) => {
      try {
        const cwd = detectProjectRoot();
        if (!cwd) {
          return mcpError('No .planning/ directory found', 'Project not detected');
        }

        const mode = await detectGitHubMode();
        const mapping = loadMapping(cwd);

        if (mode === 'local-only') {
          // In local-only mode, just update local mapping status
          if (mapping) {
            const updated = updateLocalMappingStatus(mapping, issue_number, status);
            if (updated) {
              saveMapping(cwd, mapping);
              return mcpSuccess(
                { mode: 'local-only', issue_number, status, local_updated: true },
                `Local mapping updated: issue #${issue_number} -> ${status}`,
              );
            }
          }
          return mcpError(
            `Issue #${issue_number} not found in local mapping`,
            'Issue not tracked',
          );
        }

        if (!mapping) {
          return mcpError(
            'github-issues.json not found. Run mcp_github_setup first.',
            'Setup required',
          );
        }

        // Find the item_id for this issue in the mapping
        const issueEntry = findIssueInMapping(mapping, issue_number);
        if (!issueEntry) {
          return mcpError(
            `Issue #${issue_number} not found in local mapping`,
            'Issue not tracked',
          );
        }

        if (!issueEntry.item_id) {
          return mcpError(
            `Issue #${issue_number} has no project item_id. It may not have been added to the board.`,
            'Not on board',
          );
        }

        const statusOptionId = mapping.status_options[status];
        if (!statusOptionId) {
          return mcpError(
            `Status "${status}" not found in project board options`,
            'Invalid status',
          );
        }

        const moveResult = await moveItemToStatus(
          mapping.project_id,
          issueEntry.item_id,
          mapping.status_field_id,
          statusOptionId,
        );

        if (!moveResult.ok) {
          return mcpError(`Move failed: ${moveResult.error}`, 'Move failed');
        }

        // Update local mapping
        updateLocalMappingStatus(mapping, issue_number, status);
        saveMapping(cwd, mapping);

        return mcpSuccess(
          { mode: 'full', issue_number, status, moved: true },
          `Issue #${issue_number} moved to "${status}"`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // ── mcp_close_issue ──────────────────────────────────────────────────────────

  server.tool(
    'mcp_close_issue',
    'Close a GitHub issue as completed or not planned.',
    {
      issue_number: z.number().describe('GitHub issue number'),
      reason: z
        .enum(['completed', 'not_planned'])
        .optional()
        .default('completed')
        .describe('Close reason'),
    },
    async ({ issue_number, reason }) => {
      try {
        const cwd = detectProjectRoot();
        if (!cwd) {
          return mcpError('No .planning/ directory found', 'Project not detected');
        }

        const mode = await detectGitHubMode();

        if (mode === 'local-only') {
          return mcpSuccess(
            {
              mode: 'local-only',
              warning: 'GitHub not configured. Cannot close remote issue.',
              issue_number,
            },
            'Local-only mode: cannot close GitHub issue.',
          );
        }

        const result = await closeIssue(issue_number, reason);
        if (!result.ok) {
          return mcpError(`Close failed: ${result.error}`, 'Close failed');
        }

        // Move to Done on board and update local mapping
        const mapping = loadMapping(cwd);
        if (mapping) {
          const issueEntry = findIssueInMapping(mapping, issue_number);
          if (issueEntry?.item_id && mapping.status_options['Done'] && mapping.status_field_id) {
            await moveItemToStatus(
              mapping.project_id,
              issueEntry.item_id,
              mapping.status_field_id,
              mapping.status_options['Done'],
            );
          }
          updateLocalMappingStatus(mapping, issue_number, 'Done');
          saveMapping(cwd, mapping);
        }

        return mcpSuccess(
          { mode: 'full', issue_number, reason, closed: true },
          `Issue #${issue_number} closed (${reason})`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // ── mcp_post_comment ─────────────────────────────────────────────────────────

  server.tool(
    'mcp_post_comment',
    'Post a progress comment on a GitHub issue.',
    {
      issue_number: z.number().describe('GitHub issue number'),
      body: z.string().describe('Comment body (markdown supported)'),
    },
    async ({ issue_number, body }) => {
      try {
        const mode = await detectGitHubMode();

        if (mode === 'local-only') {
          return mcpSuccess(
            {
              mode: 'local-only',
              warning: 'GitHub not configured. Cannot post comment.',
              issue_number,
            },
            'Local-only mode: cannot post comment on GitHub issue.',
          );
        }

        const result = await postComment(issue_number, body);
        if (!result.ok) {
          return mcpError(`Comment failed: ${result.error}`, 'Comment failed');
        }

        return mcpSuccess(
          { mode: 'full', issue_number, commented: true },
          `Comment posted on issue #${issue_number}`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // ── mcp_import_issue ─────────────────────────────────────────────────────────

  server.tool(
    'mcp_import_issue',
    'Import an external GitHub issue into MAXSIM tracking.',
    {
      issue_number: z.number().describe('GitHub issue number to import'),
    },
    async ({ issue_number }) => {
      try {
        const mode = await detectGitHubMode();

        if (mode === 'local-only') {
          return mcpSuccess(
            {
              mode: 'local-only',
              warning: 'GitHub not configured. Cannot import issue.',
              issue_number,
            },
            'Local-only mode: cannot import GitHub issue.',
          );
        }

        const result = await importExternalIssue(issue_number);
        if (!result.ok) {
          return mcpError(`Import failed: ${result.error}`, 'Import failed');
        }

        return mcpSuccess(
          {
            mode: 'full',
            issue_number: result.data.number,
            title: result.data.title,
            labels: result.data.labels,
            imported: true,
          },
          `Imported issue #${result.data.number}: "${result.data.title}". Assign to a phase or todo for tracking.`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // ── mcp_sync_check ───────────────────────────────────────────────────────────

  server.tool(
    'mcp_sync_check',
    'Check for external changes to tracked GitHub issues.',
    {},
    async () => {
      try {
        const cwd = detectProjectRoot();
        if (!cwd) {
          return mcpError('No .planning/ directory found', 'Project not detected');
        }

        const mode = await detectGitHubMode();

        if (mode === 'local-only') {
          return mcpSuccess(
            {
              mode: 'local-only',
              warning: 'GitHub not configured. Sync check not available.',
              in_sync: true,
              changes: [],
            },
            'Local-only mode: sync check skipped.',
          );
        }

        const result = await syncCheck(cwd);
        if (!result.ok) {
          return mcpError(`Sync check failed: ${result.error}`, 'Sync failed');
        }

        return mcpSuccess(
          {
            mode: 'full',
            in_sync: result.data.inSync,
            changes: result.data.changes,
            change_count: result.data.changes.length,
          },
          result.data.inSync
            ? 'All tracked issues are in sync with GitHub.'
            : `${result.data.changes.length} discrepancies found between local mapping and GitHub.`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // ── mcp_supersede_plan ───────────────────────────────────────────────────────

  server.tool(
    'mcp_supersede_plan',
    'Close old plan issues and link to new plan issues.',
    {
      phase: z.string().describe('Phase number'),
      old_plan: z.string().describe('Old plan number to supersede'),
      new_plan: z.string().describe('New plan number that replaces it'),
    },
    async ({ phase, old_plan, new_plan }) => {
      try {
        const cwd = detectProjectRoot();
        if (!cwd) {
          return mcpError('No .planning/ directory found', 'Project not detected');
        }

        const mode = await detectGitHubMode();

        if (mode === 'local-only') {
          return mcpSuccess(
            {
              mode: 'local-only',
              warning: 'GitHub not configured. Cannot supersede plan issues.',
              phase,
              old_plan,
              new_plan,
            },
            'Local-only mode: plan supersession skipped.',
          );
        }

        const mapping = loadMapping(cwd);
        if (!mapping) {
          return mcpError(
            'github-issues.json not found. Run mcp_github_setup first.',
            'Setup required',
          );
        }

        // Get new plan's issue numbers from the mapping (they should exist from mcp_create_plan_issues)
        const newPhaseMapping = mapping.phases[phase];
        if (!newPhaseMapping) {
          return mcpError(
            `Phase ${phase} not found in mapping. Create new plan issues first.`,
            'Phase not found',
          );
        }

        const newIssueNumbers = Object.entries(newPhaseMapping.tasks).map(
          ([taskId, task]) => ({ taskId, issueNumber: task.number }),
        );

        const result = await supersedePlanIssues({
          phaseNum: phase,
          oldPlanNum: old_plan,
          newPlanNum: new_plan,
          newIssueNumbers,
          cwd,
        });

        if (!result.ok) {
          return mcpError(`Supersession failed: ${result.error}`, 'Supersession failed');
        }

        return mcpSuccess(
          {
            mode: 'full',
            phase,
            old_plan,
            new_plan,
            superseded: true,
          },
          `Plan ${phase}-${old_plan} superseded by ${phase}-${new_plan}`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // ── mcp_create_pr ────────────────────────────────────────────────────────────

  server.tool(
    'mcp_create_pr',
    'Create a pull request with auto-close linking for tracked GitHub issues. Generates PR description with Closes #N lines (AC-08).',
    {
      issue_numbers: z
        .array(z.number())
        .describe('Issue numbers to auto-close when PR merges'),
      branch: z.string().describe('Source branch name for the PR'),
      title: z.string().describe('PR title'),
      base: z.string().optional().default('main').describe('Base branch (default: main)'),
      additional_context: z
        .string()
        .optional()
        .describe('Additional context to include in PR body'),
      draft: z.boolean().optional().default(false).describe('Create as draft PR'),
    },
    async ({ issue_numbers, branch, title, base, additional_context, draft }) => {
      try {
        const mode = await detectGitHubMode();

        // Build PR body with Closes #N lines (AC-08)
        const prBody = buildPrBody(issue_numbers, additional_context);

        if (mode === 'local-only') {
          // Return the generated body so user can create PR manually
          return mcpSuccess(
            {
              mode: 'local-only',
              warning: 'GitHub not configured. PR not created. Use the body below to create manually.',
              pr_body: prBody,
              issues_linked: issue_numbers,
            },
            'Local-only mode: PR body generated but PR not created.',
          );
        }

        // Create the PR via gh CLI
        const args: string[] = [
          'pr',
          'create',
          '--title',
          title,
          '--body',
          prBody,
          '--head',
          branch,
        ];

        if (base) {
          args.push('--base', base);
        }

        if (draft) {
          args.push('--draft');
        }

        const createResult = await ghExec<string>(args);
        if (!createResult.ok) {
          return mcpError(`PR creation failed: ${createResult.error}`, 'PR creation failed');
        }

        // Parse PR URL and number from stdout
        const prUrl = createResult.data.trim();
        const prNumberMatch = prUrl.match(/\/pull\/(\d+)/);
        const prNumber = prNumberMatch ? parseInt(prNumberMatch[1], 10) : null;

        return mcpSuccess(
          {
            mode: 'full',
            pr_number: prNumber,
            pr_url: prUrl,
            issues_linked: issue_numbers,
            draft,
          },
          `PR${draft ? ' (draft)' : ''} created: ${prUrl} — auto-closes ${issue_numbers.map(n => `#${n}`).join(', ')}`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );
}

// ---- Internal Helpers ──────────────────────────────────────────────────────

import type { IssueMappingFile, IssueStatus, TaskIssueMapping } from '../github/types.js';

/**
 * Find an issue entry in the mapping file (searches phases and todos).
 */
function findIssueInMapping(
  mapping: IssueMappingFile,
  issueNumber: number,
): TaskIssueMapping | null {
  // Search phases
  for (const phase of Object.values(mapping.phases)) {
    if (phase.tracking_issue.number === issueNumber) {
      return phase.tracking_issue;
    }
    for (const task of Object.values(phase.tasks)) {
      if (task.number === issueNumber) {
        return task;
      }
    }
  }

  // Search todos
  if (mapping.todos) {
    for (const todo of Object.values(mapping.todos)) {
      if (todo.number === issueNumber) {
        return todo;
      }
    }
  }

  return null;
}

/**
 * Update local mapping status for an issue (mutates mapping in-place).
 * Returns true if the issue was found and updated.
 */
function updateLocalMappingStatus(
  mapping: IssueMappingFile,
  issueNumber: number,
  status: IssueStatus,
): boolean {
  // Search phases
  for (const phase of Object.values(mapping.phases)) {
    if (phase.tracking_issue.number === issueNumber) {
      phase.tracking_issue.status = status;
      return true;
    }
    for (const task of Object.values(phase.tasks)) {
      if (task.number === issueNumber) {
        task.status = status;
        return true;
      }
    }
  }

  // Search todos
  if (mapping.todos) {
    for (const todo of Object.values(mapping.todos)) {
      if (todo.number === issueNumber) {
        todo.status = status;
        return true;
      }
    }
  }

  return false;
}
