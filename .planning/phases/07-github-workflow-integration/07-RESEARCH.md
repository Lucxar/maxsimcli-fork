# Phase 07: GitHub Workflow Integration — Research

**Researched:** 2026-03-11
**Domain:** Workflow wiring, GitHub API patterns, MCP tool gaps
**Confidence:** HIGH (6 parallel research agents, exhaustive codebase analysis + API verification)

---

## Standard Stack

Use the existing GitHub adapter layer exclusively. No new libraries needed.

| Component | Use | Already Built |
|-----------|-----|---------------|
| `@octokit/rest` + throttling + retry plugins | All GitHub REST API calls | YES — `packages/cli/src/github/client.ts` |
| `gh` CLI | Project board creation (no REST endpoint) | YES — bridged in `projects.ts` |
| MCP server (`mcp-server.cjs`) | Tool auto-discovery for Claude Code | YES — `src/mcp-server.ts` |
| `github-issues.json` mapping cache | Issue number lookups (not state) | YES — `src/github/mapping.ts` |

**Do not introduce:** GraphQL (Octokit REST is sufficient for all Phase 7 operations), any new npm dependencies, or any polling/webhook infrastructure.

## Architecture Patterns

### Pattern 1: GitHub-First Write Order (WIRE-01)

All artifact writes follow this sequence:
1. Build content in memory (markdown string)
2. POST to GitHub (issue body or comment via `mcp_post_plan_comment` / `mcp_post_comment`)
3. If GitHub succeeds → operation succeeds (update local mapping cache if needed)
4. If GitHub fails → operation aborts, no partial state

### Pattern 2: Workflow Markdown Modifications (Not TypeScript)

Phase 7 changes are primarily **workflow markdown rewrites** — the TypeScript adapter layer is already built. The modification targets are:

| Workflow File | Lines | Change Scope |
|---------------|-------|--------------|
| `templates/workflows/new-project.md` | ~1100 | Add mandatory `mcp_github_setup` + phase issue creation after roadmap |
| `templates/workflows/init-existing.md` | ~1100 | Same as new-project |
| `templates/workflows/plan.md` | 232 | Switch stage detection to GitHub queries |
| `templates/workflows/plan-create.md` | 299 | Post plans as GitHub comments, create task sub-issues |
| `templates/workflows/execute.md` | 422 | Read plan inventory from GitHub, per-task board transitions |
| `templates/workflows/execute-plan.md` | 963 | Read plan from GitHub comment, write summary as comment, per-task status updates |
| `templates/workflows/progress.md` | 394 | Switch primary reads to live GitHub queries |

**Two workflow layers exist:** Newer thin orchestrators (`plan.md`, `execute.md`) delegate to sub-workflows. Older detailed workflows (`plan-phase.md`, `execute-phase.md`) also exist. Both need updating or the older layer needs deprecation.

### Pattern 3: Agent Tool Injection (Not Agent Modification)

Agents (executor, planner, researcher, verifier) are generic. MCP tools are injected at spawn time by the orchestrator workflow via the `allowed-tools` list. This matches the existing architecture from `AGENTS.md`: "Orchestrator can add tools beyond agent's base set at spawn time."

**Do not** add MCP tools to agent `tools:` frontmatter directly.

### Pattern 4: Board Lifecycle State Machine (WIRE-08/WIRE-09)

```
Phase Issues:
  To Do → In Progress → In Review → Done
  (created)  (plan done)   (PR created)  (PR merged + verified)

Task Sub-Issues:
  To Do → In Progress → Done
  (created)  (executor starts)  (task passes review)
  Done → In Progress (review fails, sub-issue reopened)
```

### Pattern 5: Close-As-Not-Planned Rollback (WIRE-07)

