# Phase 3 Context: Command Surface Simplification

**Phase Goal:** Users interact with MAXSIM through ~9 clear commands instead of ~35, each backed by state-machine logic
**Created:** 2026-03-10
**Requirements:** CMD-01 through CMD-09

## 1. State Machine Flow Control

### Gate Confirmations
- **Every stage transition requires user confirmation** — no auto-advance
- Gates show **rich summaries** of what was produced: "Discussion complete: 4 decisions captured, 2 constraints identified. CONTEXT.md written. Continue to research?"
- When context is filling up, **recommend `/clear` and re-running the command**

### Stage Skipping
- **No skipping** — every stage runs every time, keeping the process consistent

### Checkpoint & Resume
- Before recommending `/clear`, **auto-checkpoint to GitHub Issue** — write current state so the command can resume
- After `/clear`, re-running the command **auto-resumes from checkpoint** (GitHub state IS the truth)

### Verify-Retry Loop (/maxsim:execute)
- Auto-verify after execution completes
- If verification fails, **auto-retry the failing tasks**
- **Max 2 retries** (3 total attempts) before giving up
- On final failure, report what failed and let user decide

### Re-entry Behavior
- If user runs `/maxsim:plan` on an already-planned phase: **show status + offer options** (view plan, re-plan, execute)
- Same pattern for `/maxsim:execute` on already-executed phase

### Execution Granularity
- `/maxsim:execute N` operates at **phase level** — runs ALL plans in wave order
- No plan-level granularity (no `/maxsim:execute 3.1`)
- Parallelization of plans within waves is expected (Phase 5 delivers the full parallel model)

## 2. Capability Migration

### Target Command Surface (~9 commands)

| Command | Role |
|---------|------|
| `/maxsim:init` | Unified initialization (new + existing) + milestone lifecycle |
| `/maxsim:plan N` | State machine: discussion → research → planning |
| `/maxsim:execute N` | State machine: execute → verify, auto-selects strategy |
| `/maxsim:progress` | Status overview + milestone completion offer |
| `/maxsim:go` | Auto-detect context, surface problems, dispatch to right command |
| `/maxsim:debug` | Systematic debugging with persistent state |
| `/maxsim:quick` | Ad-hoc task + todo capture (save for later = GitHub Issue with 'todo' label) |
| `/maxsim:settings` | Configuration management |
| `/maxsim:help` | Full guide with sections, TOC, state machine diagrams |

### Where Removed Capabilities Go

| Old Commands | New Home | Type |
|-------------|----------|------|
| add-phase, insert-phase, remove-phase, roadmap | **MCP tools only** | Agent-facing, not user commands |
| pause-work, resume-work, check-drift, realign, map-codebase, artefakte | **Agent-only skills** | /maxsim:go detects and invokes when needed |
| add-todo, check-todos | **Fold into /maxsim:quick** | "Save for later" creates GitHub Issue with 'todo' label |
| new-milestone, complete-milestone, audit-milestone, cleanup | **Split: /maxsim:init + /maxsim:progress** | Init handles milestone transitions interactively; Progress offers completion |
| map-codebase, health | **Agent skills** | Invoked during research (map) and verification (health) |
| sdd, batch | **Executor skills** | Auto-selected by /maxsim:execute's agent; combinable (SDD + batch together) |
| discuss-phase, research-phase, plan-phase | **Absorbed into /maxsim:plan** | Plan's state machine stages |
| execute-phase, verify-work | **Absorbed into /maxsim:execute** | Execute's state machine stages |
| set-profile | **Absorbed into /maxsim:settings** | Configuration sub-option |

### Skill Architecture (Agent-Only)
- Workflow utilities become **agent-only skills** — users never see or invoke them
- Only agents invoke skills internally (e.g., /maxsim:go detects drift → loads drift-check skill)
- This achieves **progressive context loading** — skills load only when needed, reducing base context

### Milestone Lifecycle
- `/maxsim:init` on already-initialized project: **AI detects current state** — completing milestone? Starting new one? Interactive flow
- `/maxsim:progress` when all phases complete: **offers milestone completion**
- Overall: more **interactive flow** between user and AI for milestone transitions

### Execution Strategy Selection
- `/maxsim:execute` auto-analyzes the plan and picks the best strategy
- SDD (spec-driven) and batch are **complementary, not exclusive** — can combine
- These become **skills the executor loads** based on plan analysis
- Executor can decide to spawn more agents as needed (Phase 5 delivers actual implementation)

## 3. /maxsim:go Intelligence

### Detection Pattern: Show + Act
- Show what was detected, then act immediately
- User can Ctrl+C to abort if detection is wrong
- No confirmation prompt — speed over caution

### Problem Surfacing
- **Always surface problems proactively** before suggesting next action
- **Block until resolved** — detected issues (drift, stale issues, broken state) must be addressed before proceeding
- No severity tiers — all problems block

### Context Gathering: Deep (Thorough)
- Full project scan: GitHub Issues + .planning/ + git status + recent commits + branch state
- Accuracy over speed — never wrong about project state

### Interactive Menu (No Obvious Action)
- Show **3-4 most relevant actions** contextually filtered
- Plus open-ended "What would you like to do?" as fallback
- Not a static list — menu adapts to project state

### Learning
- **Persistent usage pattern tracking** in config/state
- Track what users do after each command and improve suggestions
- Broader agent learning from mistakes is Phase 4 scope (Superpowers-style)

### Input
- **No arguments** — pure auto-detection
- Users who know what they want use the specific command directly

## 4. Removed Command UX

### Deletion Strategy
- **Just delete old command files** — no redirect, no alias, no wrapper
- Claude Code's native "command not found" is sufficient
- Consistent with Decision #8: clean break, no v4.x migration

### /maxsim:help Design
- **Sectioned with table of contents** — user jumps to what they need
- **Text descriptions + ASCII state machine diagrams** for plan/execute flows
- **No migration reference** — don't reference old commands at all. New users shouldn't learn about old system
- **Loads only on explicit `/maxsim:help`** — no context consumed in normal workflows

## Deferred Ideas (Captured for Future Phases)

| Idea | Target |
|------|--------|
| Multi-agent per task, "best worktree wins" | Phase 5 (Parallel Execution) |
| Executor dynamically spawning more agents | Phase 5 (Parallel Execution) |
| Agent learning from common mistakes (Superpowers-style) | Phase 4 (Prompt Architecture) |
| Persistent error memory across sessions | Phase 4 (Prompt Architecture) |

## Commands Being Removed (~29 commands)

For reference, these template files will be deleted:
```
add-phase.md, add-tests.md, add-todo.md, artefakte.md, audit-milestone.md,
batch.md, check-drift.md, check-todos.md, cleanup.md, complete-milestone.md,
discuss-phase.md, discuss.md, execute-phase.md, insert-phase.md,
list-phase-assumptions.md, map-codebase.md, new-milestone.md, new-project.md,
pause-work.md, plan-milestone-gaps.md, plan-phase.md, realign.md,
reapply-patches.md, remove-phase.md, research-phase.md, resume-work.md,
roadmap.md, sdd.md, set-profile.md
```

Keeping (~9 commands): `init.md`, `plan.md`, `execute.md`, `progress.md`, `go.md`, `debug.md`, `quick.md`, `settings.md`, `help.md`

---
*Context created: 2026-03-10*
*Decisions: 25 across 4 areas*
