# Plan 02-03 Summary: Projects v2 Board & Sync Module via Octokit REST

**Phase:** 02-GitHub-Issues-Foundation
**Plan:** 03
**Status:** Complete
**Duration:** ~13 minutes
**Date:** 2026-03-10

## Objective

Rewrite projects.ts and sync.ts to use Octokit REST API, replacing all GraphQL and gh-legacy.js usage.

## What Was Built

Projects v2 board management and GitHub-native state verification via Octokit REST API, eliminating all GraphQL queries and gh-legacy.js imports from both modules.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 01 | Rewrite projects.ts with Projects v2 REST API | 06ebc76 | packages/cli/src/github/projects.ts |
| 02 | Rewrite sync.ts for GitHub-native state queries | 842a34d | packages/cli/src/github/sync.ts |
| -- | Remove unused imports/helpers from projects.ts | f4e8bc5 | packages/cli/src/github/projects.ts |

## Key Decisions

1. **Projects v2 REST typed methods confirmed available** -- Octokit REST has full typed endpoints for Projects v2 (listForUser, addItemForUser, updateItemForUser, etc.). No need for `octokit.request()` with explicit paths as the plan suggested.
2. **gh CLI bridge needed only for project creation** -- The Projects v2 REST API has no POST endpoint for creating new projects. Used `execFileSync('gh', ['project', 'create', ...])` as a compatibility bridge with TODO(v5.1) marker.
3. **gh CLI bridge for missing status options** -- Adding single-select options to fields has no REST endpoint. Used gh CLI field-create as a bridge with TODO(v5.1) marker.
4. **Owner type detection pattern** -- Both projects.ts and sync.ts need to handle User vs Organization owned repos. Implemented `detectOwnerType()` helper using `octokit.rest.repos.get()`.
5. **addItemToProject takes issue number, not node_id** -- The REST API `addItemForUser` accepts numeric issue ID and type ("Issue"), not node_id. This changes the function signature from the old version.
6. **Sequential API calls for sync.ts** -- Per plan constraint, getAllPhasesProgress uses sequential calls for sub-issue progress (not Promise.all) to avoid rate limit issues.

## Artifacts

### Created
- `.planning/phases/02-GitHub-Issues-Foundation/02-03-SUMMARY.md` (this file)

### Modified
- `packages/cli/src/github/projects.ts` -- Full rewrite: 493 lines, 4 exports (ensureProjectBoard, addItemToProject, moveItemToStatus, getProjectBoard)
- `packages/cli/src/github/sync.ts` -- Full rewrite: 259 lines, 4 exports (checkPhaseProgress, getPhaseState, detectInterruptedPhase, getAllPhasesProgress)

## Deviations

1. **[Rule 1 - Auto-fix] Removed unused imports/helpers from projects.ts** -- After rewriting to use withGhResult pattern, the fail() helper and loadMapping/saveMapping/createEmptyMapping imports became unused. Removed in commit f4e8bc5.
2. **[Deviation - tsc OOM] tsc --noEmit not runnable** -- Known issue TD-6: tsc runs out of memory on this codebase. Used tsdown build (which succeeds) and npm test as verification instead.
3. **[Deviation - Consumer breakage] MCP tool files still import old function signatures** -- github-tools.ts, board-tools.ts, todo-tools.ts, phase-tools.ts import functions with old signatures (setEstimate, syncCheck). These are Plan 04 scope (MCP tools integration, legacy removal). Build still succeeds (warnings only, not errors).

## Verification Results

- Build: PASS (npm run build succeeds)
- Tests: PASS (212 tests, 10 test files, all pass)
- Lint: PASS (biome check, no issues)
- No gh-legacy imports: PASS (grep verification)
- No GraphQL usage: PASS (grep verification)
- Sub-issues API used: PASS (listSubIssues in sync.ts)
- Line counts: projects.ts 493 lines (min 100), sync.ts 259 lines (min 60)
- Key links verified: both files import from client.js

## Review Cycle
- Spec: PASS (0 retries)
- Code: PASS (0 retries)
- Issues: 0 critical, 0 warnings

## Deferred Items

- [feature] setEstimate function removed from projects.ts -- consumers in MCP tools will be updated in Plan 04
- [refactor] MCP tool files (github-tools.ts, board-tools.ts, todo-tools.ts, phase-tools.ts) need updated imports for new function signatures -- Plan 04 scope

---
*Summary created: 2026-03-10*
