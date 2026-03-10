/**
 * GitHub Integration -- Barrel export
 *
 * Re-exports all GitHub modules for convenient access.
 * Import from '../github/index.js' to get everything.
 *
 * All modules use the Octokit-based adapter (client.ts) exclusively.
 */

export * from './types.js';
export * from './client.js';
export * from './mapping.js';
export * from './issues.js';
export * from './projects.js';
export * from './labels.js';
export * from './milestones.js';
export * from './templates.js';
export * from './sync.js';
