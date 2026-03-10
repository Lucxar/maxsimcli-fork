# Phase 6: Hook System - Research

**Researched:** 2026-03-10
**Domain:** Claude Code hooks, statusline, installer lifecycle
**Confidence:** HIGH

## Summary

Phase 6 covers four hook requirements: redesigning the statusline (HOOK-01), adding a GitHub sync reminder (HOOK-02), simplifying the update checker (HOOK-03), and fully removing the context monitor (HOOK-04). The scope is well-bounded: all four hooks are compiled TypeScript files in `packages/cli/src/hooks/`, bundled by tsdown into `dist/assets/hooks/*.cjs`, copied to `.claude/hooks/` at install time, and registered in `.claude/settings.json` by the installer (`packages/cli/src/install/hooks.ts`).

The Claude Code hooks API is mature and well-documented. The statusline is a separate mechanism (`statusLine` key in settings.json) that receives rich JSON session data on stdin (model, context window, cost, workspace, worktree, session_id). PostToolUse hooks receive `tool_name`, `tool_input`, and `tool_response` on stdin and can return `additionalContext` via JSON stdout. SessionStart hooks run once per session start/resume and support a background `async` flag -- but SessionStart only supports `type: "command"`, not async. The existing update checker already uses a detached background spawn pattern, which is the correct approach.

**Primary recommendation:** Implement all four hooks in a single pass: rewrite statusline to use `gh api` for phase/milestone data (with caching), add new sync-reminder PostToolUse hook with mtime-based detection, keep update checker mostly as-is with backup logic for the update flow, and systematically remove all context monitor references across source, build config, installer, uninstaller, orphan list, tests, and settings registration.

## User Constraints

### Locked Decisions (from CONTEXT.md)

**Statusline redesign (HOOK-01):**
- Remove context usage bar entirely (Claude Code handles context natively)
- Remove task display (in-progress todo from agent files) -- phase + milestone is enough
- Remove bridge file writing (`claude-ctx-{session}.json`) -- no consumer
- Add phase number + milestone progress: format `P6 | v5.0: 83%`
- Source phase/progress data via direct `gh` API call (non-blocking, acceptable latency)
- When no MAXSIM project detected (no `.planning/`): show model + directory + update indicator only
- Final format with project: `[update] model | P{N} | v{M}: {pct}% | dirname`
- Final format without project: `[update] model | dirname`

**GitHub sync reminder (HOOK-02):**
- PostToolUse hook -- entirely new
- Trigger on any `.planning/` file write, detected via filesystem mtime comparison
- Snapshot `.planning/` file mtimes to a temp file; on next PostToolUse fire, compare to detect changes
- Debounced: remind after first detection, then wait N tool calls before reminding again
- Message tone: gentle nudge -- informational, not urgent
- Example: ".planning/ files changed locally. Consider syncing to GitHub Issues when ready."

**Update checker (HOOK-03):**
- Notify only -- do not auto-update; user runs `npx maxsimcli@latest` manually
- Keep background spawn approach (detached Node process, non-blocking)
- Show update indicator in statusline (existing behavior, keep)
- Update flow when user triggers: replace all files + create backup of previous version first
- Backup location: `.claude/maxsim-backup/` (before overwrite)

**Context monitor removal (HOOK-04):**
- Delete `maxsim-context-monitor.ts` source file
- Remove bridge file writing from statusline (the `claude-ctx-{session}.json` temp file logic)
- Add cleanup logic: on session start or install, clean up any `claude-ctx-*.json` files from temp dir
- Remove from installer hook registration in `install.ts`
- Add context monitor hook file to orphan cleanup list so existing installs get cleaned up
- Remove all references from templates and install

### Claude's Discretion

- Exact debounce interval (N tool calls) for sync reminder
- Mtime snapshot format and comparison implementation
- Statusline `gh` API call specifics (which endpoint, response parsing)
- Backup directory structure and naming
- Temp file cleanup implementation (glob pattern, deletion strategy)

### Deferred Ideas

None -- discussion stayed within phase scope.

## Phase Requirements

| Req ID | Description | Research Support |
|--------|-------------|-----------------|
| HOOK-01 | Statusline hook (keep, improve) | Statusline API documented, `gh api` for milestones verified, caching pattern designed |
| HOOK-02 | GitHub sync reminder hook (PostToolUse on .planning/ changes) | PostToolUse contract documented, mtime-based detection pattern designed |
| HOOK-03 | Update checker hook (local-only, simplified) | Existing implementation analyzed, backup flow designed |
| HOOK-04 | Remove context monitor hook | All 21 files with references identified, removal scope mapped |

