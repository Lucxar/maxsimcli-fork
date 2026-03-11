---
generated: 2026-03-11
scope: full
direction: both
severity_summary:
  critical: 5
  warning: 4
  info: 3
---

# Drift Report: MAXSIM v5.0

## Summary

**Significant spec-code divergence detected.** The core architectural promise of v5.0 — "GitHub Issues as single source of truth" — is not wired into the workflows. The MCP backend exists but workflows still operate on local `.planning/` files exclusively. The REQUIREMENTS.md and ROADMAP.md show phases 1-6 as planned/executed, but several requirements are marked pending in REQUIREMENTS.md despite being implemented, and the fundamental ARCH-* requirements (Phase 2) are only partially fulfilled.

---

## Critical Findings

### CRIT-1: Workflows do not use GitHub Issues — ARCH-01 unfulfilled

**Spec says:** "GitHub Issues is the single source of truth for phases, tasks, and progress" (ARCH-01)
**Code reality:** Zero workflows reference `mcp_github_setup`, `mcp_create_phase_issue`, `mcp_query_board`, or any GitHub MCP tool. All 26 workflows operate exclusively on `.planning/` markdown files (STATE.md, ROADMAP.md, phases/).

- `templates/workflows/execute.md` reads `.planning/ROADMAP.md`, `.planning/STATE.md`
- `templates/workflows/plan.md` reads `.planning/ROADMAP.md`
- `templates/workflows/init.md` creates `.planning/` files only
- `templates/workflows/progress.md` mentions GitHub Issues once but has no tool calls

**Evidence:** `grep -r "mcp_github_setup\|mcp_create_phase_issue\|mcp_query_board\|mcp_move_issue" templates/` → 0 matches

**Impact:** The entire GitHub-native architecture exists as a backend but is never called. Users get a fully local `.planning/`-based experience identical to v4.x.

---

### CRIT-2: `.planning/` still contains work tracking — ARCH-02 unfulfilled

**Spec says:** "`.planning/` contains only project context (PROJECT.md, config, conventions, codebase analysis) — not work tracking"
**Code reality:** `.planning/` contains phases/, STATE.md, ROADMAP.md with full plan/summary tracking. This is the primary work tracking system.

- `.planning/phases/01-Infrastructure-Cleanup/` contains PLAN.md, SUMMARY.md, RESEARCH.md
- `.planning/STATE.md` tracks decisions, blockers, metrics, session continuity
- `.planning/ROADMAP.md` tracks plan completion progress

**Impact:** ARCH-02 requires `.planning/` to be context-only, but it IS the work tracking system.

---

### CRIT-3: Commands do not resume from GitHub state — ARCH-05 unfulfilled

**Spec says:** "State-machine commands that resume from GitHub state (idempotent, stateless)"
**Code reality:** Commands resume from `.planning/` state. The `init.md` workflow checks for `.planning/` directory existence, `ROADMAP.md`, `STATE.md`. The `go.md` workflow reads `.planning/STATE.md` via CLI tools. No workflow reads GitHub Issue state.

**Evidence:** Workflows reference `node .claude/maxsim/bin/maxsim-tools.cjs state load` (local), never `mcp_get_issue_detail` or `mcp_query_board`.

---

### CRIT-4: REQUIREMENTS.md traceability table is stale

**Spec says:** Phase 2-6 requirements traceability should reflect completion status.
**Code reality:** All ARCH-*, INFRA-*, and HOOK-* requirements show "Pending" in the traceability table despite:
- INFRA-01: Dashboard package removed (only `cli` and `website` remain in `packages/`)
- INFRA-05: `dist/` removed from git tracking (`.gitignore` excludes it, `git ls-files dist/` returns 0)
- HOOK-01 through HOOK-04: All implemented (statusline rewritten, sync-reminder added, update-checker backup added, context-monitor removed)

**Evidence:** `packages/` contains only `cli/` and `website/` (no `dashboard/`). `.gitignore` has `packages/cli/dist/` and `dist/`.

---

### CRIT-5: ROADMAP.md progress table is stale

**Spec says:** ROADMAP.md should reflect current completion status.
**Code reality:**
- Phase 1 shows "0/3 Planned" — but Plans 01-03 all have summaries on disk (disk_status: complete)
- Phase 5 shows "5/5 Complete" but is not marked `[x]` in the Phases list
- Phase 6 shows "1/2 In Progress" — but Plan 02 has a summary (complete on disk), and Plan 02 checkbox is unchecked
- Phase 1 checkbox unchecked despite all plans executed
- Phase 2 not marked `[x]` despite "4/4 Complete" in progress table

---

## Warning Findings

### WARN-1: Statusline does not source from GitHub Issues — HOOK-01 partial

**Spec says:** "The statusline hook displays current phase and progress sourced from GitHub Issues"
**Code reality:** Statusline reads from `.planning/STATE.md` and `.planning/ROADMAP.md` locally. No GitHub API calls in `maxsim-statusline.ts`.

**Impact:** Statusline works, but sources local data not GitHub data.

---

