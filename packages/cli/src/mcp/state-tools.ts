/**
 * State Management MCP Tools — STATE.md operations exposed as MCP tools
 *
 * Integrates with GitHub: blocker add/resolve uses best-effort GitHub
 * issue linking when blocker text references issue numbers.
 *
 * CRITICAL: Never import output() or error() from core — they call process.exit().
 * CRITICAL: Never write to stdout — it is reserved for MCP JSON-RPC protocol.
 * CRITICAL: Never call process.exit() — the server must stay alive after every tool call.
 */

import fs from 'node:fs';
import { z } from 'zod';
import escapeStringRegexp from 'escape-string-regexp';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { statePath } from '../core/core.js';
import { stateExtractField, stateReplaceField, appendToStateSection } from '../core/state.js';

import { detectGitHubMode } from '../github/gh.js';
import { postComment } from '../github/issues.js';

import { detectProjectRoot, mcpSuccess, mcpError } from './utils.js';

// ---- Helpers ---------------------------------------------------------------

/**
 * Extract GitHub issue numbers from text.
 *
 * Matches patterns like "#42", "issue 42", "issue #42", "blocked by #42".
 * Returns unique issue numbers found.
 */
function extractIssueNumbers(text: string): number[] {
  const matches = text.matchAll(/#(\d+)|issue\s+#?(\d+)/gi);
  const numbers = new Set<number>();
  for (const match of matches) {
    const num = parseInt(match[1] || match[2], 10);
    if (!Number.isNaN(num) && num > 0) {
      numbers.add(num);
    }
  }
  return Array.from(numbers);
}

/**
 * Register all state management tools on the MCP server.
 */
export function registerStateTools(server: McpServer): void {
  // ── mcp_get_state ───────────────────────────────────────────────────────────

  server.tool(
    'mcp_get_state',
    'Read STATE.md content — full file, a specific **field:** value, or a ## section.',
    {
      field: z
        .string()
        .optional()
        .describe('Specific field or section name, or omit for full STATE.md'),
    },
    async ({ field }) => {
      try {
        const cwd = detectProjectRoot();
        if (!cwd) {
          return mcpError('No .planning/ directory found', 'Project not detected');
        }

        const stPath = statePath(cwd);
        if (!fs.existsSync(stPath)) {
          return mcpError('STATE.md not found', 'STATE.md missing');
        }

        const content = fs.readFileSync(stPath, 'utf-8');

        if (!field) {
          return mcpSuccess({ content }, 'Full STATE.md retrieved');
        }

        // Try **field:** value pattern first
        const fieldValue = stateExtractField(content, field);
        if (fieldValue) {
          return mcpSuccess(
            { content: fieldValue, field },
            `State field retrieved: ${field}`,
          );
        }

        // Try ## Section pattern
        const fieldEscaped = escapeStringRegexp(field);
        const sectionPattern = new RegExp(
          `##\\s*${fieldEscaped}\\s*\n([\\s\\S]*?)(?=\\n##|$)`,
          'i',
        );
        const sectionMatch = content.match(sectionPattern);
        if (sectionMatch) {
          return mcpSuccess(
            { content: sectionMatch[1].trim(), field },
            `State section retrieved: ${field}`,
          );
        }

        return mcpError(
          `Section or field "${field}" not found in STATE.md`,
          'Field not found',
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // ── mcp_update_state ────────────────────────────────────────────────────────

  server.tool(
    'mcp_update_state',
    'Update a **field:** value in STATE.md (e.g., "Status", "Current focus").',
    {
      field: z.string().describe('Field name (e.g., "Status", "Current focus")'),
      value: z.string().describe('New value for the field'),
    },
    async ({ field, value }) => {
      try {
        const cwd = detectProjectRoot();
        if (!cwd) {
          return mcpError('No .planning/ directory found', 'Project not detected');
        }

        const stPath = statePath(cwd);
        if (!fs.existsSync(stPath)) {
          return mcpError('STATE.md not found', 'STATE.md missing');
        }

        const content = fs.readFileSync(stPath, 'utf-8');
        const updated = stateReplaceField(content, field, value);

        if (!updated) {
          return mcpError(
            `Field "${field}" not found in STATE.md`,
            'Field not found',
          );
        }

        fs.writeFileSync(stPath, updated, 'utf-8');

        return mcpSuccess(
          { updated: true, field, value },
          `State updated: ${field}`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // ── mcp_add_decision ────────────────────────────────────────────────────────

  server.tool(
    'mcp_add_decision',
    'Record a decision in the Decisions section of STATE.md.',
    {
      summary: z.string().describe('Decision summary'),
      rationale: z.string().optional().describe('Optional rationale'),
      phase: z.string().optional().describe('Associated phase number'),
    },
    async ({ summary, rationale, phase }) => {
      try {
        const cwd = detectProjectRoot();
        if (!cwd) {
          return mcpError('No .planning/ directory found', 'Project not detected');
        }

        const stPath = statePath(cwd);
        if (!fs.existsSync(stPath)) {
          return mcpError('STATE.md not found', 'STATE.md missing');
        }

        const content = fs.readFileSync(stPath, 'utf-8');
        const entry = `- [Phase ${phase || '?'}]: ${summary}${rationale ? ` -- ${rationale}` : ''}`;

        const sectionPattern =
          /(###?\s*(?:Decisions|Decisions Made|Accumulated.*Decisions)\s*\n)([\s\S]*?)(?=\n###?|\n##[^#]|$)/i;
        const updated = appendToStateSection(content, sectionPattern, entry, [/None yet\.?\s*\n?/gi, /No decisions yet\.?\s*\n?/gi]);

        if (!updated) {
          return mcpError(
            'Decisions section not found in STATE.md',
            'Section not found',
          );
        }

        fs.writeFileSync(stPath, updated, 'utf-8');

        return mcpSuccess(
          { added: true, decision: entry },
          'Decision recorded',
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // ── mcp_add_blocker ─────────────────────────────────────────────────────────

  server.tool(
    'mcp_add_blocker',
    'Add a blocker entry to the Blockers section of STATE.md.',
    {
      text: z.string().describe('Blocker description'),
    },
    async ({ text }) => {
      try {
        const cwd = detectProjectRoot();
        if (!cwd) {
          return mcpError('No .planning/ directory found', 'Project not detected');
        }

        const stPath = statePath(cwd);
        if (!fs.existsSync(stPath)) {
          return mcpError('STATE.md not found', 'STATE.md missing');
        }

        const content = fs.readFileSync(stPath, 'utf-8');
        const entry = `- ${text}`;

        const sectionPattern =
          /(###?\s*(?:Blockers|Blockers\/Concerns|Concerns)\s*\n)([\s\S]*?)(?=\n###?|\n##[^#]|$)/i;
        const updated = appendToStateSection(content, sectionPattern, entry, [/None\.?\s*\n?/gi, /None yet\.?\s*\n?/gi]);

        if (!updated) {
          return mcpError(
            'Blockers section not found in STATE.md',
            'Section not found',
          );
        }

        fs.writeFileSync(stPath, updated, 'utf-8');

        // GitHub integration: best-effort dependency linking
        let githubLinked: number[] = [];
        let githubWarning: string | undefined;

        try {
          const mode = await detectGitHubMode();
          if (mode === 'full') {
            const issueNumbers = extractIssueNumbers(text);
            if (issueNumbers.length > 0) {
              for (const issueNum of issueNumbers) {
                const commentResult = await postComment(
                  issueNum,
                  `**Blocker added in MAXSIM:**\n\n${text}\n\n---\n*Posted by MAXSIM blocker tracking*`,
                );
                if (commentResult.ok) {
                  githubLinked.push(issueNum);
                }
              }
            }
          }
        } catch (e) {
          githubWarning = `GitHub linking failed: ${(e as Error).message}`;
        }

        return mcpSuccess(
          {
            added: true,
            blocker: text,
            github_linked_issues: githubLinked.length > 0 ? githubLinked : null,
            ...(githubWarning ? { github_warning: githubWarning } : {}),
          },
          `Blocker added${githubLinked.length > 0 ? ` (linked to ${githubLinked.map(n => `#${n}`).join(', ')})` : ''}`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // ── mcp_resolve_blocker ─────────────────────────────────────────────────────

  server.tool(
    'mcp_resolve_blocker',
    'Remove a blocker from STATE.md by matching text (case-insensitive partial match).',
    {
      text: z
        .string()
        .describe('Text to match against blocker entries (case-insensitive partial match)'),
    },
    async ({ text }) => {
      try {
        const cwd = detectProjectRoot();
        if (!cwd) {
          return mcpError('No .planning/ directory found', 'Project not detected');
        }

        const stPath = statePath(cwd);
        if (!fs.existsSync(stPath)) {
          return mcpError('STATE.md not found', 'STATE.md missing');
        }

        let content = fs.readFileSync(stPath, 'utf-8');

        const sectionPattern =
          /(###?\s*(?:Blockers|Blockers\/Concerns|Concerns)\s*\n)([\s\S]*?)(?=\n###?|\n##[^#]|$)/i;
        const match = content.match(sectionPattern);

        if (!match) {
          return mcpError(
            'Blockers section not found in STATE.md',
            'Section not found',
          );
        }

        const sectionBody = match[2];
        const lines = sectionBody.split('\n');

        // Collect matching blocker lines for GitHub comment
        const matchingLines: string[] = [];
        const filtered = lines.filter((line) => {
          if (!line.startsWith('- ')) return true;
          if (line.toLowerCase().includes(text.toLowerCase())) {
            matchingLines.push(line);
            return false;
          }
          return true;
        });

        let newBody = filtered.join('\n');
        if (!newBody.trim() || !newBody.includes('- ')) {
          newBody = 'None\n';
        }

        content = content.replace(
          sectionPattern,
          (_match, header: string) => `${header}${newBody}`,
        );

        fs.writeFileSync(stPath, content, 'utf-8');

        // GitHub integration: post resolution comment on referenced issues
        let githubCommented: number[] = [];
        let githubWarning: string | undefined;

        try {
          const mode = await detectGitHubMode();
          if (mode === 'full') {
            // Extract issue numbers from the matched blocker text
            const allText = matchingLines.join(' ') + ' ' + text;
            const issueNumbers = extractIssueNumbers(allText);
            if (issueNumbers.length > 0) {
              for (const issueNum of issueNumbers) {
                const commentResult = await postComment(
                  issueNum,
                  `**Blocker resolved in MAXSIM:**\n\nResolved blocker matching: "${text}"\n\n---\n*Posted by MAXSIM blocker tracking*`,
                );
                if (commentResult.ok) {
                  githubCommented.push(issueNum);
                }
              }
            }
          }
        } catch (e) {
          githubWarning = `GitHub comment failed: ${(e as Error).message}`;
        }

        return mcpSuccess(
          {
            resolved: true,
            blocker: text,
            github_commented_issues: githubCommented.length > 0 ? githubCommented : null,
            ...(githubWarning ? { github_warning: githubWarning } : {}),
          },
          `Blocker resolved${githubCommented.length > 0 ? ` (commented on ${githubCommented.map(n => `#${n}`).join(', ')})` : ''}`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );
}
