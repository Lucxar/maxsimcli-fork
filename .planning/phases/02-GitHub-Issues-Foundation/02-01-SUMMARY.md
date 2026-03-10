# Plan 02-01 Summary: Octokit Adapter & Local-Only Install

**Phase:** 02-GitHub-Issues-Foundation
**Plan:** 01
**Status:** Complete
**Duration:** ~10 minutes
**Date:** 2026-03-10

## What Was Built

Octokit REST adapter with throttling/retry plugins, AuthError hard gate (no 'local-only' fallback), and local-only installation enforcement. The adapter provides a singleton Octokit instance authenticated via `gh auth token`, cached in memory per process.

## Tasks

| # | Task | Commit | Status |
|---|------|--------|--------|
| 01 | Install Octokit packages and configure bundler | `7ab032a` | Done |
| 02 | Create Octokit client adapter and update types | `8872d8a` | Done |
| 03 | Enforce local-only installation | `2ca49e1` | Done |

## Key Decisions

1. **Kept GitHubMode as deprecated** -- Cannot remove GitHubMode type from types.ts because gh-legacy.ts and 5 MCP tool files still use detectGitHubMode(). Marked as @deprecated with note that Plan 03 will delete it with gh-legacy.ts.
2. **Kept getGlobalDir/getConfigDirFromHome as deprecated** -- Cannot remove from shared.ts because uninstall.ts, adapters.ts, and hooks.ts still import them. Marked @deprecated with TODO for future removal.
3. **requireAuth() scope check is lenient** -- Does not throw on missing 'project' scope detection because gh auth status output format varies across versions. The API call itself will fail with 403 if scope is missing, providing a more reliable error path.

## Files Created

| File | Purpose |
|------|---------|
| `packages/cli/src/github/client.ts` | Octokit singleton factory, auth gate, repo info detection, error wrapper |

## Files Modified

| File | Change |
|------|--------|
| `packages/cli/package.json` | Added @octokit/rest, @octokit/plugin-throttling, @octokit/plugin-retry |
| `packages/cli/tsdown.config.ts` | Added noExternal for @octokit in cli and mcp-server entries |
| `packages/cli/src/github/types.ts` | Added AuthError class, minimal labels (phase/task/blocker), deprecated GitHubMode |
| `packages/cli/src/github/gh.ts -> gh-legacy.ts` | Renamed for temporary backward compatibility |
| `packages/cli/src/github/index.ts` | Barrel now exports client.js and gh-legacy.js |
| `packages/cli/src/github/issues.ts` | Import updated to gh-legacy.js |
| `packages/cli/src/github/labels.ts` | Import updated to gh-legacy.js |
| `packages/cli/src/github/milestones.ts` | Import updated to gh-legacy.js |
| `packages/cli/src/github/projects.ts` | Import updated to gh-legacy.js |
| `packages/cli/src/github/sync.ts` | Import updated to gh-legacy.js |
| `packages/cli/src/mcp/board-tools.ts` | Import updated to gh-legacy.js |
| `packages/cli/src/mcp/github-tools.ts` | Import updated to gh-legacy.js |
| `packages/cli/src/mcp/phase-tools.ts` | Import updated to gh-legacy.js |
| `packages/cli/src/mcp/state-tools.ts` | Import updated to gh-legacy.js |
| `packages/cli/src/mcp/todo-tools.ts` | Import updated to gh-legacy.js |
| `packages/cli/src/install/index.ts` | Removed --global flag, location prompt; always installs to CWD/.claude/ |
| `packages/cli/src/install/shared.ts` | Deprecated getGlobalDir and getConfigDirFromHome |
| `package-lock.json` | Updated with new @octokit dependencies |

## Deviations

1. **[Rule 3 - Blocking] MCP tools import update** -- Task 02 plan specified updating 5 github/ files (issues, projects, sync, labels, milestones) but not the 5 MCP tool files (board-tools, github-tools, phase-tools, state-tools, todo-tools) that also import from `../github/gh.js`. Updated all 10 files to prevent build failure.
2. **[Rule 3 - Blocking] GitHubMode type kept** -- Task 02 plan specified "Remove GitHubMode type entirely" but it is imported by gh-legacy.ts which is used by 5 MCP tool files. Kept as deprecated to avoid breaking the build.
3. **[Rule 3 - Blocking] getGlobalDir/getConfigDirFromHome kept** -- Task 03 plan specified removing these functions but they are imported by uninstall.ts, adapters.ts, and hooks.ts. Marked as deprecated instead.

## Verification Results

- `npm run build` -- PASS (all 6 entry points compile successfully)
- `npm test` -- PASS (212/212 tests pass)
- `--global` rejection -- PASS (exits with error message and code 1)
- Help text -- PASS (no --global references)
- client.ts exports -- PASS (getOctokit, requireAuth, getRepoInfo, resetOctokit, withGhResult all present)
- AuthError class -- PASS (exported from types.ts)
- MAXSIM_LABELS -- PASS (phase/task/blocker only)
- tsdown noExternal -- PASS (@octokit pattern in cli and mcp-server entries)

## Self-Check: PASSED

- [x] `packages/cli/src/github/client.ts` exists
- [x] `packages/cli/src/github/gh-legacy.ts` exists
- [x] `packages/cli/src/github/gh.ts` does not exist
- [x] Commits `7ab032a`, `8872d8a`, `2ca49e1` exist in git log

---
*Summary created: 2026-03-10*
