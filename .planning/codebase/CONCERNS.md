# Codebase Concerns

**Mapped:** 2026-03-09
**Focus:** Tech debt, known issues, security considerations, performance, fragile areas

---

## Tech Debt

### TD-1: Massive Sync/Async Function Duplication in `core.ts`

**Area:** Core utilities
**Issue:** Nearly every core function has both a synchronous and asynchronous version with identical logic. The sync/async pairs include: `loadConfig`/`loadConfigAsync`, `searchPhaseInDir`/`searchPhaseInDirAsync`, `findPhaseInternal`/`findPhaseInternalAsync`, `getArchivedPhaseDirs`/`getArchivedPhaseDirsAsync`, `getRoadmapPhaseInternal`/`getRoadmapPhaseInternalAsync`, `getMilestoneInfo`/`getMilestoneInfoAsync`, `archivePath`/`archivePathAsync`, `pathExistsInternal`/`pathExistsAsync`, `listSubDirs`/`listSubDirsAsync`, `safeReadFile`/`safeReadFileAsync`.
**Files:**
- `packages/cli/src/core/core.ts` (842 lines, ~50% is duplication)
**Impact:** High. Every bug fix or logic change must be applied twice. Divergence risk is severe -- the sync `findPhaseInternal` searches legacy `.planning/milestones/` but NOT `.planning/archive/`, while the async `findPhaseInternalAsync` searches both `.planning/archive/` AND `.planning/milestones/`. This means `init.ts` (which uses sync `findPhaseInternal`) behaves differently from `phase.ts` (which uses async `findPhaseInternalAsync`) when looking for archived phases.
**Fix approach:** Remove all sync versions. The CLI entry point (`cli.ts`) already uses `async main()`. The `init.ts` module is the primary consumer of sync versions -- convert its exported functions to async. Since these are all called from `cli.ts` handlers that already support `async`, this is straightforward.

### TD-2: Triple Duplication of Markdown Parsers

**Area:** Dashboard and backend server
**Issue:** The parsing functions (`parseRoadmap`, `parseState`, `parsePhases`, `parsePhaseDetail`, `parseTodos`, `parseProject`) exist in three independent copies with slightly different implementations.
**Files:**
- `packages/cli/src/backend/server.ts` (lines 125-432)
- `packages/dashboard/src/server.ts` (lines 329-642)
- `packages/dashboard/lib/parsers.ts` (458 lines -- appears to be an extracted copy)
**Impact:** Medium-high. Bug fixes or parsing improvements must be applied in 3 places. The `dashboard/lib/parsers.ts` was extracted but `dashboard/src/server.ts` still contains its own inline copies. The backend server (`packages/cli/src/backend/server.ts`) is a newer addition that also copied these parsers rather than sharing them.
**Fix approach:** Use the `@maxsim/core` path alias (already configured for the dashboard) to expose parsers from a shared location in `packages/cli/src/core/`. The backend server already imports from `../core/index.js`.

### TD-3: Build Artifacts Committed to Git

**Area:** Build and repository
**Issue:** The `packages/cli/dist/` directory (187 tracked files, ~21MB) is committed to the git repository. This includes bundled JavaScript, sourcemaps, dashboard client assets, and hook bundles. Every build creates large diffs and the repository grows continuously.
**Files:**
- `packages/cli/dist/` (187 files, 21MB)
- `.gitignore` -- does NOT exclude `packages/cli/dist/`
**Impact:** Medium. Repository bloat, noisy git diffs, merge conflicts on dist files, slow clones. The git status shows these as modified on every build cycle.
**Fix approach:** Add `packages/cli/dist/` to `.gitignore`. The CI/CD pipeline already runs `npm run build` before publish -- the dist files do not need to be in the repository. Ensure the `publish.yml` workflow builds before publishing (it already does per CLAUDE.md).

### TD-4: `init.ts` Uses Synchronous I/O Throughout

**Area:** Context initialization
**Issue:** All `cmdInit*` functions in `init.ts` (1060 lines) use synchronous filesystem operations via `findPhaseInternal`, `loadConfig`, `pathExistsInternal`, `listSubDirs`, `getMilestoneInfo`, and direct `fs.readdirSync` calls. This blocks the Node.js event loop during context assembly.
**Files:**
- `packages/cli/src/core/init.ts` (1060 lines)
**Impact:** Low for CLI tool usage (single-request process), but medium for backend server or MCP server contexts where the event loop matters. The CLI is a short-lived process so blocking is acceptable there, but if init functions are ever called from the backend server, they would block all concurrent requests.
**Fix approach:** Convert to async using the async variants already available in `core.ts`. Since all callers in `cli.ts` already support async handlers, this is backward-compatible.

