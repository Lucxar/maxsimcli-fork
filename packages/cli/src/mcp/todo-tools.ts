/**
 * Todo CRUD MCP Tools -- Todo operations exposed as MCP tools
 *
 * Manages local todo files in .planning/todos/. In the new architecture,
 * todos will eventually migrate to GitHub Issues with the 'task' label.
 * For now, todos remain as local .planning/ files with best-effort GitHub
 * integration (issue creation + board tracking when auth is available).
 *
 * TODO: Migrate todo storage from .planning/todos/ to GitHub Issues in a
 * future iteration. Todos would become GitHub Issues with the 'task' label,
 * removing the need for local file management.
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
import { parseTodoFrontmatter } from '../core/commands.js';

import { requireAuth } from '../github/client.js';
import { AuthError } from '../github/types.js';
import { closeIssue } from '../github/issues.js';

import { detectProjectRoot, mcpSuccess, mcpError } from './utils.js';

/**
 * Register all todo CRUD tools on the MCP server.
 */
export function registerTodoTools(server: McpServer): void {
  // -- mcp_add_todo -------------------------------------------------------------

  server.tool(
    'mcp_add_todo',
    'Create a new todo item in .planning/todos/pending/ with frontmatter metadata.',
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

        const pendingDir = planningPath(cwd, 'todos', 'pending');
        fs.mkdirSync(pendingDir, { recursive: true });

        const today = todayISO();
        const slug = generateSlugInternal(title) || 'untitled';
        const timestamp = Date.now();
        const filename = `${timestamp}-${slug}.md`;
        const filePath = path.join(pendingDir, filename);

        const content = `---\ncreated: ${today}\ntitle: ${title}\narea: ${area || 'general'}\nphase: ${phase || 'unassigned'}\n---\n${description || ''}\n`;

        fs.writeFileSync(filePath, content, 'utf-8');

        return mcpSuccess(
          {
            file: filename,
            path: `.planning/todos/pending/${filename}`,
            title,
            area: area || 'general',
          },
          `Todo created: ${title}`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // -- mcp_complete_todo --------------------------------------------------------

  server.tool(
    'mcp_complete_todo',
    'Mark a pending todo as completed by moving it from pending/ to completed/ with a completion timestamp.',
    {
      todo_id: z.string().describe('Filename of the todo (e.g., 1234567890-my-task.md)'),
      github_issue_number: z.number().optional().describe('Optional GitHub issue number to close'),
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

        fs.mkdirSync(completedDir, { recursive: true });

        let content = fs.readFileSync(sourcePath, 'utf-8');
        const today = todayISO();
        content = `completed: ${today}\n` + content;

        fs.writeFileSync(path.join(completedDir, todo_id), content, 'utf-8');
        fs.unlinkSync(sourcePath);

        // GitHub integration: close issue if number provided
        let githubClosed = false;
        let githubWarning: string | undefined;

        if (github_issue_number) {
          try {
            requireAuth();
            const closeResult = await closeIssue(github_issue_number, `Todo completed: ${todo_id}`);
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

        return mcpSuccess(
          {
            completed: true,
            file: todo_id,
            date: today,
            github_closed: githubClosed,
            ...(githubWarning ? { github_warning: githubWarning } : {}),
          },
          `Todo completed: ${todo_id}${githubClosed ? ' (GitHub issue closed)' : ''}`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // -- mcp_list_todos -----------------------------------------------------------

  server.tool(
    'mcp_list_todos',
    'List todo items, optionally filtered by area and status (pending, completed, or all).',
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

        const todosBase = planningPath(cwd, 'todos');
        const dirs: string[] = [];

        if (status === 'pending' || status === 'all') {
          dirs.push(path.join(todosBase, 'pending'));
        }
        if (status === 'completed' || status === 'all') {
          dirs.push(path.join(todosBase, 'completed'));
        }

        const todos: Array<{
          file: string;
          created: string;
          title: string;
          area: string;
          status: string;
          path: string;
        }> = [];

        for (const dir of dirs) {
          const dirStatus = dir.endsWith('pending') ? 'pending' : 'completed';

          let files: string[] = [];
          try {
            files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
          } catch {
            // Directory may not exist
            continue;
          }

          for (const file of files) {
            try {
              const content = fs.readFileSync(path.join(dir, file), 'utf-8');
              const fm = parseTodoFrontmatter(content);

              if (area && fm.area !== area) continue;

              todos.push({
                file,
                created: fm.created,
                title: fm.title,
                area: fm.area,
                status: dirStatus,
                path: `.planning/todos/${dirStatus}/${file}`,
              });
            } catch {
              // Skip unreadable files
            }
          }
        }

        return mcpSuccess(
          {
            count: todos.length,
            todos,
          },
          `${todos.length} todos found`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );
}
