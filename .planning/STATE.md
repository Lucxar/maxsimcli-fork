# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-08)

**Core value:** Every AI-assisted coding task runs with the right amount of context -- no more, no less -- producing consistent, correct output from phase 1 to phase 50.
**Current focus:** v5.1 Surgical Cleanup -- error handling, test coverage, dedup, dead code removal

## Current Position

Milestone: v5.1 Surgical Cleanup
Phase: Not started (defining requirements)
Plan: --
Status: Defining requirements
Last activity: 2026-03-08 -- Milestone v5.1 started

Progress: [░░░░░░░░░░] 0%

## Accumulated Context

### Decisions

None.

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

Last session: 2026-03-09T15:01:13.450Z
Stopped at: Phase 1 context gathered
Resume file: .planning/phases/01-github-issues-integration-for-mcp-task-management/01-CONTEXT.md
Next action: Define requirements and create roadmap