### TD-5: Node.js >=22 Requirement

**Area:** Platform compatibility
**Issue:** The `engines` field requires Node.js >=22.0.0. This excludes users on LTS Node 20 (active LTS until April 2026). The codebase uses `fetch()` (available since Node 18), `AbortSignal.timeout()` (Node 18+), and `fs.cp()` (Node 16.7+ stable). No Node 22-specific APIs are apparent.
**Files:**
- `packages/cli/package.json` (line 19)
- Root `package.json` (line 12)
**Impact:** Low-medium. Some users may not have Node 22 installed. Claude Code ships with its own Node runtime, but `npx maxsimcli` uses the user's system Node.
**Fix approach:** Test on Node 20 LTS. If no Node 22-specific APIs are required, lower the minimum to `>=20.0.0`.

### TD-6: OOM Build Workaround

**Area:** Build pipeline
**Issue:** The CLI build requires `NODE_OPTIONS=--max-old-space-size=8192` and DTS generation was disabled (`dts: false` in `tsdown.config.ts`) to prevent OOM crashes during build. This is a workaround, not a fix -- the bundler is consuming excessive memory.
**Files:**
- Root `package.json` (line 27: `build:cli` script)
- `packages/cli/tsdown.config.ts` (line 10: `dts: false`)
**Impact:** Medium. No TypeScript declarations are generated for the published package. Users who import from `maxsimcli` programmatically get no type information. The 8GB memory requirement makes CI builds fragile.
**Fix approach:** Investigate which tsdown entry point causes the OOM. The `backend-server` entry with `noExternal` for express, ws, chokidar, and detect-port likely bundles excessive code. Consider splitting the backend server into a separate build step or using dynamic imports for heavy dependencies.

---

## Known Bugs

### BUG-1: Sync vs Async Phase Search Behavioral Divergence

**Symptoms:** Init commands (context assembly) may fail to find phases that exist in `.planning/archive/` while phase operations succeed.
**Files:**
- `packages/cli/src/core/core.ts` -- `findPhaseInternal()` (line 376) only searches `.planning/milestones/` for archived phases
- `packages/cli/src/core/core.ts` -- `findPhaseInternalAsync()` (line 655) searches both `.planning/archive/` and `.planning/milestones/`
**Trigger:** User archives phases using the new archive system, then uses init commands (which call `findPhaseInternal` sync) to reference those phases.
**Workaround:** None. The sync function is missing the `.planning/archive/` search path entirely.

### BUG-2: Port Hash Collision Between Dashboard and Backend Server

**Symptoms:** Dashboard and backend server may attempt to bind the same port for different projects, or different projects may collide.
**Files:**
- `packages/cli/src/backend/lifecycle.ts` (line 16-22): `projectPort()` uses `hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0` mapping to range 3100-3199
- `packages/dashboard/src/server.ts` (line 66-72): `projectPort()` uses `hash = ((hash << 5) + hash + ch.charCodeAt(i)) >>> 0` mapping to range 3100-3199
**Trigger:** Two implementations use different hash algorithms (djb2 vs. a different variant) for the same purpose, potentially computing different ports for the same project path. Also, with only 100 ports in the range, projects collide with ~1% probability per project pair.
**Workaround:** Both use `detect-port` to find a free port, so the collision causes a port shift rather than a crash. But the deterministic port feature (finding a running server by project path) breaks when the hash algorithms disagree.

### BUG-3: Config Cache is Global Module-Level Singleton

**Symptoms:** Stale config after config.json changes within the same process lifetime (backend server, MCP server).
**Files:**
- `packages/cli/src/core/core.ts` (line 178): `let _configCache: { cwd: string; config: AppConfig } | null = null;`
**Trigger:** User modifies `.planning/config.json` while the backend or MCP server is running. The cache has no TTL or invalidation mechanism.
**Workaround:** Restart the backend/MCP server after config changes.

---

## Security Considerations

### SEC-1: No Authentication on Backend Server HTTP API

**Risk:** Critical when network mode is enabled
**Files:**
- `packages/cli/src/backend/server.ts` -- Express app has no auth middleware
- `packages/dashboard/src/server.ts` -- Express app has no auth middleware
**Current mitigation:** The backend server binds to `127.0.0.1` by default. Network mode is opt-in during install.
**Recommendations:**
1. Add a shared secret token (generated at server start, stored in lock file, passed to dashboard client) for all API endpoints when network mode is enabled.
2. Add rate limiting to prevent brute-force or DOS attacks.
3. The `/api/shutdown` endpoint can shut down the server from any local process -- add authentication.
4. The `PUT /api/plan/*` endpoint allows arbitrary file writes within `.planning/` -- ensure the `isWithinPlanning()` guard handles symlink traversal.

