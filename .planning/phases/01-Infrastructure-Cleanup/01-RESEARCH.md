# Phase 1: Infrastructure Cleanup - Research

**Researched:** 2026-03-09
**Domain:** Monorepo cleanup, dead code removal, build pipeline simplification, async/sync deduplication
**Confidence:** HIGH (all findings verified against source code)

---

## Summary

Phase 1 is a pure removal/cleanup phase. The codebase currently has four major infrastructure problems that must be resolved before any new features can be built: (1) the `packages/dashboard` package and associated backend server are dead weight since the dashboard is being replaced by GitHub Project Board, (2) `packages/cli/dist/` (187 files, ~21MB) is tracked in git, bloating the repository, (3) nearly every core utility function exists in both sync and async forms with behavioral divergence (BUG-1), and (4) the build pipeline has an OOM workaround (8GB heap) that should resolve once the dashboard is removed from the build.

The work is entirely subtractive -- no new features, no new APIs, no new commands. Every change removes code, removes files, or converts sync functions to their async equivalents. The risk profile is moderate: the dashboard removal is straightforward directory deletion plus reference cleanup, but the sync-to-async conversion touches `init.ts` (1060 lines) which is called by every workflow. The update checker (INFRA-04) is already implemented and functional; it only needs verification that it works without the dashboard.

**Primary recommendation:** Execute dashboard removal first (largest blast radius, simplest logic), then dist/ removal (quick win), then sync/async deduplication (most complex, highest risk), then build pipeline verification.

---

## User Constraints

### Locked Decisions (from CONTEXT.md)

**Dashboard Removal: Aggressive full removal -- no traces anywhere.**
- Delete `packages/dashboard/` entirely (Vite+React frontend + Express backend)
- Audit `packages/cli/src/core/` and remove any exports, types, or utilities that ONLY existed to support the dashboard
- Remove all dashboard references from: `copy-assets.cjs`, `install.ts`, `package.json` scripts, workspace config, CLI command router
- Remove all dashboard-specific tests AND e2e dashboard integration tests
- Remove `@maxsim/core` path alias config from tsconfig/vite/tsdown (since only dashboard used it cross-package)

**MCP Server: Leave as-is in Phase 1. Rebuild happens in a later phase.**
- Do NOT strip or modify MCP server tools in Phase 1
- The MCP server currently exposes local `.planning/` tools -- these still work and are useful
- Backend server (Express/WebSocket for dashboard) needs investigation: research must map whether `backend-server.cjs` shares code or initialization with MCP server before removal

**Deduplication: Full sweep, breaking changes, async-only throughout.**
- Scope: ALL source files in `packages/cli/src/`, not just `core.ts`
- Delete all sync function variants; keep only async versions
- Update ALL callers to use async versions -- no compatibility layer
- Fix BUG-1 (sync vs async phase search searches different paths)

**Markdown Parser Consolidation (TD-2): Conditional on research complexity.**
- Research should investigate the triple markdown parser duplication
- If straightforward: include in Phase 1. If complex: defer.

**dist/ Removal: Simple git removal, no DTS, verify CI.**
- `git rm -r --cached dist/` to remove from tracking, add to `.gitignore`
- Skip DTS generation permanently
- Remove OOM workaround after dashboard deletion
- Verify `publish.yml` builds correctly without pre-built dist/

**Known Issues Addressed:** TD-1, TD-2 (conditional), TD-3, TD-6, BUG-1

### Claude's Discretion

- Markdown parser consolidation complexity assessment
- Order of operations for the cleanup tasks

### Deferred Ideas

None captured during discussion.

---

## Standard Stack

This phase does not introduce new libraries. It removes dependencies and code.

### Dependencies to REMOVE

