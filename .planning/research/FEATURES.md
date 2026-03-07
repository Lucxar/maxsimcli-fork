# Feature Research: v5.1 Surgical Cleanup

**Domain:** TypeScript CLI tech debt refactoring (internal cleanup, not user-facing features)
**Researched:** 2026-03-08
**Confidence:** HIGH

## Feature Landscape

This is a refactoring milestone. "Features" here are internal code quality improvements, not user-facing functionality. The categories map to: MUST fix (table stakes for maintainability), SHOULD improve (differentiators for developer velocity), and AVOID doing (anti-features that create new problems).

### Table Stakes (MUST Fix -- Blocking Maintainability)

These are non-negotiable cleanup items. Leaving them unfixed means every future feature change carries compounding risk and friction.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Unify error handling to CmdResult** | 3 competing patterns (CmdResult, CliOutput/CliError throws, process.exit()) create confusion; MCP/backend files have 7+ "CRITICAL: Never import output()" warnings | HIGH | 299 cmdOk/cmdErr usages already migrated; CliOutput/CliError throw pattern in core.ts still drives cli.ts; 30+ process.exit() calls in install.ts and backend. Migration is mechanical but touches every module. |
| **Unit tests for phase.ts** | 1193 lines, 0 dedicated tests (only phase-errors.test.ts at 255 lines covering error paths); 10 async cmd* functions untested | HIGH | Requires filesystem scaffolding fixtures (.planning/ directory trees). Most functions need a populated phases/ dir to exercise. Dependencies: safeReadFileAsync, findPhaseInternalAsync, listSubDirsAsync from core.ts. |
| **Unit tests for init.ts** | 1060 lines, 0 tests; 15 context-assembly functions (cmdInit*) that feed every workflow | HIGH | Each cmdInit* reads config, resolves models, probes filesystem for phase dirs/files, and assembles a typed context object. Tests need config.json fixtures + .planning/ scaffolding. Pure functions are testable; filesystem probing needs mocks or temp dirs. |
| **Unit tests for verify.ts** | 965 lines, 0 tests; 10 cmd* functions including consistency checker and health validator with auto-repair | MEDIUM | Functions are largely synchronous (except cmdVerifyCommits, cmdVerifySummary). Most read .planning/ files and parse markdown. Easier to test than phase.ts -- mock filesystem, assert result shapes. |
| **Remove dead workflow files** | 4 workflows with no corresponding command: discovery-phase.md, diagnose-issues.md, transition.md, resume-project.md | LOW | Verify none are referenced by @-path from other templates before deleting. Also check if referenced in help.md workflow listing. |

### Differentiators (SHOULD Improve -- Developer Velocity)

