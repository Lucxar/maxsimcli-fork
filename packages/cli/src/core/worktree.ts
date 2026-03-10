/**
 * Worktree — Git worktree lifecycle management for parallel execution
 *
 * Provides functions to create, list, cleanup worktrees and to assign
 * plans to worktree slots for batch execution.
 */

import fs from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';

import type {
  WorktreeInfo,
  WorktreeAssignment,
  WorktreeMode,
  ExecutionMode,
  CmdResult,
} from './types.js';
import { cmdOk, cmdErr } from './types.js';
import { debugLog, errorMsg } from './core.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const WORKTREE_DIR = '.maxsim-worktrees';
const WORKTREE_BRANCH_PREFIX = 'maxsim/worktree';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Ensure .maxsim-worktrees/ directory exists */
function ensureWorktreeDir(cwd: string): string {
  const dir = path.join(cwd, WORKTREE_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Add .maxsim-worktrees/ to .gitignore if not already present */
function ensureGitignoreEntry(cwd: string): void {
  const gitignorePath = path.join(cwd, '.gitignore');
  const entry = WORKTREE_DIR + '/';

  try {
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      if (content.includes(WORKTREE_DIR)) return;
      fs.appendFileSync(gitignorePath, '\n' + entry + '\n', 'utf-8');
    } else {
      fs.writeFileSync(gitignorePath, entry + '\n', 'utf-8');
    }
  } catch (e) {
    debugLog('worktree-gitignore-failed', errorMsg(e));
  }
}

// ─── Core functions ──────────────────────────────────────────────────────────

/**
 * Create a new git worktree for a plan.
 * Branch: maxsim/worktree-{phaseNum}-{planId}
 * Path: {cwd}/.maxsim-worktrees/{planId}
 */
export async function createWorktree(
  cwd: string,
  phaseNum: string,
  planId: string,
  wave: number,
): Promise<WorktreeInfo> {
  ensureWorktreeDir(cwd);
  ensureGitignoreEntry(cwd);

  const branch = `${WORKTREE_BRANCH_PREFIX}-${phaseNum}-${planId}`;
  const worktreePath = path.join(cwd, WORKTREE_DIR, planId);

  const git = simpleGit(cwd);

  try {
    // Create worktree with a new branch from HEAD
    await git.raw(['worktree', 'add', '-b', branch, worktreePath]);
  } catch (e) {
    const msg = errorMsg(e);
    // If branch already exists, try without -b
    if (msg.includes('already exists')) {
      try {
        await git.raw(['worktree', 'add', worktreePath, branch]);
      } catch (e2) {
        throw new Error(`Failed to create worktree: ${errorMsg(e2)}`);
      }
    } else {
      throw new Error(`Failed to create worktree: ${msg}`);
    }
  }

  const info: WorktreeInfo = {
    id: planId,
    path: worktreePath,
    branch,
    wave,
    plan_id: planId,
    status: 'active',
    created_at: new Date().toISOString(),
  };

  return info;
}

/**
 * List all MAXSIM-managed worktrees.
 * Parses `git worktree list --porcelain` and filters to .maxsim-worktrees/.
 */
export async function listWorktrees(cwd: string): Promise<WorktreeInfo[]> {
  const git = simpleGit(cwd);
  const worktrees: WorktreeInfo[] = [];

  try {
    const raw = await git.raw(['worktree', 'list', '--porcelain']);
    const blocks = raw.split('\n\n').filter(b => b.trim());

    for (const block of blocks) {
      const lines = block.split('\n');
      let wtPath = '';
      let branch = '';

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          wtPath = line.slice('worktree '.length).trim();
        } else if (line.startsWith('branch ')) {
          branch = line.slice('branch '.length).trim().replace('refs/heads/', '');
        }
      }

      // Only include worktrees under .maxsim-worktrees/
      if (!wtPath || !wtPath.includes(WORKTREE_DIR)) continue;

      const planId = path.basename(wtPath);
      worktrees.push({
        id: planId,
        path: wtPath,
        branch,
        wave: 0, // Wave info not stored in git metadata; caller provides
        plan_id: planId,
        status: 'active',
        created_at: '', // Not available from git porcelain output
      });
    }
  } catch (e) {
    debugLog('worktree-list-failed', errorMsg(e));
  }

  return worktrees;
}

