# Stack Research: Safe Refactoring & Test Infrastructure

**Domain:** TypeScript codebase refactoring, unit testing for CLI modules with heavy file I/O and git operations
**Project:** MAXSIM v5.1 Surgical Cleanup
**Researched:** 2026-03-08
**Confidence:** HIGH (verified via npm, official docs, and codebase analysis)

## Executive Summary

This research targets the tooling and patterns needed to safely refactor large monolithic TypeScript modules (phase.ts at 1193 lines, init.ts at 1060 lines, verify.ts at 965 lines) and add comprehensive unit tests where none exist today. The existing stack (TypeScript 5.9.3, Vitest 4.0.18, Biome 2.4.4, tsdown) is solid and needs no replacement -- the focus is on additive tooling for safety nets (coverage, dead code detection) and testing patterns for modules that do heavy `node:fs` and `simple-git` operations.

The codebase already has a clean `CmdResult` return pattern in newer modules. The refactoring work is primarily about: (1) finishing the migration from thrown `CliOutput`/`CliError` exceptions to `CmdResult` returns in the remaining modules, (2) extracting duplicated helpers like `loadJsonFile()` and phase-dir resolution, and (3) adding unit tests using real temp directories (the established pattern) supplemented by `memfs` for edge cases.

---

## Recommended Stack

### Core Technologies (Already In Place -- No Changes)

| Technology | Version | Purpose | Status |
|------------|---------|---------|--------|
| TypeScript | 5.9.3 | Type safety, compile-time refactor verification | KEEP -- `strict: true` already enabled |
| Vitest | 4.0.18 | Test runner, mocking, assertions | KEEP -- already in use |
| Biome | 2.4.4 | Linting | KEEP -- needs rule additions (see below) |
| tsdown | 0.20.3 | Bundling CLI and hooks | KEEP -- no interaction with refactoring |
| Node.js | 22+ | Runtime | KEEP |

[CONFIDENCE: HIGH -- versions verified against package.json in codebase]

### New Development Dependencies to Add

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| `@vitest/coverage-v8` | 4.0.18 | Code coverage reporting | V8 provider is fast, zero-config with Vitest 4.x, AST-accurate since v3.2. Matches Vitest version exactly. Required to measure test coverage before and after adding tests. |
| `knip` | 5.86.x | Dead code, unused export, unused dependency detection | Industry standard for TS dead code analysis. Has built-in Vitest plugin. Finds unused files, exports, dependencies, and types. Critical for the "remove dead code" objective. |
| `memfs` | 4.x | In-memory filesystem for test isolation | Official Vitest-recommended approach for mocking `node:fs`. Enables testing error paths (ENOENT, EACCES, ENOSPC) without real disk. Supplements the existing temp-dir pattern. |

[CONFIDENCE: HIGH -- versions verified via npm registry search results]

### What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `mock-fs` | Abandoned since 2023, incompatible with ESM and Node 22 | `memfs` (actively maintained, 4.56.x) |
| `ts-prune` | Maintenance mode, recommends Knip as successor | `knip` |
| `tsr` (TypeScript Remove) | Project ended, recommends Knip | `knip` |
| `jest` | Vitest already in place, Jest would add confusion | Vitest 4.0.18 (already installed) |
| `c8` / `nyc` | Separate coverage tools, Vitest has built-in V8 provider | `@vitest/coverage-v8` |
| `proxyquire` / `rewire` | CJS-era dependency injection hacks | Vitest `vi.mock()` / `vi.spyOn()` |
| `sinon` | Vitest has built-in spy/stub/mock API | `vi.fn()`, `vi.spyOn()`, `vi.mock()` |
| `eslint` + `@typescript-eslint/*` | Biome already handles linting, adding ESLint creates tooling duplication | Enable stricter Biome rules instead |

---

## Installation

```bash
# New dev dependencies (add to root package.json or packages/cli)
npm install -D @vitest/coverage-v8@^4.0.18 knip memfs

# No new runtime dependencies needed
```