Not strictly required for correctness, but significantly reduce friction for future development.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Extract loadJsonFile() helper** | 14+ sites do `JSON.parse(fs.readFileSync(...))` with inconsistent error handling; some swallow errors, some throw, some warn. Single utility with typed return + error handling. | LOW | Replace pattern across config.ts (3), install/*.ts (5), hooks/*.ts (3), dashboard-launcher.ts (1), lifecycle.ts (1), shared.ts (1). Each site has slightly different error recovery -- utility should return `T | null` or use Result pattern. |
| **Extract phase dir resolution helper** | `phasesPath(cwd)` is called 30+ times, but the real duplication is the find-phase-dir-then-read-files pattern: call phasesPath, listSubDirs, filter by phase number regex, read files. Appears in phase.ts (12x), init.ts (4x), verify.ts (2x), commands.ts (3x). | MEDIUM | The deeper pattern is "resolve phase number to directory path" which involves normalization + glob matching. findPhaseInternal/findPhaseInternalAsync already exist but callers often inline the logic anyway. Consolidate callers to use the existing functions. |
| **Eliminate sync/async function duplication** | 5 function pairs in core.ts: listSubDirs/listSubDirsAsync, safeReadFile/safeReadFileAsync, findPhaseInternal/findPhaseInternalAsync, pathExistsInternal/pathExistsAsync. Total ~180 lines of duplicated logic. | MEDIUM | verify.ts (126 sync fs calls) and init.ts (14 sync fs calls) are the holdouts. Migration path: convert sync callers to async, then remove sync variants. Risk: verify.ts uses sync functions heavily because it was ported from a sync codebase. Must confirm no synchronous call chains depend on sync behavior. |
| **Resolve research-phase command/workflow duality** | research-phase.md command exists alongside discovery-phase.md workflow; unclear which is canonical. The plan-phase workflow already handles research internally (research_enabled flag). | LOW | Check if research-phase command is still used by any agent or workflow. If plan-phase subsumes it, deprecate the standalone command. If it serves a distinct purpose (manual research trigger), keep but document the boundary. |
| **Standardize logging patterns** | debugLog() exists in core.ts but usage is inconsistent: some modules use console.warn directly, others use debugLog, install.ts uses console.log/console.error. No structured logging. | LOW | Not critical for v5.1. Add as deferred item. Current logging works; it is just inconsistent aesthetically. |

### Anti-Features (AVOID Doing -- Creates New Problems)

These are tempting refactoring targets that would introduce more complexity than they resolve in a surgical cleanup milestone.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Full async migration of verify.ts** | "Eliminate all sync I/O" is clean on paper | verify.ts has 26 sync fs calls deeply interleaved into validation logic; converting all at once risks introducing await-ordering bugs across 10 functions. The module works correctly today. | Convert only the functions that have async callers (cmdVerifySummary, cmdVerifyCommits already async). Leave the sync validation helpers alone -- they are called from synchronous CLI paths where sync is fine. |
| **Replace CmdResult with neverthrow or ts-results** | Libraries like neverthrow provide monadic Result types with `.map()`, `.andThen()`, etc. | CmdResult already has 299 usages. Introducing a library means rewriting all call sites + adding a dependency. The current `{ ok, result/error }` pattern is simple and sufficient. The project is a CLI tool, not a long-running server -- the ergonomic benefits of monadic chaining are marginal here. | Keep CmdResult as-is. It is already the winning pattern (299 usages vs 2 CliOutput/CliError throw sites). Just complete the migration. |
| **Break cli.ts into per-domain route files** | cli.ts is the dispatch switch for 150+ commands; splitting into state-routes.ts, phase-routes.ts, etc. feels cleaner | cli.ts is a single dispatch file. It is read-only infrastructure that rarely changes. Splitting it creates 10+ small files that all do the same thing (parse args, call handler, handleResult). The current structure is easy to search and add to. | Leave cli.ts as a single dispatcher. It is the correct shape for a CLI tools router. |
| **Extract types.ts into per-domain type files** | types.ts is 659 lines with all interfaces | Types are cross-cutting. Splitting them by domain (phase-types.ts, state-types.ts) creates circular import risks since modules reference each other's types. A single types file is the standard TypeScript CLI pattern. | Keep types.ts unified. It is already well-organized with section headers. |
| **Abstract filesystem operations behind an interface** | "Dependency injection for testability" -- wrap fs calls in a FileSystem interface | This is premature abstraction. The codebase is a CLI tool that always reads the real filesystem. DI adds a layer of indirection that makes debugging harder. Vitest can mock fs modules directly when needed. | Use Vitest's `vi.mock('node:fs')` for unit tests. No abstraction layer needed. |
| **Rewrite core.ts from scratch** | core.ts is 842 lines, could be "cleaner" | core.ts is the most battle-tested module. It has unit tests, the utilities are pure, and the sync/async split is the only real issue. A rewrite risks regression in phase normalization, comparison, and config loading -- all of which have subtle edge cases. | Extract helpers incrementally. Fix the sync/async duplication. Do not rewrite. |

## Feature Dependencies

```
[Unify error handling (CmdResult)]
    |
    +-- already done in 15 core modules (299 usages)
    |
    +-- remaining: CliOutput/CliError in core.ts (used by cli.ts dispatch)
    |       |
    |       +-- cli.ts handleResult() bridges CmdResult -> output()/error()
    |       |
    |       +-- rethrowCliSignals() in commands.ts (3 sites), state.ts (3 sites)
    |               |
    |               +--requires--> Remove rethrowCliSignals after CliOutput/CliError removed
    |
    +-- remaining: process.exit() in install.ts (10 sites), backend-server.ts (3 sites)
            |
            +-- install.ts is a separate entry point (not routed through cli.ts)
            +-- backend-server.ts is a separate entry point
            +-- These are acceptable -- entry points SHOULD call process.exit()

[Unit tests for phase.ts]
    +--requires--> Filesystem fixtures (scaffolded .planning/ dirs)
    +--requires--> Understanding of findPhaseInternalAsync, listSubDirsAsync
    +--enhances--> Confidence in sync/async migration

[Unit tests for init.ts]
    +--requires--> Config fixtures (config.json variants)
    +--requires--> Phase dir fixtures
    +--enhances--> Confidence in error handling unification

[Unit tests for verify.ts]
    +--requires--> Plan file fixtures (PLAN.md with frontmatter)
    +--requires--> Summary file fixtures
    +--enhances--> Confidence in sync/async migration

[Extract loadJsonFile()]
    +--independent-- no blockers
    +--enhances--> Error handling unification (single parse+error pattern)

[Extract phase dir resolution]
    +--requires--> Understanding of findPhaseInternal/Async usage
    +--enhances--> phase.ts test clarity

[Eliminate sync/async duplication]
    +--requires--> Unit tests for verify.ts (to validate migration)
    +--requires--> Unit tests for init.ts (to validate migration)
    +--conflicts--> Full async migration of verify.ts (anti-feature)

[Remove dead workflows]
    +--independent-- no blockers
    +--requires--> Reference check (grep for @-path usage)

[Resolve research-phase duality]
    +--requires--> Reference check across agent/workflow files
```

### Dependency Notes

- **Error handling unification requires nothing** but is best done AFTER tests exist for the modules being changed. The migration is mechanical (replace rethrowCliSignals catch patterns with direct CmdResult returns) but having tests ensures no regressions.
- **Unit tests for all three modules** share a common need: filesystem fixture scaffolding. Building a shared test helper `createTestPlanning(cwd, options)` that scaffolds .planning/ dirs would reduce duplication across all three test suites.
- **Sync/async elimination requires tests first** because converting `findPhaseInternal()` callers in verify.ts to use `findPhaseInternalAsync()` changes the function signature from sync to async, which cascades to all callers.
- **loadJsonFile() extraction is independent** and provides immediate value -- it can be done first as a quick win that demonstrates the refactoring approach.

## MVP Definition (Milestone Scoping)

### Must Complete (v5.1 Core)

- [x] Unify error handling: remove rethrowCliSignals usage from commands.ts (3 sites) and state.ts (3 sites) -- these are the only places CliOutput/CliError still leak into core modules
- [ ] Unit tests for phase.ts -- at minimum cover cmdPhasesList, cmdPhaseAdd, cmdPhaseInsert, cmdPhaseRemove, cmdPhaseComplete (the 5 most complex functions)
- [ ] Unit tests for init.ts -- at minimum cover cmdInitExecutePhase, cmdInitPlanPhase (the 2 most complex context assemblers)
- [ ] Unit tests for verify.ts -- at minimum cover cmdVerifyPlanStructure, cmdValidateConsistency, cmdValidateHealth (the 3 functions with the most branching logic)
- [ ] Extract loadJsonFile() helper -- replace 14+ inline JSON.parse(readFileSync()) sites
- [ ] Remove 4 dead workflow files after reference verification
- [ ] Resolve research-phase command/workflow duality

### Add After Core Cleanup (v5.1.x)

- [ ] Extract phase dir resolution pattern -- consolidate callers that inline the find-phase logic instead of using findPhaseInternal/Async
- [ ] Eliminate sync/async function pairs in core.ts -- requires test coverage to be safe
- [ ] Standardize error messages -- some cmdErr() calls use different casing/format conventions

### Defer to Future Milestone (v5.2+)

- [ ] Structured logging -- replace ad-hoc console.warn/debugLog with a consistent logger
- [ ] Break server.ts (1159 lines) into route modules -- it is in the backend package, not core, and not part of the CLI tools router path
- [ ] Typed CmdResult -- current `result: unknown` could be generic `CmdResult<T>` but requires touching all 299 call sites
- [ ] Remove CliOutput/CliError entirely from core.ts -- this requires changing cli.ts dispatch to not use throw-based flow control, which is a larger architectural change

## Feature Prioritization Matrix

| Feature | Dev Velocity Impact | Implementation Cost | Priority | Risk if Skipped |
|---------|---------------------|---------------------|----------|-----------------|
| Unit tests for phase.ts | HIGH | HIGH | P1 | Future phase.ts changes are blind |
| Unit tests for init.ts | HIGH | HIGH | P1 | Context assembly bugs undetectable |
| Unit tests for verify.ts | HIGH | MEDIUM | P1 | Verification logic untrusted |
| Extract loadJsonFile() | MEDIUM | LOW | P1 | 14 error handling variants persist |
| Remove dead workflows | LOW | LOW | P1 | Confusion about canonical commands |
| Resolve research-phase duality | LOW | LOW | P1 | Users discover conflicting commands |
| Remove rethrowCliSignals from core | MEDIUM | LOW | P1 | Mixed error patterns persist |
| Extract phase dir resolution | MEDIUM | MEDIUM | P2 | Inlined logic continues to drift |
| Eliminate sync/async pairs | MEDIUM | MEDIUM | P2 | 180 lines of duplicated logic |
| Typed CmdResult<T> | LOW | HIGH | P3 | Ergonomic annoyance, not a bug |
| Break server.ts into routes | LOW | MEDIUM | P3 | Backend is stable; no active development |

**Priority key:**
- P1: Must complete in v5.1 -- directly targets stated milestone goals
- P2: Should complete if capacity allows -- improves codebase but not critical
- P3: Defer -- nice to have, future milestone

## Trade-Off Matrix

| Option | Pros | Cons | Risk | Effort |
|--------|------|------|------|--------|
| **Complete CmdResult migration (recommended)** | Already 95% done (299 sites); removes CliOutput/CliError confusion; eliminates rethrowCliSignals | Does not address process.exit() in entry points (which is fine) | LOW | S |
| **Adopt neverthrow Result type** | Monadic chaining, better ergonomics, community standard | Rewrites 299 call sites, adds dependency, learning curve for contributors | HIGH | XL |
| **Keep mixed patterns as-is** | Zero effort | Every new module faces "which pattern?" decision; MCP/backend files need "CRITICAL: Never import" warnings forever | MED | - |

| Option | Pros | Cons | Risk | Effort |
|--------|------|------|------|--------|
| **Test with real temp dirs (recommended)** | Tests real filesystem behavior; catches path-handling bugs; no mock maintenance | Slower tests; temp dir cleanup needed; platform-dependent path separators | LOW | M |
| **Test with vi.mock('node:fs')** | Fast; no temp dirs; pure unit tests | Mock maintenance burden; mocks can drift from real fs behavior; phase dir logic depends on real directory listing | MED | M |
| **Test with memfs (in-memory filesystem)** | Fast; realistic fs behavior; no temp dir cleanup | Extra dependency; incomplete Node.js fs compatibility; some edge cases may differ | LOW | M |

| Option | Pros | Cons | Risk | Effort |
|--------|------|------|------|--------|
| **Convert sync callers to async, remove sync variants** | Single implementation per function; cleaner codebase | Cascading async: every caller must become async; verify.ts has 26 sync fs calls | MED | L |
| **Keep sync/async pairs, document the pattern** | Zero risk; verify.ts stays stable | 180 lines of duplicated logic; new functions may add more pairs | LOW | S |
| **Async-only for new code, sync frozen** | No migration risk; gradual cleanup | Two patterns coexist indefinitely | LOW | S |

## Decision Rationale

**Recommendation: Complete CmdResult migration** over neverthrow adoption
**Why:** CmdResult is already the dominant pattern (299 usages). The remaining CliOutput/CliError usage is confined to 6 rethrowCliSignals sites and the cli.ts entry point dispatch. Completing the migration is a few hours of mechanical work. Adopting neverthrow would be a weeks-long rewrite with zero functional benefit -- the CLI's error paths are simple success/failure returns, not complex chains that benefit from monadic composition.
**When to reconsider:** If MAXSIM ever becomes a library consumed by other TypeScript projects (not just a CLI tool), the ergonomic benefits of neverthrow's `.map()/.andThen()` would matter more.

**Recommendation: Test with real temp dirs** over vi.mock or memfs
**Why:** The modules under test (phase.ts, init.ts, verify.ts) are deeply interleaved with filesystem operations -- directory listing, file existence checks, file content reading. Mocking these creates brittle tests that pass even when the real code would fail on path-handling edge cases (Windows vs Unix separators, missing parent dirs). Real temp dirs catch these bugs. Vitest's `beforeEach`/`afterEach` with `os.tmpdir()` is the established pattern already used in core-errors.test.ts.
**When to reconsider:** If test suite runtime exceeds 30 seconds, consider memfs for the most filesystem-heavy tests.

**Recommendation: Async-only for new code, sync frozen** over full migration
**Why:** Full sync-to-async migration of verify.ts requires making 10+ functions async, which cascades to cli.ts handlers. The current sync functions work correctly and are only called from CLI tool paths where blocking is acceptable. The pragmatic approach is to stop adding new sync variants, use async for all new code, and migrate sync callers opportunistically (e.g., when adding tests for a function, convert it to async then).
**When to reconsider:** If a function needs both CLI (sync ok) and MCP (must be async) calling paths, the sync variant must be removed to avoid maintaining two implementations.

## Code Examples

### Shared Test Fixture Helper

```typescript
// tests/helpers/fixtures.ts
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface TestPlanningOptions {
  config?: Record<string, unknown>;
  phases?: Array<{
    number: string;
    name: string;
    files?: Record<string, string>; // filename -> content
  }>;
  roadmap?: string;
  state?: string;
}

export function createTestPlanning(options: TestPlanningOptions = {}): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'maxsim-test-'));
  const planning = path.join(cwd, '.planning');
  fs.mkdirSync(planning, { recursive: true });

  if (options.config) {
    fs.writeFileSync(
      path.join(planning, 'config.json'),
      JSON.stringify(options.config, null, 2),
    );
  }

  if (options.roadmap) {
    fs.writeFileSync(path.join(planning, 'ROADMAP.md'), options.roadmap);
  }

  if (options.state) {
    fs.writeFileSync(path.join(planning, 'STATE.md'), options.state);
  }

  if (options.phases) {
    const phasesDir = path.join(planning, 'phases');
    fs.mkdirSync(phasesDir, { recursive: true });
    for (const phase of options.phases) {
      const padded = phase.number.padStart(2, '0');
      const dirName = `${padded}-${phase.name}`;
      const phaseDir = path.join(phasesDir, dirName);
      fs.mkdirSync(phaseDir, { recursive: true });
      if (phase.files) {
        for (const [filename, content] of Object.entries(phase.files)) {
          fs.writeFileSync(path.join(phaseDir, filename), content);
        }
      }
    }
  }

  return cwd;
}

export function cleanupTestDir(cwd: string): void {
  fs.rmSync(cwd, { recursive: true, force: true });
}
```

### loadJsonFile() Helper

```typescript
// core/fs-utils.ts (or added to core.ts)
import fs from 'node:fs';
import { debugLog } from './core.js';

/**
 * Read and parse a JSON file. Returns null if file doesn't exist or is
 * unparseable. Optionally logs a warning on parse failure.
 */
