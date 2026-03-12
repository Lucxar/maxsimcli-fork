/**
 * Todo CRUD MCP Tools -- Todo operations exposed as MCP tools
 *
 * GitHub Issues with the 'todo' label are the single source of truth.
 * Local .planning/todos/ files serve as a cache for offline access.
 *
 * CRITICAL: Never import output() or error() from core -- they call process.exit().
 * CRITICAL: Never write to stdout -- it is reserved for MCP JSON-RPC protocol.
 * CRITICAL: Never call process.exit() -- the server must stay alive after every tool call.
 */

import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { generateSlugInternal, todayISO, planningPath } from '../core/core.js';

import { requireAuth } from '../github/client.js';
import { AuthError } from '../github/types.js';
import { createTodoIssue, listTodoIssues, closeIssue } from '../github/issues.js';

import { detectProjectRoot, mcpSuccess, mcpError } from './utils.js';

/**
 * Register all todo CRUD tools on the MCP server.
 */
export function registerTodoTools(server: McpServer): void {
  // -- mcp_add_todo -------------------------------------------------------------

  server.tool(
    'mcp_add_todo',
    'Create a new todo as a GitHub Issue (primary) with local file cache.',
    {
      title: z.string().describe('Title of the todo item'),
      description: z.string().optional().describe('Optional description body'),
      area: z.string().optional().default('general').describe('Area/category (default: general)'),
      phase: z.string().optional().describe('Associated phase number'),
    },
    async ({ title, description, area, phase }) => {
      try {
        const cwd = detectProjectRoot();
        if (!cwd) {
          return mcpError('No .planning/ directory found', 'Project not detected');
        }

        const today = todayISO();
        const slug = generateSlugInternal(title) || 'untitled';
        const timestamp = Date.now();
        const filename = `${timestamp}-${slug}.md`;

        // Primary: Create GitHub Issue with 'todo' label
        let githubIssueNumber: number | undefined;
        let githubError: string | undefined;

        try {
          requireAuth();
          const ghResult = await createTodoIssue(title, description, area, phase);
          if (ghResult.ok) {
            githubIssueNumber = ghResult.data.number;
          } else {
            githubError = `GitHub issue creation failed: ${ghResult.error}`;
          }
        } catch (e) {
          if (e instanceof AuthError) {
            githubError = `GitHub auth not available: ${e.message}`;
          } else {
            githubError = `GitHub operation failed: ${(e as Error).message}`;
          }
        }

        if (!githubIssueNumber && !githubError) {
          githubError = 'GitHub issue creation returned no issue number';
        }

        // Cache: Write local file
        const pendingDir = planningPath(cwd, 'todos', 'pending');
        fs.mkdirSync(pendingDir, { recursive: true });

        const issueRef = githubIssueNumber ? `\ngithub_issue: ${githubIssueNumber}` : '';
        const content = `---\ncreated: ${today}\ntitle: ${title}\narea: ${area || 'general'}\nphase: ${phase || 'unassigned'}${issueRef}\n---\n${description || ''}\n`;

        fs.writeFileSync(path.join(pendingDir, filename), content, 'utf-8');

        return mcpSuccess(
          {
            file: filename,
            path: `.planning/todos/pending/${filename}`,
            title,
            area: area || 'general',
            github_issue: githubIssueNumber ?? null,
            ...(githubError ? { github_error: githubError } : {}),
          },
          githubIssueNumber
            ? `Todo created: ${title} (GitHub Issue #${githubIssueNumber})`
            : `Todo created: ${title} (local only — ${githubError})`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // -- mcp_complete_todo --------------------------------------------------------

  server.tool(
    'mcp_complete_todo',
    'Mark a todo as completed. Closes the GitHub Issue (primary) and moves local cache file.',
    {
      todo_id: z.string().describe('Filename of the todo (e.g., 1234567890-my-task.md)'),
      github_issue_number: z.number().optional().describe('GitHub issue number to close (reads from local cache if omitted)'),
    },
    async ({ todo_id, github_issue_number }) => {
      try {
        const cwd = detectProjectRoot();
        if (!cwd) {
          return mcpError('No .planning/ directory found', 'Project not detected');
        }

        const pendingDir = planningPath(cwd, 'todos', 'pending');
        const completedDir = planningPath(cwd, 'todos', 'completed');
        const sourcePath = path.join(pendingDir, todo_id);

        if (!fs.existsSync(sourcePath)) {
          return mcpError(`Todo not found in pending: ${todo_id}`, 'Todo not found');
        }

        // Read local file to extract github_issue if not provided
        let content = fs.readFileSync(sourcePath, 'utf-8');
        const today = todayISO();

        let issueNumber = github_issue_number;
        if (!issueNumber) {
          const issueMatch = content.match(/github_issue:\s*(\d+)/);
          if (issueMatch) {
            issueNumber = parseInt(issueMatch[1], 10);
          }
        }

        // Primary: Close GitHub Issue
        let githubClosed = false;
        let githubWarning: string | undefined;

        if (issueNumber) {
          try {
            requireAuth();
            const closeResult = await closeIssue(issueNumber, `Todo completed: ${todo_id}`);
            githubClosed = closeResult.ok;
            if (!closeResult.ok) {
              githubWarning = `GitHub issue close failed: ${closeResult.error}`;
            }
          } catch (e) {
            if (e instanceof AuthError) {
              githubWarning = `GitHub auth not available: ${e.message}`;
            } else {
              githubWarning = `GitHub operation failed: ${(e as Error).message}`;
            }
          }
        }

        // Cache: Move local file from pending to completed
        fs.mkdirSync(completedDir, { recursive: true });
        content = `completed: ${today}\n` + content;
        fs.writeFileSync(path.join(completedDir, todo_id), content, 'utf-8');
        fs.unlinkSync(sourcePath);

        return mcpSuccess(
          {
            completed: true,
            file: todo_id,
            date: today,
            github_closed: githubClosed,
            github_issue: issueNumber ?? null,
            ...(githubWarning ? { github_warning: githubWarning } : {}),
          },
          `Todo completed: ${todo_id}${githubClosed ? ` (GitHub Issue #${issueNumber} closed)` : ''}`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // -- mcp_list_todos -----------------------------------------------------------

  server.tool(
    'mcp_list_todos',
    'List todo items from GitHub Issues (primary). Falls back to local cache if GitHub unavailable.',
    {
      area: z.string().optional().describe('Filter by area/category'),
      status: z
        .enum(['pending', 'completed', 'all'])
        .optional()
        .default('pending')
        .describe('Which todos to list (default: pending)'),
    },
    async ({ area, status }) => {
      try {
        const cwd = detectProjectRoot();
        if (!cwd) {
          return mcpError('No .planning/ directory found', 'Project not detected');
        }

        // Primary: Query GitHub Issues with 'todo' label
        try {
          requireAuth();
          const ghState = status === 'pending' ? 'open'
            : status === 'completed' ? 'closed'
            : 'all';
          const ghResult = await listTodoIssues(ghState);

          if (ghResult.ok) {
            let todos = ghResult.data;

            // Apply area filter
            if (area) {
              todos = todos.filter(t => t.area === area);
            }

            return mcpSuccess(
              {
                count: todos.length,
                source: 'github',
                todos: todos.map(t => ({
                  github_issue: t.number,
                  title: t.title,
                  area: t.area,
                  status: t.state === 'open' ? 'pending' : 'completed',
                  created: t.created_at,
                })),
              },
              `${todos.length} todos found (from GitHub)`,
            );
          }
        } catch {
          // GitHub unavailable — fall through to local cache
        }

        // Fallback: Read from local cache
        const todosBase = planningPath(cwd, 'todos');
        const dirs: string[] = [];

        if (status === 'pending' || status === 'all') {
          dirs.push(path.join(todosBase, 'pending'));
        }
        if (status === 'completed' || status === 'all') {
          dirs.push(path.join(todosBase, 'completed'));
        }

        const { parseTodoFrontmatter } = await import('../core/commands.js');

        const todos: Array<{
          file: string;
          created: string;
          title: string;
          area: string;
          status: string;
          path: string;
          github_issue?: number;
        }> = [];

        for (const dir of dirs) {
          const dirStatus = dir.endsWith('pending') ? 'pending' : 'completed';

          let files: string[] = [];
          try {
            files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
          } catch {
            continue;
          }

          for (const file of files) {
            try {
              const fileContent = fs.readFileSync(path.join(dir, file), 'utf-8');
              const fm = parseTodoFrontmatter(fileContent);

              if (area && fm.area !== area) continue;

              const issueMatch = fileContent.match(/github_issue:\s*(\d+)/);
              todos.push({
                file,
                created: fm.created,
                title: fm.title,
                area: fm.area,
                status: dirStatus,
                path: `.planning/todos/${dirStatus}/${file}`,
                ...(issueMatch ? { github_issue: parseInt(issueMatch[1], 10) } : {}),
              });
            } catch {
              // Skip unreadable files
            }
          }
        }

        return mcpSuccess(
          {
            count: todos.length,
            source: 'local_cache',
            todos,
          },
          `${todos.length} todos found (from local cache — GitHub unavailable)`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );
}
