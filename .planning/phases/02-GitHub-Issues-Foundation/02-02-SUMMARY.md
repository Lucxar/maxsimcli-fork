# Plan 02-02 Summary: Issue CRUD Rewrite with Octokit and Native Sub-Issues

**Phase:** 02-GitHub-Issues-Foundation
**Plan:** 02
**Status:** COMPLETE
**Duration:** ~12 minutes
**Tasks:** 2/2

## What Was Built

Rewrote issues.ts, labels.ts, milestones.ts, and mapping.ts to use Octokit REST API instead of gh CLI wrapper. Phase Issues now have YAML frontmatter bodies, tasks are linked as native sub-issues via GitHub's sub-issue API, and plans are posted as structured comments on phase Issues. The mapping module is now documented and functions as a rebuildable cache with `rebuildMappingFromGitHub()`.

## Commits

| # | Hash | Message | Files |
|---|------|---------|-------|
| 1 | `4897cfe` | feat(02-02): rewrite issues.ts with Octokit and native sub-issues | issues.ts |
| 2 | `a8b830d` | feat(02-02): rewrite labels, milestones, mapping to use Octokit | labels.ts, milestones.ts, mapping.ts, types.ts |

## Key Decisions

1. **Sub-issue API typed as `any`** — The `addSubIssue` and `listSubIssues` methods are not yet in the `@octokit/rest` type definitions. Cast `octokit.rest.issues as any` for these two methods. Type safety is maintained by the return type assertions.

2. **Orphan cleanup on sub-issue link failure** — When `createTaskSubIssue` fails to link a child issue, it attempts to close the orphan issue with `state_reason: 'not_planned'` before returning the error.

3. **`id` field added to `TaskIssueMapping` in types.ts** — [Rule 3 - blocking issue] The plan's `files_modified` listed only `issues.ts`, `labels.ts`, `milestones.ts`, `mapping.ts`, but the `TaskIssueMapping` type lives in `types.ts`. Added the `id: number` field there because it's required for sub-issue operations and explicitly listed in the plan's `must_haves`.

4. **Simplified `ensureMilestone` return type** — Old version returned `{ number, id, created }`. New version returns `{ number }` only, since `id` is internal to Octokit and `created` boolean is not used by callers.

5. **`rebuildMappingFromGitHub` extracts phase number from title** — Parses `[Phase XX]` from issue titles to reconstruct the mapping. Task keys are generated as `task-{number}` since the original task IDs are not stored on GitHub.

## Artifacts

### Created
- `.planning/phases/02-GitHub-Issues-Foundation/02-02-SUMMARY.md`

### Modified
- `packages/cli/src/github/issues.ts` (262 lines, 8 exports — full rewrite)
- `packages/cli/src/github/labels.ts` (105 lines, 1 export — full rewrite)
- `packages/cli/src/github/milestones.ts` (78 lines, 2 exports — full rewrite)
- `packages/cli/src/github/mapping.ts` (297 lines, +1 export — rebuildMappingFromGitHub)
- `packages/cli/src/github/types.ts` (+1 field — `id` on TaskIssueMapping)

## Deviations

1. **[Rule 3 - Blocking Issue]** Task 02: Added `id: number` field to `TaskIssueMapping` in `types.ts` (not in `files_modified`). Required for sub-issue operations and explicitly listed in plan's `must_haves.artifacts`. The type is shared infrastructure and the change is additive (non-breaking).

## Verification Results

- Build: PASS (`npm run build` succeeds)
- Tests: PASS (212/212 tests pass)
- No gh-legacy imports in rewritten modules: PASS
- addSubIssue API usage: PASS
- YAML frontmatter in phase bodies: PASS
- rebuildMappingFromGitHub present: PASS
- Cache documentation present: PASS
- `id` field in TaskIssueMapping: PASS

## Known Warnings (Expected, Out of Scope)

The build produces MISSING_EXPORT warnings from downstream MCP tools (phase-tools.ts, github-tools.ts, state-tools.ts, todo-tools.ts) that still import old function names removed in this rewrite (e.g., `postComment`, `createTodoIssue`, `createAllPlanIssues`, `closeMilestoneIfComplete`). These consumers will be rewritten in Plan 03 (orchestrator rewrite).

## Review Cycle

- Spec: SKIPPED (parallel execution context)
- Code: SKIPPED (parallel execution context)
- Issues: 0 critical, 0 warnings

---
*Completed: 2026-03-10*