export function loadJsonFile<T = unknown>(
  filePath: string,
  options?: { warnOnParseError?: boolean; label?: string },
): T | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (e) {
    if (options?.warnOnParseError && fs.existsSync(filePath)) {
      const label = options.label ?? filePath;
      console.warn(`[maxsim] Warning: ${label} could not be parsed.`);
      debugLog('load-json-failed', e);
    }
    return null;
  }
}
```

### rethrowCliSignals Removal Pattern

```typescript
// BEFORE (commands.ts, state.ts):
try {
  // ... operation
} catch (e) {
  rethrowCliSignals(e);
  return cmdErr(errorMsg(e));
}

// AFTER:
try {
  // ... operation
} catch (e) {
  return cmdErr(errorMsg(e));
}
// rethrowCliSignals is no longer needed because the operation
// no longer calls output()/error() (which throw CliOutput/CliError).
// All code paths return CmdResult directly.
```

## Integration Warnings

- **phase.ts + core.ts sync/async split:** phase.ts uses `findPhaseInternalAsync` and `listSubDirsAsync` (the async variants), while verify.ts uses `findPhaseInternal` and `listSubDirs` (the sync variants). Converting verify.ts to async would unify these, but must be done after test coverage exists for verify.ts.
- **rethrowCliSignals removal + cli.ts dispatch:** The cli.ts `handleResult()` function still uses `output()`/`error()` which throw CliOutput/CliError. These throws are caught by the top-level try/catch in cli.ts main(). Removing CliOutput/CliError entirely would require changing cli.ts's dispatch mechanism from throw-based to return-based, which is a separate (larger) effort. For v5.1, just remove rethrowCliSignals from the 6 catch blocks in core modules.
- **loadJsonFile() + config.ts caching:** config.ts has a `_configCache` that stores parsed config. When replacing the inline JSON.parse in loadConfig() with loadJsonFile(), ensure the cache logic is preserved -- loadJsonFile() should not interfere with the caching layer.
- **Test fixtures + Windows paths:** Tests creating temp dirs with `os.tmpdir()` on Windows get paths like `C:\Users\...\AppData\Local\Temp\maxsim-test-xyz`. All path operations in the tested modules use `path.join()` which handles separators correctly, but hardcoded path strings in test assertions must use `path.join()` or `path.sep` to avoid failures.
- **Dead workflow removal + install manifest:** The install system copies templates/ to ~/.claude/. Removing workflow files from templates/ means the next install won't copy them, but previously installed copies remain in users' ~/.claude/workflows/. The manifest system handles this (it tracks installed files), but verify that uninstall/cleanup logic removes orphaned files.

## Effort Estimates

| Recommendation | Effort | Notes |
|---------------|--------|-------|
| Extract loadJsonFile() | S (2-4 hours) | Write utility, grep-replace 14 sites, verify no behavioral change |
| Remove rethrowCliSignals from core modules | S (1-2 hours) | 6 catch blocks in commands.ts and state.ts |
| Remove 4 dead workflow files | S (1 hour) | Grep for references, delete, verify build |
| Resolve research-phase duality | S (1-2 hours) | Investigate references, decide keep/deprecate, update help.md |
| Unit tests for verify.ts | M (2-3 days) | 10 functions, need plan file fixtures, markdown parsing edge cases |
| Unit tests for phase.ts | L (3-5 days) | 10 async functions, filesystem scaffolding, phase lifecycle assertions |
| Unit tests for init.ts | L (3-5 days) | 15 context assemblers, need config + phase dir + roadmap fixtures |
| Shared test fixture helper | M (1 day) | createTestPlanning utility, used by all three test suites |
| Extract phase dir resolution | M (2-3 days) | Audit 30+ phasesPath callers, consolidate inlined logic |
| Eliminate sync/async pairs | L (1 week) | 5 function pairs, cascading async changes, requires test coverage first |

Total estimated effort: **3-4 weeks** for all P1+P2 items. P1 items alone: **~2 weeks**.

## Sources

- [TypeScript Errors as Values vs Exceptions Benchmarks](https://hamy.xyz/blog/2025-05_typescript-errors-vs-exceptions-benchmarks) -- Performance data showing Result types are faster than throw/catch
- [Functional Error Handling in TypeScript with Result Pattern](https://arg-software.medium.com/functional-error-handling-in-typescript-with-the-result-pattern-5b96a5abb6d3) -- Pattern overview and rationale
- [Safer Error Handling in TypeScript with Result Type](https://medium.com/@piotrovskyi/safer-error-handling-in-typescript-with-the-result-type-3c8b8021c1cf) -- Community consensus on Result types
- [better-result library docs](https://better-result.dev/introduction) -- Reference for Result type API design
- [Refactoring Module Dependencies (Martin Fowler)](https://martinfowler.com/articles/refactoring-dependencies.html) -- Module extraction patterns
- [Refactoring by Breaking Functions Apart: TypeScript](https://auth0.com/blog/refactoring-breaking-functions-apart-typescript/) -- Function decomposition patterns
- Codebase analysis: direct inspection of packages/cli/src/core/ (8693 lines across 19 modules), packages/cli/tests/ (2549 lines across 15 test files)

---
*Feature research for: MAXSIM v5.1 Surgical Cleanup*
*Researched: 2026-03-08*
