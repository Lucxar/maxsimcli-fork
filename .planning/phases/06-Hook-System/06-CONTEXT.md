# Phase 6: Hook System - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Hooks provide lightweight automation without interfering with user workflow. This phase improves the statusline hook (HOOK-01), adds a GitHub sync reminder hook (HOOK-02), simplifies the update checker (HOOK-03), and removes the context monitor hook (HOOK-04). Four requirements, four hooks.

</domain>

<decisions>
## Implementation Decisions

### Statusline redesign (HOOK-01)
- Remove context usage bar entirely (Claude Code handles context natively)
- Remove task display (in-progress todo from agent files) — phase + milestone is enough
- Remove bridge file writing (`claude-ctx-{session}.json`) — no consumer
- Add phase number + milestone progress: format `P6 | v5.0: 83%`
- Source phase/progress data via direct `gh` API call (non-blocking, acceptable latency)
- When no MAXSIM project detected (no `.planning/`): show model + directory + update indicator only
- Final format with project: `[update] model | P{N} | v{M}: {pct}% | dirname`
- Final format without project: `[update] model | dirname`

### GitHub sync reminder (HOOK-02)
- PostToolUse hook — entirely new
- Trigger on any `.planning/` file write, detected via filesystem mtime comparison
- Snapshot `.planning/` file mtimes to a temp file; on next PostToolUse fire, compare to detect changes
- Debounced: remind after first detection, then wait N tool calls before reminding again
- Message tone: gentle nudge — informational, not urgent
- Example: ".planning/ files changed locally. Consider syncing to GitHub Issues when ready."

### Update checker (HOOK-03)
- Notify only — do not auto-update; user runs `npx maxsimcli@latest` manually
- Keep background spawn approach (detached Node process, non-blocking)
- Show update indicator in statusline (existing behavior, keep)
- Update flow when user triggers: replace all files + create backup of previous version first
- Backup location: `.claude/maxsim-backup/` (before overwrite)

### Context monitor removal (HOOK-04)
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

</decisions>

<specifics>
## Specific Ideas

- Statusline should feel minimal — compact format like `P6 | v5.0: 83%` rather than verbose
- Sync reminder is passive, not a blocker — it should never interrupt MAXSIM operations
- Update backup gives confidence that `npx maxsimcli@latest` won't lose customizations

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-Hook-System*
*Context gathered: 2026-03-10*
