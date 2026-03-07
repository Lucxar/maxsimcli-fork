# Architecture Research: Module Decomposition for v5.1 Surgical Cleanup

**Domain:** TypeScript CLI monolith decomposition, error handling unification, barrel export compatibility
**Researched:** 2026-03-08
**Confidence:** HIGH (based on direct codebase analysis of all 21 core modules, cli.ts, MCP tools, and dashboard server)

## Current Architecture Analysis

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CLI Entry (cli.ts)                               │
│   Catches CliOutput/CliError → process.exit(0/1)                        │
│   150+ command dispatch via COMMANDS record                             │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌───────────┐  ┌───────────┐  ┌────────────┐  ┌──────────┐           │
│  │ handleState│  │handlePhase│  │handleVerify │  │handleInit│  ...      │
│  │ (grouped) │  │ (grouped) │  │  (grouped)  │  │(grouped) │           │
│  └─────┬─────┘  └─────┬─────┘  └──────┬──────┘  └────┬─────┘          │
│        │               │               │              │                │
│        ▼               ▼               ▼              ▼                │
├─────────────────────────────────────────────────────────────────────────┤
│                  core/index.ts (barrel)                                 │
│   Re-exports 150+ items from 16 internal modules                       │
├─────────────────────────────────────────────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐      │
│ │core  │ │init  │ │phase │ │verify│ │state │ │roadmap│ │commands│     │
│ │843ln │ │1060ln│ │1193ln│ │965ln │ │750ln │ │300ln │ │780ln  │      │
│ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └───────┘      │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐      │
│ │types │ │front │ │drift │ │mile  │ │config│ │template│ │context│     │
│ │660ln │ │matter│ │230ln │ │stone │ │170ln │ │300ln  │ │-loader│     │
│ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └───────┘ └──────┘      │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌────────────┐                             │
│ │artefk│ │skills│ │start │ │dash-launcher│                             │
│ └──────┘ └──────┘ └──────┘ └────────────┘                             │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                     MCP Server (mcp/*.ts)                               │
│  6 tool modules import DIRECTLY from core/core.js + core/phase.js      │
│  Bypasses barrel; wraps in mcpSuccess/mcpError                          │
│  CANNOT use: output(), error(), CliOutput, CliError, process.exit()     │
├─────────────────────────────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│ │phase-tool│ │state-tool│ │config-tl │ │context-tl│ │roadmap-tl│     │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘     │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                   Dashboard Server (server.ts)                          │
│  Imports from @maxsim/core (barrel alias)                               │
│  Uses: normalizePhaseName, comparePhaseNum, getPhasePattern,            │
│        extractFrontmatter, stateExtractField, stateReplaceField         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Line Count | Responsibility | Problem |
|-----------|-----------|----------------|---------|
| `core.ts` | 843 | Constants, output helpers, file utils, git utils, phase utils, config loading, model resolution, async duplicates | God module: 6+ distinct domains mixed |
| `init.ts` | 1060 | 18 workflow init commands, 20+ context type interfaces | All sync, duplicated pattern repeated 18x |
| `phase.ts` | 1193 | Phase CRUD, archive, plan index, scaffolding | Well-structured but large |
| `verify.ts` | 965 | 9 verification commands (summary, plan, phase, refs, commits, artifacts, links, consistency, health) | All sync I/O, 26 sync fs calls |
| `commands.ts` | 780 | 12 standalone utilities (slug, timestamp, todos, history, model, commit, websearch, scaffold) | Catch-all grab bag |
| `types.ts` | 660 | All type definitions, branded types, CmdResult helpers | Clean, but large |
| `index.ts` | 352 | Barrel re-exports from all 16 modules | 150+ exports, single consumer (cli.ts) |

### Current Error Handling Landscape

Three incompatible error patterns coexist:

| Pattern | Where Used | Mechanism | MCP Safe? |
|---------|-----------|-----------|-----------|
| `CliOutput`/`CliError` (throw-as-flow-control) | `core.ts` `output()`/`error()` -> `cli.ts` catch | Throws non-Error objects caught in `main()` | **NO** -- kills server |
| `CmdResult` (ok/err discriminated union) | `phase.ts`, `state.ts`, `roadmap.ts`, `verify.ts` cmd* functions | Returns `{ ok: true, result }` or `{ ok: false, error }` | **YES** |
| `throw new Error()` (standard exceptions) | `phase.ts` core functions (`phaseAddCore`, `phaseCompleteCore`) | Standard try/catch | **YES** (with catch) |

The `CmdResult` pattern is the clear winner: it is return-based, composable, MCP-safe, and already used by the majority of modules. The `CliOutput`/`CliError` pattern is a legacy escape hatch that uses throw-as-flow-control -- dangerous and incompatible with long-lived server processes.

### Import Dependency Graph

```
cli.ts ─────────────────────→ core/index.ts (barrel)
                                    │
                                    ├── core.ts (everything depends on this)
                                    ├── types.ts (everything depends on this)
                                    ├── frontmatter.ts ── core.ts
                                    ├── config.ts ── core.ts (sync fs)
                                    ├── state.ts ── core.ts, types.ts
                                    ├── roadmap.ts ── core.ts, types.ts
                                    ├── phase.ts ── core.ts, frontmatter.ts, types.ts
                                    ├── verify.ts ── core.ts, frontmatter.ts, types.ts
                                    ├── init.ts ── core.ts, types.ts (SYNC, calls findPhaseInternal etc.)
                                    ├── commands.ts ── core.ts, frontmatter.ts, types.ts
                                    ├── milestone.ts ── core.ts, types.ts
                                    ├── drift.ts ── core.ts, frontmatter.ts, types.ts
                                    ├── template.ts ── types.ts
                                    ├── artefakte.ts ── core.ts, types.ts
                                    ├── context-loader.ts ── core.ts, types.ts
                                    ├── skills.ts ── types.ts
                                    ├── start.ts ── types.ts, dashboard-launcher.ts
                                    └── dashboard-launcher.ts ── types.ts

mcp/phase-tools.ts ──────────→ core/core.js (direct, bypasses barrel)
                              → core/phase.js (direct)
mcp/state-tools.ts ──────────→ core/core.js (direct)
mcp/config-tools.ts ─────────→ core/core.js (direct)
mcp/context-tools.ts ────────→ core/core.js (direct)
mcp/todo-tools.ts ───────────→ core/core.js (direct)

dashboard/server.ts ─────────→ @maxsim/core (barrel alias)
```

## Recommended Architecture

### Target Module Structure

```
src/core/
├── types.ts                    # [KEEP] Types + CmdResult + branded types (no changes needed)
├── errors.ts                   # [NEW] Unified error handling: CmdResult helpers, CliOutput/CliError
├── fs-utils.ts                 # [NEW] File I/O: safeReadFile, safeReadFileAsync, loadJsonFile, pathExists
├── phase-utils.ts              # [NEW] Phase primitives: normalize, compare, getPhasePattern, escapePhaseNum
├── git.ts                      # [NEW] Git operations: execGit, isGitIgnored
├── config.ts                   # [MODIFY] Already exists, keep but add loadJsonFile dependency
├── model.ts                    # [NEW] Model resolution: MODEL_PROFILES, resolveModelInternal
├── paths.ts                    # [NEW] Path constants: planningPath, phasesPath, roadmapPath, statePath, configPath
├── phase-search.ts             # [NEW] Phase directory search: findPhaseInternal, findPhaseInternalAsync, getArchivedPhaseDirs
├── roadmap-read.ts             # [NEW] Roadmap read utils: getRoadmapPhaseInternal, getMilestoneInfo, archivePath
├── core.ts                     # [MODIFY] Becomes a THIN re-export facade for backward compat
│
├── frontmatter.ts              # [KEEP] Already well-scoped
├── state.ts                    # [KEEP] Already well-scoped
├── roadmap.ts                  # [KEEP] Already well-scoped
├── phase.ts                    # [KEEP] Already well-scoped (large but cohesive)
├── verify.ts                   # [MODIFY] Convert sync fs to async (26 sync calls)
├── init.ts                     # [MODIFY] Convert sync to async, extract shared pattern
├── commands.ts                 # [KEEP] Utility grab bag is OK -- functional grouping
├── milestone.ts                # [KEEP] Already well-scoped
├── drift.ts                    # [KEEP] Already well-scoped
├── template.ts                 # [KEEP] Already well-scoped
├── artefakte.ts                # [KEEP] Already well-scoped
├── context-loader.ts           # [KEEP] Already well-scoped
├── skills.ts                   # [KEEP] Already well-scoped
├── start.ts                    # [KEEP] Already well-scoped
├── dashboard-launcher.ts       # [KEEP] Already well-scoped
│
└── index.ts                    # [MODIFY] Add new module re-exports, keep all existing exports
```

### Structure Rationale

- **`errors.ts`:** Isolate the CliOutput/CliError classes and the `output()`/`error()` throw-helpers into a single file. This makes the "CLI-only, must-never-import-in-MCP" boundary explicit. The `CmdResult` helpers (`cmdOk`, `cmdErr`) stay in `types.ts` because they are universally safe.

- **`fs-utils.ts`:** Extract the 10+ duplicated file I/O patterns (`safeReadFile`, `safeReadFileAsync`, `pathExistsInternal`, `pathExistsAsync`, `listSubDirs`, `listSubDirsAsync`, and the never-extracted `loadJsonFile`). Every core module imports at least 3 of these.

- **`phase-utils.ts`:** Pure functions with zero I/O: `normalizePhaseName`, `comparePhaseNum`, `getPhasePattern`, `escapePhaseNum`, `isPlanFile`, `isSummaryFile`, `planId`, `summaryId`. Dashboard server imports 3 of these -- they must be stable, I/O-free, and independently importable.

- **`git.ts`:** `execGit` and `isGitIgnored` use `simple-git` and are the only modules with that dependency. Isolating them lets non-git contexts (like pure verification) avoid the import.

- **`paths.ts`:** `planningPath`, `phasesPath`, `roadmapPath`, `statePath`, `configPath` -- pure path construction with zero I/O. Used everywhere.

- **`model.ts`:** `MODEL_PROFILES` constant + `resolveModelInternal`. Config-dependent but logically separate from file I/O.

- **`phase-search.ts`:** `findPhaseInternal`, `findPhaseInternalAsync`, `getArchivedPhaseDirs`, `getArchivedPhaseDirsAsync`, `searchPhaseInDir`, `searchPhaseInDirAsync` -- I/O-heavy phase directory scanning. Currently 350 lines in core.ts.

- **`roadmap-read.ts`:** `getRoadmapPhaseInternal`, `getRoadmapPhaseInternalAsync`, `getMilestoneInfo`, `getMilestoneInfoAsync`, `archivePath`, `archivePathAsync` -- roadmap file reading helpers. Currently 130 lines in core.ts.

- **`core.ts` becomes a re-export facade:** After extraction, core.ts re-exports everything it currently exports. This means the 15 internal modules that import from `./core.js` need ZERO changes initially. The facade can be thinned over time as modules update their imports.

## Architectural Patterns

### Pattern 1: Backward-Compatible Barrel Decomposition (Facade Pattern)

**What:** Extract code from monolithic modules into focused files, but keep the original module as a re-export facade. Downstream consumers see no change.

**When to use:** When a module has 15+ downstream import sites and you cannot change them all atomically.

**Trade-offs:**
- PRO: Zero breaking changes, can be done incrementally
- PRO: Each new module is independently testable
- CON: Temporary indirection via facade (mild)
- CON: Must verify re-export correctness

**Example:**

```typescript
// ── BEFORE: core.ts (843 lines, everything) ──
export function normalizePhaseName(phase: string): string { ... }
export function planningPath(cwd: string, ...segments: string[]): string { ... }
export function safeReadFile(filePath: string): string | null { ... }
export function execGit(cwd: string, args: string[]): Promise<GitResult> { ... }
// ... 40+ more exports

// ── AFTER: phase-utils.ts (new, focused) ──
export function normalizePhaseName(phase: string): string { ... }
export function comparePhaseNum(a: string | number, b: string | number): number { ... }
export function getPhasePattern(escapedPhaseNum?: string, flags?: string): RegExp { ... }
// ... pure phase utilities only

// ── AFTER: core.ts (thin re-export facade) ──
// Re-export everything so existing `import { X } from './core.js'` still works
export { normalizePhaseName, comparePhaseNum, getPhasePattern } from './phase-utils.js';
export { planningPath, phasesPath, roadmapPath, statePath, configPath } from './paths.js';
export { safeReadFile, safeReadFileAsync, pathExistsInternal } from './fs-utils.js';
export { execGit, isGitIgnored } from './git.js';
export { MODEL_PROFILES, resolveModelInternal } from './model.js';
// ... etc
```

### Pattern 2: CmdResult Unification

**What:** Replace all `throw new Error()` in core functions with `CmdResult` returns, and wrap `CliOutput`/`CliError` as a CLI-only adapter layer.

**When to use:** When the same business logic must work in both CLI (process.exit) and server (stay-alive) contexts.

**Trade-offs:**
- PRO: Universally safe error handling
- PRO: No throw-as-flow-control anti-pattern
- PRO: MCP tools can use core functions directly
- CON: Callers must check `r.ok` instead of try/catch
- CON: Migration is incremental (both patterns coexist during transition)

**Example:**

```typescript
// ── BEFORE: phase.ts core function throws ──
export async function phaseAddCore(cwd: string, description: string): Promise<PhaseAddResult> {
  // ...
  throw new Error('ROADMAP.md not found'); // MCP tool wraps this in try/catch
}

// Cmd wrapper catches and converts:
export async function cmdPhaseAdd(cwd: string, description: string): Promise<CmdResult> {
  try {
    const result = await phaseAddCore(cwd, description);
    return cmdOk(result);
  } catch (e) {
    return cmdErr((e as Error).message);
  }
}

// ── AFTER: core function returns CmdResult ──
export async function phaseAddCore(cwd: string, description: string): Promise<CmdResult<PhaseAddResult>> {
  const rmPath = roadmapPath(cwd);
  const content = await safeReadFileAsync(rmPath);
  if (!content) return cmdErr('ROADMAP.md not found');
  // ... rest returns cmdOk(result)
}

// Cmd wrapper becomes a trivial pass-through:
export const cmdPhaseAdd = phaseAddCore; // or thin validation layer
```

### Pattern 3: CLI Adapter Layer (output/error isolation)

**What:** Keep `output()` and `error()` in `errors.ts` as CLI-only adapters. The `handleResult()` function in `cli.ts` is the only bridge between CmdResult and CliOutput/CliError.

**When to use:** When you need process.exit() behavior in CLI mode but must never crash in server mode.

**Trade-offs:**
- PRO: Single place where process.exit() lives
- PRO: MCP/dashboard never import the dangerous functions
- CON: Requires discipline (linting rule recommended)

**Example:**

```typescript
// ── errors.ts — CLI-ONLY, never import from MCP/dashboard ──
export class CliOutput { ... }
export class CliError { ... }
export function output(result: unknown): never { throw new CliOutput(result); }
export function error(message: string): never { throw new CliError(message); }

// ── cli.ts — the only file that catches these ──
import { CliOutput, CliError, writeOutput } from './core/errors.js';

async function main(): Promise<void> {
  try {
    await handler(args, cwd, raw);
  } catch (thrown: unknown) {
    if (thrown instanceof CliOutput) { writeOutput(thrown); process.exit(0); }
    if (thrown instanceof CliError) { process.stderr.write(thrown.message); process.exit(1); }
    throw thrown;
  }
}

// ── mcp/phase-tools.ts — uses CmdResult, never output/error ──
import { phaseAddCore } from '../core/phase.js'; // returns CmdResult
// No CliOutput/CliError import possible
```

## Data Flow

### CLI Command Flow (Current)

```
User runs: node cli.cjs state get current_phase

  cli.ts main()
    ↓
  COMMANDS['state'] = handleState
    ↓
  handleState → cmdStateGet(cwd, field, raw)
    ↓
  state.ts → reads STATE.md → returns CmdResult { ok: true, result: "03" }
    ↓
  handleResult(r, raw) → output(r.result, raw) → throw CliOutput
    ↓
  main() catch → writeOutput() → process.exit(0)
```

### MCP Tool Flow (Current)

```
Claude calls: mcp_find_phase({ phase: "03" })

  mcp/phase-tools.ts
    ↓
  findPhaseInternal(cwd, "03")  ← imported directly from core/core.js
    ↓
  returns PhaseSearchResult | null
    ↓
  mcpSuccess(data, summary) or mcpError(msg, summary)
    ↓
  MCP SDK sends JSON-RPC response (NO process.exit!)
```

### Target: Unified Flow

```
Both CLI and MCP call the same core functions that return CmdResult.
Only cli.ts converts CmdResult → CliOutput/CliError → process.exit.
MCP tools convert CmdResult → mcpSuccess/mcpError.
No code path in core/ ever calls process.exit() or throws CliOutput/CliError.
```

## Decomposition Build Order

Safe decomposition order, each step independently verifiable:

| Step | Module | Extracts From | Dependencies | Risk | Effort |
|------|--------|--------------|--------------|------|--------|
| 1 | `paths.ts` | `core.ts` | path (node:path only) | LOW | S |
| 2 | `phase-utils.ts` | `core.ts` | none (pure functions) | LOW | S |
| 3 | `fs-utils.ts` | `core.ts` | node:fs, paths.ts | LOW | S |
| 4 | `errors.ts` | `core.ts` | node:path, node:os, node:fs | LOW | S |
| 5 | `git.ts` | `core.ts` | simple-git, fs-utils.ts | LOW | S |
| 6 | `model.ts` | `core.ts` | config.ts, types.ts | LOW | S |
| 7 | `phase-search.ts` | `core.ts` | phase-utils.ts, fs-utils.ts, paths.ts, git.ts | MED | M |
| 8 | `roadmap-read.ts` | `core.ts` | phase-utils.ts, fs-utils.ts, paths.ts | MED | M |
| 9 | Update `core.ts` facade | core.ts | all new modules | LOW | S |
| 10 | Verify barrel `index.ts` | index.ts | all modules | LOW | S |

**Critical constraint:** Steps 1-8 are extraction-only. `core.ts` keeps all its current exports via re-exports from new modules. Step 9 converts core.ts from "has the code" to "re-exports the code." Step 10 confirms index.ts re-exports still cover everything.

After decomposition is stable:

| Step | Module | Change | Risk | Effort |
|------|--------|--------|------|--------|
| 11 | `init.ts` | Convert sync → async (14 sync fs calls) | MED | M |
| 12 | `verify.ts` | Convert sync → async (26 sync fs calls) | MED | M |
| 13 | `phase.ts` core funcs | Convert `throw new Error` → `CmdResult` return | MED | M |
| 14 | Error handling unification | Remove CliOutput/CliError from core modules | MED | L |

## Anti-Patterns

### Anti-Pattern 1: Throw-as-Flow-Control

**What people do:** `output()` and `error()` in `core.ts` throw `CliOutput`/`CliError` as non-Error objects to terminate command execution. Every `cmd*` function that calls `output()` directly participates in this pattern.

**Why it is wrong:** Server processes (MCP, dashboard) that import these functions die. The MCP tool files have 12 "CRITICAL: Never import output() or error()" warnings. This is fragile -- one wrong import kills the server.

**Do this instead:** Return `CmdResult` from all business logic. Only `cli.ts`'s `handleResult()` converts to throw-based flow control. Enforce with an ESLint/Biome rule banning `output()`/`error()` imports outside `cli.ts` and `errors.ts`.

### Anti-Pattern 2: God Module (core.ts)

**What people do:** Add every shared utility to `core.ts` because it is the existing "shared" module. Result: 843 lines, 6 distinct domains, 45 exports.

**Why it is wrong:** Forces every consumer to depend on everything. Changes to git utilities trigger recompilation/retesting of phase utilities. Makes it impossible to import just path helpers without pulling in `simple-git`.

**Do this instead:** Domain-focused modules (`phase-utils.ts`, `fs-utils.ts`, `git.ts`, `paths.ts`). Each module has a single reason to change.

### Anti-Pattern 3: Sync/Async Duplication

**What people do:** Write `findPhaseInternal()` (sync) then copy-paste to `findPhaseInternalAsync()` (async). Core.ts has ~350 lines of duplicated sync/async pairs.

**Why it is wrong:** Every bug fix must be applied twice. The sync versions block the event loop. The async versions were added later and have slightly different behavior (e.g., archive path vs milestones path).

**Do this instead:** Write async-first. For the CLI context where sync is acceptable, use the existing async functions -- Node.js `cli.ts` already uses `await` in `main()`. The only sync holdout is `init.ts` (18 sync functions), which should be converted to async.

### Anti-Pattern 4: Barrel File as API Contract

**What people do:** `index.ts` re-exports 150+ items. `cli.ts` imports everything from `./core/index.js`. Developers add exports to `index.ts` for every new function.

**Why it is wrong:** The barrel conflates two audiences: (1) internal module-to-module imports within `core/`, and (2) external consumers (`cli.ts`, `dashboard`). There is no layering discipline.

**Do this instead:** Internal modules import directly from sibling files (`./phase-utils.js`, `./fs-utils.js`). `index.ts` is only for external consumers. This already partially works -- MCP tools import from `../core/core.js` directly.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| `simple-git` | Wrapped in `execGit()` and `isGitIgnored()` | Isolate to `git.ts`; only 2 call sites in core |
| MCP SDK | `@modelcontextprotocol/sdk` via `mcp/*.ts` | MCP tools MUST never import CliOutput/CliError |
| File system | Mixed sync/async `node:fs` across all modules | Unify to async-first in `fs-utils.ts` |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `cli.ts` <-> `core/` | `CmdResult` return values, `handleResult()` converts to CliOutput/CliError | Only place throw-as-flow-control is acceptable |
| `mcp/*.ts` <-> `core/` | Direct function calls returning CmdResult or domain objects | Must avoid CliOutput/CliError entirely |
| `dashboard` <-> `@maxsim/core` | Pure utility imports (normalize, compare, extract) | Uses 6 specific functions, well-scoped |
| `core/` internal | Direct imports between sibling modules | Currently all go through `core.ts`; should go to specific modules |

### New vs Modified Modules Summary

| Module | Status | Action |
|--------|--------|--------|
| `paths.ts` | **NEW** | Extract 5 path functions from core.ts |
| `phase-utils.ts` | **NEW** | Extract 8 pure phase functions from core.ts |
| `fs-utils.ts` | **NEW** | Extract 7 file I/O functions from core.ts |
| `errors.ts` | **NEW** | Extract 6 error/output functions from core.ts |
| `git.ts` | **NEW** | Extract 2 git functions from core.ts |
| `model.ts` | **NEW** | Extract MODEL_PROFILES + resolveModelInternal from core.ts |
| `phase-search.ts` | **NEW** | Extract 6 phase search functions from core.ts |
| `roadmap-read.ts` | **NEW** | Extract 6 roadmap read functions from core.ts |
| `core.ts` | **MODIFY** | Becomes thin re-export facade (~50 lines of re-exports) |
| `index.ts` | **MODIFY** | Add re-exports from new modules (keep all existing exports) |
| `init.ts` | **MODIFY** | Convert 14 sync fs calls to async (separate phase) |
| `verify.ts` | **MODIFY** | Convert 26 sync fs calls to async (separate phase) |
| `phase.ts` | **MODIFY** | Convert core function throws to CmdResult (separate phase) |
| All others | **KEEP** | No changes needed during decomposition |

## Trade-Off Matrix

| Option | Pros | Cons | Risk | Effort |
|--------|------|------|------|--------|
| Facade decomposition (recommended) | Zero breaking changes, incremental, testable | Temporary indirection | LOW | M |
| Direct import rewrite | Cleaner result, no facade | Must update 15+ internal imports + 6 MCP files atomically | HIGH | L |
| Leave as-is, only unify errors | Minimal code change | core.ts stays a 843-line god module | LOW | S |
| Full restructure with new folder layout | Perfect architecture | Massive diff, high regression risk, breaks dashboard alias | HIGH | XL |

## Decision Rationale

**Recommendation:** Facade decomposition over direct rewrite or full restructure.

**Why:** The codebase has 15 internal modules importing from `./core.js`, 6 MCP tool files importing from `../core/core.js`, and 6 dashboard files importing from `@maxsim/core`. A facade pattern lets us extract code into focused modules while `core.ts` re-exports everything -- zero import site changes. The decomposition can be verified at each step by running `npm run build && npm test`. Each new module is independently testable.

**When to reconsider:** If the team decides to do a major version bump (v6.0) that allows breaking the barrel contract, a direct import rewrite would be cleaner. Also reconsider if the number of core modules exceeds 25, at which point folder-based organization (e.g., `core/phase/`, `core/state/`) becomes worthwhile.

## Code Examples

### errors.ts -- Unified Error Boundary

```typescript
// ── errors.ts — CLI-ONLY error handling ──
// WARNING: Never import output() or error() in MCP or dashboard code.

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

/** Thrown by output() to signal successful command completion. */
export class CliOutput {
  readonly result: unknown;
  readonly raw: boolean;
  readonly rawValue: unknown;
  constructor(result: unknown, raw?: boolean, rawValue?: unknown) {
    this.result = result;
    this.raw = raw ?? false;
    this.rawValue = rawValue;
  }
}

/** Thrown by error() to signal a command error. */
export class CliError {
  readonly message: string;
  constructor(message: string) {
    this.message = message;
  }
}

export function output(result: unknown, raw?: boolean, rawValue?: unknown): never {
  throw new CliOutput(result, raw, rawValue);
}

export function error(message: string): never {
  throw new CliError(message);
}

/** Re-throw CliOutput/CliError signals so catch blocks don't intercept them */
export function rethrowCliSignals(e: unknown): void {
  if (e instanceof CliOutput || e instanceof CliError) throw e;
}

/** Handle a CliOutput by writing to stdout. */
export function writeOutput(out: CliOutput): void {
  if (out.raw && out.rawValue !== undefined) {
    process.stdout.write(String(out.rawValue));
  } else {
    const json = JSON.stringify(out.result, null, 2);
    if (json.length > 50000) {
      const tmpPath = path.join(os.tmpdir(), `maxsim-${Date.now()}.json`);
      fs.writeFileSync(tmpPath, json, 'utf-8');
      process.stdout.write('@file:' + tmpPath);
    } else {
      process.stdout.write(json);
    }
  }
}
```

### fs-utils.ts -- Consolidated File I/O

```typescript
// ── fs-utils.ts — All file I/O helpers in one place ──
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';

export function safeReadFile(filePath: string): string | null {
  try { return fs.readFileSync(filePath, 'utf-8'); } catch { return null; }
}

export async function safeReadFileAsync(filePath: string): Promise<string | null> {
  try { return await fsp.readFile(filePath, 'utf-8'); } catch { return null; }
}

export function pathExistsSync(filePath: string): boolean {
  try { fs.statSync(filePath); return true; } catch { return false; }
}

export async function pathExistsAsync(p: string): Promise<boolean> {
  try { await fsp.access(p); return true; } catch { return false; }
}

export function listSubDirs(dir: string, sortByPhase = false): string[] {
  // Import comparePhaseNum from phase-utils.ts
  const { comparePhaseNum } = require('./phase-utils.js'); // or proper import
  const dirs = fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory()).map(e => e.name);
  return sortByPhase ? dirs.sort((a, b) => comparePhaseNum(a, b)) : dirs;
}

