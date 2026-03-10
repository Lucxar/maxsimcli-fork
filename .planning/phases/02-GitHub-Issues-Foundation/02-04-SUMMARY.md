# Summary: 02-04 MCP Tools Integration & Legacy Removal

**Plan:** 02-04
**Phase:** 02-GitHub-Issues-Foundation
**Status:** Complete
**Duration:** ~14 minutes
**Date:** 2026-03-10

## Objective

Wire the new Octokit adapter into the MCP tools layer and remove all legacy code. After this plan, MCP tools use the Octokit-based adapter for all GitHub operations, gh-legacy.ts is deleted with zero remaining references, and state tools read progress from GitHub Issues.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 01 | Wire MCP tools to Octokit adapter | 429d05c | github-tools.ts, board-tools.ts, state-tools.ts, todo-tools.ts, phase-tools.ts, issues.ts |
| 02 | Delete gh-legacy.ts and clean barrel export | 3032f95 | gh-legacy.ts (deleted), index.ts, types.ts, templates.ts |

## What Was Built

**MCP tools rewrite (github-tools.ts):** Replaced 10 tools using detectGitHubMode/ghExec with new tools using requireAuth/Octokit adapter. New tools: mcp_github_setup, mcp_create_phase_issue, mcp_create_task_issue, mcp_post_plan_comment, mcp_close_issue, mcp_reopen_issue, mcp_get_issue, mcp_list_sub_issues, mcp_post_completion, mcp_move_issue.

**Board tools rewrite (board-tools.ts):** Replaced gh CLI project queries with getProjectBoard/addItemToProject from Octokit adapter. New tools: mcp_query_board, mcp_add_to_board, mcp_search_issues.

**State tools addition (state-tools.ts):** Added three new GitHub state query tools (mcp_get_phase_progress, mcp_get_all_progress, mcp_detect_interrupted) using sync.ts adapter. Kept local STATE.md tools (get/update/decision/blocker) for project context. Blocker/resolve tools now use requireAuth for best-effort GitHub linking.

**Todo tools update (todo-tools.ts):** Replaced detectGitHubMode with requireAuth for best-effort GitHub issue closing on completion. Marked full GitHub Issues migration as future work (TODO comment).

**Phase tools update (phase-tools.ts):** Replaced detectGitHubMode with requireAuth for phase completion. Simplified completion flow (removed old syncCheck, updateParentTaskList). Bounce issue now uses requireAuth gate.

**Legacy removal:** Deleted gh-legacy.ts (302 lines). Removed deprecated GitHubMode type. Cleaned barrel export. Updated templates.ts labels (maxsim/phase-task -> phase/task). Removed all doc comments referencing deleted module.

## Key Decisions

1. Added generic `postComment()` to issues.ts -- needed by phase-tools (bounce) and state-tools (blocker linking) but not in original adapter
2. Simplified phase completion GitHub operations -- removed syncCheck (pre-completion) and updateParentTaskList (native sub-issues track this), kept issue closing
3. Todo tools remain as local .planning/ files with best-effort GitHub integration -- full migration to GitHub Issues deferred

## Deviations

- [Rule 2 - Missing critical functionality] Task 01: Added `postComment()` function to issues.ts because MCP tools (phase bounce, blocker linking) needed a generic comment poster that was in the old issues.ts but not the new one. Files: issues.ts. Commit: 429d05c.

## Verification

```
CLAIM: Zero legacy references, build passes, all tests pass
EVIDENCE: grep -r "gh-legacy|detectGitHubMode|ghExec|ghGraphQL|'local-only'" src/ -> no matches
EVIDENCE: test ! -f packages/cli/src/github/gh-legacy.ts -> PASS (deleted)
EVIDENCE: npm run build -> SUCCESS
EVIDENCE: npm test -> 212/212 tests pass
EVIDENCE: grep -r "requireAuth" src/mcp/ -> 20+ matches (all tools gated)
EVIDENCE: grep -c "octokit" dist/mcp-server.cjs -> 159 references (bundled)
VERDICT: ALL PASS
```

## Files Created

- (none)

## Files Modified

- packages/cli/src/mcp/github-tools.ts (rewritten -- Octokit adapter tools)
- packages/cli/src/mcp/board-tools.ts (rewritten -- Octokit board tools)
- packages/cli/src/mcp/state-tools.ts (updated -- GitHub state query tools added)
- packages/cli/src/mcp/todo-tools.ts (updated -- requireAuth gate)
- packages/cli/src/mcp/phase-tools.ts (updated -- requireAuth gate, simplified completion)
- packages/cli/src/github/issues.ts (added postComment)
- packages/cli/src/github/index.ts (cleaned barrel export)
- packages/cli/src/github/types.ts (removed GitHubMode, cleaned comments)
- packages/cli/src/github/templates.ts (updated label names)
- packages/cli/src/github/labels.ts (cleaned comments)
- packages/cli/src/github/milestones.ts (cleaned comments)
- packages/cli/src/github/projects.ts (cleaned comments)
- packages/cli/src/github/sync.ts (cleaned comments)

## Files Deleted

- packages/cli/src/github/gh-legacy.ts (302 lines -- legacy gh CLI wrapper)

## Deferred Items

- [feature] Migrate todo storage from .planning/todos/ to GitHub Issues -- deferred because todo system works and migration is orthogonal to the adapter wiring goal
- [refactor] Add MCP tools for setEstimate (Fibonacci points) via new Octokit adapter -- deferred because the old estimate field API was project-board specific and the new adapter doesn't expose it yet

## Self-Check: PASSED
