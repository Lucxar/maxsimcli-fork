# Acceptance Criteria

**Generated:** 2026-03-09
**Source:** Init-existing initialization

## Project-Level Criteria

- [ ] `npx maxsimcli@latest` installs locally to `.claude/` (no global option)
- [ ] All phase/task tracking uses GitHub Issues (no ROADMAP.md/STATE.md for tracking)
- [ ] `.planning/` contains only context docs (PROJECT.md, config, conventions, codebase/)
- [ ] Command surface is ~9 commands (init, plan, execute, progress, go, debug, quick, settings, update)
- [ ] `/maxsim:plan N` works as state machine (discussion→research→planning, resumable after /clear)
- [ ] `/maxsim:execute N` spawns parallel agents in worktrees with two-stage review
- [ ] `/maxsim:go` auto-detects next action from GitHub state
- [ ] No dashboard code in the published package
- [ ] No sync function variants in core modules
- [ ] `gh` CLI required — clear error if not available

## Phase-Level Criteria

Populated per-phase during /maxsim:plan.

---
*Criteria derived from init-existing initialization*
