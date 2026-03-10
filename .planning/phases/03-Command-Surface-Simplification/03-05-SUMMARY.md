# Plan 03-05 Summary: Enhance Kept Commands

**Plan:** 03-05
**Phase:** 03-Command-Surface-Simplification
**Status:** Complete
**Duration:** ~9 minutes
**Date:** 2026-03-10

## One-Liner

Enhanced /maxsim:quick with todo capture mode, /maxsim:progress with GitHub Issues cross-validation and milestone completion, and /maxsim:settings with integrated profile management.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 01 | Enhance quick with todo capture | 5c71b38 | templates/commands/maxsim/quick.md, templates/workflows/quick.md |
| 02 | Enhance progress and settings | 75a2df5 | templates/commands/maxsim/progress.md, templates/workflows/progress.md, templates/commands/maxsim/settings.md, templates/workflows/settings.md |

## What Was Built

### Task 01: Quick Command Todo Mode
- Added `--todo` flag and trigger-word detection (todo, save, remember, later) for entering Todo Mode
- Todo Mode supports 4 actions: List, Capture, Complete, Triage
- Capture creates local todo file in `.planning/todos/pending/` + best-effort GitHub Issue with 'todo' label
- Triage shows prioritized todos with phase context from ROADMAP.md
- Updated old command references (/maxsim:new-project -> /maxsim:init)
- Workflow stays under 22KB limit (22387 bytes)

### Task 02: Progress and Settings Enhancement
- **Progress:** Added GitHub Issues-based progress via `mcp_get_all_progress` for cross-validation with local ROADMAP
- **Progress:** Added "Issues Detected" section for phase gap detection
- **Progress:** Replaced Route D milestone completion with interactive 3-option menu (complete, start new, just show)
- **Progress:** Routes to `/maxsim:init` for milestone lifecycle (not old `/maxsim:complete-milestone`)
- **Settings:** Enriched model profile question with detailed model assignment descriptions per tier
- **Settings:** Added Profile Details table to confirmation display showing model-to-role mapping
- **Settings:** Removed old set-profile quick command reference
- Progress workflow: 11031 bytes (under 14KB limit)
- Settings workflow: 7819 bytes (under 10KB limit)

## Old Command Reference Cleanup

All six modified files updated to use new command names:
- `/maxsim:new-project` -> `/maxsim:init`
- `/maxsim:execute-phase` -> `/maxsim:execute`
- `/maxsim:plan-phase` -> `/maxsim:plan`
- `/maxsim:discuss-phase` -> `/maxsim:plan`
- `/maxsim:set-profile` -> (absorbed into `/maxsim:settings`)
- `/maxsim:complete-milestone` -> `/maxsim:init`
- `/maxsim:new-milestone` -> `/maxsim:init`
- `/maxsim:check-todos` -> `/maxsim:quick --todo`
- `/maxsim:verify-work` -> `/maxsim:execute`
- `/maxsim:list-phase-assumptions` -> `/maxsim:plan`
- `/maxsim:resume-work` -> `/maxsim:go`

## Deviations

None. All work was within plan scope.

## Key Decisions

- Route D (milestone complete) uses interactive 3-option menu instead of simple routing
- Todo Mode exits after display/action (does not loop back to quick task mode)
- Settings profile descriptions show model assignments by role, not raw model IDs

## Artifacts

- Modified: `templates/commands/maxsim/quick.md`
- Modified: `templates/workflows/quick.md`
- Modified: `templates/commands/maxsim/progress.md`
- Modified: `templates/workflows/progress.md`
- Modified: `templates/commands/maxsim/settings.md`
- Modified: `templates/workflows/settings.md`

## Review Cycle
- Spec: PASS (0 retries)
- Code: PASS (0 retries)
- Issues: 0 critical, 0 warnings

## Requirements Addressed

- CMD-04: /maxsim:quick enhanced with todo capture
- CMD-07: /maxsim:progress enhanced with GitHub Issues progress and milestone completion
- CMD-08: /maxsim:settings enhanced with profile management

## Self-Check: PASSED
