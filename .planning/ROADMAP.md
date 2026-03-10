# Roadmap: MAXSIM v5.0 -- Simplification & GitHub-Native Architecture

**Created:** 2026-03-09
**Milestone:** v5.0
**Depth:** Standard
**Total Phases:** 6
**Total Requirements:** 28

## Phases

- [ ] **Phase 1: Infrastructure Cleanup** - Remove dashboard, purge dist/ from git, eliminate sync/async duplication, fix build
- [ ] **Phase 2: GitHub Issues Foundation** - GitHub Issues as source of truth, gh CLI integration, local-only install, .planning/ restructure
- [ ] **Phase 3: Command Surface Simplification** - Replace ~35 commands with ~9 state-machine commands, remove old commands
- [ ] **Phase 4: Prompt & Skill Architecture** - Skills-based progressive disclosure, custom agent definitions, hard gates, evidence verification
- [ ] **Phase 5: Parallel Execution Model** - Worktree isolation, agent teams, two-stage review, batch execution, spec-driven methodology
- [ ] **Phase 6: Hook System** - Statusline, GitHub sync reminder, update checker, remove context monitor

## Phase Details

### Phase 1: Infrastructure Cleanup
**Goal**: The codebase is lean, builds cleanly, and has no dead code from removed features
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06
**Success Criteria** (what must be TRUE):
  1. Running `npm run build` succeeds without OOM workarounds or DTS hacks
  2. The `packages/dashboard` directory no longer exists and no code references it
  3. `git log --oneline --diff-filter=D` shows dist/ removed from tracking; `.gitignore` excludes it
  4. Every function in `core.ts` exists in exactly one form (async) with zero sync duplicates
  5. MCP server starts and exposes tools focused on GitHub Issues operations (not dashboard/backend endpoints)
**Plans**: 3 plans in 2 waves
  - [ ] Plan 01 (Wave 1): Remove dashboard package and backend server [INFRA-01, INFRA-02, INFRA-03]
  - [ ] Plan 02 (Wave 1): Remove dist/ from git tracking [INFRA-05]
  - [ ] Plan 03 (Wave 2): Eliminate sync/async duplication [INFRA-04, INFRA-06]

### Phase 2: GitHub Issues Foundation
**Goal**: All work tracking (phases, tasks, progress) flows through GitHub Issues, not local markdown files
**Depends on**: Phase 1
**Requirements**: ARCH-01, ARCH-02, ARCH-03, ARCH-04, ARCH-05
**Success Criteria** (what must be TRUE):
  1. Running `/maxsim:init` in a project creates GitHub Issues for phases and configures the repo (not local .planning/ task files)
  2. `.planning/` contains only project context (PROJECT.md, config.json, conventions) -- no phase plans, summaries, or state tracking files
  3. Running any MAXSIM command without `gh` authenticated fails immediately with a clear error message
  4. Installation writes all files to `.claude/` inside the project directory, never to `~/.claude/` globally
  5. A command interrupted mid-execution can be re-run and resumes from GitHub Issue state without user intervention
**Plans**: 4 plans in 3 waves
  - [x] Plan 01 (Wave 1): Octokit adapter, auth gate, build config, local-only install [ARCH-03, ARCH-04]
  - [x] Plan 02 (Wave 2): Issue & sub-issue CRUD, labels, milestones via Octokit [ARCH-01, ARCH-05]
  - [x] Plan 03 (Wave 2): Projects v2 board & sync module via Octokit REST [ARCH-01, ARCH-05]
  - [x] Plan 04 (Wave 3): MCP tools integration, legacy removal, clean barrel export [ARCH-01, ARCH-02, ARCH-05]

### Phase 3: Command Surface Simplification
**Goal**: Users interact with MAXSIM through ~9 clear commands instead of ~35, each backed by state-machine logic
**Depends on**: Phase 2
**Requirements**: CMD-01, CMD-02, CMD-03, CMD-04, CMD-05, CMD-06, CMD-07, CMD-08, CMD-09
**Success Criteria** (what must be TRUE):
  1. `ls .claude/commands/maxsim/` shows exactly the target commands: init, plan, execute, progress, go, debug, quick, settings (plus help)
  2. Running `/maxsim:plan 2` transitions through discussion, research, and planning stages automatically based on GitHub Issue state
  3. Running `/maxsim:go` with no arguments correctly identifies the next action and dispatches to the right command
  4. All ~26 removed commands are gone from the templates directory and CLI router -- no dead code remains
**Plans**: 8 plans in 4 waves
  - [ ] Plan 01 (Wave 1): Create /maxsim:plan command + state machine workflow + 3 stage sub-workflows [CMD-02]
  - [ ] Plan 02 (Wave 1): Create /maxsim:init command + thin router workflow [CMD-01]
  - [ ] Plan 03 (Wave 2): Create /maxsim:execute command + auto-verify workflow [CMD-03]
  - [ ] Plan 04 (Wave 2): Create /maxsim:go command + auto-detect workflow, rewrite /maxsim:help [CMD-05]
  - [ ] Plan 05 (Wave 3): Enhance /maxsim:quick, /maxsim:progress, /maxsim:settings [CMD-04, CMD-07, CMD-08]
  - [ ] Plan 06 (Wave 4): Delete ~29 old command files + obsolete workflow files [CMD-09]
  - [ ] Plan 07 (Wave 4): Update cross-references in skills, agents, workflows, references [CMD-06, CMD-09]
  - [ ] Plan 08 (Wave 4): Installer orphan cleanup + final verification [CMD-09]

