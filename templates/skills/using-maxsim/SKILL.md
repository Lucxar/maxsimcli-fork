---
name: using-maxsim
alwaysApply: true
description: >-
  Routes all work through MAXSIM's spec-driven workflow: checks for planning
  directory, determines active phase, and dispatches to the correct MAXSIM
  command. Use when starting any work session, resuming work, or when unsure
  which MAXSIM command to run.
---

# Using MAXSIM

MAXSIM is a spec-driven development system. Work flows through phases, plans, and tasks -- not ad-hoc coding.

**HARD GATE -- No implementation without a plan.**
If there is no `.planning/` directory, run `/maxsim:init` first.
If there is no current phase, run `/maxsim:plan` first.
If there is no PLAN.md for the current phase, run `/maxsim:plan` first.
If there IS a plan, run `/maxsim:execute` to execute it.

## Process

Before starting any task:

1. **Check for `.planning/` directory** -- if missing, initialize with `/maxsim:init`
2. **Check STATE.md** -- resume from last checkpoint if one exists
3. **Check current phase** -- determine what phase is active in ROADMAP.md
4. **Route to the correct command** based on the routing table below

### Routing Table

| Situation | Route To |
|-----------|----------|
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

### Available Skills

Skills are behavioral rules that activate automatically based on context:

| Skill | Triggers When |
|-------|---------------|
| `using-maxsim` | Always (alwaysApply) -- entry point for all MAXSIM work |
| `systematic-debugging` | Any bug, test failure, or unexpected behavior encountered |
| `tdd` | Implementing any feature or bug fix (write test first) |
| `verification-before-completion` | Before claiming any work is complete or passing |
| `memory-management` | Recurring patterns, errors, or decisions worth persisting |
| `brainstorming` | Before implementing any significant feature or design |
| `roadmap-writing` | When creating or restructuring a project roadmap |
| `maxsim-simplify` | Maintainability pass: reviewing code for duplication, dead code, and unnecessary complexity |
| `code-review` | Correctness gate: reviewing implementation for security, interfaces, errors, and test coverage |
| `sdd` | Executing sequential tasks where context rot is a concern (spec-driven dispatch) |
| `maxsim-batch` | Parallelizing work across 3-30 independent units in isolated worktrees |

### Available Agents

Agents are specialized subagent prompts spawned by MAXSIM commands:

| Agent | Purpose | Triggered By |
|-------|---------|-------------|
| `maxsim-executor` | Executes plans with atomic commits | `/maxsim:execute` |
| `maxsim-planner` | Creates structured PLAN.md files | `/maxsim:plan` |
| `maxsim-debugger` | Investigates bugs systematically | `/maxsim:debug` |
| `maxsim-verifier` | Verifies phase goal achievement | `/maxsim:execute` (auto-verify stage) |
| `maxsim-roadmapper` | Creates project roadmaps | `/maxsim:init` |
| `maxsim-phase-researcher` | Researches phase requirements | `/maxsim:plan` (research stage) |
| `maxsim-code-reviewer` | Reviews code changes | `/maxsim:execute` |
| `maxsim-spec-reviewer` | Reviews specifications | `/maxsim:init` |
| `maxsim-plan-checker` | Validates plan completeness | `/maxsim:plan` (planning stage) |
| `maxsim-project-researcher` | Researches project context | `/maxsim:init` |
| `maxsim-research-synthesizer` | Synthesizes research findings | `/maxsim:plan` |
| `maxsim-codebase-mapper` | Maps codebase structure | `/maxsim:init` |
| `maxsim-integration-checker` | Checks integration points | `/maxsim:execute` |

## Common Pitfalls

- Writing implementation code without a PLAN.md
- Skipping `/maxsim:init` because "the project is simple"
- Ignoring STATE.md checkpoints from previous sessions
- Working outside the current phase without explicit user approval
- Making architectural decisions without documenting them in STATE.md
- Finishing work without running verification

**If any of these occur: stop, check the routing table, follow the workflow.**

## Verification

Before ending any work session:

- [ ] All work was routed through MAXSIM commands (not ad-hoc)
- [ ] STATE.md reflects current progress and decisions
- [ ] Any bugs encountered were debugged systematically
- [ ] Tests were written before implementation (TDD)
- [ ] Completion claims have verification evidence
- [ ] Recurring patterns or errors were saved to memory

## MAXSIM Integration

When a project has a `CLAUDE.md`, both apply:
- `CLAUDE.md` defines project-specific conventions (language, tools, style)
- MAXSIM skills define workflow rules (how work is structured and verified)
- If they conflict, `CLAUDE.md` takes priority for code style; MAXSIM takes priority for workflow structure
