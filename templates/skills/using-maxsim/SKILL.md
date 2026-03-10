---
name: using-maxsim
description: >-
  Routes work through MAXSIM's spec-driven workflow: checks planning state,
  determines active phase, dispatches to the correct MAXSIM command. Use when
  starting work sessions, resuming work, or choosing which MAXSIM command to run.
---

# Using MAXSIM

MAXSIM is a spec-driven development system. Work flows through phases, plans, and tasks -- not ad-hoc coding.

**No implementation without a plan.** If there is no `.planning/` directory, run `/maxsim:init` first. If there is no current phase, run `/maxsim:plan` first. If there IS a plan, run `/maxsim:execute` to execute it.

## Routing

Before starting any task:

1. **Check for `.planning/` directory** -- if missing, initialize with `/maxsim:init`
2. **Check STATE.md** -- resume from last checkpoint if one exists
3. **Check current phase** -- determine what phase is active in ROADMAP.md
4. **Route to the correct command** based on the table below

### Command Surface (9 commands)

| Situation | Command |
|-----------|---------|
| No `.planning/` directory | `/maxsim:init` |
| No ROADMAP.md or empty roadmap | `/maxsim:init` |
| Active phase has no PLAN.md | `/maxsim:plan N` |
| Active phase has PLAN.md, not started | `/maxsim:execute N` |
| Phase complete, needs verification | `/maxsim:execute N` (auto-verifies) |
| Bug found during execution | `/maxsim:debug` |
| Quick standalone task | `/maxsim:quick` |
| Check overall status | `/maxsim:progress` |
| Don't know what to do next | `/maxsim:go` |
| Change workflow settings | `/maxsim:settings` |
| Need command reference | `/maxsim:help` |

### Agent Model (4 agents)

MAXSIM uses 4 generic agent types. Specialization comes from the orchestrator's spawn prompt and on-demand skills, not from separate agent definitions.

| Agent | Role | Spawned By |
|-------|------|-----------|
| Executor | Implements plans with atomic commits and verified completion | `/maxsim:execute` |
| Planner | Creates structured PLAN.md files from requirements | `/maxsim:plan` |
| Researcher | Gathers domain knowledge and codebase context | `/maxsim:plan` (research stage) |
| Verifier | Reviews code, checks specs, debugs failures | `/maxsim:execute` (review stage), `/maxsim:debug` |

### Skills

Skills load on-demand based on description matching or direct `/skill-name` invocation. They are not auto-loaded -- each skill activates only when its content is relevant to the current task.

| Skill | When It Activates |
|-------|-------------------|
| `systematic-debugging` | Investigating bugs, test failures, or unexpected behavior |
| `tdd` | Implementing business logic, APIs, data transformations |
| `verification-before-completion` | Claiming work is done, tests pass, builds succeed |
| `memory-management` | Recurring patterns, errors, or decisions worth persisting |
| `brainstorming` | Facing architectural choices or design decisions |
| `roadmap-writing` | Creating or restructuring a project roadmap |
| `maxsim-simplify` | Reviewing code for duplication, dead code, complexity |
| `code-review` | Reviewing implementation for security, interfaces, quality |
| `sdd` | Executing sequential tasks with fresh-agent isolation |
| `maxsim-batch` | Parallelizing work across independent worktree units |

## Common Pitfalls

- Writing implementation code without a PLAN.md
- Skipping `/maxsim:init` because "the project is simple"
- Ignoring STATE.md checkpoints from previous sessions
- Working outside the current phase without explicit user approval
- Making architectural decisions without documenting them in STATE.md

**If any of these occur: stop, check the routing table, follow the workflow.**

See also: `/verification-before-completion` for evidence-based completion claims.
