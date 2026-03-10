# Project State

## Project Reference

**Core Value:** Consistent, high-quality AI-assisted development at any project scale
**Current Focus:** Phase 5 -- Parallel Execution Model

## Current Position

**Milestone:** v5.0 -- MAXSIM Simplification & GitHub-Native Architecture
**Phase:** 5 (Parallel Execution Model)
**Plan:** 05-02 complete (review cycle enhancement)
**Status:** In progress

## Progress

| Metric | Value |
|--------|-------|
| Phases Complete | 2/6 |
| Plans Complete | 17 |
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
- [Phase 03]: Orchestrator workflow kept to 8KB by delegating all stage logic to sub-workflows via @references
- [Phase 03]: Execute workflow kept to 13KB by delegating per-plan execution to execute-plan.md and inlining verification as a stage
- [Phase 03]: Go workflow uses structured CLI tools (state-snapshot, roadmap analyze) instead of raw file parsing for reliable state detection
- [Phase 03]: Quick todo mode exits after action (no loop back to task mode) for clean UX separation
- [Phase 03]: Milestone completion routes through /maxsim:init which handles the full lifecycle interactively
- [Phase 03]: Clean break deletion -- 33 old command files and 21 obsolete workflow files removed, no redirects or aliases
- [Phase 03]: All cross-references updated to 9-command surface; 35 files modified, zero old command names remain in templates/
- [Phase 03]: Installer orphan cleanup list updated with 33 deleted commands + 21 deleted workflows for v4.x upgrade cleanup
- [Phase 04]: User-facing skills rewritten from scratch: removed alwaysApply, removed old 13-agent references, added 4-agent model and 9-command surface, suggestion-based composition via see-also
- [Phase 04]: Rules files use plain markdown (no frontmatter) in templates/rules/ for always-loaded content; alwaysApply not used
- [Phase 04]: Agent-system-map documents orchestrator-mediated pattern; subagents cannot spawn subagents in Claude Code
- [Phase 04]: 14 agents consolidated to 4 generic types (executor, planner, researcher, verifier) with skill preloading for shared protocols
- [Phase 04]: builtInSkills array updated with 8 internal skills for installer/uninstaller cleanup
- [Phase 04]: Orphan cleanup entries in hooks.ts (not patches.ts); MODEL_PROFILES uses highest-tier mapping per consolidated role; 4 additional workflow files beyond plan scope also updated
- [Phase 04]: Integration verification found 8 template files with stale old agent names (debug.md, quick.md, model-profiles.md, context.md, prompt templates) -- all fixed to use 4-agent names
- [Phase 05]: Review cycle retry counters (max 3 per stage) with escalation-to-user protocol added to execute-plan.md
- [Phase 05]: Simplify stage config-gated via review.simplify_review setting (defaults to true)
- [Phase 05]: SUMMARY.md template enhanced with Review Cycle (Attempts/Duration/Findings) and Requirement Evidence sections

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

- Commands: 9 (target achieved, down from ~35)
- Agents: 4 (consolidated from 14 specialized agents)
- Skills: 19 total (8 internal + 11 user-facing), all rewritten for new architecture
- Dashboard: removing entirely (52K-line server + React frontend)

## Session Continuity

### Last Session
- **Date:** 2026-03-10
- **Activity:** Executed Plan 05-02 (Review cycle enhancement with retry counters and escalation)
- **Outcome:** Added formal retry counters (max 3 per stage), escalation protocol, config-optional simplify, and enhanced SUMMARY.md reporting to execute-plan.md review cycle. 2 tasks, 2 files modified.
- **Next Step:** Continue Phase 5 remaining plans (05-01, 05-03, 05-04, 05-05)

### Recovery Instructions
1. Read `.planning/ROADMAP.md` for phase structure and dependencies
2. Read `.planning/STATE.md` (this file) for current position
3. Check active phase details in ROADMAP.md Phase Details section
4. Resume from current position noted above

---
*State initialized: 2026-03-09*
*Last updated: 2026-03-10 (plan 05-02 complete)*
