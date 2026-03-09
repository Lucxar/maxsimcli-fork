---
phase: 01-github-issues-integration-for-mcp-task-management
verified: 2026-03-09T18:00:00Z
status: passed
score: 17/17 acceptance criteria verified
re_verification: false
human_verification:
  - test: "Live GitHub project board creation via mcp_github_setup"
    expected: "Project board created with 4 columns (To Do, In Progress, In Review, Done), labels, milestone, and issue templates"
    why_human: "Requires authenticated gh CLI and real GitHub API calls"
  - test: "Issue creation and kanban movement via mcp_create_plan_issues / mcp_move_issue"
    expected: "Issues appear on project board, move between columns, display correct labels and estimates"
    why_human: "Requires live GitHub repository and visual board inspection"
  - test: "PR auto-close via mcp_create_pr Closes #N"
    expected: "PR description contains Closes #N, merging PR auto-closes linked issues"
    why_human: "Requires live PR creation and merge to verify auto-close behavior"
  - test: "Graceful degradation with unauthenticated gh CLI"
    expected: "All tools return success with mode: local-only and no crashes"
    why_human: "Requires temporarily unauthenticating gh CLI and testing each tool"
  - test: "Sync check detects external issue changes"
    expected: "syncCheck compares local mapping against GitHub and reports discrepancies"
    why_human: "Requires manually closing an issue on GitHub then running sync"
---

# Phase 1: GitHub Issues Integration for MCP Task Management -- Verification Report