/**
 * Remove a single worktree by its ID (directory name under .maxsim-worktrees/).
 * Removes the worktree and deletes the branch.
 */
export async function cleanupWorktree(cwd: string, worktreeId: string): Promise<void> {
  const git = simpleGit(cwd);
  const worktreePath = path.join(cwd, WORKTREE_DIR, worktreeId);

  try {
    await git.raw(['worktree', 'remove', worktreePath]);
  } catch (e) {
    const msg = errorMsg(e);
    debugLog('worktree-remove-failed', msg);
    // Force remove if locked
    try {
      await git.raw(['worktree', 'remove', '--force', worktreePath]);
    } catch (e2) {
      debugLog('worktree-force-remove-failed', errorMsg(e2));
      // Last resort: manual cleanup
      try {
        if (fs.existsSync(worktreePath)) {
          fs.rmSync(worktreePath, { recursive: true, force: true });
        }
        await git.raw(['worktree', 'prune']);
      } catch (e3) {
        throw new Error(`Failed to cleanup worktree ${worktreeId}: ${errorMsg(e3)}`);
      }
    }
  }

  // Delete the associated branch
  try {
    // Find branch name matching this worktree ID
    const branches = await git.raw(['branch', '--list', `${WORKTREE_BRANCH_PREFIX}-*${worktreeId}*`]);
    const branchName = branches.trim().replace(/^\*?\s*/, '').split('\n')[0]?.trim();
    if (branchName) {
      await git.raw(['branch', '-D', branchName]);
    }
  } catch (e) {
    debugLog('worktree-branch-delete-failed', errorMsg(e));
    // Branch cleanup is best-effort
  }
}

/**
 * Remove all MAXSIM-managed worktrees.
 * Returns the count of worktrees removed.
 */
export async function cleanupAllWorktrees(cwd: string): Promise<number> {
  const worktrees = await listWorktrees(cwd);
  let removed = 0;

  for (const wt of worktrees) {
    try {
      await cleanupWorktree(cwd, wt.id);
      removed++;
    } catch (e) {
      debugLog('worktree-cleanup-failed', { id: wt.id, error: errorMsg(e) });
    }
  }

  // Clean up the directory if empty
  const worktreeDir = path.join(cwd, WORKTREE_DIR);
  try {
    if (fs.existsSync(worktreeDir)) {
      const remaining = fs.readdirSync(worktreeDir);
      if (remaining.length === 0) {
        fs.rmSync(worktreeDir, { recursive: true, force: true });
      }
    }
  } catch (e) {
    debugLog('worktree-dir-cleanup-failed', errorMsg(e));
  }

  return removed;
}

/**
 * Pure function: assign plans to worktree slots.
 * Given plans and max parallel count, assigns plans to worktree slots.
 * If plans.length > maxParallel, batches them.
 * Returns assignment array without creating worktrees.
 */
export function assignPlansToWorktrees(
  plans: Array<{ id: string; wave: number }>,
  maxParallel: number,
): WorktreeAssignment[] {
  const assignments: WorktreeAssignment[] = [];

  for (const plan of plans) {
    // Create a placeholder WorktreeInfo (actual worktree created later)
    const worktree: WorktreeInfo = {
      id: plan.id,
      path: '', // Resolved at creation time
      branch: '', // Resolved at creation time
      wave: plan.wave,
      plan_id: plan.id,
      status: 'active',
      created_at: '',
    };

    assignments.push({
      plan_id: plan.id,
      worktree,
      wave: plan.wave,
    });
  }

  // If more plans than max parallel, mark overflow for sequential batching
  // The caller handles actual batching; we just provide the assignments
  if (assignments.length > maxParallel) {
    debugLog('worktree-overflow', `${assignments.length} plans exceed max_parallel=${maxParallel}, caller should batch`);
  }

  return assignments;
}

/**
 * Pure function: decide whether to use batch (worktree) or standard execution mode.
 *
 * Returns 'batch' if:
 * - flagOverride is 'worktrees', OR
 * - worktree_mode is 'always', OR
 * - worktree_mode is 'auto' AND waveCount === 1 AND planCount > 2
 *
 * Returns 'standard' if:
 * - flagOverride is 'no-worktrees', OR
 * - worktree_mode is 'never', OR
 * - auto-detect doesn't trigger
 */
