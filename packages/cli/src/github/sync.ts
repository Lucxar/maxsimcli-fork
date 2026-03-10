/**
 * GitHub Sync — State verification from GitHub Issues
 *
 * Reads phase state entirely from GitHub Issues (sub-issues API).
 * GitHub Issues is the source of truth — no local file reads for state.
 *
 * Key functions:
 * - checkPhaseProgress: counts open/closed sub-issues for a phase
 * - getPhaseState: derives lifecycle state from sub-issue counts
 * - detectInterruptedPhase: identifies interrupted executions via mixed state
 * - getAllPhasesProgress: overview of all phase issues with progress
 *
 * CRITICAL: No GraphQL anywhere in this file.
 * CRITICAL: All operations use client.ts (Octokit adapter) exclusively.
 * CRITICAL: Never call process.exit() — return GhResult instead.
 */

import { getOctokit, getRepoInfo, withGhResult } from './client.js';
import type { GhResult } from './types.js';

// ---- Types -----------------------------------------------------------------

export interface PhaseProgress {
  total: number;
  completed: number;
  inProgress: number;
  remaining: number;
  tasks: Array<{
    number: number;
    title: string;
    state: 'open' | 'closed';
  }>;
}

// ---- Check Phase Progress --------------------------------------------------

/**
 * Get the progress of a phase by counting open/closed sub-issues.
 *
 * Uses `octokit.rest.issues.listSubIssues()` with pagination to get all
 * sub-issues of a phase tracking issue. Counts open vs closed to determine
 * progress.
 *
 * @param phaseIssueNumber - The issue number of the phase tracking issue
 */
export async function checkPhaseProgress(
  phaseIssueNumber: number,
): Promise<GhResult<PhaseProgress>> {
  return withGhResult(async () => {
    const octokit = getOctokit();
    const { owner, repo } = await getRepoInfo();

    // Fetch all sub-issues with pagination
    const tasks: PhaseProgress['tasks'] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await octokit.rest.issues.listSubIssues({
        owner,
        repo,
        issue_number: phaseIssueNumber,
        per_page: 100,
        page,
      });

      for (const issue of response.data) {
        tasks.push({
          number: issue.number,
          title: issue.title,
          state: issue.state as 'open' | 'closed',
        });
      }

      // Check if there are more pages
      hasMore = response.data.length === 100;
      page++;
    }

    const completed = tasks.filter(t => t.state === 'closed').length;
    const remaining = tasks.filter(t => t.state === 'open').length;

    return {
      total: tasks.length,
      completed,
      inProgress: remaining, // open tasks are "in progress" or "to do"
      remaining,
      tasks,
    };
  });
}

// ---- Get Phase State -------------------------------------------------------

/**
 * Derive the lifecycle state of a phase from its sub-issue counts.
 *
 * State derivation:
 * - If all sub-issues are closed -> 'done'
 * - If some sub-issues are closed and some open -> 'in-progress'
 * - If no sub-issues exist or all are open -> 'to-do'
 *
 * Note: 'in-review' is determined by the project board column, not sub-issue
 * state. This function provides a quick approximation from sub-issue counts.
 * For authoritative 'in-review' detection, check the project board.
 *
 * @param phaseIssueNumber - The issue number of the phase tracking issue
 */
export async function getPhaseState(
  phaseIssueNumber: number,
): Promise<GhResult<'to-do' | 'in-progress' | 'in-review' | 'done'>> {
  const progressResult = await checkPhaseProgress(phaseIssueNumber);

  if (!progressResult.ok) {
    return progressResult;
  }

  const { total, completed } = progressResult.data;

  if (total === 0) {
    return { ok: true, data: 'to-do' };
  }

  if (completed === total) {
    return { ok: true, data: 'done' };
  }

  if (completed > 0) {
    return { ok: true, data: 'in-progress' };
  }

  return { ok: true, data: 'to-do' };
}

// ---- Detect Interrupted Phase ----------------------------------------------

/**
 * Detect whether a phase was interrupted during execution.
 *
 * CONTEXT.md decision: "Issue state is truth -- mix of open/closed sub-issues
 * indicates interrupted execution."
 *
 * A phase is considered interrupted if it has a mix of open and closed
 * sub-issues. This means some tasks completed but execution stopped before
 * all tasks finished.
 *
 * Returns the issue numbers of completed (closed) and remaining (open) tasks
 * for the resume logic (ARCH-05).
 *
 * @param phaseIssueNumber - The issue number of the phase tracking issue
 */
export async function detectInterruptedPhase(
  phaseIssueNumber: number,
): Promise<GhResult<{ interrupted: boolean; completedTasks: number[]; remainingTasks: number[] }>> {
  const progressResult = await checkPhaseProgress(phaseIssueNumber);

  if (!progressResult.ok) {
    return progressResult;
  }

  const { tasks, completed, total } = progressResult.data;

  // Interrupted = some completed AND some remaining (mix of open/closed)
  const interrupted = completed > 0 && completed < total;

  const completedTasks = tasks
    .filter(t => t.state === 'closed')
    .map(t => t.number);

  const remainingTasks = tasks
    .filter(t => t.state === 'open')
    .map(t => t.number);

  return {
    ok: true,
    data: {
      interrupted,
      completedTasks,
      remainingTasks,
    },
  };
}

// ---- Get All Phases Progress -----------------------------------------------

/**
 * Get progress for all phases by listing issues with the 'phase' label.
 *
 * Uses `octokit.paginate()` to list all issues with label 'phase', then
 * for each phase issue, fetches its sub-issue progress.
 *
 * Parses phase number from title pattern `[Phase XX]`.
 * Returns sorted by phase number.
 *
 * Note: Uses sequential API calls for sub-issue progress to avoid
 * rate limit issues with concurrent mutations (per plan constraint:
 * "Do NOT use Promise.all for multiple API calls with mutations").
 */
export async function getAllPhasesProgress(): Promise<
  GhResult<Array<{ phaseNumber: string; title: string; issueNumber: number; progress: PhaseProgress }>>
> {
  return withGhResult(async () => {
    const octokit = getOctokit();
    const { owner, repo } = await getRepoInfo();

    // List all issues with the 'phase' label using pagination
    const phaseIssues = await octokit.paginate(
      octokit.rest.issues.listForRepo,
      {
        owner,
        repo,
        labels: 'phase',
        state: 'all',
        per_page: 100,
      },
    );

    // Parse phase number from title and build results
    const results: Array<{
      phaseNumber: string;
      title: string;
      issueNumber: number;
      progress: PhaseProgress;
    }> = [];

    // Sequential API calls for sub-issue progress (per plan constraint)
    for (const issue of phaseIssues) {
      // Parse phase number from title: "[Phase 01] Phase Name" -> "01"
      const phaseMatch = issue.title.match(/\[Phase\s+(\w+)\]/i);
      if (!phaseMatch) {
        continue; // Skip issues that don't match the phase title pattern
      }

      const phaseNumber = phaseMatch[1];
      const progressResult = await checkPhaseProgress(issue.number);

      if (progressResult.ok) {
        results.push({
          phaseNumber,
          title: issue.title,
          issueNumber: issue.number,
          progress: progressResult.data,
        });
      }
    }

    // Sort by phase number
    results.sort((a, b) => {
      const numA = parseInt(a.phaseNumber, 10);
      const numB = parseInt(b.phaseNumber, 10);
      if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
        return numA - numB;
      }
      return a.phaseNumber.localeCompare(b.phaseNumber);
    });

    return results;
  });
}
