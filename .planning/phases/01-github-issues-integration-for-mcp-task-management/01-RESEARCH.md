# Phase 1: GitHub Issues Integration for MCP Task Management - Research

**Researched:** 2026-03-09
**Domain:** GitHub Issues/Projects v2 API, MCP Tool Architecture, CLI Tooling
**Confidence:** HIGH (official docs verified)

---

## Summary

This phase replaces MAXSIM's local-only task tracking (todos in `.planning/todos/`, blockers in STATE.md) with GitHub Issues as the single source of truth. GitHub Projects v2 provides the kanban board, and GitHub Milestones provide grouping. The implementation requires a new `github/` module in `packages/cli/src/` that wraps both the `gh` CLI and GitHub's GraphQL API (for Projects v2 operations that have no REST endpoint). The existing MCP tools in `packages/cli/src/mcp/` (phase-tools.ts, todo-tools.ts, state-tools.ts) are replaced with GitHub-backed implementations, and new MCP tools are added for board queries, issue search, comments, and card movement.

The `gh` CLI is the primary interface for all GitHub operations. It provides first-class commands for Projects v2 (`gh project create/field-create/item-add/item-edit`), Issues (`gh issue create --label --milestone --project`), and raw API access (`gh api graphql` for operations not covered by CLI commands). Authentication is checked via `gh auth status` and requires the `project` scope (added via `gh auth refresh -s project`). The architecture must support graceful degradation when `gh` is not authenticated -- all GitHub-backed MCP tools must fall back to local-only behavior.

**Primary recommendation:** Use `gh` CLI commands for all operations, falling back to `gh api graphql` only for operations with no CLI equivalent (sub-issue linking, issue dependency creation). Never use raw HTTP requests -- `gh` handles auth, pagination, and rate limiting.

---

## User Constraints

### Locked Decisions (from CONTEXT.md)

- Plan tasks AND todos create GitHub Issues (every artifact gets an issue)
- Fresh issues created per plan -- old plan's issues closed with 'superseded' label (closed as completed, not 'not planned')
- Eager creation: all issues created at once when plan is finalized
- Phase = parent tracking issue with live task list (checkbox links to child issues: `- [ ] #42`)
- External GitHub issues can be imported into MAXSIM -- AI decides placement
- Issue-numbered branch naming: `maxsim/issue-{N}-{slug}`
- Mapping file (`.planning/github-issues.json`) committed to git for persistence
- Auto-link PRs via `Closes #N` in PR description
- All parallel wave tasks move to In Progress simultaneously
- One GitHub Project board per repo (not per milestone)
- Auto-created by MAXSIM during setup (no manual configuration needed)
- 4 standard columns: To Do, In Progress, In Review, Done
- GitHub Milestones used for grouping (one per MAXSIM milestone)
- Blockers handled via GitHub's native "blocked by" issue linking (no separate column)
- Fibonacci story points using GitHub Projects v2 built-in Estimate field: 1, 2, 3, 5, 8, 13, 21, 34
- Issues created on plan finalization (not earlier, not later)
- Lifecycle: To Do -> In Progress -> In Review -> Done
- Same review cycle for todos (no shortcuts for any issue type)
- Milestones auto-close when all their issues are closed
- Sync check runs before each phase action
- Full plan task spec in issue body using collapsible `<details>` sections
- Issue title format: `[P{N}] Task name`
- MAXSIM issues identified by `maxsim` label + type labels: `phase-task`, `todo`, `imported`, `superseded`
- Labels color-coded by category
- All labels created upfront during project setup
- GitHub Issue Templates installed in `.github/ISSUE_TEMPLATE/`
- Full MCP tool replacement (not coexistence)
- Auth mandatory but skippable during setup with graceful degradation
- Detailed progress comments on issues during AI work

### Claude's Discretion Areas

- API layer choice per operation: REST API, GraphQL API, or `gh` CLI
- Label color scheme (specific colors per category)
- Rate limiting strategy for progress comments
- Issue body markdown formatting details

### Deferred (Out of Scope)

- Command simplification: removing manual commands like /maxsim:complete-milestone
- Full removal of local .planning/ tracking files

### No-Go Constraints

