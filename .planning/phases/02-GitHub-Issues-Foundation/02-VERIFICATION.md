---
phase: 02-GitHub-Issues-Foundation
verified: 2026-03-10T12:00:00Z
status: passed
score: 16/16 must-haves verified
gaps: []
human_verification:
  - test: "Running /maxsim:init creates GitHub Issues for phases and configures the repo"
    expected: "Phase Issues appear on GitHub with correct labels, frontmatter bodies, and sub-issue links"
    why_human: "Requires live GitHub API access and a real repository to verify Issue creation end-to-end"
  - test: "Running any MAXSIM command without gh authenticated fails immediately with a clear error message"
    expected: "AuthError with helpful setup instructions (install gh, run gh auth login)"
    why_human: "Requires testing in an environment where gh is not authenticated"
  - test: "A command interrupted mid-execution can be re-run and resumes from GitHub Issue state"
    expected: "detectInterruptedPhase identifies completed vs remaining tasks from GitHub sub-issue state"
    why_human: "Requires creating real issues, closing some, then verifying detection works end-to-end"
  - test: "Installation writes all files to .claude/ inside the project directory"
    expected: "npx maxsimcli installs to CWD/.claude/ -- no files in ~/.claude/"
    why_human: "Requires running actual npx install in a clean project to verify file locations"
---

# Phase 2: GitHub Issues Foundation Verification Report

