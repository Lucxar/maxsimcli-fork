# CONCERNS.md

**Last Updated:** 2026-03-03

Technical debt, known issues, security considerations, and fragile areas in MAXSIM codebase.

---

## Tech Debt

### 1. Large Module Consolidation
**Area:** Core CLI logic
**Issue:** Several modules exceed safe refactoring thresholds:
- `packages/cli/src/backend/server.ts` — 1,159 lines (monolithic backend server with server routing, WebSocket, MCP, file watching, terminal management all in one file)
- `packages/cli/src/core/verify.ts` — 965 lines (verification suite with 30+ internal functions)
- `packages/cli/src/core/phase.ts` — 940 lines (phase CRUD, lifecycle, scaffolding, removal all mixed)
- `packages/cli/src/core/init.ts` — 791 lines (7 major context loaders without clear separation)

**Files:** `packages/cli/src/backend/server.ts`, `packages/cli/src/core/verify.ts`, `packages/cli/src/core/phase.ts`, `packages/cli/src/core/init.ts`

**Impact:** Difficult to test individual concerns; high risk of side effects during refactoring; difficult to locate specific logic.

**Fix Approach:** Decompose into smaller modules per concern (e.g., `verify-summary.ts`, `verify-artifacts.ts`, `verify-consistency.ts` for verify.ts; `server-routing.ts`, `server-websocket.ts`, `server-mcp.ts` for server.ts). Extract context loaders into separate files.

---

### 2. High `any` Type Usage
**Area:** Type safety
**Issue:** 98 occurrences of `any`, `as any`, or `unknown` casting in `packages/cli/src/**/*.ts`:
- `packages/cli/src/backend/server.ts`: 5 occurrences of unsafe type assertions
- `packages/cli/src/core/core.ts`: 15 occurrences including config parsing
- `packages/cli/src/mcp/context-tools.ts`: 9 occurrences in context loading

**Files:** Distributed across 26 files; major concentrations in `core.ts`, `backend/server.ts`, `config.ts`

**Impact:** Runtime type errors not caught at compile time; harder to refactor safely.

**Fix Approach:** Introduce stricter Zod schemas or TypeScript types for JSON parsing. Replace `any` with specific union types or interfaces. Use `as const` assertions where appropriate.

---

### 3. Callback-Style Error Handling Mixed with Result Types
**Area:** Error handling pattern
**Issue:** Codebase mixes three error patterns:
1. Exceptions (thrown in many core functions)
2. `CmdResult` union type (ok/err return values in commands)
3. Callbacks (output()/error() which throw CliOutput/CliError)

`packages/cli/src/core/state.ts:63` uses `readTextArgOrFile()` which throws exceptions while surrounding code returns `CmdResult`. Same inconsistency in `packages/cli/src/core/phase.ts` where `phaseAddCore()` throws but command wrapper returns `CmdResult`.

**Files:** `packages/cli/src/core/state.ts`, `packages/cli/src/core/phase.ts`, `packages/cli/src/cli.ts`, `packages/cli/src/core/init.ts`

**Impact:** Unpredictable exception flow; difficult to understand error boundaries; some thrown errors may not be caught properly.

**Fix Approach:** Audit all functions, pick one pattern (recommend `CmdResult`), and convert all internal helpers to return results instead of throwing.

---

### 4. Synchronous File I/O in Async Context
**Area:** Performance
**Issue:** Mixed use of sync and async file operations:
- `packages/cli/src/backend/server.ts:234` uses `fs.readFileSync()` in sync function for state/roadmap parsing
- `packages/cli/src/core/phase.ts` uses both `fsp.readFile()` (async) and helper functions that may access disk synchronously
- Install code (`packages/cli/src/install/index.ts`) uses `fs.copyFileSync()`, `fs.mkdirSync()` in long chains

**Files:** `packages/cli/src/backend/server.ts`, `packages/cli/src/core/phase.ts`, `packages/cli/src/install/index.ts`, `packages/cli/src/install/hooks.ts`

**Impact:** Can block event loop during file operations; slower startup on slow disks; incompatible with potential future streaming/worker-thread architectures.

**Fix Approach:** Audit filesystem calls, convert sync to async, use `Promise.all()` for batch operations. This is partially done (e.g., `listSubDirsAsync`, `safeReadFileAsync`) but not comprehensive.

---

