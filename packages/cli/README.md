<div align="center">

# MAXSIM

**Your AI coding assistant is forgetting things. MAXSIM fixes that.**

As Claude fills its context window, code quality degrades — wrong decisions, repeated mistakes, lost intent.
MAXSIM solves this by offloading work to fresh-context subagents, each with a single responsibility and no memory of the mess before.

[![npm version](https://img.shields.io/npm/v/maxsimcli?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/maxsimcli)
[![npm downloads](https://img.shields.io/npm/dm/maxsimcli?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/maxsimcli)
[![GitHub stars](https://img.shields.io/github/stars/maystudios/maxsimcli?style=for-the-badge&logo=github&logoColor=white&color=24292e)](https://github.com/maystudios/maxsimcli)
[![License](https://img.shields.io/badge/license-MIT-22c55e?style=for-the-badge)](LICENSE)

<br>

[![Website](https://img.shields.io/badge/Website-maxsimcli.dev-3b82f6?style=for-the-badge&logo=googlechrome&logoColor=white)](https://maxsimcli.dev/)
[![Docs](https://img.shields.io/badge/Docs-maxsimcli.dev%2Fdocs-6366f1?style=for-the-badge&logo=readthedocs&logoColor=white)](https://maxsimcli.dev/docs)

<br>

```bash
npx maxsimcli@latest
```

**Works with Claude Code — on Mac, Windows, and Linux.**

> **Early Alpha** — APIs, commands, and workflows may change between releases. Expect rough edges.

</div>

---

## The Problem in 30 Seconds

You start a session with Claude. The first 20 minutes are great. Then it starts forgetting your architecture decisions. It repeats the same mistakes. Output quality drops. You start a new session and lose all context.

This is **context rot** — and it gets worse the bigger your project is.

**MAXSIM fixes this** by breaking your build into phases, planning each one independently, and running each task in a fresh subagent with only the context it needs. No rot. No drift. Consistent quality from phase 1 to phase 50.

---

## Try It in 1 Minute

```bash
# Install into your project
npx maxsimcli@latest

# In Claude Code, initialize:
/maxsim:init

# Plan the first phase:
/maxsim:plan 1

# Execute it:
/maxsim:execute 1
```

That's the loop. **Init → Plan → Execute → Verify.** Each phase is isolated, each task gets a fresh agent, every change gets an atomic commit.

---

## Who Is This For

**Individual developers** who want to ship complex projects with Claude without losing coherence over long sessions.

**Teams** who want a shared structure for AI-assisted development — consistent planning, traceable decisions, reproducible phases.

**AI-heavy projects** (SaaS, CLIs, data pipelines) where a single Claude session can't hold the full project context.

**Not a fit if** your project is a single file, a one-shot script, or you just want quick answers from Claude — MAXSIM is a workflow system, not a chat interface.

---

## How It Works

MAXSIM installs 9 slash commands, 19 skills, and an MCP server into Claude Code. Each command is a structured workflow that spawns specialized subagents with fresh context.

### The Core Loop

**1. Initialize your project**
```
/maxsim:init
```
Answer a few questions → MAXSIM researches your domain, scopes v1/v2, and creates a phased roadmap in `.planning/`. Works for new projects, existing codebases, and milestone transitions.

**2. Plan a phase**
```
/maxsim:plan 1
```
State-machine workflow: Discussion → Research → Planning. Research agent investigates your domain. Planner creates atomic task plans. Plan-checker verifies them. You get a PLAN.md ready to execute.

**3. Execute**
```
/maxsim:execute 1
```
Plans run in parallel waves. Each task gets its own fresh executor agent and atomic git commit. Two-stage review (spec compliance → code quality) with automatic retry. Verifier checks the codebase delivered what the phase promised.

**4. Check progress and continue**
```
/maxsim:progress
```
See where you are, what's next. Intelligent routing to the next action — whether that's planning the next phase, executing, or completing a milestone.

**5. Or just let MAXSIM decide**
```
/maxsim:go
```
Auto-detects project state, surfaces blockers, and dispatches to the right command. No arguments needed.

---

## Real-World CLI Flow

```
You: /maxsim:init
MAXSIM: Tell me about your project...
You: A CLI tool that converts PDFs to structured JSON using AI
MAXSIM: [researches domain, scopes requirements]
        [creates REQUIREMENTS.md and ROADMAP.md with 8 phases]
        Phase 1: PDF parsing + text extraction
        Phase 2: AI-powered structure detection
        ...

You: /maxsim:plan 1
MAXSIM: [research agent investigates pdf libraries]
        [planner creates 3 atomic task plans]
        [plan-checker verifies feasibility]
        Ready. Run /maxsim:execute 1

You: /maxsim:execute 1
MAXSIM: [wave 1: executor installs dependencies, commits]
        [wave 2: executor implements PDF reader, commits]
        [wave 3: executor adds tests, commits]
        [spec review ✓ → code review ✓ → verifier confirms goal achieved]
        Phase 1 complete. 3 commits.
```

---

## Commands

9 commands, each backed by state-machine logic:

| Command | Description |
|---------|-------------|
| `/maxsim:init` | Initialize: new project, existing codebase, or next milestone |
| `/maxsim:plan [N]` | Discussion → Research → Planning for a phase |
| `/maxsim:execute <N>` | Execute plans in parallel waves with two-stage review |
| `/maxsim:progress` | Where am I? What's next? Routes to the right action. |
| `/maxsim:go` | Auto-detect state and dispatch — zero arguments |
| `/maxsim:quick [--todo]` | Ad-hoc task with atomic commits, or todo management |
| `/maxsim:debug [desc]` | Systematic debugging with persistent state |
| `/maxsim:settings` | Configure model profile and workflow toggles |
| `/maxsim:help` | Show command reference |

Every command is **idempotent** — you can re-run it and it picks up where you left off. No work gets lost.

---

## Installation

```bash
npx maxsimcli@latest
```

Installs locally into your project's `.claude/` directory. This sets up:

- **9 commands** → `.claude/commands/maxsim/`
- **4 agents** → `.claude/agents/`
- **19 skills** → `.claude/skills/`
- **26 workflows** → `.claude/maxsim/workflows/`
- **3 hooks** → `.claude/hooks/`
- **MCP server** → `.claude/maxsim/bin/mcp-server.cjs`

Verify with: `/maxsim:help`

Subsequent runs of `npx maxsimcli@latest` perform an incremental update — your local modifications are preserved via patch backup.

<details>
<summary><strong>Non-interactive Install (Docker, CI, Scripts)</strong></summary>

```bash
npx maxsimcli --local     # Project-scoped install → ./.claude/
```

</details>

**Requirements:** Node.js >= 22, `gh` CLI (for GitHub Issues integration)

---

## Configuration

Project settings live in `.planning/config.json`, created during `/maxsim:init` or editable via `/maxsim:settings`.

```json
{
  "model_profile": "balanced",
  "branching_strategy": "none",
  "commit_docs": true,
  "search_gitignored": false,
  "parallelization": true,
  "worktree_mode": "auto",
  "max_parallel_agents": 10,
  "brave_search": false,
  "workflow": {
    "research": true,
    "plan_checker": true,
    "verifier": true
  },
  "review": {
    "spec_review": true,
    "code_review": true,
    "simplify_review": true,
    "retry_limit": 3
  }
}
```

| Key | Values | Default | Description |
|-----|--------|---------|-------------|
| `model_profile` | `quality` \| `balanced` \| `budget` \| `tokenburner` | `balanced` | Which models agents use |
| `branching_strategy` | `none` \| `phase` \| `milestone` | `none` | Git branch creation per phase or milestone |
| `commit_docs` | boolean | `true` | Commit documentation changes separately |
| `parallelization` | boolean | `true` | Enable wave-based parallel plan execution |
| `worktree_mode` | `auto` \| `always` \| `never` | `auto` | Git worktree isolation for parallel agents |
| `workflow.research` | boolean | `true` | Enable research agent before planning |
| `workflow.plan_checker` | boolean | `true` | Enable plan-checker verification before execution |
| `workflow.verifier` | boolean | `true` | Enable verifier agent after execution |
| `review.spec_review` | boolean | `true` | Spec compliance review after each plan |
| `review.code_review` | boolean | `true` | Code quality review after each plan |
| `review.simplify_review` | boolean | `true` | Simplification pass after reviews |
| `review.retry_limit` | number | `3` | Max review cycle retries before escalation |
| `brave_search` | boolean | `false` | Enable Brave Search API in research agents |

### Model Profiles

4 profiles control which Claude model each agent type uses:

| Agent | `quality` | `balanced` | `budget` | `tokenburner` |
|-------|-----------|------------|----------|---------------|
| Executor | Opus | Sonnet | Sonnet | Opus |
| Planner | Opus | Opus | Sonnet | Opus |
| Researcher | Opus | Sonnet | Haiku | Opus |
| Verifier | Sonnet | Sonnet | Haiku | Opus |

> `tokenburner` assigns Opus to every agent. Use it when cost is no concern and you want maximum quality end-to-end.

Switch profiles at any time:

```
/maxsim:settings
```

You can also override individual agents in `config.json`:

```json
{
  "model_profile": "balanced",
  "model_overrides": {
    "planner": "opus",
    "executor": "opus"
  }
}
```

---

## Agents

4 consolidated generic agents, each spawned with fresh context and a single responsibility:

| Agent | Role | Replaces (v4.x) |
|-------|------|------------------|
| `executor` | Implements plans with atomic commits and deviation handling | maxsim-executor |
| `planner` | Creates PLAN.md files with task breakdown and goal-backward verification | maxsim-planner, maxsim-roadmapper, maxsim-plan-checker |
| `researcher` | Investigates domains with source evaluation and confidence levels | maxsim-phase-researcher, maxsim-project-researcher, maxsim-research-synthesizer, maxsim-codebase-mapper |
| `verifier` | Verifies work against specs with fresh evidence and hard gates | maxsim-verifier, maxsim-code-reviewer, maxsim-spec-reviewer, maxsim-debugger, maxsim-integration-checker, maxsim-drift-checker |

Agents communicate through structured handoff contracts. The orchestrator (your main Claude Code session) carries specialization context — agents themselves are generic. Subagents cannot spawn other subagents; all coordination is orchestrator-mediated.

---

## Skills

19 built-in skills provide on-demand context to agents. Skills auto-trigger based on context — they're not optional guidelines, they're active workflow enforcement.

### Protocol Skills
| Skill | Description |
|-------|-------------|
| `handoff-contract` | Structured format for agent returns |
| `verification-gates` | Hard gates with evidence requirements |
| `input-validation` | Input validation patterns |

### Methodology Skills
| Skill | Description |
|-------|-------------|
| `evidence-collection` | How to gather and validate evidence |
| `research-methodology` | How to research effectively |
| `sdd` | Spec-driven development — fresh agent per task |
| `tdd` | Test-driven development — failing test before implementation |
| `systematic-debugging` | Reproduce → hypothesize → isolate → verify → fix |
| `brainstorming` | Multi-approach exploration before design decisions |
| `code-review` | Security, interfaces, error handling, test coverage |
| `verification-before-completion` | 5-step verification with evidence requirements |

### Execution Skills
| Skill | Description |
|-------|-------------|
| `maxsim-batch` | Parallel worktree execution for independent work units |
| `maxsim-simplify` | Review changed code for reuse, quality, and efficiency |
| `commit-conventions` | Project git commit standards |

### Reference Skills
| Skill | Description |
|-------|-------------|
| `agent-system-map` | Agent capabilities and tool mappings |
| `tool-priority-guide` | Tool usage priority and best practices |
| `memory-management` | Persistent memory across sessions |
| `roadmap-writing` | Guided roadmap and requirements authoring |
| `using-maxsim` | Guide for effective MAXSIM usage |

---

## Hook System

3 compiled hooks installed into Claude Code:

| Hook | Function |
|------|----------|
| `maxsim-statusline` | Status bar: model · task · directory · context usage bar (blinks red above 95%) |
| `maxsim-sync-reminder` | Prompts to sync when `.planning/` files change (PostToolUse hook) |
| `maxsim-check-update` | Periodic npm update check with automatic backup before updating |

---

## MCP Server

MAXSIM installs an MCP (Model Context Protocol) server that exposes project tools directly to Claude Code. The server is auto-configured during installation via `.mcp.json`.

**Exposed tools:**
- **Phase operations** — list, add, complete, insert, and remove phases
- **State management** — read/update STATE.md (decisions, blockers, metrics)
- **Todo operations** — create, list, and complete todos
- **Roadmap analysis** — phase status, progress calculation, missing details
- **Context loading** — intelligent file selection based on task topic
- **Config management** — read/write `.planning/config.json` settings
- **GitHub integration** — issue creation, board queries, status tracking

The MCP server runs as a stdio process managed by Claude Code — no manual startup needed.

---

## Project Structure

When you initialize a project, MAXSIM creates a `.planning/` directory:

```
.planning/
├── config.json           # Model profile, workflow flags, branching strategy
├── PROJECT.md            # Vision and scope (always loaded)
├── REQUIREMENTS.md       # v1/v2/out-of-scope requirements
├── ROADMAP.md            # Phase structure with goals and dependencies
├── STATE.md              # Memory: decisions, blockers, metrics, session history
├── phases/
│   └── 01-Foundation/
│       ├── 01-CONTEXT.md        # User decisions from discussion
│       ├── 01-RESEARCH.md       # Research findings
│       ├── 01-01-PLAN.md        # Task plan (numbered per attempt)
│       ├── 01-01-SUMMARY.md     # Completion record with evidence
│       ├── 01-VERIFICATION.md   # Verification results
│       └── 01-UAT.md            # User acceptance tests
└── todos/
    ├── pending/
    └── completed/
```

---

## Architecture (For Contributors)

MAXSIM is a three-layer system where commands are markdown prompts, not executable code:

```
templates/commands/maxsim/*.md  ← User-facing commands (9 files, user types /maxsim:*)
templates/workflows/*.md        ← Implementation workflows (26 files, loaded via @path)
templates/agents/*.md           ← Subagent prompts (4 agents)
templates/skills/*/             ← On-demand context modules (19 skills)
```

Commands load workflows which spawn agents. Agents call `cli.cjs` (the tools router) via the Bash tool. The "runtime" for MAXSIM is the AI itself.

The npm package (`maxsimcli`) ships all of this as an installer that copies files into `.claude/`. If you want to improve a workflow or add a command, you're editing markdown.

**Tech stack:** TypeScript 5.9, Node.js 22+, npm workspaces monorepo, tsdown bundler

See [CLAUDE.md](CLAUDE.md) for the full architecture guide.

---

## Contributing

MAXSIM is open source and contributions are welcome.

- **Bug reports:** [Open an issue](https://github.com/maystudios/maxsimcli/issues)
- **Feature requests:** [Start a discussion](https://github.com/maystudios/maxsimcli/discussions)
- **PRs:** Fork, branch, and open a pull request — see [CLAUDE.md](CLAUDE.md) for architecture overview

---

## Acknowledgments

Inspired by [GSD (Get Shit Done)](https://github.com/gsd-build/get-shit-done).

## License

MIT License. See [LICENSE](LICENSE) for details.

---

<div align="center">

**Built and maintained by [MayStudios](https://github.com/maystudios).**

</div>
