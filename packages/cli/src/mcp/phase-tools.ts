/**
 * Phase CRUD MCP Tools -- Phase operations exposed as MCP tools
 *
 * Integrates with GitHub: phase completion triggers issue close and
 * milestone completion check. Find/list enrich responses with GitHub
 * issue data when available.
 *
 * Uses the new Octokit-based adapter modules (client.ts, issues.ts,
 * projects.ts, sync.ts) -- uses Octokit adapter exclusively.
 *
 * CRITICAL: Never import output() or error() from core -- they call process.exit().
 * CRITICAL: Never write to stdout -- it is reserved for MCP JSON-RPC protocol.
 * CRITICAL: Never call process.exit() -- the server must stay alive after every tool call.
 */

import fs from 'node:fs';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
  findPhaseInternal,
  comparePhaseNum,
  getArchivedPhaseDirs,
  phasesPath,
  listSubDirs,
} from '../core/core.js';

import {
  phaseAddCore,
  phaseInsertCore,
  phaseCompleteCore,
} from '../core/phase.js';

import { requireAuth } from '../github/client.js';
import { AuthError } from '../github/types.js';
import { closeIssue, postComment } from '../github/issues.js';
import { closeMilestone } from '../github/milestones.js';
import { loadMapping, saveMapping } from '../github/mapping.js';
import { checkPhaseProgress } from '../github/sync.js';
import type { IssueMappingFile, IssueStatus, TaskIssueMapping } from '../github/types.js';

import { detectProjectRoot, mcpSuccess, mcpError } from './utils.js';

/**
 * Register all phase CRUD tools on the MCP server.
 */