---

## TypeScript Compiler Configuration for Safe Refactoring

### Current Config Assessment

The existing `tsconfig.base.json` already has `"strict": true` which enables all the critical flags:
- `noImplicitAny` -- catches untyped variables during extraction
- `strictNullChecks` -- catches null/undefined after changing return types
- `strictFunctionTypes` -- catches function signature mismatches after refactoring
- `noImplicitReturns` -- catches missing return paths in extracted functions

[CONFIDENCE: HIGH -- verified from tsconfig.base.json in codebase]

### Recommended Additional Flags

Add these to `tsconfig.base.json` to catch more refactoring regressions:

```jsonc
{
  "compilerOptions": {
    // Already set:
    "strict": true,

    // ADD these for refactoring safety:
    "noUnusedLocals": true,           // Catch variables left behind after extraction
    "noUnusedParameters": true,       // Catch parameters that become unused after refactoring
    "exactOptionalPropertyTypes": true, // Distinguish undefined from missing (catches CmdResult field bugs)
    "noUncheckedIndexedAccess": true   // Forces null checks on array/object indexing
  }
}
```

**Why each matters for this refactoring:**

| Flag | Refactoring Scenario It Catches |
|------|-------------------------------|
| `noUnusedLocals` | When extracting `loadJsonFile()`, leftover variables in the original site become unused -- compiler flags them immediately |
| `noUnusedParameters` | When unifying function signatures across init.ts's 20 `cmdInit*` functions, parameters that become unnecessary are caught |
| `exactOptionalPropertyTypes` | The `CmdResult` type has `rawValue?: unknown` -- this flag ensures `undefined` and "missing" are handled correctly |
| `noUncheckedIndexedAccess` | phase.ts does extensive array indexing on directory listings and plan files -- this catches potential undefined access |

**Implementation note:** Enable these flags BEFORE starting the refactoring, not after. They serve as a safety net during extraction. If enabling them produces too many errors to fix at once, add them to a separate `tsconfig.strict.json` and run `tsc --project tsconfig.strict.json --noEmit` as a CI check.

[CONFIDENCE: HIGH -- these are standard TypeScript compiler options, verified against TS 5.9 docs]

---

## Vitest Configuration for Coverage

### Coverage Setup

Update `packages/cli/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30_000,
    exclude: ['tests/e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json-summary'],
      include: ['src/core/**/*.ts'],
      exclude: [
        'src/core/index.ts',       // Re-export barrel, no logic
        'src/core/types.ts',        // Type-only, no runtime code
      ],
      thresholds: {
        // Start low, ratchet up as tests are added
        statements: 30,
        branches: 25,
        functions: 30,
        lines: 30,
      },
    },
  },
});
```

**Run with:** `npx vitest run --coverage`

The V8 provider is recommended over Istanbul because it is faster, uses less memory, and since Vitest 3.2+ produces AST-accurate reports matching Istanbul quality. No separate instrumentation step needed.

[CONFIDENCE: HIGH -- verified via Vitest coverage documentation]

---

## Testing Patterns for Core Modules

### Pattern 1: Real Temp Directories (EXISTING -- Keep Using)

The codebase already uses this pattern in `phase-errors.test.ts` and `core-errors.test.ts`. This is the RIGHT default for MAXSIM because the modules under test create real directories, write real files, and read real markdown. Mocking all of that would be fragile.

