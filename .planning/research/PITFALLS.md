# Pitfalls Research

**Domain:** TypeScript monolith refactoring in a published npm CLI package (maxsimcli)
**Researched:** 2026-03-08
**Confidence:** HIGH (based on codebase analysis of 15+ source modules, existing test patterns, and verified community patterns)

## Critical Pitfalls

### Pitfall 1: Barrel Export Shape Changes Break Two Downstream Consumers

**What goes wrong:**
The `packages/cli/src/core/index.ts` barrel re-exports 80+ type exports and 70+ runtime exports consumed by two distinct downstream systems: (1) `packages/dashboard/src/server.ts` via the `@maxsim/core` path alias, and (2) `packages/cli/src/backend/server.ts` via relative imports. When refactoring modules (splitting phase.ts, unifying error types, extracting helpers), any change to exported names, types, or module boundaries that alters what the barrel exposes will silently break the dashboard build or the backend server. Since the dashboard resolves `@maxsim/core` through a tsconfig/vite/tsdown alias to `../cli/src/core/`, there is no npm version boundary -- changes propagate instantly and break immediately.

Additionally, `phase.ts` currently re-declares `PhaseAddResult`, `PhaseInsertResult`, and `PhaseCompleteResult` interfaces locally (lines 49-76) with slightly different shapes than the versions in `types.ts` (lines 444-479). For example, `phase.ts` has `description` field while `types.ts` has `name` and `slug` as separate fields. The barrel in `index.ts` exports the `types.ts` versions. If the refactoring touches these interfaces, the MCP tools in `packages/cli/src/mcp/phase-tools.ts` (which imports directly from `../core/phase.js`, bypassing the barrel) will see different types than dashboard consumers importing from the barrel.

**Why it happens:**
Developers focus on the module being refactored and forget to verify all import paths. The MCP server imports directly from individual modules (`../core/core.js`, `../core/phase.js`), not through the barrel. The dashboard imports through the barrel alias. The CLI router imports through the barrel. Three different import strategies means three places where a rename or type change can break.

**How to avoid:**
1. Before any module split or rename, grep for ALL import paths to the affected module: `from.*core/phase`, `from.*core/index`, `from.*@maxsim/core`
2. Run `npm run build` after every module-level change (catches both tsdown CLI bundle and Vite dashboard bundle)
3. When splitting a module, keep the barrel re-exports unchanged -- add new exports but never remove or rename existing ones in the same commit
4. Reconcile the duplicate interface declarations in `phase.ts` vs `types.ts` BEFORE splitting the module

**Warning signs:**
- Dashboard build fails with "export X not found in @maxsim/core"
- MCP server crashes on startup with import errors
- Type mismatch errors in backend/server.ts that don't appear in CLI builds

**Phase to address:**
Phase 1 (Error Handling Unification) -- must audit all import paths before changing any exported types

---

### Pitfall 2: CliOutput/CliError Throw-as-Flow-Control Creates Invisible Coupling

**What goes wrong:**
The current architecture uses `CliOutput` and `CliError` as exception-based flow control (core.ts lines 49-75). Functions like `output()` and `error()` throw these classes, and `cli.ts` catches them at the top level to call `process.exit()`. The `rethrowCliSignals()` helper (used in state.ts, commands.ts) exists specifically to prevent catch blocks from swallowing these "signals." When unifying to the `CmdResult` pattern, any module that still has a path that calls `output()` or `error()` directly (instead of returning `cmdOk()`/`cmdErr()`) will break callers that expect a return value. Worse: the MCP server files all have banner comments saying "CRITICAL: Never import output() or error() from core -- they call process.exit()" -- but the transition is incomplete. If you convert a function to return `CmdResult` but miss one code path that still throws `CliError`, the MCP tools calling that function will crash the server.

**Why it happens:**
The codebase is mid-migration. Some functions (all `cmd*` functions in phase.ts, state.ts, roadmap.ts) already return `CmdResult`. Others still use the throw-based pattern. The `handleResult()` function in cli.ts (line 141) bridges the gap by converting `CmdResult` back to throws. During refactoring, it is easy to convert the "happy path" to CmdResult but leave error paths still throwing CliError, creating functions that sometimes return and sometimes throw.