### SEC-2: Terminal WebSocket Allows `--dangerously-skip-permissions` Flag

**Risk:** High
**Files:**
- `packages/cli/src/backend/terminal.ts` (line 112): Constructs `claude --dangerously-skip-permissions` when `skipPermissions` is true
- `packages/cli/src/backend/server.ts` (line 1031): `skipPermissions: !!msg.skipPermissions` -- client WebSocket message controls this flag
**Current mitigation:** None. Any WebSocket client can request a terminal session with `skipPermissions: true`.
**Recommendations:** Never pass `--dangerously-skip-permissions` based on a client message. This flag should require explicit user consent at the server/CLI level, not be controllable from the WebSocket API.

### SEC-3: `req.body` Casting Without Validation

**Risk:** Medium
**Files:**
- `packages/cli/src/backend/server.ts` -- 8 instances of `req.body as { ... }` with no runtime validation
**Current mitigation:** Some endpoints check for required fields after casting, but no schema validation (despite `zod` being a dependency).
**Recommendations:** Use Zod schemas to validate all incoming request bodies. The `zod` package is already in `dependencies`.

### SEC-4: `execSync` with Shell Commands for Process Management

**Risk:** Low (values are not user-controlled)
**Files:**
- `packages/cli/src/core/dashboard-launcher.ts` (lines 64, 76, 86): `execSync` with `netstat`, `taskkill`, `lsof` commands
- `packages/cli/src/install/dashboard.ts` (lines 34, 40, 46, 50): `execSync` for firewall rule management
**Current mitigation:** The port number is an integer, not a user string. But the firewall management functions use `execSync` with constructed commands.
**Recommendations:** Validate that port values are within expected ranges before constructing shell commands. Use `process.kill()` directly instead of `taskkill`/`lsof` where possible.

### SEC-5: MCP Project Root Detection Walks Filesystem

**Risk:** Low
**Files:**
- `packages/cli/src/mcp/utils.ts` (line 17-49): `detectProjectRoot()` walks up from cwd looking for `.planning/` directory
**Current mitigation:** 100-iteration safety limit prevents infinite loops.
**Recommendations:** The cached root (`_cachedRoot`) persists across tool calls. If the MCP server's cwd changes (unlikely but possible), stale cache could point to the wrong project.

---

## Performance Bottlenecks

### PERF-1: Synchronous I/O in Backend Server Request Handlers

**Problem:** Every API endpoint in the backend server uses synchronous `fs.readFileSync`, `fs.existsSync`, `fs.readdirSync`, and `fs.writeFileSync` calls.
**Files:**
- `packages/cli/src/backend/server.ts` -- 23 synchronous file operations across request handlers
**Cause:** Parser functions (`parseRoadmap`, `parseState`, etc.) were written with sync I/O. Express request handlers call these synchronously, blocking the event loop for all concurrent requests and WebSocket connections.
**Improvement path:** Convert parser functions to use `fs.promises` or the async variants already in `core.ts`. Express handlers already support async route handlers via `async (req, res) => { ... }`.

### PERF-2: Dashboard Port Scanning is Sequential

**Problem:** `findRunningDashboard()` in `dashboard-launcher.ts` checks ports 3333-3343 sequentially, each with a 10-second timeout.
**Files:**
- `packages/cli/src/core/dashboard-launcher.ts` (lines 48-54)
**Cause:** Sequential `await checkHealth(port)` calls in a for-loop. Worst case: 110 seconds if no dashboard is running.
**Improvement path:** Use `Promise.all()` or `Promise.race()` to check all ports concurrently. The `listRunningDashboards()` function in `packages/dashboard/src/server.ts` (lines 77-94) already does this correctly with `Promise.all()`.

### PERF-3: History Digest Reads All Summary Files Synchronously

**Problem:** `cmdHistoryDigest` in `commands.ts` reads every summary file from every phase (including archived) synchronously in a nested loop.
**Files:**
- `packages/cli/src/core/commands.ts` (lines 171-285)
**Cause:** Sync `fs.readdirSync` and `fs.readFileSync` for every summary file across all phases and archives.
**Improvement path:** Use `Promise.all()` with `fsp.readFile` to read files in parallel. Add a caching layer for archived phases (their summaries never change).

---

## Fragile Areas

### FRAG-1: Markdown Regex-Based State Machine

