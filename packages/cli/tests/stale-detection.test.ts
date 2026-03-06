/**
 * Tests for stale context detection and milestone STATE.md reset.
 *
 * Uses real temp directories (same pattern as archive.test.ts).
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { cmdDetectStaleContext } from '../src/core/state.js';
import { cmdMilestoneComplete } from '../src/core/milestone.js';

const tempDirs: string[] = [];

function makeTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maxsim-stale-'));
  tempDirs.push(dir);
  fs.mkdirSync(path.join(dir, '.planning', 'phases'), { recursive: true });
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  tempDirs.length = 0;
});

const ROADMAP_WITH_COMPLETED = `# Roadmap

## v5.0 Context-Aware SDD

- [x] Phase 1: Foundation (completed 2026-01-15)
- [x] Phase 2: Core Features (completed 2026-02-01)
- [ ] Phase 3: Polish
- [ ] Phase 4: Launch
`;

const STATE_WITH_STALE = `# Project State

## Current Position

Phase: 3 of 4

## Accumulated Context

### Decisions

- [Phase 1]: Use JWT for auth -- chosen for simplicity
- [Phase 2]: PostgreSQL over MySQL -- better JSON support
- [Phase 3]: Redis caching -- performance requirement

### Blockers/Concerns

- [Phase 1]: Legacy migration blocker resolved
- Need to finalize API contracts

## Session Continuity

Last session: 2026-03-06
`;

const STATE_CLEAN = `# Project State

## Current Position

Phase: 3 of 4

## Accumulated Context

### Decisions

- [Phase 3]: Redis caching -- performance requirement

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-06
`;

describe('cmdDetectStaleContext', () => {
  it('returns clean: true when STATE.md has no references to completed phases', async () => {
    const cwd = makeTempProject();
    fs.writeFileSync(path.join(cwd, '.planning', 'ROADMAP.md'), ROADMAP_WITH_COMPLETED);
    fs.writeFileSync(path.join(cwd, '.planning', 'STATE.md'), STATE_CLEAN);

    const result = await cmdDetectStaleContext(cwd);
    expect(result.ok).toBe(true);
    const data = result.result as any;
    expect(data.clean).toBe(true);
    expect(data.stale_references).toHaveLength(0);
    expect(data.completed_phases).toEqual(['1', '2']);
  });

  it('detects stale decision referencing completed Phase 1', async () => {
    const cwd = makeTempProject();
    fs.writeFileSync(path.join(cwd, '.planning', 'ROADMAP.md'), ROADMAP_WITH_COMPLETED);
    fs.writeFileSync(path.join(cwd, '.planning', 'STATE.md'), STATE_WITH_STALE);

    const result = await cmdDetectStaleContext(cwd);
    const data = result.result as any;
    expect(data.clean).toBe(false);
    const phase1Decisions = data.stale_references.filter((r: any) => r.phase === '1' && r.section === 'Decisions');
    expect(phase1Decisions.length).toBeGreaterThanOrEqual(1);
  });

  it('detects stale blocker references to completed phases', async () => {
    const cwd = makeTempProject();
    fs.writeFileSync(path.join(cwd, '.planning', 'ROADMAP.md'), ROADMAP_WITH_COMPLETED);
    fs.writeFileSync(path.join(cwd, '.planning', 'STATE.md'), STATE_WITH_STALE);

    const result = await cmdDetectStaleContext(cwd);
    const data = result.result as any;
    const blockerRefs = data.stale_references.filter((r: any) => r.section === 'Blockers');
    expect(blockerRefs.length).toBeGreaterThanOrEqual(1);
    expect(blockerRefs[0].phase).toBe('1');
  });

  it('does NOT flag references to still-active phases', async () => {
    const cwd = makeTempProject();
    fs.writeFileSync(path.join(cwd, '.planning', 'ROADMAP.md'), ROADMAP_WITH_COMPLETED);
    fs.writeFileSync(path.join(cwd, '.planning', 'STATE.md'), STATE_WITH_STALE);

    const result = await cmdDetectStaleContext(cwd);
    const data = result.result as any;
    const phase3Refs = data.stale_references.filter((r: any) => r.phase === '3');
    expect(phase3Refs).toHaveLength(0);
  });

  it('returns multiple stale references when multiple completed phases are referenced', async () => {
    const cwd = makeTempProject();
    fs.writeFileSync(path.join(cwd, '.planning', 'ROADMAP.md'), ROADMAP_WITH_COMPLETED);
    fs.writeFileSync(path.join(cwd, '.planning', 'STATE.md'), STATE_WITH_STALE);

    const result = await cmdDetectStaleContext(cwd);
    const data = result.result as any;
    expect(data.stale_references.length).toBeGreaterThanOrEqual(3);
    const phases = new Set(data.stale_references.map((r: any) => r.phase));
    expect(phases.has('1')).toBe(true);
    expect(phases.has('2')).toBe(true);
  });
});

describe('cmdMilestoneComplete (updated)', () => {
  const MILESTONE_ROADMAP = `# Roadmap\n\n## v5.0 Test Milestone\n\n- [x] Phase 1: Done\n`;
  const MILESTONE_STATE = `# Project State\n\n## Current Position\n\n**Status:** executing\n**Last Activity:** 2026-03-01\n**Last Activity Description:** working\n\n## Accumulated Context\n\n### Decisions\n\n- Old decision about auth\n\n### Blockers/Concerns\n\nNone.\n`;

  it('saves STATE.md snapshot to .planning/archive/<milestone>/STATE.md', async () => {
    const cwd = makeTempProject();
    fs.writeFileSync(path.join(cwd, '.planning', 'ROADMAP.md'), MILESTONE_ROADMAP);
    fs.writeFileSync(path.join(cwd, '.planning', 'STATE.md'), MILESTONE_STATE);

    await cmdMilestoneComplete(cwd, 'v5.0', { name: 'Test' });
    const snapshot = fs.readFileSync(path.join(cwd, '.planning', 'archive', 'v5.0', 'STATE.md'), 'utf-8');
    expect(snapshot).toContain('Old decision about auth');
    expect(snapshot).toContain('Project State');
  });

  it('saves ROADMAP.md snapshot to .planning/archive/<milestone>/ROADMAP.md', async () => {
    const cwd = makeTempProject();
    fs.writeFileSync(path.join(cwd, '.planning', 'ROADMAP.md'), MILESTONE_ROADMAP);
    fs.writeFileSync(path.join(cwd, '.planning', 'STATE.md'), MILESTONE_STATE);

    await cmdMilestoneComplete(cwd, 'v5.0', { name: 'Test' });
    const snapshot = fs.readFileSync(path.join(cwd, '.planning', 'archive', 'v5.0', 'ROADMAP.md'), 'utf-8');
    expect(snapshot).toContain('v5.0 Test Milestone');
  });

  it('resets STATE.md to clean template after snapshot', async () => {
    const cwd = makeTempProject();
    fs.writeFileSync(path.join(cwd, '.planning', 'ROADMAP.md'), MILESTONE_ROADMAP);
    fs.writeFileSync(path.join(cwd, '.planning', 'STATE.md'), MILESTONE_STATE);

    await cmdMilestoneComplete(cwd, 'v5.0', { name: 'Next Release' });
    const resetState = fs.readFileSync(path.join(cwd, '.planning', 'STATE.md'), 'utf-8');
    expect(resetState).toContain('Next Release');
    expect(resetState).toContain('Phase: 0 of ? (not started)');
    expect(resetState).toContain('Status: planning');
  });

  it('reset STATE.md contains no decisions, blockers, or metrics from previous milestone', async () => {
    const cwd = makeTempProject();
    fs.writeFileSync(path.join(cwd, '.planning', 'ROADMAP.md'), MILESTONE_ROADMAP);
    fs.writeFileSync(path.join(cwd, '.planning', 'STATE.md'), MILESTONE_STATE);

    await cmdMilestoneComplete(cwd, 'v5.0', { name: 'Fresh' });
    const resetState = fs.readFileSync(path.join(cwd, '.planning', 'STATE.md'), 'utf-8');
    expect(resetState).not.toContain('Old decision');
    expect(resetState).toContain('### Decisions\n\nNone.');
    expect(resetState).toContain('### Blockers/Concerns\n\nNone.');
    expect(resetState).toContain('No plans executed yet');
  });

  it('uses .planning/archive/ path (not legacy .planning/milestones/)', async () => {
    const cwd = makeTempProject();
    fs.writeFileSync(path.join(cwd, '.planning', 'ROADMAP.md'), MILESTONE_ROADMAP);
    fs.writeFileSync(path.join(cwd, '.planning', 'STATE.md'), MILESTONE_STATE);

    await cmdMilestoneComplete(cwd, 'v5.0', { name: 'Test' });
    expect(fs.existsSync(path.join(cwd, '.planning', 'archive', 'v5.0', 'STATE.md'))).toBe(true);
    expect(fs.existsSync(path.join(cwd, '.planning', 'archive', 'v5.0', 'ROADMAP.md'))).toBe(true);
    // Should NOT create legacy milestones dir
    expect(fs.existsSync(path.join(cwd, '.planning', 'milestones'))).toBe(false);
  });
});