## Standard Stack

### Core (no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|-------------|
| Node.js `fs` | built-in | File operations, mtime reading | Already used by all hooks |
| Node.js `os` | built-in | tmpdir, homedir | Already used by all hooks |
| Node.js `path` | built-in | Path manipulation | Already used by all hooks |
| Node.js `child_process` | built-in | Spawn `gh` CLI, background processes | Already used by update checker |
| `gh` CLI | system | GitHub API queries for milestone/phase data | Hard project requirement (ARCH-03) |

### Build Tools (existing)

| Tool | Purpose |
|------|---------|
| tsdown | Bundles each hook as standalone CJS (`dist/assets/hooks/*.cjs`) |
| Vitest | Unit tests (`pack.test.ts`) and E2E tests (`install.test.ts`) |

### No New Dependencies

All four hooks use only Node.js built-ins and the `gh` CLI (already a hard project requirement). No npm packages to add.

## Architecture Patterns

### Hook Compilation Pipeline

Each hook is a standalone TypeScript file that compiles to a self-contained CJS bundle:

```
src/hooks/maxsim-statusline.ts
  --> tsdown (hookShared config) -->
    dist/assets/hooks/maxsim-statusline.cjs
      --> install copies to -->
        .claude/hooks/maxsim-statusline.js
```

Build config in `tsdown.config.ts`:
```typescript
const hookShared = {
  format: 'cjs' as const,
  platform: 'node' as const,
  target: 'es2022' as const,
  sourcemap: true,
  tsconfig: 'tsconfig.json',
  external: [/^node:/],
  outDir: 'dist/assets/hooks',
  inlineOnly: false,
};
```

Each hook gets its own build entry. The new sync-reminder hook needs a new entry added.

### Hook Registration in settings.json

The installer (`src/install/hooks.ts`) writes hook registrations to `.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node .claude/hooks/maxsim-statusline.js"
  },
  "hooks": {
    "SessionStart": [
      {
        "hooks": [{ "type": "command", "command": "node .claude/hooks/maxsim-check-update.js" }]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [{ "type": "command", "command": "node .claude/hooks/maxsim-sync-reminder.js" }]
      }
    ]
  }
}
```

Key registration facts:
- Statusline uses the top-level `statusLine` key (NOT in `hooks`)
- SessionStart and PostToolUse use the `hooks` key with matcher groups
- The PostToolUse sync-reminder should match on `Write|Edit` (only file-write tools can modify `.planning/`)

### Statusline Input Schema (from Claude Code)

The statusline script receives this JSON on stdin:

```json
{
  "session_id": "abc123",
  "cwd": "/current/working/directory",
  "model": { "id": "claude-opus-4-6", "display_name": "Opus" },
  "workspace": { "current_dir": "/cwd", "project_dir": "/project/root" },
  "context_window": {
    "used_percentage": 8,
    "remaining_percentage": 92,
    "context_window_size": 200000
  },
  "cost": { "total_cost_usd": 0.01234 },
  "version": "1.0.80",
  "transcript_path": "/path/to/transcript.jsonl"
}
```

The statusline runs after each assistant message, debounced at 300ms. It does NOT receive `tool_name` or `tool_input` -- those are hook-specific fields.

### PostToolUse Input Schema (for sync reminder)

PostToolUse hooks receive:

```json
{
  "session_id": "abc123",
  "cwd": "/project/root",
  "hook_event_name": "PostToolUse",
  "tool_name": "Write",
  "tool_input": { "file_path": "/project/.planning/STATE.md", "content": "..." },
  "tool_response": { "filePath": "/project/.planning/STATE.md", "success": true }
}
```

The sync-reminder hook should use a `matcher: "Write|Edit"` to only fire on file-write tool uses, then check `tool_input.file_path` to see if it targets `.planning/`.

### PostToolUse Output Schema (for sync reminder)

To inject a gentle reminder into Claude's context:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": ".planning/ files changed locally. Consider syncing to GitHub Issues when ready."
  }
}
```

This uses `additionalContext` which adds context to Claude without blocking. Exit 0 with this JSON on stdout.

### Statusline Data Flow (new design)

```
  Claude Code
       |
       v (stdin JSON)
  maxsim-statusline.js
       |
       +-- Read model from stdin JSON
       +-- Read update cache file (.claude/cache/maxsim-update-check.json)
       +-- Read phase/milestone cache file (.claude/cache/maxsim-progress.json)
       |     |
       |     +-- If cache fresh (< 60s): use cached data
       |     +-- If cache stale: spawn background `gh api` call, use stale data
       |
       v (stdout text)
  "[update] model | P{N} | v{M}: {pct}% | dirname"