**Files:**
- `packages/cli/src/core/state.ts` -- `stateExtractField()`, `stateReplaceField()`, `appendToStateSection()`
- `packages/cli/src/core/phase.ts` -- `phaseCompleteCore()` (lines 223-378) uses 8+ regex replacements on ROADMAP.md
- `packages/cli/src/core/core.ts` -- `getPhasePattern()` returns a regex for matching phase headers
**Why fragile:** The entire state and roadmap management is built on regex-based parsing and replacement of markdown files. Any formatting change by a user or AI agent (extra whitespace, different heading levels, missing bold markers) can break extraction or replacement. The `stateReplaceField` function attempts two patterns (bold and plain) but cannot handle all markdown variations.
**Safe modification:** Always test regex changes against real `.planning/STATE.md` and `.planning/ROADMAP.md` files from user projects. Never assume heading level or whitespace.
**Test coverage gaps:** Unit tests in `tests/unit/state-errors.test.ts` cover error paths but not the regex matching variations. The `tests/unit/parsing.test.ts` covers frontmatter parsing but not markdown section parsing.

### FRAG-2: Phase Renumbering in `cmdPhaseRemove`

**Files:**
- `packages/cli/src/core/phase.ts` (lines 694-919)
**Why fragile:** When a phase is removed, all subsequent phases are renumbered. This involves: renaming directories, renaming files within directories, updating ROADMAP.md with bulk regex replacements (iterating from maxPhase down to removedPhase), and updating STATE.md. A failure at any step leaves the project in an inconsistent state -- there is no transaction or rollback mechanism.
**Safe modification:** Test with phases that have decimal sub-phases (e.g., removing phase 2 when 2.1, 2.2 exist). Test with letter-suffixed phases (2A, 2B).
**Test coverage gaps:** `tests/unit/phase-errors.test.ts` tests error cases but not the renumbering logic itself.

### FRAG-3: CliOutput/CliError Throw-Based Flow Control

**Files:**
- `packages/cli/src/core/core.ts` (lines 49-80): `CliOutput` and `CliError` classes
- `packages/cli/src/cli.ts` (lines 513-524): Catch block differentiating `CliOutput` from `CliError`
- All core modules use `rethrowCliSignals(e)` in catch blocks
**Why fragile:** `output()` and `error()` throw exceptions as control flow (typed as `never`). Every `try/catch` in the codebase must call `rethrowCliSignals(e)` or risk swallowing successful output. The MCP server and backend server have "CRITICAL" comments warning against importing these functions, which indicates this is a known footgun. Any new module that catches errors must remember to rethrow CLI signals.
**Safe modification:** Never add generic `catch` blocks without `rethrowCliSignals()`. When writing MCP tool handlers, never import `output` or `error` -- use `mcpSuccess`/`mcpError` from `mcp/utils.ts` instead.
**Test coverage gaps:** No tests verify that `rethrowCliSignals` is called in all catch blocks.

### FRAG-4: Dashboard Server vs Backend Server Coexistence

**Files:**
- `packages/cli/src/backend/server.ts` -- Backend server on ports 3100-3199
- `packages/dashboard/src/server.ts` -- Dashboard server on ports 3100-3199 and 3333-3343
- `packages/cli/src/core/dashboard-launcher.ts` -- Dashboard launcher on ports 3333-3343
**Why fragile:** Three separate server implementations exist with overlapping port ranges and different architectures. The backend server (`packages/cli/src/backend/`) was added as a newer alternative to the dashboard server but both are still functional. The dashboard launcher checks ports 3333-3343, the backend lifecycle checks ports 3100-3199, and the dashboard server also checks 3100-3199. Which server is running depends on how the user started it.
**Safe modification:** Always check both port ranges when detecting running instances. Be aware that the dashboard server and backend server are independent codebases with duplicated parsing logic.

---

## Scaling Limits

### SCALE-1: File-Based State Management

**Current capacity:** Works well for projects with <50 phases and <200 plan files.
**Limit:** ROADMAP.md and STATE.md are read, regex-parsed, and rewritten on every operation. Large projects with 100+ phases will see increasing latency as file sizes grow.
**Scaling path:** The file-based approach is intentional (human-readable, git-trackable). For very large projects, consider caching parsed structures in memory (the backend server already serves from memory) and only re-parsing on file change events.

### SCALE-2: Backend Server Single-Process Architecture

**Current capacity:** One backend server per project.
**Limit:** The backend server serves HTTP, WebSocket, MCP, and terminal connections in a single process. Heavy terminal output or many concurrent dashboard connections can cause event loop delays, especially with synchronous file I/O in request handlers.
**Scaling path:** Convert sync I/O to async. Consider worker threads for heavy parsing operations.

---