```typescript
// Already established pattern -- continue using for phase.ts, verify.ts, init.ts
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach } from 'vitest';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maxsim-test-'));
  tempDirs.push(dir);
  return dir;
}

function scaffoldPlanning(cwd: string, opts: {
  roadmap?: string;
  state?: string;
  phases?: Record<string, string[]>;
  config?: Record<string, unknown>;
} = {}): void {
  const planningDir = path.join(cwd, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  if (opts.roadmap) fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), opts.roadmap);
  if (opts.state) fs.writeFileSync(path.join(planningDir, 'STATE.md'), opts.state);
  if (opts.config) {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify(opts.config));
  }
  if (opts.phases) {
    const phasesDir = path.join(planningDir, 'phases');
    fs.mkdirSync(phasesDir, { recursive: true });
    for (const [dirName, files] of Object.entries(opts.phases)) {
      const phaseDir = path.join(phasesDir, dirName);
      fs.mkdirSync(phaseDir, { recursive: true });
      for (const file of files) {
        fs.writeFileSync(path.join(phaseDir, file), '');
      }
    }
  }
}

afterEach(() => {
  for (const dir of tempDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
  tempDirs.length = 0;
});
```

**When to use:** Happy-path tests, integration-style unit tests, anything that exercises real file I/O paths.

### Pattern 2: memfs for Error Simulation (NEW -- Add for Edge Cases)

Use `memfs` when you need to simulate filesystem errors that are hard to reproduce with real files:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fs, vol } from 'memfs';

// Hoist the mock so it applies before module import
vi.mock('node:fs', async () => {
  const memfs = await vi.importActual<typeof import('memfs')>('memfs');
  return memfs.fs;
});

vi.mock('node:fs/promises', async () => {
  const memfs = await vi.importActual<typeof import('memfs')>('memfs');
  return memfs.fs.promises;
});

beforeEach(() => {
  vol.reset();
});

describe('error conditions', () => {
  it('handles corrupted JSON gracefully', () => {
    vol.fromJSON({ '/project/.planning/config.json': '{invalid json!!!' });
    // Now test loadConfig('/project') -- it reads from memfs
  });

  it('handles permission errors', () => {
    // Create a file then make it unreadable via mock
    vol.fromJSON({ '/project/.planning/ROADMAP.md': '# Roadmap' });
    // Override readFileSync to throw EACCES for specific path
  });
});
```

**When to use:** Error path testing (corrupted files, permission denied, disk full), testing modules that read many files where setting up real temp dirs is verbose, and testing cross-platform path edge cases.

**Important caveat:** The existing codebase imports `fs` in two ways -- `import fs from 'node:fs'` (sync, used in init.ts, verify.ts, core.ts) and `import { promises as fsp } from 'node:fs'` (async, used in phase.ts, state.ts). When using memfs mocking, BOTH must be mocked. The mock files approach (`__mocks__/fs.cjs`) handles this globally, but per-file `vi.mock()` is more explicit and recommended for this codebase where only some test files need it.

### Pattern 3: Mocking `simple-git` for Git Operations

The `core.ts` module uses `simple-git` for git operations (`execGit`). For unit tests of modules that call `execGit`, mock it at the module level:

```typescript
import { vi, describe, it, expect } from 'vitest';

// Mock the simple-git module
vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => ({
    raw: vi.fn().mockResolvedValue(''),
    log: vi.fn().mockResolvedValue({ all: [] }),
    diff: vi.fn().mockResolvedValue(''),
  })),
}));