export function registerPhaseTools(server: McpServer): void {
  // -- mcp_find_phase -----------------------------------------------------------

  server.tool(
    'mcp_find_phase',
    'Find a phase directory by number or name. Returns phase details including plans, summaries, and status.',
    {
      phase: z.string().describe('Phase number or name (e.g. "01", "1", "01A", "1.1")'),
    },
    async ({ phase }) => {
      try {
        const cwd = detectProjectRoot();
        if (!cwd) {
          return mcpError('No .planning/ directory found', 'Project not detected');
        }

        const result = await findPhaseInternal(cwd, phase);
        if (!result) {
          return mcpError(`Phase ${phase} not found`, 'Phase not found');
        }

        // Enrich with GitHub issue data if mapping exists
        let githubTracking: { number: number; status: string } | null = null;
        let githubTaskIssues: Record<string, { number: number; status: string }> | null = null;
        let githubWarning: string | undefined;

        try {
          const mapping = loadMapping(cwd);
          if (mapping && result.phase_number) {
            const phaseMapping = mapping.phases[result.phase_number];
            if (phaseMapping) {
              if (phaseMapping.tracking_issue.number > 0) {
                githubTracking = {
                  number: phaseMapping.tracking_issue.number,
                  status: phaseMapping.tracking_issue.status,
                };
              }
              const taskEntries = Object.entries(phaseMapping.tasks);
              if (taskEntries.length > 0) {
                githubTaskIssues = {};
                for (const [taskId, task] of taskEntries) {
                  if (task.number > 0) {
                    githubTaskIssues[taskId] = {
                      number: task.number,
                      status: task.status,
                    };
                  }
                }
              }
            }
          }
        } catch (e) {
          githubWarning = `GitHub data enrichment failed: ${(e as Error).message}`;
        }

        return mcpSuccess(
          {
            found: result.found,
            directory: result.directory,
            phase_number: result.phase_number,
            phase_name: result.phase_name,
            phase_slug: result.phase_slug,
            plans: result.plans,
            summaries: result.summaries,
            incomplete_plans: result.incomplete_plans,
            has_research: result.has_research,
            has_context: result.has_context,
            has_verification: result.has_verification,
            archived: result.archived ?? null,
            github_tracking_issue: githubTracking,
            github_task_issues: githubTaskIssues,
            ...(githubWarning ? { github_warning: githubWarning } : {}),
          },
          `Found phase ${result.phase_number}: ${result.phase_name ?? 'unnamed'}`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // -- mcp_list_phases ----------------------------------------------------------

  server.tool(
    'mcp_list_phases',
    'List phase directories with pagination. Returns sorted phases with offset/limit support.',
    {
      include_archived: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include archived phases from completed milestones'),
      offset: z
        .number()
        .optional()
        .default(0)
        .describe('Number of phases to skip (for pagination)'),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe('Maximum number of phases to return'),
    },
    async ({ include_archived, offset, limit }) => {
      try {
        const cwd = detectProjectRoot();
        if (!cwd) {
          return mcpError('No .planning/ directory found', 'Project not detected');
        }

        const phasesDir = phasesPath(cwd);
        if (!fs.existsSync(phasesDir)) {
          return mcpSuccess(
            { directories: [], count: 0, total_count: 0, offset, limit, has_more: false },
            'No phases directory found',
          );
        }

        let dirs = await listSubDirs(phasesDir);

        if (include_archived) {
          const archived = await getArchivedPhaseDirs(cwd);
          for (const a of archived) {
            dirs.push(`${a.name} [${a.milestone}]`);
          }
        }

        dirs.sort((a, b) => comparePhaseNum(a, b));

        const total_count = dirs.length;
        const paginated = dirs.slice(offset, offset + limit);
        const has_more = offset + limit < total_count;

        // Enrich with GitHub issue counts from mapping (best-effort)
        let githubIssueCounts: Record<string, { open: number; closed: number }> | null = null;
        let githubWarning: string | undefined;

        try {
          const mapping = loadMapping(cwd);
          if (mapping && Object.keys(mapping.phases).length > 0) {
            githubIssueCounts = {};
            for (const [phaseNum, phaseData] of Object.entries(mapping.phases)) {
              let open = 0;
              let closed = 0;
              for (const task of Object.values(phaseData.tasks)) {
                if (task.number > 0) {
                  if (task.status === 'Done') {
                    closed++;
                  } else {
                    open++;
                  }
                }
              }
              githubIssueCounts[phaseNum] = { open, closed };
            }
          }
        } catch (e) {
          githubWarning = `GitHub enrichment failed: ${(e as Error).message}`;
        }

        return mcpSuccess(
          {
            directories: paginated,
            count: paginated.length,
            total_count,
            offset,
            limit,
            has_more,
            github_issue_counts: githubIssueCounts,
            ...(githubWarning ? { github_warning: githubWarning } : {}),
          },
          `Showing ${paginated.length} of ${total_count} phase(s)`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // -- mcp_create_phase ---------------------------------------------------------

  server.tool(
    'mcp_create_phase',
    'Create a new phase. Adds the next sequential phase directory and appends to ROADMAP.md.',
    {
      name: z.string().describe('Phase description/name (e.g. "Authentication System")'),
    },
    async ({ name }) => {
      try {
        const cwd = detectProjectRoot();
        if (!cwd) {
          return mcpError('No .planning/ directory found', 'Project not detected');
        }

        if (!name || !name.trim()) {
          return mcpError('Phase name must not be empty', 'Validation failed');
        }

        const result = await phaseAddCore(cwd, name, { includeStubs: true });

        // No GitHub action needed on phase creation -- issues are created
        // on plan finalization (eager creation), not phase creation.

        return mcpSuccess(
          {
            phase_number: result.phase_number,
            padded: result.padded,
            name: result.description,
            slug: result.slug,
            directory: result.directory,
          },
          `Created Phase ${result.phase_number}: ${result.description}`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // -- mcp_insert_phase ---------------------------------------------------------

  server.tool(
    'mcp_insert_phase',
    'Insert a decimal phase after a specified phase (e.g. 01.1 after 01). Creates directory and updates ROADMAP.md.',
    {
      name: z.string().describe('Phase description/name'),
      after: z.string().describe('Phase number to insert after (e.g. "01", "1")'),
    },
    async ({ name, after }) => {
      try {
        const cwd = detectProjectRoot();
        if (!cwd) {
          return mcpError('No .planning/ directory found', 'Project not detected');
        }

        if (!name || !name.trim()) {
          return mcpError('Phase name must not be empty', 'Validation failed');
        }

        const result = await phaseInsertCore(cwd, after, name, { includeStubs: true });

        return mcpSuccess(
          {
            phase_number: result.phase_number,
            after_phase: result.after_phase,
            name: result.description,
            slug: result.slug,
            directory: result.directory,
          },
          `Inserted Phase ${result.phase_number}: ${result.description} after Phase ${result.after_phase}`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // -- mcp_complete_phase -------------------------------------------------------

  server.tool(
    'mcp_complete_phase',
    'Mark a phase as complete. Updates ROADMAP.md checkbox, progress table, plan count, STATE.md, and REQUIREMENTS.md.',
    {
      phase: z.string().describe('Phase number to complete (e.g. "01", "1", "1.1")'),
    },
    async ({ phase }) => {
      try {
        const cwd = detectProjectRoot();
        if (!cwd) {
          return mcpError('No .planning/ directory found', 'Project not detected');
        }

        // Complete locally
        const result = await phaseCompleteCore(cwd, phase);

        // AFTER completing locally: GitHub operations (best-effort)
        let githubClosed = false;
        let milestoneClosed = false;
        let githubWarning: string | undefined;

        try {
          requireAuth();

          const mapping = loadMapping(cwd);
          if (mapping) {
            const phaseMapping = mapping.phases[phase];
            if (phaseMapping) {
              // Close the parent tracking issue
              if (phaseMapping.tracking_issue.number > 0) {
                const closeResult = await closeIssue(
                  phaseMapping.tracking_issue.number,
                  `Phase ${phase} completed`,
                );
                if (closeResult.ok) {
                  githubClosed = true;
                  phaseMapping.tracking_issue.status = 'Done';
                }
              }

              // Close any remaining open task issues for this phase
              for (const [_taskId, task] of Object.entries(phaseMapping.tasks)) {
                if (task.number > 0 && task.status !== 'Done') {
                  const taskCloseResult = await closeIssue(
                    task.number,
                    `Phase ${phase} completed -- closing remaining task`,
                  );
                  if (taskCloseResult.ok) {
                    task.status = 'Done';
                  }
                }
              }

              saveMapping(cwd, mapping);

              // Check if milestone should be closed (all phase issues done)
              if (mapping.milestone_id > 0) {
                // Check if all phases are done by examining all phase tracking issues
                const allDone = Object.values(mapping.phases).every(
                  p => p.tracking_issue.status === 'Done',
                );
                if (allDone) {
                  const msResult = await closeMilestone(mapping.milestone_id);
                  milestoneClosed = msResult.ok;
                }
              }
            }
          }
        } catch (e) {
          if (e instanceof AuthError) {
            // Auth not available -- skip GitHub operations silently
          } else {
            githubWarning = `GitHub completion operations failed: ${(e as Error).message}`;
          }
        }

        return mcpSuccess(
          {
            completed_phase: result.completed_phase,
            phase_name: result.phase_name,
            plans_executed: result.plans_executed,
            next_phase: result.next_phase,
            next_phase_name: result.next_phase_name,
            is_last_phase: result.is_last_phase,
            date: result.date,
            roadmap_updated: result.roadmap_updated,
            state_updated: result.state_updated,
            github_closed: githubClosed,
            milestone_closed: milestoneClosed,
            ...(githubWarning ? { github_warning: githubWarning } : {}),
          },
          `Phase ${phase} marked as complete${result.next_phase ? `, next: Phase ${result.next_phase}` : ''}`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );

  // -- mcp_bounce_issue ---------------------------------------------------------

  server.tool(
    'mcp_bounce_issue',
    'Bounce a task back from In Review to In Progress with a detailed comment explaining what failed. Implements reviewer feedback loop (AC-05).',
    {
      issue_number: z.number().describe('GitHub issue number to bounce back'),
      reason: z.string().describe('Detailed reason why the task is being bounced back (reviewer feedback)'),
    },
    async ({ issue_number, reason }) => {
      try {
        try {
          requireAuth();
        } catch (e) {
          if (e instanceof AuthError) {
            return mcpError(
              `GitHub auth required: ${e.message}`,
              'Authentication required',
            );
          }
          throw e;
        }

        const cwd = detectProjectRoot();
        if (!cwd) {
          return mcpError('No .planning/ directory found', 'Project not detected');
        }

        let githubWarning: string | undefined;
        let commented = false;

        // Post reviewer feedback comment
        try {
          const commentBody = `## Bounced Back to In Progress\n\n**Reason:** ${reason}\n\n---\n*Review feedback posted by MAXSIM*`;
          const commentResult = await postComment(issue_number, commentBody);
          commented = commentResult.ok;
          if (!commentResult.ok) {
            githubWarning = `Comment failed: ${commentResult.error}`;
          }
        } catch (e) {
          githubWarning = `Comment failed: ${(e as Error).message}`;
        }

        // Update local mapping status (best-effort)
        const mapping = loadMapping(cwd);
        if (mapping) {
          updateLocalMappingStatus(mapping, issue_number, 'In Progress');
          saveMapping(cwd, mapping);
        }

        return mcpSuccess(
          {
            issue_number,
            status: 'In Progress',
            commented,
            reason,
            ...(githubWarning ? { github_warning: githubWarning } : {}),
          },
          `Issue #${issue_number} bounced to In Progress${commented ? ' with feedback comment' : ''}`,
        );
      } catch (e) {
        return mcpError((e as Error).message, 'Operation failed');
      }
    },
  );
}

// ---- Internal Helpers -------------------------------------------------------

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
