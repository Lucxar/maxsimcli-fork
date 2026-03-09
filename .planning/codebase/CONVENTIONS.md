# CONVENTIONS.md

> Generated: 2026-03-09
> Focus: Code style, naming, patterns, error handling

---

## Naming Patterns

### Files

- **Core modules:** `kebab-case.ts` -- e.g. `core.ts`, `state.ts`, `phase.ts`, `roadmap.ts`, `dashboard-launcher.ts`, `context-loader.ts`
- **Type-only files:** `types.ts` in each subsystem directory (`packages/cli/src/core/types.ts`, `packages/cli/src/github/types.ts`, `packages/cli/src/backend/types.ts`)
- **Barrel files:** `index.ts` in each directory re-exports public API (`packages/cli/src/core/index.ts`, `packages/cli/src/github/index.ts`, `packages/cli/src/mcp/index.ts`)
- **Hook files:** prefixed with `maxsim-` -- `maxsim-statusline.ts`, `maxsim-context-monitor.ts`, `maxsim-check-update.ts`
- **Install submodules:** `adapters.ts`, `copy.ts`, `dashboard.ts`, `hooks.ts`, `manifest.ts`, `patches.ts`, `shared.ts`, `uninstall.ts`, `utils.ts`
- **MCP tool files:** suffixed with `-tools.ts` -- `phase-tools.ts`, `state-tools.ts`, `todo-tools.ts`, `github-tools.ts`, `config-tools.ts`, `context-tools.ts`, `roadmap-tools.ts`, `board-tools.ts`
- **Test files:** `<name>.test.ts` -- placed in `packages/cli/tests/` and `packages/cli/tests/e2e/`
- **Build scripts:** `.cjs` extension -- `copy-assets.cjs`, `scripts/*.cjs`
- **Config files at root:** `tsconfig.base.json`, `tsconfig.json`, `biome.json`, `package.json`
- **React components (dashboard):** `PascalCase.tsx` for component files, `kebab-case.ts` for hooks and utilities -- e.g. `Terminal.tsx`, `TerminalTab.tsx`, `use-dashboard-data.ts`

### Functions

- **Command handler functions:** `cmd<Domain><Action>` -- e.g. `cmdStateLoad()`, `cmdPhaseAdd()`, `cmdRoadmapAnalyze()`, `cmdFrontmatterGet()`, `cmdInitExecutePhase()`, `cmdDriftReadReport()`
- **Internal helpers:** `<domain><Action>Internal` -- e.g. `findPhaseInternal()`, `resolveModelInternal()`, `pathExistsInternal()`, `getRoadmapPhaseInternal()`
- **Async internal helpers:** append `Async` -- e.g. `findPhaseInternalAsync()`, `loadConfigAsync()`, `pathExistsAsync()`, `listSubDirsAsync()`, `safeReadFileAsync()`, `getArchivedPhaseDirsAsync()`
- **Predicate functions:** `is<Thing>` -- e.g. `isPlanFile()`, `isSummaryFile()`, `isValidType()`
- **Boolean checkers:** `has<Thing>` -- e.g. `hasFlag()`
- **Path builders:** `<thing>Path` -- e.g. `planningPath()`, `statePath()`, `roadmapPath()`, `configPath()`, `phasesPath()`, `archivePath()`
- **Core exported functions:** `phaseAddCore()`, `phaseInsertCore()`, `phaseCompleteCore()` for reusable logic called by both CLI and MCP tool layers
- **Utility functions:** `camelCase` -- e.g. `todayISO()`, `escapePhaseNum()`, `normalizePhaseName()`, `comparePhaseNum()`, `getPhasePattern()`, `debugLog()`, `errorMsg()`, `rethrowCliSignals()`
- **MCP response helpers:** `mcpSuccess()`, `mcpError()` -- never use `output()`/`error()` in MCP context
- **React hooks:** `use<Name>` -- e.g. `useDashboardData()`, `useWebSocket()`, `useTerminalLayout()`
- **React components:** `PascalCase` -- e.g. `LoadingSkeleton()`, `StatsHeader()`, `PhaseList()`, `ConnectionBanner()`