### Phase 4: Prompt & Skill Architecture
**Goal**: Agent prompts use skills for on-demand context loading instead of upfront monolithic instructions
**Depends on**: Phase 2
**Requirements**: PROMPT-01, PROMPT-02, PROMPT-03, PROMPT-04, PROMPT-05
**Success Criteria** (what must be TRUE):
  1. Agent prompts contain `<available_skills>` blocks that reference skill files, and skills are loaded via Read tool only when triggered
  2. Custom agent definitions exist for Executor, Planner, Researcher, and Verifier with distinct responsibilities and prompts
  3. No agent prompt nests more than 2 levels of @-references deep
  4. Every verification gate in agent prompts requires gathering fresh evidence before passing -- no self-assessment allowed
  5. Hard gates include explicit anti-rationalization language that prevents agents from arguing their way past failed checks
**Plans**: TBD

### Phase 5: Parallel Execution Model
**Goal**: MAXSIM can run multiple agents in parallel on separate worktrees with coordinated results
**Depends on**: Phase 3, Phase 4
**Requirements**: EXEC-01, EXEC-02, EXEC-03, EXEC-04, EXEC-05
**Success Criteria** (what must be TRUE):
  1. Running `/maxsim:execute 3` with parallelization enabled creates git worktrees and spawns isolated agents (up to 30)
  2. Agent Teams can communicate status and coordinate work across parallel worktree agents
  3. Every completed plan undergoes spec-compliance review then code-quality review, retrying until both pass
  4. Batch execution is an option within `/maxsim:execute`, not a separate command
  5. The execute command enforces spec-driven development: plan must reference requirements, implementation must match plan
**Plans**: TBD

### Phase 6: Hook System
**Goal**: Hooks provide lightweight automation without interfering with user workflow
**Depends on**: Phase 2
**Requirements**: HOOK-01, HOOK-02, HOOK-03, HOOK-04
**Success Criteria** (what must be TRUE):
  1. The statusline hook displays current phase and progress sourced from GitHub Issues
  2. Modifying files in `.planning/` triggers a reminder to sync changes to GitHub Issues
  3. The update checker compares local installed version against npm registry and replaces files cleanly on update
  4. The context monitor hook is removed from templates and install -- no references remain
**Plans**: TBD

## Dependency Graph

```
Phase 1 (Infrastructure Cleanup)
  └── Phase 2 (GitHub Issues Foundation)
        ├── Phase 3 (Command Surface) ──┐
        ├── Phase 4 (Prompt & Skills) ──┤
        │                               └── Phase 5 (Parallel Execution)
        └── Phase 6 (Hook System)
```

## Coverage Map

```
ARCH-01 -> Phase 2    ARCH-02 -> Phase 2    ARCH-03 -> Phase 2
ARCH-04 -> Phase 2    ARCH-05 -> Phase 2
CMD-01  -> Phase 3    CMD-02  -> Phase 3    CMD-03  -> Phase 3
CMD-04  -> Phase 3    CMD-05  -> Phase 3    CMD-06  -> Phase 3
CMD-07  -> Phase 3    CMD-08  -> Phase 3    CMD-09  -> Phase 3
EXEC-01 -> Phase 5    EXEC-02 -> Phase 5    EXEC-03 -> Phase 5
EXEC-04 -> Phase 5    EXEC-05 -> Phase 5
PROMPT-01 -> Phase 4  PROMPT-02 -> Phase 4  PROMPT-03 -> Phase 4
PROMPT-04 -> Phase 4  PROMPT-05 -> Phase 4
INFRA-01 -> Phase 1   INFRA-02 -> Phase 1   INFRA-03 -> Phase 1
INFRA-04 -> Phase 1   INFRA-05 -> Phase 1   INFRA-06 -> Phase 1
HOOK-01 -> Phase 6    HOOK-02 -> Phase 6    HOOK-03 -> Phase 6
HOOK-04 -> Phase 6

Mapped: 28/28
Unmapped: 0
```

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Infrastructure Cleanup | 0/3 | Planned | - |
| 2. GitHub Issues Foundation | 4/4 | Complete | 2026-03-10 |
| 3. Command Surface Simplification | 0/8 | Planned | - |
| 4. Prompt & Skill Architecture | 0/? | Not started | - |
| 5. Parallel Execution Model | 0/? | Not started | - |
| 6. Hook System | 0/? | Not started | - |

---
*Roadmap created: 2026-03-09*
*Phase 2 planned: 2026-03-10*
*Plan 02-01 complete: 2026-03-10*
*Plan 02-02 complete: 2026-03-10*
*Plan 02-03 complete: 2026-03-10*
*Plan 02-04 complete: 2026-03-10*
*Phase 02 complete: 2026-03-10*
*Phase 03 planned: 2026-03-10*
