# Phase 07 Context: GitHub Workflow Integration

**Created:** 2026-03-11
**Phase goal:** Every MAXSIM workflow (init, plan, execute, progress) creates, updates, and reads GitHub Issues automatically — `.planning/` becomes a local cache, GitHub Issues is the source of truth

---

## Decisions

### WIRE-01: Write Order — GitHub-First

All workflow artifacts (plans, research, summaries) are written to GitHub first:

1. Create content in memory
2. POST to GitHub (issue body, comment, or sub-issue)
3. If successful → operation succeeds (no local cache copy)
4. If failed → operation aborts entirely, no partial state

**Rationale:** GitHub is the single source of truth (ARCH-01 from Phase 2). Local files would be stale copies that add complexity.

### WIRE-02: No Local Phase Artifact Copies

After Phase 7, `.planning/` phase directories do **NOT** contain PLAN.md, SUMMARY.md, RESEARCH.md, or CONTEXT.md files. These artifacts live exclusively as GitHub Issue comments/bodies.

**What stays in `.planning/`:**
- `config.json` — project settings (model profile, branching strategy, workflow flags)
- `PROJECT.md` — project vision (always loaded into context)
- `REQUIREMENTS.md` — requirements (v1/v2/out-of-scope)
- `github-issues.json` — rebuildable mapping cache
- `codebase/` — STACK.md, ARCHITECTURE.md, CONVENTIONS.md
- `todos/pending/` and `todos/completed/` — todo storage (deferred migration)

**What moves to GitHub Issues exclusively:**
- Phase issue body → goal, requirements, success criteria (YAML frontmatter)
- Plan comments → task breakdown, dependencies, wave structure
- Research comments → findings, library analysis, approach evaluation
- Context comments → user decisions from /maxsim:discuss-phase
- Summary comments → completion records, evidence, metrics
- Verification comments → verification results
- UAT comments → user acceptance test outcomes

### WIRE-03: Init Requires GitHub Setup

`/maxsim:init` (both new-project and init-existing) **mandatorily** calls `mcp_github_setup` during initialization:

- Creates project board, labels (phase/task/blocker), milestone
- If no GitHub remote exists → init fails with setup instructions
- If `gh` isn't installed/authenticated → init fails with setup instructions
- No "local-only" mode exists

### WIRE-04: Per-Task GitHub Updates During Execution

`/maxsim:execute-phase` updates GitHub at **per-task granularity**:

- When a task starts → move sub-issue to "In Progress" on board
- When a task completes → close sub-issue, post completion comment (commit SHA, files changed), move to "Done"
- When a task fails review → reopen sub-issue, move back to "In Progress"
- Real-time visibility into execution progress

### WIRE-05: Always-Live Reads from GitHub

When workflows need to read state (e.g., `/maxsim:progress`, phase status checks):

- **Always query GitHub API live** — no reading from local cache for status
- `github-issues.json` mapping is used only for issue number lookups (which phase = which issue number), not for state
- Phase progress = count of open/closed sub-issues from live API
- Board status = live query via `mcp_query_board`

### WIRE-06: External Edit Detection with Warning

If someone edits a GitHub Issue directly (outside MAXSIM workflows):

- MAXSIM **detects** the change on next live read (since reads are always live)
- MAXSIM **warns** the user about the external modification
- User decides whether to accept/incorporate the change
- MAXSIM does not auto-incorporate external changes silently

### WIRE-07: Abort and Rollback on Partial Failure

If a GitHub API call fails during a multi-step workflow (e.g., 3 of 5 sub-issues created):

1. **Attempt to delete** partially-created issues via REST API (requires appropriate permissions)
2. If delete not possible → **archive/close** them as fallback (with rollback comment)
3. Report what succeeded and what failed
4. **Offer targeted retry** of just the failed operations (don't force full restart)

**Rate limiting:** Rely on existing Octokit throttling/retry plugins in `client.ts`. No pre-check of remaining quota needed.

### WIRE-08: Issue Lifecycle State Machine

Phase issues follow this board column lifecycle:

```
To Do → In Progress → In Review → Done
  │          │              │          │
  │          │              │          └─ PR merged + verifier confirms code works in main
  │          │              └─ All sub-issues closed, PR created, awaiting merge
  │          └─ Plan created (/maxsim:plan-phase completes), execution in progress
  └─ Phase exists in roadmap, no plan yet
```

**Detailed flow:**
1. **To Do** — Phase issue created (during init or when phase is added to roadmap)
2. **In Progress** — Triggered when `/maxsim:plan-phase` completes successfully
3. Execute → Review → Fix loop happens within "In Progress":
   - Executor runs tasks, reviewer checks, failed tasks reopen and move back to "In Progress"
   - This loop repeats until all tasks pass review
4. **In Review** — All task sub-issues closed + PR created from worktree to merge into main/working branch
   - Stays in "In Review" while PR is open
   - Post-merge verifier runs to confirm code works correctly in main
5. **Done** — PR merged AND verifier confirms successful integration

### WIRE-09: Task Sub-Issue Board Tracking

Task sub-issues get **full board column tracking** (not just open/closed):

- **To Do** — Task sub-issue created during planning
- **In Progress** — Executor starts working on the task
- **Done** — Task completed and passes review
- If review fails → task moves **back** from "Done" to "In Progress" (sub-issue reopened)

Tasks do not use the "In Review" column — that's phase-level only.

---

## Scope Boundaries

### In scope for Phase 7:
- Wiring GitHub MCP tools into: init, plan-phase, execute-phase, progress workflows
- Removing local file writes for phase artifacts (PLAN.md, SUMMARY.md, etc.)
- Adding rollback/retry logic for failed GitHub operations
- Implementing lifecycle state transitions on the board
- Adding external edit detection and warning

### Out of scope (deferred):
- Todo migration to GitHub Issues (stays local in `.planning/todos/`)
- Story point estimation via GitHub (Projects v2 REST API gap)
- Projects v2 field-create REST replacement (still uses `gh` CLI bridge)
- Offline mode or queued sync
- GitHub Actions integration
- Multi-repo support

---

## Architecture Notes

### Phase 2 Foundation (Already Built)
All GitHub adapter code exists and is tested:
- `packages/cli/src/github/` — 8 modules, ~2100 LOC (client, issues, projects, mapping, sync, labels, milestones, templates)
- `packages/cli/src/mcp/github-tools.ts` — 10 MCP tools
- `packages/cli/src/mcp/board-tools.ts` — 3 MCP tools
- `packages/cli/src/mcp/state-tools.ts` — 3 GitHub state query tools

### Phase 7 Changes Are Workflow-Level
Phase 7 modifies **workflow markdown files** (not TypeScript adapter code):
- `templates/workflows/new-project.md` — Add mandatory GitHub setup
- `templates/workflows/init-existing.md` — Add mandatory GitHub setup
- `templates/workflows/plan-phase.md` / `plan-create.md` — Add issue creation, board transitions
- `templates/workflows/execute-phase.md` / `execute-plan.md` — Add per-task updates, rollback logic
- `templates/workflows/progress.md` — Switch to live GitHub reads

May also need new/modified MCP tools for:
- Issue deletion/archiving (rollback support)
- External edit detection
- Batch board transitions