### Variables and Constants

- **Local variables:** `camelCase` -- e.g. `stateContent`, `phasePattern`, `commitResult`, `totalPlans`
- **Module-level constants:** `UPPER_SNAKE_CASE` -- e.g. `MODEL_PROFILES`, `PLANNING_CONFIG_DEFAULTS`, `FRONTMATTER_SCHEMAS`, `DRIFT_REPORT_NAME`, `DEFAULT_PORT`, `PORT_RANGE_END`, `HEALTH_TIMEOUT_MS`, `MAXSIM_LABELS`, `FIBONACCI_POINTS`, `DEFAULT_STATUS_OPTIONS`
- **Constants as maps/records:** `ARTEFAKT_FILES`, `COMMANDS`, `TEMPLATE_FILES`
- **Private caches:** `_<name>` prefix -- e.g. `_configCache`, `_cachedRoot`
- **Boolean flags:** no `is`/`has` prefix on interface properties -- e.g. `found`, `valid`, `complete`, `committed`, `recorded`, `added`, `resolved`

### Types and Interfaces

- **Type aliases:** `PascalCase` -- e.g. `CmdResult`, `AppConfig`, `AgentType`, `ModelTier`, `PhaseStatus`, `DriftStatus`, `GhErrorCode`
- **Branded types:** `PascalCase` with Brand utility -- `PhaseNumber`, `PhasePath`, `PhaseSlug`
- **Brand factory functions:** `camelCase` matching the type -- `phaseNumber()`, `phasePath()`, `phaseSlug()`
- **Interfaces:** `PascalCase` -- e.g. `PhaseSearchResult`, `RoadmapPhaseInfo`, `GitResult`, `MilestoneInfo`, `StateSnapshot`
- **Options interfaces:** `<Name>Options` -- e.g. `MilestoneCompleteOptions`, `WebSearchOptions`, `ScaffoldOptions`, `PhasesListOptions`, `StateMetricOptions`, `StateDecisionOptions`, `StateBlockerOptions`, `StateSessionOptions`
- **Result interfaces:** `<Name>Result` -- e.g. `PhaseAddResult`, `PhaseCompleteResult`, `ArchiveResult`, `MilestoneResult`, `VerificationResult`, `PlanStructureResult`, `PhaseCompletenessResult`
- **Agent context interfaces:** `<Agent>AgentContext` -- e.g. `ExecutorAgentContext`, `PlannerAgentContext`, `ResearcherAgentContext`, `VerifierAgentContext`, `DebuggerAgentContext`
- **Discriminated unions:** use `ok` field for `CmdResult` and `GhResult<T>`, `success` field for `Result<T>`, `found` field for roadmap/phase search results

---

## Code Style

### Formatting Tool / Settings

- **Linter:** Biome v2.4.4, configured in `biome.json`
- **Formatter:** Biome formatter is **disabled** (`"enabled": false`) -- code formatting is not enforced by tooling
- **Quote style:** Single quotes configured in Biome (`"quoteStyle": "single"`) but since formatter is disabled, this is advisory only. The codebase consistently uses single quotes for imports and strings.
- **Indentation:** 2 spaces (observed throughout)
- **Semicolons:** Always used
- **Trailing commas:** Used in multi-line arrays, objects, function parameters (ES5+ style)
- **Line length:** No enforced limit. Long lines exist, especially for regex patterns and inline object construction.
- **TypeScript strict mode:** Enabled in `tsconfig.base.json` (`"strict": true`)
- **Target:** ES2022 for both TypeScript and build output

### Linting Rules

- Biome linting is enabled but with `"recommended": false` -- minimal rule set, not opinionated
- Biome scope includes: `packages/*/src/**/*.ts`, `packages/*/src/**/*.tsx`, `scripts/**/*.cjs`
- Run command: `npm run lint` (or `biome check .`)

---