// Or more targeted: mock just execGit from core.ts
vi.mock('../../src/core/core.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/core.js')>();
  return {
    ...actual,
    execGit: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
  };
});
```

**When to use:** Testing `phase.ts` functions that call `execGit` (like `phaseCompleteCore` which runs git log), testing `verify.ts` functions that check commit existence.

### Pattern 4: Testing Pure Functions Directly (No Mocking Needed)

Many functions in the target modules are pure string-processing functions that need no mocking at all. The existing `state-errors.test.ts` demonstrates this perfectly -- it tests `stateExtractField`, `stateReplaceField`, and `appendToStateSection` with just string inputs and assertions.

Identify and prioritize these for testing first:

**In verify.ts:**
- `cmdVerifyPlanStructure` -- reads a file then does regex/string parsing. Can test the parsing logic by providing file content directly.
- `cmdVerifyReferences` -- validates markdown references. Pure logic after file read.

**In init.ts:**
- All 20 `cmdInit*` functions -- they call `loadConfig()`, `findPhaseInternal()`, then construct a context object. Mock just those two dependencies.

**In phase.ts:**
- `scaffoldPhaseStubs` -- creates files in a directory. Test with real temp dir.
- `phaseAddCore`, `phaseInsertCore` -- read/write ROADMAP.md. Test with real temp dir (already partially tested in `phase-errors.test.ts`).

---

## Biome Configuration Enhancements

The current Biome config has `"recommended": false` which disables all rules. For safe refactoring, enable targeted rules that catch common extraction bugs:

```jsonc
// biome.json -- add to linter.rules
{
  "linter": {
    "rules": {
      "recommended": false,
      "suspicious": {
        "noExplicitAny": "warn",           // Flag remaining `any` types during refactoring
        "noFallthroughSwitchClause": "error", // cli.ts has a massive switch
        "noDuplicateCase": "error"
      },
      "correctness": {
        "noUnusedImports": "error",         // Catch dead imports after extraction
        "noUnusedVariables": "warn"          // Catch dead variables after extraction
      },
      "style": {
        "noDefaultExport": "warn"           // Prefer named exports for tree-shaking and refactoring
      },
      "complexity": {
        "noExcessiveCognitiveComplexity": "warn"  // Flag functions that need splitting
      }
    }
  }
}
```

[CONFIDENCE: HIGH -- Biome 2.4.4 rule names verified via biomejs.dev docs]

---

## Knip Configuration for Dead Code Detection

Create `knip.json` at the repo root:

```json
{
  "workspaces": {
    "packages/cli": {
      "entry": ["src/cli.ts", "src/install.ts", "src/mcp-server.ts", "src/backend-server.ts"],
      "project": ["src/**/*.ts"],
      "ignore": ["src/**/*.test.ts", "dist/**"]
    }
  },
  "ignoreDependencies": ["@types/*"]
}
```

**Run with:** `npx knip`

Knip will report:
- Unused exported functions (critical for identifying dead code in the 4 unused workflow files mentioned in PROJECT.md)
- Unused dependencies in package.json
- Unused files that are never imported
- Unused types and interfaces

**Add to package.json scripts:**
```json
{
  "scripts": {
    "knip": "knip",
    "knip:fix": "knip --fix"
  }
}
```

[CONFIDENCE: HIGH -- Knip has built-in Vitest and npm workspaces plugins]

---

## Trade-Off Matrix

### Testing Strategy: Real Temp Dirs vs memfs

| Option | Pros | Cons | Risk | Effort |
|--------|------|------|------|--------|
| Real temp dirs only (current) | Realistic, tests actual I/O, no mock setup | Slower, harder to simulate errors, Windows path issues | LOW | S |
| memfs only | Fast, isolated, error simulation | Diverges from real behavior, complex mock setup for multi-module | MED | M |
| Hybrid (recommended) | Best of both: real dirs for happy paths, memfs for error paths | Two patterns to maintain, team must know when to use which | LOW | M |

### Error Handling Migration: Big Bang vs Incremental

| Option | Pros | Cons | Risk | Effort |
|--------|------|------|------|--------|
| Big bang (convert all at once) | Consistent codebase immediately | High blast radius, hard to review, risky | HIGH | L |
| Incremental per-module (recommended) | Each PR is reviewable, tests added alongside | Temporary inconsistency between modules | LOW | M |
| Adapter layer (wrap old in new) | Zero changes to existing code | Adds complexity, defers real cleanup | MED | S |

### Coverage Tool: V8 vs Istanbul

| Option | Pros | Cons | Risk | Effort |
|--------|------|------|------|--------|
| V8 (recommended) | Fast, low memory, accurate since Vitest 3.2+, zero-config | Slightly less granular branch coverage in edge cases | LOW | S |
| Istanbul | Gold standard accuracy, proven | Slower, requires instrumentation step, more memory | LOW | S |

---

## Decision Rationale

### Recommendation: Hybrid testing (real temp dirs + memfs) over pure mocking

**Why:** The codebase modules read/write real markdown files with specific directory structures. Pure mocking would require replicating the entire `.planning/` directory abstraction in mocks, which is fragile and would break whenever the directory structure changes. Real temp dirs test the actual I/O paths. memfs supplements for error simulation only.

**When to reconsider:** If tests become too slow (>30s for unit suite), shift more tests to memfs. Currently the existing temp-dir tests are fast.

### Recommendation: @vitest/coverage-v8 over Istanbul

**Why:** V8 provider is built into Vitest, requires no separate config, and since Vitest 3.2+ has AST-accurate remapping that matches Istanbul quality. The project already uses Vitest 4.0.18 which includes all V8 accuracy improvements. One less dependency to manage.

**When to reconsider:** If coverage reports show suspicious gaps in branch coverage for complex switch statements (unlikely with current V8 accuracy).

### Recommendation: Knip over manual dead code analysis

**Why:** The project has 4 known unused workflow files and unknown unused exports across 17 core modules (8693 lines total). Manual analysis is error-prone and slow. Knip does static analysis across the full dependency graph in seconds and has built-in Vitest and npm workspaces plugins, matching this project's exact toolchain.

**When to reconsider:** If Knip produces excessive false positives due to the markdown template files (which are not TypeScript imports). The `ignoreDependencies` and `ignore` config should handle this.

### Recommendation: Incremental error-handling migration over big bang

**Why:** Converting all 15+ modules from CliOutput/CliError throws to CmdResult returns in one PR is high-risk because `cli.ts` catches those exceptions at the top level. An incremental approach -- convert one module at a time, update cli.ts dispatch for that module, add tests -- is safer and reviewable. The `CmdResult` pattern already dominates (299 usages of cmdOk/cmdErr across 17 files vs 18 total CliOutput/CliError references across 4 files), so the migration is nearly complete.

**When to reconsider:** If the remaining CliOutput/CliError usages are all in a single dispatch path in cli.ts, a single PR might be cleaner.

---

## Code Examples

### Extract Shared loadJsonFile Helper

```typescript
// src/core/core.ts -- new shared helper
export function loadJsonFile<T = Record<string, unknown>>(filePath: string): T | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

