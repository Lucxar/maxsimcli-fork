# Plan 01-04 Summary: MCP Tools + Sync Check

**Status:** Complete
**Duration:** ~9 minutes
**Tasks:** 2/2
**Date:** 2026-03-09

## Objective

Build the MCP tool layer exposing GitHub operations to Claude Code, the sync check mechanism, and wire everything into the MCP server. Replaces existing local-only task tracking with GitHub-backed implementations that degrade gracefully.

## What Was Built

14 new MCP tools (10 GitHub issue lifecycle + 4 board query) added to the MCP server, plus a sync check module for detecting external changes to tracked issues. All tools degrade gracefully to local-only mode when GitHub CLI is not installed or authenticated.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 4.1 | Sync check module and barrel export | `37b0b76` | `github/sync.ts`, `github/index.ts` |
| 4.2 | MCP tools and server wiring | `6375447` | `mcp/github-tools.ts`, `mcp/board-tools.ts`, `mcp/index.ts` |

## Key Decisions

- [01-04] Used batched GraphQL queries in syncCheck for efficiency (up to 100 issues per query) with sequential fallback on GraphQL failure
- [01-04] handleExternalClose returns data for AI decision (does not auto-decide on accept/reopen)
- [01-04] Used `export *` in github barrel export for maintainability despite CONVENTIONS.md preferring explicit exports -- justified by internal-only consumption and plan spec requirement
- [01-04] findIssueInMapping and updateLocalMappingStatus helper functions duplicated in both github-tools.ts and board-tools.ts rather than extracting to shared util -- keeps each file self-contained and avoids circular dependency risk

## Files Created

- `packages/cli/src/github/sync.ts` -- Sync check: detect external changes, verify issue state, handle external close (381 lines)
- `packages/cli/src/github/index.ts` -- Barrel export for all github modules (16 lines)
- `packages/cli/src/mcp/github-tools.ts` -- 10 GitHub issue lifecycle MCP tools including PR creation with auto-close linking (863 lines)
- `packages/cli/src/mcp/board-tools.ts` -- 4 board query/search/filter/estimate MCP tools (567 lines)

## Files Modified

- `packages/cli/src/mcp/index.ts` -- Added registerGitHubTools and registerBoardTools to registerAllTools

## MCP Tools Registered

### github-tools.ts (10 tools)
1. `mcp_github_setup` -- Set up GitHub integration (board, labels, milestone, templates)
2. `mcp_create_plan_issues` -- Create all task issues for a finalized plan
3. `mcp_create_todo_issue` -- Create a GitHub issue for a todo item
4. `mcp_move_issue` -- Move issue to new status column
5. `mcp_close_issue` -- Close issue as completed or not planned
6. `mcp_post_comment` -- Post progress comment on issue
7. `mcp_import_issue` -- Import external GitHub issue into MAXSIM tracking
8. `mcp_sync_check` -- Check for external changes to tracked issues
9. `mcp_supersede_plan` -- Close old plan issues and link to new plan
10. `mcp_create_pr` -- Create PR with Closes #N auto-linking (AC-08)

### board-tools.ts (4 tools)
1. `mcp_query_board` -- Query project board with status/phase filtering
2. `mcp_search_issues` -- Search issues by label, milestone, state, or text
3. `mcp_get_issue_detail` -- Get full issue details including comments
4. `mcp_set_estimate` -- Set Fibonacci story points on an issue

## Requirements Addressed

- **AC-04**: MCP tools for issue lifecycle (create, move, comment, close)
- **AC-07**: MCP tools for board queries (query board, search/filter issues)
- **AC-08**: PR creation with auto-close linking via `Closes #N` -- mcp_create_pr calls buildPrBody() then gh pr create
- **AC-09**: Sync check detects external changes to GitHub issues
- **AC-10**: All existing task-tracking MCP tools replaced with GitHub-backed versions (existing tools preserved as fallback)
- **AC-11**: New MCP tools: query board, search/filter issues, post comment, move cards

## Verification Results

- TypeScript: 0 errors in new files (pre-existing errors in unrelated files unchanged)
- Tool count: 14 new tools (10 + 4), 22 existing tools preserved, 36 total
- Graceful degradation: 18 detectGitHubMode() calls across both files
- AC-08 wiring: buildPrBody() called by mcp_create_pr, gh pr create invoked
- No process.exit(): confirmed zero calls in new MCP tool files
- Tests: 212/212 passing

## Review Cycle

- Spec: PASS (0 retries) -- all 6 requirements verified via grep and manual inspection
- Code: PASS (0 retries) -- follows existing MCP tool pattern, no process.exit, no stdout writes
- Issues: 0 critical, 1 minor warning (export * barrel convention)

## Deviations

- [Rule 3 - Convention Deviation] `github/index.ts` uses `export *` instead of explicit exports per CONVENTIONS.md. Kept as-is because: (a) plan spec explicitly defines this syntax, (b) internal-only consumption, (c) explicit exports would require maintenance on every function addition.

## Deferred Items

- [refactor] Extract findIssueInMapping helper from github-tools.ts and board-tools.ts into shared util -- deferred because duplication is small and avoids import complexity