## Import Organization

### Order

Imports follow a consistent three-group pattern separated by blank lines:

1. **Node built-in modules** with `node:` protocol prefix -- always first
2. **Third-party npm packages** -- second group
3. **Internal/project imports** -- third group, with `type` imports separated from value imports

Example from `packages/cli/src/core/state.ts`:
```typescript
import { promises as fsp } from 'node:fs';
import path from 'node:path';

import escapeStringRegexp from 'escape-string-regexp';

import { loadConfig, rethrowCliSignals, safeReadFileAsync, ... } from './core.js';
import type { AppConfig, StatePatchResult, ... } from './types.js';
import { cmdOk, cmdErr } from './types.js';
```

### Key Rules

- Use `node:` protocol prefix for all Node.js built-ins: `import fs from 'node:fs'`, `import path from 'node:path'`, `import os from 'node:os'`
- Use `.js` extension on all relative imports (required by NodeNext module resolution): `from './core.js'`, `from './types.js'`, `from '../core/phase.js'`
- Separate `type` imports from value imports: `import type { ... } from './types.js'` on its own line
- Sometimes combine type and value from same module: `import { cmdOk, cmdErr, type CmdResult } from './types.js'`
- Default imports for third-party libraries: `import YAML from 'yaml'`, `import chalk from 'chalk'`, `import slugify from 'slugify'`
- Named imports for Node.js modules: `import * as fs from 'node:fs'` or `import fs from 'node:fs'` (both patterns exist; default import is more common)
- Destructured imports from own modules preferred: `import { safeReadFile, planningPath, ... } from './core.js'`

### Path Aliases

- **Dashboard package:** `@/*` maps to `./src/*` via tsconfig paths (`@/components/...`, `@/hooks/...`, `@/lib/...`)
- **Dashboard package:** `@maxsim/core` maps to `../cli/src/core/index.ts` -- cross-package type sharing
- **CLI package:** No path aliases. All imports are relative (`./core.js`, `../github/types.js`)

---

## Error Handling

### CmdResult Pattern (CLI tools)

All `cmd*` functions return `CmdResult` -- a discriminated union:

```typescript
export type CmdResult =
  | { ok: true; result: unknown; rawValue?: unknown }
  | { ok: false; error: string };
```

Use factory functions:
- `cmdOk(result, rawValue?)` for success
- `cmdErr(error)` for errors

Never call `process.exit()` from `cmd*` functions. Never call `output()`/`error()` directly -- those throw `CliOutput`/`CliError` which are caught only by the CLI entry point (`cli.ts`).

### CliOutput/CliError Pattern (flow control)

The `output()` and `error()` functions in `core.ts` throw special non-Error objects:

```typescript
export function output(result: unknown, raw?: boolean, rawValue?: unknown): never {
  throw new CliOutput(result, raw, rawValue);
}
export function error(message: string): never {
  throw new CliError(message);
}
```

The CLI entry point (`cli.ts` `main()`) catches these and converts them to process exit codes:
- `CliOutput` -> write to stdout, exit 0
- `CliError` -> write to stderr, exit 1

Any catch block in a `cmd*` function must call `rethrowCliSignals(e)` first to avoid intercepting these flow-control throws:

```typescript
try {
  // ...
} catch (e: unknown) {
  rethrowCliSignals(e);
  return cmdErr('descriptive error message');
}
```

### GhResult Pattern (GitHub integration)

The GitHub layer uses its own discriminated union:

```typescript
export type GhResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: GhErrorCode };
```

Never call `process.exit()` in GitHub modules -- return `GhResult` instead. This enables graceful degradation (e.g., `detectGitHubMode()` returns `'local-only'` when gh is not available).

### MCP Error Pattern

MCP tools use `mcpSuccess()` and `mcpError()` helpers from `packages/cli/src/mcp/utils.ts`:

```typescript
return mcpSuccess(data, 'Summary message');
return mcpError('Error description', 'Short summary');
```