| Dependency | Location | Why Remove |
|-----------|----------|------------|
| `express` | `packages/cli` dependencies | Only used by backend server (dashboard). MCP server uses `@modelcontextprotocol/sdk` stdio transport. |
| `ws` | `packages/cli` dependencies | Only used by backend server WebSocket for dashboard real-time updates |
| `chokidar` | `packages/cli` dependencies | Only used by backend server file watcher for dashboard |
| `detect-port` | `packages/cli` dependencies | Used by backend server port selection and dashboard launcher |
| `@types/express` | `packages/cli` devDependencies | Type definitions for removed Express |
| `@types/ws` | `packages/cli` devDependencies | Type definitions for removed ws |
| All `packages/dashboard` deps | `packages/dashboard` | Entire package deleted |

### Dependencies to KEEP

| Dependency | Why Keep |
|-----------|----------|
| `@modelcontextprotocol/sdk` | MCP server (mcp-server.ts) uses stdio transport, completely independent of backend server |
| `zod` | Used by MCP tool parameter validation |
| `figlet` | Used by installer banner |
| `simple-git`, `slugify`, `yaml`, `escape-string-regexp` | Used by core CLI tools |
| `chalk`, `ora`, `@inquirer/prompts`, `minimist`, `fs-extra` | Used by installer |

### Workspace Configuration Changes

Remove `packages/dashboard` from root `package.json` workspaces:
```json
"workspaces": [
  "packages/cli",
  "packages/website"
]
```

---

## Architecture Patterns

### Backend Server vs MCP Server Independence (RESEARCH FINDING)

**Finding: The backend server and MCP server are FULLY SEPARATE.** They share no initialization, no code paths, and no state.

**Evidence:**
- `mcp-server.ts` (34 lines): Imports only `McpServer`, `StdioServerTransport`, and `registerAllTools` from `./mcp/index.js`. Uses stdio transport. No Express, no WebSocket, no chokidar.
- `backend-server.ts` (45 lines): Imports `createBackendServer` from `./backend/server.js`. Uses Express + WebSocket + chokidar + detect-port. Also registers MCP tools (via `registerAllTools`) but on a `StreamableHTTPServerTransport` at `/mcp` endpoint.
- The MCP tool registration (`registerAllTools`) is shared, but this is just a function call -- removing the backend server does not affect the MCP server.
- The backend server has its own parser functions (`parseRoadmap`, `parseState`, etc.) that duplicate core module logic -- these parsers are NOT used by the MCP server.

**Conclusion: Delete the entire `packages/cli/src/backend/` directory and `packages/cli/src/backend-server.ts` entry point. The MCP server is unaffected.**

### Sync/Async Deduplication Pattern

The conversion pattern is mechanical. For each sync function:

1. Delete the sync version entirely
2. Rename the async version to drop the `Async` suffix (e.g., `findPhaseInternalAsync` becomes `findPhaseInternal`)
3. Update all callers to `await` the function
4. Update the barrel exports in `index.ts`

**Critical callers that need async conversion:**
- `init.ts` -- 15+ `cmdInit*` functions use sync variants extensively (see detailed list below). These functions return `CmdResult` and are called from async handlers in `cli.ts`, so converting to `Promise<CmdResult>` is safe.
- `frontmatter.ts` -- uses `safeReadFile` and `pathExistsInternal`
- `drift.ts` -- uses `loadConfig`, `safeReadFile`, `listSubDirs`
- `state.ts` -- uses `loadConfig`, `safeReadFile`
- `context-loader.ts` -- uses `loadConfig`, `safeReadFile`, `listSubDirs`, `pathExistsInternal`
- `artefakte.ts` -- uses `safeReadFile`, `pathExistsInternal`
- `skills.ts` -- uses `safeReadFile`, `pathExistsInternal`, `loadConfig`
- `verify.ts` -- uses `loadConfig`, `findPhaseInternal`, `safeReadFile`, `listSubDirs`, `pathExistsInternal`
- `template.ts` -- uses `loadConfig`, `findPhaseInternal`, `pathExistsInternal`
- `commands.ts` -- uses `loadConfig`, `safeReadFile`, `listSubDirs`, `pathExistsInternal`, `getArchivedPhaseDirs`, `getMilestoneInfo`
- `mcp/phase-tools.ts` -- uses `findPhaseInternal`, `loadConfig`
- `mcp/context-tools.ts` -- uses `loadConfig`, `safeReadFile`
- `mcp/config-tools.ts` -- uses `loadConfig`

