# Phase 3: Command Surface Simplification - Research

**Researched:** 2026-03-10
**Domain:** Command architecture, state machines, capability migration, installer mechanics
**Confidence:** HIGH (all findings verified against codebase)

## Summary

Phase 3 replaces ~35 user-facing commands with ~9 state-machine commands. The core challenge is not deleting files -- it is building the state-machine orchestration layer that makes the 9 remaining commands smart enough to absorb the capabilities of the 26 being removed.

The codebase is well-structured for this change. Commands are thin markdown files in `templates/commands/maxsim/` that delegate to workflows in `templates/workflows/`. The CLI tools router (`cli.ts`) provides programmatic operations that commands invoke via bash. The MCP server already exposes phase CRUD, GitHub operations, state management, and context queries as tools -- covering most of the "agent-only" capabilities that removed commands need to migrate to.

**Primary recommendation:** Build the 9 new command templates and workflows first, verify they cover all migrated capabilities, then delete the old commands and update the installer. The state machine logic lives entirely in the workflow markdown files -- no TypeScript changes are needed for the state machines themselves. The CLI router and MCP tools remain as-is; only the installer's command list and the `using-maxsim` skill routing table need updating.

## User Constraints

Copied verbatim from CONTEXT.md -- planner MUST honor these.

### Locked Decisions

1. **Every stage transition requires user confirmation** -- no auto-advance
2. Gates show **rich summaries** of what was produced
3. Before `/clear`, **auto-checkpoint to GitHub Issue**
4. Re-running command **auto-resumes from checkpoint** (GitHub state IS the truth)
5. **No skipping** -- every stage runs every time
6. Auto-verify after execution, **max 2 retries** (3 total attempts)
7. Re-entry on already-completed phases shows **status + offer options**
8. `/maxsim:execute N` operates at **phase level** -- no plan-level granularity
9. **~29 old commands deleted** -- clean break, no redirects, no aliases
10. Capabilities migrate to: MCP tools (agent-facing), agent-only skills, or absorbed into the 9 commands
11. `/maxsim:go` is **pure auto-detection, no arguments** -- Show + Act pattern
12. `/maxsim:go` uses **deep context gathering** (GitHub Issues + .planning/ + git status + recent commits)
13. `/maxsim:go` surfaces problems proactively and **blocks until resolved**
14. When no obvious action, show **3-4 contextual menu items** plus open-ended fallback
15. Old commands are **just deleted** -- no redirect, no alias, no wrapper
16. `/maxsim:help` is **sectioned with TOC** and **ASCII state machine diagrams**
17. No migration reference in help -- don't mention old commands

### Claude's Discretion Areas

- Execution strategy selection: executor auto-analyzes plan and picks SDD/batch/both
- Milestone lifecycle: interactive AI-driven flow in init and progress
- Learning: persistent usage pattern tracking in config/state

### Deferred Ideas (Out of Scope)

- Multi-agent per task, "best worktree wins" -> Phase 5
- Executor dynamically spawning more agents -> Phase 5
- Agent learning from common mistakes -> Phase 4
- Persistent error memory across sessions -> Phase 4

## Current State Analysis

### Existing Command Templates (40 files in `templates/commands/maxsim/`)