**Critical rules for MCP context:**
- Never import `output()` or `error()` from core (they call process.exit)
- Never write to stdout (reserved for MCP JSON-RPC protocol)
- Never call `process.exit()` (server must stay alive)

### Result<T> Pattern (typed operations)

A simpler generic result type for internal operations:

```typescript
export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string };
```

### Safe File Reading

Use `safeReadFile()` (sync) or `safeReadFileAsync()` (async) when a file may not exist. Returns `null` on failure instead of throwing:

```typescript
const content = safeReadFile(filePath);
if (!content) { /* handle missing file */ }
```

### Catch Block Pattern

Always catch `unknown`, then handle:

```typescript
} catch (e: unknown) {
  rethrowCliSignals(e);  // Always first in cmd* functions
  return cmdErr('Message: ' + (e as Error).message);
}
```

Or for optional operations:

```typescript
} catch (e) {
  /* optional op, ignore */
  debugLog(e);
}
```

---

## Logging

### Framework

- **Debug logging:** `debugLog()` from `packages/cli/src/core/core.ts` -- only outputs when `MAXSIM_DEBUG` env var is set
- **No general logging framework** -- the CLI outputs structured JSON to stdout via `CliOutput`
- **Console output:** `console.log()` used directly in install scripts and dashboard launcher for user-facing messages. `console.warn()` for non-fatal warnings. `console.error()` for debug logging.
- **Hooks:** Silent fail pattern -- hooks never block execution, catch blocks call `process.exit(0)` on error

### Patterns

```typescript
// Context-labeled debug logging
debugLog('config-load-failed', e);
debugLog('exec-git-failed', { args, error: message });

// Silent fail for optional operations
} catch (e) {
  /* optional op, ignore */
  debugLog(e);
}

// User-facing messages in install/launcher (only)
console.log(`Dashboard ready at http://localhost:${readyPort}`);
console.warn('node-pty installation failed -- terminal will be unavailable.');
```

### Output Large Results

When JSON output exceeds 50KB, write to a tmpfile and return `@file:/path` reference:

```typescript
if (json.length > 50000) {
  const tmpPath = path.join(os.tmpdir(), `maxsim-${Date.now()}.json`);
  fs.writeFileSync(tmpPath, json, 'utf-8');
  process.stdout.write('@file:' + tmpPath);
}
```

---

## Comments

### When to Comment

- **Module-level JSDoc:** Every `.ts` file has a top-level `/** ... */` block describing purpose and provenance:
  ```typescript
  /**
   * State -- STATE.md operations and progression engine
   *
   * Ported from maxsim/bin/lib/state.cjs
   */
  ```
- **Section separators:** Visual dividers using `// --- Section Name ---` pattern:
  ```typescript
  // --- Internal helpers -------------------------------------------------------
  // --- State commands ---------------------------------------------------------
  // --- State Progression Engine -----------------------------------------------
  ```
- **Function-level JSDoc:** Single-line `/** description */` for exported functions and key internal helpers
- **Inline comments:** Sparingly, primarily to explain non-obvious regex patterns or tricky logic
- **Critical warnings:** `CRITICAL:` prefix in JSDoc for MCP modules:
  ```typescript
  * CRITICAL: Never import output() or error() from core -- they call process.exit().
  * CRITICAL: Never write to stdout -- it is reserved for MCP JSON-RPC protocol.
  ```
- **Catch block annotations:** `/* optional op, ignore */` when intentionally swallowing errors

### JSDoc/TSDoc

- Use `/** ... */` style (not `//`)
- Single-line for simple descriptions: `/** Today's date as YYYY-MM-DD. */`
- Multi-line for complex functions with `@param` and `@returns` (rare -- most functions are self-documenting)
- No TSDoc tags for most functions -- the single-line description suffices

---

## Function Design

### Size

- Functions are moderate size, typically 20--80 lines
- The `main()` function in `cli.ts` is ~50 lines
- Handler functions like `cmdStateSnapshot()` can reach ~90 lines
- `loadConfig()` is ~65 lines (includes all config parsing logic)
- Longer functions exist for complex operations like `cmdRoadmapAnalyze()` -- keep logic in one place rather than splitting prematurely