export function decideExecutionMode(
  planCount: number,
  waveCount: number,
  config: { worktree_mode: WorktreeMode; flagOverride?: 'worktrees' | 'no-worktrees' },
): ExecutionMode {
  // Explicit flag overrides everything
  if (config.flagOverride === 'worktrees') return 'batch';
  if (config.flagOverride === 'no-worktrees') return 'standard';

  // Config-based decision
  if (config.worktree_mode === 'always') return 'batch';
  if (config.worktree_mode === 'never') return 'standard';

  // Auto-detect: single wave with 3+ plans
  if (config.worktree_mode === 'auto' && waveCount === 1 && planCount > 2) {
    return 'batch';
  }

  return 'standard';
}

/**
 * Pure function: validate that plans are independent (no file overlaps).
 * Returns conflicts if any file appears in multiple plans.
 */
export function validatePlanIndependence(
  plans: Array<{ id: string; files_modified: string[] }>,
): { valid: boolean; conflicts: Array<{ file: string; plans: string[] }> } {
  const fileMap = new Map<string, string[]>();

  for (const plan of plans) {
    for (const file of plan.files_modified) {
      const normalized = file.replace(/\\/g, '/');
      const existing = fileMap.get(normalized) || [];
      existing.push(plan.id);
      fileMap.set(normalized, existing);
    }
  }

  const conflicts: Array<{ file: string; plans: string[] }> = [];
  for (const [file, planIds] of fileMap) {
    if (planIds.length > 1) {
      conflicts.push({ file, plans: planIds });
    }
  }

  return {
    valid: conflicts.length === 0,
    conflicts,
  };
}

// ─── CLI command wrappers ────────────────────────────────────────────────────

export async function cmdWorktreeCreate(
  cwd: string,
  phaseNum: string | undefined,
  planId: string | undefined,
  wave: string | undefined,
): Promise<CmdResult> {
  if (!phaseNum) return cmdErr('phaseNum required for worktree-create');
  if (!planId) return cmdErr('planId required for worktree-create');
  const waveNum = wave ? parseInt(wave, 10) : 1;

  try {
    const info = await createWorktree(cwd, phaseNum, planId, waveNum);
    return cmdOk(info);
  } catch (e) {
    return cmdErr(`worktree-create failed: ${errorMsg(e)}`);
  }
}

export async function cmdWorktreeList(cwd: string): Promise<CmdResult> {
  try {
    const worktrees = await listWorktrees(cwd);
    return cmdOk(worktrees);
  } catch (e) {
    return cmdErr(`worktree-list failed: ${errorMsg(e)}`);
  }
}

export async function cmdWorktreeCleanup(
  cwd: string,
  worktreeId: string | undefined,
  all: boolean,
): Promise<CmdResult> {
  try {
    if (all) {
      const count = await cleanupAllWorktrees(cwd);
      return cmdOk({ removed: count, all: true });
    }
    if (!worktreeId) return cmdErr('worktreeId required for worktree-cleanup (or use --all)');
    await cleanupWorktree(cwd, worktreeId);
    return cmdOk({ removed: 1, worktree_id: worktreeId });
  } catch (e) {
    return cmdErr(`worktree-cleanup failed: ${errorMsg(e)}`);
  }
}

export function cmdDecideExecutionMode(
  planCount: string | undefined,
  waveCount: string | undefined,
  worktreeMode: string | undefined,
  flagOverride: string | undefined,
): CmdResult {
  if (!planCount || !waveCount) return cmdErr('planCount and waveCount required');

  const mode = decideExecutionMode(
    parseInt(planCount, 10),
    parseInt(waveCount, 10),
    {
      worktree_mode: (worktreeMode as WorktreeMode) || 'auto',
      flagOverride: flagOverride as 'worktrees' | 'no-worktrees' | undefined,
    },
  );
  return cmdOk({ mode });
}

export function cmdValidatePlanIndependence(plansJson: string | undefined): CmdResult {
  if (!plansJson) return cmdErr('plans JSON required');

  try {
    const plans = JSON.parse(plansJson) as Array<{ id: string; files_modified: string[] }>;
    const result = validatePlanIndependence(plans);
    return cmdOk(result);
  } catch (e) {
    return cmdErr(`validate-plan-independence failed: ${errorMsg(e)}`);
  }
}