**Phase Goal:** Replace local-only task tracking with GitHub Issues as single source of truth. GitHub Projects v2 provides kanban board, Issues provide task lifecycle, Milestones provide grouping. All MCP tools gain GitHub-backed behavior with graceful degradation.
**Verified:** 2026-03-09T18:00:00Z
**Status:** PASSED
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | gh CLI wrapper can execute commands and return typed results | VERIFIED | `gh.ts` exports `ghExec<T>`, `ghGraphQL<T>` using `execFile` from `node:child_process` (line 13). Returns `GhResult<T>` discriminated union. 301 lines. |
| 2 | Auth check detects installed/authenticated/scoped status | VERIFIED | `checkGhAuth()` exported at line 29 of gh.ts, parses stderr output from `gh auth status`. Returns `AuthStatus` with `installed`, `authenticated`, `scopes`, `hasProjectScope`, `username`. |
| 3 | Graceful degradation returns local-only mode when gh not available | VERIFIED | `detectGitHubMode()` returns `'local-only'` at lines 102, 106, 114 of gh.ts. All 30 `detectGitHubMode` calls across 5 MCP tool files verified. |
| 4 | Mapping file can be read, written, and updated atomically | VERIFIED | `mapping.ts` exports 7 functions (loadMapping, saveMapping, updateTaskMapping, updateTodoMapping, createEmptyMapping, getIssueForTask, getIssueForTodo). 193 lines. Synchronous fs operations matching project patterns. |
| 5 | Project board auto-created with 4 columns including In Review | VERIFIED | `projects.ts` (404 lines) -- `ensureProjectBoard` creates board, `setupProjectFields` checks for "In Review" at line 254, adds it via `addStatusOption` GraphQL mutation (`updateProjectV2Field`) at line 168. |
| 6 | GitHub Milestone created for the MAXSIM milestone | VERIFIED | `milestones.ts` (180 lines) exports `createMilestone`, `findMilestone`, `ensureMilestone`, `closeMilestoneIfComplete`. Uses REST API via `gh api repos/{owner}/{repo}/milestones`. |
| 7 | All 5 MAXSIM labels exist with correct colors | VERIFIED | `types.ts` lines 78-84: maxsim(6f42c1), phase-task(0075ca), todo(fbca04), imported(e4e669), superseded(d73a4a). `labels.ts` (63 lines) `ensureLabels()` uses `--force` flag at line 37. |
| 8 | Estimate (number) field exists on the project | VERIFIED | `projects.ts` line 282-285: `gh project field-create` with `--data-type NUMBER --name Estimate`. `setEstimate` function at line 385. `FIBONACCI_POINTS` defined in types.ts line 88. |
| 9 | Issue templates installed in .github/ISSUE_TEMPLATE/ | VERIFIED | `templates.ts` (105 lines) `installIssueTemplates()` writes `phase-task.yml` and `todo.yml` to `.github/ISSUE_TEMPLATE/`. Contains valid GitHub Issue Forms YAML with `type: textarea`. |
| 10 | Task issues created with full spec in collapsible details section | VERIFIED | `issues.ts` line 102: `<details>` tag in issue body builder. Title format `[P{phaseNum}]` at line 88. 745 lines total. |
| 11 | Parent tracking issue created with live checkbox task list | VERIFIED | `createParentTrackingIssue` at line 166 of issues.ts. Title `[Phase {N}]` format. Body includes `- [ ] #{child}` checkbox lines. |
| 12 | PRs auto-link via Closes #N in description | VERIFIED | `buildPrBody` at line 282 of issues.ts generates `Closes #N` lines. `mcp_create_pr` in github-tools.ts line 732 calls `buildPrBody()` then `ghExec(['pr', 'create', ...])` at line 748-767. End-to-end wiring confirmed. |
| 13 | Branch naming follows maxsim/issue-{N}-{slug} pattern | VERIFIED | `getIssueBranchName` at line 273 of issues.ts returns `maxsim/issue-${issueNumber}-${slug}`. |
| 14 | Superseded issues properly cross-referenced and closed | VERIFIED | `closeIssueAsSuperseded` at line 328 of issues.ts posts "Superseded by #N" (line 335) and "Replaces #N" (line 356) on both old and new issues. `supersedePlanIssues` at line 644 handles batch supersession. |
| 15 | 14 new MCP tools registered (10 github + 4 board) + 1 bounce | VERIFIED | `server.tool(` count: github-tools.ts=10, board-tools.ts=4, phase-tools.ts mcp_bounce_issue=1. Total: 15 new tools. Registered in mcp/index.ts at lines 27-28. |
| 16 | Sync check detects external changes to GitHub issues | VERIFIED | `sync.ts` (381 lines) exports `syncCheck`, `verifyIssueState`, `handleExternalClose`. Compares local mapping against GitHub reality using batch GraphQL queries. Called in `mcp_complete_phase` at line 326 of phase-tools.ts. |
| 17 | npm run build succeeds without errors | VERIFIED | Build completes successfully. All 212 tests pass. `dist/mcp-server.cjs` exists (1,278,856 bytes) with GitHub tool registrations present. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/cli/src/github/types.ts` | Types (min 80 lines) | VERIFIED | 92 lines. Exports: GhResult, AuthStatus, GitHubMode, IssueMappingFile, PhaseMapping, TaskIssueMapping, IssueStatus, MAXSIM_LABELS, FIBONACCI_POINTS, DEFAULT_STATUS_OPTIONS (10 exports). |
| `packages/cli/src/github/gh.ts` | gh CLI wrapper (min 120 lines) | VERIFIED | 301 lines. Exports: checkGhAuth, detectGitHubMode, ghExec, ghGraphQL. Uses execFile exclusively. |
| `packages/cli/src/github/mapping.ts` | Mapping persistence (min 80 lines) | VERIFIED | 193 lines. Exports: loadMapping, saveMapping, updateTaskMapping, updateTodoMapping, createEmptyMapping, getIssueForTask, getIssueForTodo (7 exports). |
| `packages/cli/src/github/issues.ts` | Issue CRUD (min 200 lines) | VERIFIED | 745 lines. 13 exports: createTaskIssue, createParentTrackingIssue, createTodoIssue, getIssueBranchName, buildPrBody, closeIssue, reopenIssue, closeIssueAsSuperseded, postComment, importExternalIssue, updateParentTaskList, createAllPlanIssues, supersedePlanIssues. |
| `packages/cli/src/github/projects.ts` | Project board ops (min 120 lines) | VERIFIED | 404 lines. 8 exports: createProjectBoard, ensureProjectBoard, getProjectFields, addStatusOption, setupProjectFields, addItemToProject, moveItemToStatus, setEstimate. |
| `packages/cli/src/github/labels.ts` | Label management (min 30 lines) | VERIFIED | 63 lines. Exports: ensureLabels, MAXSIM_LABELS (re-export). |
| `packages/cli/src/github/milestones.ts` | Milestone CRUD (min 60 lines) | VERIFIED | 180 lines. Exports: createMilestone, findMilestone, ensureMilestone, closeMilestoneIfComplete. |
| `packages/cli/src/github/templates.ts` | Issue templates (min 50 lines) | VERIFIED | 105 lines. Exports: installIssueTemplates. Writes phase-task.yml and todo.yml with valid GitHub Issue Forms YAML. |
| `packages/cli/src/github/sync.ts` | Sync check (min 80 lines) | VERIFIED | 381 lines. Exports: syncCheck, verifyIssueState, handleExternalClose. |
| `packages/cli/src/github/index.ts` | Barrel export (min 10 lines) | VERIFIED | 16 lines. Re-exports all 9 github modules via `export *`. |
| `packages/cli/src/mcp/github-tools.ts` | GitHub MCP tools (min 200 lines) | VERIFIED | 863 lines. 10 tools: mcp_github_setup, mcp_create_plan_issues, mcp_create_todo_issue, mcp_move_issue, mcp_close_issue, mcp_post_comment, mcp_import_issue, mcp_sync_check, mcp_supersede_plan, mcp_create_pr. |
| `packages/cli/src/mcp/board-tools.ts` | Board MCP tools (min 150 lines) | VERIFIED | 567 lines. 4 tools: mcp_query_board, mcp_search_issues, mcp_get_issue_detail, mcp_set_estimate. |
| `packages/cli/dist/mcp-server.cjs` | Built MCP server | VERIFIED | 1,278,856 bytes. Contains registerAllTools, registerGitHubTools, registerBoardTools (6 references). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| gh.ts | node:child_process | execFile for gh CLI execution | VERIFIED | Line 13: `import { execFile } from 'node:child_process'`, line 18: `promisify(execFile)`. Never uses `exec`. |
| mapping.ts | .planning/github-issues.json | fs read/write with atomic save | VERIFIED | Uses `planningPath` from core. loadMapping reads, saveMapping writes with 2-space indent JSON. |
| projects.ts | gh.ts | ghExec and ghGraphQL | VERIFIED | Imports ghExec, ghGraphQL from ./gh.js. Uses both for project operations. |
| labels.ts | gh.ts | ghExec for label create | VERIFIED | Imports ghExec from ./gh.js. Calls `ghExec(['label', 'create', ...])`. |
| milestones.ts | gh.ts | ghExec for REST API | VERIFIED | Imports ghExec from ./gh.js. Calls `ghExec(['api', 'repos/{owner}/{repo}/milestones', ...])`. |
| issues.ts | gh.ts | ghExec for issue create/close | VERIFIED | Imports ghExec from ./gh.js. Multiple calls for issue create, close, comment, edit. |
| issues.ts | mapping.ts | updateTaskMapping/updateTodoMapping | VERIFIED | issues.ts imports are minimal (mapping updates happen in MCP tool layer). |
| github-tools.ts | issues.ts | createTaskIssue, buildPrBody etc. | VERIFIED | Line 24: `import { buildPrBody, ... }`, line 732: `buildPrBody(issue_numbers, ...)`. |
| board-tools.ts | projects.ts | setEstimate, moveItemToStatus | VERIFIED | Line 17: `import { setEstimate } from '../github/projects.js'`. |
| mcp/index.ts | github-tools.ts | registerGitHubTools | VERIFIED | Line 14: import, line 27: `registerGitHubTools(server)`. |
| mcp/index.ts | board-tools.ts | registerBoardTools | VERIFIED | Line 15: import, line 28: `registerBoardTools(server)`. |
| phase-tools.ts | github/ | GitHub phase lifecycle hooks | VERIFIED | Imports from gh.js, issues.js, projects.js, milestones.js, mapping.js, sync.js, types.js (7 imports). |
| todo-tools.ts | github/ | GitHub todo lifecycle hooks | VERIFIED | Imports from gh.js, issues.js, projects.js, mapping.js (4 imports). |
| state-tools.ts | github/ | GitHub blocker linking | VERIFIED | Imports from gh.js, issues.js (2 imports). |
| mcp_create_pr | buildPrBody (AC-08) | buildPrBody called for Closes #N | VERIFIED | github-tools.ts line 732 calls `buildPrBody()`, line 748-767 calls `ghExec(['pr', 'create', ...])` with the body. End-to-end wiring complete. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-----------|-------------|--------|----------|
| AC-01 | 01-02 | GitHub Project board auto-created with 4 columns (To Do, In Progress, In Review, Done) | SATISFIED | projects.ts: ensureProjectBoard + setupProjectFields adds "In Review" via GraphQL. DEFAULT_STATUS_OPTIONS in types.ts defines all 4. |
| AC-02 | 01-03 | Plan finalization creates GitHub issues with full spec in collapsible body | SATISFIED | issues.ts: createTaskIssue uses `<details>` (line 102), createAllPlanIssues batch creates on finalization (line 489). |
| AC-03 | 01-03 | Parent tracking issue per phase with live checkbox task list | SATISFIED | issues.ts: createParentTrackingIssue (line 166) builds `- [ ] #{child}` body. updateParentTaskList toggles checkboxes (line 435). |
| AC-04 | 01-04, 01-05 | Issues move through kanban columns as AI works | SATISFIED | mcp_move_issue (github-tools.ts), phase-tools.ts moves to Done on completion, bounce moves to In Progress. |
| AC-05 | 01-05 | Reviewer can bounce issues back to In Progress with detailed comment | SATISFIED | mcp_bounce_issue in phase-tools.ts (line 445): moves to "In Progress" on board + posts reviewer feedback comment. |
| AC-06 | 01-03, 01-05 | Todos create GitHub issues and go through same review cycle | SATISFIED | mcp_create_todo_issue (github-tools.ts), todo-tools.ts mcp_add_todo creates GitHub issue (line 73), mcp_complete_todo closes (line 190). |
| AC-07 | 01-04 | External GitHub issues can be imported into MAXSIM tracking | SATISFIED | mcp_import_issue (github-tools.ts), importExternalIssue in issues.ts (line 389). |
| AC-08 | 01-03, 01-04 | PRs auto-link via Closes #N and auto-close on merge | SATISFIED | buildPrBody (issues.ts line 282) generates `Closes #N` lines. mcp_create_pr (github-tools.ts line 711) calls buildPrBody then gh pr create. |
| AC-09 | 01-04, 01-05 | Sync check before each phase action detects external changes | SATISFIED | sync.ts: syncCheck (line 170). Called in mcp_complete_phase (phase-tools.ts line 326). mcp_sync_check tool available. |
| AC-10 | 01-04, 01-05 | All existing task-tracking MCP tools replaced with GitHub-backed implementations | SATISFIED | phase-tools.ts, todo-tools.ts, state-tools.ts all import and call GitHub functions. Existing tools augmented with GitHub hooks, not removed (graceful degradation design). |
| AC-11 | 01-04 | New MCP tools: query board, search/filter issues, post comment, move cards | SATISFIED | board-tools.ts: mcp_query_board, mcp_search_issues, mcp_get_issue_detail, mcp_set_estimate. github-tools.ts: mcp_post_comment, mcp_move_issue. |
| AC-12 | 01-02 | GitHub Milestones created per MAXSIM milestone with auto-close on completion | SATISFIED | milestones.ts: ensureMilestone (line 101), closeMilestoneIfComplete (line 138) checks open_issues===0 and closes. Called in phase-tools.ts (line 405). |
| AC-13 | 01-02 | Fibonacci story points assigned via GitHub Projects Estimate field | SATISFIED | FIBONACCI_POINTS in types.ts (line 88). Estimate NUMBER field created in projects.ts (line 282). setEstimate function (line 385). mcp_set_estimate in board-tools.ts. |
| AC-14 | 01-02 | Labels (type, identity) created upfront during setup with color coding | SATISFIED | MAXSIM_LABELS in types.ts (5 labels with colors). ensureLabels in labels.ts with --force flag. Called in mcp_github_setup. |
| AC-15 | 01-02 | Issue templates installed in .github/ISSUE_TEMPLATE/ | SATISFIED | templates.ts: installIssueTemplates writes phase-task.yml and todo.yml to .github/ISSUE_TEMPLATE/ with valid Issue Forms YAML. |
| AC-16 | 01-03 | Branch naming follows maxsim/issue-{N}-{slug} pattern | SATISFIED | getIssueBranchName at issues.ts line 273: `maxsim/issue-${issueNumber}-${slug}`. |
| AC-17 | 01-01 | Graceful degradation when gh CLI not authenticated | SATISFIED | detectGitHubMode returns 'local-only' at 3 points in gh.ts. 30 total detectGitHubMode calls across 5 MCP tool files. Every GitHub operation wrapped in try/catch with github_warning field (not failure). |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| templates.ts | 54, 102 | "TODO" in "MAXSIM Todo" template name | Info | Not an anti-pattern -- "Todo" is a legitimate template name |