| # | Command File | Lines | Status in Phase 3 |
|---|-------------|-------|-------------------|
| 1 | `add-phase.md` | 37 | DELETE (-> MCP tool `mcp_create_phase`) |
| 2 | `add-tests.md` | 42 | DELETE (unused) |
| 3 | `add-todo.md` | 57 | DELETE (-> fold into `/maxsim:quick`) |
| 4 | `artefakte.md` | 121 | DELETE (-> agent skill) |
| 5 | `audit-milestone.md` | 38 | DELETE (-> `/maxsim:progress`) |
| 6 | `batch.md` | 43 | DELETE (-> executor skill `maxsim-batch`) |
| 7 | `check-drift.md` | 70 | DELETE (-> agent skill) |
| 8 | `check-todos.md` | 40 | DELETE (-> fold into `/maxsim:quick`) |
| 9 | `cleanup.md` | 20 | DELETE (-> `/maxsim:init` or `/maxsim:progress`) |
| 10 | `complete-milestone.md` | 134 | DELETE (-> `/maxsim:progress`) |
| 11 | `debug.md` | 168 | KEEP (target command) |
| 12 | `discuss-phase.md` | 88 | DELETE (-> absorbed into `/maxsim:plan`) |
| 13 | `discuss.md` | 71 | DELETE (-> `/maxsim:quick` triage) |
| 14 | `execute-phase.md` | 40 | DELETE (-> absorbed into `/maxsim:execute`) |
| 15 | `health.md` | 22 | DELETE (-> agent skill during verification) |
| 16 | `help.md` | 22 | KEEP (rewrite content) |
| 17 | `init-existing.md` | 47 | DELETE (-> absorbed into `/maxsim:init`) |
| 18 | `insert-phase.md` | 34 | DELETE (-> MCP tool `mcp_insert_phase`) |
| 19 | `list-phase-assumptions.md` | 45 | DELETE (unused) |
| 20 | `map-codebase.md` | 82 | DELETE (-> agent skill) |
| 21 | `new-milestone.md` | 45 | DELETE (-> `/maxsim:init`) |
| 22 | `new-project.md` | 47 | DELETE (-> `/maxsim:init`) |
| 23 | `pause-work.md` | 39 | DELETE (-> GitHub Issue checkpoint) |
| 24 | `plan-milestone-gaps.md` | 32 | DELETE (-> `/maxsim:progress`) |
| 25 | `plan-phase.md` | 45 | DELETE (-> absorbed into `/maxsim:plan`) |
| 26 | `progress.md` | 23 | KEEP (enhance) |
| 27 | `quick.md` | 42 | KEEP (enhance with todo capture) |
| 28 | `realign.md` | 42 | DELETE (-> agent skill) |
| 29 | `reapply-patches.md` | 96 | DELETE (obsolete) |
| 30 | `remove-phase.md` | 31 | DELETE (-> MCP tool or agent-only) |
| 31 | `research-phase.md` | 190 | DELETE (-> absorbed into `/maxsim:plan`) |
| 32 | `resume-work.md` | 37 | DELETE (-> auto-resume in all commands) |
| 33 | `roadmap.md` | 20 | DELETE (-> MCP tool `mcp_get_roadmap`) |
| 34 | `sdd.md` | 39 | DELETE (-> executor skill `sdd`) |
| 35 | `set-profile.md` | 29 | DELETE (-> `/maxsim:settings`) |
| 36 | `settings.md` | 37 | KEEP (enhance) |
| 37 | `update.md` | 29 | DELETE (handled by installer) |
| 38 | `verify-work.md` | 39 | DELETE (-> absorbed into `/maxsim:execute`) |

**Note:** There is no existing `init.md`, `plan.md`, `execute.md`, or `go.md` -- these are NEW command files.

### Existing Workflows (42 files in `templates/workflows/`)

| Workflow | Size | Used By | Fate in Phase 3 |
|----------|------|---------|-----------------|
| `discuss-phase.md` | 26KB | discuss-phase cmd | REWRITE -> becomes stage in plan.md workflow |
| `plan-phase.md` | 18KB | plan-phase cmd | REWRITE -> becomes stage in plan.md workflow |
| `execute-phase.md` | 20KB | execute-phase cmd | REWRITE -> becomes stage in execute.md workflow |
| `execute-plan.md` | 28KB | execute-phase workflow | KEEP (subagent execution) |
| `verify-work.md` | 16KB | verify-work cmd | MERGE into execute.md workflow (verify stage) |
| `verify-phase.md` | 10KB | verify-work workflow | MERGE into execute.md workflow |
| `new-project.md` | 46KB | new-project cmd | MERGE into init.md workflow |
| `init-existing.md` | 47KB | init-existing cmd | MERGE into init.md workflow |
| `new-milestone.md` | 14KB | new-milestone cmd | MERGE into init.md workflow |
| `quick.md` | 17KB | quick cmd | ENHANCE (add todo capture) |
| `help.md` | 17KB | help cmd | REWRITE (new command surface) |
| `progress.md` | 10KB | progress cmd | ENHANCE (GitHub Issues, milestone completion) |
| `settings.md` | 8KB | settings cmd | KEEP (add set-profile absorption) |
| `research-phase.md` | 2KB | research-phase cmd | MERGE into plan.md workflow |
| `add-todo.md` | 7KB | add-todo cmd | MERGE into quick.md workflow |
| `check-todos.md` | 8KB | check-todos cmd | MERGE into quick.md workflow |
| `discuss.md` | 13KB | discuss cmd | MERGE into quick.md workflow (triage) |
| `batch.md` | 13KB | batch cmd | KEEP as skill (already is) |
| `sdd.md` | 14KB | sdd cmd | KEEP as skill (already is) |
| Others | Various | Various | DELETE with their commands |

