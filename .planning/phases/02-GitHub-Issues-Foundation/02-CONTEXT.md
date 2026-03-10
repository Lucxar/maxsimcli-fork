# Phase 2: GitHub Issues Foundation — Context

**Created:** 2026-03-10
**Phase Goal:** All work tracking (phases, tasks, progress) flows through GitHub Issues, not local markdown files
**Requirements:** ARCH-01, ARCH-02, ARCH-03, ARCH-04, ARCH-05

## .planning/ Boundary

### What stays local
- `.planning/` holds **project-level context only**: PROJECT.md, config.json, REQUIREMENTS.md, conventions, tech stack docs, codebase analysis
- No phase directories, plans, research, summaries, or state tracking files
- `.planning/` is committed to git — shared team context

### What moves to GitHub
- All phase artifacts: context, research, plans, task breakdowns
- All work tracking: progress, status, decisions, blockers
- STATE.md is eliminated — replaced by GitHub-native features (issue blocking/dependencies, milestones, project board)

### Lifecycle
- When a phase completes, any residual local artifacts are **deleted** — GitHub Issue history is the permanent record
- `.planning/` stays lean: only project context that agents need for any phase

## Issue Schema & Mapping

### Phase model
- **Phase = Parent Issue** with sub-issues
- GitHub's sub-issue feature tracks completion
- Allows blocking relationships between phase Issues

### Plan model
- **Plan = Issue comment** on the phase Issue (not separate Issues)
- Plans are posted as structured comments
- Simpler hierarchy: phase Issue > plan comments > task sub-issues

### Task model
- Task sub-issues are created **upfront during planning** — all tasks visible immediately
- Each completed task gets a **completion comment** (commit SHA, files changed)

### Issue body structure
- **Body = high-level summary** — phase goal, requirements, success criteria
- **Comments = detail** — research findings, plan breakdowns, execution logs, reviews
- Body includes a **YAML frontmatter block** for machine-parseable metadata (phase number, requirements, dependencies)

### Labels
- **Minimal labels**: `phase`, `task`, `blocker`
- Labels identify MAXSIM Issues; project board handles workflow state
- No prefix scheme — keep it simple

### Isolation
- **Label-based isolation** — MAXSIM Issues distinguished from user Issues via labels
- MAXSIM also creates a **GitHub Project Board** (see Resumability below) — but labels are the primary identification mechanism

### Agent access
- **CLI tool fetches & formats** GitHub data for agents
- Agents call MAXSIM CLI tool commands, never `gh` directly
- CLI handles parsing, caching, and structured data return

## Resumability & State Model

### Resume behavior
- **Confirm then resume** — on re-run, show completed/remaining tasks, user confirms before continuing
- **Full re-verification** before resuming — rebuild, re-check that completed work still passes

### Phase lifecycle states
- **to-do** → **in-progress** → **in-review** → **done**
- Managed via **GitHub Project Board** columns (created during `/maxsim:init`)
- **Single global board** across all milestones — one board per project

### Interruption detection
- **Issue state is truth** — mix of open/closed sub-issues indicates interrupted execution
- No special markers or execution comments needed for detection

### Review step
- **Automatic agent review** — MAXSIM's review agents handle in-review → done transition
- Spec-compliance + code-quality checks run automatically
- If both pass, task moves to done without user intervention

## gh CLI Integration Model

### API strategy
- **gh for auth, Octokit for data**
- Use `gh auth token` to obtain the GitHub token
- Use **@octokit/rest** SDK for all API interactions (REST API, not GraphQL)
- Octokit provides typed methods, built-in pagination, and retry support

### Token management
- **Cache in memory** — fetch token once per CLI process via `gh auth token`
- Reuse across all GitHub calls within a single command invocation
- No disk persistence of tokens

### Rate limiting
- **Auto-retry with exponential backoff** on 429 responses
- Transparent to the user — command continues after rate limit resets

### Error experience
- **Interactive setup wizard** when `gh` is not installed or not authenticated
- Detect missing gh, guide user through install and `gh auth login`
- Walk through setup step by step, don't just print an error and exit

### Atomicity
- **Best-effort with cleanup** — create Issues sequentially
- If creation fails midway, attempt to clean up already-created Issues
- Not perfect atomicity but handles most failure cases

### Code organization
- **Standalone `github.ts` adapter** in `src/core/` for low-level API operations
- Domain modules (`phase.ts`, `state.ts`) use the adapter for their specific operations
- Two-layer architecture: adapter (API calls) + domain (business logic)

## Deferred Ideas

None captured during this discussion.

---
*Context created: 2026-03-10*
*Discussion areas: .planning/ boundary, Issue schema & mapping, Resumability & state model, gh CLI integration model*