- Do NOT make GitHub auth truly mandatory -- must be skippable
- Do NOT use a separate Blocked column on the project board
- Do NOT create issues lazily (just-in-time) -- eager on plan finalization
- Do NOT simplify the MAXSIM command surface in this phase

---

## Standard Stack

### Core Tools

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|-------------|
| `gh` CLI | 2.x (user-installed) | All GitHub operations | Official GitHub CLI, handles auth/pagination/rate-limits |
| GitHub REST API (via `gh api`) | v3 (2022-11-28) | Issues CRUD, Labels, Milestones, Sub-issues | First-class support, simpler than GraphQL for basic ops |
| GitHub GraphQL API (via `gh api graphql`) | v4 | Projects v2 operations | Only API for Projects v2 (no REST API exists) |
| `@modelcontextprotocol/sdk` | 1.27.1 | MCP tool registration | Already in use, no change needed |
| `zod` | 3.25.0 | MCP tool schema validation | Already in use, no change needed |

### Supporting

| Tool | Purpose |
|------|---------|
| `child_process.execFile` or `child_process.spawn` | Execute `gh` CLI commands from Node.js |
| `JSON.parse` on `gh` CLI output | Parse `--format json` / `--json` output |

### Alternatives Considered

| Alternative | Rejected Because |
|------------|-----------------|
| `@octokit/rest` / `@octokit/graphql` | Adds npm dependency, requires separate auth management, `gh` already handles everything |
| Raw `fetch` to GitHub API | No auth management, no pagination handling, re-inventing `gh` |
| GitHub Actions for automation | Wrong layer -- this is a CLI tool, not a CI pipeline |

### No New Dependencies Required

All GitHub operations use the `gh` CLI (which users install separately). No new npm packages are needed. The existing `child_process` from Node.js stdlib is sufficient for spawning `gh` commands.

---

## Architecture Patterns

### Recommended Module Structure

```
packages/cli/src/
  github/                          # NEW: GitHub integration layer
    gh.ts                          # Core gh CLI wrapper (exec, auth check, error handling)
    issues.ts                      # Issue CRUD (create, close, update, list, comment)
    projects.ts                    # Projects v2 (create board, add items, move cards, query)
    labels.ts                      # Label management (create, ensure)
    milestones.ts                  # Milestone CRUD
    mapping.ts                     # github-issues.json read/write/sync
    templates.ts                   # .github/ISSUE_TEMPLATE/ file generation
    types.ts                       # GitHub-specific type definitions
  mcp/
    github-tools.ts                # NEW: GitHub MCP tools (replaces phase-tools, todo-tools partially)
    phase-tools.ts                 # MODIFIED: adds GitHub issue creation on phase lifecycle
    todo-tools.ts                  # MODIFIED: creates GitHub issues for todos
    state-tools.ts                 # MODIFIED: blockers use GitHub issue linking
    board-tools.ts                 # NEW: query board, search/filter, move cards
```

### Pattern 1: `gh` CLI Wrapper (gh.ts)

Source: Official `gh` CLI manual (cli.github.com/manual)

```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GhResult<T = unknown> {
  ok: true;
  data: T;
} | {
  ok: false;
  error: string;
  code: 'NOT_AUTHENTICATED' | 'NOT_INSTALLED' | 'RATE_LIMITED' | 'NOT_FOUND' | 'PERMISSION_DENIED' | 'UNKNOWN';
}

/** Check if gh CLI is installed and authenticated with required scopes */
export async function checkGhAuth(): Promise<{
  installed: boolean;
  authenticated: boolean;
  hasProjectScope: boolean;
  username: string | null;
}> {
  // gh auth status --show-token exits 0 if authenticated
  // Parse output for scopes
}

/** Execute a gh CLI command and return parsed JSON output */
export async function ghExec<T>(args: string[], options?: {
  cwd?: string;
  parseJson?: boolean;
}): Promise<GhResult<T>> {
  // execFile('gh', args, { cwd })
  // Handle exit codes: 1 = auth error, 4 = not found, etc.
  // Parse JSON output if --format json or --json flags present
}

/** Execute a GraphQL query via gh api graphql */
export async function ghGraphQL<T>(query: string, variables?: Record<string, unknown>): Promise<GhResult<T>> {
  // gh api graphql -f query='...' -F var1=val1
}
```

### Pattern 2: Graceful Degradation

The `detectGitHubMode()` function determines operation mode at startup:

```typescript
export type GitHubMode = 'full' | 'local-only';

export async function detectGitHubMode(): Promise<GitHubMode> {
  const auth = await checkGhAuth();
  if (!auth.installed || !auth.authenticated) return 'local-only';
  if (!auth.hasProjectScope) {
    // Warn user: gh auth refresh -s project
    return 'local-only';
  }
  return 'full';
}
```

MCP tools check mode and degrade gracefully:
- `full`: Create GitHub issues, update board, post comments
- `local-only`: Fall back to existing local file operations (current behavior preserved)

### Pattern 3: Issue-to-Task Mapping File

`.planning/github-issues.json` structure:

```json
{
  "project_number": 1,
  "project_id": "PVT_xxx",
  "repo": "owner/repo",
  "milestone_id": 42,
  "milestone_title": "v5.1",
  "labels": {
    "maxsim": "LA_xxx",
    "phase-task": "LA_xxx",
    "todo": "LA_xxx",
    "imported": "LA_xxx",
    "superseded": "LA_xxx"
  },
  "phases": {
    "01": {
      "tracking_issue": { "number": 10, "node_id": "I_xxx", "item_id": "PVTI_xxx" },
      "plan": "01-01",
      "tasks": {
        "1.1": { "number": 15, "node_id": "I_xxx", "item_id": "PVTI_xxx", "status": "To Do" },
        "1.2": { "number": 16, "node_id": "I_xxx", "item_id": "PVTI_xxx", "status": "To Do" }
      }
    }
  },
  "todos": {
    "1741234567890-my-task": { "number": 20, "node_id": "I_xxx", "item_id": "PVTI_xxx", "status": "To Do" }
  }
}
```

### Pattern 4: Projects v2 Board Setup (GraphQL Required)

Source: docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects

```typescript
async function setupProjectBoard(owner: string): Promise<void> {
  // Step 1: Create project
  // gh project create --owner "@me" --title "MAXSIM: ProjectName"

  // Step 2: Get project fields (Status field is built-in)
  // gh project field-list PROJECT_NUM --owner "@me" --format json
  // Parse to find Status field ID and option IDs (To Do, In Progress, etc.)

  // Step 3: Add "In Review" status option (if not present)
  // Projects v2 default statuses: "Todo", "In Progress", "Done"
  // Need to add "In Review" via GraphQL:
  // mutation { updateProjectV2Field(input: { ... }) }
  // NOTE: Cannot add options to single-select via CLI. Must use GraphQL or UI.

  // Step 4: Create Estimate number field
  // gh project field-create PROJECT_NUM --owner "@me" --name "Estimate" --data-type NUMBER

  // Step 5: Store IDs in github-issues.json
}
```

**CRITICAL NOTE on Status field:** GitHub Projects v2 creates 3 default status options: "Todo", "In Progress", "Done". The CONTEXT.md requires 4 columns: To Do, In Progress, In Review, Done. Adding "In Review" requires either the GraphQL `updateProjectV2` mutation to add a single-select option, or prompting the user to add it manually via the GitHub UI. The GraphQL approach is preferred for automation.

### Pattern 5: Issue Creation with Full Spec Body

```typescript
async function createTaskIssue(task: TaskSpec, phaseNum: string): Promise<number> {
  const title = `[P${phaseNum}] ${task.name}`;

  const body = `## Summary

${task.summary}

<details>
<summary>Full Specification</summary>

### Actions
${task.actions.map(a => `- ${a}`).join('\n')}

### Acceptance Criteria
${task.acceptanceCriteria.map(c => `- [ ] ${c}`).join('\n')}

### Dependencies
${task.dependencies.map(d => `Depends on: #${d}`).join('\n')}

</details>

---
*Phase: ${phaseNum} | Plan: ${task.plan} | Task: ${task.id}*
*Generated by MAXSIM*`;

  // gh issue create --title "..." --body "..." --label maxsim --label phase-task --milestone "v5.1" --project "MAXSIM: ProjectName"
  // Parse URL output to extract issue number
}
```

### Pattern 6: Moving Issues Between Columns

Source: cli.github.com/manual/gh_project_item-edit