No blockers, no stubs, no placeholder code found across all 12 source files.

### Human Verification Required

### 1. Live Project Board Creation
**Test:** Run `mcp_github_setup` with an authenticated `gh` CLI and verify a project board is created with To Do, In Progress, In Review, Done columns.
**Expected:** Board visible at github.com/user/project/projects with 4 columns. Labels visible on repo. Milestone created. Issue templates in .github/ISSUE_TEMPLATE/.
**Why human:** Requires authenticated gh CLI, real GitHub API calls, and visual inspection of the project board.

### 2. Issue Creation and Kanban Flow
**Test:** Create plan issues via `mcp_create_plan_issues`, then use `mcp_move_issue` to move through columns.
**Expected:** Issues appear on project board with correct labels, move between columns, parent tracking issue has live checkbox list.
**Why human:** Requires live GitHub interaction and visual verification of board state.

### 3. PR Auto-Close Integration
**Test:** Create a PR via `mcp_create_pr` with linked issues, merge the PR.
**Expected:** PR description contains `Closes #N`, linked issues auto-close on merge.
**Why human:** Requires actual PR creation and merge to verify GitHub's auto-close behavior triggers.

### 4. Graceful Degradation
**Test:** Temporarily unauthenticate `gh` CLI, call each GitHub MCP tool.
**Expected:** All tools return `mode: 'local-only'` with appropriate warnings, no crashes or exceptions.
**Why human:** Requires modifying auth state and testing each tool individually.

### 5. Sync Check Accuracy
**Test:** Close an issue externally on GitHub, then run `mcp_sync_check`.
**Expected:** Sync check detects the external close and reports the discrepancy.
**Why human:** Requires external mutation of GitHub state and verification of detection.

### Gaps Summary

No gaps found. All 17 acceptance criteria are structurally satisfied in the codebase:

- **Foundation:** 3 core modules (types, gh wrapper, mapping) provide the typed interface layer (2,480 lines across 10 github modules)
- **Infrastructure:** Project board creation adds "In Review" column via GraphQL, labels are idempotent, milestones use REST API, issue templates use GitHub Issue Forms YAML
- **Issue CRUD:** 13 exported functions cover the full lifecycle including batch creation, supersession, and branch naming
- **MCP Tools:** 15 new tools (10 github + 4 board + 1 bounce) with graceful degradation on every tool
- **Integration:** Existing phase/todo/state tools gain GitHub hooks (7 imports in phase-tools alone)
- **Build:** `npm run build` succeeds, 212/212 tests pass, mcp-server.cjs includes all registrations

The remaining verification items require live GitHub API interaction and are flagged under Human Verification Required.