**Sync functions to delete (10 pairs total):**

| Sync (DELETE) | Async (KEEP & RENAME) | Callers to Update |
|---------------|-----------------------|-------------------|
| `loadConfig()` | `loadConfigAsync()` -> `loadConfig()` | init.ts, frontmatter.ts, drift.ts, state.ts, context-loader.ts, skills.ts, verify.ts, template.ts, commands.ts, mcp/phase-tools.ts, mcp/context-tools.ts, mcp/config-tools.ts |
| `searchPhaseInDir()` | `searchPhaseInDirAsync()` -> `searchPhaseInDir()` | findPhaseInternal (internal only) |
| `findPhaseInternal()` | `findPhaseInternalAsync()` -> `findPhaseInternal()` | init.ts, verify.ts, template.ts, mcp/phase-tools.ts |
| `getArchivedPhaseDirs()` | `getArchivedPhaseDirsAsync()` -> `getArchivedPhaseDirs()` | commands.ts, init.ts |
| `getRoadmapPhaseInternal()` | `getRoadmapPhaseInternalAsync()` -> `getRoadmapPhaseInternal()` | init.ts |
| `getMilestoneInfo()` | `getMilestoneInfoAsync()` -> `getMilestoneInfo()` | init.ts, commands.ts |
| `archivePath()` | `archivePathAsync()` -> `archivePath()` | Not directly called from outside core.ts |
| `pathExistsInternal()` | `pathExistsAsync()` -> `pathExistsInternal()` | init.ts, frontmatter.ts, context-loader.ts, artefakte.ts, skills.ts, verify.ts, template.ts, commands.ts |
| `listSubDirs()` | `listSubDirsAsync()` -> `listSubDirs()` | init.ts, drift.ts, context-loader.ts, commands.ts |
| `safeReadFile()` | `safeReadFileAsync()` -> `safeReadFile()` | frontmatter.ts, drift.ts, state.ts, context-loader.ts, artefakte.ts, skills.ts, verify.ts, commands.ts |

### Dashboard Removal Blast Radius

Files and directories to delete:

**Entire directories:**
- `packages/dashboard/` (entire package)
- `packages/cli/src/backend/` (5 files: server.ts, lifecycle.ts, terminal.ts, types.ts, index.ts)
- `packages/cli/src/core/dashboard-launcher.ts` (1 file)
- `packages/cli/src/core/start.ts` (1 file)
- `packages/cli/src/install/dashboard.ts` (1 file)

**Entry point to delete:**
- `packages/cli/src/backend-server.ts`

**Test files to delete:**
- `packages/cli/tests/e2e/dashboard.test.ts`
- `packages/cli/tests/e2e/dashboard-pty-absent.test.ts`

**Files to modify (remove dashboard references):**
- `package.json` (root) -- remove `packages/dashboard` from workspaces, remove `build:dashboard` script, update `build` script
- `packages/cli/package.json` -- remove `express`, `ws`, `chokidar`, `detect-port` from dependencies; remove `@types/express`, `@types/ws` from devDependencies
- `packages/cli/tsdown.config.ts` -- remove `backend-server` build entry
- `packages/cli/scripts/copy-assets.cjs` -- remove dashboard copy step (step 4)
- `packages/cli/src/cli.ts` -- remove `dashboard` command handler (~lines 443, 527-607), remove imports
- `packages/cli/src/core/index.ts` -- remove dashboard-launcher and start exports (~lines 290-308)
- `packages/cli/src/install/index.ts` -- remove dashboard import, dashboard copy section (~lines 343-368), dashboard subcommand (~lines 534-536)
- `packages/cli/tests/e2e/install.test.ts` -- remove dashboard test case (~lines 116-125)
- `packages/cli/tests/pack.test.ts` -- potentially update if it checks for backend-server.cjs