**How to avoid:**
1. Convert one module at a time, completely. Never leave a function in a half-migrated state
2. For each function being converted: list ALL exit paths (return, throw CliError, throw CliOutput, throw Error). Convert ALL of them
3. Remove the `rethrowCliSignals(e)` call from a module's catch blocks ONLY after ALL functions in that module return CmdResult instead of throwing
4. Add a lint rule or test assertion that converted modules never import `output`, `error`, or `rethrowCliSignals` from core.js
5. The `handleResult()` bridge in cli.ts should remain until ALL modules are converted -- it is the safe adapter

**Warning signs:**
- `rethrowCliSignals` appears in a module that also uses `cmdOk`/`cmdErr` -- this is a transitional state that must not persist
- MCP server error: "CliOutput is not defined" or "CliError is not defined" (means a core function threw instead of returning)
- Functions with return type `CmdResult` that have catch blocks calling `rethrowCliSignals`

**Phase to address:**
Phase 1 (Error Handling Unification) -- this is THE core pitfall of the entire milestone

---

### Pitfall 3: Sync/Async Duality Creates Testing Nightmares and Runtime Bugs

**What goes wrong:**
The codebase has 122 synchronous fs calls across 13 core modules and 102 async fs calls across 5 modules. Critical modules use BOTH patterns: `init.ts` uses sync (`fs.readFileSync`, `fs.existsSync`, `listSubDirs`), `phase.ts` uses async (`fsp.readFile`, `fsp.readdir`, `pathExistsAsync`), and `verify.ts` uses sync exclusively (`fs.existsSync`, `fs.readFileSync`, `fs.readdirSync`). When writing tests for `verify.ts` (965 lines, 0 tests), you must use sync mocking. When writing tests for `phase.ts` (already partially tested), you use real filesystem with temp dirs. When writing tests for `init.ts` (1060 lines, 0 tests), you face a module that calls BOTH sync and async functions from different imported modules.

The danger: if you convert sync functions to async during refactoring (which seems "modern" and "correct"), you break every call site, and the `verify.ts` functions that are currently synchronous (returning `CmdResult` directly, not `Promise<CmdResult>`) will need their return types changed -- which propagates through cli.ts and the MCP tools.

**Why it happens:**
The codebase was ported from a JavaScript predecessor (`maxsim/bin/lib/*.cjs`) where sync was the default. Some modules were modernized to async during the port, others were not. The mixed state is stable and working -- changing it is optional and dangerous.

**How to avoid:**
1. DO NOT convert sync to async as part of this milestone. The sync/async inconsistency is tech debt, but fixing it is a breaking change that affects all callers
2. When testing sync modules (verify.ts, init.ts), use real temp directories (as phase-errors.test.ts already does) rather than trying to mock `fs`. The `makeTempDir()` + `scaffoldPlanning()` pattern from the existing tests is proven
3. When testing init.ts, note that it calls `loadConfig()` which has an internal cache keyed by cwd. Use unique temp dir paths per test to avoid cache pollution (the existing core-errors.test.ts already demonstrates this pattern)
4. Accept the mixed I/O: test what exists, not what you wish existed

**Warning signs:**
- Tests that mock `fs.readFileSync` globally but forget that `loadConfig()` caches results across test runs
- A PR that converts `cmdVerifyPlanStructure` from sync to async -- this will cascade to 150+ command handlers
- Test files importing `mock-fs` or `memfs` for modules that use both sync and async fs

**Phase to address:**
Phase 2 (Test Coverage) -- must use the established temp-directory pattern, not filesystem mocking

---

### Pitfall 4: process.exit() Removal Breaks the Install Entrypoint

**What goes wrong:**
The `install/index.ts` file has 11 `process.exit()` calls (lines 82, 89, 99, 425, 556, 560, 569, 572, 576, 596, 599). The `backend-server.ts` has 3. The `install/dashboard.ts` has 2. These are legitimate top-level entrypoints that SHOULD call `process.exit()` -- they are not library code called by other modules. If the refactoring to "remove process.exit()" is applied too broadly, it will break the npm install flow (`npx maxsimcli@latest`), the dashboard launcher, and the backend server lifecycle.

The confusion arises because the core modules ALSO had process.exit() (now converted to CliOutput/CliError throws), and the goal of this milestone is to finish that migration. But the migration boundary must be clearly defined: core modules should never exit, entrypoints (install.ts, cli.ts, backend-server.ts) MUST exit.

**Why it happens:**
The goal "remove process.exit() from 15+ modules" from PROJECT.md is imprecise. It means "remove process.exit() from LIBRARY code that might be called from non-CLI contexts (MCP, dashboard, tests)." It does NOT mean "remove process.exit() from every file."

