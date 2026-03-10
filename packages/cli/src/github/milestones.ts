/**
 * GitHub Milestones — CRUD operations for milestone management
 *
 * Manages GitHub milestones for MAXSIM milestone grouping.
 * One milestone per MAXSIM milestone. Uses the REST API via `gh api`
 * (simpler than GraphQL for milestone operations).
 *
 * Auto-closes milestones when all issues are closed (AC-12).
 *
 * CRITICAL: Never import octokit or any npm GitHub SDK.
 * CRITICAL: Never call process.exit() — return GhResult instead.
 */

import type { GhErrorCode, GhResult } from './types.js';
import { ghExec } from './gh-legacy.js';

// ---- Helpers ---------------------------------------------------------------

/**
 * Re-wrap a failed GhResult for a different generic type.
 */
function fail<T>(result: { ok: false; error: string; code: GhErrorCode }): GhResult<T> {
  return { ok: false, error: result.error, code: result.code };
}

// ---- Milestone CRUD --------------------------------------------------------

/**
 * Create a new GitHub milestone.
 *
 * Uses the REST API: `POST /repos/{owner}/{repo}/milestones`.
 * The `{owner}` and `{repo}` placeholders are auto-resolved by `gh api`.
 *
 * Returns the milestone number and internal ID.
 */
export async function createMilestone(
  title: string,
  description?: string,
): Promise<GhResult<{ number: number; id: number }>> {
  const args: string[] = [
    'api', 'repos/{owner}/{repo}/milestones',
    '-X', 'POST',
    '-f', `title=${title}`,
    '-f', 'state=open',
  ];

  // Only include description if provided (gh api -f sends empty string otherwise)
  if (description) {
    args.push('-f', `description=${description}`);
  }

  const result = await ghExec<{ number: number; id: number }>(args, { parseJson: true });

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    data: { number: result.data.number, id: result.data.id },
  };
}

/**
 * Find an existing milestone by title.
 *
 * Uses the REST API: `GET /repos/{owner}/{repo}/milestones`.
 * Fetches all open milestones and filters by exact title match.
 *
 * Returns null if no milestone with the given title exists.
 */
export async function findMilestone(
  title: string,
): Promise<GhResult<{ number: number; id: number } | null>> {
  // Fetch all open milestones (default state=open)
  const result = await ghExec<Array<{ number: number; id: number; title: string }>>(
    ['api', 'repos/{owner}/{repo}/milestones', '--paginate'],
    { parseJson: true },
  );

  if (!result.ok) {
    return fail(result);
  }

  const milestones = result.data;
  const match = milestones.find(m => m.title === title);

  if (!match) {
    return { ok: true, data: null };
  }

  return { ok: true, data: { number: match.number, id: match.id } };
}

/**
 * Ensure a milestone exists, creating it if needed. Idempotent.
 *
 * First attempts to find an existing milestone with the given title.
 * If not found, creates a new one. Returns whether it was newly created.
 */
export async function ensureMilestone(
  title: string,
  description?: string,
): Promise<GhResult<{ number: number; id: number; created: boolean }>> {
  // Try to find existing
  const findResult = await findMilestone(title);
  if (!findResult.ok) {
    return fail(findResult);
  }

  if (findResult.data) {
    return {
      ok: true,
      data: { ...findResult.data, created: false },
    };
  }

  // Create new milestone
  const createResult = await createMilestone(title, description);
  if (!createResult.ok) {
    return fail(createResult);
  }

  return {
    ok: true,
    data: { ...createResult.data, created: true },
  };
}

/**
 * Close a milestone if all its issues are closed.
 *
 * Fetches milestone details via REST API to check `open_issues` count.
 * If open_issues === 0, patches the milestone state to "closed".
 *
 * This implements AC-12: milestones auto-close when all issues are closed.
 */
export async function closeMilestoneIfComplete(
  milestoneNumber: number,
): Promise<GhResult<{ closed: boolean }>> {
  // Get milestone details to check open_issues count
  const detailResult = await ghExec<{
    number: number;
    open_issues: number;
    closed_issues: number;
    state: string;
  }>(
    ['api', `repos/{owner}/{repo}/milestones/${milestoneNumber}`],
    { parseJson: true },
  );

  if (!detailResult.ok) {
    return fail(detailResult);
  }

  const milestone = detailResult.data;

  // Already closed
  if (milestone.state === 'closed') {
    return { ok: true, data: { closed: true } };
  }

  // Still has open issues — don't close
  if (milestone.open_issues > 0) {
    return { ok: true, data: { closed: false } };
  }

  // All issues closed — close the milestone
  const closeResult = await ghExec<string>([
    'api', `repos/{owner}/{repo}/milestones/${milestoneNumber}`,
    '-X', 'PATCH',
    '-f', 'state=closed',
  ]);

  if (!closeResult.ok) {
    return fail(closeResult);
  }

  return { ok: true, data: { closed: true } };
}