**Templates to audit (35 files reference "dashboard"):**
- These are markdown prompt files. Dashboard references in templates are informational (describing what MAXSIM has), not functional. They should be updated to remove stale dashboard references, but this is low-risk text cleanup.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Git untracking of dist/ | Custom git filter scripts | `git rm -r --cached dist/` + `.gitignore` | Standard git operation, no custom tooling needed |
| Async conversion of file I/O | Custom async wrappers | `node:fs/promises` (already used as `fsp`) | Already available in codebase, async variants already exist |
| Build memory optimization | Custom bundler config | Remove dashboard from build (root cause) | OOM is caused by bundling dashboard + backend, not by CLI itself |

---

## Common Pitfalls

### Pitfall 1: Workspace Resolution Breaks After Dashboard Removal

**What goes wrong:** Removing `packages/dashboard` from the workspace without running `npm install` (or `npm ci`) leaves stale lockfile entries. The next `npm ci` may fail if it references dashboard-specific dependencies.

**Why:** npm workspaces resolve all packages in the lockfile together. Removing a workspace member requires regenerating the lockfile.

**How to avoid:** After removing `packages/dashboard` from root `package.json` workspaces, run `npm install` to regenerate `package-lock.json`. Commit the updated lockfile.

**Warning signs:** `npm ci` fails with "missing dependency" errors referencing React, xterm, or other dashboard-only packages.

### Pitfall 2: Import Paths Break When Renaming Async Functions

**What goes wrong:** When renaming `findPhaseInternalAsync` to `findPhaseInternal`, any file that imports the old name breaks. The barrel file (`core/index.ts`) re-exports everything, so missed renames there cause runtime errors.

**Why:** The barrel file `index.ts` has 300+ exports. Missing one rename means the export exists under the old name but not the new name.

**How to avoid:** Use TypeScript compiler errors as the guide. After renaming functions in `core.ts`, run `npx tsc --noEmit` to find all broken import references. Fix each one. The barrel file re-exports will also flag errors.

**Warning signs:** `tsc` errors of the form "Module has no exported member 'findPhaseInternal'" when the function was renamed from `findPhaseInternalAsync`.

### Pitfall 3: Backend Server Removal Leaves Orphaned MCP Tool Types

**What goes wrong:** The backend server imports types from `../core/index.js` (like `RoadmapPhase`, `RoadmapMilestone`, `RoadmapAnalysis`, `PhaseStatus`). These types may exist ONLY because the backend server needed them.

**Why:** The backend server's inline parsers define their own local types but also import core types for interop.

**How to avoid:** After removing backend server imports, check which core types are still referenced. Do NOT remove types from `core/types.ts` unless they have zero remaining consumers -- they may be used by MCP tools or CLI commands. Run `npx tsc --noEmit` after removal.

**Warning signs:** Unused export warnings (if Biome catches them) or types that no longer appear in any import statement.

### Pitfall 4: CI Build Fails Without Pre-Built dist/

**What goes wrong:** The CI pipeline (`publish.yml`) runs `npm run build` before publishing. If the build script references `build:dashboard` (which no longer exists), the build fails.

**Why:** The root `package.json` `build` script is `npm run build:dashboard && npm run build:cli`. After dashboard removal, the `build:dashboard` script and its target no longer exist.

**How to avoid:** Update the root `build` script to just `npm run build:cli` (or inline the command). Verify the CI workflow still succeeds.

**Warning signs:** CI logs show "missing script: build:dashboard" error.

### Pitfall 5: init.ts Async Conversion Creates Runtime Errors in CLI Handlers

**What goes wrong:** Converting `cmdInit*` functions from sync to async changes their return type from `CmdResult` to `Promise<CmdResult>`. If a handler in `cli.ts` does not `await` the result, it gets `Promise<CmdResult>` instead of `CmdResult`, which is truthy (looks like success) but contains no data.