### Existing Agents (14 agent files + AGENTS.md)

All 14 agents remain. No agents are added or removed in Phase 3. Agent system maps do not need updating.

### CLI Tools Router (`cli.ts`)

The router has 40+ commands organized as handlers. Key observations:

- **No changes needed to the COMMANDS registry** -- commands in the router are programmatic tools called by workflows, not user-facing commands
- The `init` handler has sub-commands for each workflow type: `execute-phase`, `plan-phase`, `new-project`, `new-milestone`, `quick`, `resume`, `verify-work`, `phase-op`, `todos`, `milestone-op`, etc.
- These init sub-commands assemble context JSON for workflows. They will continue to work -- the new commands will simply call them differently
- The `phase` handler provides `add`, `insert`, `remove`, `complete` -- these remain available for MCP tools and agent use

### MCP Server (8 tool modules, ~35 tools total)

Already-registered MCP tools that replace removed commands:

| MCP Tool | Replaces Command |
|----------|-----------------|
| `mcp_create_phase` | `/maxsim:add-phase` |
| `mcp_insert_phase` | `/maxsim:insert-phase` |
| `mcp_complete_phase` | (part of `/maxsim:complete-milestone`) |
| `mcp_find_phase` | `/maxsim:roadmap` (query) |
| `mcp_list_phases` | `/maxsim:roadmap` (list) |
| `mcp_get_roadmap` | `/maxsim:roadmap` (full) |
| `mcp_add_todo` | `/maxsim:add-todo` |
| `mcp_complete_todo` | `/maxsim:check-todos` (complete action) |
| `mcp_list_todos` | `/maxsim:check-todos` (list action) |
| `mcp_get_state` | `/maxsim:resume-work` (state reading) |
| `mcp_update_state` | `/maxsim:pause-work` (state writing) |
| `mcp_add_decision` | (used by discuss-phase) |
| `mcp_get_all_progress` | `/maxsim:progress` (GitHub-based) |
| `mcp_detect_interrupted` | `/maxsim:resume-work` (interrupt detection) |
| `mcp_search_issues` | (general query) |
| `mcp_get_config` | `/maxsim:settings` (read) |
| `mcp_update_config` | `/maxsim:settings` (write) |

**Gap:** No existing MCP tool for checkpoint/resume operations. The checkpoint-to-GitHub-Issue mechanism (per CONTEXT.md decision) needs to be implemented. Currently `pause-work` writes to `.continue-here.md` locally.

### Installer (`install/index.ts`)

The installer copies from `dist/assets/templates/` to `.claude/` in the user's project:
1. `commands/maxsim/*.md` -- ALL files in the directory are copied
2. `maxsim/workflows/`, `maxsim/templates/`, `maxsim/references/` -- ALL subdirs copied
3. `agents/*.md` -- ALL `.md` files copied (old maxsim-* agents removed first)
4. `skills/` -- built-in skills removed then re-copied
5. `maxsim/bin/maxsim-tools.cjs` -- CLI tools binary
6. `maxsim/bin/mcp-server.cjs` -- MCP server binary

**What needs to change:**
- The installer copies ALL files in `templates/commands/maxsim/` -- so simply deleting old command files from the templates directory is sufficient
- No code changes needed in `install/index.ts` itself
- The `cleanupOrphanedFiles()` function in `install/hooks.ts` may need updating to remove old commands during upgrade installs
- The `using-maxsim` skill's routing table must be updated to reference the 9 new commands

### Skills System

