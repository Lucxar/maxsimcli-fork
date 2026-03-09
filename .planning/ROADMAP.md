# Roadmap: MAXSIM

## Milestones

- SHIPPED **v5.0 Context-Aware SDD** -- Phases 1-5 (shipped 2026-03-08)

## Phases

<details>
<summary>SHIPPED v5.0 Context-Aware SDD (Phases 1-5) -- SHIPPED 2026-03-08</summary>

- [x] Phase 1: Context Rot Prevention (2/2 plans) -- completed 2026-03-06
- [x] Phase 2: Deep Init Questioning (3/3 plans) -- completed 2026-03-07
- [x] Phase 3: Agent Coherence (4/4 plans) -- completed 2026-03-07
- [x] Phase 4: Spec Drift Management (3/3 plans) -- completed 2026-03-07
- [x] Phase 5: Workflow Coverage (2/2 plans) -- completed 2026-03-07

Full details: [milestones/v5.0-ROADMAP.md](milestones/v5.0-ROADMAP.md)

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Context Rot Prevention | v5.0 | 2/2 | Complete | 2026-03-06 |
| 2. Deep Init Questioning | v5.0 | 3/3 | Complete | 2026-03-07 |
| 3. Agent Coherence | v5.0 | 4/4 | Complete | 2026-03-07 |
| 4. Spec Drift Management | v5.0 | 3/3 | Complete | 2026-03-07 |
| 5. Workflow Coverage | v5.0 | 2/2 | Complete | 2026-03-07 |

### Phase 1: GitHub Issues Integration for MCP Task Management

**Goal:** Replace local-only task tracking with GitHub Issues as single source of truth. GitHub Projects v2 provides kanban board, Issues provide task lifecycle, Milestones provide grouping. All MCP tools gain GitHub-backed behavior with graceful degradation.
**Requirements**: AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17
**Depends on:** Phase 0
**Plans:** 6 plans

Plans:
- [x] 01-01: GitHub foundation modules (gh wrapper, types, mapping)
- [x] 01-02: Setup infrastructure (project board, labels, milestones, templates)
- [x] 01-03: Issue CRUD (create, close, comment, import, supersede, branch naming)
- [ ] 01-04: MCP tools + sync (github-tools, board-tools, sync check)
- [ ] 01-05: Existing tool integration (phase, todo, state tools gain GitHub hooks)
- [ ] 01-06: Build verification and end-to-end smoke test