## Dependencies at Risk

### DEP-1: `node-pty` Native Module

**Risk:** Installation failure on some platforms (Windows, older Linux)
**Impact:** Terminal feature in dashboard becomes unavailable. The installer auto-installs via `npm install node-pty` which requires a C++ build toolchain.
**Migration plan:** Already handled gracefully -- `PtyManager` in `packages/cli/src/backend/terminal.ts` catches load errors and falls back to a "terminal unavailable" message. The `try { pty = require('node-pty') } catch` pattern (line 41) handles missing native modules.

### DEP-2: `chokidar` for File Watching

**Risk:** Low. Chokidar v4 is mature and actively maintained.
**Impact:** File change notifications in the dashboard would stop if chokidar breaks.
**Migration plan:** Node.js 20+ has `fs.watch` with `recursive: true` support on Windows and macOS. Consider using native `fs.watch` to eliminate this dependency.

### DEP-3: `@modelcontextprotocol/sdk` Pre-1.0 API Surface

**Risk:** Medium. The MCP SDK is actively evolving.
**Impact:** Breaking changes in `McpServer`, `StdioServerTransport`, or `StreamableHTTPServerTransport` would require updates to both `packages/cli/src/mcp-server.ts` and `packages/cli/src/backend/server.ts`.
**Migration plan:** Pin to a specific version range. The current `^1.27.1` allows minor updates which should be backward-compatible.

---

## Missing Critical Features

### MISS-1: No Request Body Validation Layer

**Problem:** All backend API endpoints cast `req.body as { ... }` without runtime validation. `zod` is a dependency but is only used in MCP tool parameter definitions.
**What it blocks:** Production readiness of the backend server API. Malformed requests can cause runtime type errors.

### MISS-2: No Backend Server Authentication

**Problem:** The backend server has no authentication mechanism. Any process on localhost can read/write `.planning/` files, shut down the server, or control the terminal.
**What it blocks:** Network mode security. Multi-user environments.

---

## Test Coverage Gaps

### GAP-1: No Tests for Phase Lifecycle Operations

**What's untested:** `phaseAddCore`, `phaseInsertCore`, `phaseCompleteCore`, `phaseRemoveCore`, `archivePhaseExecute`
**Files:** `packages/cli/src/core/phase.ts` (1193 lines)
**Risk:** High. These are the most complex state-mutation functions. Phase removal includes renumbering logic that modifies multiple files.
**Priority:** Critical. A single bug in phase renumbering corrupts the project structure.

### GAP-2: No Tests for Backend Server API Endpoints

**What's untested:** All HTTP endpoints in the backend server
**Files:** `packages/cli/src/backend/server.ts` (1159 lines)
**Risk:** Medium. The server handles file writes, state mutations, and WebSocket connections without test coverage.
**Priority:** High for production deployment.

### GAP-3: No Tests for MCP Tool Handlers

**What's untested:** Individual MCP tool handler logic in `packages/cli/src/mcp/*.ts`
**Files:** 9 MCP tool files totaling ~3,500 lines
**Risk:** Medium. MCP tools are the primary interface for AI agents. The `mcp-server.test.ts` tests basic server connectivity but not tool behavior.
**Priority:** Medium. Tool handlers mostly delegate to core functions which have some test coverage.

### GAP-4: No Tests for Context Assembly (`init.ts`)

**What's untested:** All 15+ `cmdInit*` functions that assemble context for workflow bootstrapping
**Files:** `packages/cli/src/core/init.ts` (1060 lines)
**Risk:** Medium. These functions read filesystem state and construct context objects. Errors result in wrong context being passed to AI agents.
**Priority:** Medium.

### GAP-5: No Tests for Markdown Regex Parsing Variations

**What's untested:** Edge cases in `stateExtractField`, `stateReplaceField`, `getPhasePattern`, `appendToStateSection`
**Files:** `packages/cli/src/core/state.ts`, `packages/cli/src/core/core.ts`
**Risk:** High. These regex-based parsers handle user-editable markdown with no schema enforcement. Variations in formatting (extra spaces, different heading levels, missing bold markers) can break extraction.
**Priority:** High. User-facing data corruption when parsing fails silently.

### GAP-6: No Integration Tests for Install Flow

**What's untested:** The full install flow including path replacement, file copying, manifest writing, hook installation, and `.mcp.json` configuration
**Files:** `packages/cli/src/install/index.ts` (600 lines), `packages/cli/src/install/*.ts`
**Risk:** Medium. The `tests/e2e/install.test.ts` verifies the tarball structure but not the actual install behavior.
**Priority:** Medium. Install bugs affect every new user.