**Why:** The `COMMANDS` registry in `cli.ts` supports both sync and async handlers (typed as `Handler = (args, cwd, raw) => void | Promise<void>`). But `handleResult()` must receive a resolved `CmdResult`, not a Promise.

**How to avoid:** Every handler that calls a `cmdInit*` function must use `await`. Since `cli.ts` already uses `async main()` and handlers can return `Promise<void>`, this is safe. Verify every handler with `await`.

**Warning signs:** CLI commands return empty JSON `{}` or `undefined` instead of the expected context object.

### Pitfall 6: Removing dist/ From Git While CI Expects It

**What goes wrong:** If `git rm -r --cached packages/cli/dist/` is committed and pushed, the CI checkout will not have dist/ files. This is CORRECT behavior because CI runs `npm run build` which recreates dist/. But if any test or script references dist/ files that only exist after build, tests must run AFTER build.

**Why:** The pack.test.ts validates dist/ file existence. It should run after `npm run build`, which CI already does (build -> test order). Verify this ordering is maintained.

**How to avoid:** Confirm `publish.yml` runs build before test (it does: build step comes before test step in the `build-and-test` job). The test just needs dist/ to exist at test time, not at checkout time.

**Warning signs:** `pack.test.ts` fails with "file not found" for dist/cli.cjs.

---

## Code Examples

### Pattern: Async Function Conversion (core.ts)

Before (sync version to delete):
```typescript
// DELETE THIS
export function loadConfig(cwd: string): AppConfig {
  if (_configCache && _configCache.cwd === cwd) return _configCache.config;
  const cfgPath = configPath(cwd);
  try {
    const raw = fs.readFileSync(cfgPath, 'utf-8');
    // ... parse and return
  } catch {
    return { ...PLANNING_CONFIG_DEFAULTS };
  }
}
```

After (async version, renamed):
```typescript
// KEEP THIS, rename from loadConfigAsync to loadConfig
export async function loadConfig(cwd: string): Promise<AppConfig> {
  if (_configCache && _configCache.cwd === cwd) return _configCache.config;
  const cfgPath = configPath(cwd);
  if (await pathExistsAsync(cfgPath)) {
    try {
      const raw = await fsp.readFile(cfgPath, 'utf-8');
      // ... parse and return
    } catch {
      return { ...PLANNING_CONFIG_DEFAULTS };
    }
  }
  return { ...PLANNING_CONFIG_DEFAULTS };
}
```

### Pattern: Caller Conversion (init.ts)

Before:
```typescript
export function cmdInitExecutePhase(cwd: string, phase: string | null): CmdResult {
  const config = loadConfig(cwd);
  const phaseInfo = findPhaseInternal(cwd, phase!);
  // ...
}
```

After:
```typescript
export async function cmdInitExecutePhase(cwd: string, phase: string | null): Promise<CmdResult> {
  const config = await loadConfig(cwd);
  const phaseInfo = await findPhaseInternal(cwd, phase!);
  // ...
}
```

### Pattern: Root package.json After Dashboard Removal

```json
{
  "workspaces": [
    "packages/cli",
    "packages/website"
  ],
  "scripts": {
    "build": "npm run build:cli",
    "build:cli": "cd packages/cli && npx tsdown && node scripts/copy-assets.cjs",
    "test": "cd packages/cli && npx vitest run --passWithNoTests",
    "e2e": "cd packages/cli && npx vitest run --config vitest.e2e.config.ts --passWithNoTests",
    "lint": "biome check .",
    "release": "semantic-release",
    "prepare": "husky"
  }
}
```

Note: The `NODE_OPTIONS=--max-old-space-size=8192` and `cross-env` wrapper should be removed from `build:cli` after dashboard removal lightens the build. If OOM still occurs without dashboard, investigate the `backend-server` entry point bundling (which also gets removed).

### Pattern: tsdown.config.ts After Cleanup

