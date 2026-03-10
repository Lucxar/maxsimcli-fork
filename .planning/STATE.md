# Project State

## Project Reference

**Core Value:** Consistent, high-quality AI-assisted development at any project scale
**Current Focus:** Phase 3 -- Command Surface Simplification

## Current Position

**Milestone:** v5.0 -- MAXSIM Simplification & GitHub-Native Architecture
**Phase:** 3 (Command Surface Simplification)
**Plan:** 03-02 (Unified /maxsim:init Command)
**Status:** Executing

## Progress

| Metric | Value |
|--------|-------|
| Phases Complete | 1/6 |
| Plans Complete | 5 |
| Plans Failed | 0 |
| Blockers | 0 |

## Accumulated Context

### Decisions

1. GitHub Issues = source of truth (not .planning/)
2. `gh` CLI = hard requirement, no fallback
3. Local-only install (no global)
4. Dashboard removed (GitHub Project Board replaces)
5. ~9 commands (down from ~35)
6. State-machine commands (idempotent, resume from GitHub)
7. Skills for progressive disclosure
8. Clean break, no v4.x migration
9. Quality model profile for v5.0 planning
10. Prototype stage, breaking changes OK
11. MCP tools use requireAuth() gate (no graceful degradation to local-only)
12. Todo storage stays in .planning/todos/ for now (GitHub Issues migration deferred)

### Known Issues

| ID | Issue | Severity | Target Phase |
|----|-------|----------|--------------|
| TD-1 | Sync/async duplication in core.ts (50% duplication) | HIGH | Phase 1 |
| TD-2 | Triple markdown parser duplication | MEDIUM | Phase 1 |
| TD-3 | dist/ committed to git (21MB, 187 files) | MEDIUM | Phase 1 |
| TD-6 | OOM build workaround, no TypeScript declarations | MEDIUM | Phase 1 |
| BUG-1 | Sync vs async phase search searches different paths | HIGH | Phase 1 |

### Blockers

None currently.

### Key Metrics

- Commands: ~35 current, target ~9
- Agents: 15 current, to be consolidated
- Skills: 11 current, to be expanded with better triggers
- Dashboard: removing entirely (52K-line server + React frontend)

## Session Continuity

### Last Session
- **Date:** 2026-03-10
- **Activity:** Executed Plan 03-02 (Unified /maxsim:init Command)
- **Outcome:** Created init.md command template and thin router workflow (7.7KB) detecting 4 scenarios and delegating to existing sub-workflows
- **Next Step:** Continue Phase 03 Wave 1 plans (03-01 parallel)

### Recovery Instructions
1. Read `.planning/ROADMAP.md` for phase structure and dependencies
2. Read `.planning/STATE.md` (this file) for current position
3. Check active phase details in ROADMAP.md Phase Details section
4. Resume from current position noted above

---
*State initialized: 2026-03-09*
*Last updated: 2026-03-10 (plan 03-02 complete)*