### Parameters

- **First parameter:** `cwd: string` -- the project working directory, passed explicitly to all command functions
- **Second parameter:** varies by domain -- phase number, file path, options object
- **Options objects:** Use typed interfaces for multi-parameter commands (e.g. `StateMetricOptions`, `MilestoneCompleteOptions`)
- **Raw flag:** `raw: boolean` as final parameter where applicable -- controls whether output is JSON or raw text
- **Null vs undefined:** Parameters that may be absent use `string | null` or `string | undefined` -- not consistently one or the other, but `null` is more common for explicit "not provided" cases

### Returns

- **`cmd*` functions:** Always return `CmdResult` (sync) or `Promise<CmdResult>` (async)
- **Internal functions:** Return `T | null` when the value may not exist
- **`never` return type:** Used on `output()` and `error()` to signal they always throw
- **Boolean returns:** `pathExistsInternal()`, `isGitIgnored()` return plain booleans for simple checks
- **Void returns:** `scaffoldPhaseStubs()`, `debugLog()` for side-effect-only functions

### Dual Sync/Async Functions

The codebase maintains both sync and async versions of frequently used internal functions:
- `loadConfig()` / `loadConfigAsync()`
- `findPhaseInternal()` / `findPhaseInternalAsync()`
- `safeReadFile()` / `safeReadFileAsync()`
- `listSubDirs()` / `listSubDirsAsync()`
- `pathExistsInternal()` / `pathExistsAsync()`
- `getArchivedPhaseDirs()` / `getArchivedPhaseDirsAsync()`

Use sync versions in synchronous `cmd*` functions, async versions in `async cmd*` functions. Prefer async versions in new code.

---

## Module Design

### Exports

- **Barrel file pattern:** `packages/cli/src/core/index.ts` re-exports everything from all core modules
- **Type-only exports:** `export type { ... }` separated from value exports in barrel files
- **Named exports only:** No default exports anywhere in the CLI package
- **Scoped re-exports:** Each section in `index.ts` is grouped by source module with a comment header
- **Direct imports in MCP/backend:** MCP tools import directly from `../core/core.js` and `../core/phase.js` rather than through the barrel file

### Barrel Files

The main barrel file `packages/cli/src/core/index.ts` follows this structure:
1. Type-only exports from `./types.js`
2. Runtime value exports from `./types.js` (factory functions, constants)
3. Runtime exports from `./core.js` (shared utilities)
4. Module-specific exports grouped by file: frontmatter, config, state, roadmap, milestone, commands, verify, drift, phase, template, artefakte, context-loader, skills, start, dashboard-launcher, init

### Module Boundaries

- `core.ts` -- shared micro-utilities, path builders, git helpers, model resolution, phase sorting
- `types.ts` -- all type definitions, branded types, result type factories
- `state.ts` -- STATE.md parsing, CRUD, progression engine
- `phase.ts` -- Phase directory CRUD, archive, lifecycle
- `roadmap.ts` -- ROADMAP.md parsing, analysis
- `commands.ts` -- Standalone utility commands (slug, timestamp, todos, progress, commit, scaffold)
- `verify.ts` -- Verification suite, health checks, consistency validation
- `config.ts` -- config.json CRUD
- `frontmatter.ts` -- YAML frontmatter parsing and CRUD
- `init.ts` -- Context assembly for each workflow type
- `milestone.ts` -- Milestone completion and archiving
- `template.ts` -- Template scaffolding and filling
- `artefakte.ts` -- DECISIONS.md, ACCEPTANCE-CRITERIA.md, NO-GOS.md CRUD
- `context-loader.ts` -- Load context files for agent consumption
- `drift.ts` -- Drift report CRUD, spec extraction
- `skills.ts` -- Skill template list/install/update
- `start.ts` -- Start command (launches backend + dashboard)
- `dashboard-launcher.ts` -- Dashboard health check, spawn, process management