```typescript
export default defineConfig([
  {
    ...shared,
    entry: { install: 'src/install/index.ts' },
    clean: true,
  },
  {
    ...shared,
    entry: { cli: 'src/cli.ts' },
  },
  {
    ...shared,
    entry: { 'mcp-server': 'src/mcp-server.ts' },
    noExternal: [/^@modelcontextprotocol/, /^zod/],
  },
  // Hooks remain unchanged
  { ...hookShared, entry: { 'maxsim-check-update': 'src/hooks/maxsim-check-update.ts' }, dts: false },
  { ...hookShared, entry: { 'maxsim-context-monitor': 'src/hooks/maxsim-context-monitor.ts' }, dts: false },
  { ...hookShared, entry: { 'maxsim-statusline': 'src/hooks/maxsim-statusline.ts' }, dts: false },
]);
```

---

## Markdown Parser Consolidation Assessment (TD-2)

### Finding: DEFER to a later phase.

**Complexity: HIGH. Recommendation: Do NOT include in Phase 1.**

**Reasoning:**

1. **The problem mostly goes away with dashboard removal.** Two of the three copies (in `packages/dashboard/src/server.ts` and `packages/dashboard/lib/parsers.ts`) are deleted when the dashboard package is removed. The third copy is in `packages/cli/src/backend/server.ts`, which is ALSO being deleted (backend server removal).

2. **After Phase 1, zero copies of the duplicate parsers remain.** The backend server's `parseRoadmap`, `parseState`, `parsePhases`, `parsePhaseDetail`, `parseTodos`, and `parseProject` are inline in `backend/server.ts` -- they are deleted with the backend server. The core modules (`roadmap.ts`, `state.ts`, `commands.ts`) have their own parsing logic that is not duplicated from these parsers.

3. **Therefore TD-2 is resolved as a side effect of INFRA-01 + INFRA-02.** No separate consolidation work is needed.

---

## Update Checker Assessment (INFRA-04)

### Finding: Already implemented and functional.

The update checker hook (`packages/cli/src/hooks/maxsim-check-update.ts`) already implements INFRA-04:
- Compares local installed version (from `VERSION` file) against npm registry (`npm view maxsimcli version`)
- Runs check in a background spawned process (no blocking)
- Writes result to a cache file (`~/.claude/cache/maxsim-update-check.json`)
- Has no dependency on dashboard or backend server

**The update checker has no dashboard dependencies and needs no changes for Phase 1.** It should be verified as working after the other cleanup, but requires no code changes.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|-------------|-----------------|-------------|--------|
| Sync+async function pairs | Async-only with `fs/promises` | Node.js 12+ (stable fs.promises) | Eliminates code duplication, fixes BUG-1 |
| Committed build artifacts | CI-built, `.gitignore`d dist/ | Industry standard practice | Reduces repo size by ~21MB, eliminates merge conflicts |
| Monolithic server (Express+WS+MCP+PTY) | Focused MCP server (stdio only) | Phase 1 decision | Removes ~60KB of server code, 6 runtime dependencies |

---

## Open Questions

| What We Know | What's Unclear | Recommendation |
|-------------|---------------|----------------|
| CI runs `npm run build` before test and publish | Whether removing `cross-env` and `NODE_OPTIONS` causes OOM on CI runners | Remove OOM workaround, test locally first. If OOM persists, add it back for just the CLI build (unlikely since dashboard+backend are the heavy parts) |
| 35 template files reference "dashboard" | Whether all references are informational or some are functional | Audit during dashboard removal. Most are descriptions in workflow/agent prompts. Update text but don't treat as blocking. |
| `express` is in `dependencies` (not devDependencies) | Whether removing express from dependencies affects the published package | It is safe to remove. Express is bundled into `backend-server.cjs` by tsdown (noExternal), so the npm package never requires Express as a runtime dependency. MCP server does not use Express. |

---

## Phase Requirements -> Research Support

