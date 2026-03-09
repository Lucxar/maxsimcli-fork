# Phase 1 Context: Infrastructure Cleanup

**Created:** 2026-03-09
**Phase Goal:** The codebase is lean, builds cleanly, and has no dead code from removed features

## Dashboard Removal Boundaries

**Decision: Aggressive full removal — no traces anywhere.**

- Delete `packages/dashboard/` entirely (Vite+React frontend + Express backend)
- Audit `packages/cli/src/core/` and remove any exports, types, or utilities that ONLY existed to support the dashboard
- Remove all dashboard references from:
  - `copy-assets.cjs` (build pipeline)
  - `install.ts` (installer)
  - `package.json` scripts and npm workspace config
  - CLI command router (`npx maxsimcli dashboard` command — delete entirely, no deprecation message)
- Remove all dashboard-specific tests AND e2e dashboard integration tests
- Remove `@maxsim/core` path alias config from tsconfig/vite/tsdown (since only dashboard used it cross-package)

## MCP Server Scope

**Decision: Leave MCP server as-is in Phase 1. Rebuild happens in a later phase.**

- Do NOT strip or modify MCP server tools in Phase 1
- The MCP server currently exposes local `.planning/` tools (state, phases, roadmap, todos, etc.) — these still work and are useful during development
- GitHub Issues-focused tools get built when the GitHub Issues foundation is ready (Phase 2+)
- Backend server (Express/WebSocket for dashboard) needs investigation: research must map whether backend-server.cjs shares code or initialization with MCP server before removal
  - If fully separate: delete backend server entirely in Phase 1
  - If shared: extract shared code, then delete backend server

## Deduplication Strategy

**Decision: Full sweep, breaking changes, async-only throughout.**

- Scope: ALL source files in `packages/cli/src/`, not just `core.ts`
- Delete all sync function variants; keep only async versions
- Update ALL callers to use async versions — no compatibility layer, no deprecation wrappers
- This is a breaking change, justified by Decision #8 (clean break, no v4.x migration)
- Fix BUG-1 (sync vs async phase search searches different paths) as part of this work

### Markdown Parser Consolidation (TD-2)

**Decision: Conditional — depends on research findings.**

- Research should investigate the triple markdown parser duplication
- If consolidation is straightforward (similar interfaces, clear merge path): include in Phase 1
- If complex (deeply different approaches, many callers, risky): defer to a later phase or separate task
- Researcher should provide explicit recommendation with complexity assessment

## dist/ Removal & Build Pipeline

**Decision: Simple git removal, no DTS, verify CI.**

### Git Cleanup
- Use `git rm -r --cached dist/` to remove from tracking
- Add `dist/` to `.gitignore`
- Do NOT rewrite git history (no filter-branch/filter-repo)

### Build Configuration
- Skip DTS (TypeScript declaration) generation permanently — MAXSIM is a CLI tool, not a library. Nobody imports types from `maxsimcli`
- Remove the OOM workaround once dashboard removal lightens the build
- Target: `npm run build` succeeds cleanly without hacks

### CI Pipeline
- Research must verify `publish.yml` workflow builds correctly without pre-built `dist/` in the repo
- CI already runs `npm ci && npm run build` before publish — likely fine, but verify
- Ensure semantic-release still works after dist/ is untracked

## Known Issues Addressed

| ID | Issue | Approach |
|----|-------|----------|
| TD-1 | Sync/async duplication in core.ts (50%) | Delete sync variants, async-only |
| TD-2 | Triple markdown parser duplication | Conditional on research complexity assessment |
| TD-3 | dist/ committed to git (21MB) | git rm --cached + .gitignore |
| TD-6 | OOM build workaround, no TypeScript declarations | Remove workaround after dashboard deletion; skip DTS permanently |
| BUG-1 | Sync vs async phase search different paths | Fixed by eliminating sync variants |

## Deferred Ideas

None captured during discussion.

## Scope Guardrails

- Phase 1 does NOT add new features — it only removes and cleans
- MCP server tools are untouched (Phase 2+ rebuilds them)
- No new commands or workflows
- No GitHub Issues integration (Phase 2)
- No command surface changes (Phase 3)

---
*Context captured: 2026-03-09*
