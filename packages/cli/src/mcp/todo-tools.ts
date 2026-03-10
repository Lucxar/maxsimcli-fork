/**
 * Todo CRUD MCP Tools — Todo operations exposed as MCP tools
 *
 * Integrates with GitHub: todo add creates GitHub issue in 'full' mode,
 * todo complete closes GitHub issue and moves to Done on board,
 * todo list enriches with GitHub issue data when available.
 *
 * CRITICAL: Never import output() or error() from core — they call process.exit().
 * CRITICAL: Never write to stdout — it is reserved for MCP JSON-RPC protocol.
 * CRITICAL: Never call process.exit() — the server must stay alive after every tool call.
 */

import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { generateSlugInternal, todayISO, planningPath } from '../core/core.js';
import { parseTodoFrontmatter } from '../core/commands.js';

import { detectGitHubMode } from '../github/gh-legacy.js';
import { createTodoIssue, closeIssue } from '../github/issues.js';
import { addItemToProject, moveItemToStatus } from '../github/projects.js';
import { loadMapping, saveMapping, updateTodoMapping } from '../github/mapping.js';

import { detectProjectRoot, mcpSuccess, mcpError } from './utils.js';

/**
 * Register all todo CRUD tools on the MCP server.
 */
export function registerTodoTools(server: McpServer): void {
  // ── mcp_add_todo ────────────────────────────────────────────────────────────

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

        // GitHub integration: create issue in 'full' mode
        let githubIssueNumber: number | null = null;
        let githubIssueUrl: string | null = null;
        let githubWarning: string | undefined;

        try {
          const mode = await detectGitHubMode();
          if (mode === 'full') {
            const mapping = loadMapping(cwd);

            const issueResult = await createTodoIssue({
              title,
              description: description || undefined,
              milestone: mapping?.milestone_title || undefined,
            });

            if (issueResult.ok) {
              githubIssueNumber = issueResult.data.number;
              githubIssueUrl = issueResult.data.url;

              // Add to project board
              if (mapping && mapping.project_number > 0) {
                const issueUrl = `https://github.com/${mapping.repo}/issues/${issueResult.data.number}`;
                const addResult = await addItemToProject(mapping.project_number, issueUrl);

                if (addResult.ok) {
                  // Store mapping
                  updateTodoMapping(cwd, filename, {
                    number: issueResult.data.number,
                    node_id: issueResult.data.node_id,
                    item_id: addResult.data.item_id,
                    status: 'To Do',
                  });

                  // Set status to "To Do" on board
                  if (mapping.status_field_id && mapping.status_options['To Do']) {
                    await moveItemToStatus(
                      mapping.project_id,
                      addResult.data.item_id,
                      mapping.status_field_id,
                      mapping.status_options['To Do'],
                    );
                  }
                } else {
                  // Store mapping without item_id (not on board)
                  updateTodoMapping(cwd, filename, {
                    number: issueResult.data.number,
                    node_id: issueResult.data.node_id,
                    item_id: '',
                    status: 'To Do',
                  });
                  githubWarning = `Issue created but board add failed: ${addResult.error}`;
                }
              } else {
                // No mapping or project — just record the issue number
                githubWarning = 'Issue created but no project board configured for board tracking.';
              }
            } else {
              githubWarning = `GitHub issue creation failed: ${issueResult.error}`;
            }
          }
        } catch (e) {
          githubWarning = `GitHub operation failed: ${(e as Error).message}`;
        }

        return mcpSuccess(
          {
            file: filename,
            path: `.planning/todos/pending/${filename}`,
            title,
            area: area || 'general',
            github_issue_number: githubIssueNumber,
            github_issue_url: githubIssueUrl,
            ...(githubWarning ? { github_warning: githubWarning } : {}),
          },
          `Todo created: ${title}${githubIssueNumber ? ` (GitHub #${githubIssueNumber})` : ''}`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // ── mcp_complete_todo ───────────────────────────────────────────────────────

  server.tool(
    'mcp_complete_todo',
    'Mark a pending todo as completed by moving it from pending/ to completed/ with a completion timestamp.',
    {
      todo_id: z.string().describe('Filename of the todo (e.g., 1234567890-my-task.md)'),
    },
    async ({ todo_id }) => {
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

        // GitHub integration: close issue in 'full' mode
        let githubClosed = false;
        let githubWarning: string | undefined;

        try {
          const mode = await detectGitHubMode();
          if (mode === 'full') {
            const mapping = loadMapping(cwd);
            if (mapping?.todos?.[todo_id]) {
              const todoMapping = mapping.todos[todo_id];
              if (todoMapping.number > 0) {
                // Close the issue
                const closeResult = await closeIssue(todoMapping.number, 'completed');
                githubClosed = closeResult.ok;

                if (!closeResult.ok) {
                  githubWarning = `GitHub issue close failed: ${closeResult.error}`;
                }

                // Move to Done on board
                if (
                  todoMapping.item_id &&
                  mapping.status_field_id &&
                  mapping.status_options['Done']
                ) {
                  await moveItemToStatus(
                    mapping.project_id,
                    todoMapping.item_id,
                    mapping.status_field_id,
                    mapping.status_options['Done'],
                  );
                }

                // Update local mapping status
                todoMapping.status = 'Done';
                saveMapping(cwd, mapping);
              }
            }
          }
        } catch (e) {
          githubWarning = `GitHub operation failed: ${(e as Error).message}`;
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

  // ── mcp_list_todos ──────────────────────────────────────────────────────────

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
          github_issue_number?: number;
          github_status?: string;
        }> = [];

        // Load GitHub mapping for enrichment (best effort)
        let todoMappings: Record<string, { number: number; status: string }> | null = null;
        let githubWarning: string | undefined;

        try {
          const mode = await detectGitHubMode();
          if (mode === 'full') {
            const mapping = loadMapping(cwd);
            if (mapping?.todos) {
              todoMappings = {};
              for (const [todoId, data] of Object.entries(mapping.todos)) {
                if (data.number > 0) {
                  todoMappings[todoId] = {
                    number: data.number,
                    status: data.status,
                  };
                }
              }
            }
          }
        } catch (e) {
          githubWarning = `GitHub enrichment failed: ${(e as Error).message}`;
        }

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

              const todoEntry: (typeof todos)[number] = {
                file,
                created: fm.created,
                title: fm.title,
                area: fm.area,
                status: dirStatus,
                path: `.planning/todos/${dirStatus}/${file}`,
              };

              // Enrich with GitHub data if available
              if (todoMappings?.[file]) {
                todoEntry.github_issue_number = todoMappings[file].number;
                todoEntry.github_status = todoMappings[file].status;
              }

              todos.push(todoEntry);
            } catch {
              // Skip unreadable files
            }
          }
        }

        return mcpSuccess(
          {
            count: todos.length,
            todos,
            ...(githubWarning ? { github_warning: githubWarning } : {}),
          },
          `${todos.length} todos found`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );
}
