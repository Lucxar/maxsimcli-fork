/**
 * GitHub Labels — Label creation and verification
 *
 * Manages MAXSIM-specific labels on the GitHub repository.
 * Labels are created idempotently using `--force` flag (updates existing).
 * Uses `gh label create` for each label.
 *
 * CRITICAL: Never import octokit or any npm GitHub SDK.
 * CRITICAL: Never call process.exit() — return GhResult instead.
 */

import type { GhResult } from './types.js';
import { MAXSIM_LABELS } from './types.js';
import { ghExec } from './gh.js';

// ---- Label Management ------------------------------------------------------

/**
 * Ensure all MAXSIM labels exist on the repository.
 *
 * Iterates over MAXSIM_LABELS and runs `gh label create` with `--force`
 * for each label. The `--force` flag updates existing labels with the
 * specified color and description.
 *
 * Continues on individual label failures (logs to stderr).
 * Only fails if ALL labels fail to create.
 */
export async function ensureLabels(): Promise<GhResult<void>> {
  let successCount = 0;
  const errors: string[] = [];

  for (const label of MAXSIM_LABELS) {
    const result = await ghExec<string>([
      'label', 'create', label.name,
      '--color', label.color,
      '--description', label.description,
      '--force',
    ]);

    if (result.ok) {
      successCount++;
    } else {
      // Log individual failure but continue
      const errMsg = result.error;
      console.error(`[maxsim] Failed to create label "${label.name}": ${errMsg}`);
      errors.push(`${label.name}: ${errMsg}`);
    }
  }

  // Only fail if ALL labels failed
  if (successCount === 0 && errors.length > 0) {
    return {
      ok: false,
      error: `All labels failed to create: ${errors.join('; ')}`,
      code: 'UNKNOWN',
    };
  }

  return { ok: true, data: undefined };
}

// Re-export MAXSIM_LABELS for convenience
export { MAXSIM_LABELS };