**Phase Goal:** All work tracking (phases, tasks, progress) flows through GitHub Issues, not local markdown files
**Verified:** 2026-03-10
**Status:** PASSED
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | getOctokit() returns a configured Octokit instance with throttling and retry plugins | VERIFIED | `client.ts` lines 27-174: ThrottledOctokit = Octokit.plugin(throttling, retry), singleton pattern with `_instance` caching, retry twice on primary rate limits, once on secondary |
| 2 | requireAuth() throws AuthError with clear message when gh is not installed or not authenticated | VERIFIED | `client.ts` lines 43-107: Three checks (gh --version, gh auth token, gh auth status), throws AuthError with codes NOT_INSTALLED, NOT_AUTHENTICATED, SCOPE_MISSING |
| 3 | getRepoInfo() correctly parses owner/repo from git remote URL | VERIFIED | `client.ts` lines 183-208: Supports HTTPS (github.com/owner/repo) and SSH (git@github.com:owner/repo) patterns, caches result |
| 4 | npm run build succeeds with @octokit packages inlined into CJS bundles | VERIFIED | `package.json` has @octokit/rest, @octokit/plugin-throttling, @octokit/plugin-retry in dependencies; `tsdown.config.ts` has `noExternal: [/^@octokit/]` on cli and mcp-server entries |
| 5 | npx maxsimcli --local installs to CWD/.claude/ and --global flag is rejected | VERIFIED | `install/index.ts` lines 82-87: --global rejected with "no longer supported" error; line 109-111: targetDir always relative to CWD |
| 6 | Creating a phase produces a parent GitHub Issue with 'phase' label and YAML frontmatter in body | VERIFIED | `issues.ts` lines 28-94: createPhaseIssue builds YAML frontmatter (phase_number, requirements, dependencies, status) in code fence, labels: ['phase'] |
| 7 | Creating tasks produces sub-issues linked to parent via GitHub's native sub-issue API | VERIFIED | `issues.ts` lines 111-167: createTaskSubIssue creates child issue with 'task' label, links via `addSubIssue({ sub_issue_id: child.data.id })` -- uses numeric id, NOT number |
| 8 | Posting a plan creates a structured comment on the phase Issue | VERIFIED | `issues.ts` lines 176-196: postPlanComment creates comment with `## Plan {planNumber}` header via octokit.rest.issues.createComment |
| 9 | Labels (phase/task/blocker) are created in the repo if they do not exist | VERIFIED | `labels.ts` lines 30-102: ensureLabels iterates MAXSIM_LABELS, getLabel (404 = create, exists = update if different) |
| 10 | A milestone is created or found via Octokit, not gh CLI | VERIFIED | `milestones.ts` lines 25-57: ensureMilestone uses octokit.rest.issues.listMilestones/createMilestone, no gh CLI calls |
| 11 | A GitHub Project Board with 4 status columns is created during init | VERIFIED | `projects.ts` lines 64-124: ensureProjectBoard with DEFAULT_STATUS_OPTIONS ('To Do', 'In Progress', 'In Review', 'Done'); gh CLI bridge only for creation (no REST create endpoint) |
| 12 | Issues are added to the project board and can be moved between status columns | VERIFIED | `projects.ts` lines 272-301 (addItemToProject) and 315-362 (moveItemToStatus) via Octokit REST |
| 13 | Phase progress determined by querying GitHub Issues state (open/closed sub-issues) | VERIFIED | `sync.ts` lines 46-91: checkPhaseProgress uses octokit.rest.issues.listSubIssues, counts open/closed |
| 14 | MCP tools expose GitHub operations without agents calling gh directly | VERIFIED | `github-tools.ts` (519 lines), `board-tools.ts` (220 lines), `state-tools.ts` (527 lines) all use adapter functions, 28 requireAuth() calls across 5 MCP tool files |
| 15 | No code imports from gh-legacy.ts -- the legacy adapter is fully removed | VERIFIED | grep for gh-legacy/detectGitHubMode/ghExec/ghGraphQL/local-only across all src/ returns zero matches; gh-legacy.ts file does not exist |
| 16 | The github/ module barrel export is clean with no legacy references | VERIFIED | `index.ts` exports 8 modules: types, client, mapping, issues, projects, labels, milestones, templates, sync -- no gh-legacy reference |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/cli/src/github/client.ts` | Octokit singleton, auth gate, repo info, error wrapper | VERIFIED | 266 lines. Exports: getOctokit, requireAuth, getRepoInfo, resetOctokit, withGhResult. Imports from @octokit/rest, @octokit/plugin-throttling, @octokit/plugin-retry. |
| `packages/cli/src/github/types.ts` | AuthError class, minimal labels, no GitHubMode | VERIFIED | 101 lines. AuthError with 3 codes, MAXSIM_LABELS = phase/task/blocker, no GitHubMode anywhere in src/. |
| `packages/cli/src/github/issues.ts` | Phase CRUD, task sub-issues, plan comments, close/reopen (min 150 lines) | VERIFIED | 376 lines. 9 exports: createPhaseIssue, createTaskSubIssue, postPlanComment, closeIssue, reopenIssue, getPhaseIssue, listPhaseSubIssues, postComment, postCompletionComment. |
| `packages/cli/src/github/labels.ts` | Label creation/verification via Octokit | VERIFIED | 106 lines. Exports: ensureLabels, MAXSIM_LABELS. Uses getLabel/createLabel/updateLabel. |
| `packages/cli/src/github/milestones.ts` | Milestone CRUD via Octokit | VERIFIED | 79 lines. Exports: ensureMilestone, closeMilestone. Uses listMilestones/createMilestone/updateMilestone. |
| `packages/cli/src/github/mapping.ts` | Rebuildable cache with rebuildMappingFromGitHub | VERIFIED | 298 lines. Exports: loadMapping, saveMapping, updateTaskMapping, updateTodoMapping, createEmptyMapping, getIssueForTask, getIssueForTodo, rebuildMappingFromGitHub. Documented as cache at top. |
| `packages/cli/src/github/projects.ts` | Project board management via REST (min 100 lines) | VERIFIED | 493 lines. Exports: ensureProjectBoard, addItemToProject, moveItemToStatus, getProjectBoard, resetProjectsCache. |
| `packages/cli/src/github/sync.ts` | State verification from GitHub Issues (min 60 lines) | VERIFIED | 259 lines. Exports: checkPhaseProgress, getPhaseState, detectInterruptedPhase, getAllPhasesProgress, PhaseProgress type. |
| `packages/cli/src/github/index.ts` | Clean barrel export | VERIFIED | 19 lines. Exports 8 modules, no legacy references. |
| `packages/cli/src/mcp/github-tools.ts` | MCP tools for issue CRUD (min 100 lines) | VERIFIED | 519 lines. 10 tools registered, all using Octokit adapter with requireAuth gate. |
| `packages/cli/src/mcp/board-tools.ts` | MCP tools for project board (min 50 lines) | VERIFIED | 220 lines. 3 tools: mcp_query_board, mcp_add_to_board, mcp_search_issues. |
| `packages/cli/src/mcp/state-tools.ts` | MCP tools for state queries from GitHub Issues (min 50 lines) | VERIFIED | 527 lines. 3 GitHub state tools (mcp_get_phase_progress, mcp_get_all_progress, mcp_detect_interrupted) + 4 local STATE.md tools. |
| `packages/cli/src/install/index.ts` | Local-only install enforcement (min 50 lines) | VERIFIED | 511 lines. --global rejected at line 82, install always to CWD/.claude/. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| client.ts | gh CLI | `execFileSync('gh', ['auth', 'token'])` | VERIFIED | Line 61 and 125: execFileSync for token fetch |
| client.ts | @octokit/rest | `import { Octokit } from '@octokit/rest'` | VERIFIED | Line 15: import statement present |
| tsdown.config.ts | @octokit packages | `noExternal: [/^@octokit/]` | VERIFIED | Lines 35 and 40: both cli and mcp-server entries |
| issues.ts | client.ts | `import { getOctokit, getRepoInfo, withGhResult } from './client.js'` | VERIFIED | Line 15 |
| issues.ts | GitHub Sub-Issues API | `addSubIssue({ sub_issue_id: child.data.id })` | VERIFIED | Line 135-139: uses child.data.id (numeric ID) |
| labels.ts | client.ts | `import { getOctokit, getRepoInfo, withGhResult } from './client.js'` | VERIFIED | Line 15 |
| projects.ts | client.ts | `import { getOctokit, getRepoInfo, withGhResult } from './client.js'` | VERIFIED | Line 26 |
| sync.ts | client.ts | `import { getOctokit, getRepoInfo, withGhResult } from './client.js'` | VERIFIED | Line 18 |
| github-tools.ts | issues.ts | `import { createPhaseIssue, ... } from '../github/issues.js'` | VERIFIED | Lines 24-33 |
| github-tools.ts | client.ts | `import { requireAuth } from '../github/index.js'` | VERIFIED | Lines 19-22 |
| board-tools.ts | projects.ts | `import { getProjectBoard, addItemToProject } from '../github/projects.js'` | VERIFIED | Lines 26-28 |
| state-tools.ts | sync.ts | `import { checkPhaseProgress, getAllPhasesProgress, detectInterruptedPhase } from '../github/sync.js'` | VERIFIED | Line 27 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-----------|-------------|--------|----------|
| ARCH-01 | 02-02, 02-03, 02-04 | GitHub Issues is the single source of truth for phases, tasks, and progress | SATISFIED | issues.ts manages phases/tasks as GitHub Issues; sync.ts reads progress from sub-issue state; mapping.ts documented as rebuildable cache; state-tools.ts queries GitHub for progress |
| ARCH-02 | 02-04 | .planning/ contains only project context -- not work tracking | SATISFIED | MCP state-tools.ts keeps local STATE.md for decisions/blockers (project context); progress tracking moved to GitHub via sync.ts; mapping.ts is explicitly a cache |
| ARCH-03 | 02-01 | gh CLI is a hard requirement -- no fallback paths | SATISFIED | requireAuth() throws AuthError (NOT_INSTALLED/NOT_AUTHENTICATED); no detectGitHubMode or 'local-only' fallback anywhere in codebase |
| ARCH-04 | 02-01 | Local-only installation to .claude/ per project | SATISFIED | install/index.ts rejects --global with clear error; install() always computes targetDir from CWD; no global install path |
| ARCH-05 | 02-02, 02-03, 02-04 | State-machine commands that resume from GitHub state | SATISFIED | detectInterruptedPhase in sync.ts identifies interrupted phases from mixed open/closed sub-issues; MCP tool mcp_detect_interrupted exposes this to agents |

**Orphaned requirements check:** All 5 requirements (ARCH-01 through ARCH-05) mapped to Phase 2 in REQUIREMENTS.md are claimed by plans and have supporting evidence. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| projects.ts | 99 | TODO(v5.1): Replace gh CLI bridge for project creation | Info | Documented bridge -- Projects v2 has no REST create endpoint |
| projects.ts | 187 | TODO(v5.1): Replace gh CLI bridge for field update | Info | Documented bridge -- no REST endpoint for adding single-select options |
| projects.ts | 196 | TODO(v5.1): Replace with Octokit REST | Info | Same bridge pattern, documented for future removal |
| todo-tools.ts | 9 | TODO: Migrate todo storage to GitHub Issues | Info | Acknowledged future work, does not block phase goal |

All TODOs are v5.1 deferred items with clear documentation. None are blockers -- they represent intentional API gaps in Projects v2 REST that are bridged via gh CLI.

### Human Verification Required

1. **GitHub Issue Creation End-to-End**
   - **Test:** Run `/maxsim:init` in a project with a GitHub remote
   - **Expected:** Phase Issues appear on GitHub with 'phase' label, YAML frontmatter bodies, and sub-issue links
   - **Why human:** Requires live GitHub API access and a real repository

2. **Auth Gate Behavior**
   - **Test:** Run any MAXSIM command without gh authenticated
   - **Expected:** Immediate failure with AuthError and setup instructions
   - **Why human:** Requires testing in an environment where gh CLI is not authenticated

3. **Interrupted Phase Detection**
   - **Test:** Create phase with tasks, close some, re-run execution
   - **Expected:** detectInterruptedPhase identifies completed vs remaining tasks
   - **Why human:** Requires real GitHub issue state manipulation

4. **Local Install Verification**
   - **Test:** Run `npx maxsimcli` in a clean project directory
   - **Expected:** All files in CWD/.claude/, nothing in ~/.claude/
   - **Why human:** Requires running actual install in a clean environment

### Gaps Summary

No gaps found. All 16 must-haves across 4 plans are verified:

- **Plan 01 (Octokit adapter + local install):** 5/5 truths verified. client.ts provides singleton Octokit with throttling/retry. requireAuth is a hard gate. Install rejects --global.
- **Plan 02 (Issue CRUD + labels + milestones):** 6/6 truths verified. issues.ts creates phases with YAML frontmatter, tasks as native sub-issues (using `id` not `number`). Labels and milestones via Octokit.
- **Plan 03 (Projects + sync):** 4/4 truths verified. Project board with 4 status columns. Progress from GitHub sub-issue state. detectInterruptedPhase identifies interrupted executions.
- **Plan 04 (MCP integration + legacy removal):** 5/5 truths verified. All MCP tools use Octokit adapter. gh-legacy.ts deleted. Zero legacy references in codebase. Clean barrel export.

All 5 requirements (ARCH-01 through ARCH-05) have supporting evidence. The phase goal -- "All work tracking flows through GitHub Issues, not local markdown files" -- is achieved at the adapter and MCP tool layer. The commands that invoke these tools are Phase 3 scope.
