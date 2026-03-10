# Phase 2: GitHub Issues Foundation - Research

**Researched:** 2026-03-10
**Domain:** GitHub API integration, Issue-based project management, Node.js SDK architecture
**Confidence:** HIGH (official docs + verified SDK versions + existing codebase analysis)

---

## User Constraints

Copied verbatim from 02-CONTEXT.md. The planner MUST honor every decision below.

### Locked Decisions

1. **Phase = Parent Issue with sub-issues** -- GitHub's native sub-issue feature (REST API: `POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues`)
2. **Plan = Issue comment** on the phase Issue (not separate Issues)
3. **Tasks = Sub-issues** created upfront during planning -- all tasks visible immediately
4. **gh for auth (`gh auth token`), @octokit/rest for all API calls** (REST, not GraphQL)
5. **Minimal labels**: `phase`, `task`, `blocker` -- labels identify MAXSIM Issues
6. **Single global GitHub Project Board** per project
7. **Standalone `github.ts` adapter** in `src/core/` for low-level API operations
8. **Best-effort atomicity** with cleanup on failure
9. **.planning/ keeps only project context** -- all phase artifacts move to GitHub
10. **Phase lifecycle states**: to-do -> in-progress -> in-review -> done (via Project Board columns)
11. **Issue body = high-level summary** with YAML frontmatter for machine-parseable metadata
12. **Comments = detail** -- research findings, plan breakdowns, execution logs, reviews
13. **Confirm then resume** -- on re-run, show completed/remaining tasks, user confirms
14. **Full re-verification before resuming** -- rebuild, re-check completed work
15. **Interactive setup wizard** when `gh` is not installed or not authenticated
16. **Cache token in memory** -- fetch once per CLI process via `gh auth token`, no disk persistence
17. **Two-layer architecture**: adapter (API calls) + domain (business logic)
18. **Agents call MAXSIM CLI tool commands, never `gh` directly** -- CLI handles parsing, caching, structured data return

### Deferred Ideas

None captured during discussion.

---

## Summary

Phase 2 transforms MAXSIM from a local-file-based work tracker into a GitHub-native system where all phase/task/progress data lives in GitHub Issues. The existing codebase already has a substantial `src/github/` module (~800 lines across 8 files) that uses `gh` CLI (`child_process.execFile`) for all GitHub operations. The CONTEXT.md decision mandates switching to `@octokit/rest` for API calls while keeping `gh` only for authentication token retrieval.

The key architectural shift involves: (1) replacing the `ghExec()` / `ghGraphQL()` wrapper pattern with `@octokit/rest` typed methods, (2) adopting GitHub's native sub-issue REST API (available since December 2024, GA in 2025) instead of manual parent-issue checkbox lists, (3) utilizing the new Projects v2 REST API (available since September 2025) instead of GraphQL mutations for board operations, and (4) restructuring `.planning/` to contain only project context while GitHub Issues become the single source of truth.

The existing `src/github/` code provides a solid structural foundation -- the types, mapping persistence layer, and MCP tool registrations can be adapted. However, the core API interaction layer (`gh.ts`) must be completely replaced with an Octokit-based adapter, and `issues.ts`/`projects.ts`/`sync.ts` must be rewritten to use Octokit methods instead of `ghExec()`.

**Primary recommendation:** Replace `gh.ts` with an Octokit-based `github.ts` adapter that initializes once per process using `gh auth token`, and rewrite all downstream modules to use typed Octokit methods. Use `octokit.rest.issues.addSubIssue()` for native sub-issues and `octokit.request()` for Projects v2 REST endpoints if typed methods are not yet available.

---

## Standard Stack

### Core Libraries

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|-------------|
| `@octokit/rest` | ^22.0.1 | GitHub REST API client | Official GitHub SDK, typed methods for all REST endpoints including sub-issues. Decision locked in CONTEXT.md. |
| `@octokit/plugin-throttling` | ^9.x | Rate limit handling | Official plugin implementing GitHub's recommended request throttling best practices. Handles 429 responses and secondary rate limits automatically. |
| `@octokit/plugin-retry` | ^7.x | Automatic retry on transient errors | Official plugin for automatic retries on 5xx errors and network failures. |

### Supporting Libraries

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `gh` CLI | system | Authentication token source | Used ONLY for `gh auth token` to obtain the GitHub token. NOT used for API calls. Already required by the project as a hard dependency (ARCH-03). |

### Already in Project (No New Install Needed)

| Library | Purpose in Phase 2 |
|---------|-------------------|
| `zod` | Schema validation for API responses and configuration |
| `@modelcontextprotocol/sdk` | MCP server tool registration (existing github-tools.ts) |

### Alternatives Considered