Skills are markdown files in `templates/skills/{name}/SKILL.md`:
- Loaded by agents via `<available_skills>` blocks
- `using-maxsim` has `alwaysApply: true` -- auto-loaded at conversation start
- Skills are behavioral rules, not executable code
- The `AGENTS.md` registry maps agents to skills

**What needs to change:**
- `using-maxsim/SKILL.md` routing table must update to reference only the 9 new commands
- `sdd` and `maxsim-batch` skills remain as executor strategies (no change)
- New agent-only skills may be needed for: `pause-work`, `check-drift`, `realign`, `map-codebase`, `artefakte`
- These are not full skills -- they are capabilities that `/maxsim:go` or agents invoke when needed

## Architecture Patterns

### Command-Workflow-Agent Pattern (Existing, Unchanged)

```
User types /maxsim:plan 2
  -> Claude loads templates/commands/maxsim/plan.md
    -> plan.md references @./workflows/plan.md
      -> Workflow calls CLI tools (maxsim-tools.cjs) for context assembly
      -> Workflow spawns agents (Task tool) for heavy lifting
      -> Agents use MCP tools for GitHub operations
```

This pattern remains identical. The only change is WHICH command files exist and WHAT the workflow files contain.

### State Machine Pattern (NEW)

The state machine logic lives entirely in workflow markdown. No TypeScript code is needed -- the AI itself IS the state machine executor.

```
/maxsim:plan N workflow:

1. DETECT STATE (via GitHub Issues + local files)
   |
   +--> Phase not found? ERROR
   +--> Already fully planned? SHOW STATUS + OFFER OPTIONS
   +--> Discussion complete? SKIP TO RESEARCH
   +--> Research complete? SKIP TO PLANNING
   +--> Nothing done yet? START AT DISCUSSION
   |
2. EXECUTE CURRENT STAGE
   |
   +--> [Discussion] Run discuss-phase logic
   |    Gate: "Discussion complete: 4 decisions. Continue to research?"
   |    User confirms -> checkpoint to GitHub Issue -> advance
   |
   +--> [Research] Spawn researcher agent
   |    Gate: "Research complete. Continue to planning?"
   |    User confirms -> checkpoint to GitHub Issue -> advance
   |
   +--> [Planning] Spawn planner agent
   |    Gate: "Plan created. Review and approve?"
   |    User confirms -> DONE
```

**Implementation pattern for stage detection:**

```markdown
## 1. Detect Current Stage

Check for artifacts that indicate stage completion:
- CONTEXT.md exists in phase dir? -> Discussion complete
- RESEARCH.md exists in phase dir? -> Research complete
- PLAN.md exists in phase dir? -> Planning complete

Also check GitHub Issue comments for checkpoint data:
```bash
node .claude/maxsim/bin/maxsim-tools.cjs init plan-phase "$PHASE"
```

The init command returns JSON with `has_context`, `has_research`, `plans` fields that indicate exactly what stage the phase is at.
```

### Checkpoint-Resume Pattern (NEW)

Per CONTEXT.md: "Before recommending /clear, auto-checkpoint to GitHub Issue. After /clear, re-running auto-resumes from checkpoint."

**Implementation approach:**
- Before `/clear` recommendation: post a checkpoint comment on the phase's GitHub Issue using `mcp_post_plan_comment` or a new tool
- Checkpoint data: current stage, decisions made so far, any partial state
- On resume: read the phase issue comments to find the latest checkpoint, parse it, resume from that point
- The `init plan-phase` and `init execute-phase` CLI commands already return phase state -- they just need to also check GitHub Issue state

**Checkpoint comment format:**
```markdown
## MAXSIM Checkpoint

**Command:** /maxsim:plan
**Stage:** research (2/3)
**Completed:**
- Discussion: 4 decisions captured in 03-CONTEXT.md
- Research: In progress, 60% complete
**Resume from:** Research stage
**Timestamp:** 2026-03-10T14:30:00Z
```

### Gate Confirmation Pattern (NEW)

Every stage transition shows a rich summary and waits for user confirmation:

