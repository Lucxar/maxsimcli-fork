# Roadmap: MAXSIM v5.0 -- Simplification & GitHub-Native Architecture

**Created:** 2026-03-09
**Milestone:** v5.0
**Depth:** Standard
**Total Phases:** 10
**Total Requirements:** 38

## Phases

- [ ] **Phase 1: Infrastructure Cleanup** - Remove dashboard, purge dist/ from git, eliminate sync/async duplication, fix build
- [ ] **Phase 2: GitHub Issues Foundation** - GitHub Issues as source of truth, gh CLI integration, local-only install, .planning/ restructure
- [x] **Phase 3: Command Surface Simplification** - Replace ~35 commands with ~9 state-machine commands, remove old commands
- [x] **Phase 4: Prompt & Skill Architecture** - Skills-based progressive disclosure, custom agent definitions, hard gates, evidence verification
- [ ] **Phase 5: Parallel Execution Model** - Worktree isolation, agent teams, two-stage review, batch execution, spec-driven methodology
- [ ] **Phase 6: Hook System** - Statusline, GitHub sync reminder, update checker, remove context monitor
- [ ] **Phase 7: GitHub Workflow Integration** - Wire MCP GitHub tools into init/plan/execute/progress workflows
- [ ] **Phase 8: Stale Reference Cleanup** - Remove dashboard-bridge references, update statusline GitHub source
- [ ] **Phase 9: Spec Reconciliation** - Update REQUIREMENTS.md, ROADMAP.md, STATE.md to reflect actual completion
- [ ] **Phase 10: Drift Detection & Realignment** - Built-in drift detection and realignment commands for end users

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
  - [x] Plan 01 (Wave 1): Create /maxsim:plan command + state machine workflow + 3 stage sub-workflows [CMD-02]
  - [x] Plan 02 (Wave 1): Create /maxsim:init command + thin router workflow [CMD-01]
  - [x] Plan 03 (Wave 2): Create /maxsim:execute command + auto-verify workflow [CMD-03]
  - [x] Plan 04 (Wave 2): Create /maxsim:go command + auto-detect workflow, rewrite /maxsim:help [CMD-05]
  - [x] Plan 05 (Wave 3): Enhance /maxsim:quick, /maxsim:progress, /maxsim:settings [CMD-04, CMD-07, CMD-08]
  - [x] Plan 06 (Wave 4): Delete ~29 old command files + obsolete workflow files [CMD-09]
  - [x] Plan 07 (Wave 4): Update cross-references in skills, agents, workflows, references [CMD-06, CMD-09]
  - [x] Plan 08 (Wave 4): Installer orphan cleanup + final verification [CMD-09]

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
**Plans**: 5 plans in 3 waves
  - [x] Plan 01 (Wave 1): Create rules files + 8 internal skills (verification-gates, handoff-contract, etc.) [PROMPT-01, PROMPT-04, PROMPT-05]
  - [x] Plan 02 (Wave 1): Rewrite 11 user-facing skills to match new architecture [PROMPT-01]
  - [x] Plan 03 (Wave 2): Create 4 new agents + AGENTS.md, delete 14 old agents [PROMPT-02, PROMPT-03, PROMPT-04, PROMPT-05]
  - [x] Plan 04 (Wave 2): Update workflow references + CLI types/model-profiles + installer rules support [PROMPT-02, PROMPT-03]
  - [x] Plan 05 (Wave 3): Integration verification + orphan cleanup [PROMPT-01, PROMPT-02, PROMPT-03, PROMPT-04, PROMPT-05]

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
**Plans**: 5 plans in 3 waves
  - [x] Plan 01 (Wave 1): CLI infrastructure -- worktree module, types, config, init context [EXEC-01, EXEC-04]
  - [x] Plan 02 (Wave 1): Review cycle enhancement -- retry counters, escalation, config-optional simplify [EXEC-03]
  - [x] Plan 03 (Wave 2): Execute workflow worktree integration -- batch/standard paths, lifecycle [EXEC-01, EXEC-04]
  - [x] Plan 04 (Wave 2): Spec-driven enforcement -- pre/post-execution gates, evidence tracking [EXEC-05]
  - [x] Plan 05 (Wave 3): Agent Teams integration + installer updates [EXEC-02]

### Phase 6: Hook System
**Goal**: Hooks provide lightweight automation without interfering with user workflow
**Depends on**: Phase 2
**Requirements**: HOOK-01, HOOK-02, HOOK-03, HOOK-04
**Success Criteria** (what must be TRUE):
  1. The statusline hook displays current phase and progress sourced from GitHub Issues
  2. Modifying files in `.planning/` triggers a reminder to sync changes to GitHub Issues
  3. The update checker compares local installed version against npm registry and replaces files cleanly on update
  4. The context monitor hook is removed from templates and install -- no references remain
