# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-08)

**Core value:** Every AI-assisted coding task runs with the right amount of context -- no more, no less -- producing consistent, correct output from phase 1 to phase 50.
**Current focus:** v5.1 Surgical Cleanup -- error handling, test coverage, dedup, dead code removal

## Current Position

Milestone: v5.1 Surgical Cleanup
Phase: 01 -- GitHub Issues Integration for MCP Task Management
Plan: 02 of 6 (complete)
Status: Executing
Last activity: 2026-03-09 -- Plan 01-02 complete (setup infrastructure)

Progress: [██░░░░░░░░] 20%

## Accumulated Context

### Decisions

- [01-01] Used GhResult<T> discriminated union consistent with project's existing CmdResult pattern
- [01-01] Synchronous fs in mapping.ts to match existing core module patterns
- [01-02] Used fail<T>() helper to re-wrap GhResult error branches across generic types
- [01-02] GraphQL updateProjectV2Field mutation for adding single-select status options (no CLI equivalent)
- [01-02] REST API for milestones (simpler than GraphQL for CRUD ops)

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

Last session: 2026-03-09T15:59:23.494Z
Stopped at: Completed 01-02-PLAN.md
Resume file: None
Next action: Execute plan 01-03 (wave 3)