**How to avoid:**
1. Define the boundary explicitly: `src/core/*.ts` = library code (never exits), `src/cli.ts` + `src/install/*.ts` + `src/backend-server.ts` = entrypoints (may exit)
2. The `src/mcp/*.ts` files are ALSO entrypoints but for a long-lived server -- they should never exit (already enforced with banner comments)
3. For `src/hooks/*.ts` -- these are short-lived processes that legitimately call `process.exit(0)` in `shared.ts`
4. Do not refactor install.ts or hooks as part of this milestone

**Warning signs:**
- `npx maxsimcli@latest` hangs instead of completing (process.exit removed from install)
- Dashboard process stays alive after user sends SIGTERM (process.exit removed from backend-server)
- CI/CD pipeline fails because install never returns exit code

**Phase to address:**
Phase 1 (Error Handling) -- must define the library/entrypoint boundary in the phase plan BEFORE any code changes

---

### Pitfall 5: Duplicate Interface Declarations Diverge Silently During Refactoring

**What goes wrong:**
`phase.ts` lines 49-76 declare `PhaseAddResult`, `PhaseInsertResult`, and `PhaseCompleteResult` with fields like `description` and `requirements_updated`. The `types.ts` file (lines 444-479) declares the SAME interface names with different fields (`name` instead of `description`, no `requirements_updated`). The barrel `index.ts` exports only the `types.ts` versions. The MCP tools import from `../core/phase.js` directly, getting the `phase.ts` versions. The CLI router doesn't use these types directly -- it passes through `CmdResult.result` as `unknown`.

During refactoring, if someone updates the `types.ts` version but not the `phase.ts` version (or vice versa), the divergence widens. Since TypeScript structural typing means these are interchangeable as long as the shapes overlap, there will be no compile error -- just subtle runtime differences in what fields are present.

**Why it happens:**
The phase module was ported from JavaScript where there were no interface declarations. Types were added later in `types.ts` for the barrel export, but the phase module also needed local types for its internal logic. Nobody reconciled them because the code works -- TypeScript's structural typing papers over the difference.

**How to avoid:**
1. Reconcile the duplicate interfaces FIRST, before any other refactoring in phase.ts. Make phase.ts import types from types.ts
2. Check every `export interface` in every core module -- if the same name exists in types.ts, one must go
3. After reconciliation, add a CI check or comment: "All public interfaces live in types.ts. Module-local types that are NOT exported through the barrel are okay"

**Warning signs:**
- Searching for an interface name returns 2+ declarations
- MCP tool returns `description` field while CLI returns `name` field for the same operation
- Dashboard type error on a field that "should exist" but doesn't

**Phase to address:**
Phase 1 (Error Handling / Prep) -- reconcile before splitting modules

---

### Pitfall 6: Helper Extraction Creates Import Cycles Through the Barrel