### No Circular Dependencies

Each module imports from `./core.js` and `./types.js` but not from sibling command modules. The dependency tree is:
```
types.ts  <--  core.ts  <--  [all other modules]
                  ^
                  |
            frontmatter.ts  <--  [state, commands, verify, milestone, drift, skills, artefakte]
```

---

## File Encoding and I/O

- Always use `'utf-8'` encoding for `readFileSync`, `writeFileSync`, `readFile`, `writeFile`
- Use `fs.mkdirSync(dir, { recursive: true })` when creating directories
- Use `path.join()` for all path construction -- never string concatenation
- Use `path.isAbsolute()` to check before resolving relative paths: `const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath)`
- Prefer `fs.promises` (imported as `fsp`) in async functions, `fs` (sync) in sync functions
- Use `{ withFileTypes: true }` on `readdirSync`/`readdir` when filtering directories

---

## Pattern: Handler Registry

The CLI uses a registry pattern in `packages/cli/src/cli.ts` where a `Record<string, Handler>` maps command names to handler functions:

```typescript
type Handler = (args: string[], cwd: string, raw: boolean) => void | Promise<void>;

const COMMANDS: Record<string, Handler> = {
  'state': handleState,
  'resolve-model': (args, cwd, raw) => handleResult(cmdResolveModel(cwd, args[1], raw), raw),
  // ...
};
```

Sub-commands within a domain (e.g. `state update`, `state get`) use a nested record:

```typescript
const handlers: Record<string, () => CmdResult | Promise<CmdResult>> = {
  'update': () => cmdStateUpdate(cwd, args[2], args[3]),
  'get': () => cmdStateGet(cwd, args[2], raw),
  // ...
};
const handler = sub ? handlers[sub] : undefined;
if (handler) return handleResult(await handler(), raw);
```

---

## Pattern: Caching

- **Config cache:** Module-level `_configCache` in `core.ts` -- keyed by `cwd`, invalidated on different `cwd`
- **Project root cache:** `_cachedRoot` in `packages/cli/src/mcp/utils.ts` -- only cached for default cwd (no startDir argument)
- **No external cache library** -- simple in-memory object caching

---

## Pattern: Safe Defaults

When loading configuration, always define a full defaults object and merge over it:

```typescript
const defaults: AppConfig = {
  model_profile: 'balanced',
  commit_docs: true,
  search_gitignored: false,
  branching_strategy: 'none',
  // ...
};
```

Use nullish coalescing (`??`) to merge parsed values over defaults, field by field.

---

## Pattern: Markdown as Data Store

The codebase treats Markdown files as structured data stores:
- `STATE.md` -- fields extracted via regex patterns matching `**Field:** value`
- `ROADMAP.md` -- phase sections parsed via `## Phase N: Name` heading patterns
- `REQUIREMENTS.md` -- checkboxes and tables updated programmatically
- Plan/Summary `.md` files -- YAML frontmatter parsed via the `yaml` npm package
- All parsing uses tolerant regex patterns that handle `##` or `###` headings, optional whitespace, and variant formatting

---

## Pattern: as const Assertions

Use `as const` for static configuration arrays and objects:

```typescript
export const MAXSIM_LABELS = [
  { name: 'maxsim', color: '6f42c1', description: 'MAXSIM managed issue' },
  // ...
] as const;

export const FIBONACCI_POINTS = [1, 2, 3, 5, 8, 13, 21, 34] as const;
export const DEFAULT_STATUS_OPTIONS = ['To Do', 'In Progress', 'In Review', 'Done'] as const;
```

---

## Pattern: Cross-Package Type Sharing

The dashboard package imports types from the CLI package without a dependency:
- tsconfig `paths`: `"@maxsim/core": ["../cli/src/core/index.ts"]`
- Vite config alias resolves at build time
- tsdown alias resolves at build time for the server bundle
- Only type-level imports are safe across packages -- no runtime value imports between packages except through the alias