```

### gh API Call for Milestone Progress

Use the GitHub REST API milestones endpoint:

```bash
gh api repos/{owner}/{repo}/milestones --jq '.[] | {title, open_issues, closed_issues, state}'
```

Response fields per milestone:
- `title`: milestone name (e.g., "v5.0")
- `open_issues`: count of open issues
- `closed_issues`: count of closed issues
- `state`: "open" or "closed"

Progress percentage: `closed_issues / (open_issues + closed_issues) * 100`

For the current phase number, query open issues with the `phase:` label:

```bash
gh api repos/{owner}/{repo}/issues --jq '[.[] | select(.labels[].name | startswith("phase:"))] | first | .labels[] | select(.name | startswith("phase:")) | .name' -f state=open -f per_page=1 -f sort=created -f direction=desc
```

However, this is complex for a statusline that runs frequently. Better approach: cache the progress data to a file and refresh it in the background.

### Recommended Caching Strategy for Statusline

```typescript
interface ProgressCache {
  phase_number: string | null;    // e.g., "6"
  milestone_title: string | null; // e.g., "v5.0"
  milestone_pct: number;          // 0-100
  updated: number;                // epoch seconds
}
```

Cache file: `.claude/cache/maxsim-progress.json`
Cache TTL: 60 seconds (configurable)

On each statusline invocation:
1. Read cache file. If exists and age < TTL, use cached values.
2. If cache is stale or missing, spawn a background `gh api` call that writes a new cache file.
3. Display whatever data is available (stale is better than nothing).

The background process:
```typescript
const child = spawn(process.execPath, ['-e', `
  const { execSync } = require('child_process');
  const fs = require('fs');
  try {
    const milestones = JSON.parse(execSync('gh api repos/{owner}/{repo}/milestones --jq "."', { encoding: 'utf8', timeout: 10000 }));
    const active = milestones.find(m => m.state === 'open');
    // ... compute pct, write cache
  } catch {}
`], { stdio: 'ignore', detached: true, windowsHide: true });
child.unref();
```

### Mtime-Based Sync Reminder Pattern

```typescript
interface MtimeSnapshot {
  files: Record<string, number>;  // path -> mtime epoch ms
  updated: number;
}
```

Temp file: `${os.tmpdir()}/maxsim-planning-mtime-${session_id}.json`

On each PostToolUse `Write|Edit` invocation:
1. Check if `tool_input.file_path` contains `.planning/`
2. If no: exit 0 silently
3. If yes: load snapshot from temp file
4. If no snapshot: create initial snapshot, exit 0 (first time, no reminder)
5. If snapshot exists: compare current mtimes vs snapshot
6. If changes detected: check debounce counter
7. If debounce expired: emit reminder, reset counter
8. Update snapshot

Debounce: 10 tool calls (recommendation). After emitting a reminder, wait 10 more Write/Edit calls before reminding again. This prevents nagging during active work on .planning/ files.

### Orphan Cleanup Pattern for Context Monitor

Add to the `orphanedFiles` array in `src/install/hooks.ts`:

```typescript
// v5.x: Context monitor removal (Phase 6)
'hooks/maxsim-context-monitor.js',
```

Add to `orphanedHookPatterns` in `cleanupOrphanedHooks()`:

```typescript
'maxsim-context-monitor',
```

This ensures existing installs from v4.x/v5.0 get the context monitor hook file and settings registration cleaned up on next install.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GitHub API calls | Raw HTTP/fetch | `gh api` CLI command via `child_process` | `gh` handles auth, rate limits, pagination. Project hard requirement (ARCH-03) |
| JSON parsing from stdin | Custom stream reader | Existing `readStdinJson()` from `shared.ts` | Already battle-tested, handles errors silently |
| File system temp paths | Hardcoded paths | `os.tmpdir()` + session-scoped filenames | Cross-platform, auto-cleaned by OS |
| Background processes | `setTimeout` or `setInterval` | `spawn()` with `detached: true` + `child.unref()` | Existing pattern in update checker, non-blocking |
| Milestone progress % | Custom counting logic | GitHub REST API `open_issues` + `closed_issues` fields | Pre-aggregated by GitHub, single API call |

## Common Pitfalls

### Pitfall 1: Statusline blocking on gh API calls

**What goes wrong:** The statusline script makes a synchronous `gh api` call on every invocation, causing 1-3 second delays on each update.

**Why:** `gh api` makes an HTTP request to GitHub's API which has network latency. The statusline runs after every assistant message (debounced at 300ms).

**How to avoid:** Never call `gh` synchronously in the statusline. Use a cache file read (fast, <1ms) and spawn a background process to refresh the cache when stale. The statusline must return in under 100ms.

**Warning signs:** Visible lag in the status bar, complaints about slow Claude Code response.

### Pitfall 2: Forgetting to update tests when removing context monitor

**What goes wrong:** Build passes but E2E install tests fail because they still assert `maxsim-context-monitor.js` exists.

**Why:** Two test files explicitly check for the context monitor: `pack.test.ts` (line 13) and `install.test.ts` (line 103).

**How to avoid:** Updating tests is part of the removal task, not a separate task. Search for all references: `grep -r "context.monitor\|context-monitor\|contextMonitor\|claude-ctx" packages/cli/tests/`.

**Warning signs:** CI failures after pushing.

### Pitfall 3: PostToolUse matcher too broad for sync reminder

**What goes wrong:** The sync reminder fires on every tool use (Read, Glob, Grep, Bash, etc.), not just file writes, causing massive performance overhead.

**Why:** Omitting the `matcher` field means the hook fires on ALL tool uses. Most tool uses (Read, Grep, Glob) cannot modify `.planning/` files.

**How to avoid:** Use `matcher: "Write|Edit"` to only fire on file-write operations. The Bash tool could theoretically modify `.planning/` files, but matching on Bash would fire too frequently and is not worth the overhead.

**Warning signs:** Hook appearing in debug logs for every Read/Grep/Glob call.

### Pitfall 4: Orphan cleanup vs. uninstall scope confusion

**What goes wrong:** Context monitor removal works for new installs but leaves artifacts for users who already have it installed.

**Why:** The orphan cleanup list (`cleanupOrphanedFiles`) only runs during install. The uninstall function (`uninstall.ts`) has a separate list of MAXSIM hooks to clean.

**How to avoid:** Update both: (1) orphan cleanup list in `hooks.ts` for upgrade path, (2) hook list in `uninstall.ts` for clean uninstall, (3) `cleanupOrphanedHooks()` for settings.json registration cleanup.

**Warning signs:** Users reporting stale `maxsim-context-monitor.js` file after upgrading.

### Pitfall 5: Windows path handling in mtime comparison

**What goes wrong:** Mtime snapshot uses forward slashes but `tool_input.file_path` from Claude Code uses backslashes on Windows.

**Why:** Node.js on Windows returns backslashes from `path.join()`, but Claude Code may normalize to forward slashes in `tool_input.file_path`.

**How to avoid:** Normalize all paths with `path.normalize()` or compare using `path.resolve()` before storing or comparing mtimes.

**Warning signs:** Sync reminder never fires on Windows despite `.planning/` files being modified.

### Pitfall 6: gh CLI not available in statusline context

**What goes wrong:** The statusline crashes or hangs because `gh` is not installed or not authenticated.

**Why:** The statusline runs in every Claude Code session, not just MAXSIM sessions. Users may not have `gh` installed.

**How to avoid:** The background `gh api` call must silently fail -- write no cache file, and the statusline gracefully degrades to the no-project format (`[update] model | dirname`). Never let a `gh` failure break the statusline.

**Warning signs:** Statusline showing error text or going blank.

## Code Examples

### Statusline: Simplified format (HOOK-01)

Source: Based on existing `maxsim-statusline.ts` patterns + CONTEXT.md decisions.

```typescript
// New statusline output format
export function formatStatusline(data: StatuslineInput): string {
  const model = data.model?.display_name || 'Claude';
  const dir = data.workspace?.current_dir || process.cwd();
  const dirname = path.basename(dir);

  // Update indicator from cache
  let updateIndicator = '';
  const cacheFile = path.join(dir, CLAUDE_DIR, 'cache', 'maxsim-update-check.json');
  if (fs.existsSync(cacheFile)) {
    try {
      const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (cache.update_available) {
        updateIndicator = '\x1b[33m\u2B06\x1b[0m ';
      }
    } catch {}
  }

  // Phase/milestone from progress cache
  const progressFile = path.join(dir, CLAUDE_DIR, 'cache', 'maxsim-progress.json');
  let phaseSegment = '';
  if (fs.existsSync(progressFile)) {
    try {
      const progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
      if (progress.phase_number) {
        phaseSegment = ` \u2502 P${progress.phase_number}`;
      }
      if (progress.milestone_title && progress.milestone_pct != null) {
        phaseSegment += ` \u2502 ${progress.milestone_title}: ${progress.milestone_pct}%`;
      }
    } catch {}
  }

  // Check for MAXSIM project
  const planningDir = path.join(dir, '.planning');
  if (fs.existsSync(planningDir)) {
    // With project: [update] model | P{N} | v{M}: {pct}% | dirname
    return `${updateIndicator}\x1b[2m${model}\x1b[0m${phaseSegment} \u2502 \x1b[2m${dirname}\x1b[0m`;
  } else {
    // Without project: [update] model | dirname
    return `${updateIndicator}\x1b[2m${model}\x1b[0m \u2502 \x1b[2m${dirname}\x1b[0m`;
  }
}
```

### Sync Reminder: PostToolUse hook (HOOK-02)

Source: Based on existing `maxsim-context-monitor.ts` debounce pattern + CONTEXT.md decisions.

```typescript
const DEBOUNCE_CALLS = 10;