```markdown
## Gate: Discussion Complete

**Captured:** 4 decisions across 3 areas
**Locked decisions:**
- Card-based layout for feed
- Infinite scroll pagination
- Pull-to-refresh on mobile
- Dark mode support

**Claude's discretion:** Loading skeleton style

**Context file:** `.planning/phases/03-*/03-CONTEXT.md` (written)

Continue to research? [Yes / Review context / Re-discuss area]
```

### Re-entry Pattern (NEW)

When a user runs a command on an already-completed phase:

```markdown
## Phase 3 Already Planned

**Status:** Discussion, Research, and Planning all complete
**Plans:** 3 plans in 2 waves
**Last planned:** 2026-03-10

**Options:**
1. View existing plan
2. Re-plan (overwrites current plan)
3. Execute phase (`/maxsim:execute 3`)
4. Done (exit)
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|------------|-------------|-----|
| Phase state detection | Custom state tracker | `cmdInitPlanPhase()` / `cmdInitExecutePhase()` return JSON with `has_context`, `has_research`, `plans`, `incomplete_plans` | Already exists, tested, consistent |
| GitHub Issue operations | Raw `gh` CLI calls | MCP tools (`mcp_create_phase_issue`, `mcp_post_plan_comment`, etc.) | Octokit adapter handles auth, pagination, error wrapping |
| Progress queries | Custom GitHub parsing | `mcp_get_all_progress`, `mcp_get_phase_progress` | Already implemented in Phase 2 |
| Model resolution | Hardcoded model names | `maxsim-tools.cjs resolve-model <agent-type>` | Respects model_profile config |
| Slug generation | Custom string processing | `maxsim-tools.cjs generate-slug` | Handles edge cases |
| State updates | Direct file edits | `mcp_update_state`, `mcp_add_decision` | Consistent section targeting |
| Phase artifact detection | Manual `ls` + parsing | `maxsim-tools.cjs find-phase` + `init plan-phase` | Returns structured JSON with all needed flags |

## Common Pitfalls

### Pitfall 1: Workflow Size Explosion
**What goes wrong:** Merging discuss-phase + research-phase + plan-phase into a single plan.md workflow creates a 60KB+ file that overflows context.
**Why:** Each existing workflow is 10-47KB. Naive concatenation triples context use.
**How to avoid:** The plan.md workflow should be a THIN orchestrator that detects the current stage and delegates to stage-specific sections. Each stage section can reference sub-workflow files or inline just the stage-specific logic. Use `@./workflows/plan-discuss.md`, `@./workflows/plan-research.md`, `@./workflows/plan-create.md` as stage sub-workflows.
**Warning signs:** Workflow file > 20KB. Single workflow containing 3 complete sub-workflows inline.

### Pitfall 2: Stale Command References Everywhere
**What goes wrong:** Deleting command files but leaving references to old commands in workflows, agents, skills, references, and templates.
**Why:** The codebase has ~600+ cross-references between files. Old command names appear in routing tables, "next step" suggestions, examples, and inline documentation.
**How to avoid:** After deleting commands, grep the entire `templates/` directory for every deleted command name. Update `using-maxsim` SKILL.md, `AGENTS.md`, all agent prompts' system maps, workflow routing instructions, reference files, and help content.
**Warning signs:** A user running `/maxsim:plan-phase` gets "command not found" because another workflow suggested it.

### Pitfall 3: Installer Orphan Files
**What goes wrong:** Users who upgrade from v4.x to v5.x still have old command files in `.claude/commands/maxsim/` because the installer only copies NEW files -- it does not delete old ones.
**Why:** The installer's `copyWithPathReplacement()` overwrites existing files but does not delete files that no longer exist in the source.
**How to avoid:** The installer already has `cleanupOrphanedFiles()` in `install/hooks.ts`. Add the deleted command filenames to the orphan cleanup list. Also: the installer currently removes old `maxsim-*` agent files before copying new ones (line 188-193 of install/index.ts), so agents are handled. But commands use `copyWithPathReplacement()` which does NOT delete old files.
**Warning signs:** After upgrade, `ls .claude/commands/maxsim/` shows both old and new commands.

### Pitfall 4: Breaking the Init Flow
**What goes wrong:** The new unified `/maxsim:init` must handle 3 scenarios (new project, existing project, new milestone) but the existing workflows for each are 14-47KB and have different flows.
**Why:** `new-project.md` (46KB) and `init-existing.md` (47KB) are the two largest workflows. They have different questioning patterns, different research flows, and different document generation.
**How to avoid:** The `/maxsim:init` workflow should be a THIN router that detects the scenario (no .planning/ = new project, has .planning/ + active milestone = new milestone, has .planning/ + no roadmap = existing project) and then delegates to the existing sub-workflows. Do NOT try to merge the 3 workflows into one.
**Warning signs:** Init workflow > 50KB. Single workflow trying to handle all 3 scenarios inline.

### Pitfall 5: Go Command Over-Intelligence
**What goes wrong:** `/maxsim:go` tries to be too smart, misdetects the project state, and takes the wrong action.
**Why:** Deep context gathering (GitHub Issues + .planning/ + git status + recent commits) has many edge cases. The "Show + Act" pattern with no confirmation means mistakes are costly.
**How to avoid:** Build `/maxsim:go` as a decision tree with explicit precedence: 1) No .planning/ -> init, 2) Blocker in STATE.md -> show blocker, 3) Active execution interrupted -> resume, 4) Phase planned but not executed -> execute, 5) Phase needs planning -> plan, 6) All done -> progress. Show the detection reasoning before acting so the user can Ctrl+C.
**Warning signs:** Go command makes GitHub API calls before showing anything to the user.

### Pitfall 6: Checkpoint Data Format Mismatch
**What goes wrong:** Checkpoint data written to GitHub Issues by one command version cannot be parsed by a future version.
**Why:** Checkpoints are unstructured comments. Format changes break resume.
**How to avoid:** Use a structured checkpoint format with version marker. Include a machine-readable section (JSON in a code block) alongside the human-readable summary. Always parse the machine-readable section, fall back to heuristics.
**Warning signs:** Resume logic uses regex on free-text checkpoint comments.

## Code Examples

### Example 1: State Machine Stage Detection (from existing `init plan-phase`)

The CLI already provides stage detection. Source: `packages/cli/src/core/init.ts`

```bash
INIT=$(node .claude/maxsim/bin/maxsim-tools.cjs init plan-phase "$PHASE")
```

Returns JSON with:
```json
{
  "phase_found": true,
  "phase_dir": ".planning/phases/03-Command-Surface-Simplification",
  "phase_number": "03",
  "phase_name": "Command Surface Simplification",
  "has_research": true,
  "has_context": true,
  "plans": ["03-01-PLAN.md"],
  "incomplete_plans": [],
  "plan_count": 1,
  "commit_docs": true,
  "researcher_model": { "model": "claude-opus-4-6-20250311" },
  "planner_model": { "model": "claude-opus-4-6-20250311" }
}
```

The workflow uses these flags to determine stage:
- `has_context` = false -> Start at Discussion
- `has_context` = true, `has_research` = false -> Start at Research
- `has_research` = true, `plan_count` = 0 -> Start at Planning
- `plan_count` > 0 -> Already planned (re-entry)

### Example 2: Gate Confirmation Pattern

```markdown
## Gate: Research Complete