### WARN-2: Sync-reminder references GitHub Issues but no sync mechanism exists — HOOK-02 partial

**Spec says:** "Modifying files in `.planning/` triggers a reminder to sync changes to GitHub Issues"
**Code reality:** Hook shows message "Consider syncing to GitHub Issues when ready" but there is no actual sync command or workflow to perform the sync. The reminder is aspirational.

---

### WARN-3: INFRA-06 (sync/async duplication) status unknown

**Spec says:** "Eliminate sync/async duplication — async only throughout"
**Code reality:** `grep "Sync.*function\|function.*Sync" core.ts` returns 0 matches, suggesting sync duplicates may have been removed. However, REQUIREMENTS.md still shows INFRA-06 as Pending. Need deeper verification of whether all sync-path duplication was eliminated or just renamed.

---

### WARN-4: Dashboard references remain in workflows

**Spec says:** Dashboard removed (INFRA-01, INFRA-02)
**Code reality:** `new-project.md` workflow still references `@./references/dashboard-bridge.md` and contains `DASHBOARD_ACTIVE` logic with `mcp__maxsim-dashboard__ask_question` tool routing.

**Evidence:** `templates/workflows/new-project.md` lines 7, 13 reference dashboard-bridge.

---

## Info Findings

### INFO-1: Phase 2 code is complete but never exercised

The `packages/cli/src/github/` and `packages/cli/src/mcp/github-tools.ts` + `board-tools.ts` modules are fully implemented with:
- Octokit adapter with auth gate
- Issue CRUD (create phase issues, task sub-issues)
- Project Board management (create, move items)
- Labels and milestones
- MCP tool wrappers

This code compiles, is tested (E2E tests pass), and ships in the npm package. It's just never called by any workflow.

---

### INFO-2: packages/dashboard already removed

Despite INFRA-01 being marked "Pending", the `packages/dashboard/` directory no longer exists. Only `packages/cli/` and `packages/website/` remain. The requirement is fulfilled in code but not in spec.

---

### INFO-3: dist/ already removed from git

Despite INFRA-05 being marked "Pending", `dist/` is in `.gitignore` and `git ls-files dist/` returns 0 files. The requirement is fulfilled in code but not in spec.

---

## Divergence Summary

| Requirement | Spec Status | Code Status | Direction |
|-------------|-------------|-------------|-----------|
| ARCH-01 | Pending | Backend only, not wired | Code behind spec |
| ARCH-02 | Pending | Unfulfilled (`.planning/` IS work tracking) | Code behind spec |
| ARCH-03 | Pending | Implemented (requireAuth gate) | Code ahead of spec |
| ARCH-04 | Pending | Implemented (local-only install) | Code ahead of spec |
| ARCH-05 | Pending | Unfulfilled (resumes from local state) | Code behind spec |
| INFRA-01 | Pending | Done (dashboard removed) | Code ahead of spec |
| INFRA-02 | Pending | Done (no Express server) | Code ahead of spec |
| INFRA-03 | Pending | Done (MCP refocused) | Code ahead of spec |
| INFRA-04 | Pending | Partially done (update checker exists) | Code ahead of spec |
| INFRA-05 | Pending | Done (dist/ gitignored) | Code ahead of spec |
| INFRA-06 | Pending | Likely done (no sync fns found) | Code ahead of spec |
| HOOK-01 | Pending | Done (statusline rewritten) | Code ahead of spec |
| HOOK-02 | Pending | Partially done (reminder exists, no sync) | Partial |
| HOOK-03 | Pending | Done (update checker + backup) | Code ahead of spec |
| HOOK-04 | Pending | Done (context monitor removed) | Code ahead of spec |
| CMD-01–09 | Complete | Complete | Aligned |
| EXEC-01–05 | Complete | Complete | Aligned |
| PROMPT-01–05 | Complete | Complete | Aligned |

---

## Recommendations

### If realigning to code (spec follows code):
1. Mark INFRA-01 through INFRA-06, HOOK-01 through HOOK-04 as Complete in REQUIREMENTS.md
2. Update ROADMAP.md progress table and phase checkboxes to reflect actual completion
3. **Rewrite ARCH-01, ARCH-02, ARCH-05** to acknowledge that `.planning/` is the primary data store with GitHub Issues as optional enhancement (not source of truth)
4. Remove dashboard-bridge references from workflows
5. Update STATE.md metrics

### If realigning to spec (code follows spec):
1. Wire `mcp_github_setup` into `/maxsim:init` workflow (call after project creation)
2. Wire `mcp_create_phase_issue` into `/maxsim:plan` workflow (create issues when phases planned)
3. Wire `mcp_move_issue` into `/maxsim:execute` workflow (move issues as plans complete)
4. Wire `mcp_query_board` into `/maxsim:progress` workflow (read status from GitHub)
5. Create a sync mechanism for HOOK-02 (actual sync, not just reminder)
6. Remove dashboard-bridge references from workflows
7. Decide: should `.planning/` phase files move to GitHub Issues, or stay as local cache?

---
*Generated: 2026-03-11*
*Scope: Full .planning/ sweep*