**Plans**: 2 plans in 2 waves
  - [x] Plan 01 (Wave 1): Rewrite statusline + remove context monitor [HOOK-01, HOOK-04]
  - [ ] Plan 02 (Wave 2): Add sync-reminder hook + update checker backup [HOOK-02, HOOK-03]

### Phase 7: GitHub Workflow Integration
**Goal**: Every MAXSIM workflow (init, plan, execute, progress) creates, updates, and reads GitHub Issues automatically — `.planning/` becomes a local cache, GitHub Issues is the source of truth
**Depends on**: Phase 6
**Requirements**: WIRE-01, WIRE-02, WIRE-03, WIRE-04, WIRE-05
**Success Criteria** (what must be TRUE):
  1. Running `/maxsim:init` calls `mcp_github_setup` to create a Project Board, labels, and milestone on the user's GitHub repo
  2. Running `/maxsim:plan N` calls `mcp_create_phase_issue` to create a GitHub Issue for the phase with requirements and success criteria
  3. Running `/maxsim:execute N` calls `mcp_move_issue` to move issues to "In Progress" / "Done" as plans complete, and posts completion comments
  4. Running `/maxsim:progress` reads status from `mcp_query_board` / `mcp_get_issue_detail` instead of (or in addition to) local `.planning/` files
  5. A sync command or workflow exists that pushes local `.planning/` changes to GitHub Issues (fulfills HOOK-02 sync mechanism)
**Plans**: 7 plans in 4 waves
  - [ ] Plan 01 (Wave 1): MCP tool enhancements + new tools + backend changes [WIRE-01, WIRE-03, WIRE-05]
  - [ ] Plan 02 (Wave 1): Init context updates -- add GitHub mapping data to init functions [WIRE-03, WIRE-05]
  - [ ] Plan 03 (Wave 2): Init workflow rewrites -- new-project.md, init-existing.md [WIRE-01, WIRE-03]
  - [ ] Plan 04 (Wave 2): Plan workflow rewrites -- plan.md, plan-create.md, plan-discuss.md, plan-research.md, plan-phase.md [WIRE-01, WIRE-02]
  - [ ] Plan 05 (Wave 3): Execute workflow rewrites -- execute.md, execute-plan.md, execute-phase.md [WIRE-03, WIRE-04]
  - [ ] Plan 06 (Wave 3): Progress + go + verify workflow rewrites [WIRE-04, WIRE-05]
  - [ ] Plan 07 (Wave 4): Agent updates + github-artifact-protocol skill + installer + cleanup [WIRE-02, WIRE-05]

### Phase 8: Stale Reference Cleanup
**Goal**: No dead references to removed features remain in workflows, and statusline sources data from GitHub when available
**Depends on**: Phase 7
**Requirements**: CLEAN-01, CLEAN-02
**Success Criteria** (what must be TRUE):
  1. `grep -r "dashboard-bridge\|DASHBOARD_ACTIVE\|maxsim-dashboard" templates/` returns 0 matches
  2. Statusline hook optionally reads phase/progress from GitHub Issues when `gh` is authenticated (falls back to local `.planning/` gracefully)
**Plans**: Not yet planned (run /maxsim:plan 8 to break down)

### Phase 9: Spec Reconciliation
**Goal**: All `.planning/` spec files (REQUIREMENTS.md, ROADMAP.md, STATE.md) accurately reflect the actual state of the codebase
**Depends on**: Phase 8
**Requirements**: RECON-01
**Success Criteria** (what must be TRUE):
  1. Every requirement in REQUIREMENTS.md has a correct checkbox status (checked = implemented, unchecked = not implemented) verified against code
  2. ROADMAP.md progress table matches disk status (plan summaries exist = complete)
  3. STATE.md metrics match actual counts (phases complete, plans complete)
**Plans**: Not yet planned (run /maxsim:plan 9 to break down)

### Phase 10: Drift Detection & Realignment
**Goal**: Users can detect spec-code divergence and realign in either direction via built-in commands
**Depends on**: Phase 7
**Requirements**: DRIFT-01, DRIFT-02
**Success Criteria** (what must be TRUE):
  1. `/maxsim:check-drift` scans the codebase against `.planning/` spec and produces a structured DRIFT-REPORT.md with severity-tiered findings
  2. `/maxsim:realign to-code` updates `.planning/` to match code reality (per-item interactive approval)
  3. `/maxsim:realign to-spec` generates fix phases for implementation gaps (grouped, capped at 5)
  4. Both commands are documented in `/maxsim:help` and available as installed commands
