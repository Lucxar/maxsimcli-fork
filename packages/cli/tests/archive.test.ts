/**
 * Tests for phase archive functions: archivePhasePreview, archivePhaseExecute, cmdGetArchivedPhase.
 *
 * Uses real temp directories (same pattern as phase-errors.test.ts).
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  archivePhasePreview,
  archivePhaseExecute,
  cmdGetArchivedPhase,
} from '../src/core/phase.js';

// Track temp dirs for cleanup
const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maxsim-archive-test-'));
  tempDirs.push(dir);
  return dir;
}

function scaffoldPlanning(
  cwd: string,
  opts: {
    roadmap?: string;
    state?: string;
    phases?: Record<string, Record<string, string>>;
    archive?: Record<string, Record<string, Record<string, string>>>;
    milestones?: Record<string, Record<string, Record<string, string>>>;
  } = {},
): void {
  const planningDir = path.join(cwd, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });

  if (opts.roadmap !== undefined) {
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), opts.roadmap);
  }
  if (opts.state !== undefined) {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), opts.state);
  }
  if (opts.phases) {
    const phasesDir = path.join(planningDir, 'phases');
    fs.mkdirSync(phasesDir, { recursive: true });
    for (const [dirName, files] of Object.entries(opts.phases)) {
      const phaseDir = path.join(phasesDir, dirName);
      fs.mkdirSync(phaseDir, { recursive: true });
      for (const [fileName, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(phaseDir, fileName), content);
      }
    }
  }
  if (opts.archive) {
    for (const [milestone, phases] of Object.entries(opts.archive)) {
      const msDir = path.join(planningDir, 'archive', milestone);
      for (const [phaseName, files] of Object.entries(phases)) {
        const phaseDir = path.join(msDir, phaseName);
        fs.mkdirSync(phaseDir, { recursive: true });
        for (const [fileName, content] of Object.entries(files)) {
          fs.writeFileSync(path.join(phaseDir, fileName), content);
        }
      }
    }
  }
  if (opts.milestones) {
    for (const [milestoneName, phases] of Object.entries(opts.milestones)) {
      const msDir = path.join(planningDir, 'milestones', milestoneName);
      for (const [phaseName, files] of Object.entries(phases)) {
        const phaseDir = path.join(msDir, phaseName);
        fs.mkdirSync(phaseDir, { recursive: true });
        for (const [fileName, content] of Object.entries(files)) {
          fs.writeFileSync(path.join(phaseDir, fileName), content);
        }
      }
    }
  }
}

afterEach(() => {
  for (const dir of tempDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
  tempDirs.length = 0;
});

const ROADMAP_FIXTURE = `# Roadmap

## Milestone

- [ ] **v5.0 Context-Aware SDD** -- Phases 1-3 (active)

## Phases

- [ ] **Phase 1: Context Rot Prevention** - Auto-prune completed phases
- [ ] **Phase 2: Deep Init** - Better init flow
- [ ] **Phase 3: Agent Coherence** - Agent coordination

## Phase Details

### Phase 1: Context Rot Prevention
**Goal**: Prevent context rot
**Depends on**: Nothing
**Requirements**: ROT-01
**Plans**: 1 plan
  - [ ] 01-01: Phase archive sweep

### Phase 2: Deep Init
**Goal**: Better init
**Depends on**: Phase 1

### Phase 3: Agent Coherence
**Goal**: Agent coordination
**Depends on**: Phase 2
`;

const STATE_FIXTURE = `# Project State

## Current Position

Phase: 1

## Accumulated Context

### Decisions

- [Phase 1]: Use archive path .planning/archive/
- [Phase 1]: Preview before execute
- **Clean slate**: All v4 docs rewritten
- [Phase 2]: Deep init approach

### Blockers/Concerns

- [Phase 1]: Need to handle EXDEV errors
- No concerns at this time
`;

// ─── archivePhasePreview ────────────────────────────────────────────────────

describe('archivePhasePreview', () => {
  it('returns preview with correct archive destination path', async () => {
    const cwd = makeTempDir();
    scaffoldPlanning(cwd, {
      roadmap: ROADMAP_FIXTURE,
      state: STATE_FIXTURE,
      phases: {
        '01-Context-Rot-Prevention': { '01-01-PLAN.md': '', '01-01-SUMMARY.md': '' },
      },
    });

    const result = await archivePhasePreview(cwd, '1', 'Phase archive sweep implemented');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.result as Record<string, unknown>;
      expect(data.archive_dir).toContain('archive');
      expect(data.archive_dir).toContain('01-Context-Rot-Prevention');
    }
  });

  it('identifies phase-specific decisions to prune', async () => {
    const cwd = makeTempDir();
    scaffoldPlanning(cwd, {
      roadmap: ROADMAP_FIXTURE,
      state: STATE_FIXTURE,
      phases: {
        '01-Context-Rot-Prevention': { '01-01-PLAN.md': '' },
      },
    });

    const result = await archivePhasePreview(cwd, '1', 'Done');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.result as Record<string, unknown>;
      const decisions = data.decisions_to_prune as string[];
      expect(decisions.length).toBe(2);
      expect(decisions[0]).toContain('[Phase 1]');
      expect(decisions[1]).toContain('[Phase 1]');
    }
  });

  it('does NOT identify untagged decisions for pruning', async () => {
    const cwd = makeTempDir();
    scaffoldPlanning(cwd, {
      roadmap: ROADMAP_FIXTURE,
      state: STATE_FIXTURE,
      phases: {
        '01-Context-Rot-Prevention': { '01-01-PLAN.md': '' },
      },
    });

    const result = await archivePhasePreview(cwd, '1', 'Done');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.result as Record<string, unknown>;
      const decisions = data.decisions_to_prune as string[];
      // Should NOT include "Clean slate" or "Phase 2" decisions
      for (const d of decisions) {
        expect(d).not.toContain('Clean slate');
        expect(d).not.toContain('[Phase 2]');
      }
    }
  });

  it('identifies phase-specific blockers to prune', async () => {
    const cwd = makeTempDir();
    scaffoldPlanning(cwd, {
      roadmap: ROADMAP_FIXTURE,
      state: STATE_FIXTURE,
      phases: {
        '01-Context-Rot-Prevention': { '01-01-PLAN.md': '' },
      },
    });

    const result = await archivePhasePreview(cwd, '1', 'Done');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.result as Record<string, unknown>;
      const blockers = data.blockers_to_prune as string[];
      expect(blockers.length).toBe(1);
      expect(blockers[0]).toContain('[Phase 1]');
    }
  });

  it('returns correct collapsed ROADMAP line format', async () => {
    const cwd = makeTempDir();
    scaffoldPlanning(cwd, {
      roadmap: ROADMAP_FIXTURE,
      state: STATE_FIXTURE,
      phases: {
        '01-Context-Rot-Prevention': { '01-01-PLAN.md': '' },
      },
    });

    const result = await archivePhasePreview(cwd, '1', 'Archive sweep implemented');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.result as Record<string, unknown>;
      expect(data.collapsed_line).toBe('- [x] Phase 1: Context Rot Prevention -- Archive sweep implemented');
    }
  });
});

// ─── archivePhaseExecute ────────────────────────────────────────────────────

describe('archivePhaseExecute', () => {
  it('creates archive directory and moves phase dir', async () => {
    const cwd = makeTempDir();
    // Init git repo for execGit
    fs.mkdirSync(path.join(cwd, '.git'), { recursive: true });
    scaffoldPlanning(cwd, {
      roadmap: ROADMAP_FIXTURE,
      state: STATE_FIXTURE,
      phases: {
        '01-Context-Rot-Prevention': { '01-01-PLAN.md': 'plan content', '01-01-SUMMARY.md': 'summary content' },
        '02-Deep-Init': { '.gitkeep': '' },
      },
    });

    const result = await archivePhaseExecute(cwd, '1', 'Archive sweep done');
    expect(result.ok).toBe(true);

    // Phase dir should be moved
    expect(fs.existsSync(path.join(cwd, '.planning', 'phases', '01-Context-Rot-Prevention'))).toBe(false);
    // Archive should exist
    const archiveBase = path.join(cwd, '.planning', 'archive');
    expect(fs.existsSync(archiveBase)).toBe(true);
    // Find the milestone dir inside archive
    const archiveDirs = fs.readdirSync(archiveBase);
    expect(archiveDirs.length).toBeGreaterThan(0);
    const msDir = archiveDirs[0];
    expect(fs.existsSync(path.join(archiveBase, msDir, '01-Context-Rot-Prevention', '01-01-PLAN.md'))).toBe(true);
  });

  it('removes phase-tagged decisions from STATE.md, leaves untagged', async () => {
    const cwd = makeTempDir();
    fs.mkdirSync(path.join(cwd, '.git'), { recursive: true });
    scaffoldPlanning(cwd, {
      roadmap: ROADMAP_FIXTURE,
      state: STATE_FIXTURE,
      phases: {
        '01-Context-Rot-Prevention': { '01-01-PLAN.md': '' },
        '02-Deep-Init': { '.gitkeep': '' },
      },
    });

    await archivePhaseExecute(cwd, '1', 'Done');

    const stateContent = fs.readFileSync(path.join(cwd, '.planning', 'STATE.md'), 'utf-8');
    // Phase 1 decisions should be gone
    expect(stateContent).not.toContain('[Phase 1]');
    // Untagged and Phase 2 decisions should remain
    expect(stateContent).toContain('Clean slate');
    expect(stateContent).toContain('[Phase 2]');
  });

  it('inserts "None." when decisions section becomes empty after pruning', async () => {
    const cwd = makeTempDir();
    fs.mkdirSync(path.join(cwd, '.git'), { recursive: true });
    const stateWithOnlyPhase1 = `# State

### Decisions

- [Phase 1]: Only decision here

### Blockers/Concerns

None.
`;
    scaffoldPlanning(cwd, {
      roadmap: ROADMAP_FIXTURE,
      state: stateWithOnlyPhase1,
      phases: {
        '01-Context-Rot-Prevention': { '01-01-PLAN.md': '' },
        '02-Deep-Init': { '.gitkeep': '' },
      },
    });

    await archivePhaseExecute(cwd, '1', 'Done');

    const stateContent = fs.readFileSync(path.join(cwd, '.planning', 'STATE.md'), 'utf-8');
    expect(stateContent).toContain('None.');
    expect(stateContent).not.toContain('[Phase 1]');
  });

  it('removes detail section from ROADMAP.md and updates checklist line to [x]', async () => {
    const cwd = makeTempDir();
    fs.mkdirSync(path.join(cwd, '.git'), { recursive: true });
    scaffoldPlanning(cwd, {
      roadmap: ROADMAP_FIXTURE,
      state: STATE_FIXTURE,
      phases: {
        '01-Context-Rot-Prevention': { '01-01-PLAN.md': '' },
        '02-Deep-Init': { '.gitkeep': '' },
      },
    });

    await archivePhaseExecute(cwd, '1', 'Archive sweep done');

    const rmContent = fs.readFileSync(path.join(cwd, '.planning', 'ROADMAP.md'), 'utf-8');
    // Detail section should be gone
    expect(rmContent).not.toContain('### Phase 1:');
    expect(rmContent).not.toContain('Prevent context rot');
    // Checklist line should be collapsed
    expect(rmContent).toContain('- [x] Phase 1:');
    expect(rmContent).toContain('Archive sweep done');
    // Other phases should remain
    expect(rmContent).toContain('### Phase 2:');
    expect(rmContent).toContain('### Phase 3:');
  });

  it('returns error if phase directory not found', async () => {
    const cwd = makeTempDir();
    scaffoldPlanning(cwd, {
      roadmap: ROADMAP_FIXTURE,
      state: STATE_FIXTURE,
      phases: {},
    });

    const result = await archivePhaseExecute(cwd, '99', 'Does not exist');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Phase 99 not found');
    }
  });
});

// ─── cmdGetArchivedPhase ────────────────────────────────────────────────────

describe('cmdGetArchivedPhase', () => {
  it('returns archived phase content when found in .planning/archive/', async () => {
    const cwd = makeTempDir();
    scaffoldPlanning(cwd, {
      archive: {
        'v5.0': {
          '01-Context-Rot-Prevention': {
            '01-01-PLAN.md': 'plan content here',
            '01-01-SUMMARY.md': 'summary content here',
          },
        },
      },
    });

    const result = await cmdGetArchivedPhase(cwd, '1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.result as Record<string, unknown>;
      expect(data.milestone).toBe('v5.0');
      const contents = data.contents as Record<string, string>;
      expect(contents['01-01-PLAN.md']).toBe('plan content here');
      expect(contents['01-01-SUMMARY.md']).toBe('summary content here');
    }
  });

  it('returns archived phase content when found in legacy .planning/milestones/ path', async () => {
    const cwd = makeTempDir();
    scaffoldPlanning(cwd, {
      milestones: {
        'v4.0-phases': {
          '03-Old-Phase': {
            '03-01-PLAN.md': 'old plan',
            '03-01-SUMMARY.md': 'old summary',
          },
        },
      },
    });

    const result = await cmdGetArchivedPhase(cwd, '3');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.result as Record<string, unknown>;
      expect(data.milestone).toBe('v4.0-phases');
      const contents = data.contents as Record<string, string>;
      expect(contents['03-01-PLAN.md']).toBe('old plan');
    }
  });

  it('returns error when phase not found in either location', async () => {
    const cwd = makeTempDir();
    scaffoldPlanning(cwd, {});

    const result = await cmdGetArchivedPhase(cwd, '99');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('not found in archive');
    }
  });
});
