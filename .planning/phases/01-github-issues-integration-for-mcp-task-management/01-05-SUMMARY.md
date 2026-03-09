# Plan 01-05 Summary: Wire GitHub into Existing MCP Tools

## Result: COMPLETE

**Duration:** ~12 minutes
**Tasks:** 2/2 completed
**Deviations:** 0

## What Was Built

Integrated GitHub operations into the three existing MCP tool files (phase-tools.ts, todo-tools.ts, state-tools.ts) so that every lifecycle event (create, complete, block) also updates GitHub when in 'full' mode, while preserving local-only fallback for backward compatibility.

## Key Changes

### phase-tools.ts (379 lines added)
- **mcp_find_phase**: Enriches response with `github_tracking_issue` and `github_task_issues` from mapping file
- **mcp_list_phases**: Adds `github_issue_counts` (open/closed) per phase when in 'full' mode
- **mcp_complete_phase**: Runs `syncCheck()` before completion (AC-09), closes tracking issue, closes remaining task issues, moves all to Done on board, checks milestone completion
- **mcp_bounce_issue** (NEW): Moves issue to "In Progress" on board + posts reviewer feedback comment (AC-05)
- Helper functions: `findIssueInMapping()`, `updateLocalMappingStatus()` for shared use

### todo-tools.ts (270 lines added)
- **mcp_add_todo**: After local creation, creates GitHub issue via `createTodoIssue()`, adds to project board, sets "To Do" status, stores mapping
- **mcp_complete_todo**: After local completion, closes GitHub issue and moves to Done on board
- **mcp_list_todos**: Enriches each todo with `github_issue_number` and `github_status` from mapping

### state-tools.ts (minimal additions)
- **mcp_add_blocker**: After local add, extracts issue numbers from text (e.g., "#42"), posts blocker comment on referenced issues
- **mcp_resolve_blocker**: After local resolve, posts resolution comment on referenced GitHub issues
- **mcp_get_state**, **mcp_update_state**, **mcp_add_decision**: Unchanged (purely local STATE.md operations)

## Integration Pattern

All GitHub operations follow the same degradation pattern:
```typescript
const mode = await detectGitHubMode();
if (mode === 'full') {
  try {
    // GitHub operations
  } catch (e) {
    githubWarning = `GitHub operation failed: ${(e as Error).message}`;
  }
}
```
Local operation always succeeds first. GitHub failures add a `github_warning` field but never fail the tool call.

## Commits

| Hash | Message |
|------|---------|
| e82d21c | feat(01-05): integrate GitHub operations into phase MCP tools |
| 04cde13 | feat(01-05): integrate GitHub operations into todo and state MCP tools |

## Files Modified

- `packages/cli/src/mcp/phase-tools.ts` — GitHub integration + mcp_bounce_issue
- `packages/cli/src/mcp/todo-tools.ts` — GitHub issue lifecycle for todos
- `packages/cli/src/mcp/state-tools.ts` — GitHub blocker linking

## Verification

- tsdown bundler build: PASS (mcp-server.ts compiles to 533 kB)
- Graceful degradation pattern: Present in all 3 files (25 occurrences total)
- syncCheck in phase completion: Present (import + usage)
- No process.exit() calls: 0 in all 3 files
- All existing tool names registered: Confirmed
- mcp_bounce_issue registered: Confirmed
- Backward compatibility: All existing tool interfaces preserved

## Requirements Addressed

- **AC-04**: Phase completion triggers GitHub issue close and board move to Done
- **AC-05**: mcp_bounce_issue moves issues back to In Progress with detailed comment
- **AC-06**: Todo completion triggers GitHub issue close
- **AC-09**: Phase actions run sync check before executing
- **AC-10**: Issues move through kanban columns as AI works
- **AC-17**: Graceful degradation on every GitHub call

## Key Decisions

- [01-05] findIssueInMapping duplicated in phase-tools.ts (same pattern as github-tools.ts and board-tools.ts per 01-04 decision)
- [01-05] extractIssueNumbers regex for blocker linking: matches #N, "issue N", "issue #N" patterns
- [01-05] mcp_complete_phase closes ALL remaining open task issues (not just tracking issue) to ensure clean state

## Review Cycle
- Spec: PASS (0 retries)
- Code: PASS (0 retries)
- Issues: 0 critical, 0 warnings

## Deferred Items

None.
