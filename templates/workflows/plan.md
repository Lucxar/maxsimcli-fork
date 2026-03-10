<sanity_check>
Before executing any step in this workflow, verify:
1. The current directory contains a `.planning/` folder -- if not, stop and tell the user to run `/maxsim:init` first.
2. `.planning/ROADMAP.md` exists -- if not, stop and tell the user to initialize the project.
</sanity_check>

<purpose>
Thin orchestrator for the /maxsim:plan state machine. Detects the current stage of a phase (Discussion, Research, Planning), delegates to stage sub-workflows, shows gate confirmations between stages, and handles re-entry on already-planned phases.

This file is the ORCHESTRATOR ONLY. Stage-specific logic lives in:
- @./workflows/plan-discuss.md (Discussion stage)
- @./workflows/plan-research.md (Research stage)
- @./workflows/plan-create.md (Planning stage)
</purpose>

<process>

## 1. Initialize

Load phase state in one call:

```bash
INIT=$(node .claude/maxsim/bin/maxsim-tools.cjs init plan-phase "$PHASE")
```

Parse JSON for: `phase_found`, `phase_dir`, `phase_number`, `phase_name`, `phase_slug`, `padded_phase`, `has_context`, `has_research`, `has_plans`, `plan_count`, `plans`, `commit_docs`, `researcher_model`, `planner_model`, `checker_model`, `research_enabled`, `plan_checker_enabled`, `state_path`, `roadmap_path`, `requirements_path`, `context_path`, `research_path`, `phase_req_ids`.

**If `phase_found` is false:**
```
Phase [X] not found in roadmap.

Use /maxsim:progress to see available phases.
```
Exit workflow.

## 2. Parse Arguments

Extract from $ARGUMENTS: phase number (integer or decimal like `2.1`), flags (`--force-research`, `--skip-verify`).

**If no phase number:** Detect next unplanned phase from roadmap using the `plans` and `has_context`/`has_research` fields.

## 3. Detect Current Stage

Determine where to start based on artifacts that already exist:

| Condition | Stage | Action |
|-----------|-------|--------|
| `plan_count > 0` | Already planned | Go to **Re-entry flow** (step 4) |
| `has_research == true` AND `plan_count == 0` | Planning | Start at **Planning stage** (step 7) |
| `has_context == true` AND `has_research == false` | Research | Start at **Research stage** (step 6) |
| None of the above | Discussion | Start at **Discussion stage** (step 5) |

Display detected stage:
```
Phase {phase_number}: {phase_name}
Current stage: {Discussion | Research | Planning | Already planned}
```

## 4. Re-entry Flow (Already Planned)

When `plan_count > 0`, the phase has existing plans. Show status and offer options.

Display:
```
## Phase {phase_number} Already Planned

**Plans:** {plan_count} plan(s)
**Plan files:** {list of plan filenames from `plans` array}
**Phase directory:** {phase_dir}

**Options:**
1. View existing plans
2. Re-plan from scratch (deletes existing plans, restarts from Discussion)
3. Execute phase -- run /maxsim:execute {phase_number}
4. Done (exit)
```

Wait for user choice via natural conversation.

- **View:** Display contents of each PLAN.md file, then re-show options.
- **Re-plan:** Delete existing PLAN.md files, reset to Discussion stage (step 5).
- **Execute:** Display `/maxsim:execute {phase_number}` and exit.
- **Done:** Exit workflow.

## 5. Discussion Stage

Delegate to the discussion sub-workflow for full discussion logic:

@./workflows/plan-discuss.md

Pass context: `phase_number`, `phase_name`, `phase_dir`, `padded_phase`, `phase_slug`, `commit_docs`, `roadmap_path`, `state_path`.

**After discussion completes (CONTEXT.md written):**

Refresh state to pick up the newly created CONTEXT.md:
```bash
INIT=$(node .claude/maxsim/bin/maxsim-tools.cjs init plan-phase "$PHASE")
```

Show gate:
```
## Gate: Discussion Complete

**Captured:** {N} decisions across {M} areas
**Locked decisions:**
{bullet list of key decisions from CONTEXT.md}

**Claude's discretion:** {list of areas where Claude decides}
**Context file:** {path to CONTEXT.md}

Continue to research? [Yes / Review context / Re-discuss area]
```

Wait for user response via natural conversation (not AskUserQuestion).

- **Yes:** Advance to Research stage (step 6).
- **Review context:** Display CONTEXT.md contents, then re-show gate.
- **Re-discuss area:** Loop back to discussion sub-workflow with the area to re-discuss.

