/**
 * GitHub Milestones — CRUD operations via Octokit
 *
 * Manages GitHub milestones for MAXSIM milestone grouping.
 * One milestone per MAXSIM milestone. Uses Octokit REST API.
 *
 * CRITICAL: All operations use client.ts (Octokit adapter) exclusively.
 * CRITICAL: Never call process.exit() — return GhResult instead.
 */

import type { GhResult } from './types.js';
import { getOctokit, getRepoInfo, withGhResult } from './client.js';

// ---- Milestone CRUD --------------------------------------------------------

/**
 * Ensure a milestone exists with the given title, creating it if needed.
 *
 * 1. List existing milestones (state: 'all' to include closed ones)
 * 2. If one with matching title exists, return its number
 * 3. If not, create a new milestone
 *
 * Returns the milestone number.
 */
export async function ensureMilestone(
  title: string,
  description?: string,
): Promise<GhResult<{ number: number }>> {
  return withGhResult(async () => {
    const octokit = getOctokit();
    const { owner, repo } = await getRepoInfo();

    // List all milestones (open and closed) to find a match
    const milestones = await octokit.rest.issues.listMilestones({
      owner,
      repo,
      state: 'all',
      per_page: 100,
    });

    const match = milestones.data.find(m => m.title === title);

    if (match) {
      return { number: match.number };
    }

    // No match found — create a new milestone
    const created = await octokit.rest.issues.createMilestone({
      owner,
      repo,
      title,
      description: description ?? undefined,
    });

    return { number: created.data.number };
  });
}

/**
 * Close a milestone.
 *
 * Updates the milestone state to 'closed'.
 */
export async function closeMilestone(
  milestoneNumber: number,
): Promise<GhResult<void>> {
  return withGhResult(async () => {
    const octokit = getOctokit();
    const { owner, repo } = await getRepoInfo();

    await octokit.rest.issues.updateMilestone({
      owner,
      repo,
      milestone_number: milestoneNumber,
      state: 'closed',
    });
  });
}
