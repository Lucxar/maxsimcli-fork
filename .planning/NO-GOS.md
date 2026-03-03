# No-Gos

**Generated:** 2026-03-03
**Source:** Init-existing initialization for v5.0 milestone

## Must Not Break

- `npx maxsimcli@latest` install flow — this is how every user gets MAXSIM
- Existing `/maxsim:*` command interfaces — users have muscle memory
- Existing `.planning/` file format — projects with v4.x planning dirs must still work
- npm publish pipeline — every push to main auto-publishes via semantic-release

## Anti-Patterns

- Adding multi-runtime adapter code back — Claude Code only, no abstraction layers
- Over-engineering context assembly — keep it simple, role-based, not ML-powered
- Agents that operate in isolation — every agent must know what comes before and after it
- Skills with overlapping activation triggers — one trigger = one skill
- Sync file I/O in hot paths — use async for all file operations in frequently-called code
- Monorepo-only features — everything must ship in the npm tarball

## Scope Boundaries

- This milestone is NOT trying to add new commands (except `/maxsim:check-drift`)
- This milestone is NOT redesigning the dashboard
- This milestone is NOT refactoring large modules (that's v2 requirements / tech debt)
- This milestone is NOT adding community features, marketplace, or multi-user support

---
*No-gos captured during /maxsim:init-existing initialization*