```typescript
async function moveIssueToStatus(
  projectNum: number,
  itemId: string,
  statusFieldId: string,
  statusOptionId: string,
  projectId: string,
): Promise<void> {
  // gh project item-edit --project-id PROJECT_ID --id ITEM_ID --field-id STATUS_FIELD_ID --single-select-option-id OPTION_ID
}
```

### Anti-Patterns to Avoid

1. **DO NOT** import `octokit` or any GitHub SDK -- use `gh` CLI exclusively
2. **DO NOT** store GitHub auth tokens in config -- `gh` manages auth
3. **DO NOT** make REST calls for Projects v2 operations -- only GraphQL works
4. **DO NOT** create issues one-at-a-time sequentially -- batch creation (but note `gh issue create` is single-issue, so use Promise.all with concurrency limit)
5. **DO NOT** poll GitHub for status changes -- use `github-issues.json` as local cache, sync on demand
6. **DO NOT** rely on `gh issue create` returning JSON (it does not support `--format json` as of current CLI) -- parse the URL from stdout instead

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|------------|-------------|-----|
| GitHub authentication | Custom OAuth flow | `gh auth status` / `gh auth login` | gh handles token storage, scopes, refresh |
| GraphQL queries | Raw fetch with headers | `gh api graphql -f query='...'` | Handles auth headers, rate limits, pagination |
| Issue creation | REST API POST | `gh issue create` CLI | Handles repo detection, labels, milestones, projects |
| Board management | REST API (doesn't exist) | `gh project` CLI commands | Only way to manage Projects v2 from CLI |
| Label management | Custom label sync | `gh label create` / `gh api` REST | Simple CRUD, handles duplicates |
| Milestone management | GraphQL | `gh api repos/{owner}/{repo}/milestones` REST | REST is simpler for milestones |
| Rate limiting | Custom retry logic | `gh` built-in retry | gh CLI handles rate limit responses |
| Pagination | Custom cursor tracking | `gh api --paginate` | Built-in pagination support |
| Sub-issue linking | Manual body text references | `gh api` REST sub-issues endpoint | Native GitHub feature, proper hierarchy |
| Issue dependencies | Comment-based "blocked by" | GitHub's native dependency API | Proper blocking visualization on boards |

---

## Common Pitfalls

### Pitfall 1: `gh issue create` Does Not Support JSON Output

**What goes wrong:** Attempting to use `--format json` or `--json` with `gh issue create` fails. The command outputs a URL string to stdout, not JSON.

**Why:** The `gh issue create` command was designed for interactive use. JSON output support has been requested (cli/cli#11196) but is not implemented.

**How to avoid:** Parse the URL from stdout (format: `https://github.com/OWNER/REPO/issues/NUMBER`). Extract the issue number from the URL path. Then query `gh issue view NUMBER --json nodeId,number,url` to get the full issue data.

**Warning signs:** Tests failing with JSON parse errors on issue creation.

### Pitfall 2: Projects v2 Status Field Has Only 3 Default Options

**What goes wrong:** Assuming "In Review" exists as a default status option. Projects v2 creates only "Todo", "In Progress", "Done" by default.

**Why:** GitHub's default project template only has 3 columns.

**How to avoid:** After creating the project, query the Status field options via `gh project field-list`. If "In Review" is missing, add it via the GraphQL `updateProjectV2` mutation or the `gh` CLI. This requires adding a single-select option to an existing field, which is supported via GraphQL but not directly via `gh project` CLI commands. Use `gh api graphql` with the appropriate mutation.

**Warning signs:** "Option not found" errors when trying to move items to "In Review".

### Pitfall 3: `gh auth` Needs `project` Scope

**What goes wrong:** `gh project` commands fail with permission errors even though `gh auth status` shows authenticated.

**Why:** The default `gh auth login` only requests `repo`, `read:org`, `gist` scopes. Projects v2 requires the `project` scope.

**How to avoid:** Check for the scope explicitly: `gh auth status` output includes scopes. If `project` scope is missing, prompt: "Run `gh auth refresh -s project` to enable GitHub Projects integration."

**Warning signs:** 403 errors on any `gh project` command.

### Pitfall 4: Projects v2 Item IDs Are Not Issue IDs

**What goes wrong:** Using issue IDs (number or node_id) where project item IDs are expected, or vice versa.

**Why:** When you add an issue to a project, it gets a separate project item ID (PVTI_xxx). Field updates (status, estimate) operate on the item ID, not the issue ID.

**How to avoid:** After `gh project item-add`, store both the issue number/node_id AND the project item ID in `github-issues.json`. Use issue IDs for issue operations (close, comment, label) and item IDs for project operations (move status, set estimate).

**Warning signs:** "Item not found" errors on `gh project item-edit`.

### Pitfall 5: Race Conditions in Batch Issue Creation

**What goes wrong:** Creating many issues in parallel hits GitHub's secondary rate limit (80 content-generating requests per minute).

**Why:** GitHub imposes secondary rate limits on content-generating requests beyond the primary 5,000/hour limit.

**How to avoid:** Use a concurrency limiter (e.g., process 5 issues at a time). Add a small delay between batches. For a typical phase with 5-15 tasks, this is unlikely to be an issue, but the code should handle 429 responses gracefully.

**Warning signs:** 429 (Too Many Requests) responses after rapid-fire issue creation.

### Pitfall 6: GraphQL Requires Separate Add and Update Calls

**What goes wrong:** Trying to create a project item and set its fields (status, estimate) in a single GraphQL mutation.

**Why:** GitHub's GraphQL API explicitly does not support adding and updating an item in the same call. You must first `addProjectV2ItemById`, then `updateProjectV2ItemFieldValue` separately.

**How to avoid:** Always use a two-step process: (1) add item to project, (2) update field values. This applies to both status and estimate fields.

**Warning signs:** Mutation errors or silently ignored field values.

### Pitfall 7: Superseded Issues Not Properly Cross-Referenced

**What goes wrong:** Replanning creates new issues but old issues are orphaned without links.

**Why:** The CONTEXT.md requires cross-references: new issues link "Replaces #42", old issues link "Superseded by #55".

**How to avoid:** When replanning: (1) create new issues, (2) add comment to old issues "Superseded by #NEW", (3) add "Replaces #OLD" to new issue body, (4) close old issues with `superseded` label, (5) update `github-issues.json` mapping.

**Warning signs:** Users confused by orphaned closed issues with no link to replacements.

### Pitfall 8: Sub-Issue API May Require Special Headers

**What goes wrong:** Sub-issue API calls return 404 or unexpected errors.

**Why:** The sub-issue feature went through public preview and may require the `GraphQL-Features: sub_issues` header for GraphQL operations. REST API access is generally available but the `sub_issue_id` parameter expects the internal numeric ID, not the `node_id`.

**How to avoid:** For sub-issues, prefer the REST API via `gh api`: `gh api repos/OWNER/REPO/issues/PARENT_NUM/sub_issues -f sub_issue_id=CHILD_ID`. The child issue's internal `id` (not `node_id`) is needed -- obtain it from issue creation or `gh api repos/OWNER/REPO/issues/NUMBER`.

**Warning signs:** 404 errors on sub-issue endpoints, wrong ID format.

---

## Code Examples

### Example 1: Check `gh` Authentication Status

Source: cli.github.com/manual/gh_auth_status

```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);

interface AuthStatus {
  installed: boolean;
  authenticated: boolean;
  scopes: string[];
  hasProjectScope: boolean;
  username: string | null;
}

async function checkGhAuth(): Promise<AuthStatus> {
  try {
    const { stdout, stderr } = await execFileAsync('gh', ['auth', 'status'], {
      timeout: 10000,
    });
    // gh auth status outputs to stderr (not stdout)
    const output = stderr || stdout;
    const authenticated = !output.includes('not logged in');
    const scopeMatch = output.match(/Token scopes:.*'([^']+)'/);
    const scopes = scopeMatch ? scopeMatch[1].split(', ') : [];
    const userMatch = output.match(/Logged in to [^ ]+ as ([^ ]+)/);

    return {
      installed: true,
      authenticated,
      scopes,
      hasProjectScope: scopes.includes('project') || scopes.includes('read:project'),
      username: userMatch ? userMatch[1] : null,
    };
  } catch (e: unknown) {
    const error = e as { code?: string; stderr?: string };
    if (error.code === 'ENOENT') {
      return { installed: false, authenticated: false, scopes: [], hasProjectScope: false, username: null };
    }
    // gh auth status exits with code 1 if not authenticated
    return { installed: true, authenticated: false, scopes: [], hasProjectScope: false, username: null };
  }
}
```

### Example 2: Create a GitHub Project Board

Source: cli.github.com/manual/gh_project

```typescript
async function createProjectBoard(title: string): Promise<{ number: number; id: string }> {
  // Create the project
  const { stdout } = await execFileAsync('gh', [
    'project', 'create',
    '--owner', '@me',
    '--title', title,
    '--format', 'json',
  ]);
  const project = JSON.parse(stdout);
  // project.number and project.id available

  // Add Estimate number field
  await execFileAsync('gh', [
    'project', 'field-create', String(project.number),
    '--owner', '@me',
    '--name', 'Estimate',
    '--data-type', 'NUMBER',
  ]);

  // Query field list to get Status field options
  const { stdout: fieldsOut } = await execFileAsync('gh', [
    'project', 'field-list', String(project.number),
    '--owner', '@me',
    '--format', 'json',
  ]);
  const fields = JSON.parse(fieldsOut);
  // Find Status field, check if "In Review" option exists
  // If not, add it via GraphQL mutation

  return { number: project.number, id: project.id };
}
```

### Example 3: Create Issue and Add to Project

Source: cli.github.com/manual/gh_issue_create, gh_project_item-add

```typescript
async function createIssueWithProject(
  title: string,
  body: string,
  labels: string[],
  milestone: string,
  projectTitle: string,
): Promise<{ number: number; url: string }> {
  const args = [
    'issue', 'create',
    '--title', title,
    '--body', body,
    ...labels.flatMap(l => ['--label', l]),
    '--milestone', milestone,
    '--project', projectTitle,
  ];

  const { stdout } = await execFileAsync('gh', args);
  // stdout is the issue URL: https://github.com/owner/repo/issues/42
  const url = stdout.trim();
  const number = parseInt(url.split('/').pop()!, 10);

  return { number, url };
}
```

### Example 4: Move Issue to a Status Column

Source: cli.github.com/manual/gh_project_item-edit

```typescript
async function moveItemToStatus(
  projectId: string,
  itemId: string,
  statusFieldId: string,
  statusOptionId: string,
): Promise<void> {
  await execFileAsync('gh', [
    'project', 'item-edit',
    '--project-id', projectId,
    '--id', itemId,
    '--field-id', statusFieldId,
    '--single-select-option-id', statusOptionId,
  ]);
}
```

### Example 5: Set Story Points (Estimate)

Source: cli.github.com/manual/gh_project_item-edit

```typescript
async function setEstimate(
  projectId: string,
  itemId: string,
  estimateFieldId: string,
  points: number,
): Promise<void> {
  await execFileAsync('gh', [
    'project', 'item-edit',
    '--project-id', projectId,
    '--id', itemId,
    '--field-id', estimateFieldId,
    '--number', String(points),
  ]);
}
```

### Example 6: Add "In Review" Status Option via GraphQL

Source: docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects

```typescript
async function addStatusOption(
  projectId: string,
  statusFieldId: string,
  optionName: string,
  existingOptions: Array<{ id: string; name: string }>,
): Promise<string> {
  // GraphQL mutation to update single-select field options
  // Note: This requires adding a new option to the Status field
  const allOptions = [
    ...existingOptions.map(o => `{name: "${o.name}", description: "", color: GRAY}`),
    `{name: "${optionName}", description: "", color: BLUE}`,
  ];

  const query = `
    mutation {
      updateProjectV2Field(input: {
        projectId: "${projectId}"
        fieldId: "${statusFieldId}"
        singleSelectOptions: [${allOptions.join(', ')}]
      }) {
        projectV2Field {
          ... on ProjectV2SingleSelectField {
            options { id name }
          }
        }
      }
    }
  `;

  const { stdout } = await execFileAsync('gh', [
    'api', 'graphql',
    '-f', `query=${query}`,
  ]);
  const result = JSON.parse(stdout);
  const newOption = result.data.updateProjectV2Field.projectV2Field.options
    .find((o: { name: string }) => o.name === optionName);
  return newOption.id;
}
```

### Example 7: Issue Template (YAML Form)

Source: docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms

```yaml
# .github/ISSUE_TEMPLATE/phase-task.yml
name: "MAXSIM Phase Task"
description: "Task generated by MAXSIM phase planning"
labels: ["maxsim", "phase-task"]
body:
  - type: markdown
    attributes:
      value: |
        This issue was auto-generated by MAXSIM.

  - type: textarea
    id: summary
    attributes:
      label: Summary
      description: Task summary
    validations:
      required: true

  - type: textarea
    id: spec
    attributes:
      label: Full Specification
      description: Detailed task specification including actions, criteria, and dependencies
```

```yaml
# .github/ISSUE_TEMPLATE/todo.yml
name: "MAXSIM Todo"
description: "Todo item tracked by MAXSIM"
labels: ["maxsim", "todo"]
body:
  - type: textarea
    id: description
    attributes:
      label: Description
      description: Brief description of the todo item
    validations:
      required: true

  - type: textarea
    id: acceptance
    attributes:
      label: Acceptance Criteria
      description: What defines "done" for this todo?
```

### Example 8: GitHub Milestone via REST API

Source: docs.github.com/en/rest/issues/milestones

```typescript
async function createMilestone(title: string, description?: string): Promise<number> {
  const { stdout } = await execFileAsync('gh', [
    'api', 'repos/{owner}/{repo}/milestones',
    '-X', 'POST',
    '-f', `title=${title}`,
    '-f', `description=${description || ''}`,
    '-f', 'state=open',
  ]);
  const milestone = JSON.parse(stdout);
  return milestone.number; // Milestone number for use in issue creation
}
```

### Example 9: Label Creation

Source: docs.github.com/en/rest/issues/labels

```typescript
const MAXSIM_LABELS = [
  { name: 'maxsim', color: '6f42c1', description: 'MAXSIM managed issue' },
  { name: 'phase-task', color: '0075ca', description: 'MAXSIM phase task' },
  { name: 'todo', color: 'fbca04', description: 'MAXSIM todo item' },
  { name: 'imported', color: 'e4e669', description: 'Imported into MAXSIM tracking' },
  { name: 'superseded', color: 'd73a4a', description: 'Superseded by newer plan' },
] as const;

async function ensureLabels(): Promise<void> {
  for (const label of MAXSIM_LABELS) {
    try {
      await execFileAsync('gh', [
        'label', 'create', label.name,
        '--color', label.color,
        '--description', label.description,
        '--force', // Update if exists
      ]);
    } catch {
      // Label might already exist with different casing, --force handles this
    }
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|-------------|-----------------|-------------|--------|
| GitHub Projects (classic) columns API | GitHub Projects v2 GraphQL API only | 2022-06 | Must use GraphQL for all board operations |
| REST API for project boards | `gh project` CLI commands | 2023-11 (GA) | CLI is the preferred interface |
| Task lists in issue body (`- [ ] #N`) | Sub-issues (native parent-child) | 2024-12 (REST API) | Proper hierarchy, progress tracking built-in |
| Manual "blocked by" comments | Native issue dependencies API | 2025-08 (GA) | Real dependency tracking, board visualization |
| Labels for story points | Projects v2 Number field (Estimate) | 2022-06 | Summable, sortable, no label pollution |
| `gh issue create` with JSON output | Still no JSON output for `gh issue create` | N/A (open issue cli/cli#11196) | Must parse URL from stdout |

---

## Open Questions

### What We Know

1. `gh project create` returns project number and ID in JSON format
2. `gh project field-create` supports NUMBER data type for Estimate field
3. `gh project item-edit` supports `--number`, `--single-select-option-id`, and `--field-id` for updating item fields
4. `gh issue create` outputs the issue URL to stdout (not JSON)
5. Sub-issues have both REST and GraphQL API support
6. Issue dependencies ("blocked by") have API support (GA since August 2025)
7. The `project` scope is required for Projects v2 CLI commands

### What's Unclear

1. **Adding "In Review" status option**: The `gh project` CLI does not have a command to add options to existing single-select fields. This likely requires a GraphQL mutation (`updateProjectV2Field`). Need to verify exact mutation syntax for adding a new option without removing existing ones.

   **Recommendation:** Use `gh api graphql` with `updateProjectV2Field` mutation. Test with a throwaway project first.

2. **Sub-issue vs Task List**: The CONTEXT.md specifies "Phase = parent tracking issue with live task list (checkbox links to child issues: `- [ ] #42`)". GitHub now has native sub-issues. Should we use sub-issues (proper hierarchy) or task lists (simpler, works in issue body)?

   **Recommendation:** Use sub-issues for the actual parent-child relationship (gives proper progress tracking in Projects v2), AND include a task list in the parent issue body for visual reference. The task list checkboxes auto-check when referenced issues close.

3. **Mapping file format for replanning**: When a plan is superseded and new issues are created, the `github-issues.json` needs to handle the old-to-new mapping. The exact schema for tracking supersession chains needs design.

   **Recommendation:** Add a `superseded_by` field to task entries, and a `replaces` field to new entries. Keep old entries in the mapping file with a `closed: true` flag.

4. **`gh issue create` and project assignment**: The `--project` flag on `gh issue create` accepts a project title (string), not a project number. Need to verify it correctly adds the issue to the project board.

   **Recommendation:** Use `--project "MAXSIM: ProjectName"` where the title matches exactly. After creation, verify via `gh project item-list`.

---

## Sources

### Primary (HIGH confidence)

- [Using the API to manage Projects v2](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects) -- Official GitHub docs, verified 2026-03-09
- [gh project CLI commands](https://cli.github.com/manual/gh_project) -- Official GitHub CLI manual, verified 2026-03-09
- [gh project field-create](https://cli.github.com/manual/gh_project_field-create) -- Supports TEXT, SINGLE_SELECT, DATE, NUMBER data types
- [gh project item-edit](https://cli.github.com/manual/gh_project_item-edit) -- Supports --number, --text, --date, --single-select-option-id, --field-id
- [gh project item-add](https://cli.github.com/manual/gh_project_item-add) -- Adds issues via --url flag
- [gh issue create](https://cli.github.com/manual/gh_issue_create) -- Supports --label, --milestone, --project, --body, --body-file
- [REST API for milestones](https://docs.github.com/en/rest/issues/milestones) -- CRUD endpoints for milestone management
- [REST API for labels](https://docs.github.com/en/rest/issues/labels) -- CRUD endpoints for label management
- [REST API for sub-issues](https://docs.github.com/en/rest/issues/sub-issues) -- Add/remove/list sub-issues
- [Issue Templates YAML format](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms) -- `.yml` form syntax
- [GitHub API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) -- 5000/hr primary, 80/min content-generating secondary

### Secondary (MEDIUM confidence)

- [GitHub CLI project command GA announcement](https://github.blog/developer-skills/github/github-cli-project-command-is-now-generally-available/) -- Feature availability
- [Dependencies on issues changelog](https://github.blog/changelog/2025-08-21-dependencies-on-issues/) -- Issue dependency API GA
- [Sub-issues REST API changelog](https://github.blog/changelog/2024-12-12-github-issues-projects-close-issue-as-a-duplicate-rest-api-for-sub-issues-and-more/) -- Sub-issues REST support
- [GraphQL examples for ProjectsV2](https://devopsjournal.io/blog/2022/11/28/github-graphql-queries) -- Community-verified patterns
- [`gh issue create` JSON output request](https://github.com/cli/cli/issues/11196) -- Confirms no JSON output support

### Tertiary (LOW confidence)

- [createProjectV2Field discussion](https://github.com/orgs/community/discussions/35922) -- Community discussion on field creation API limitations
- [Sub-issues API 404 issue](https://github.com/cli/cli/issues/12258) -- Potential REST API instability (December 2025)

---

## Metadata

| Area | Confidence | Reason |
|------|-----------|--------|
| `gh` CLI commands | HIGH | Official manual verified, commands tested in docs |
| Projects v2 GraphQL API | HIGH | Official GitHub docs verified |
| Issue CRUD (REST + CLI) | HIGH | Official docs, well-documented |
| Sub-issues API | MEDIUM | GA but recent, some reported 404 issues |
| Issue dependencies API | MEDIUM | GA since August 2025, less documentation available |
| Status field option management | MEDIUM | GraphQL mutation exists but CLI gap, limited docs |
| Rate limiting | HIGH | Official docs with specific numbers |
| Graceful degradation pattern | HIGH | Follows existing MAXSIM patterns (MCP fallback) |

**Research date:** 2026-03-09
**Valid until:** 2026-06-09 (GitHub API is stable; `gh` CLI updates may add new flags)
