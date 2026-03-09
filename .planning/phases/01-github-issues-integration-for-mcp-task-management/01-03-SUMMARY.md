# Plan 01-03 Summary: Issue CRUD with batch creation, supersession, and branch naming

**Status:** Complete
**Duration:** ~10 minutes
**Tasks:** 2/2

## What Was Built

Issue CRUD module (`packages/cli/src/github/issues.ts`) with 13 exported functions covering the full issue lifecycle: creating task issues with collapsible `<details>` spec bodies, parent tracking issues with live checkbox task lists, lighter todo issues, comments, close/reopen, external issue import, supersession with bidirectional cross-references, batch creation with rate-limit-safe batches of 5, and branch naming following `maxsim/issue-{N}-{slug}` pattern. PR body builder includes `Closes #{N}` for auto-close on merge.

## Commits

| # | Hash | Message | Files |
|---|------|---------|-------|
| 1 | 8c41e2d | feat(01-03): add issue creation functions and utilities | issues.ts |
| 2 | 638ab96 | feat(01-03): add lifecycle, import, batch, and supersession functions | issues.ts |
| 3 | a88720d | fix(01-03): remove unused updateTaskMapping import | issues.ts |

## Key Decisions

- Used explicit `{ ok: false, error: ..., code: ... }` construction for GhResult error propagation instead of direct `return result` to avoid TypeScript generic narrowing issues across different GhResult<T> instantiations
- Batch creation uses `Promise.all` within batches of 5, with sequential iteration between batches, for rate limit safety
- `parseIssueNumberFromUrl` extracts issue number from `gh issue create` URL stdout (never parses JSON from issue create)
- `fetchIssueDetails` does a separate `gh issue view --json` call after creation to get `node_id`
- `Array.from(new Set(...))` used instead of spread on Set to avoid downlevelIteration requirements

## Artifacts

### Created
- `packages/cli/src/github/issues.ts` (745 lines, 13 exports)

### Exports
| Function | Type | Purpose |
|----------|------|---------|
| createTaskIssue | async | Create task issue with [P{N}] title and `<details>` spec body |
| createParentTrackingIssue | async | Create parent tracking issue with checkbox task list |
| createTodoIssue | async | Create lighter todo issue (no collapsible section) |
| getIssueBranchName | sync | Return `maxsim/issue-{N}-{slug}` branch name |
| buildPrBody | sync | Build PR body with `Closes #{N}` lines (AC-08) |
| closeIssue | async | Close issue with optional reason |
| reopenIssue | async | Reopen a closed issue |
| closeIssueAsSuperseded | async | Close with bidirectional cross-references |
| postComment | async | Post comment on issue |
| importExternalIssue | async | Import external issue, add maxsim+imported labels |
| updateParentTaskList | async | Toggle checkbox in parent issue body |
| createAllPlanIssues | async | Batch create all plan issues with concurrency limit |
| supersedePlanIssues | async | Supersede old plan issues when re-planned |

## Deviations

- [Rule 1 - Auto-fix bug] Removed unused `updateTaskMapping` import that was flagged during code review. Fixed in commit a88720d.

## Review Cycle
- Spec: PASS (0 retries)
- Code: PASS (0 retries)
- Issues: 0 critical, 1 warning (unused import, fixed)

## Verification Results

| Check | Result |
|-------|--------|
| tsc --noEmit | PASS (0 issues.ts errors) |
| Title format [P{N}] | PASS |
| No JSON.parse for issue create | PASS (0 matches) |
| Branch naming maxsim/issue-{N}-{slug} | PASS |
| Closes #{N} pattern | PASS |
| Concurrency limit (BATCH_SIZE=5) | PASS |
| Export count >= 13 | PASS (13) |
| No process.exit() calls | PASS |
| Biome lint | PASS |
| min_lines >= 200 | PASS (745) |

## Self-Check: PASSED
