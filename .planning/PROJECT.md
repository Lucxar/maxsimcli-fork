# MAXSIM

## What This Is

MAXSIM is a spec-driven development (SDD) system for Claude Code that prevents context rot by offloading work to fresh-context subagents. It ships as an npm package (`maxsimcli`) that installs markdown commands, workflows, agents, and skills into Claude Code's config directories. Users run `/maxsim:*` slash commands to plan, execute, and verify project phases with isolated agents.

## Core Value

Every AI-assisted coding task runs with the right amount of context — no more, no less — producing consistent, correct output from phase 1 to phase 50.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- [x] Phase-driven project planning (new-project, init-existing, plan-phase, execute-phase)
- [x] Fresh-context subagents for isolated task execution (11 specialized agents)
- [x] Atomic git commits per task with state tracking
- [x] Real-time dashboard with phase overview, terminal, and Q&A panel
- [x] MCP server integration for Claude Code tool access
- [x] Skill system (11 built-in skills for workflow enforcement)
- [x] Wave-based parallel plan execution
- [x] Multi-model profiles (quality/balanced/budget/tokenburner)

### Active

<!-- Current scope. Building toward these for v5.0. -->

- [ ] SDD-native architecture — agents and skills work as a coherent system, not isolated pieces
- [ ] Spec drift management — command to realign `.planning/` with actual codebase state
- [ ] Deeper initialization questioning — comprehensive tech stack, requirements, and no-go gathering
- [ ] Improved agent prompt coherence — prompts that reference and complement each other
- [ ] Rename conflicting skills (simplify -> maxsim-simplify, batch -> maxsim-batch)
- [ ] Remove multi-runtime adapter dead weight (focus Claude Code only)
- [ ] Two-stage review per task (spec compliance + code quality) as standard workflow
- [ ] Better context engineering — smart context assembly per agent role

### Out of Scope

<!-- Explicit boundaries. -->

- Multi-runtime support (OpenCode, Gemini CLI, Codex) — Claude Code only, simplifies codebase significantly
- GUI/Electron desktop app — CLI + dashboard is sufficient
- Cloud-hosted planning service — `.planning/` stays local/git-tracked
- AI model provider abstraction — Claude models only via Claude Code

## Context

MAXSIM is at v4.2.0 with 35+ commands, 13 agents, 11 skills, and a real-time dashboard. The codebase is a 3-package npm workspaces monorepo (cli, dashboard, website). It was inspired by GSD (Get Shit Done) and Superpowers, incorporating ideas from both:

- **From GSD:** Phase-driven planning, roadmap structure, state management
- **From Superpowers:** SDD workflow (fresh subagent per task + two-stage review), skill system, hard gates

Key reference: `docs/superpowers-research.md` contains a detailed comparison of Superpowers vs MAXSIM architectures, identifying what each does well.

The main pain point driving v5.0: agents and skills currently operate as independent pieces rather than a coherent system. Prompts don't reference each other well, context assembly is ad-hoc, and the spec can drift from reality without a mechanism to detect and correct it.

## Constraints

- **npm delivery**: Everything must work via `npx maxsimcli@latest` — we build for external users, not the monorepo
- **Backward compatibility**: Existing `.planning/` directories from v4.x must remain readable
- **Claude Code only**: No need to maintain adapter abstractions for other runtimes
- **Build verification**: `npm run build` must pass before any push to main (pre-push hook)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Claude Code only (drop multi-runtime) | Simplifies codebase, enables deeper integration, one runtime to optimize for | -- Pending |
| SDD as core methodology | Two-stage review (spec + quality) catches more errors than end-of-phase review | -- Pending |
| Rename conflicting skills | Claude Code has built-in simplify/batch commands; naming collision confuses users | -- Pending |
| MVP stage assessment | Tests + CI + npm publishing exist but agent coherence needs significant work | -- Pending |

## Current State Summary

Tech stack: TypeScript 5.9.3, Node.js 22+, npm workspaces monorepo. React 19 + Vite for dashboard. tsdown for Node.js bundling. Express + WebSockets for dashboard backend. MCP SDK for Claude integration.

Architecture: CLI tools router (150+ commands) dispatches to core modules (phase, state, roadmap, config, verify). Dashboard is Vite+React with xterm.js terminal. Commands are markdown prompts executed by Claude.

Patterns: `cmd*` function prefix, `CmdResult` union type, branded types, barrel exports, conventional commits with semantic-release.

## Known Risks / Tech Debt

- **Large monolithic modules**: server.ts (1159 lines), verify.ts (965 lines), phase.ts (940 lines) — hard to test/refactor
- **98 `any` type usages**: Runtime type errors not caught at compile time
- **Mixed error handling**: Exceptions vs CmdResult vs CliOutput/CliError — unpredictable error flow
- **Sync/async file I/O inconsistency**: Can block event loop
- **Multi-runtime adapter code**: Dead weight now that we're Claude Code only

## Codebase Analysis

Detailed codebase analysis available in:
- `.planning/codebase/STACK.md` -- Technology stack
- `.planning/codebase/ARCHITECTURE.md` -- Architecture patterns
- `.planning/codebase/CONVENTIONS.md` -- Code conventions
- `.planning/codebase/CONCERNS.md` -- Known issues and tech debt
- `.planning/codebase/STRUCTURE.md` -- File tree overview

---
*Last updated: 2026-03-03 after /maxsim:init-existing initialization*