// Async variant for modules that use promises
export async function loadJsonFileAsync<T = Record<string, unknown>>(filePath: string): Promise<T | null> {
  try {
    const content = await fsp.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}
```

**Before** (duplicated in config.ts, dashboard-launcher.ts, and others):
```typescript
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
} catch { /* defaults */ }
```

**After:**
```typescript
const config = loadJsonFile<Partial<PlanningConfig>>(configPath) ?? {};
```

### Phase Directory Resolution Extraction

```typescript
// src/core/core.ts -- new shared helper
export function resolvePhaseDir(cwd: string, phase: string): PhaseSearchResult | null {
  return findPhaseInternal(cwd, phase);
}

export async function resolvePhaseDirAsync(cwd: string, phase: string): Promise<PhaseSearchResult | null> {
  return findPhaseInternalAsync(cwd, phase);
}
```

This consolidates the 8 places where phase directory resolution is duplicated with slightly different error handling.

### Test Example: verify.ts Unit Test

```typescript
// tests/unit/verify.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { cmdVerifyPlanStructure, cmdVerifyPhaseCompleteness } from '../../src/core/verify.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maxsim-verify-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
  }
  tempDirs.length = 0;
});

describe('cmdVerifyPlanStructure', () => {
  it('returns error when plan file does not exist', () => {
    const cwd = makeTempDir();
    const result = cmdVerifyPlanStructure(cwd, '/nonexistent/plan.md');
    expect(result.ok).toBe(false);
  });

  it('validates a well-formed plan file', () => {
    const cwd = makeTempDir();
    const planDir = path.join(cwd, '.planning', 'phases', '01-Test');
    fs.mkdirSync(planDir, { recursive: true });
    const planPath = path.join(planDir, '01-01-PLAN.md');
    fs.writeFileSync(planPath, [
      '---',
      'phase: "01"',
      'attempt: 1',
      '---',
      '## Task 1: Example',
      '**Files:** src/example.ts',
      '**Action:** Create the file',
      '**Verify:** File exists',
      '**Done:** [ ]',
    ].join('\n'));
    const result = cmdVerifyPlanStructure(cwd, planPath);
    expect(result.ok).toBe(true);
  });
});
```

### Test Example: init.ts Unit Test with Mocked Dependencies

```typescript
// tests/unit/init.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// init.ts functions are sync and use sync fs operations
// Test with real temp dirs since they construct file paths
import { cmdInitExecutePhase, cmdInitPlanPhase } from '../../src/core/init.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maxsim-init-test-'));
  tempDirs.push(dir);
  return dir;
}

