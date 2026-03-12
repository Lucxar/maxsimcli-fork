# Phase 08: Stale Reference Cleanup - Research

**Researched:** 2026-03-12
**Domain:** Template cleanup, CLI dead code removal, statusline enhancement
**Confidence:** HIGH — all targets verified via codebase search

---

## Layer 1: Template/Workflow Stale References

### 1.1 Dashboard-Bridge (CLEAN-01)

**File to delete:** `templates/references/dashboard-bridge.md`

**13 workflow files with `@./references/dashboard-bridge.md` @include lines:**
- `discovery-phase.md:11`, `execute-plan.md:10`, `discuss-phase.md:14`, `execute-phase.md:28`
- `batch.md:16`, `new-milestone.md:10`, `init-existing.md:9`, `plan-phase.md:32` (moot if deleted)
- `new-project.md:7`, `verify-work.md:18`, `settings.md:7`, `sdd.md:18`, `quick.md:19`

**8 files with inline DASHBOARD_ACTIVE / mcp__maxsim-dashboard__ logic blocks:**
- `execute-phase.md`: lines 56-67 (probe step), 341-348, 424-431, 728-735 (lifecycle events)
- `execute-plan.md:366-370`: DASHBOARD_ACTIVE branch in checkpoint
- `discuss-phase.md:30-32`: tool_mandate dashboard routing
- `new-milestone.md:15`, `init-existing.md:15`, `new-project.md:13`, `settings.md:11`: tool_mandate paragraphs
- `verify-work.md:181-194`: DASHBOARD_ACTIVE conditional in present_test

### 1.2 Old Command Names

- `/maxsim:verify` in `go.md:169` — command doesn't exist, replace with correct verify invocation
- `/maxsim:discuss-milestone` in `new-milestone.md:25,30` — command doesn't exist, remove references

### 1.3 Missing File References

- `transition.md` in `execute-phase.md:748,785` — file doesn't exist, remove both references per Decision 5

### 1.4 Stale Agent Name

- "debugger agent" in `help.md:109` → should be "verifier agent"

### 1.5 Deprecated plan-phase.md (Decision 4)

**File to delete:** `templates/workflows/plan-phase.md`

**Files requiring active updates (10 total):**

| Priority | File | Lines | Change |
|----------|------|-------|--------|
| CRITICAL | `discuss-phase.md` | 606, 609, 614, 618, 629, 642 | Rewrite spawn block to use `plan.md` |
| HIGH | `discovery-phase.md` | 5, 23, 41, 76, 121, 174 | Replace `plan-phase.md` with `plan-create.md` |
| MEDIUM | `phase.ts` | 126, 192 | Change `/maxsim:plan-phase` to `/maxsim:plan` |
| LOW | `diagnose-issues.md` | 4, 18, 97, 121, 193, 209 | Replace `plan-phase --gaps` with `plan --gaps` |
| LOW | `verify-work.md` | 256 | Replace `plan-phase --gaps` with `plan --gaps` |
| LOW | `execute-phase.md` | 748 | Update caller attribution |
| LOW | `git-planning-commit.md` | 27 | Update row |
| LOW | `questioning.md` | 22 | Update `plan-phase` to `plan` |
| LOW | `settings.md` | 36, 97 | Update "during plan-phase" to "during planning" |
| LOW | `go.md` | 248 | Constraint comment — cosmetic |

**Files to KEEP unchanged:**
- `cli.ts:365,389` — backs `init plan-phase` CLI tool still used by `plan.md:23`
- `init.ts:74,509-510` — implements the CLI command
- `install/hooks.ts:47` — orphan cleanup array (correct, keeps cleaning old installs)

### 1.6 general-purpose Subagent Type

Used in:
- `discuss-phase.md:637` (in plan-phase spawn block — removed with Decision 4 cleanup)
- `batch.md:228,302` — needs assessment
- `plan-phase.md:422` (deleted with Decision 4)

Surviving instances in `batch.md` need replacement or documentation.

---

## Layer 2: CLI Source Dead Code

### 2.1 Dead isGlobal Parameters

| Location | Status |
|----------|--------|
| `installHookFiles(targetDir, isGlobal, failures)` in `hooks.ts:188` | Dead — all callers pass `false` |
| `configureSettingsHooks(targetDir, isGlobal)` in `hooks.ts:230` | Dead — all callers pass `false` |
| `finishInstall(..., isGlobal)` in `hooks.ts:361` | Dead — never read in body, caller passes `false` |
| `getConfigDirFromHome(_isGlobal)` in `shared.ts:45` | Dead — ignores param, returns `'.claude'` always |
| `getGlobalDir()` in `shared.ts:28` | @deprecated — only used by `uninstall.ts:17` in dead branch |

**Safe to remove:** Remove `isGlobal` params from all 3 hook functions, remove `getConfigDirFromHome`, assess `getGlobalDir` (used in uninstall dead branch).

### 2.2 AgentType Missing 'debugger'

- `AgentType` in `types.ts:83-87`: union of `executor | planner | researcher | verifier` — no `debugger`
- `DebuggerAgentContext` in `types.ts:654-664`: has `debugger_model: string` field
- `cmdInitDebugger` in `init.ts:1072`: resolves model via `'verifier'` type — naming inconsistency