GitHub REST API does **NOT support issue deletion** (GraphQL requires admin perms most users won't have). The rollback pattern is:
1. Close issue with `state_reason: 'not_planned'`
2. Post a `[MAXSIM-ROLLBACK]` comment explaining why
3. Track created resources in an array; on failure, iterate in reverse to clean up
4. Rollback failures are non-fatal — log and continue

### Pattern 6: External Edit Detection via Body Hash (WIRE-06)

Store SHA-256 hash of issue body in `github-issues.json` after each write. On read, hash the live body and compare. If different and MAXSIM didn't make the change, warn the user.

- `updated_at` field has false positives (label changes, milestone changes trigger it)
- ETags are good for polling efficiency but don't identify what changed
- Body hash is precise for body-only change detection with zero false positives

## Don't Hand-Roll

| Problem | Use Instead |
|---------|-------------|
| Rate limiting / retry | Octokit's `@octokit/plugin-throttling` + `@octokit/plugin-retry` (already in `client.ts`) |
| Issue creation batching | Sequential REST calls — GitHub has no batch API; ~80 creates/min is more than sufficient for MAXSIM's scale (5-15 issues per plan) |
| Board column moves | Existing `moveItemToStatus()` in `projects.ts` — single-item sequential calls |
| Sub-issue linking | GitHub native sub-issues API via `issues.addSubIssue()` (already in `issues.ts`) |
| Structured data in comments | Fenced code blocks (```yaml) + HTML comments for invisible metadata (`<!-- maxsim:metadata {...} -->`) |

## Common Pitfalls

### Pitfall 1: Missing Board Transitions

`mcp_complete_phase` closes GitHub issues but does NOT call `moveItemToStatus()` to move board items to "Done". Similarly, `mcp_bounce_issue` updates local mapping but doesn't move the board item. **Every state change must update both issue state AND board column.**

### Pitfall 2: `mcp_create_phase_issue` Doesn't Add to Board

Creating a phase issue does NOT automatically add it to the project board. Must call `mcp_add_to_board` + `mcp_move_issue` separately after creation.

### Pitfall 3: `mcp_create_task_issue` Doesn't Update Mapping

After creating a task sub-issue, `github-issues.json` is not updated. Callers must manually call `updateTaskMapping()`.

### Pitfall 4: `mcp_close_issue` Hardcodes `state_reason: 'completed'`

For rollback scenarios, need `state_reason: 'not_planned'`. The tool needs a parameter to control this.

### Pitfall 5: `mcp_get_issue` Missing Fields

Does NOT return `updated_at`, `labels`, or `comments` — all needed for external edit detection (WIRE-06). Tool needs enhancement.

### Pitfall 6: Two Workflow Layers

Both `plan-phase.md` (485 lines) and `plan.md` (232 lines) + `plan-create.md` (299 lines) exist. Similarly `execute-phase.md` (716 lines) and `execute.md` (422 lines) + `execute-plan.md` (963 lines). Must update the active layer (the thin orchestrators) and deprecate or remove the older detailed workflows.

### Pitfall 7: Comment Size Limits

GitHub issue/comment bodies max at 65,536 characters (64 KB). Typical MAXSIM plans are 5-10K characters, well under the limit. No splitting strategy needed.

### Pitfall 8: N+1 API Calls in `mcp_get_all_progress`

Currently makes one API call per phase to get sub-issues. With 10 phases, that's 11 calls. Acceptable but worth noting for latency.

## Code Examples

### Posting Plan Content as GitHub Comment

```typescript
// Already exists: mcp_post_plan_comment
// Usage in workflow: call MCP tool with phase issue number + plan markdown content
const result = await postPlanComment(octokit, repo, phaseIssueNumber, planNumber, planMarkdown);
```

### Rollback Pattern for Partial Failure

```typescript
interface BatchResult {
  succeeded: { issueNumber: number; title: string }[];
  failed: { title: string; error: string }[];
  rolledBack: { issueNumber: number; success: boolean }[];
}

// Track as you go, rollback on failure
const created: number[] = [];
for (const task of tasks) {
  const result = await createTaskSubIssue(octokit, repo, task);
  if (!result.ok) {
    // Rollback all created issues
    for (const issueNum of created.reverse()) {
      await closeIssue(octokit, repo, issueNum, 'not_planned', '[MAXSIM-ROLLBACK]');
    }
    return { succeeded: [], failed: [task], rolledBack: created };
  }
  created.push(result.data.number);
}
```

### External Edit Detection

```typescript
import { createHash } from 'crypto';

function hashBody(body: string): string {
  return createHash('sha256').update(body).digest('hex');
}

// After writing:
mapping.phases[phaseNum].bodyHash = hashBody(newBody);
await saveMapping(mapping);

// On read:
const live = await getPhaseIssue(octokit, repo, issueNumber);
const liveHash = hashBody(live.body);
if (liveHash !== mapping.phases[phaseNum].bodyHash) {
  warn('Phase issue was modified outside MAXSIM');
}
```

### Board Transition After Plan Completion

```typescript
// In workflow: after planner completes
await moveItemToStatus(octokit, projectNumber, phaseItemId, 'In Progress');
// After all task sub-issues created
for (const task of taskIssues) {
  await addItemToProject(octokit, projectNumber, task.number);
  await moveItemToStatus(octokit, projectNumber, task.itemId, 'To Do');
}
```

## Existing MCP Tool Inventory (35 tools)

### Sufficient for Phase 7 (no changes needed)

| Tool | Purpose |
|------|---------|
| `mcp_github_setup` | Create board, labels, milestone |
| `mcp_create_phase_issue` | Create phase issue with YAML frontmatter |
| `mcp_create_task_issue` | Create task sub-issue linked to parent |
| `mcp_post_plan_comment` | Post plan content as issue comment |
| `mcp_post_completion` | Post completion comment (commit SHA, files) |
| `mcp_reopen_issue` | Reopen closed issue |
| `mcp_move_issue` | Move issue to board column |
| `mcp_query_board` | Query board items by status/phase |
| `mcp_add_to_board` | Add issue to project board |
| `mcp_search_issues` | Search issues by label/state/text |
| `mcp_get_phase_progress` | Count open/closed sub-issues |
| `mcp_get_all_progress` | Progress overview for all phases |
| `mcp_detect_interrupted` | Detect interrupted phase |
| `mcp_list_sub_issues` | List sub-issues of a phase |

### Need Enhancement

| Tool | Enhancement Needed |
|------|-------------------|
| `mcp_close_issue` | Add `state_reason` parameter (support `'not_planned'` for rollback) |
| `mcp_get_issue` | Return `updated_at`, `labels`, `comments_url` for edit detection |
| `mcp_list_sub_issues` | Add `updated_at` to response items |
| `mcp_complete_phase` | Add board transition (`moveItemToStatus → Done`) |
| `mcp_bounce_issue` | Add board transition (`moveItemToStatus → In Progress`) |
| `mcp_create_phase_issue` | Auto-add to board + set initial status |
| `mcp_create_task_issue` | Auto-update mapping cache |

### New Tools Needed

| Tool | Purpose | WIRE Decision |
|------|---------|---------------|
| `mcp_post_comment` | Generic comment posting (research, context, summary, verification) | WIRE-02 |
| `mcp_batch_create_tasks` | Create multiple task sub-issues with rollback | WIRE-07 |
| `mcp_detect_external_edits` | Compare body hashes to detect external modifications | WIRE-06 |
| `mcp_create_pr` | Create PR from worktree branch (triggers "In Review") | WIRE-08 |
| `mcp_sync_check` | Verify local mapping is in sync with GitHub state | WIRE-05 |

## Init Context Modifications Needed

All 21 init functions read exclusively from local `.planning/` files — none query GitHub. For Phase 7:

| Init Function | Change Needed |
|---------------|---------------|
| `init new-project` | Add GitHub remote detection, `gh` auth check, return `github_ready` flag |
| `init init-existing` | Same as new-project |
| `init execute-phase` | Return GitHub issue numbers, project board number from mapping |
| `init plan-phase` | Return phase issue number from mapping |
| `init progress` | Return mapping data for live GitHub queries |
| All agent inits | Include `project_number` and phase issue number for MCP tool calls |

## Agent Impact Assessment

| Agent | Impact | Changes |
|-------|--------|---------|
| Executor | MEDIUM | Input switches from local PLAN.md to GitHub comment; output switches from local SUMMARY.md to GitHub comment; per-task board status updates |
| Planner | HIGH | Input CONTEXT.md/RESEARCH.md from GitHub; output PLAN.md to GitHub comment; create task sub-issues; board transition to "In Progress" |
| Researcher | LOW | Orchestrator-mediated; no direct artifact I/O changes |
| Verifier | MEDIUM | Output VERIFICATION.md to GitHub comment; gate audit trail as comments; PASS triggers "In Review" → "Done" |

## Delivery Pipeline Impact

| What to add | Where | Auto-delivery? |
|-------------|-------|----------------|
| New MCP tools | `src/mcp/*.ts` | YES — bundled into `mcp-server.cjs`, auto-discovered via `.mcp.json` |
| Enhanced MCP tools | `src/mcp/*.ts` + `src/github/*.ts` | YES — same bundle |
| Modified workflows | `templates/workflows/*.md` | YES — copied by `copy-assets.cjs` to tarball, installed to `.claude/maxsim/workflows/` |
| Modified commands | `templates/commands/maxsim/*.md` | YES — installed to `.claude/commands/maxsim/` |
| New skill (github-artifact-protocol) | `templates/skills/` | YES — add to `builtInSkills` in `src/install/shared.ts` |
| Orphan cleanup for old workflows | `src/install/hooks.ts` | Add deprecated workflow names to orphan list |

## Context Decision Updates Recommended

Based on research findings, three context decisions should be refined:

1. **WIRE-07 step 1** says "attempt to delete partially-created issues." Change to "close with `state_reason: 'not_planned'` + rollback comment" as the primary strategy (GitHub REST has no delete endpoint; GraphQL delete requires admin perms).

2. **WIRE-06** should specify body hash as the detection mechanism (not `updated_at`, which has false positives from label/milestone changes).

3. **Out of scope note** about "Story point estimation via GitHub (Projects v2 REST API gap)" — the September 2025 REST API for Projects v2 supports field value updates including number fields. This could be pulled into scope if desired.

---

*Research completed: 2026-03-11*
*Sources: 6 parallel research agents (workflow structure, MCP tools, CLI router, agent prompts, install pipeline, GitHub API patterns)*