function scaffoldFull(cwd: string): void {
  const p = path.join(cwd, '.planning');
  fs.mkdirSync(path.join(p, 'phases', '01-Foundation'), { recursive: true });
  fs.writeFileSync(path.join(p, 'ROADMAP.md'), '### Phase 1: Foundation\n\n**Goal:** Build core\n');
  fs.writeFileSync(path.join(p, 'STATE.md'), '**Current Phase:** 01\n**Status:** Planning\n');
  fs.writeFileSync(path.join(p, 'config.json'), JSON.stringify({ model_profile: 'balanced' }));
  fs.writeFileSync(path.join(p, 'phases', '01-Foundation', '01-01-PLAN.md'), '# Plan');
}

beforeEach(() => {
  tempDirs.length = 0;
});

afterEach(() => {
  for (const dir of tempDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
  }
});

describe('cmdInitExecutePhase', () => {
  it('returns ok with phase context when phase exists', () => {
    const cwd = makeTempDir();
    scaffoldFull(cwd);
    const result = cmdInitExecutePhase(cwd, '01');
    expect(result.ok).toBe(true);
  });

  it('returns ok with phase_found=false when phase does not exist', () => {
    const cwd = makeTempDir();
    scaffoldFull(cwd);
    const result = cmdInitExecutePhase(cwd, '99');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const ctx = result.result as Record<string, unknown>;
      expect(ctx.phase_found).toBe(false);
    }
  });
});
```

---

## Integration Warnings

- **memfs + simple-git:** memfs mocks `node:fs` but simple-git uses its own child process spawning for git commands. If a test mocks fs via memfs, simple-git calls will still hit the real filesystem. Always mock simple-git separately when also using memfs.

- **Vitest coverage + tsdown:** The V8 coverage provider instruments the original TypeScript source via source maps. Since tests import from `../../src/core/*.js` (TypeScript source, resolved by Vitest), this works correctly. Do NOT run coverage against the bundled `dist/cli.cjs` -- it will not map back to source.

- **knip + barrel exports (index.ts):** The `core/index.ts` re-exports everything from all core modules. Knip may report individual module exports as "unused" if they are only consumed via the barrel. Configure Knip's entry points to include both `cli.ts` (which uses the barrel) and direct module imports.

- **noUnusedLocals/noUnusedParameters + existing code:** Enabling these TypeScript flags will likely surface 20-50 warnings across the 8693-line core module codebase. Fix them in a dedicated commit BEFORE starting the refactoring to avoid mixing cleanup with structural changes.

- **memfs + Windows paths:** MAXSIM runs on Windows (verified from environment). memfs uses POSIX-style paths by default. When testing path construction logic, use `path.join()` consistently in both test setup and assertions, or configure memfs for Windows-style paths. The existing temp-dir tests already handle this correctly since they use `path.join()`.

- **loadConfig cache + tests:** The `loadConfig()` function in `core.ts` has an internal cache keyed by `cwd`. Existing tests use unique temp dir paths per test to avoid cache interference. New tests MUST continue this pattern -- never reuse a cwd across tests.

---

## Effort Estimates

| Recommendation | Effort | Notes |
|---------------|--------|-------|
| Add @vitest/coverage-v8 | S | Single `npm install`, add config block to vitest.config.ts |
| Add knip + initial config | S | Single `npm install`, create knip.json, run once to see output |
| Add memfs | S | Single `npm install`, create `__mocks__/` files or use per-test `vi.mock()` |
| Enable additional TS compiler flags | M | Enable flags, fix 20-50 warnings across codebase, one commit |
| Enhance Biome rules | S | Update biome.json, fix any new violations |
| Extract loadJsonFile helper | S | Create helper in core.ts, replace 10+ duplication sites |
| Extract phase-dir resolution helper | M | 8 call sites with slightly different error handling, needs careful unification |
| Add unit tests for verify.ts | M | 965 lines, 9 exported functions, mix of sync/async. Estimate 15-20 test cases. |
| Add unit tests for init.ts | M | 1060 lines but 20 functions with similar structure. Template one test, repeat for others. |
| Add unit tests for phase.ts | L | 1193 lines, already has partial tests in phase-errors.test.ts. Expand to cover happy paths and remaining error paths. |
| Unify error handling (CliOutput/CliError to CmdResult) | M | Only 18 remaining references across 4 files. Most core modules already use CmdResult. |
| Remove dead code (4 unused workflows) | S | After knip identifies them, delete and verify build passes |

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| @vitest/coverage-v8 | @vitest/coverage-istanbul | If V8 coverage has source-map issues with tsdown output (unlikely) |
| knip | Manual grep for unused exports | If knip false positives are unmanageable with the markdown template structure |
| memfs for error tests | Real temp dirs with permission manipulation | If memfs has Windows compatibility issues (test early) |
| Incremental error migration | Big-bang migration | If a single developer owns all 4 files and can do the conversion in one focused session |
| noUncheckedIndexedAccess | Leave disabled | If it produces too many required changes in array-heavy phase.ts code (assess first) |

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| vitest@4.0.18 | @vitest/coverage-v8@4.0.18 | Must match exact major.minor.patch |
| vitest@4.0.18 | memfs@4.x | No direct dependency, works via vi.mock() |
| knip@5.86.x | typescript@5.9.3 | Knip supports TS 5.x natively |
| knip@5.86.x | vitest@4.x | Built-in Vitest plugin detects test files |
| memfs@4.x | Node.js 22+ | Fully compatible |
| biome@2.4.4 | typescript@5.9.3 | No TS version dependency (lints source directly) |

---

## Sources

- [TypeScript 5.9 Release Notes](https://devblogs.microsoft.com/typescript/announcing-typescript-5-9/) -- compiler flag verification
- [Vitest 4.0 Release Blog](https://vitest.dev/blog/vitest-4) -- feature and version verification
- [Vitest Coverage Guide](https://vitest.dev/guide/coverage.html) -- V8 vs Istanbul comparison
- [Vitest Mocking File System Guide](https://vitest.dev/guide/mocking/file-system) -- memfs integration pattern
- [Vitest Mocking Guide](https://vitest.dev/guide/mocking) -- vi.mock(), vi.spyOn() patterns
- [Knip Documentation](https://knip.dev/) -- dead code detection configuration
- [memfs npm](https://www.npmjs.com/package/memfs) -- version 4.56.x verification
- [@vitest/coverage-v8 npm](https://www.npmjs.com/package/@vitest/coverage-v8) -- version 4.0.18 verification
- [knip npm](https://www.npmjs.com/package/knip) -- version 5.86.x verification
- [Biome noExplicitAny rule](https://biomejs.dev/linter/rules/no-explicit-any/) -- Biome rule configuration
- Codebase analysis: `packages/cli/src/core/` (17 files, 8693 lines total)
- Codebase analysis: `packages/cli/tests/` (15 test files, established patterns)

---
*Stack research for: MAXSIM v5.1 Surgical Cleanup -- refactoring and test infrastructure*
*Researched: 2026-03-08*