Display to user:
---
Research complete for Phase {phase_number}: {phase_name}

**Key findings:**
{3-5 bullet summary from RESEARCH.md}

**Confidence:** {HIGH/MEDIUM/LOW}
**File:** {research_path}

Continue to planning? [Yes / Review research / Re-research]
---

Wait for user response via natural conversation (not AskUserQuestion -- that tool is from the old system and may be removed).
```

### Example 3: Checkpoint to GitHub Issue

```bash
# Post checkpoint before /clear
node .claude/maxsim/bin/maxsim-tools.cjs init plan-phase "$PHASE"
# Extract phase issue number from GitHub mapping
```

Then use MCP tool:
```
mcp_post_plan_comment(
  phase_issue_number=42,
  plan_number="checkpoint",
  plan_content="## MAXSIM Checkpoint\n\n**Command:** /maxsim:plan\n**Stage:** research\n..."
)
```

### Example 4: Go Command Detection Tree

```markdown
## 1. Gather Context

```bash
# Check if .planning/ exists
PLANNING_EXISTS=$(node .claude/maxsim/bin/maxsim-tools.cjs verify-path-exists .planning --raw)

# If exists, load state
STATE=$(node .claude/maxsim/bin/maxsim-tools.cjs state load)

# Check git status
GIT_STATUS=$(git status --porcelain 2>/dev/null | head -20)

# Check recent commits
RECENT=$(git log --oneline -5 2>/dev/null)
```

