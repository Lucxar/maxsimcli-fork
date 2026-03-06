# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-06)

**Core value:** Every AI-assisted coding task runs with the right amount of context -- no more, no less -- producing consistent, correct output from phase 1 to phase 50.
**Current focus:** Phase 1 -- Context Rot Prevention

## Current Position

Milestone: v5.0 Context-Aware SDD
Phase: 1 of 5 (executing)
Plan: 01-01 complete
Status: executing
Last activity: 2026-03-06 -- Completed 01-01 Phase archive sweep

Progress: [██░░░░░░░░░░░░░░░░░░] 0/5 phases

## Performance Metrics

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 01 | 01 | ~15min | 2 | 6 |

## Accumulated Context

### Decisions

- **Clean slate**: All v4.x planning documents rewritten. Completed phases archived to `.planning/archive/v4/`. Roadmap renumbered from Phase 1. Previous milestone context removed from active docs to prevent context rot.
- **Context rot as first priority**: Phase 1 addresses MAXSIM's own planning document accumulation before tackling other features. Practice what we preach.
- **Phase order**: Phase 1 (rot prevention) first. Phase 2 (init) and Phase 5 (workflow gaps) can run in parallel. Phase 3 (agents) depends on Phase 2. Phase 4 (drift) depends on Phase 3.

### Architecture

- THREE INDEPENDENT LAYERS: Claude Code standalone + Core Server (MCP) + Dashboard (optional UI)
- .mcp.json auto-discovery replaces need for session-start hook
- MCP install is optional (graceful fallback to Bash tools router)
- Skills installed at `.claude/skills/maxsim-*/SKILL.md`
- `using-maxsim` registered in AGENTS.md (not hooks)

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-06
Stopped at: Completed 01-01-PLAN.md
Resume file: None
Next action: Execute 01-02 plan (Stale detection + milestone reset)
