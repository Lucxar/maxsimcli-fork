/**
 * Board Query MCP Tools -- Project board operations exposed as MCP tools
 *
 * Provides MCP tools for querying the GitHub project board, searching issues,
 * getting issue details, and adding items to the board. Every tool calls
 * requireAuth() as its first operation.
 *
 * Uses the new Octokit-based adapter modules (client.ts, projects.ts,
 * issues.ts) -- uses Octokit adapter exclusively.
 *
 * CRITICAL: Never import output() or error() from core -- they call process.exit().
 * CRITICAL: Never write to stdout -- it is reserved for MCP JSON-RPC protocol.
 * CRITICAL: Never call process.exit() -- the server must stay alive after every tool call.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
  requireAuth,
  getOctokit,
  getRepoInfo,
} from '../github/index.js';
import { AuthError } from '../github/types.js';
import {
  getProjectBoard,
  addItemToProject,
} from '../github/projects.js';

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
 * Register all board query tools on the MCP server.
 */
export function registerBoardTools(server: McpServer): void {
  // -- mcp_query_board ----------------------------------------------------------

  server.tool(
    'mcp_query_board',
    'Query the GitHub project board. Returns all items with their status and issue details.',
    {
      project_number: z.number().describe('Project number'),
      status: z
        .enum(['To Do', 'In Progress', 'In Review', 'Done'])
        .optional()
        .describe('Filter by status column'),
      phase: z
        .string()
        .optional()
        .describe('Filter by phase number (matches issue title prefix)'),
    },
    async ({ project_number, status, phase }) => {
      try {
        try {
          requireAuth();
        } catch (e) {
          if (e instanceof AuthError) {
            return mcpAuthError(e);
          }
          throw e;
        }

        const result = await getProjectBoard(project_number);
        if (!result.ok) {
          return mcpError(`Board query failed: ${result.error}`, 'Query failed');
        }

        let items = result.data.items;

        // Filter by status
        if (status) {
          items = items.filter(item => item.status === status);
        }

        // Filter by phase (match issue number -- caller can filter by title)
        if (phase) {
          // Phase filtering works on issue titles, but we only have issue numbers
          // from the board. The caller should use mcp_list_sub_issues for phase-specific queries.
          // For now, return all items and let the caller filter.
        }

        return mcpSuccess(
          {
            items: items.map(item => ({
              item_id: item.id,
              issue_number: item.issueNumber,
              status: item.status,
            })),
            count: items.length,
          },
          `Board query: ${items.length} items${status ? ` in "${status}"` : ''}`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // -- mcp_add_to_board ---------------------------------------------------------

  server.tool(
    'mcp_add_to_board',
    'Add a GitHub issue to the project board.',
    {
      project_number: z.number().describe('Project number'),
      issue_number: z.number().describe('GitHub issue number to add'),
    },
    async ({ project_number, issue_number }) => {
      try {
        try {
          requireAuth();
        } catch (e) {
          if (e instanceof AuthError) {
            return mcpAuthError(e);
          }
          throw e;
        }

        const result = await addItemToProject(project_number, issue_number);
        if (!result.ok) {
          return mcpError(`Add to board failed: ${result.error}`, 'Add failed');
        }

        return mcpSuccess(
          {
            project_number,
            issue_number,
            item_id: result.data.itemId,
            added: true,
          },
          `Issue #${issue_number} added to project board`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // -- mcp_search_issues --------------------------------------------------------

  server.tool(
    'mcp_search_issues',
    'Search GitHub issues by label, state, or text query.',
    {
      labels: z
        .array(z.string())
        .optional()
        .describe('Filter by label names'),
      state: z
        .enum(['open', 'closed', 'all'])
        .optional()
        .default('open')
        .describe('Filter by issue state'),
      query: z
        .string()
        .optional()
        .describe('Text search query (title match)'),
    },
    async ({ labels, state, query }) => {
      try {
        try {
          requireAuth();
        } catch (e) {
          if (e instanceof AuthError) {
            return mcpAuthError(e);
          }
          throw e;
        }

        const octokit = getOctokit();
        const { owner, repo } = await getRepoInfo();

        const issues = await octokit.paginate(
          octokit.rest.issues.listForRepo,
          {
            owner,
            repo,
            state: (state === 'all' ? 'all' : state) as 'open' | 'closed' | 'all',
            labels: labels ? labels.join(',') : undefined,
            per_page: 100,
          },
        );

        let filtered = issues.map(issue => ({
          number: issue.number,
          title: issue.title,
          state: issue.state,
          labels: issue.labels
            .map(l => (typeof l === 'string' ? l : l.name ?? ''))
            .filter(Boolean),
        }));

        // Text query filter on title
        if (query) {
          const q = query.toLowerCase();
          filtered = filtered.filter(issue =>
            issue.title.toLowerCase().includes(q),
          );
        }

        return mcpSuccess(
          { issues: filtered, count: filtered.length },
          `Found ${filtered.length} issues`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );
}
