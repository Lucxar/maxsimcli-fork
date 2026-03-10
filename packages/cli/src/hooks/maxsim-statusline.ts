#!/usr/bin/env node
/**
 * Claude Code Statusline - MAXSIM Edition
 * Shows: [update] model | P{N} | v{M}: {pct}% | dirname
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { readStdinJson, CLAUDE_DIR } from './shared';

export interface StatuslineInput {
  model?: { display_name?: string };
  workspace?: { current_dir?: string; project_dir?: string };
  session_id?: string;
}

export interface ProgressCache {
  phase_number: string | null;
  milestone_title: string | null;
  milestone_pct: number;
  updated: number;
}

const CACHE_TTL_SECONDS = 60;

/**
 * Spawn a detached Node child process to refresh the progress cache in the background.
 * The child runs gh CLI commands to detect owner/repo, find the first open milestone,
 * compute progress, and find the current phase label.
 */
function spawnBackgroundRefresh(cacheDir: string, cacheFile: string): void {
  try {
    const script = `
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try {
  // Detect owner/repo
  const nameWithOwner = execSync('gh repo view --json nameWithOwner -q .nameWithOwner', {
    encoding: 'utf8',
    timeout: 10000,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();

  if (!nameWithOwner || !nameWithOwner.includes('/')) {
    process.exit(0);
  }

  const [owner, repo] = nameWithOwner.split('/');

  // Get milestones
  let milestoneTitle = null;
  let milestonePct = 0;
  try {
    const milestonesRaw = execSync(
      'gh api repos/' + owner + '/' + repo + '/milestones --jq "."',
      { encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    if (milestonesRaw) {
      const milestones = JSON.parse(milestonesRaw);
      const openMilestone = milestones.find(function(m) { return m.state === 'open'; });
      if (openMilestone) {
        milestoneTitle = openMilestone.title || null;
        const total = (openMilestone.open_issues || 0) + (openMilestone.closed_issues || 0);
        if (total > 0) {
          milestonePct = Math.round(((openMilestone.closed_issues || 0) / total) * 100);
        }
      }
    }
  } catch (e) {
    // gh api failed for milestones, continue with defaults
  }

  // Get current phase from labels on open issues
  let phaseNumber = null;
  try {
    const phaseRaw = execSync(
      'gh api "repos/' + owner + '/' + repo + '/issues?state=open&labels=phase:&per_page=1&sort=created&direction=desc" --jq ".[0].labels[] | select(.name | startswith(\\"phase:\\")) | .name"',
      { encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    if (phaseRaw && phaseRaw.startsWith('phase:')) {
      phaseNumber = phaseRaw.replace('phase:', '').trim();
    }
  } catch (e) {
    // gh api failed for phase, continue with null
  }

  // Write cache
  const cacheData = JSON.stringify({
    phase_number: phaseNumber,
    milestone_title: milestoneTitle,
    milestone_pct: milestonePct,
    updated: Math.floor(Date.now() / 1000),
  });

  const dir = ${JSON.stringify(cacheDir)};
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(${JSON.stringify(cacheFile)}, cacheData);
} catch (e) {
  // Silently degrade if gh not available
  process.exit(0);
}
`;

    const child = execFile(
      process.execPath,
      ['-e', script],
      {
        timeout: 15000,
        windowsHide: true,
      },
    );
    // Detach: unref so parent does not wait
    child.unref();
  } catch {
    // Silent fail -- never break statusline
  }
}

export function formatStatusline(data: StatuslineInput): string {
  const model = data.model?.display_name || 'Claude';
  const dir = data.workspace?.project_dir || data.workspace?.current_dir || process.cwd();
  const dirname = path.basename(dir);

  const SEP = ' \u2502 ';
  const DIM = '\x1b[2m';
  const RESET = '\x1b[0m';

  // MAXSIM update available?
  let updateIndicator = '';
  const updateCacheFile = path.join(dir, CLAUDE_DIR, 'cache', 'maxsim-update-check.json');
  if (fs.existsSync(updateCacheFile)) {
    try {
      const cache = JSON.parse(fs.readFileSync(updateCacheFile, 'utf8'));
      if (cache.update_available) {
        updateIndicator = '\x1b[33m\u2B06\x1b[0m ';
      }
    } catch {
      // ignore
    }
  }

  // Check if this is a MAXSIM project
  const planningDir = path.join(dir, '.planning');
  const isMaxsimProject = fs.existsSync(planningDir);

  if (!isMaxsimProject) {
    return `${updateIndicator}${DIM}${model}${RESET}${SEP}${DIM}${dirname}${RESET}`;
  }

  // Read progress cache
  const cacheDir = path.join(dir, CLAUDE_DIR, 'cache');
  const cacheFile = path.join(cacheDir, 'maxsim-progress.json');
  let cache: ProgressCache | null = null;
  let cacheAge = Infinity;

  if (fs.existsSync(cacheFile)) {
    try {
      cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as ProgressCache;
      cacheAge = Math.floor(Date.now() / 1000) - (cache.updated || 0);
    } catch {
      cache = null;
    }
  }

  // Spawn background refresh if cache is stale or missing
  if (cacheAge > CACHE_TTL_SECONDS) {
    spawnBackgroundRefresh(cacheDir, cacheFile);
  }

  // Build phase segment
  let phaseSegment = '';
  if (cache?.phase_number) {
    phaseSegment = `${SEP}${DIM}P${cache.phase_number}${RESET}`;
  }

  // Build milestone segment
  let milestoneSegment = '';
  if (cache?.milestone_title) {
    milestoneSegment = `${SEP}${DIM}${cache.milestone_title}: ${cache.milestone_pct}%${RESET}`;
  }

  return `${updateIndicator}${DIM}${model}${RESET}${phaseSegment}${milestoneSegment}${SEP}${DIM}${dirname}${RESET}`;
}

// Standalone entry
if (require.main === module) {
  readStdinJson<StatuslineInput>((data) => {
    process.stdout.write(formatStatusline(data));
  });
}
