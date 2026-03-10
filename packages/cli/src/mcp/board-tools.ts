/**
 * Board Query MCP Tools — Project board operations exposed as MCP tools
 *
 * Provides MCP tools for querying the GitHub project board, searching issues,
 * getting issue details, and setting estimates. Every tool checks detectGitHubMode()
 * and degrades gracefully to local-only behavior when GitHub is not configured.
 *
 * CRITICAL: Never import output() or error() from core — they call process.exit().
 * CRITICAL: Never write to stdout — it is reserved for MCP JSON-RPC protocol.
 * CRITICAL: Never call process.exit() — the server must stay alive after every tool call.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { detectGitHubMode, ghExec } from '../github/gh-legacy.js';
import { setEstimate } from '../github/projects.js';
import { loadMapping } from '../github/mapping.js';
import { FIBONACCI_POINTS } from '../github/types.js';
import type { IssueMappingFile, TaskIssueMapping } from '../github/types.js';

import { detectProjectRoot, mcpSuccess, mcpError } from './utils.js';

/**
 * Register all board query tools on the MCP server.
 */
export function registerBoardTools(server: McpServer): void {
  // ── mcp_query_board ──────────────────────────────────────────────────────────

  server.tool(
    'mcp_query_board',
    'Query the GitHub project board. Returns all items with their status, estimates, and issue details.',
    {
      status: z
        .enum(['To Do', 'In Progress', 'In Review', 'Done'])
        .optional()
        .describe('Filter by status column'),
      phase: z
        .string()
        .optional()
        .describe('Filter by phase number (matches issue title prefix)'),
    },
    async ({ status, phase }) => {
      try {
        const cwd = detectProjectRoot();
        if (!cwd) {
          return mcpError('No .planning/ directory found', 'Project not detected');
        }

        const mode = await detectGitHubMode();
        const mapping = loadMapping(cwd);

        if (mode === 'local-only') {
          // Return local mapping data as fallback
          if (!mapping) {
            return mcpSuccess(
              { mode: 'local-only', items: [], count: 0 },
              'Local-only mode: no mapping file found.',
            );
          }

          const items = buildLocalBoardItems(mapping, status, phase);
          return mcpSuccess(
            { mode: 'local-only', items, count: items.length },
            `Local-only mode: ${items.length} items from local mapping.`,
          );
        }

        if (!mapping || !mapping.project_number) {
          return mcpError(
            'No project board configured. Run mcp_github_setup first.',
            'Setup required',
          );
        }

        // Query the project board via gh CLI
        const result = await ghExec<{
          items: Array<{
            id: string;
            title: string;
            status: string | null;
            content: { number: number; type: string; title: string; url: string } | null;
          }>;
        }>(
          [
            'project',
            'item-list',
            String(mapping.project_number),
            '--owner',
            '@me',
            '--format',
            'json',
          ],
          { parseJson: true },
        );

        if (!result.ok) {
          return mcpError(`Board query failed: ${result.error}`, 'Query failed');
        }

        let items = result.data.items || [];

        // Filter by status
        if (status) {
          items = items.filter(item => item.status === status);
        }

        // Filter by phase (match title prefix like "[P01]" or "[Phase 01]")
        if (phase) {
          const phasePrefix = `[P${phase}]`;
          const phasePrefixAlt = `[Phase ${phase}]`;
          items = items.filter(
            item =>
              item.title?.includes(phasePrefix) ||
              item.title?.includes(phasePrefixAlt) ||
              item.content?.title?.includes(phasePrefix) ||
              item.content?.title?.includes(phasePrefixAlt),
          );
        }

        const formatted = items.map(item => ({
          item_id: item.id,
          title: item.content?.title ?? item.title,
          issue_number: item.content?.number ?? null,
          status: item.status ?? 'No Status',
          url: item.content?.url ?? null,
        }));

        return mcpSuccess(
          { mode: 'full', items: formatted, count: formatted.length },
          `Board query: ${formatted.length} items${status ? ` in "${status}"` : ''}${phase ? ` for phase ${phase}` : ''}`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // ── mcp_search_issues ────────────────────────────────────────────────────────

  server.tool(
    'mcp_search_issues',
    'Search GitHub issues by label, milestone, state, or text query.',
    {
      labels: z
        .array(z.string())
        .optional()
        .describe('Filter by label names'),
      milestone: z
        .string()
        .optional()
        .describe('Filter by milestone title'),
      state: z
        .enum(['open', 'closed', 'all'])
        .optional()
        .default('open')
        .describe('Filter by issue state'),
      query: z
        .string()
        .optional()
        .describe('Text search query'),
    },
    async ({ labels, milestone, state, query }) => {
      try {
        const cwd = detectProjectRoot();
        if (!cwd) {
          return mcpError('No .planning/ directory found', 'Project not detected');
        }

        const mode = await detectGitHubMode();

        if (mode === 'local-only') {
          // Return local mapping data as fallback
          const mapping = loadMapping(cwd);
          if (!mapping) {
            return mcpSuccess(
              { mode: 'local-only', issues: [], count: 0 },
              'Local-only mode: no mapping file found.',
            );
          }

          const items = buildLocalSearchResults(mapping, state);
          return mcpSuccess(
            { mode: 'local-only', issues: items, count: items.length },
            `Local-only mode: ${items.length} items from local mapping.`,
          );
        }

        // Build gh issue list args
        const args: string[] = [
          'issue',
          'list',
          '--json',
          'number,title,state,labels,milestone',
          '--limit',
          '100',
        ];

        if (state && state !== 'all') {
          args.push('--state', state);
        } else if (state === 'all') {
          args.push('--state', 'all');
        }

        if (labels && labels.length > 0) {
          for (const label of labels) {
            args.push('--label', label);
          }
        }

        if (milestone) {
          args.push('--milestone', milestone);
        }

        if (query) {
          args.push('--search', query);
        }

        const result = await ghExec<
          Array<{
            number: number;
            title: string;
            state: string;
            labels: Array<{ name: string }>;
            milestone: { title: string } | null;
          }>
        >(args, { parseJson: true });

        if (!result.ok) {
          return mcpError(`Search failed: ${result.error}`, 'Search failed');
        }

        const issues = result.data.map(issue => ({
          number: issue.number,
          title: issue.title,
          state: issue.state,
          labels: issue.labels.map(l => l.name),
          milestone: issue.milestone?.title ?? null,
        }));

        return mcpSuccess(
          { mode: 'full', issues, count: issues.length },
          `Found ${issues.length} issues`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // ── mcp_get_issue_detail ─────────────────────────────────────────────────────

  server.tool(
    'mcp_get_issue_detail',
    'Get full details of a specific GitHub issue including comments.',
    {
      issue_number: z.number().describe('GitHub issue number'),
    },
    async ({ issue_number }) => {
      try {
        const mode = await detectGitHubMode();

        if (mode === 'local-only') {
          return mcpSuccess(
            {
              mode: 'local-only',
              warning: 'GitHub not configured. Cannot fetch issue details.',
              issue_number,
            },
            'Local-only mode: cannot fetch issue details.',
          );
        }

        const result = await ghExec<{
          number: number;
          title: string;
          body: string;
          state: string;
          labels: Array<{ name: string }>;
          comments: Array<{ author: { login: string }; body: string; createdAt: string }>;
          assignees: Array<{ login: string }>;
        }>(
          [
            'issue',
            'view',
            String(issue_number),
            '--json',
            'number,title,body,state,labels,comments,assignees',
          ],
          { parseJson: true },
        );

        if (!result.ok) {
          return mcpError(`Fetch failed: ${result.error}`, 'Fetch failed');
        }

        const issue = result.data;

        return mcpSuccess(
          {
            mode: 'full',
            number: issue.number,
            title: issue.title,
            body: issue.body,
            state: issue.state,
            labels: issue.labels.map(l => l.name),
            assignees: issue.assignees.map(a => a.login),
            comments: issue.comments.map(c => ({
              author: c.author.login,
              body: c.body,
              created_at: c.createdAt,
            })),
            comment_count: issue.comments.length,
          },
          `Issue #${issue.number}: ${issue.title} (${issue.state})`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // ── mcp_set_estimate ─────────────────────────────────────────────────────────

  server.tool(
    'mcp_set_estimate',
    'Set Fibonacci story points on a GitHub issue.',
    {
      issue_number: z.number().describe('GitHub issue number'),
      points: z.number().describe('Fibonacci story points (1, 2, 3, 5, 8, 13, 21, 34)'),
    },
    async ({ issue_number, points }) => {
      try {
        const cwd = detectProjectRoot();
        if (!cwd) {
          return mcpError('No .planning/ directory found', 'Project not detected');
        }

        // Validate Fibonacci points
        if (!(FIBONACCI_POINTS as readonly number[]).includes(points)) {
          return mcpError(
            `Invalid points: ${points}. Must be one of: ${FIBONACCI_POINTS.join(', ')}`,
            'Validation failed',
          );
        }

        const mode = await detectGitHubMode();

        if (mode === 'local-only') {
          return mcpSuccess(
            {
              mode: 'local-only',
              warning: 'GitHub not configured. Cannot set estimate.',
              issue_number,
              points,
            },
            'Local-only mode: cannot set estimate on GitHub project.',
          );
        }

        const mapping = loadMapping(cwd);
        if (!mapping) {
          return mcpError(
            'github-issues.json not found. Run mcp_github_setup first.',
            'Setup required',
          );
        }

        if (!mapping.estimate_field_id) {
          return mcpError(
            'Estimate field not configured. Re-run mcp_github_setup.',
            'Setup required',
          );
        }

        // Find item_id for this issue
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

        const result = await setEstimate(
          mapping.project_id,
          issueEntry.item_id,
          mapping.estimate_field_id,
          points,
        );

        if (!result.ok) {
          return mcpError(`Set estimate failed: ${result.error}`, 'Estimate failed');
        }

        return mcpSuccess(
          { mode: 'full', issue_number, points, set: true },
          `Estimate set: issue #${issue_number} = ${points} points`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );
}

// ---- Internal Helpers ──────────────────────────────────────────────────────

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
 * Build local board items from the mapping file (for local-only mode).
 */
function buildLocalBoardItems(
  mapping: IssueMappingFile,
  statusFilter?: string,
  phaseFilter?: string,
): Array<{
  issue_number: number;
  title: string;
  status: string;
  source: string;
}> {
  const items: Array<{
    issue_number: number;
    title: string;
    status: string;
    source: string;
  }> = [];

  for (const [phaseNum, phase] of Object.entries(mapping.phases)) {
    if (phaseFilter && phaseNum !== phaseFilter) continue;

    if (phase.tracking_issue.number > 0) {
      const entry = {
        issue_number: phase.tracking_issue.number,
        title: `[Phase ${phaseNum}] Tracking`,
        status: phase.tracking_issue.status,
        source: `phase ${phaseNum}`,
      };
      if (!statusFilter || entry.status === statusFilter) {
        items.push(entry);
      }
    }

    for (const [taskId, task] of Object.entries(phase.tasks)) {
      if (task.number > 0) {
        const entry = {
          issue_number: task.number,
          title: `[P${phaseNum}] Task ${taskId}`,
          status: task.status,
          source: `phase ${phaseNum}, task ${taskId}`,
        };
        if (!statusFilter || entry.status === statusFilter) {
          items.push(entry);
        }
      }
    }
  }

  // Todos (no phase filter for todos)
  if (!phaseFilter && mapping.todos) {
    for (const [todoId, todo] of Object.entries(mapping.todos)) {
      if (todo.number > 0) {
        const entry = {
          issue_number: todo.number,
          title: `Todo: ${todoId}`,
          status: todo.status,
          source: `todo ${todoId}`,
        };
        if (!statusFilter || entry.status === statusFilter) {
          items.push(entry);
        }
      }
    }
  }

  return items;
}

/**
 * Build local search results from the mapping file (for local-only mode).
 */
function buildLocalSearchResults(
  mapping: IssueMappingFile,
  stateFilter?: string,
): Array<{
  issue_number: number;
  title: string;
  state: string;
  source: string;
}> {
  const items: Array<{
    issue_number: number;
    title: string;
    state: string;
    source: string;
  }> = [];

  for (const [phaseNum, phase] of Object.entries(mapping.phases)) {
    for (const [taskId, task] of Object.entries(phase.tasks)) {
      if (task.number > 0) {
        const state = task.status === 'Done' ? 'closed' : 'open';
        if (stateFilter && stateFilter !== 'all' && state !== stateFilter) continue;
        items.push({
          issue_number: task.number,
          title: `[P${phaseNum}] Task ${taskId}`,
          state,
          source: `phase ${phaseNum}`,
        });
      }
    }
  }

  if (mapping.todos) {
    for (const [todoId, todo] of Object.entries(mapping.todos)) {
      if (todo.number > 0) {
        const state = todo.status === 'Done' ? 'closed' : 'open';
        if (stateFilter && stateFilter !== 'all' && state !== stateFilter) continue;
        items.push({
          issue_number: todo.number,
          title: `Todo: ${todoId}`,
          state,
          source: 'todo',
        });
      }
    }
  }

  return items;
}
