/**
 * Milestone — Milestone and requirements lifecycle operations
 *
 * Ported from maxsim/bin/lib/milestone.cjs
 */

import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';

import { planningPath, roadmapPath as roadmapPathUtil, statePath as statePathUtil, phasesPath, todayISO, listSubDirs, isPlanFile, isSummaryFile, findPhaseInternal, debugLog, archivePath as archivePathHelper, pathExistsInternal, safeReadFile } from './core.js';
import { extractFrontmatter } from './frontmatter.js';
import type {
  CmdResult,
  MilestoneCompleteOptions,
  MilestoneResult,
  ArchiveResult,
} from './types.js';
import { cmdOk, cmdErr } from './types.js';

// ─── Requirements commands ───────────────────────────────────────────────────

export function cmdRequirementsMarkComplete(cwd: string, reqIdsRaw: string[]): CmdResult {
  if (!reqIdsRaw || reqIdsRaw.length === 0) {
    return cmdErr('requirement IDs required. Usage: requirements mark-complete REQ-01,REQ-02 or REQ-01 REQ-02');
  }

  const reqIds = reqIdsRaw
    .join(' ')
    .replace(/[\[\]]/g, '')
    .split(/[,\s]+/)
    .map(r => r.trim())
    .filter(Boolean);

  if (reqIds.length === 0) {
    return cmdErr('no valid requirement IDs found');
  }

  const reqPath = planningPath(cwd, 'REQUIREMENTS.md');
  if (!fs.existsSync(reqPath)) {
    return cmdOk({ updated: false, reason: 'REQUIREMENTS.md not found', ids: reqIds }, 'no requirements file');
  }

  let reqContent = fs.readFileSync(reqPath, 'utf-8');
  const updated: string[] = [];
  const notFound: string[] = [];

  for (const reqId of reqIds) {
    let found = false;

    const checkboxPattern = new RegExp(`(-\\s*\\[)[ ](\\]\\s*\\*\\*${reqId}\\*\\*)`, 'gi');
    if (checkboxPattern.test(reqContent)) {
      reqContent = reqContent.replace(checkboxPattern, '$1x$2');
      found = true;
    }

    const tablePattern = new RegExp(`(\\|\\s*${reqId}\\s*\\|[^|]+\\|)\\s*Pending\\s*(\\|)`, 'gi');
    if (tablePattern.test(reqContent)) {
      reqContent = reqContent.replace(
        new RegExp(`(\\|\\s*${reqId}\\s*\\|[^|]+\\|)\\s*Pending\\s*(\\|)`, 'gi'),
        '$1 Complete $2'
      );
      found = true;
    }

    if (found) {
      updated.push(reqId);
    } else {
      notFound.push(reqId);
    }
  }

  if (updated.length > 0) {
    fs.writeFileSync(reqPath, reqContent, 'utf-8');
  }

  const result: ArchiveResult = {
    updated: updated.length > 0,
    marked_complete: updated,
    not_found: notFound,
    total: reqIds.length,
  };

  return cmdOk(result, `${updated.length}/${reqIds.length} requirements marked complete`);
}

// ─── Milestone commands ──────────────────────────────────────────────────────