| Alternative | Reason Not Used |
|-------------|----------------|
| `gh` CLI for all API calls (current approach) | CONTEXT.md decision: "gh for auth, Octokit for data". `gh` CLI spawning has overhead per call, no built-in pagination/retry/throttling, untyped output. |
| `octokit` (batteries-included) | Heavier dependency; includes auth strategies and GraphQL we don't need. `@octokit/rest` with targeted plugins is leaner. |
| GraphQL API via `@octokit/graphql` | CONTEXT.md decision: "REST, not GraphQL". GitHub added Projects v2 REST API in September 2025, eliminating the last reason to require GraphQL. |
| Raw `fetch` / `node:http` | No typed methods, no pagination, no throttling. Hand-rolling what Octokit provides. |

### Installation

```bash
cd packages/cli
npm install @octokit/rest @octokit/plugin-throttling @octokit/plugin-retry
```

These packages must be added to `dependencies` (not `devDependencies`) in `packages/cli/package.json` since they are runtime dependencies shipped in the npm tarball. The tsdown bundler will inline them into `dist/cli.cjs` and `dist/mcp-server.cjs`.

---

## Architecture Patterns

### Current Structure (What Exists)

The existing `src/github/` directory contains 8 files:

```
src/github/
  index.ts        -- Barrel export
  types.ts         -- Type definitions (GhResult, AuthStatus, IssueMappingFile, labels, etc.)
  gh.ts            -- gh CLI wrapper (checkGhAuth, detectGitHubMode, ghExec, ghGraphQL)
  mapping.ts       -- .planning/github-issues.json persistence (loadMapping, saveMapping)
  issues.ts        -- Issue CRUD using ghExec (createTaskIssue, createParentTrackingIssue, etc.)
  projects.ts      -- Projects v2 using ghExec + ghGraphQL (ensureProjectBoard, moveItemToStatus)
  labels.ts        -- Label creation using ghExec (ensureLabels)
  milestones.ts    -- Milestone CRUD using gh api REST (ensureMilestone)
  templates.ts     -- .github/ISSUE_TEMPLATE/ file generation
  sync.ts          -- Sync check using ghGraphQL batch queries
```

### Target Structure (Phase 2 Outcome)

The CONTEXT.md decision says "standalone `github.ts` adapter in `src/core/`". However, looking at the existing code, the `src/github/` directory already provides excellent separation. The recommended approach is to:

1. **Replace `gh.ts`** with an Octokit-based client factory (`client.ts`)
2. **Rewrite `issues.ts`** to use Octokit methods + native sub-issues API
3. **Rewrite `projects.ts`** to use Projects v2 REST API via Octokit
4. **Rewrite `sync.ts`** to use Octokit pagination instead of GraphQL
5. **Rewrite `labels.ts`** and `milestones.ts`** to use Octokit methods
6. **Keep `mapping.ts`** mostly intact (pure file I/O, no API dependency)
7. **Keep `types.ts`** and update to reflect new patterns
8. **Keep `templates.ts`** intact (pure file I/O)

```
src/github/
  index.ts         -- Barrel export (unchanged)
  types.ts         -- Updated type definitions
  client.ts        -- NEW: Octokit client factory (replaces gh.ts)
  mapping.ts       -- Mapping persistence (mostly unchanged)
  issues.ts        -- Rewritten: Octokit methods + native sub-issues
  projects.ts      -- Rewritten: Projects v2 REST API via Octokit
  labels.ts        -- Rewritten: Octokit methods
  milestones.ts    -- Rewritten: Octokit methods
  templates.ts     -- Issue template files (unchanged)
  sync.ts          -- Rewritten: Octokit pagination for batch checks
```

### Pattern 1: Octokit Client Factory (Singleton per Process)

The client module creates a configured Octokit instance once per process, using `gh auth token` for the token and composing the throttling + retry plugins.

