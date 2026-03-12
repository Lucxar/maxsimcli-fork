# Phase 08 Context: Stale Reference Cleanup

**Created:** 2026-03-12
**Phase goal:** No dead references to removed features remain in workflows, CLI source, or .planning/ files — and the statusline sources enriched data from GitHub with an offline indicator fallback

---

## Decision 1: Comprehensive Cleanup Scope

**Clean everything** — not just dashboard-bridge references. Phase 8 covers three layers:

### Layer 1: Template/Workflow Stale References
- **Dashboard-bridge** (CLEAN-01): Delete `templates/references/dashboard-bridge.md` and remove all `@include` lines + inline `DASHBOARD_ACTIVE`/`mcp__maxsim-dashboard__` logic from 13 workflow files
- **Old command names**: `/maxsim:verify` in `go.md`, `/maxsim:discuss-milestone` in `new-milestone.md`
- **Missing file reference**: `transition.md` referenced in `execute-phase.md` — remove the reference (do NOT create the file)
- **Stale agent name**: "debugger agent" in `help.md` → should be "verifier"
- **Deprecated plan-phase.md**: Delete entirely. Update `discuss-phase.md` and any other files that spawn it to use `plan.md` + sub-workflows instead
- **`general-purpose` subagent type**: Document or replace — used in discuss-phase.md, batch.md, plan-phase.md but not in the 4-agent model docs

### Layer 2: CLI Source Dead Code
- **Dead `isGlobal` parameters**: Remove from `installHookFiles`, `configureSettingsHooks`, `finishInstall` in `install/hooks.ts`; clean up `getGlobalDir()` and `getConfigDirFromHome()` in `install/shared.ts`
- **`AgentType` missing `'debugger'`**: Add `'debugger'` to the type union or resolve the inconsistency with `DebuggerAgentContext`
- **Legacy model field names**: `synthesizer_model`, `roadmapper_model`, `mapper_model`, `checker_model` — rename or document as aliases
- **Legacy `.planning/milestones/` search paths**: 3 compatibility shims in `core.ts` and `phase.ts` — remove (clean break, v4.x compat not required)
- **Duplicate ROADMAP.md archive write**: `milestone.ts` writes identical file twice per archive — remove the legacy copy

### Layer 3: .planning/ Files
- **Stale counts in ARCHITECTURE.md**: "39 slash-commands", "42 workflow files", "15 agent files", etc. — update to current counts
- **Template stubs**: Phase 08/09/10 CONTEXT.md and RESEARCH.md stubs reference old command names (`/maxsim:discuss-phase`, `/maxsim:research-phase`) — update

---

## Decision 2: Statusline Enriched with Board Column

**Format:** `P{N} {BoardColumn} | {milestone}: {pct}% | dirname`

**Example:** `P7 In Progress | v5.0: 60% | myproject`

### Display rules:
- **Phase number**: Parse from issue title `[Phase XX]` pattern on the most recently updated open issue with `phase` label (fix current bug: query uses `labels=phase:` with colon, should be `labels=phase`)
- **Board column**: Full column names — "To Do", "In Progress", "In Review", "Done" (not abbreviations, not emojis)
- **Milestone**: Keep current format — `{title}: {pct}%` from GitHub Milestones API

### Data source:
- **Live GitHub API** via `gh` CLI (not local `github-issues.json`)
- **3 API calls** in the background subprocess (acceptable with 60-second cache):
  1. `gh repo view` — repo detection
  2. `gh api repos/.../milestones` — milestone progress
  3. `gh api` (GraphQL or REST) — project board item status for active phase
- **Cache**: Keep 60-second TTL in `.claude/cache/maxsim-progress.json`

---

## Decision 3: Offline Indicator Fallback

When GitHub is unavailable (no `gh` CLI, no auth, API error, network failure):

- **Show:** `P? offline | dirname` — user sees that MAXSIM data is unavailable
- **No local .planning/ parsing** — the statusline does NOT fall back to reading local files
- **No pre-check**: Always attempt GitHub API calls. Let failures be cached (60-second TTL prevents hammering). No check for `github-issues.json` existence before attempting.

---

## Decision 4: Delete plan-phase.md Entirely

`templates/workflows/plan-phase.md` is marked deprecated but still actively spawned from `discuss-phase.md`. Resolution:
- **Delete** `plan-phase.md`
- **Update** `discuss-phase.md` to spawn `plan.md` (the Phase 7 entry point that routes to plan-discuss/plan-research/plan-create sub-workflows)
- **Update** any other references to `plan-phase.md`

---

## Decision 5: Remove transition.md Reference

`execute-phase.md` line 785 instructs Claude to read `transition.md` for auto-advancing to the next phase. The file doesn't exist.
- **Remove** the reference entirely
- Phase advancement is handled by the user running `/maxsim:go` or `/maxsim:execute` next
- Do NOT create `transition.md` — do NOT inline transition logic

---

## Deferred Ideas

None — all identified stale references are in scope for this phase.

---

## Requirements Mapping

| Requirement | Covered by |
|-------------|-----------|
| CLEAN-01 | Decision 1, Layer 1 (dashboard-bridge removal) |
| CLEAN-02 | Decisions 2 + 3 (statusline GitHub sourcing + offline fallback) |

---

## Research Guidance

Researchers should investigate:
- The exact GraphQL query needed to get a project board item's column/status for a given issue
- Whether the standalone hook bundle can use the `gh api graphql` command for project board queries
- The full list of files affected by plan-phase.md deletion (all references and spawners)
- Whether removing legacy `.planning/milestones/` search paths breaks any active code paths

---
*Context created: 2026-03-12 via /maxsim:plan*
