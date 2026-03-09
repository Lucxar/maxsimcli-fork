# Phase 1: GitHub Issues Integration for MCP Task Management — Decisions

| # | Decision | Rationale | Alternatives Considered | Status |
|---|----------|-----------|------------------------|--------|
| 7 | GitHub Issues as single source of truth for task tracking | Developers get native GitHub visibility; eliminates duplication between local files and external tracking | Local-only tracking (current), GitHub as mirror only | Locked |
| 8 | Full MCP tool replacement (not coexistence) | Avoids temporary duplication period; cleaner than maintaining two systems | Build alongside existing (coexistence), deprecate-then-remove | Locked |
| 9 | One Project board per repo with GitHub Milestones for grouping | Single board avoids fragmentation; milestones provide built-in progress tracking | Board per milestone, single board with label filtering | Locked |
| 10 | Kanban columns: To Do, In Progress, In Review, Done | Standard 4-column flow familiar to all developers; blockers via GitHub's native "blocked by" linking | Add Blocked column, custom per project | Locked |
| 11 | Fibonacci story points via GitHub Projects Estimate field | Standard estimation; built-in field avoids label noise; summable/sortable | Labels (simpler), no estimates, T-shirt sizes | Locked |
| 12 | Phase = parent tracking issue with live task list | Checklist pattern auto-renders progress; developers see phase completion at a glance | Phase as milestone, both parent + milestone | Locked |
| 13 | Auth mandatory but skippable during setup | Pushes adoption without hard-blocking non-GitHub users; graceful degradation | Truly mandatory (blocks GitLab/Bitbucket users), fully optional | Locked |
| 14 | Same review cycle for all issue types (including todos) | Consistent quality bar; no shortcuts; every change gets reviewed | Immediate close for todos, size-dependent review | Locked |
| 15 | External issues importable, AI decides placement | Bi-directional sync; AI triages intelligently | Always as todo, user chooses each time, ignore external | Locked |
| 16 | Detailed progress comments on issues during work | Developer can watch AI progress in real-time on GitHub | Key milestones only, state transitions only | Locked |