**Plans**: Not yet planned (run /maxsim:plan 10 to break down)

## Dependency Graph

```
Phase 1 (Infrastructure Cleanup)
  └── Phase 2 (GitHub Issues Foundation)
        ├── Phase 3 (Command Surface) ──┐
        ├── Phase 4 (Prompt & Skills) ──┤
        │                               └── Phase 5 (Parallel Execution)
        └── Phase 6 (Hook System)
              └── Phase 7 (GitHub Workflow Integration)
                    ├── Phase 8 (Stale Reference Cleanup)
                    │     └── Phase 9 (Spec Reconciliation)
                    └── Phase 10 (Drift Detection & Realignment)
```

## Coverage Map

```
ARCH-01  -> Phase 2    ARCH-02  -> Phase 2    ARCH-03  -> Phase 2
ARCH-04  -> Phase 2    ARCH-05  -> Phase 2
CMD-01   -> Phase 3    CMD-02   -> Phase 3    CMD-03   -> Phase 3
CMD-04   -> Phase 3    CMD-05   -> Phase 3    CMD-06   -> Phase 3
CMD-07   -> Phase 3    CMD-08   -> Phase 3    CMD-09   -> Phase 3
EXEC-01  -> Phase 5    EXEC-02  -> Phase 5    EXEC-03  -> Phase 5
EXEC-04  -> Phase 5    EXEC-05  -> Phase 5
PROMPT-01 -> Phase 4   PROMPT-02 -> Phase 4   PROMPT-03 -> Phase 4
PROMPT-04 -> Phase 4   PROMPT-05 -> Phase 4
INFRA-01 -> Phase 1    INFRA-02 -> Phase 1    INFRA-03 -> Phase 1
INFRA-04 -> Phase 1    INFRA-05 -> Phase 1    INFRA-06 -> Phase 1
HOOK-01  -> Phase 6    HOOK-02  -> Phase 6    HOOK-03  -> Phase 6
HOOK-04  -> Phase 6
WIRE-01  -> Phase 7    WIRE-02  -> Phase 7    WIRE-03  -> Phase 7
WIRE-04  -> Phase 7    WIRE-05  -> Phase 7
CLEAN-01 -> Phase 8    CLEAN-02 -> Phase 8
RECON-01 -> Phase 9
DRIFT-01 -> Phase 10   DRIFT-02 -> Phase 10

Mapped: 38/38
Unmapped: 0
```

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Infrastructure Cleanup | 3/3 | Complete | 2026-03-10 |
| 2. GitHub Issues Foundation | 4/4 | Complete | 2026-03-10 |
| 3. Command Surface Simplification | 8/8 | Complete | 2026-03-10 |
| 4. Prompt & Skill Architecture | 5/5 | Complete | 2026-03-10 |
| 5. Parallel Execution Model | 5/5 | Complete | 2026-03-10 |
| 6. Hook System | 2/2 | Complete | 2026-03-11 |
| 7. GitHub Workflow Integration | 0/7 | Planned | - |
| 8. Stale Reference Cleanup | 0/0 | Not Started | - |
| 9. Spec Reconciliation | 0/0 | Not Started | - |
| 10. Drift Detection & Realignment | 0/0 | Not Started | - |

---
*Roadmap created: 2026-03-09*
*Phase 2 planned: 2026-03-10*
*Plan 02-01 complete: 2026-03-10*
*Plan 02-02 complete: 2026-03-10*
*Plan 02-03 complete: 2026-03-10*
*Plan 02-04 complete: 2026-03-10*
*Phase 02 complete: 2026-03-10*
*Phase 03 planned: 2026-03-10*
*Plan 03-01 complete: 2026-03-10*
*Plan 03-02 complete: 2026-03-10*
*Plan 03-03 complete: 2026-03-10*
*Plan 03-04 complete: 2026-03-10*
*Plan 03-05 complete: 2026-03-10*
*Plan 03-06 complete: 2026-03-10*
*Plan 03-07 complete: 2026-03-10*
*Plan 03-08 complete: 2026-03-10*
*Phase 03 complete: 2026-03-10*
*Phase 04 planned: 2026-03-10*
*Plan 04-01 complete: 2026-03-10*
*Plan 04-02 complete: 2026-03-10*
*Plan 04-03 complete: 2026-03-10*
*Plan 04-04 complete: 2026-03-10*
*Plan 04-05 complete: 2026-03-10*
*Phase 04 complete: 2026-03-10*
*Phase 05 planned: 2026-03-10*
*Phase 06 planned: 2026-03-10*
*Phase 07 planned: 2026-03-11*