## 6. Research Stage

Delegate to the research sub-workflow:

@./workflows/plan-research.md

Pass context: `phase_number`, `phase_name`, `phase_dir`, `padded_phase`, `phase_slug`, `commit_docs`, `researcher_model`, `research_enabled`, `has_research`, `state_path`, `roadmap_path`, `requirements_path`, `context_path`, `phase_req_ids`. Also pass the `--force-research` flag if present in $ARGUMENTS.

**After research completes (RESEARCH.md written or already exists):**

Refresh state:
```bash
INIT=$(node .claude/maxsim/bin/maxsim-tools.cjs init plan-phase "$PHASE")
```

Show gate:
```
## Gate: Research Complete

**Key findings:** {3-5 bullet summary from RESEARCH.md}
**Confidence:** {HIGH/MEDIUM/LOW from RESEARCH.md metadata}
**File:** {path to RESEARCH.md}

Continue to planning? [Yes / Review research / Re-research]
```

Wait for user response via natural conversation.

- **Yes:** Advance to Planning stage (step 7).
- **Review research:** Display RESEARCH.md contents, then re-show gate.
- **Re-research:** Loop back to research sub-workflow with `--force-research`.

## 7. Planning Stage

Delegate to the planning sub-workflow:

@./workflows/plan-create.md

Pass context: `phase_number`, `phase_name`, `phase_dir`, `padded_phase`, `phase_slug`, `commit_docs`, `planner_model`, `checker_model`, `plan_checker_enabled`, `state_path`, `roadmap_path`, `requirements_path`, `context_path`, `research_path`, `phase_req_ids`. Also pass the `--skip-verify` flag if present in $ARGUMENTS.

**After planning completes (PLAN.md files created):**

Refresh state:
```bash
INIT=$(node .claude/maxsim/bin/maxsim-tools.cjs init plan-phase "$PHASE")
```

Show final gate:
```
## Gate: Planning Complete

**Plans:** {plan_count} plan(s) in {wave_count} wave(s)
**Wave structure:**
| Wave | Plans | What it builds |
|------|-------|----------------|
{wave summary from plan frontmatter}

**Plan files:** {list of PLAN.md paths}

Ready to execute? Run `/maxsim:execute {phase_number}`
```

This is the final gate -- no confirmation needed. The user's next action is to run `/maxsim:execute`.

## 8. Checkpoint Before /clear

At any point during the workflow, if context is getting full (conversation is long, many tool calls made), recommend checkpointing before `/clear`.

**Checkpoint protocol:**
1. Post a checkpoint comment to the phase's GitHub Issue (if issue tracking is active):
```bash
# Use MCP tool to post checkpoint
mcp_post_plan_comment(
  phase_issue_number={issue_number},
  plan_number="checkpoint",
  plan_content="## MAXSIM Checkpoint\n\n**Command:** /maxsim:plan\n**Stage:** {current_stage} ({stage_num}/3)\n**Completed:**\n{list of completed stages with summaries}\n**Resume from:** {next_stage}\n**Timestamp:** {ISO timestamp}"
)
```

2. Display checkpoint recommendation:
```
Context is filling up. Recommended: save progress and /clear.

Your progress has been checkpointed. Re-run `/maxsim:plan {phase_number}` after /clear -- it will detect completed stages and resume from {next_stage}.
```

The stage detection in step 3 handles resume automatically -- completed stages produce artifacts (CONTEXT.md, RESEARCH.md, PLAN.md) that are detected on re-entry.

## 9. Update State

After all stages complete, update STATE.md:

```bash
node .claude/maxsim/bin/maxsim-tools.cjs state record-session \
  --stopped-at "Phase ${PHASE} planned" \
  --resume-file "${phase_dir}"
```

</process>

<success_criteria>
- [ ] Phase validated against roadmap
- [ ] Current stage correctly detected from artifacts
- [ ] Re-entry flow works for already-planned phases
- [ ] Discussion stage delegates to plan-discuss.md sub-workflow
- [ ] Research stage delegates to plan-research.md sub-workflow
- [ ] Planning stage delegates to plan-create.md sub-workflow
- [ ] Gate confirmation shown after each stage transition
- [ ] User confirms before advancing to next stage
- [ ] Checkpoint-before-clear pattern available
- [ ] No stage-specific logic inline -- all delegated to sub-workflows
</success_criteria>
