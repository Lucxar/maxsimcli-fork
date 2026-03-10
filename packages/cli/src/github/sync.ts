/**
 * GitHub Sync — Detect external changes to tracked issues
 *
 * Compares local mapping file (github-issues.json) against actual GitHub state.
 * Uses batched GraphQL queries for efficiency (avoids N+1 sequential calls).
 *
 * CRITICAL: Never import octokit or any npm GitHub SDK.
 * CRITICAL: Never call process.exit() — return GhResult instead.
 */

import type { GhErrorCode, GhResult, IssueStatus } from './types.js';
import { ghGraphQL, ghExec } from './gh-legacy.js';
import { loadMapping } from './mapping.js';

// ---- Helpers ---------------------------------------------------------------

/**
 * Re-wrap a failed GhResult for a different generic type.
 */
function fail<T>(result: { ok: false; error: string; code: GhErrorCode }): GhResult<T> {
  return { ok: false, error: result.error, code: result.code };
}

// ---- Types -----------------------------------------------------------------

export interface SyncChange {
  issueNumber: number;
  field: string;
  localValue: string;
  remoteValue: string;
}

export interface SyncCheckResult {
  inSync: boolean;
  changes: SyncChange[];
}

export interface VerifyIssueStateResult {
  verified: boolean;
  actualState: string;
}

export interface HandleExternalCloseResult {
  action: 'accepted' | 'reopened';
  reason: string;
}

// ---- Batch GraphQL Issue Fetch ---------------------------------------------

interface GraphQLIssueNode {
  number: number;
  state: string;
  title: string;
  labels: { nodes: Array<{ name: string }> };
}

/**
 * Batch-fetch issue details via a single GraphQL query.
 *
 * Fetches up to 100 issues per query using node ID lookups.
 * Falls back to sequential `gh issue view` if GraphQL fails.
 */
async function batchFetchIssues(
  repo: string,
  issueNumbers: number[],
): Promise<GhResult<Map<number, { state: string; title: string; labels: string[] }>>> {
  if (issueNumbers.length === 0) {
    return { ok: true, data: new Map() };
  }

  // Split owner/repo
  const [owner, name] = repo.split('/');
  if (!owner || !name) {
    return {
      ok: false,
      error: `Invalid repo format: ${repo}. Expected "owner/repo".`,
      code: 'UNKNOWN',
    };
  }

  // Build GraphQL query with aliases for each issue
  // GitHub GraphQL limits: we query up to 100 issues at a time
  const BATCH_SIZE = 100;
  const resultMap = new Map<number, { state: string; title: string; labels: string[] }>();

  for (let i = 0; i < issueNumbers.length; i += BATCH_SIZE) {
    const batch = issueNumbers.slice(i, i + BATCH_SIZE);

    const issueFragments = batch
      .map(
        (num, idx) =>
          `issue_${idx}: issue(number: ${num}) { number state title labels(first: 20) { nodes { name } } }`,
      )
      .join('\n    ');

    const query = `
      query {
        repository(owner: "${owner}", name: "${name}") {
          ${issueFragments}
        }
      }
    `;

    const result = await ghGraphQL<{
      repository: Record<string, GraphQLIssueNode | null>;
    }>(query);

    if (!result.ok) {
      // Fall back to sequential fetching on GraphQL failure
      return batchFetchIssuesSequential(issueNumbers);
    }

    const repoData = result.data.repository;
    for (let idx = 0; idx < batch.length; idx++) {
      const issueData = repoData[`issue_${idx}`];
      if (issueData) {
        resultMap.set(issueData.number, {
          state: issueData.state.toLowerCase(),
          title: issueData.title,
          labels: issueData.labels.nodes.map(l => l.name),
        });
      }
    }
  }

  return { ok: true, data: resultMap };
}

/**
 * Sequential fallback: fetch issues one at a time via `gh issue view`.
 */
async function batchFetchIssuesSequential(
  issueNumbers: number[],
): Promise<GhResult<Map<number, { state: string; title: string; labels: string[] }>>> {
  const resultMap = new Map<number, { state: string; title: string; labels: string[] }>();

  for (const num of issueNumbers) {
    const result = await ghExec<{
      state: string;
      title: string;
      labels: Array<{ name: string }>;
    }>(['issue', 'view', String(num), '--json', 'state,title,labels'], {
      parseJson: true,
    });

    if (result.ok) {
      resultMap.set(num, {
        state: result.data.state.toLowerCase(),
        title: result.data.title,
        labels: result.data.labels.map(l => l.name),
      });
    }
    // Skip issues that fail to fetch (may have been deleted)
  }

  return { ok: true, data: resultMap };
}

// ---- Public API ------------------------------------------------------------

/**
 * Compare local mapping file against GitHub reality.
 *
 * For each tracked issue (phases + todos), fetches current GitHub state
 * and compares against the local mapping. Reports discrepancies in
 * state, title, and labels.
 *
 * Uses batched GraphQL for efficiency (single query for up to 100 issues).
 */