## 2. Decision Tree

```
No .planning/?
  -> "No MAXSIM project detected. Run /maxsim:init to initialize."
  -> Act: suggest /maxsim:init

Has blockers in STATE.md?
  -> "BLOCKED: {blocker text}"
  -> Act: surface blocker, suggest resolution

Has interrupted execution (GitHub)?
  -> "Phase {N} was interrupted: {X}/{Y} tasks done."
  -> Act: /maxsim:execute N (resumes)

Phase has plan but not executed?
  -> "Phase {N} is planned and ready to execute."
  -> Act: /maxsim:execute N

Phase needs planning?
  -> "Phase {N} needs planning."
  -> Act: /maxsim:plan N

All phases complete?
  -> "All phases complete. Milestone ready for completion."
  -> Act: /maxsim:progress

None of the above?
  -> Show interactive menu
```
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|-------------|-----------------|--------------|--------|
| 35 separate commands | 9 state-machine commands | Phase 3 (now) | Users learn 9 commands instead of 35; AI uses state machines for flow |
| Manual pause/resume | Auto-checkpoint to GitHub Issues | Phase 3 (now) | No lost state across /clear; resume is automatic |
| Separate discuss/research/plan commands | Single /maxsim:plan with stages | Phase 3 (now) | Fewer context switches; automatic stage detection |
| Separate execute/verify commands | Single /maxsim:execute with verify loop | Phase 3 (now) | Automatic verification; retry on failure |
| User picks next action | /maxsim:go auto-detects | Phase 3 (now) | Lower cognitive load; proactive problem surfacing |

## Implementation Approach

### Layer 1: New Command Templates (Create)

Create 4 new command `.md` files that do not exist yet:
- `init.md` -- unified init (absorbs new-project, init-existing, new-milestone)
- `plan.md` -- state machine plan (absorbs discuss-phase, research-phase, plan-phase)
- `execute.md` -- state machine execute (absorbs execute-phase, verify-work)
- `go.md` -- auto-detect and dispatch

### Layer 2: New/Updated Workflows (Create/Rewrite)

For the 4 new commands, create corresponding workflow files. Use a thin-orchestrator pattern:
- `init.md` workflow: detect scenario -> delegate to existing sub-workflows
- `plan.md` workflow: detect stage -> run stage logic -> gate -> advance
- `execute.md` workflow: detect state -> execute -> verify -> retry loop
- `go.md` workflow: gather context -> decision tree -> dispatch

Also rewrite/enhance workflows for kept commands:
- `help.md` -- complete rewrite for 9-command surface
- `quick.md` -- add todo capture and triage
- `progress.md` -- add GitHub Issues progress, milestone completion
- `settings.md` -- absorb set-profile

### Layer 3: Delete Old Commands (Remove)

Delete ~29 command template files from `templates/commands/maxsim/`.

### Layer 4: Update Cross-References (Fix)

- `using-maxsim/SKILL.md` routing table
- `AGENTS.md` agent-command mapping
- All agent prompts that reference old commands (in `<agent_system_map>` or inline)
- Reference files that mention old commands
- Template files that suggest old commands as "next steps"

### Layer 5: Installer Updates (Fix)

- Add orphan cleanup for deleted command files
- No structural changes to install logic
- Update the orphan list in `install/hooks.ts`

### Implementation Order

**Wave 1 (Foundation):** Create `/maxsim:plan` command + workflow (biggest, most complex state machine)
**Wave 2 (Parallel):** Create `/maxsim:init`, `/maxsim:execute`, `/maxsim:go` commands + workflows
**Wave 3 (Cleanup):** Delete old commands, update cross-references, update installer, rewrite help
**Wave 4 (Enhancement):** Enhance `/maxsim:quick`, `/maxsim:progress`, `/maxsim:settings`

## Risk Analysis