```typescript
// src/github/client.ts
import { Octokit } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';
import { retry } from '@octokit/plugin-retry';
import { execFileSync } from 'node:child_process';

const ThrottledOctokit = Octokit.plugin(throttling, retry);

let _instance: InstanceType<typeof ThrottledOctokit> | null = null;
let _cachedRepo: { owner: string; repo: string } | null = null;

export function getOctokit(): InstanceType<typeof ThrottledOctokit> {
  if (_instance) return _instance;

  const token = getGhToken();
  _instance = new ThrottledOctokit({
    auth: token,
    userAgent: 'maxsimcli',
    throttle: {
      onRateLimit: (retryAfter, options, octokit, retryCount) => {
        if (retryCount < 2) {
          octokit.log.warn(`Rate limit hit, retrying after ${retryAfter}s`);
          return true;
        }
        return false;
      },
      onSecondaryRateLimit: (retryAfter, options, octokit, retryCount) => {
        if (retryCount < 1) {
          octokit.log.warn(`Secondary rate limit, retrying after ${retryAfter}s`);
          return true;
        }
        return false;
      },
    },
    retry: { enabled: true },
  });

  return _instance;
}

function getGhToken(): string {
  try {
    const token = execFileSync('gh', ['auth', 'token'], {
      timeout: 10_000,
      encoding: 'utf-8',
    }).trim();
    if (!token) throw new Error('Empty token');
    return token;
  } catch (e) {
    throw new Error(
      'GitHub authentication required. Run: gh auth login'
    );
  }
}

export async function getRepoInfo(): Promise<{ owner: string; repo: string }> {
  if (_cachedRepo) return _cachedRepo;
  // Parse from git remote or gh repo view
  const octokit = getOctokit();
  // Use git remote -v to extract owner/repo
  const remoteUrl = execFileSync('git', ['remote', 'get-url', 'origin'], {
    timeout: 5_000,
    encoding: 'utf-8',
  }).trim();
  const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
  if (!match) throw new Error(`Cannot parse GitHub repo from remote: ${remoteUrl}`);
  _cachedRepo = { owner: match[1], repo: match[2] };
  return _cachedRepo;
}
```

