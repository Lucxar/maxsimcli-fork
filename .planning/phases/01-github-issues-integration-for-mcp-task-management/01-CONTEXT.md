# Phase 1: GitHub Issues Integration for MCP Task Management - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Build GitHub Issues + Projects v2 integration into MAXSIM's MCP tool layer. Replace existing task-tracking MCP tools with GitHub-backed implementations. GitHub becomes the single source of truth for task status, progress, and lifecycle. Local spec files (PLAN.md, CONTEXT.md) continue to exist for AI agent consumption, but tracking (status, assignments, progress) moves entirely to GitHub.

This phase includes: MCP tool replacement, project board creation, issue CRUD, lifecycle management, sync/verification, and setup flow updates.

</domain>

<decisions>
## Implementation Decisions

### Issue-Task Mapping
- Plan tasks AND todos create GitHub Issues (every artifact gets an issue)
- Fresh issues created per plan — old plan's issues closed with 'superseded' label (closed as completed, not 'not planned')
- Eager creation: all issues created at once when plan is finalized (/maxsim:plan-phase completes)
- Phase = parent tracking issue with live task list (checkbox links to child issues: `- [ ] #42`)
- External GitHub issues can be imported into MAXSIM — AI decides placement (todo vs phase task)
- Issue-numbered branch naming: `maxsim/issue-{N}-{slug}`
- Mapping file (`.planning/github-issues.json`) committed to git for persistence
- Auto-link PRs via `Closes #N` in PR description — auto-closes issue on merge
- All parallel wave tasks move to In Progress simultaneously

### GitHub Project Board
- One GitHub Project board per repo (not per milestone)
- Auto-created by MAXSIM during setup (no manual configuration needed)
- 4 standard columns: To Do, In Progress, In Review, Done
- GitHub Milestones used for grouping (one per MAXSIM milestone, e.g., v5.1)
- Issues assigned to both the Project board and their respective Milestone
- Blockers handled via GitHub's native "is blocked by" issue linking (no separate column)
- Fibonacci story points using GitHub Projects v2 built-in Estimate field: 1, 2, 3, 5, 8, 13, 21, 34
- AI estimates story points based on task complexity

### Issue Lifecycle
- Issues created on plan finalization (not earlier, not later)
- Lifecycle: To Do → In Progress → In Review → Done
- In Progress: executor agent working on task, PR created
- In Review: executor finished, reviewer agent checking; if issues found → back to In Progress (bounce loop)
- Done: reviewer approves, PR merged, issue closed
- Parent tracking issue follows same lifecycle as child issues
- Same review cycle for todos (no shortcuts for any issue type)
- Milestones auto-close when all their issues are closed
- Sync check runs before each phase action — detects external changes
- External issue closes: MAXSIM detects, verifies against code, reopens if not actually implemented
- Cross-references between replanned issues: new issues link "Replaces #42", old issues link "Superseded by #55"
- Detailed progress comments posted on issues during AI work (implementation progress, test status, etc.)

### Issue Content & Labels
- Full plan task spec in issue body using collapsible `<details>` sections (summary at top, full spec collapsed)
- Issue title format: `[P{N}] Task name` (e.g., `[P1] Implement auth middleware`)
- Metadata in issue body: phase + plan reference, explicit dependency links (Depends on: #41, #43)
- MAXSIM issues identified by `maxsim` label + type labels: `phase-task`, `todo`, `imported`, `superseded`
- Labels color-coded by category (type labels, status labels, MAXSIM identity label each have distinct colors)
- All labels created upfront during project setup (/maxsim:new-project or init-existing)
- GitHub Issue Templates installed in `.github/ISSUE_TEMPLATE/` for phase-task, todo, etc.
- Lighter issue template for todos (title + brief description + acceptance criteria only)

### Authentication & Setup
- GitHub `gh` CLI authentication: mandatory but skippable during MAXSIM setup
- If skipped: warning shown, GitHub features degrade gracefully (local-only mode)
- Setup creates: Project board, labels, issue templates, Milestone for current milestone

### MCP Tool Surface
- Full replacement of existing task-tracking MCP tools with GitHub-backed versions
- Tools being replaced: phase (add/complete/list), todo (add/complete/list), blocker (add/resolve), state/context
- New tools added: query project board, search/filter issues, post comment on issue, move issue between columns
- Detailed GitHub error messages passed through to AI (rate limits, auth errors, 404s — AI can react intelligently)

### Claude's Discretion
- API layer choice: REST API, GraphQL API, or `gh` CLI — pick what's best per operation (Projects v2 likely needs GraphQL)
- Label color scheme: specific colors per category
- Rate limiting strategy for progress comments
- Issue body markdown formatting details
- How to handle photos/images in issues (if applicable)

</decisions>

<specifics>
## Specific Ideas

- Project board should feel like a standard GitHub Projects kanban — developers familiar with GitHub should feel at home
- The AI should treat GitHub Issues as the primary interface for task tracking — check GitHub for "what's next?" instead of local files
- When the reviewer bounces a task back to In Progress, a detailed comment explaining what failed should be posted on the issue
- GitHub's native features should be leveraged wherever possible: "blocked by" linking, Estimate field, milestone progress, task lists in parent issues

</specifics>

<deferred>
## Deferred Ideas

- Command simplification: remove manual commands like /maxsim:complete-milestone, /maxsim:complete-todo — AI handles lifecycle automatically via GitHub. Separate phase.
- Full removal of local .planning/ tracking files once GitHub is proven as single source of truth. Separate evaluation.

</deferred>

---

*Phase: 01-github-issues-integration-for-mcp-task-management*
*Context gathered: 2026-03-09*
