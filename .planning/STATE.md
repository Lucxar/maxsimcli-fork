# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-08)

**Core value:** Every AI-assisted coding task runs with the right amount of context -- no more, no less -- producing consistent, correct output from phase 1 to phase 50.
**Current focus:** v5.1 Surgical Cleanup -- error handling, test coverage, dedup, dead code removal

## Current Position

Milestone: v5.1 Surgical Cleanup
Phase: 01 -- GitHub Issues Integration for MCP Task Management
Plan: 03 of 6 (complete)
Status: Executing
Last activity: 2026-03-09 -- Plan 01-03 complete (issue CRUD module)

Progress: [███░░░░░░░] 30%

## Accumulated Context

### Decisions

- [01-01] Used GhResult<T> discriminated union consistent with project's existing CmdResult pattern
- [01-01] Synchronous fs in mapping.ts to match existing core module patterns
- [01-02] Used fail<T>() helper to re-wrap GhResult error branches across generic types
- [01-02] GraphQL updateProjectV2Field mutation for adding single-select status options (no CLI equivalent)
- [01-02] REST API for milestones (simpler than GraphQL for CRUD ops)
- [01-03] Explicit GhResult error construction for cross-generic propagation (avoids TS narrowing issues)
- [01-03] Batch size 5 with Promise.all per batch for GitHub rate limit safety

### Architecture

- THREE INDEPENDENT LAYERS: Claude Code standalone + Core Server (MCP) + Dashboard (optional UI)
- .mcp.json auto-discovery replaces need for session-start hook
- MCP install is optional (graceful fallback to Bash tools router)
- Skills installed at `.claude/skills/maxsim-*/SKILL.md`
- `using-maxsim` registered in AGENTS.md (not hooks)

### Pending Todos

None.

### Roadmap Evolution

- Phase 1 added: GitHub Issues Integration for MCP Task Management

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-09T15:59:00Z
Stopped at: Completed 01-03-PLAN.md (issue CRUD module)
Resume file: .planning/phases/01-github-issues-integration-for-mcp-task-management/01-03-SUMMARY.md
Next action: Execute plan 01-04 (wave 3)