### High Risk: Workflow Context Overflow
**Risk:** New workflow files that absorb multiple old commands become too large for context.
**Mitigation:** Strict thin-orchestrator pattern. Each workflow < 20KB. Stage-specific logic in sub-files.
**Likelihood:** HIGH if not explicitly managed.

### Medium Risk: Stale References
**Risk:** Old command names persist in 100+ cross-reference points across templates.
**Mitigation:** Systematic grep-and-replace pass as a dedicated task.
**Likelihood:** MEDIUM -- easy to find but easy to miss.

### Medium Risk: Installer Orphan Accumulation
**Risk:** Users upgrading from v4.x keep old commands alongside new ones.
**Mitigation:** Add explicit orphan cleanup list to installer. Test upgrade scenario.
**Likelihood:** MEDIUM -- installer has the mechanism, just needs the list.

### Low Risk: Go Command False Positives
**Risk:** `/maxsim:go` misdetects project state and takes wrong action.
**Mitigation:** Show detection reasoning before acting. User can Ctrl+C. Decision tree with explicit precedence.
**Likelihood:** LOW -- edge cases exist but the Show+Act pattern provides safety.

### Low Risk: Checkpoint Parse Failures
**Risk:** Checkpoint data in GitHub Issue comments cannot be reliably parsed on resume.
**Mitigation:** Structured checkpoint format with JSON code block + version marker.
**Likelihood:** LOW -- machine-readable section makes parsing deterministic.

## Open Questions

| What We Know | What's Unclear | Recommendation |
|-------------|---------------|----------------|
| CLI init commands return phase state as JSON | Whether the checkpoint comment format should be standardized or ad-hoc | Standardize with JSON in code block + version marker |
| Installer copies all files from commands dir | Whether `cleanupOrphanedFiles()` already handles removed command files | Check the function -- if not, add explicit orphan list |
| MCP tools exist for phase CRUD and GitHub ops | Whether a new MCP tool is needed for checkpoint operations | Probably not -- `mcp_post_plan_comment` can post checkpoint comments; reading them back can use `mcp_get_issue` |
| `using-maxsim` skill has alwaysApply: true | Whether any other skills reference old command names | Grep all skill files for old command names |
| `/maxsim:go` should use deep context gathering | How much latency the GitHub API calls add to go's startup | Parallel API calls; show "Analyzing project..." immediately |

## Sources

### Primary (HIGH Confidence)
- `templates/commands/maxsim/*.md` -- all 40 command files read and catalogued
- `templates/workflows/*.md` -- all 42 workflow files listed and categorized
- `templates/agents/AGENTS.md` -- agent registry with skill mappings
- `packages/cli/src/cli.ts` -- full CLI tools router (504 lines)
- `packages/cli/src/install/index.ts` -- full installer (511 lines)
- `packages/cli/src/mcp/index.ts` + all 8 tool modules -- full MCP server
- `packages/cli/src/core/init.ts` -- context assembly for all workflow types
- `.planning/phases/03-Command-Surface-Simplification/03-CONTEXT.md` -- locked decisions

### Secondary (MEDIUM Confidence)
- `packages/cli/src/install/shared.ts` -- installer shared utilities
- `packages/cli/scripts/copy-assets.cjs` -- build pipeline asset copying
- `packages/cli/tsdown.config.ts` -- build configuration
- `templates/skills/using-maxsim/SKILL.md` -- always-apply routing skill

## Metadata

| Area | Confidence | Reason |
|------|-----------|--------|
| Current command inventory | HIGH | Read every file |
| Current workflow inventory | HIGH | Listed and categorized every file |
| CLI router mechanics | HIGH | Read full source |
| MCP tool coverage | HIGH | Read all 8 tool modules |
| Installer mechanics | HIGH | Read full source |
| State machine implementation | HIGH | Verified init commands return stage data |
| Checkpoint/resume pattern | MEDIUM | Mechanism exists (GitHub comments) but format not yet defined |
| Go command detection logic | MEDIUM | Decision tree is clear but edge cases unverified |
| Cross-reference scope | MEDIUM | Know the pattern, have not yet grepped every instance |

**Research date:** 2026-03-10
**Valid until:** Phase 3 completion (findings are codebase-specific, not time-sensitive)