### 5. Manifest Hash Calculation
**Area:** Install stability
**Issue:** `packages/cli/src/install/manifest.ts` uses simple content hashing via `crypto.createHash('sha256')` to detect user modifications. No documented hash algorithm version or migration path if hash algo changes.

**Files:** `packages/cli/src/install/manifest.ts`, `packages/cli/src/install/patches.ts`

**Impact:** Version upgrade could trigger false positives if hash algo changes; user patches could be lost.

**Fix Approach:** Add version field to manifest metadata. Document hash algorithm. Implement migration logic if algorithm ever needs to change.

---

## Known Bugs

### 1. PTY/Terminal Unavailable Handling
**Symptoms:** When `node-pty` is not installed, user sees error message: `"Terminal unavailable: node-pty is not installed."` but terminal socket still accepts connections and hangs.

**Files:** `packages/cli/src/backend/terminal.ts:96-103`

**Trigger:** Run dashboard on system without node-pty (e.g., headless server, or installation without optional deps).

**Workaround:** Always install `node-pty` as dependency, or implement graceful degradation that closes WebSocket immediately on spawn failure.

---

### 2. Stale Lock File Cleanup Race
**Symptoms:** Backend process is killed, but lock file (``.planning/.backend-lock`) persists. Next invocation thinks backend is running but it's not, causing timeout.

**Files:** `packages/cli/src/backend/lifecycle.ts:160-171`

**Trigger:** Kill backend process manually (e.g., `kill -9`) without letting it clean up lock file.

**Workaround:** `startBackend()` should check lock file staleness (e.g., PID doesn't exist) before assuming it's valid.

---

### 3. WebSocket Broadcast with Closed Connections
**Symptoms:** WebSocket broadcast may attempt to write to closed sockets during server shutdown, causing unhandled rejections.

**Files:** `packages/cli/src/backend/server.ts:490-510` (WebSocket connection handler lacks proper error boundary during shutdown)

**Trigger:** Rapid disconnect/shutdown cycle with many WebSocket clients.

**Workaround:** Add try-catch around all `ws.send()` calls; filter closed sockets before broadcast.

---

### 4. Phase Name Normalization Edge Case
**Symptoms:** Phase numbers with decimals (e.g., `01.1`, `01.2`) sort correctly via `comparePhaseNum()`, but some file parsing assumes phase names match directory prefix exactly.

**Files:** `packages/cli/src/backend/server.ts:318-322` (phase directory matching), `packages/cli/src/core/phase.ts:89`

**Trigger:** Create phases with decimal notation (e.g., `01.1-Phase-Name`), then run roadmap analysis.

**Workaround:** Normalization is correct in `core.ts:normalizePhaseName()`, but not consistently applied in all file matchers. Fix by always using normalized phase names in file searches.

---

## Security Considerations

### 1. Path Traversal in File Server
**Risk:** `packages/cli/src/backend/server.ts:61-65` implements `isWithinPlanning()` to restrict file access to `.planning/` directory. However, path resolution uses `path.resolve()` which may behave differently on Windows vs. Unix (backslash handling).

**Files:** `packages/cli/src/backend/server.ts:61-65`, all file access in HTTP endpoints

**Current Mitigation:** Check uses `startsWith()` after `path.resolve()`, which should prevent traversal via `..`. No symlink resolution.

**Recommendations:**
1. Use `path.relative()` to ensure computed path is under target, then validate it doesn't start with `..`.
2. Add explicit symlink check: `fs.realpathSync()` to resolve symlinks before comparison.
3. Add tests for Windows paths with mixed separators.

---

### 2. Environment Variable Exposure in Terminal
**Risk:** `packages/cli/src/backend/terminal.ts:122` passes entire `process.env` to PTY spawn: `env: process.env as Record<string, string>`. May leak sensitive env vars like API keys, credentials, or auth tokens to terminal.

**Files:** `packages/cli/src/backend/terminal.ts:122`

**Current Mitigation:** None documented.

**Recommendations:**
1. Allowlist safe env vars (PATH, HOME, TERM, etc.) instead of passing all.
2. Document that users should not rely on terminal for sensitive operations.
3. Log warnings if dangerous env vars detected.

---

### 3. MCP Tool Parameter Validation
**Risk:** `packages/cli/src/mcp/**/*.ts` registers 50+ tools with varying validation. Some use Zod schemas, others do minimal validation.

**Files:** `packages/cli/src/mcp/state-tools.ts`, `packages/cli/src/mcp/phase-tools.ts`, `packages/cli/src/mcp/roadmap-tools.ts`

**Current Mitigation:** Basic type checking in TypeScript, but runtime validation is inconsistent.

**Recommendations:**
1. Audit all MCP tools for input validation gaps.
2. Ensure all file path parameters are validated via `isWithinPlanning()`.
3. Add runtime schema validation for all tool inputs.

---

### 4. Unencrypted Lock File Contents
**Risk:** `.planning/.backend-lock` stores port number and PID in plaintext, readable by any local user. Could be exploited to hijack backend or DOS the server.

**Files:** `packages/cli/src/backend/lifecycle.ts:36-40`

**Current Mitigation:** Lock file is in `.planning/` which is typically project-local, not system-wide. No filesystem permission checks.

**Recommendations:**
1. Set lock file permissions to 0600 (owner-only read/write).
2. Consider storing only process PID and deriving port from PID via `projectPort()`.
3. Document security model: assume project directory is trusted.

---

## Performance Bottlenecks

### 1. Roadmap Parsing with Repeated Regex
**Problem:** `cmdRoadmapAnalyze()` in `packages/cli/src/core/roadmap.ts:52-130` parses roadmap content with multiple overlapping regex passes:
- Line 58: `getPhasePattern()` executed once
- Line 111: `milestonePattern` instantiated and executed
- Line 121: `checklistPattern` instantiated and executed
- Each phase then re-scanned for goal/depends_on matches

For a 100-phase roadmap, this is O(n×regex_passes) = inefficient.

**Files:** `packages/cli/src/core/roadmap.ts:52-130`

**Cause:** Each parsing pass re-creates regexes and scans content independently.

**Improvement Path:**
1. Single-pass parse with state machine or template engine instead of regex.
2. Cache compiled regexes at module level.
3. Consider lazy parsing for dashboard (only parse requested phase).

---

### 2. Backend Server In-Memory File Cache Unbounded
**Problem:** `packages/cli/src/backend/server.ts:454-478` implements path suppression cache to prevent watcher loops, but cleanup is periodic (60s interval) and TTL is short (500ms). For large `.planning/` directories with many file writes, cache could grow without bounds if writes happen faster than cleanup.

**Files:** `packages/cli/src/backend/server.ts:454-478`

**Cause:** `suppressedPaths` Map grows indefinitely between cleanup intervals; no max-size check.

**Improvement Path:**
1. Use LRU cache (e.g., `quick-lru` from dependencies) with bounded size.
2. Increase cleanup frequency or implement eager eviction.
3. Monitor cache size in health endpoint.

---

### 3. Dashboard Phase File Read on Every Request
**Problem:** `parsePhaseDetail()` in `packages/cli/src/backend/server.ts:311-388` reads and parses all phase files from disk for each HTTP request, no caching. For a phase with 50+ plans, this is slow.

**Files:** `packages/cli/src/backend/server.ts:311-388`, HTTP `GET /api/phase/[id]`

**Cause:** No caching layer; file watcher could invalidate cache but isn't integrated.

**Improvement Path:**
1. Add file-watch-aware cache: invalidate on file change.
2. Cache parsed frontmatter separately from task extraction.
3. Consider pagination for large phase detail responses.

---

### 4. Terminal Scrollback Memory Leak
**Problem:** `packages/cli/src/backend/terminal.ts:14-31` limits scrollback to 50k lines, but during long terminal sessions (>10 minutes of continuous output), the slice operation (`slice(-MAX_SCROLLBACK)`) is O(n) and runs frequently.

**Files:** `packages/cli/src/backend/terminal.ts:14-31`

**Cause:** Array resizing and copying on every append exceeding threshold.

**Improvement Path:**
1. Use circular buffer or ring buffer instead of array.
2. Implement deque with fixed capacity.
3. Benchmark impact on real terminal usage patterns.

---

## Fragile Areas

### 1. State.md Field Parsing
**Files:** `packages/cli/src/core/state.ts:39-61`, `packages/cli/src/backend/server.ts:236-240`

**Why Fragile:**
- Field parsing uses regex patterns with fallbacks (bold vs. plain), which are brittle
- Pattern in state.ts:42 matches `**fieldName:**` but users might write `** fieldName **:` with spaces
- Fallback pattern in state.ts:46 is case-insensitive but doesn't account for colon placement variations

**Safe Modification:**
1. Always use the bold marker `**Field Name:**` consistently in templates
2. Add validation in `cmdStateLoad()` to warn if fields are malformed
3. Consider YAML frontmatter instead of inline Markdown parsing

**Test Coverage Gaps:**
- No tests for whitespace variations around field markers
- No tests for missing field handling (should gracefully return null, not crash)
- Tests exist in `tests/unit/state-errors.test.ts` but limited to basic cases

---

### 2. Phase Directory Lookup
**Files:** `packages/cli/src/core/phase.ts:89`, `packages/cli/src/backend/server.ts:318-323`

**Why Fragile:**
- Phase number normalization is applied to lookup but directory names may not match exactly
- Example: phase `01A` normalizes to `01a`, but directory might be `01A-Phase-Name` (case-sensitive on Linux)
- Phase insertion doesn't guarantee directory creation with consistent naming

**Safe Modification:**
1. Always create directories with lowercase normalized phase numbers
2. Use case-insensitive directory matching on case-sensitive filesystems
3. Add validation in `scaffoldPhaseStubs()` to log actual directory name created

**Test Coverage Gaps:**
- No tests for case-sensitivity edge cases across platforms
- No tests for phase insertion creating directory with wrong casing
- Only `tests/unit/phase-errors.test.ts` exists; lacks integration tests

---

### 3. Manifest Validation During Install
**Files:** `packages/cli/src/install/index.ts:128-138`, `packages/cli/src/install/manifest.ts`

**Why Fragile:**
- Manifest reads JSON without schema validation
- If manifest file is corrupted or partially written, `JSON.parse()` throws unhandled error
- No atomic writes to manifest; partial writes could corrupt on power loss

**Safe Modification:**
1. Write manifest to temp file, then atomic rename
2. Add try-catch with recovery around manifest reads
3. Validate manifest schema before using it

**Test Coverage Gaps:**
- No tests for corrupt manifest handling
- No tests for concurrent install attempts
- `tests/e2e/install.test.ts` exists but doesn't cover failure scenarios

---

### 4. WebSocket Message Protocol
**Files:** `packages/cli/src/backend/server.ts:499-510`

**Why Fragile:**
- Messages are plain objects `{ type, data }` with no version field
- If message schema changes, old clients will silently ignore new fields
- No heartbeat/ping-pong to detect stale connections

**Safe Modification:**
1. Add message versioning field
2. Document message schema in API
3. Implement ping-pong heartbeat or keepalive timeout

**Test Coverage Gaps:**
- No tests for malformed WebSocket messages
- No tests for connection stale timeout
- Dashboard e2e tests (`tests/e2e/dashboard.test.ts`) exist but limited to happy path

---

## Scaling Limits

### Current Capacity:
- **Roadmap parsing:** ~100 phases before regex performance degrades
- **Dashboard concurrent clients:** ~50 WebSocket connections before broadcast latency noticeable (no load test exists)
- **Terminal scrollback:** 50,000 lines of output
- **Config cache:** Single in-memory cache entry (no LRU, single-threaded)

### Scaling Path:
1. **Horizontal scaling:** MAXSIM is designed as per-project CLI, not multi-user server. No architectural support for shared backend.
2. **File watching:** `chokidar` used for `.planning/` watcher; scales to ~1000 files per project before degradation.
3. **MCP tool registry:** 50+ tools in memory; no lazy loading.

### Recommendations:
1. Add performance metrics collection (via backend health endpoint).
2. Document scaling limits in README.
3. For enterprise use, consider multi-daemon architecture.

---

## Dependencies at Risk

### 1. `simple-git` (used for git operations)
**Risk:** Single point of failure for all git commands. If library has bug or version mismatch with local git, entire phase/state operations fail.
**Impact:** Blocks workflow execution (can't commit docs, can't branch).
**Migration Plan:**
- Audit `simple-git` usage (in `packages/cli/src/core/core.ts`)
- Consider fallback to shell `git` commands
- Add --verbose flag to all git calls for debugging

**File:** `packages/cli/src/core/core.ts` (execGit function)

---

### 2. `@modelcontextprotocol/sdk` (MCP runtime)
**Risk:** Rapid development; API surface large. Version `^1.27.1` may introduce breaking changes.
**Impact:** Dashboard/backend server integration could break.
**Migration Plan:**
- Pin exact version in CI
- Add integration tests for MCP tool execution
- Document MCP SDK version constraints

**File:** `packages/cli/package.json` (devDependencies)

---

### 3. `node-pty` (optional, terminal support)
**Risk:** Native C++ addon; may fail to build on some platforms.
**Impact:** Terminal feature gracefully degrades, but error messages could be clearer.
**Migration Plan:**
- Add build script detection in install
- Document node-pty as optional dependency
- Consider bundling pre-built binaries for common platforms

**File:** `packages/cli/src/backend/terminal.ts` (lazy-loads with error handling)

---

### 4. `chokidar` (file watcher)
**Risk:** Behavior differences across platforms (especially Windows symlinks).
**Impact:** File changes may not be detected, dashboard state falls out of sync.
**Migration Plan:**
- Add fallback to polling watcher
- Test on Windows with symlinks
- Document known platform limitations

**File:** `packages/cli/src/backend/server.ts` (file watcher setup)

---

## Missing Critical Features

### 1. Rollback / Undo Mechanism
**Problem:** Once a phase is marked complete or state is advanced, there's no easy way to revert. Users who execute wrong plan must manually edit STATE.md and ROADMAP.md.

**What It Blocks:** Safe experimentation with workflows; recovery from accidental phase completion.

**Recommendation:** Add `state undo` command that restores from backup; maintain STATE.md history in `.planning/.state-history/`.

---

### 2. Multi-User Project Support
**Problem:** MAXSIM assumes single user per project. Lock files and state updates don't account for concurrent edits.

**What It Blocks:** Team collaboration on shared codebases; merging parallel phase work.

**Recommendation:** Document as single-user only for now. Future: implement collaborative locking and conflict resolution.

---

### 3. Error Recovery Guide
**Problem:** When a command fails (e.g., phase not found, ROADMAP.md malformed), error messages don't guide user to fix it.

**What It Blocks:** User autonomy; requires CLI developer intervention for non-obvious errors.

**Recommendation:** Audit error messages; add `--help` context and remediation steps. Link to troubleshooting guide.

---

## Test Coverage Gaps

### 1. Windows Path Handling
**What's Untested:** File paths with backslashes, mixed separators, and symlinks on Windows.
**Files:** All file I/O functions in `packages/cli/src/`
**Risk:** High — install and backend serve to Windows users but little automated testing for Windows-specific paths.
**Priority:** High — add Windows CI runner.

---

### 2. Concurrent File Writes
**What's Untested:** Two processes writing to STATE.md or ROADMAP.md simultaneously (e.g., two Claude Code instances).
**Files:** `packages/cli/src/core/state.ts`, `packages/cli/src/core/phase.ts`
**Risk:** Medium — file corruption possible if writes interleave.
**Priority:** Medium — add file lock mechanism; document single-writer assumption.

---

### 3. Large File Performance
**What's Untested:** Roadmap with 200+ phases, STATE.md with 1000+ decisions, terminal with 500k lines of scrollback.
**Files:** `packages/cli/src/backend/server.ts`, `packages/cli/src/core/roadmap.ts`
**Risk:** Medium — regex parsing and in-memory caching could fail at scale.
**Priority:** Medium — add perf benchmarks.

---

### 4. MCP Tool Error Handling
**What's Untested:** MCP tools with invalid input (e.g., non-existent phase numbers, malformed JSON), exception throwing in tool handlers.
**Files:** `packages/cli/src/mcp/**/*.ts` (50+ tools)
**Risk:** Medium — unhandled exceptions could crash backend.
**Priority:** Medium — add error recovery tests; audit all tool handlers.

---

### 5. Dashboard State Sync
**What's Untested:** Dashboard displaying correct state when backend file watcher detects changes, multi-client sync.
**Files:** `packages/cli/src/backend/server.ts` (file watcher integration), HTTP response handlers
**Risk:** Medium — dashboard UI could show stale data.
**Priority:** Low-Medium — add e2e tests for file change detection.

---

## Recommendations Summary

| Area | Priority | Effort | Notes |
|------|----------|--------|-------|
| Decompose large modules | High | Medium | Start with verify.ts and server.ts |
| Fix state/phase parsing edge cases | High | Low | Validate field formats, normalize names |
| Add concurrent write protection | Medium | Medium | File locks or advisory locking |
| Type safety improvements | Medium | High | Introduce Zod schemas across codebase |
| Performance benchmarking | Low-Medium | Low | Set up test harness for large files |
| Windows CI testing | High | Medium | Add GitHub Actions Windows runner |
| MCP error recovery | Medium | Medium | Audit all tool handlers |
| Terminal/PTY error handling | Medium | Low | Improve error messages and recovery |