export async function listSubDirsAsync(dir: string, sortByPhase = false): Promise<string[]> {
  const { comparePhaseNum } = await import('./phase-utils.js');
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
  return sortByPhase ? dirs.sort((a, b) => comparePhaseNum(a, b)) : dirs;
}

/** Shared JSON file loader -- replaces 10+ duplicated JSON.parse(readFileSync()) sites */
export function loadJsonFile<T = Record<string, unknown>>(filePath: string): T | null {
  const content = safeReadFile(filePath);
  if (!content) return null;
  try { return JSON.parse(content) as T; } catch { return null; }
}

export async function loadJsonFileAsync<T = Record<string, unknown>>(filePath: string): Promise<T | null> {
  const content = await safeReadFileAsync(filePath);
  if (!content) return null;
  try { return JSON.parse(content) as T; } catch { return null; }
}

export function debugLog(contextOrError: unknown, error?: unknown): void {
  if (!process.env.MAXSIM_DEBUG) return;
  if (error !== undefined) console.error(`[maxsim:${contextOrError}]`, error);
  else console.error(contextOrError);
}

export function errorMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
```

### paths.ts -- Pure Path Construction

```typescript
// ── paths.ts — Zero I/O, pure path construction ──
import path from 'node:path';

export function planningPath(cwd: string, ...segments: string[]): string {
  return path.join(cwd, '.planning', ...segments);
}

