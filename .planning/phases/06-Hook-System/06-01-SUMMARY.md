# Summary: 06-01 Rewrite Statusline + Remove Context Monitor

**Phase:** 06-Hook-System
**Plan:** 01
**Status:** Complete
**Duration:** ~4 minutes
**Requirements:** HOOK-01, HOOK-04

## What Was Done

Rewrote the statusline hook to display phase number and milestone progress from a GitHub API cache, and fully removed the context monitor hook. The statusline now shows `[update] model | P{N} | v{M}: {pct}% | dirname` for MAXSIM projects and `[update] model | dirname` for non-MAXSIM directories. A background Node child process spawns `gh api` calls to populate the cache with milestone completion percentage and current phase label, with a 60-second TTL.

## Tasks

| # | Name | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Rewrite statusline and delete context monitor | `48ebea2` | maxsim-statusline.ts (rewrite), maxsim-context-monitor.ts (deleted), index.ts |
| 2 | Update build, installer, and tests for context monitor removal | `439f424` | tsdown.config.ts, hooks.ts, uninstall.ts, pack.test.ts, install.test.ts |

## Files Modified

- `packages/cli/src/hooks/maxsim-context-monitor.ts` -- DELETED
- `packages/cli/src/hooks/maxsim-statusline.ts` -- REWRITTEN (phase/milestone from gh API cache, no context bar or bridge file)
- `packages/cli/src/hooks/index.ts` -- Removed context monitor exports
- `packages/cli/tsdown.config.ts` -- Removed context-monitor build entry
- `packages/cli/src/install/hooks.ts` -- Added orphan cleanup entries, removed PostToolUse registration, updated description text
- `packages/cli/src/install/uninstall.ts` -- Added sync-reminder to hooks list and PostToolUse filter
- `packages/cli/tests/pack.test.ts` -- Removed context-monitor assertion
- `packages/cli/tests/e2e/install.test.ts` -- Removed context-monitor assertion

## Key Decisions

- Background refresh uses `execFile` with `child.unref()` for detached execution (no stdio inheritance needed)
- Cache path uses `project_dir` (preferred) then `current_dir` for reliable project root detection
- Update check cache path changed from `~/.claude/` to project-local `.claude/` to support local-only install (ARCH-04)
- Milestone progress computed as `closed_issues / (open_issues + closed_issues) * 100`

## Deviations

None. All work followed the plan as specified.

## Verification

- Build succeeds: `npm run build` passes
- Hook bundles: only `maxsim-check-update.cjs` and `maxsim-statusline.cjs` in `dist/assets/hooks/`
- Pack test: 4/4 tests pass
- No context monitor references remain in hooks source, build config, or test assertions

## Review Cycle

Skipped -- single-wave plan with 2 tasks, no review subagents available in this execution context.