export function processSyncReminder(data: SyncReminderInput): SyncReminderOutput | null {
  const sessionId = data.session_id;
  if (!sessionId) return null;

  // Only trigger on .planning/ file writes
  const filePath = data.tool_input?.file_path;
  if (!filePath || !path.normalize(filePath).includes('.planning')) return null;

  const tmpDir = os.tmpdir();
  const statePath = path.join(tmpDir, `maxsim-sync-${sessionId}.json`);

  let state: { callsSinceRemind: number; reminded: boolean } = {
    callsSinceRemind: 0,
    reminded: false,
  };

  if (fs.existsSync(statePath)) {
    try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch {}
  }

  state.callsSinceRemind++;

  // First detection or debounce expired
  if (!state.reminded || state.callsSinceRemind >= DEBOUNCE_CALLS) {
    state.callsSinceRemind = 0;
    state.reminded = true;
    fs.writeFileSync(statePath, JSON.stringify(state));
    return {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext:
          '.planning/ files changed locally. Consider syncing to GitHub Issues when ready.',
      },
    };
  }

  fs.writeFileSync(statePath, JSON.stringify(state));
  return null;
}
```

### Context Monitor Cleanup: Temp file removal

Source: CONTEXT.md decision on cleanup logic.

```typescript
// Add to SessionStart or install: clean up orphaned bridge files
function cleanupContextBridgeFiles(): void {
  const tmpDir = os.tmpdir();
  try {
    const files = fs.readdirSync(tmpDir);
    for (const file of files) {
      if (file.startsWith('claude-ctx-') && file.endsWith('.json')) {
        try { fs.unlinkSync(path.join(tmpDir, file)); } catch {}
      }
    }
  } catch {}
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|-------------|-----------------|--------------|--------|
| Custom context bar in statusline | Claude Code handles context natively | Claude Code built-in | Remove context bar, remove bridge file |
| Task display from agent todo files | Phase + milestone from GitHub Issues | Phase 2 (GitHub-native) | Simpler, more reliable data source |
| Bridge file inter-hook communication | Direct file read per hook | Phase 6 | No shared temp files between hooks |
| Global install (`~/.claude/`) | Local install (`.claude/` in project) | Phase 2 (ARCH-04) | Hooks registered in project settings.json |

## Open Questions

| What We Know | What's Unclear | Recommendation |
|-------------|---------------|----------------|
| `gh api` returns milestone `open_issues` and `closed_issues` | How to determine which milestone is "active" when multiple exist | Use the first open milestone (sorted by `due_on` or `number`), or fallback to the one matching the ROADMAP.md milestone name |
| Statusline receives `cwd` and `workspace.project_dir` | Whether `cwd` always equals the project root (it can differ if worktree changes dir) | Use `workspace.project_dir` for `.planning/` detection, not `cwd` |
| Background `gh api` spawn works on macOS/Linux | Whether `windowsHide: true` works reliably on all Windows versions | Already proven in the update checker -- same pattern should work |
| PostToolUse matcher `Write\|Edit` catches direct file writes | Whether Bash tool file writes (e.g., `echo > .planning/file`) are caught | Accept this gap -- Bash tool writes to `.planning/` are rare in MAXSIM workflows. Not worth matching all Bash calls |

## Files to Modify (Complete Inventory)

### HOOK-01: Statusline Redesign

| File | Action |
|------|--------|
| `packages/cli/src/hooks/maxsim-statusline.ts` | Rewrite: remove context bar, remove task display, remove bridge write, add phase/milestone from cache, add bg `gh api` spawn |
| `packages/cli/src/hooks/shared.ts` | Keep as-is (readStdinJson + CLAUDE_DIR still needed) |

### HOOK-02: Sync Reminder (new)

| File | Action |
|------|--------|
| `packages/cli/src/hooks/maxsim-sync-reminder.ts` | Create: new PostToolUse hook for .planning/ change detection |
| `packages/cli/tsdown.config.ts` | Add: new build entry for `maxsim-sync-reminder` |
| `packages/cli/src/hooks/index.ts` | Add: re-export for testing |
| `packages/cli/src/install/hooks.ts` | Add: PostToolUse registration for sync-reminder (replace context-monitor registration) |

### HOOK-03: Update Checker

| File | Action |
|------|--------|
| `packages/cli/src/hooks/maxsim-check-update.ts` | Minor: add backup directory creation logic before update. Keep existing background spawn |
| `packages/cli/src/install/hooks.ts` | Update: document backup location in hook registration |

### HOOK-04: Context Monitor Removal

| File | Action | Confidence |
|------|--------|-----------|
| `packages/cli/src/hooks/maxsim-context-monitor.ts` | DELETE source file | HIGH |
| `packages/cli/src/hooks/index.ts` | REMOVE re-exports for context monitor | HIGH |
| `packages/cli/tsdown.config.ts` | REMOVE build entry for `maxsim-context-monitor` | HIGH |
| `packages/cli/src/install/hooks.ts` | REMOVE PostToolUse context-monitor registration, ADD to orphan lists | HIGH |
| `packages/cli/src/install/uninstall.ts` | KEEP `maxsim-context-monitor.js` in uninstall hook list (cleanup) | HIGH |
| `packages/cli/tests/pack.test.ts` | REMOVE assertion for `maxsim-context-monitor.cjs` | HIGH |
| `packages/cli/tests/e2e/install.test.ts` | REMOVE assertion for `maxsim-context-monitor.js` | HIGH |
| `packages/cli/src/hooks/maxsim-statusline.ts` | REMOVE bridge file write (`claude-ctx-{session}.json`) | HIGH |

### Cross-Cutting: Template/Doc References

| File | Action |
|------|--------|
| `packages/website/src/content/docs/hook-system.md` | UPDATE to reflect new hooks |
| `README.md` | UPDATE if hook system is mentioned |

## Sources

### Primary (HIGH confidence)

- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) -- Complete hook event schemas, settings.json configuration, input/output JSON formats, exit code behavior, async hooks
- [Claude Code Statusline Documentation](https://code.claude.com/docs/en/statusline) -- Statusline JSON input schema, settings.json format, debounce behavior, available data fields
- Existing source code: `packages/cli/src/hooks/` (all 4 files), `packages/cli/src/install/hooks.ts`, `packages/cli/src/install/uninstall.ts`, `packages/cli/tsdown.config.ts`

### Secondary (MEDIUM confidence)

- [GitHub REST API: Milestones](https://docs.github.com/en/rest/issues/milestones) -- Milestone response includes `open_issues`, `closed_issues`, `state`, `title` fields
- [GitHub CLI `gh api` Reference](https://cli.github.com/manual/gh_help_reference) -- `gh api repos/{owner}/{repo}/milestones` for querying milestone data

### Tertiary (LOW confidence)

- Background spawn pattern with `windowsHide: true` on Windows -- verified in existing update checker code but not independently tested across all Windows versions

## Metadata

| Area | Confidence | Reason |
|------|-----------|--------|
| Standard Stack | HIGH | No new dependencies, all patterns verified in existing codebase |
| Architecture (Hooks API) | HIGH | Official Claude Code docs verified, existing hooks follow same patterns |
| Architecture (Statusline) | HIGH | Official docs + existing implementation verified |
| Architecture (gh API caching) | MEDIUM | Pattern is sound but cache TTL and background spawn timing need tuning |
| Pitfalls | HIGH | Based on direct codebase analysis, known Windows edge cases |
| Context Monitor Removal Scope | HIGH | All 21 files with references identified via grep |
| Sync Reminder Design | MEDIUM | PostToolUse contract verified, debounce logic modeled on existing context monitor |

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (Claude Code hooks API is stable; re-verify if Claude Code major version changes)

---
*Phase: 06-Hook-System*
*Research completed: 2026-03-10*