export function statePath(cwd: string): string { return planningPath(cwd, 'STATE.md'); }
export function roadmapPath(cwd: string): string { return planningPath(cwd, 'ROADMAP.md'); }
export function configPath(cwd: string): string { return planningPath(cwd, 'config.json'); }
export function phasesPath(cwd: string): string { return planningPath(cwd, 'phases'); }
```

### core.ts Facade (After Decomposition)

```typescript
// ── core.ts — Thin re-export facade for backward compatibility ──
// All code has been extracted to focused modules. This file exists so that
// `import { X } from './core.js'` continues to work in all 15 consumer modules.

// Path construction
export { planningPath, statePath, roadmapPath, configPath, phasesPath } from './paths.js';

// File I/O
export { safeReadFile, safeReadFileAsync, pathExistsSync as pathExistsInternal, pathExistsAsync, listSubDirs, listSubDirsAsync, loadJsonFile, loadJsonFileAsync, debugLog, errorMsg } from './fs-utils.js';

// Phase utilities (pure)
export { normalizePhaseName, comparePhaseNum, getPhasePattern, escapePhaseNum, isPlanFile, isSummaryFile, planId, summaryId, todayISO } from './phase-utils.js';

// Error handling (CLI-only)
export { CliOutput, CliError, output, error, rethrowCliSignals, writeOutput } from './errors.js';

