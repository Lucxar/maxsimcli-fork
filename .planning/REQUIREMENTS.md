# Requirements: MAXSIM v5.0

**Defined:** 2026-03-09
**Core Value:** Consistent, high-quality AI-assisted development at any project scale
**Stage:** Prototype

## Requirements

Lightweight requirements for rapid exploration.

### Architecture

- [ ] **ARCH-01**: GitHub Issues is the single source of truth for phases, tasks, and progress
- [ ] **ARCH-02**: `.planning/` contains only project context (PROJECT.md, config, conventions, codebase analysis) -- not work tracking
- [ ] **ARCH-03**: `gh` CLI is a hard requirement -- no fallback paths
- [ ] **ARCH-04**: Local-only installation to `.claude/` per project (no global install)
- [ ] **ARCH-05**: State-machine commands that resume from GitHub state (idempotent, stateless)

### Commands

- [x] **CMD-01**: `/maxsim:init` -- unified initialization (new + existing projects)
- [x] **CMD-02**: `/maxsim:plan [N]` -- state machine: discussion -> research -> planning
- [x] **CMD-03**: `/maxsim:execute [N]` -- state machine: execute -> verify, with native parallel agents
- [x] **CMD-04**: `/maxsim:progress` -- status overview from GitHub Issues
- [x] **CMD-05**: `/maxsim:go` -- auto-detect and dispatch to the right command
- [x] **CMD-06**: `/maxsim:debug` -- systematic debugging with persistent state
- [x] **CMD-07**: `/maxsim:quick` -- ad-hoc task with atomic commits
- [x] **CMD-08**: `/maxsim:settings` -- configuration management
- [x] **CMD-09**: Remove all other commands (~26 commands eliminated)

### Execution

- [ ] **EXEC-01**: Native parallel execution with worktree isolation (up to 30 agents)
- [ ] **EXEC-02**: Agent Teams for multi-agent coordination and communication
- [ ] **EXEC-03**: Two-stage review loop: spec compliance -> code quality, with retry until clean
- [ ] **EXEC-04**: Batch execution integrated into execute command (not separate)
- [ ] **EXEC-05**: Spec-driven development as core methodology

### Prompt Architecture

- [x] **PROMPT-01**: Skills-based architecture for progressive context disclosure
- [x] **PROMPT-02**: Custom agent definitions for Executor, Planner, Researcher, Verifier
- [x] **PROMPT-03**: Less nesting -- clear structure, not deeply nested @references
- [x] **PROMPT-04**: Hard gates with anti-rationalization (from Superpowers pattern)
- [x] **PROMPT-05**: Evidence-based verification gates

### Infrastructure

- [ ] **INFRA-01**: Remove dashboard package entirely
- [ ] **INFRA-02**: Remove backend server (Express/WebSocket) -- not needed without dashboard
- [ ] **INFRA-03**: Keep MCP server but refocus on GitHub Issues operations
- [ ] **INFRA-04**: Reliable update checker (local version comparison + clean file replacement)
- [ ] **INFRA-05**: Remove dist/ from git, rely on CI builds
- [ ] **INFRA-06**: Eliminate sync/async duplication -- async only throughout

### Hooks

- [ ] **HOOK-01**: Statusline hook (keep, improve)
- [ ] **HOOK-02**: GitHub sync reminder hook (PostToolUse on .planning/ changes)
- [ ] **HOOK-03**: Update checker hook (local-only, simplified)
- [ ] **HOOK-04**: Remove context monitor hook (Claude Code handles this natively)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Migration from v4.x .planning/ schema | Prototype stage, clean break |
| Multi-runtime support (OpenCode, Gemini, Codex) | Claude Code only |
| Dashboard web UI | GitHub Project Board replaces it |
| Global installation | Local-only, per-project |
| Offline/no-GitHub fallback | Single path, `gh` required |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ARCH-01 | Phase 2: GitHub Issues Foundation | Pending |
| ARCH-02 | Phase 2: GitHub Issues Foundation | Pending |
| ARCH-03 | Phase 2: GitHub Issues Foundation | Pending |
| ARCH-04 | Phase 2: GitHub Issues Foundation | Pending |
| ARCH-05 | Phase 2: GitHub Issues Foundation | Pending |
| CMD-01 | Phase 3: Command Surface Simplification | Complete |
| CMD-02 | Phase 3: Command Surface Simplification | Complete |
| CMD-03 | Phase 3: Command Surface Simplification | Complete |
| CMD-04 | Phase 3: Command Surface Simplification | Complete |
| CMD-05 | Phase 3: Command Surface Simplification | Complete |
| CMD-06 | Phase 3: Command Surface Simplification | Complete |
| CMD-07 | Phase 3: Command Surface Simplification | Complete |
| CMD-08 | Phase 3: Command Surface Simplification | Complete |
| CMD-09 | Phase 3: Command Surface Simplification | Complete |
| EXEC-01 | Phase 5: Parallel Execution Model | Pending |
| EXEC-02 | Phase 5: Parallel Execution Model | Pending |
| EXEC-03 | Phase 5: Parallel Execution Model | Pending |
| EXEC-04 | Phase 5: Parallel Execution Model | Pending |
| EXEC-05 | Phase 5: Parallel Execution Model | Pending |
| PROMPT-01 | Phase 4: Prompt & Skill Architecture | Complete |
| PROMPT-02 | Phase 4: Prompt & Skill Architecture | Complete |
| PROMPT-03 | Phase 4: Prompt & Skill Architecture | Complete |
| PROMPT-04 | Phase 4: Prompt & Skill Architecture | Complete |
| PROMPT-05 | Phase 4: Prompt & Skill Architecture | Complete |
| INFRA-01 | Phase 1: Infrastructure Cleanup | Pending |
| INFRA-02 | Phase 1: Infrastructure Cleanup | Pending |
| INFRA-03 | Phase 1: Infrastructure Cleanup | Pending |
| INFRA-04 | Phase 1: Infrastructure Cleanup | Pending |
| INFRA-05 | Phase 1: Infrastructure Cleanup | Pending |
| INFRA-06 | Phase 1: Infrastructure Cleanup | Pending |
| HOOK-01 | Phase 6: Hook System | Pending |
| HOOK-02 | Phase 6: Hook System | Pending |
| HOOK-03 | Phase 6: Hook System | Pending |
| HOOK-04 | Phase 6: Hook System | Pending |

**Coverage:**
- v5.0 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0

---
*Requirements defined: 2026-03-09*
*Traceability updated: 2026-03-09*