export async function cmdMilestoneComplete(
  cwd: string,
  version: string | undefined,
  options: MilestoneCompleteOptions,
): Promise<CmdResult> {
  if (!version) {
    return cmdErr('version required for milestone complete (e.g., v1.0)');
  }

  const roadmapPath = roadmapPathUtil(cwd);
  const reqPath = planningPath(cwd, 'REQUIREMENTS.md');
  const statePath = statePathUtil(cwd);
  const milestonesPath = planningPath(cwd, 'MILESTONES.md');
  const archiveDir = await archivePathHelper(cwd, version);
  const phasesDir = phasesPath(cwd);
  const today = todayISO();
  const milestoneName = options.name || version;

  await fsp.mkdir(archiveDir, { recursive: true });

  let phaseCount = 0;
  let totalPlans = 0;
  let totalTasks = 0;
  const accomplishments: string[] = [];

  // Try GitHub first for phase/plan/task counts
  let usedGitHubCounts = false;
  try {
    const { loadMapping } = await import('../github/mapping.js');
    const mapping = loadMapping(cwd);
    if (mapping && Object.keys(mapping.phases).length > 0) {
      const { getAllPhasesProgress } = await import('../github/sync.js');
      const ghResult = await getAllPhasesProgress();
      if (ghResult.ok && ghResult.data.length > 0) {
        for (const p of ghResult.data) {
          phaseCount++;
          totalPlans += p.progress.total;
          totalTasks += p.progress.total; // Each sub-issue is a task
        }
        usedGitHubCounts = true;
      }
    }
  } catch (e) {
    // GitHub not available — fall through to local
    debugLog('milestone-complete-github-fallback', e);
  }

  // Local scanning: needed for accomplishments (frontmatter extraction from local archive files).
  // Plan/summary counts come from GitHub exclusively.
  try {
    const dirs = await listSubDirs(phasesDir, true);

    for (const dir of dirs) {
      if (!usedGitHubCounts) {
        phaseCount++;
      }
      // Use findPhaseInternal (GitHub-first) for summary discovery
      const dm = dir.match(/^(\d+[A-Z]?(?:\.\d+)?)/i);
      if (!dm) continue;
      const phaseInfo = await findPhaseInternal(cwd, dm[1]);
      if (!phaseInfo) continue;

      if (!usedGitHubCounts) {
        totalPlans += phaseInfo.plans.length;
      }

      for (const s of phaseInfo.summaries) {
        try {
          const summaryPath = path.join(phasesDir, dir, s);
          if (!fs.existsSync(summaryPath)) continue;
          const content = await fsp.readFile(summaryPath, 'utf-8');
          const fm = extractFrontmatter(content);
          if (fm['one-liner']) {
            accomplishments.push(String(fm['one-liner']));
          }
          if (!usedGitHubCounts) {
            const taskMatches = content.match(/##\s*Task\s*\d+/gi) || [];
            totalTasks += taskMatches.length;
          }
        } catch (e) {
          debugLog(e);
        }
      }
    }
  } catch (e) {
    debugLog(e);
  }

  // Snapshot STATE.md and ROADMAP.md to archive before any modifications
  const stateExists = await pathExistsInternal(statePath);
  if (stateExists) {
    const stateContent = await fsp.readFile(statePath, 'utf-8');
    await fsp.writeFile(path.join(archiveDir, 'STATE.md'), stateContent, 'utf-8');
  }

  const roadmapExists = await pathExistsInternal(roadmapPath);
  if (roadmapExists) {
    const roadmapContent = await fsp.readFile(roadmapPath, 'utf-8');
    await fsp.writeFile(path.join(archiveDir, 'ROADMAP.md'), roadmapContent, 'utf-8');
  }

  // Archive REQUIREMENTS.md
  if (await pathExistsInternal(reqPath)) {
    const reqContent = await fsp.readFile(reqPath, 'utf-8');
    const archiveHeader = `# Requirements Archive: ${version} ${milestoneName}\n\n**Archived:** ${today}\n**Status:** SHIPPED\n\nFor current requirements, see \`.planning/REQUIREMENTS.md\`.\n\n---\n\n`;
    await fsp.writeFile(path.join(archiveDir, `${version}-REQUIREMENTS.md`), archiveHeader + reqContent, 'utf-8');
  }

  // Archive audit file if exists
  const auditFile = path.join(cwd, '.planning', `${version}-MILESTONE-AUDIT.md`);
  if (await pathExistsInternal(auditFile)) {
    await fsp.rename(auditFile, path.join(archiveDir, `${version}-MILESTONE-AUDIT.md`));
  }

  // Create/append MILESTONES.md entry
  const accomplishmentsList = accomplishments.map(a => `- ${a}`).join('\n');
  const milestoneEntry = `## ${version} ${milestoneName} (Shipped: ${today})\n\n**Phases completed:** ${phaseCount} phases, ${totalPlans} plans, ${totalTasks} tasks\n\n**Key accomplishments:**\n${accomplishmentsList || '- (none recorded)'}\n\n---\n\n`;

  if (await pathExistsInternal(milestonesPath)) {
    const existing = await fsp.readFile(milestonesPath, 'utf-8');
    await fsp.writeFile(milestonesPath, existing + '\n' + milestoneEntry, 'utf-8');
  } else {
    await fsp.writeFile(milestonesPath, `# Milestones\n\n${milestoneEntry}`, 'utf-8');
  }

  // Reset STATE.md to clean template
  if (stateExists) {
    const newMilestoneName = options.name || 'Next milestone';
    const cleanState = `# Project State

## Project Reference

See: .planning/PROJECT.md (updated ${today})

## Current Position

Milestone: ${newMilestoneName}
Phase: 0 of ? (not started)
Status: planning
Last activity: ${today}

## Performance Metrics

No plans executed yet in this milestone.

## Accumulated Context

### Decisions

None.

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: ${today}
`;
    await fsp.writeFile(statePath, cleanState, 'utf-8');
  }

  // Archive phase directories if requested
  let phasesArchived = false;
  if (options.archivePhases) {
    try {
      const phaseArchiveDir = path.join(archiveDir, 'phases');
      await fsp.mkdir(phaseArchiveDir, { recursive: true });

      const phaseDirNames = await listSubDirs(phasesDir);
      for (const dir of phaseDirNames) {
        await fsp.rename(path.join(phasesDir, dir), path.join(phaseArchiveDir, dir));
      }
      phasesArchived = phaseDirNames.length > 0;
    } catch (e) {
      debugLog(e);
    }
  }

  const result: MilestoneResult = {
    version,
    name: milestoneName,
    date: today,
    phases: phaseCount,
    plans: totalPlans,
    tasks: totalTasks,
    accomplishments,
    archived: {
      roadmap: await pathExistsInternal(path.join(archiveDir, 'ROADMAP.md')),
      requirements: await pathExistsInternal(path.join(archiveDir, `${version}-REQUIREMENTS.md`)),
      audit: await pathExistsInternal(path.join(archiveDir, `${version}-MILESTONE-AUDIT.md`)),
      phases: phasesArchived,
      state_snapshot: await pathExistsInternal(path.join(archiveDir, 'STATE.md')),
      roadmap_snapshot: await pathExistsInternal(path.join(archiveDir, 'ROADMAP.md')),
    },
    milestones_updated: true,
    state_updated: stateExists,
    state_reset: stateExists,
  };

  return cmdOk(result);
}