// Git operations
export { execGit, isGitIgnored } from './git.js';

// Model resolution
export { MODEL_PROFILES, resolveModelInternal } from './model.js';

// Config loading
export { loadConfig, loadConfigAsync } from './config.js';

// Phase search (I/O)
export { findPhaseInternal, findPhaseInternalAsync, getArchivedPhaseDirs, getArchivedPhaseDirsAsync } from './phase-search.js';

// Roadmap read helpers
export { getRoadmapPhaseInternal, getRoadmapPhaseInternalAsync, getMilestoneInfo, getMilestoneInfoAsync, archivePath, archivePathAsync } from './roadmap-read.js';

// Slug generation
export { generateSlugInternal } from './slug.js'; // or keep in core.ts inline
```

## Integration Warnings

- **`fs-utils.ts` + `phase-utils.ts`:** `listSubDirs` needs `comparePhaseNum` for sort. Use a dynamic import or accept the cross-dependency. Since `phase-utils.ts` is pure (no I/O), this is a clean dependency direction (I/O module depends on pure module).

- **`errors.ts` + MCP tools:** The extraction of CliOutput/CliError into `errors.ts` makes the boundary explicit but does NOT prevent import. Recommend adding a Biome lint rule or tsconfig path restriction to enforce "only cli.ts imports from errors.ts."

- **`config.ts` + `model.ts`:** `resolveModelInternal` calls `loadConfig`. If `model.ts` is separate from `config.ts`, it must import from config. This is fine -- clear dependency direction.

- **`phase-search.ts` + `roadmap-read.ts`:** Both do I/O on `.planning/` files. They should NOT cross-depend. `findPhaseInternal` searches phase directories. `getRoadmapPhaseInternal` reads ROADMAP.md. Keep these independent.

- **`init.ts` sync → async conversion:** All 18 `cmdInit*` functions currently return `CmdResult` synchronously. Converting to `Promise<CmdResult>` changes the function signature. The `handleInit` handler in `cli.ts` already uses `await`, so this is safe. But the COMMANDS record typing must accept `Promise<void>` (it already does since `Handler` returns `void | Promise<void>`).

- **`verify.ts` sync → async conversion:** Same as init.ts. The `handleVerify` handler already uses `async`, so async return types are compatible.

- **Dashboard `@maxsim/core` alias:** The dashboard imports from `@maxsim/core` which resolves to `core/index.ts`. As long as index.ts re-exports everything it currently does (plus new modules), dashboard builds are unaffected.

## Effort Estimates

| Recommendation | Effort | Notes |
|---------------|--------|-------|
| Extract `paths.ts` | S | 5 functions, zero dependencies, copy-paste |
| Extract `phase-utils.ts` | S | 8 pure functions, zero I/O |
| Extract `fs-utils.ts` | S | 7 functions + add `loadJsonFile` |
| Extract `errors.ts` | S | 6 functions/classes, well-isolated |
| Extract `git.ts` | S | 2 functions, `simple-git` dependency |
| Extract `model.ts` | S | 1 constant + 1 function |
| Extract `phase-search.ts` | M | 6 functions, 350 lines, complex async logic |
| Extract `roadmap-read.ts` | M | 6 functions, 130 lines, regex patterns |
| Convert `core.ts` to facade | S | Replace function bodies with re-exports |
| Update `index.ts` barrel | S | Add new module re-exports |
| Convert `init.ts` sync → async | M | 18 functions, 14 sync fs calls |
| Convert `verify.ts` sync → async | M | 9 functions, 26 sync fs calls |
| Unify error handling (CmdResult) | L | Touch phase.ts core functions, remove throw patterns |
| Add `loadJsonFile` helper | S | Replace 10+ JSON.parse(readFileSync()) sites |

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (21 files) | Facade decomposition is ideal -- adds 8 focused files |
| 30+ core modules | Consider folder grouping: `core/phase/`, `core/state/` |
| Multiple entry points (CLI + MCP + dashboard backend) | Current architecture already handles this via barrel + direct imports |

### Scaling Priorities

1. **First bottleneck (NOW):** core.ts is the coupling bottleneck. Every change to any utility requires touching the god module. Decomposition removes this.
2. **Second bottleneck (FUTURE):** If MCP tools grow beyond 6 files and need more core functions, the barrel becomes the bottleneck. At that point, MCP tools should import from focused modules directly (not barrel).

## Sources

- Direct codebase analysis of all 21 modules in `packages/cli/src/core/`
- Direct analysis of `packages/cli/src/cli.ts` (command dispatch, error handling)
- Direct analysis of `packages/cli/src/mcp/*.ts` (6 MCP tool modules)
- Direct analysis of `packages/dashboard/src/server.ts` (dashboard imports)
- TypeScript handbook: [Module re-exports](https://www.typescriptlang.org/docs/handbook/modules.html#re-exports) [CONFIDENCE: HIGH]
- Node.js best practices for barrel files and tree-shaking [CONFIDENCE: HIGH - well-known pattern]

---
*Architecture research for: MAXSIM v5.1 module decomposition*
*Researched: 2026-03-08*