| Req ID | Requirement | Research Support |
|--------|------------|-----------------|
| INFRA-01 | Remove dashboard package entirely | Full blast radius mapped. Dashboard and MCP server are independent. Delete `packages/dashboard/`, remove workspace reference, clean all cross-references (8 source files, 2 test files, 35 template files). |
| INFRA-02 | Remove backend server | Backend server is fully independent from MCP server. Delete `packages/cli/src/backend/` (5 files), `backend-server.ts` entry, remove from tsdown config. Remove express, ws, chokidar, detect-port dependencies. |
| INFRA-03 | Keep MCP server, refocus on GitHub Issues | MCP server (`mcp-server.ts` + `src/mcp/`) is completely independent. No changes needed in Phase 1 per CONTEXT.md decision. Leave as-is. |
| INFRA-04 | Reliable update checker | Already implemented in `maxsim-check-update.ts`. No dashboard dependencies. Verify it works after cleanup; no code changes needed. |
| INFRA-05 | Remove dist/ from git | `git rm -r --cached packages/cli/dist/` + add to `.gitignore`. CI already builds before publish. Remove OOM workaround from build script. Remove DTS (already disabled). |
| INFRA-06 | Eliminate sync/async duplication | 10 sync/async function pairs identified in `core.ts`. 14 consumer files mapped. Mechanical conversion pattern documented. Fixes BUG-1 (findPhaseInternal missing archive search). |

---

## Sources

### Primary (HIGH confidence -- verified against source code)

- `packages/cli/src/core/core.ts` -- sync/async function pairs, lines 125-829
- `packages/cli/src/mcp-server.ts` -- MCP server entry (34 lines, stdio only, no Express)
- `packages/cli/src/backend-server.ts` -- backend server entry (45 lines, Express+WS)
- `packages/cli/src/backend/server.ts` -- backend server implementation (1159 lines, inline parsers)
- `packages/cli/src/core/init.ts` -- sync function consumer (1060 lines, 15+ cmdInit functions)
- `packages/cli/tsdown.config.ts` -- build configuration (6 entry points currently)
- `packages/cli/scripts/copy-assets.cjs` -- dashboard copy step
- `packages/cli/src/install/index.ts` -- dashboard install logic
- `packages/cli/src/install/dashboard.ts` -- dashboard subcommand handler
- `packages/cli/src/core/dashboard-launcher.ts` -- dashboard lifecycle
- `packages/cli/src/core/start.ts` -- start command (dashboard wrapper)
- `packages/cli/src/cli.ts` -- CLI router with dashboard command
- `packages/cli/src/core/index.ts` -- barrel exports including dashboard-launcher
- `.github/workflows/publish.yml` -- CI pipeline (build -> test -> release)
- `.gitignore` -- does NOT exclude `packages/cli/dist/`
- `package.json` (root) -- workspace config, build scripts
- `packages/cli/package.json` -- dependencies and build config
- `.releaserc.json` -- semantic-release config (pkgRoot: packages/cli)

### Secondary (MEDIUM confidence -- cross-verified with codebase analysis)

- `.planning/codebase/CONCERNS.md` -- tech debt inventory
- `.planning/codebase/ARCHITECTURE.md` -- layer descriptions
- `.planning/codebase/STRUCTURE.md` -- file layout

---

## Metadata

| Area | Confidence | Reason |
|------|-----------|--------|
| Dashboard removal blast radius | HIGH | Verified every file reference via grep |
| Backend/MCP server independence | HIGH | Read both entry points and all imports |
| Sync/async function pairs | HIGH | Enumerated all pairs and callers from source |
| Build pipeline changes | HIGH | Read tsdown config, copy-assets, CI workflow |
| dist/ removal process | HIGH | Standard git operation, verified CI builds before publish |
| Markdown parser consolidation | HIGH | All three copies verified; two are in deleted packages, one in deleted backend |
| Update checker status | HIGH | Read implementation, confirmed no dashboard dependency |
| Template dashboard references | MEDIUM | Count verified (35 files) but not each reference individually audited |

**Research date:** 2026-03-09
**Valid until:** Phase 1 completion (findings are snapshot of current codebase state)