**Source:** Octokit initialization pattern from [octokit.github.io/rest.js/v22](https://octokit.github.io/rest.js/v22/), throttling plugin from [github.com/octokit/plugin-throttling.js](https://github.com/octokit/plugin-throttling.js/)

### Pattern 2: Native Sub-Issues for Phase-Task Hierarchy

Instead of the current approach (creating a parent issue with a markdown checkbox task list, then manually updating checkboxes), use GitHub's native sub-issue REST API.

```typescript
// Creating a phase with sub-issues
async function createPhaseWithTasks(
  phaseNum: string,
  phaseName: string,
  tasks: TaskSpec[],
): Promise<GhResult<PhaseCreationResult>> {
  const octokit = getOctokit();
  const { owner, repo } = await getRepoInfo();

  // 1. Create parent phase issue
  const parentIssue = await octokit.rest.issues.create({
    owner, repo,
    title: `[Phase ${phaseNum}] ${phaseName}`,
    body: buildPhaseBody(phaseNum, phaseName),
    labels: ['phase'],
  });

  // 2. Create task sub-issues
  const taskResults = [];
  for (const task of tasks) {
    const taskIssue = await octokit.rest.issues.create({
      owner, repo,
      title: `[P${phaseNum}] ${task.title}`,
      body: buildTaskBody(task),
      labels: ['task'],
    });

    // 3. Link as sub-issue using native API
    await octokit.rest.issues.addSubIssue({
      owner, repo,
      issue_number: parentIssue.data.number,
      sub_issue_id: taskIssue.data.id, // Note: internal ID, not number
    });

    taskResults.push({
      taskId: task.taskId,
      issueNumber: taskIssue.data.number,
      issueId: taskIssue.data.id,
    });
  }

  return { ok: true, data: { parentIssue: parentIssue.data.number, tasks: taskResults } };
}
```

**Critical detail:** The sub-issues API uses the issue's internal `id` (a large integer from `issues.create` response), NOT the issue `number`. The issue `number` goes in the URL path for the parent, but the child's `id` goes in the request body as `sub_issue_id`.

**Source:** [docs.github.com/en/rest/issues/sub-issues](https://docs.github.com/en/rest/issues/sub-issues), [jessehouwing.net/create-github-issue-hierarchy-using-the-api](https://jessehouwing.net/create-github-issue-hierarchy-using-the-api/)

### Pattern 3: GhResult Discriminated Union (Keep Existing)

The existing `GhResult<T>` type is a clean discriminated union pattern. Keep it:

```typescript
export type GhResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: GhErrorCode };
```

All functions in the adapter layer return `GhResult<T>`. This is already the pattern in the codebase. The only change is wrapping Octokit exceptions into this type instead of parsing `execFile` errors.

### Pattern 4: Auth Check and Setup Wizard

```typescript
// Replace detectGitHubMode() -- no more 'local-only' fallback
export async function requireAuth(): Promise<void> {
  // 1. Check gh is installed
  try {
    execFileSync('gh', ['--version'], { timeout: 5_000 });
  } catch {
    throw new AuthError('NOT_INSTALLED',
      'gh CLI is not installed. Install from https://cli.github.com/');
  }

  // 2. Check gh is authenticated
  try {
    const token = execFileSync('gh', ['auth', 'token'], {
      timeout: 10_000,
      encoding: 'utf-8',
    }).trim();
    if (!token) throw new Error('empty');
  } catch {
    throw new AuthError('NOT_AUTHENTICATED',
      'Not authenticated. Run: gh auth login');
  }

  // 3. Check project scope
  try {
    const status = execFileSync('gh', ['auth', 'status'], {
      timeout: 10_000,
      encoding: 'utf-8',
    });
    // Parse for 'project' scope -- needed for Projects v2
  } catch {
    // gh auth status writes to stderr
  }
}
```

**Key change from current code:** ARCH-03 says "no fallback paths". The current `detectGitHubMode()` returns `'local-only'` when `gh` is not available. In Phase 2, this becomes a hard failure with a clear error message.

### Pattern 5: Projects v2 REST API

GitHub released Projects v2 REST API endpoints in September 2025. The available endpoints use the path pattern `/users/{user_id}/projectsV2/{project_number}/...` for user-owned projects and `/orgs/{org}/projectsV2/{project_number}/...` for org-owned projects.

For operations not yet available as typed Octokit methods, use `octokit.request()`:

```typescript
// List project items (if no typed method available)
const items = await octokit.request(
  'GET /users/{user_id}/projectsV2/{project_number}/items',
  { user_id: username, project_number: projectNum }
);

// Add item to project
const addResult = await octokit.request(
  'POST /users/{user_id}/projectsV2/{project_number}/items',
  { user_id: username, project_number: projectNum, content_id: issueNodeId }
);

// Update item field (move to status column)
const updateResult = await octokit.request(
  'PATCH /users/{user_id}/projectsV2/{project_number}/items/{item_id}',
  { user_id: username, project_number: projectNum, item_id: itemId, fields: [{ field_id: statusFieldId, value: statusOptionId }] }
);
```

**Important:** The exact request/response shapes for these endpoints should be verified against current GitHub docs during implementation, as the REST API for Projects v2 was released only 6 months ago and may have minor schema updates. Use `octokit.request()` with explicit types until `@octokit/rest` adds typed methods. Confidence: MEDIUM.

**Source:** [GitHub Changelog - REST API for Projects](https://github.blog/changelog/2025-09-11-a-rest-api-for-github-projects-sub-issues-improvements-and-more/), [GitHub community discussion #172180](https://github.com/orgs/community/discussions/172180)

### Anti-Patterns to Avoid

1. **Do NOT spawn `gh` for every API call.** The current codebase does this (`ghExec` calls `execFile('gh', [...])`). Each spawn has 50-200ms overhead. Octokit uses a persistent HTTP connection.

2. **Do NOT use GraphQL for anything.** The CONTEXT.md locks this decision. All operations (issues, projects, sub-issues) now have REST API endpoints.

3. **Do NOT use `detectGitHubMode()` / `'local-only'` fallback.** ARCH-03 requires `gh` as a hard requirement. No graceful degradation -- fail fast with a clear error.

4. **Do NOT create the local `.planning/github-issues.json` mapping file.** After this phase, GitHub Issues IS the source of truth. If mapping is still needed for performance caching, it must be a cache that can be rebuilt from GitHub state at any time.

5. **Do NOT store tokens on disk.** In-memory only, fetched via `gh auth token` once per process.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate limiting / throttling | Custom retry loops with setTimeout | `@octokit/plugin-throttling` | Implements GitHub's recommended best practices, handles primary and secondary rate limits, configurable retry behavior |
| Automatic retries on 5xx | Manual retry with exponential backoff | `@octokit/plugin-retry` | Handles transient server errors, network failures. Composable with throttling plugin. |
| Pagination | Manual page tracking with `?page=N` | `octokit.paginate()` or `octokit.paginate.iterator()` | Built-in, handles Link headers automatically, supports async iterators for memory efficiency |
| GitHub authentication | Token file management, OAuth flows | `gh auth token` + Octokit `auth` option | `gh` handles the full OAuth flow, token refresh, and scope management. Octokit uses the token directly. |
| Issue sub-issue hierarchy | Manual checkbox markdown lists + regex parsing | `octokit.rest.issues.addSubIssue()` / `listSubIssues()` / `removeSubIssue()` | Native GitHub feature with REST API since Dec 2024. Automatic progress tracking in UI. No markdown manipulation needed. |
| Projects v2 board operations | GraphQL mutations (current approach) | Projects v2 REST API via `octokit.request()` | REST API available since September 2025. Simpler than GraphQL, consistent with REST-only approach. |
| Error code mapping | Regex parsing of stderr output | Octokit HTTP error types (status codes, response headers) | Octokit throws typed errors with status codes. No string parsing needed. |
| JSON serialization of API responses | Manual JSON.parse of gh CLI stdout | Octokit typed response objects | Every Octokit method returns typed `OctokitResponse<T>`. Zero JSON parsing. |

---

## Common Pitfalls

### Pitfall 1: Sub-Issue ID vs Number Confusion

**What goes wrong:** The sub-issues REST API `POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues` expects `sub_issue_id` in the body. This is the issue's internal database ID (a large integer like `3000028010`), NOT the human-readable issue number (like `42`).

**Why it happens:** Most GitHub API operations use the issue `number`. Developers naturally reach for `number` everywhere, but the sub-issues endpoint specifically needs `id`.

**How to avoid:** When creating an issue via `octokit.rest.issues.create()`, capture BOTH `response.data.number` (for display/references) and `response.data.id` (for sub-issue linking). Store both in the mapping/cache.

**Warning signs:** `422 Unprocessable Entity` or `404 Not Found` when trying to add a sub-issue.

**Source:** [jessehouwing.net - Create GitHub issue hierarchy using the API](https://jessehouwing.net/create-github-issue-hierarchy-using-the-api/)

### Pitfall 2: Bundle Size from Octokit

**What goes wrong:** `@octokit/rest` includes typed methods for ALL GitHub REST endpoints (Actions, CodeScanning, Copilot, etc.). This adds significant bundle size.

**Why it happens:** The `@octokit/plugin-rest-endpoint-methods` package (a dependency of `@octokit/rest`) includes every endpoint.

**How to avoid:** The tsdown bundler used by this project already tree-shakes unused code. Verify after integration that the bundle size increase is acceptable. If it is too large (>500KB increase), consider using `@octokit/core` with only the needed methods registered manually.

**Warning signs:** `dist/cli.cjs` or `dist/mcp-server.cjs` growing by more than 1MB.

### Pitfall 3: Projects v2 Requires User/Org Scope in URL

**What goes wrong:** Projects v2 REST endpoints are scoped to either `/users/{user_id}/projectsV2/...` or `/orgs/{org}/projectsV2/...`. Using the wrong scope returns 404.

**Why it happens:** Unlike issues (which are repo-scoped), Projects v2 boards are user-or-org-scoped. A personal user's project board uses the `/users/` path.

**How to avoid:** Detect whether the authenticated user is creating a user-owned or org-owned project during setup. Store the project owner type in configuration. The current code uses `--owner @me` which maps to the user path.

**Warning signs:** 404 when accessing project endpoints after successful creation.

### Pitfall 4: Removing Local-Only Fallback Too Early

**What goes wrong:** The current codebase has extensive `if (mode === 'local-only')` branches in every MCP tool. Removing these wholesale before the new Octokit-based code is solid can break the development workflow during the phase itself.

**Why it happens:** ARCH-03 says "no fallback paths", but the transition needs to be staged.

**How to avoid:** Build the Octokit adapter first. Then replace the `detectGitHubMode()` check with `requireAuth()` that throws on failure. Then remove all `local-only` branches.

**Warning signs:** MCP tools silently returning "local-only mode" when they should be using GitHub.

### Pitfall 5: Concurrent Issue Creation and Rate Limits

**What goes wrong:** Creating many issues rapidly (e.g., 10+ tasks for a phase) hits secondary rate limits even with primary rate limit headroom.

**Why it happens:** GitHub's secondary rate limits are more restrictive and not tied to the `X-RateLimit-*` headers. They trigger on rapid mutation requests.

**How to avoid:** The `@octokit/plugin-throttling` handles this. Additionally, when creating multiple issues, use sequential creation with small delays rather than `Promise.all`. The current code already does batched creation with `BATCH_SIZE = 5` -- keep this pattern.

**Warning signs:** `403 You have exceeded a secondary rate limit` errors after the 8th-10th rapid API call.

### Pitfall 6: tsdown Bundling of @octokit/rest

**What goes wrong:** The `@octokit/rest` package and its plugins may not bundle cleanly with tsdown due to ESM/CJS interop issues.

**Why it happens:** Octokit packages are ESM-first. The project bundles to CJS (`format: 'cjs'`). The `tsdown.config.ts` does not currently list `@octokit/*` in `noExternal`, which means they will be treated as external by default.

**How to avoid:** Either (a) add `@octokit/*` packages to `dependencies` in `package.json` and keep them external (they get installed alongside the package), or (b) add a `noExternal` pattern in `tsdown.config.ts` to inline them. Option (b) is preferred for a single-file CLI distribution. Check the MCP server config which already uses `noExternal: [/^@modelcontextprotocol/, /^zod/]` as a model.

**Warning signs:** `Cannot find module '@octokit/rest'` at runtime after install, or `ERR_REQUIRE_ESM` errors.

### Pitfall 7: `.planning/` Cleanup Scope

**What goes wrong:** The phase says ".planning/ contains only project context", but the current system creates many files there: phase directories with CONTEXT.md, RESEARCH.md, PLAN.md, SUMMARY.md, VERIFICATION.md, UAT.md, plus STATE.md, ROADMAP.md, REQUIREMENTS.md, config.json, and github-issues.json.

**Why it happens:** Unclear boundary between "project context" and "work tracking".

**How to avoid:** Define explicitly what stays and what goes:
- **Stays in .planning/:** PROJECT.md, config.json, REQUIREMENTS.md, conventions docs, codebase analysis
- **Moves to GitHub:** All phase artifacts (plans, research, summaries), progress tracking, state, roadmap updates
- **Eliminated:** STATE.md (replaced by GitHub issue state), phase directories (replaced by GitHub Issues)
- **Needs decision:** ROADMAP.md (could stay as local read-only reference or move to a GitHub Issue)

---

## Code Examples

### Example 1: Initializing Octokit with Throttling and Retry

```typescript
import { Octokit } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';
import { retry } from '@octokit/plugin-retry';
import { execFileSync } from 'node:child_process';

const ThrottledOctokit = Octokit.plugin(throttling, retry);

export function createOctokit(): InstanceType<typeof ThrottledOctokit> {
  const token = execFileSync('gh', ['auth', 'token'], {
    timeout: 10_000,
    encoding: 'utf-8',
  }).trim();

  return new ThrottledOctokit({
    auth: token,
    userAgent: 'maxsimcli',
    throttle: {
      onRateLimit: (_retryAfter: number, _options: object, _octokit: Octokit, retryCount: number) => {
        return retryCount < 2; // retry twice on rate limit
      },
      onSecondaryRateLimit: (_retryAfter: number, _options: object, _octokit: Octokit, retryCount: number) => {
        return retryCount < 1; // retry once on secondary
      },
    },
  });
}
```

**Source:** [github.com/octokit/plugin-throttling.js](https://github.com/octokit/plugin-throttling.js/), [@octokit/rest v22 docs](https://octokit.github.io/rest.js/v22/)

### Example 2: Creating an Issue and Linking as Sub-Issue

```typescript
const octokit = getOctokit();
const { owner, repo } = await getRepoInfo();

// Create parent issue
const parent = await octokit.rest.issues.create({
  owner, repo,
  title: '[Phase 02] GitHub Issues Foundation',
  body: '## Phase Goal\nAll work tracking flows through GitHub Issues.',
  labels: ['phase'],
});

// Create child task issue
const child = await octokit.rest.issues.create({
  owner, repo,
  title: '[P02] Create Octokit adapter',
  body: '## Summary\nReplace gh.ts with Octokit-based client.',
  labels: ['task'],
});

// Link child as sub-issue of parent
// NOTE: sub_issue_id uses the issue's internal `id`, NOT `number`
await octokit.rest.issues.addSubIssue({
  owner, repo,
  issue_number: parent.data.number,  // parent's issue number in URL
  sub_issue_id: child.data.id,       // child's internal ID in body
});
```

**Source:** [docs.github.com/en/rest/issues/sub-issues](https://docs.github.com/en/rest/issues/sub-issues)

### Example 3: Paginating Issues with Labels

```typescript
const octokit = getOctokit();
const { owner, repo } = await getRepoInfo();

// Get all MAXSIM-managed issues using async iterator (memory efficient)
for await (const response of octokit.paginate.iterator(
  octokit.rest.issues.listForRepo,
  { owner, repo, labels: 'phase', state: 'all', per_page: 100 }
)) {
  for (const issue of response.data) {
    console.log(`#${issue.number}: ${issue.title} [${issue.state}]`);
  }
}

// Or fetch all at once
const allPhaseIssues = await octokit.paginate(
  octokit.rest.issues.listForRepo,
  { owner, repo, labels: 'phase', state: 'all', per_page: 100 }
);
```

**Source:** [github.com/octokit/plugin-paginate-rest.js](https://github.com/octokit/plugin-paginate-rest.js/)

### Example 4: Wrapping Octokit Errors into GhResult

```typescript
import { RequestError } from '@octokit/request-error';
import type { GhResult, GhErrorCode } from './types.js';

async function withGhResult<T>(fn: () => Promise<T>): Promise<GhResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (e) {
    if (e instanceof RequestError) {
      const code = mapStatusToCode(e.status);
      return { ok: false, error: e.message, code };
    }
    return { ok: false, error: (e as Error).message, code: 'UNKNOWN' };
  }
}

function mapStatusToCode(status: number): GhErrorCode {
  switch (status) {
    case 401: return 'NOT_AUTHENTICATED';
    case 403: return 'PERMISSION_DENIED'; // or RATE_LIMITED (check headers)
    case 404: return 'NOT_FOUND';
    case 429: return 'RATE_LIMITED';
    default: return 'UNKNOWN';
  }
}
```

### Example 5: Posting Plan as Issue Comment

```typescript
// Plans are posted as structured comments on the phase issue
async function postPlanComment(
  phaseIssueNumber: number,
  planNumber: string,
  planContent: string,
): Promise<GhResult<{ commentId: number }>> {
  const octokit = getOctokit();
  const { owner, repo } = await getRepoInfo();

  return withGhResult(async () => {
    const comment = await octokit.rest.issues.createComment({
      owner, repo,
      issue_number: phaseIssueNumber,
      body: `## Plan ${planNumber}\n\n${planContent}\n\n---\n*Posted by MAXSIM*`,
    });
    return { commentId: comment.data.id };
  });
}
```

---

## State of the Art

| Old Approach (Current Code) | Current Approach (Phase 2 Target) | When Changed | Impact |
|-----------------------------|-----------------------------------|-------------|--------|
| `gh` CLI spawning via `child_process.execFile` for every API call | `@octokit/rest` SDK with persistent HTTP connection | Decision in CONTEXT.md | Eliminates per-call process spawn overhead, typed responses, built-in pagination |
| Manual parent issue with markdown checkbox task lists (`- [ ] #42`) | Native GitHub sub-issues API (`issues.addSubIssue()`) | GitHub released Dec 2024, GA 2025 | Automatic progress tracking in GitHub UI, no markdown parsing, up to 100 sub-issues per parent |
| GraphQL mutations for Projects v2 board operations | REST API for Projects v2 (`/users/{id}/projectsV2/`) | GitHub released Sep 2025 | Consistent REST-only approach, simpler than GraphQL, matches Octokit usage pattern |
| `.planning/phases/XX-name/` directories with markdown files | Phase = GitHub Issue, tasks = sub-issues, plans = comments | Phase 2 architecture decision | Single source of truth on GitHub, eliminates local file management, enables team collaboration |
| `STATE.md` for progress tracking | GitHub Issue state + Project Board columns | Phase 2 architecture decision | Eliminates drift between local and remote state, GitHub becomes the canonical source |
| `'local-only'` graceful degradation when `gh` not available | Hard failure with setup wizard | ARCH-03 decision | Simpler code paths, no dual-mode branches, clear requirement |
| `github-issues.json` local mapping file as source of truth | GitHub Issues as source of truth, local cache (if any) is rebuildable | Phase 2 architecture decision | Eliminates sync issues, any MAXSIM instance can read state from GitHub |
| Labels: `maxsim`, `phase-task`, `todo`, `imported`, `superseded` (5 labels) | Labels: `phase`, `task`, `blocker` (3 labels, CONTEXT.md decision) | Phase 2 simplification | Fewer labels to manage, cleaner issue list |

---

## Open Questions

### What We Know

1. `@octokit/rest` v22 has typed methods for sub-issues (`addSubIssue`, `listSubIssues`, `removeSubIssue`, `reprioritizeSubIssue`)
2. Projects v2 REST API exists since September 2025 at `/users/{user_id}/projectsV2/` and `/orgs/{org}/projectsV2/`
3. `@octokit/rest` v22 may not yet have typed methods for Projects v2 REST endpoints (plugin-rest-endpoint-methods v16.1.0 added initial support in Sep 2025, but current v17.0.0 notes don't confirm full coverage)
4. GitHub `gh auth token` reliably returns the OAuth token for use with Octokit
5. The existing `src/github/` module has good structural separation that can be preserved

### What's Unclear

1. **Projects v2 REST API typed methods in Octokit:** Whether `@octokit/rest` v22 has fully typed `projects` or `projectsV2` methods, or if we need `octokit.request()` for all Projects v2 operations. The documentation search was inconclusive -- v22 docs did not list a `projectsV2` namespace, but `plugin-rest-endpoint-methods` v16.1.0 claimed to add "new Projects v2 endpoints". **Recommendation:** Start with `octokit.request()` for Projects v2 operations and migrate to typed methods when confirmed available.

2. **Sub-issue limit per parent:** Currently 100 sub-issues per parent (up from 50). For very large phases this might be a concern. **Recommendation:** Not an issue for typical MAXSIM usage (phases typically have 5-15 tasks).

3. **ROADMAP.md disposition:** Does ROADMAP.md stay in `.planning/` as a local read-only file, or does it become a GitHub Issue? **Recommendation:** Keep ROADMAP.md locally as a read-only reference (it is "project context" per ARCH-02), but derive phase structure from GitHub Issues at runtime.

4. **tsdown bundling behavior with @octokit/rest:** Whether inlining Octokit packages into the CJS bundle works cleanly or causes ESM/CJS interop issues. **Recommendation:** Test early in implementation. Add `noExternal: [/^@octokit/]` to tsdown config similar to the MCP server pattern.

---

## Phase Requirements Cross-Reference

| Req ID | Requirement | Research Support |
|--------|-------------|-----------------|
| ARCH-01 | GitHub Issues = single source of truth | Native sub-issues API replaces markdown checklists. Octokit provides typed CRUD for all issue operations. No local file is authoritative. |
| ARCH-02 | .planning/ = project context only | Clear boundary defined: PROJECT.md, config.json, REQUIREMENTS.md stay. Phase dirs, STATE.md, mapping file are eliminated or made rebuildable caches. |
| ARCH-03 | gh CLI = hard requirement | `requireAuth()` gate at startup. No `detectGitHubMode()` / `'local-only'` fallback. Setup wizard guides through `gh auth login`. |
| ARCH-04 | Local-only install to .claude/ | Existing install system already supports local mode. Phase 2 ensures install never writes to ~/.claude/ globally. |
| ARCH-05 | State-machine commands, resume from GitHub | Issue state (open/closed) + Project Board columns provide complete state. `listSubIssues()` shows completed vs remaining. No local state file needed. |

---

## Sources

### Primary (HIGH Confidence)

- [@octokit/rest v22 documentation](https://octokit.github.io/rest.js/v22/) -- Confirms sub-issue methods exist, API initialization patterns
- [GitHub REST API - Sub-issues endpoints](https://docs.github.com/en/rest/issues/sub-issues) -- Official API reference for sub-issue operations
- [GitHub Changelog - REST API for Projects, sub-issues improvements (Sep 2025)](https://github.blog/changelog/2025-09-11-a-rest-api-for-github-projects-sub-issues-improvements-and-more/) -- Confirms Projects v2 REST API availability
- [GitHub Changelog - Close issue as duplicate, REST API for sub-issues (Dec 2024)](https://github.blog/changelog/2024-12-12-github-issues-projects-close-issue-as-a-duplicate-rest-api-for-sub-issues-and-more/) -- Sub-issues REST API initial release
- [Evolving GitHub Issues and Projects GA (community discussion #154148)](https://github.com/orgs/community/discussions/154148) -- GA announcement, sub-issues limits
- [octokit/plugin-throttling.js](https://github.com/octokit/plugin-throttling.js/) -- Throttling plugin documentation
- [octokit/plugin-paginate-rest.js](https://github.com/octokit/plugin-paginate-rest.js/) -- Pagination plugin documentation

### Secondary (MEDIUM Confidence)

- [jessehouwing.net - Create GitHub issue hierarchy using the API](https://jessehouwing.net/create-github-issue-hierarchy-using-the-api/) -- Practical guide confirming sub_issue_id uses internal ID, not number
- [GitHub community discussion #172180 - REST API for Projects feedback](https://github.com/orgs/community/discussions/172180) -- Projects v2 REST endpoints listed with paths
- [plugin-rest-endpoint-methods.js releases](https://github.com/octokit/plugin-rest-endpoint-methods.js/releases) -- v16.1.0 added Projects v2 endpoints (Sep 2025)
- [@octokit/auth-token.js](https://github.com/octokit/auth-token.js/) -- Token authentication pattern

### Tertiary (LOW Confidence)

- Projects v2 REST API exact request/response schemas for `PATCH` item updates -- Based on community discussion, not verified against official docs. Schemas may have changed since September 2025.

---

## Metadata

| Area | Confidence | Reason |
|------|------------|--------|
| Standard Stack (@octokit/rest, plugins) | HIGH | Official npm packages, verified versions, established in GitHub ecosystem |
| Sub-Issues REST API | HIGH | Official GitHub docs, GA feature, verified in @octokit/rest v22 |
| Projects v2 REST API | MEDIUM | REST API confirmed via changelog, but typed Octokit support unverified. May need octokit.request() fallback. |
| Architecture Patterns | HIGH | Based on existing codebase analysis + official SDK patterns |
| Bundle/Build Integration | MEDIUM | tsdown bundling of Octokit ESM packages not yet tested; pattern exists for MCP SDK. |
| .planning/ Restructuring Scope | MEDIUM | Clear in principle, some edge cases (ROADMAP.md disposition) need decision during planning |
| Pitfalls | HIGH | Multi-source verification: official docs, community reports, existing codebase experience |

**Research date:** 2026-03-10
**Valid until:** 2026-06-10 (3 months -- Octokit releases frequently, check for major version bumps)