export async function syncCheck(
  cwd: string,
): Promise<GhResult<SyncCheckResult>> {
  const mapping = loadMapping(cwd);
  if (!mapping) {
    return {
      ok: false,
      error: 'github-issues.json does not exist. Run project setup first.',
      code: 'NOT_FOUND',
    };
  }

  if (!mapping.repo) {
    return {
      ok: false,
      error: 'No repo configured in github-issues.json.',
      code: 'NOT_FOUND',
    };
  }

  // Collect all tracked issue numbers with their local status
  const trackedIssues: Array<{
    issueNumber: number;
    localStatus: IssueStatus;
    source: string; // e.g., "phase 01, task 1.1" or "todo xyz"
  }> = [];

  // Phases
  for (const [phaseNum, phase] of Object.entries(mapping.phases)) {
    if (phase.tracking_issue.number > 0) {
      trackedIssues.push({
        issueNumber: phase.tracking_issue.number,
        localStatus: phase.tracking_issue.status,
        source: `phase ${phaseNum} tracking`,
      });
    }
    for (const [taskId, task] of Object.entries(phase.tasks)) {
      if (task.number > 0) {
        trackedIssues.push({
          issueNumber: task.number,
          localStatus: task.status,
          source: `phase ${phaseNum}, task ${taskId}`,
        });
      }
    }
  }

  // Todos
  if (mapping.todos) {
    for (const [todoId, todo] of Object.entries(mapping.todos)) {
      if (todo.number > 0) {
        trackedIssues.push({
          issueNumber: todo.number,
          localStatus: todo.status,
          source: `todo ${todoId}`,
        });
      }
    }
  }

  if (trackedIssues.length === 0) {
    return {
      ok: true,
      data: { inSync: true, changes: [] },
    };
  }

  // Batch-fetch all issue states from GitHub
  const issueNumbers = trackedIssues.map(t => t.issueNumber);
  const fetchResult = await batchFetchIssues(mapping.repo, issueNumbers);
  if (!fetchResult.ok) {
    return fail(fetchResult);
  }

  const remoteStates = fetchResult.data;
  const changes: SyncChange[] = [];

  for (const tracked of trackedIssues) {
    const remote = remoteStates.get(tracked.issueNumber);
    if (!remote) {
      // Issue not found on GitHub (may have been deleted)
      changes.push({
        issueNumber: tracked.issueNumber,
        field: 'existence',
        localValue: 'exists',
        remoteValue: 'not found',
      });
      continue;
    }

    // Compare state: map GitHub state to expected local status
    // GitHub states: "open" or "closed"
    // Local statuses: "To Do", "In Progress", "In Review", "Done"
    const isRemoteClosed = remote.state === 'closed';
    const isLocalDone = tracked.localStatus === 'Done';

    if (isRemoteClosed && !isLocalDone) {
      changes.push({
        issueNumber: tracked.issueNumber,
        field: 'state',
        localValue: tracked.localStatus,
        remoteValue: 'closed (Done)',
      });
    } else if (!isRemoteClosed && isLocalDone) {
      changes.push({
        issueNumber: tracked.issueNumber,
        field: 'state',
        localValue: 'Done',
        remoteValue: `open (${remote.state})`,
      });
    }
  }

  return {
    ok: true,
    data: {
      inSync: changes.length === 0,
      changes,
    },
  };
}

/**
 * Quick single-issue state check.
 *
 * Verifies whether an issue is in the expected state (open or closed).
 */
export async function verifyIssueState(
  issueNumber: number,
  expectedState: 'open' | 'closed',
): Promise<GhResult<VerifyIssueStateResult>> {
  const result = await ghExec<{ state: string }>(
    ['issue', 'view', String(issueNumber), '--json', 'state'],
    { parseJson: true },
  );

  if (!result.ok) {
    return fail(result);
  }

  const actualState = result.data.state.toLowerCase();

  return {
    ok: true,
    data: {
      verified: actualState === expectedState,
      actualState,
    },
  };
}

/**
 * Handle an externally closed issue: provide data for the AI to decide.
 *
 * When sync detects an externally closed issue, this function gathers
 * the context needed for the AI to decide whether to accept the close
 * (if the code actually implements the task) or reopen it.
 *
 * Does NOT auto-decide — returns data for AI decision-making.
 */
export async function handleExternalClose(
  cwd: string,
  issueNumber: number,
): Promise<GhResult<{ action: 'accepted' | 'reopened'; reason: string }>> {
  // Fetch the issue details and closing context
  const issueResult = await ghExec<{
    state: string;
    stateReason: string;
    title: string;
    body: string;
    closedBy: { login: string } | null;
  }>(
    [
      'issue',
      'view',
      String(issueNumber),
      '--json',
      'state,stateReason,title,body,closedBy',
    ],
    { parseJson: true },
  );

  if (!issueResult.ok) {
    return fail(issueResult);
  }

  const issue = issueResult.data;

  if (issue.state.toLowerCase() !== 'closed') {
    return {
      ok: true,
      data: {
        action: 'reopened',
        reason: `Issue #${issueNumber} is not closed (state: ${issue.state}). No action needed.`,
      },
    };
  }

  // Gather context about who closed it and why
  const closedBy = issue.closedBy?.login ?? 'unknown';
  const stateReason = issue.stateReason || 'completed';

  // Return data for AI to decide
  // The AI will check the codebase to determine if the task is truly complete
  return {
    ok: true,
    data: {
      action: 'accepted',
      reason: `Issue #${issueNumber} "${issue.title}" was closed externally by ${closedBy} (reason: ${stateReason}). AI should verify code implements the task before accepting.`,
    },
  };
}
