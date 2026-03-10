/**
 * GitHub Labels — Label creation and verification via Octokit
 *
 * Manages MAXSIM-specific labels (phase, task, blocker) on the GitHub repository.
 * Creates labels if they do not exist, updates them if color/description differ.
 *
 * CRITICAL: All operations use client.ts (Octokit adapter) exclusively.
 * CRITICAL: Never call process.exit() — return GhResult instead.
 */

import { RequestError } from '@octokit/request-error';

import type { GhResult } from './types.js';
import { MAXSIM_LABELS } from './types.js';
import { getOctokit, getRepoInfo, withGhResult } from './client.js';

// ---- Label Management ------------------------------------------------------

/**
 * Ensure all MAXSIM labels exist on the repository.
 *
 * For each label in MAXSIM_LABELS (phase, task, blocker):
 * - Try to fetch the label via `octokit.rest.issues.getLabel`
 * - If 404 (not found), create it via `octokit.rest.issues.createLabel`
 * - If it exists but color/description differ, update it via `octokit.rest.issues.updateLabel`
 *
 * Continues on individual label failures.
 * Only fails if ALL labels fail to create/update.
 */
export async function ensureLabels(): Promise<GhResult<void>> {
  return withGhResult(async () => {
    const octokit = getOctokit();
    const { owner, repo } = await getRepoInfo();

    let successCount = 0;
    const errors: string[] = [];

    for (const label of MAXSIM_LABELS) {
      try {
        // Try to get existing label
        let exists = false;
        let needsUpdate = false;

        try {
          const existing = await octokit.rest.issues.getLabel({
            owner,
            repo,
            name: label.name,
          });

          exists = true;

          // Check if color or description differ
          const currentColor = existing.data.color?.toLowerCase() ?? '';
          const targetColor = label.color.toLowerCase();
          const currentDesc = existing.data.description ?? '';

          if (currentColor !== targetColor || currentDesc !== label.description) {
            needsUpdate = true;
          }
        } catch (e: unknown) {
          if (e instanceof RequestError && e.status === 404) {
            // Label does not exist — will create below
            exists = false;
          } else {
            throw e;
          }
        }

        if (!exists) {
          // Create the label
          await octokit.rest.issues.createLabel({
            owner,
            repo,
            name: label.name,
            color: label.color,
            description: label.description,
          });
        } else if (needsUpdate) {
          // Update existing label to match desired color/description
          await octokit.rest.issues.updateLabel({
            owner,
            repo,
            name: label.name,
            color: label.color,
            description: label.description,
          });
        }

        successCount++;
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        errors.push(`${label.name}: ${message}`);
      }
    }

    // Only fail if ALL labels failed
    if (successCount === 0 && errors.length > 0) {
      throw new Error(`All labels failed to create/update: ${errors.join('; ')}`);
    }
  });
}

// Re-export MAXSIM_LABELS for convenience
export { MAXSIM_LABELS };
