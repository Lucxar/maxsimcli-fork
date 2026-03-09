# MAXSIM

## What This Is

MAXSIM is a meta-prompting, context engineering, and spec-driven development system for Claude Code. It solves "context rot" — the quality degradation that occurs as Claude's context window fills — by offloading work to fresh-context subagents, each with a single responsibility.

Users install via `npx maxsimcli@latest` (local-only) and it installs command/skill/agent files into the project's `.claude/` directory. The "runtime" is the AI itself — commands are markdown prompts, not executable code.

## Core Value

**Consistent, high-quality AI-assisted development at any project scale.** MAXSIM ensures that phase 50 gets the same quality as phase 1, regardless of project complexity or session length.

## Requirements

### Active (v5.0)

- GitHub Issues as single source of truth for tasks, phases, and progress
- `gh` CLI as hard requirement (no fallback)
- Local-only installation (`.claude/` per project, no global install)
- Simplified command surface (~9 commands, down from ~35)
- State-machine commands that resume from external state (GitHub Issues)
- Native parallel execution with worktree isolation (up to 30 agents)
- Skills-based architecture for progressive context disclosure
- Two-stage review loop (spec compliance → code quality) with retry
- Spec-driven development as core methodology
- Agent Teams for multi-agent coordination
- Custom agent definitions for specialized workers (Executor, Planner, Researcher, Verifier)

### Deferred

- Migration tooling from old `.planning/` schema
- Multi-runtime support (OpenCode, Gemini, Codex) — removed, Claude Code only
- Dashboard web UI — removed, GitHub Project Board replaces it

## Context

### Tech Stack
- TypeScript 5.9, Node.js 22+, npm workspaces monorepo
- 2 packages: `cli` (published as `maxsimcli`), `website` (GitHub Pages)
- tsdown bundler, Vitest testing, Biome linting
- Express + MCP SDK for backend services
- `gh` CLI for GitHub Issues/Projects integration

### Architecture
- Three-layer system: Commands → Skills/Workflows → Agents
- CLI tools router (`cli.ts`) dispatches 40+ commands to core modules
- MCP server exposes project operations as typed tools
- Data: `.planning/` for project context, GitHub Issues for work tracking

### Delivery
- `npx maxsimcli@latest` installs to `./.claude/` (local only)
- semantic-release auto-publishes on push to main
- Templates (commands, skills, agents) are the primary deliverable

## Constraints

- Prototype stage — breaking changes acceptable
- No backward compatibility with v4.x `.planning/` schema required
- `gh` CLI + GitHub authentication required for all workflows
- Every push to main triggers npm publish (intentional, immediate delivery)

## Key Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | GitHub Issues as source of truth | Single system, no drift between .planning/ and GitHub. AI can read/write issues natively via `gh` |
| 2 | `gh` CLI hard requirement | Dual-path implementations cause bugs (TD-1 lesson). One path, done right |
| 3 | Local-only install | Every project needs its own GitHub repo context. Global install doesn't make sense |
| 4 | Remove dashboard | GitHub Project Board provides phase overview. Eliminates 52K-line server + React frontend |
| 5 | ~9 commands (down from ~35) | Fewer commands = less confusion, better documentation, easier maintenance |
| 6 | State-machine commands | One command picks up where it left off via GitHub state. No need to remember sequence |
| 7 | Skills for progressive disclosure | Load context on-demand, not upfront. Prevents context pollution |
| 8 | Clean break, no migration | Prototype stage. Migration tooling adds complexity for minimal user base |
| 9 | Quality model profile | Opus for research/roadmap — deeper analysis for this architectural overhaul |

## Current State Summary

MAXSIM v4.x is a working prototype with ~35 commands, 15 agents, 11 skills, a web dashboard, and an MCP server. It uses `.planning/` markdown files as the primary data store. GitHub Issues integration exists but is secondary.

Key tech debt:
- 50% sync/async duplication in core.ts (has caused bugs)
- Triple-duplicated markdown parsers across dashboard/backend
- 21MB dist/ committed to git
- OOM build workaround (8GB memory, DTS disabled)
- Dashboard server is 52K lines

The v5.0 milestone is a fundamental simplification: GitHub-native, fewer commands, no dashboard, skills-based architecture.

## Known Risks / Tech Debt

- **TD-1 (HIGH):** Sync/async duplication — 50% of core.ts is duplicated logic, already caused BUG-1
- **TD-2 (MEDIUM):** Triple markdown parser duplication
- **TD-3 (MEDIUM):** dist/ committed to git (21MB, 187 files)
- **TD-6 (MEDIUM):** OOM build workaround, no TypeScript declarations
- **BUG-1:** Sync vs async phase search searches different paths

## Codebase Analysis

Detailed codebase analysis available in:
- `.planning/codebase/STACK.md` — Technology stack
- `.planning/codebase/ARCHITECTURE.md` — Architecture patterns
- `.planning/codebase/CONVENTIONS.md` — Code conventions
- `.planning/codebase/CONCERNS.md` — Known issues and tech debt
- `.planning/codebase/STRUCTURE.md` — File tree overview

---
*Initialized: 2026-03-09 via /maxsim:init-existing*