**What goes wrong:**
Extracting shared helpers like `loadJsonFile()` (10+ duplication sites across config.ts, dashboard-launcher.ts, install/*.ts, hooks/*.ts) into a shared utility module seems straightforward. But if the new utility module is added to the barrel (`index.ts`), and the barrel is imported by modules that the utility depends on, you create a circular dependency. For example: `core.ts` exports `planningPath()`, a new `json-utils.ts` imports `planningPath()` from core.ts and exports `loadJsonFile()`, the barrel re-exports both. If any module imports from the barrel instead of directly from the source, the circular dependency can cause undefined imports at runtime (the module hasn't finished loading yet).

In this codebase, the risk is elevated because the MCP tools import directly from individual modules (safe), but the CLI router and dashboard import from the barrel. A circular dependency that only manifests through the barrel path will pass unit tests (which import directly) but break the bundled CLI.

**Why it happens:**
Node.js ESM handles circular dependencies by providing partially-initialized module objects. If module A imports from module B which imports from the barrel which re-exports from module A, module A's exports may be `undefined` at the time module B reads them. This is a well-known ESM footgun that is particularly dangerous with barrel files.

**How to avoid:**
1. New utility modules should be "leaf" modules with ZERO imports from other core modules. `loadJsonFile()` should take a path string and return parsed JSON -- it should NOT import `planningPath()` or any other core helper
2. If a utility needs core helpers, the caller should compose them: `loadJsonFile(planningPath(cwd, 'config.json'))` not `loadJsonFile(cwd, 'config.json')` with internal path resolution
3. Test the bundled output (`npm run build`) after adding any new barrel export -- circular dependency bugs only appear in bundled code, not in direct imports
4. Consider NOT adding extracted helpers to the barrel at all -- they can be internal-only imports

**Warning signs:**
- `undefined` runtime errors that only appear when running the built `cli.cjs` but not in tests
- Build warnings about circular dependencies from tsdown
- Import order matters -- moving an import statement changes behavior

**Phase to address:**
Phase 3 (Helper Extraction) -- design extracted modules as zero-dependency leaves

---

### Pitfall 7: Testing Functions That Shell Out to Git

**What goes wrong:**
Multiple functions across verify.ts, phase.ts, and commands.ts call `execGit()` which spawns actual git processes. When writing tests for these functions, the test either (a) needs a real git repository in the temp dir, or (b) needs to mock `execGit`. Option (a) is slow and fragile (different git versions, CI environment differences). Option (b) requires the module to accept `execGit` as a dependency (it currently imports it directly from core.js).

The `verify.ts` module is particularly problematic: `cmdVerifySummary()` calls `execGit(cwd, ['cat-file', '-t', hash])` to verify commit hashes, `cmdVerifyCommits()` calls `execGit(cwd, ['log', ...])`, and `cmdVerifyArtifacts()` checks file existence relative to git root. These functions are tightly coupled to git state that is expensive to set up in tests.

**Why it happens:**
The original code was designed for production use, not testability. `execGit` is imported as a module-level binding, making it hard to substitute in tests without module-level mocking (vi.mock), which is fragile and couples tests to import paths.

**How to avoid:**
1. For verify.ts tests: use real git repos in temp dirs. The `scaffoldPlanning()` helper from existing tests plus `git init && git add . && git commit` is the most reliable approach
2. For functions that ONLY check `execGit` results as a secondary concern (like `cmdVerifySummary` where commit checking is one of several checks), test the non-git paths first, then add a separate test suite for git-dependent paths with real repos
3. Do NOT try to mock execGit with vi.mock -- it creates fragile tests that break when import paths change
4. For speed: create ONE shared git fixture per test file (in `beforeAll`), not one per test

**Warning signs:**
- Tests that `vi.mock('../core/core.js')` and then break when core.ts is refactored
- Tests that pass locally but fail in CI because git is not configured (user.name/email)
- Tests that create git repos but forget to set `git config user.email` in the temp repo

**Phase to address:**
Phase 2 (Test Coverage) -- establish git fixture pattern before writing verify.ts tests

---

### Pitfall 8: Publishing Broken Package to npm via Auto-Deploy Pipeline

**What goes wrong:**
Every push to main triggers `semantic-release` which auto-publishes to npm if the commit prefix warrants a version bump. A refactoring commit with prefix `fix:` will trigger a patch release. If the refactoring introduces a subtle runtime bug that passes the build and existing tests (which have low coverage on the affected modules), the broken version goes live immediately. Users running `npx maxsimcli@latest` get the broken version. There is no staging environment, no canary release, no manual gate.

This is especially dangerous during error handling unification: the CLI may build and test fine, but a converted function that now returns `{ ok: false, error: '...' }` instead of throwing `CliError` will cause the `handleResult()` bridge in cli.ts to call `output(undefined)` if the function caller hasn't been updated -- resulting in silent `undefined` JSON output instead of an error message.

**Why it happens:**
The auto-deploy is by design for rapid delivery. But refactoring changes (which touch many files but should not change behavior) get the same instant-publish treatment as targeted bug fixes.

**How to avoid:**
1. Use `refactor:` commit prefix for all refactoring changes -- this does NOT trigger a version bump or publish
2. Only use `fix:` prefix for the final commit that resolves an actual user-facing issue
3. After each refactoring phase, do a manual smoke test: `npm run build && node dist/cli.cjs state-snapshot` to verify the built output works
4. Consider a temporary branch strategy for the refactoring milestone -- merge to main only when a phase is verified
5. Add integration tests that run the built cli.cjs binary (the existing e2e/tools.test.ts does this) and extend them to cover converted modules

**Warning signs:**
- `npm run build` succeeds but `node dist/cli.cjs phases-list` outputs `undefined` instead of JSON
- The CHANGELOG.md shows a version bump for a commit that was supposed to be a no-behavior-change refactor
- Users report "maxsimcli stopped working after update"

**Phase to address:**
All phases -- use `refactor:` prefix consistently, run smoke tests before each merge

---

### Pitfall 9: loadConfig() Cache Pollution Across Tests

**What goes wrong:**
`loadConfig()` in core.ts maintains an internal cache keyed by `cwd` path. Once called for a given cwd, it returns the cached result on all subsequent calls. In tests, if two test cases use the same temp directory path (or if `os.tmpdir()` returns the same path with different suffixes), the second test gets stale cached data from the first test. This is particularly dangerous when testing `init.ts` functions, which all call `loadConfig(cwd)` internally.

The existing `core-errors.test.ts` already demonstrates the correct pattern (unique paths per test: `maxsim-test-no-config-${Date.now()}`), but new test authors may not realize the cache exists.

**Why it happens:**
The cache is a performance optimization for production use (config doesn't change during a CLI invocation). In tests, it becomes a shared mutable state that leaks between test cases.

**How to avoid:**
1. Every test that involves `loadConfig()` (directly or indirectly) MUST use a unique cwd path. Use `Date.now()` or `crypto.randomUUID()` in the path
2. Document the cache behavior in a test utilities file
3. Consider adding a `loadConfig.clearCache()` function (test-only export) if unique paths become unwieldy
4. Never re-use temp directories across tests, even for "read-only" tests

**Warning signs:**
- Tests pass individually but fail when run together (`vitest run` vs `vitest run path/to/file.test.ts`)
- Test failure messages about unexpected config values (e.g., `model_profile` is "quality" when test expects "balanced")
- Flaky tests that depend on execution order

**Phase to address:**
Phase 2 (Test Coverage) -- establish in test utilities before writing init.ts tests

---

### Pitfall 10: Dead Workflow Removal Breaks Agent Markdown References

**What goes wrong:**
PROJECT.md says to "Remove 4 unused workflow files" and "resolve research-phase command/workflow duality." The workflow files are markdown templates in `templates/workflows/` that are referenced by `@path` from command files in `templates/commands/maxsim/`. Removing a workflow file that is still referenced by a command will cause the command to fail at runtime (the AI agent tries to load the referenced file and gets a file-not-found error). Since these are markdown files, not TypeScript, there is no compile-time check for broken references.

**Why it happens:**
The "unused" determination may be based on grep results that miss non-obvious reference patterns. Workflow references use `@file:` or `@path:` syntax that may appear in inline code blocks, variable interpolation, or multi-line strings.

**How to avoid:**
1. Before removing any workflow file, grep ALL of `templates/` for its filename (without path prefix)
2. Also grep the installed user directory (`~/.claude/`) in case the file was copied there
3. Remove one file at a time, build, and test
4. The "resolve research-phase duality" should be done as a separate task from "remove unused workflows" -- they have different risk profiles

**Warning signs:**
- `/maxsim:research-phase` command fails with "file not found"
- Agent spawned by a workflow can't find its referenced prompt file
- Users report commands that "used to work" after updating

**Phase to address:**
Phase 4 (Dead Code Removal) -- must grep all references before deletion

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Leaving both CliError throws AND CmdResult returns in the same module | "I'll convert the rest later" | Callers can't know whether to catch or check .ok -- leads to silent bugs | Never -- convert entire module or don't start |
| Mocking `fs` module globally in tests | Tests run fast, no temp dir cleanup | Tests break when module import paths change; misses real I/O bugs | Never for this codebase -- use temp dirs |
| Converting sync to async "while you're in there" | Code looks more modern | Cascading return type changes through 150+ command handlers | Never during this milestone -- defer to a future milestone |
| Adding test coverage for private helper functions | Higher coverage number | Tests are coupled to implementation, break on every refactor | Only for complex algorithmic helpers; test through public API instead |
| Using `any` to bridge the CliOutput->CmdResult transition | Avoids type errors during migration | Hides actual type mismatches that are the whole point of the migration | Only in cli.ts handleResult() bridge, nowhere else |
| Extracting helpers into the barrel without checking for cycles | Quick reuse across modules | Circular dependency that breaks bundled builds but passes tests | Never -- test with `npm run build` after every barrel change |

## Integration Gotchas

Common mistakes when connecting refactored modules to their consumers.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Core module -> CLI router (cli.ts) | Changing return type without updating handleResult() bridge | Keep handleResult() as the single adapter; update it once when migration is complete |
| Core module -> MCP tools | MCP files import directly from `../core/phase.js` not the barrel; refactoring phase.ts exports breaks MCP | Grep for ALL import paths before changing any export |
| Core module -> Dashboard server | Dashboard uses `@maxsim/core` alias; type-only imports are fine but runtime imports must exist at bundle time | Run `npm run build` (includes dashboard) after every core change |
| Core module -> Backend server | Backend server imports from `../core/index.js`; also has its own process.exit() calls | Do not touch backend server process.exit() calls |
| Extracted helper -> Barrel | New barrel export creates circular dependency | Keep extracted helpers as internal imports, don't add to barrel unless needed by dashboard |
| Test -> Module under test | Tests import from source path; refactoring moves the module | Use stable import paths; if splitting a module, keep re-exports from original path |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Creating a git repo per test case | Test suite takes 30+ seconds | Share one git fixture per describe block via beforeAll | >20 tests with git dependencies |
| Running `npm run build` after every small change | Developer feedback loop is 30+ seconds | Batch changes per module; build once per module conversion | During active development of error handling phase |
| Temp directory cleanup in afterEach with sync rmSync | Blocks test runner on Windows (file locks) | Use `{ force: true }` and accept occasional leftover dirs; use afterAll instead of afterEach for shared fixtures | Windows CI or local dev on Windows |
| Full test suite on every commit | CI takes 5+ minutes | Run only affected test files during dev; full suite on PR only | When test count exceeds ~50 files |

## Security Mistakes

Domain-specific security issues for a published CLI tool.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Extracting `loadJsonFile()` that doesn't validate parsed content | Malicious `.planning/config.json` could inject unexpected values | New helper must use schema validation or type guards; never `as T` without checking |
| Tests creating temp dirs in predictable paths without unique suffixes | Symlink attacks on shared CI runners (unlikely but possible) | Always use `fs.mkdtempSync()` not `fs.mkdirSync('/tmp/maxsim-test')` |
| Removing error handling that catches malformed user input | User-supplied phase names or file paths bypass validation | When converting CliError throws to CmdResult returns, preserve ALL input validation -- don't simplify error paths |

## UX Pitfalls

Common user experience mistakes during refactoring.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Changing error message text during CmdResult migration | Users or agents that parse error messages by string matching break | Preserve exact error message strings; only change the delivery mechanism (throw -> return) |
| Changing JSON output shape of cmd* functions | Agents that parse JSON output get unexpected fields | Return types are the public API -- add fields, never remove or rename |
| Silent failures where CliError used to provide a clear message | User sees empty output instead of "ROADMAP.md not found" | Every CmdResult error path must have the same message quality as the old CliError |
| Breaking the `--raw` output mode | Agents that rely on raw string output instead of JSON get wrong format | Test both `raw=true` and `raw=false` paths when converting functions |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Error handling unified in module X:** Check that `rethrowCliSignals` is REMOVED from the module, not just that `cmdOk`/`cmdErr` are added. If rethrowCliSignals is still there, the module is half-migrated
- [ ] **Tests added for module X:** Verify tests cover BOTH success and error paths. Existing tests (phase-errors.test.ts) focus on error paths -- success path coverage may be missing
- [ ] **Helper extracted to shared module:** Verify the barrel doesn't re-export it if it creates a cycle. Run `npm run build` and check for circular dependency warnings
- [ ] **Dead workflow removed:** Verify no command file references it via `@file:` or `@path:` syntax. Grep templates/ recursively
- [ ] **Module split into smaller files:** Verify the original module path still exports everything (re-exports from new sub-modules). Otherwise all consumers break
- [ ] **process.exit() removed from module:** Verify it was actually library code, not an entrypoint. install.ts, cli.ts, backend-server.ts, and hooks SHOULD keep their process.exit() calls
- [ ] **CmdResult return type added:** Verify the function NEVER throws in any code path. Search for `throw` within the function body
- [ ] **Test passes in isolation:** Run the full test suite (`npm test`) to catch cache pollution, import order issues, and shared state leaks

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Barrel export shape changed, dashboard broken | LOW | Revert the barrel change; add back the old export name as an alias to the new one |
| Half-migrated module (some paths throw, some return CmdResult) | MEDIUM | Complete the migration for ALL paths in one commit; or fully revert to pre-migration state |
| Circular dependency in bundled output | MEDIUM | Move the offending import out of the barrel; make the new module a leaf with no core imports |
| Broken npm publish (bad version live) | HIGH | Publish a patch immediately with `fix:` prefix; if code is known-good in a previous commit, `git revert` the breaking commit and push |
| Tests passing but runtime broken | MEDIUM | Add a smoke test that runs the built cli.cjs with a real command; add to CI pipeline |
| loadConfig cache pollution causing flaky tests | LOW | Add unique suffixes to all test cwd paths; add `clearCache()` test helper |
| Sync-to-async conversion cascaded through codebase | HIGH | Revert the conversion; sync code is working and tested. Async conversion is a separate milestone |
| Dead workflow removal broke a command | LOW | Restore the file from git; add a reference check to the removal process |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Barrel export shape changes | Phase 1 (Error Handling) | `npm run build` succeeds; dashboard builds; MCP tools import correctly |
| CliOutput/CliError half-migration | Phase 1 (Error Handling) | Grep for `rethrowCliSignals` in converted modules returns 0 results |
| Sync/async duality testing | Phase 2 (Test Coverage) | All tests use temp dirs, no `vi.mock('fs')` calls exist |
| process.exit() over-removal | Phase 1 (Error Handling) | `npx maxsimcli@latest` completes successfully; `process.exit` count in install.ts unchanged |
| Duplicate interface declarations | Phase 1 (Error Handling / Prep) | Each interface name declared exactly once; phase.ts imports from types.ts |
| Helper extraction circular deps | Phase 3 (Helper Extraction) | `npm run build` shows no circular dependency warnings; new modules have 0 core imports |
| Git-dependent test fragility | Phase 2 (Test Coverage) | CI pipeline passes on fresh machine; no `vi.mock` for git functions |
| Broken npm auto-publish | All phases | All refactoring uses `refactor:` prefix; `fix:`/`feat:` only for intentional publishes |
| loadConfig cache pollution | Phase 2 (Test Coverage) | Full test suite passes with `--sequence` flag (deterministic order) |
| Dead workflow reference breakage | Phase 4 (Dead Code Removal) | All `/maxsim:*` commands succeed after workflow removal |

## Trade-Off Matrix

| Option | Pros | Cons | Risk | Effort |
|--------|------|------|------|--------|
| Convert all modules to CmdResult in one phase | Clean, consistent; no half-migrated state | Large blast radius; many files changed at once | HIGH | L |
| Convert one module per task, keep handleResult() bridge | Incremental; easy to revert one module | Transition period with mixed patterns | LOW | M |
| Extract helpers into barrel | Maximum reuse; dashboard can import them | Circular dependency risk | MED | M |
| Extract helpers as internal-only (no barrel export) | Zero cycle risk; simple | Dashboard can't use them; duplicated if needed there | LOW | S |
| Mock fs in tests | Fast tests; no disk I/O | Fragile; breaks on refactoring; misses real bugs | HIGH | S |
| Use temp dirs in tests | Real I/O; catches actual bugs; matches existing pattern | Slower; cleanup needed; Windows file locking | LOW | M |

## Decision Rationale

**Recommendation:** Incremental module-by-module CmdResult conversion over big-bang conversion
**Why:** The handleResult() bridge in cli.ts already exists and safely adapts CmdResult to the old throw-based flow. Converting one module at a time means each change is small, reviewable, and revertable. A big-bang conversion touches 15+ files and is impossible to debug if something breaks.
**When to reconsider:** If the bridge itself becomes a bottleneck (e.g., it doesn't handle a new CmdResult variant), convert all remaining modules at once to eliminate it.

**Recommendation:** Temp directory tests over filesystem mocking
**Why:** The existing test suite (phase-errors.test.ts, core-errors.test.ts) already uses real temp dirs with scaffolding helpers. This pattern catches real I/O bugs, is resistant to import path refactoring, and works on all platforms. Mocking fs is fragile and doesn't match the existing codebase conventions.
**When to reconsider:** If test suite execution time exceeds 60 seconds due to temp dir creation, consider mocking for pure-logic tests only.

**Recommendation:** `refactor:` commit prefix for all refactoring over `fix:` prefix
**Why:** Prevents accidental npm publish of intermediate states. The entire point of this milestone is internal cleanup that should not change user-facing behavior.
**When to reconsider:** If a refactoring change actually fixes a user-reported bug, use `fix:` for that specific commit.

## Code Examples

### CmdResult Migration Pattern (Correct)
```typescript
// BEFORE: throws CliError on failure
export function cmdSomething(cwd: string, input: string): CmdResult {
  if (!input) {
    // OLD: error('input required');  // throws CliError
    return cmdErr('input required');   // NEW: returns CmdResult
  }
  try {
    const data = doWork(cwd, input);
    // OLD: output(data);  // throws CliOutput
    return cmdOk(data);    // NEW: returns CmdResult
  } catch (e) {
    // OLD: rethrowCliSignals(e);
    // OLD: error((e as Error).message);
    return cmdErr((e as Error).message);  // NEW: returns CmdResult
  }
}
```

### Temp Directory Test Pattern (Established)
```typescript
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

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
} = {}): void {
  const planningDir = path.join(cwd, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  if (opts.roadmap !== undefined)
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), opts.roadmap);
  if (opts.state !== undefined)
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), opts.state);
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
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  tempDirs.length = 0;
});
```

### Leaf Helper Module Pattern (Safe Extraction)
```typescript
// src/core/json-utils.ts -- LEAF MODULE: zero imports from other core modules
import fs from 'node:fs';

export function loadJsonFileSafe<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

// Caller composes with path helpers:
// loadJsonFileSafe(planningPath(cwd, 'config.json'))
// NOT: loadJsonFileSafe(cwd, 'config.json') with internal planningPath import
```

## Integration Warnings

- **CmdResult + handleResult() bridge:** The `handleResult()` function in cli.ts converts CmdResult back to CliOutput/CliError throws. This bridge MUST remain until ALL modules are converted. If you remove it prematurely, all converted modules stop producing output.
- **@maxsim/core alias + barrel changes:** The dashboard resolves `@maxsim/core` via three different mechanisms (tsconfig paths, vite resolve.alias, tsdown alias). If you move a type to a different module, all three must agree. Run the dashboard build specifically: `npm run build:dashboard`.
- **MCP direct imports + barrel exports:** MCP tools import from `../core/core.js` and `../core/phase.js` directly, bypassing the barrel. They will NOT see a new function added to the barrel unless it is also exported from the specific module they import from.
- **Vitest + loadConfig cache:** Vitest runs tests in the same process by default. The loadConfig cache persists across test files. Use `--pool=forks` if cache pollution becomes unmanageable, but prefer unique paths first.
- **Windows + temp dir cleanup:** `fs.rmSync` with `{ recursive: true, force: true }` can fail on Windows due to file locks from antivirus or git processes. Use `afterAll` for shared fixtures, not `afterEach`.

## Effort Estimates

| Recommendation | Effort | Notes |
|---------------|--------|-------|
| Reconcile duplicate interfaces (types.ts vs phase.ts) | S | Mechanical: delete from phase.ts, import from types.ts, fix any field differences |
| Convert one module to CmdResult (e.g., commands.ts) | M | Each module has 5-15 functions; each function has 2-5 exit paths to convert |
| Write tests for verify.ts (965 lines) | L | 9 exported functions; needs git fixtures for commit verification; sync code |
| Write tests for init.ts (1060 lines) | L | 20+ exported functions; each assembles context from filesystem; needs extensive scaffolding |
| Write tests for phase.ts (1193 lines) | M | Partially tested already; remaining functions follow established patterns |
| Extract loadJsonFile helper | S | Simple extraction; test with one call site first; verify no cycles |
| Remove dead workflow files | S | Grep for references, delete files, verify commands still work |
| Define library/entrypoint boundary | S | Documentation task: annotate which files may call process.exit |

## Sources

- Codebase analysis: `packages/cli/src/core/index.ts` (barrel), `types.ts`, `phase.ts`, `verify.ts`, `init.ts`, `core.ts`, `cli.ts`
- Existing test patterns: `packages/cli/tests/unit/phase-errors.test.ts`, `core-errors.test.ts`
- MCP tool import analysis: `packages/cli/src/mcp/*.ts`
- Dashboard import analysis: `packages/dashboard/src/server.ts`
- [Please Stop Using Barrel Files (TkDodo)](https://tkdodo.eu/blog/please-stop-using-barrel-files) -- barrel file risks and circular dependency patterns
- [Testing in Node.js: Easy way to mock filesystem (Medium)](https://medium.com/nerd-for-tech/testing-in-node-js-easy-way-to-mock-filesystem-883b9f822ea4) -- filesystem mocking patterns and anti-patterns
- [Node.js Mocking in tests (nodejs.org)](https://nodejs.org/en/learn/test-runner/mocking) -- official Node.js test mocking guidance
- [TypeScript Breaking Changes Wiki (GitHub)](https://github.com/microsoft/TypeScript/wiki/Breaking-Changes) -- TypeScript version compatibility

---
*Pitfalls research for: maxsimcli v5.1 Surgical Cleanup -- TypeScript monolith refactoring*
*Researched: 2026-03-08*