**Resolution:** Either add `'debugger'` to `AgentType` with its own MODEL_PROFILES entry, or rename `debugger_model` to `verifier_model` in both the interface and init code.

### 2.3 Legacy Model Field Names

These are **NOT dead code** — actively consumed by 10+ workflow templates:
- `checker_model` → resolves via `'planner'` — consumed in `plan-create.md:212`, `plan-phase.md:310`, `quick.md:204`, `verify-work.md:446`
- `synthesizer_model` → resolves via `'researcher'` — consumed in `new-project.md:977`, `new-milestone.md:177`
- `roadmapper_model` → resolves via `'planner'` — consumed in `new-project.md:1215,1295`, `new-milestone.md:300`, `init-existing.md:1122`
- `mapper_model` → resolves via `'researcher'` — consumed in `init-existing.md:232,251,270,289`

**Decision:** Document as intentional role mappings. Renaming would require updating all consuming templates — out of scope for a cleanup phase. Fix minor type bug: `PlannerAgentContext.checker_model` typed `string` should be `ModelResolution`.

### 2.4 Legacy .planning/milestones/ Search Paths

3 compatibility shims, all safe to remove:

| Shim | Location | Function |
|------|----------|----------|
| 1 | `core.ts:441-468` | `findPhaseInternal` — fallback after `.planning/archive/` |
| 2 | `core.ts:503-531` | `getArchivedPhaseDirs` — appends milestones entries |
| 3 | `phase.ts:1121-1140` | `cmdGetArchivedPhase` — fallback search |

**Follow-on actions:**
- Delete test case in `archive.test.ts:401` (tests the shim)
- Update `templates/templates/milestone-archive.md:3,115-116` (references milestones/ path)
- Keep negative assertion test in `stale-detection.test.ts:199` (unaffected)

### 2.5 Duplicate ROADMAP.md Archive Write

In `milestone.ts`:
- **First write (lines 149-153):** Writes `{archiveDir}/ROADMAP.md`
- **Second write (lines 156-159):** Writes `{archiveDir}/{version}-ROADMAP.md` (legacy format)

Two distinct destinations — not truly duplicate. Remove the legacy `{version}-ROADMAP.md` write entirely (clean break). Eliminate redundant re-read.

---

## Layer 3: .planning/ Files

### 3.1 File Counts (for ARCHITECTURE.md update)

| Category | Actual Count |
|----------|-------------|
| Slash commands | 9 |
| Workflow files | 26 (25 after plan-phase.md deletion) |
| Agent files | 4 definitions + 1 index (AGENTS.md) |
| Skill directories | 20 |

### 3.2 Template Stubs

Phase 08/09/10 CONTEXT.md and RESEARCH.md stubs reference old command names:
- `/maxsim:plan` (discuss stage) — previously referenced as `/maxsim:discuss-phase`
- `/maxsim:plan` (research stage) — previously referenced as `/maxsim:research-phase`

---

## Statusline Enhancement (CLEAN-02)

### Current Implementation

**File:** `packages/cli/src/hooks/maxsim-statusline.ts`

Current flow:
1. `formatStatusline()` reads cache synchronously, spawns background refresh if stale
2. Background refresh makes 3 `execSync` calls via detached child process
3. Cache at `.claude/cache/maxsim-progress.json` with 60s TTL

### Bug Confirmed (line 80)

```
labels=phase:  ← WRONG (no label named "phase:" exists)
labels=phase   ← CORRECT (the label is just "phase")
```

Additionally, phase number extraction parses a non-existent per-phase label. Should parse `[Phase XX]` from issue title instead (matching `mapping.ts:272` pattern: `/^\[Phase\s+(\S+)\]/`).

### Board Column Query — Recommended Approach

**Strategy: Issue-first GraphQL** (no project number needed, but available in `github-issues.json`):

```graphql
{
  repository(owner: "OWNER", name: "REPO") {
    issue(number: ISSUE_NUMBER) {
      projectItems(first: 5, includeArchived: false) {
        nodes {
          project { number }
          fieldValueByName(name: "Status") {
            ... on ProjectV2ItemFieldSingleSelectValue { name }
          }
        }
      }
    }
  }
}
```

**Response path:** `data.repository.issue.projectItems.nodes[0].fieldValueByName.name`
→ Returns `"To Do"`, `"In Progress"`, `"In Review"`, `"Done"`, or `null`

**Required OAuth scope:** `read:project` — graceful degrade if missing.

**Issue number source:** Read from `github-issues.json` → `phases[activePhaseNumber].tracking_issue.number`. The active phase number is already fetched via the REST label query.

### Changes Required

1. Fix label query: `labels=phase:` → `labels=phase`
2. Fix phase number extraction: parse from issue title, not label name
3. Add GraphQL call for board column (or use `gh project item-list`)
4. Extend `ProgressCache`: add `board_column: string | null`
5. Update `formatStatusline`: render `P{N} {BoardColumn} | {milestone}: {pct}% | dirname`
6. Offline fallback: write cache with nulls on failure → renders `P? offline | dirname`

---

*Research completed: 2026-03-12 via 6 parallel sonnet agents*
