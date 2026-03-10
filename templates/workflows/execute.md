<sanity_check>
Before executing any step in this workflow, verify:
1. The current directory contains a `.planning/` folder -- if not, stop and tell the user to run `/maxsim:init` first.
2. `.planning/ROADMAP.md` exists -- if not, stop and tell the user to initialize the project.
</sanity_check>

<purpose>
Thin orchestrator for the /maxsim:execute state machine. Detects the current state of a phase (already done, needs verification, needs execution), delegates per-plan execution to execute-plan.md subagents, runs auto-verification, and handles retry with gap closure.

This file is the ORCHESTRATOR ONLY. Per-plan execution logic lives in:
- @./workflows/execute-plan.md (per-plan subagent execution)

Verification is handled inline (spawning verifier agent) since it is a stage of this workflow, not a separate command.
</purpose>

<process>

## 1. Initialize

Load phase state in one call:

```bash
INIT=$(node .claude/maxsim/bin/maxsim-tools.cjs init execute-phase "$PHASE")
```

Parse JSON for: `phase_found`, `phase_dir`, `phase_number`, `phase_name`, `phase_slug`, `plans`, `incomplete_plans`, `plan_count`, `incomplete_count`, `has_verification`, `commit_docs`, `executor_model`, `verifier_model`, `parallelization`, `state_path`, `roadmap_path`, `requirements_path`, `phase_req_ids`.

**If `phase_found` is false:**
```
Phase [X] not found in roadmap.

Use /maxsim:progress to see available phases.
```
Exit workflow.

**If `plan_count` is 0:**
```
No plans found for Phase {phase_number}.

Run /maxsim:plan {phase_number} first to create execution plans.
```
Exit workflow.

## 2. Detect State

Determine where to start based on phase artifacts:

| Condition | State | Action |
|-----------|-------|--------|
| `incomplete_count == 0` AND `has_verification == true` | Already done | Go to **Re-entry flow** (step 3) |
| `incomplete_count == 0` AND `has_verification == false` | Needs verification | Start at **Auto-Verify** (step 5) |
| `incomplete_count > 0` | Needs execution | Start at **Execute Plans** (step 4) |

Display detected state:
```
Phase {phase_number}: {phase_name}
Current state: {Already executed | Needs verification | Ready to execute}
Plans: {plan_count} total, {incomplete_count} incomplete
```

## 3. Re-entry Flow (Already Executed and Verified)

When all plans are complete and verification has passed, show status and offer options.

Display:
```
## Phase {phase_number} Already Executed

**Plans:** {plan_count} plan(s) -- all complete
**Verification:** Passed
**Phase directory:** {phase_dir}

**Options:**
1. View results -- show SUMMARY.md files and verification report
2. Re-execute from scratch -- delete SUMMARYs, restart execution
3. View verification -- show VERIFICATION.md
4. Done (exit)
```

Wait for user choice via natural conversation.

- **View results:** Display contents of each SUMMARY.md file, then re-show options.
- **Re-execute:** Delete existing SUMMARY.md files, restart from Execute Plans (step 4).
- **View verification:** Display VERIFICATION.md contents, then re-show options.
- **Done:** Exit workflow.

## 4. Execute Plans

Execute all plans in wave order, delegating each plan to a subagent via execute-plan.md.

### 4.1 Discover and Group Plans

Load plan inventory with wave grouping:

```bash
PLAN_INDEX=$(node .claude/maxsim/bin/maxsim-tools.cjs phase-plan-index "${PHASE_NUMBER}")
```

Parse JSON for: `plans[]` (each with `id`, `wave`, `autonomous`, `objective`, `has_summary`), `waves` (map of wave number to plan IDs), `incomplete`.

Skip plans where `has_summary: true` (already complete -- supports resume).

If all plans already have summaries: skip to Auto-Verify (step 5).

Report:
```
## Execution Plan

**Phase {phase_number}: {phase_name}** -- {total_plans} plans across {wave_count} waves

| Wave | Plans | What it builds |
|------|-------|----------------|
| 1 | 03-01, 03-02 | {from plan objectives, 3-8 words} |
| 2 | 03-03 | ... |
```

### 4.2 Execute Waves

Execute each wave in sequence. Within a wave: parallel if `parallelization` is true, sequential if false.

**For each wave:**

1. **Describe what is being built (BEFORE spawning):**

   Read each plan's `<objective>`. Extract what is being built and why.

   ```
   ---
   ## Wave {N}

   **{Plan ID}: {Plan Name}**
   {2-3 sentences: what this builds, technical approach, why it matters}

   Spawning {count} agent(s)...
   ---
   ```

2. **Spawn executor agents:**

   Pass paths only -- executors read files themselves with their fresh 200k context.

   ```
   Task(
     subagent_type="executor",
     model="{executor_model}",
     prompt="
       <objective>
       Execute plan {plan_number} of phase {phase_number}-{phase_name}.
       Commit each task atomically. Create SUMMARY.md. Update STATE.md and ROADMAP.md.
       </objective>

       <execution_context>
       @./workflows/execute-plan.md
       @./templates/summary.md
       @./references/checkpoints.md
       @./references/tdd.md
       </execution_context>

       <files_to_read>
       Read these files at execution start using the Read tool:
       - {phase_dir}/{plan_file} (Plan)
       - .planning/STATE.md (State)
       - .planning/config.json (Config, if exists)
       - ./CLAUDE.md (Project instructions, if exists)
       </files_to_read>

       <success_criteria>
       - [ ] All tasks executed
       - [ ] Each task committed individually
       - [ ] SUMMARY.md created in plan directory
       - [ ] STATE.md updated with position and decisions
       - [ ] ROADMAP.md updated with plan progress
       </success_criteria>
     "
   )
   ```

3. **Wait for all agents in wave to complete.**

4. **Spot-check results:**

   For each completed plan's SUMMARY.md:
   - Verify first 2 files from key-files exist on disk
   - Check `git log --oneline --all --grep="{phase}-{plan}"` returns at least 1 commit
   - Check for `## Self-Check: FAILED` marker
   - Check for `## Review Cycle` section -- verify both Spec and Code stages show PASS

   If ANY spot-check fails: report which plan failed, ask "Retry plan?" or "Continue with remaining waves?"

5. **Report wave completion:**

   ```
   ---
   ## Wave {N} Complete

   **{Plan ID}: {Plan Name}**
   {What was built -- from SUMMARY.md}
   {Notable deviations, if any}

   {If more waves: what this enables for next wave}
   ---
   ```

6. **Handle checkpoint plans:** Plans with `autonomous: false` may return checkpoints. Present checkpoint to user, spawn continuation agent after user responds, wait for completion before proceeding.

7. **Proceed to next wave.**

### 4.3 Execution Summary Gate

After all waves complete:

```
## Gate: Execution Complete

**Plans executed:** {completed}/{total}
**Waves:** {wave_count}
**Commits:** {list of commit summaries from SUMMARY.md files}

Proceeding to verification...
```

Wait for user confirmation before proceeding to verification.

## 5. Auto-Verify

Verify that the phase achieved its GOAL, not just that tasks completed.

### 5.1 Spawn Verifier

Resolve verifier model and spawn the verifier agent:

```bash
VERIFIER_MODEL=$(node .claude/maxsim/bin/maxsim-tools.cjs resolve-model verifier --raw)
```

```
Task(
  prompt="Verify phase {phase_number} goal achievement.
Phase directory: {phase_dir}
Phase goal: {goal from ROADMAP.md}
Phase requirement IDs: {phase_req_ids}
Check must_haves against actual codebase.
Cross-reference requirement IDs from PLAN frontmatter against REQUIREMENTS.md.
Create VERIFICATION.md.",
  subagent_type="verifier",
  model="{verifier_model}"
)
```

### 5.2 Parse Verifier Result

Read verification status:
```bash
grep "^status:" "$PHASE_DIR"/*-VERIFICATION.md | cut -d: -f2 | tr -d ' '
```

**If `passed`:** Show verification gate and proceed to completion.

```
## Gate: Verification Passed

**Status:** All must-haves verified
**Evidence:** {summary from VERIFICATION.md}

Phase {phase_number} complete!
```

Mark phase complete:
```bash
COMPLETION=$(node .claude/maxsim/bin/maxsim-tools.cjs phase complete "${PHASE_NUMBER}")
```

Update tracking files:
```bash
node .claude/maxsim/bin/maxsim-tools.cjs commit "docs(phase-{X}): complete phase execution" --files .planning/ROADMAP.md .planning/STATE.md .planning/REQUIREMENTS.md {phase_dir}/*-VERIFICATION.md
```

**If `gaps_found`:** Proceed to Retry Loop (step 6).

**If `human_needed`:** Present items for human testing, get approval or feedback. If approved, treat as passed. If issues reported, proceed to Retry Loop.

## 6. Retry Loop (Max 2 Retries)

If verification failed, attempt gap closure. Maximum 2 retries (3 total attempts including the initial execution).

Initialize: `attempt_count = 1`

### 6.1 Check Attempt Budget

If `attempt_count > 2`:
```
## Verification Failed After 3 Attempts

**Status:** Could not resolve all gaps
**Attempts:** 3 (initial + 2 retries)

### What Failed
{List of unresolved gaps from VERIFICATION.md with evidence}

### Options
1. Fix manually and re-run `/maxsim:execute {phase_number}`
2. Run `/maxsim:debug` to investigate failing items
3. Accept as-is and continue to next phase
```

Wait for user decision. Exit workflow.

### 6.2 Plan Gap Closure

Display: "Verification failed. Retrying... (attempt {attempt_count + 1}/3)"

Spawn planner in gap-closure mode to create fix plans:

```
Task(
  prompt="
<planning_context>
**Phase:** {phase_number}
**Mode:** gap_closure

<files_to_read>
- {phase_dir}/{phase_num}-VERIFICATION.md (Verification with gaps)
- .planning/STATE.md (Project State)
- .planning/ROADMAP.md (Roadmap)
</files_to_read>
</planning_context>

<downstream_consumer>
Output consumed by /maxsim:execute.
Plans must be executable prompts.
</downstream_consumer>
",
  subagent_type="planner",
  model="{planner_model}"
)
```

### 6.3 Execute Gap Plans

Execute the newly created gap-closure plans using the same wave execution logic from step 4. Only execute plans with `gap_closure: true` in frontmatter.

### 6.4 Re-verify

Spawn verifier again (back to step 5). Increment `attempt_count`.

If verification passes: proceed to completion.
If verification fails and attempts remain: loop back to 6.1.

## 7. Checkpoint Before /clear

At any point during the workflow, if context is getting full (conversation is long, many tool calls made), recommend checkpointing before `/clear`.

**Checkpoint protocol:**
1. Post a checkpoint comment to the phase's GitHub Issue (if issue tracking is active):
```bash
# Use MCP tool to post checkpoint
mcp_post_plan_comment(
  phase_issue_number={issue_number},
  plan_number="checkpoint",
  plan_content="## MAXSIM Checkpoint\n\n**Command:** /maxsim:execute\n**Stage:** {current_stage}\n**Plans completed:** {completed_count}/{total_count}\n**Verification attempts:** {attempt_count}/3\n**Resume from:** {next_action}\n**Timestamp:** {ISO timestamp}"
)
```

2. Display checkpoint recommendation:
```
Context is filling up. Recommended: save progress and /clear.

Your progress has been checkpointed. Re-run `/maxsim:execute {phase_number}` after /clear -- it will detect completed plans and resume from where it left off.
```

The state detection in step 2 handles resume automatically -- completed plans have SUMMARY.md files that are detected on re-entry.

## 8. Update State

After verification passes, update STATE.md:

```bash
node .claude/maxsim/bin/maxsim-tools.cjs state record-session \
  --stopped-at "Phase ${PHASE} executed and verified" \
  --resume-file "${phase_dir}"
```

## 9. Completion

Display final results:

```
## Phase {phase_number}: {phase_name} -- Execution Complete

**Plans:** {completed}/{total} complete
**Waves:** {wave_count}
**Verification:** Passed (attempt {attempt_count}/3)

### Plan Details
1. **{plan_id}**: {one-liner from SUMMARY.md}
2. **{plan_id}**: {one-liner from SUMMARY.md}

### Next Steps
- `/maxsim:plan {next_phase}` -- Plan next phase
- `/maxsim:progress` -- View overall progress
```

</process>

<success_criteria>
- [ ] Phase validated against roadmap
- [ ] Current state correctly detected from artifacts
- [ ] Re-entry flow works for already-executed phases
- [ ] Plans discovered and grouped by wave
- [ ] Per-plan execution delegates to execute-plan.md sub-workflow via Task
- [ ] Spot-check of SUMMARY.md after each wave
- [ ] Gate confirmation shown after execution completes
- [ ] Auto-verification spawns verifier agent
- [ ] Retry loop with gap closure (max 2 retries, 3 total attempts)
- [ ] Checkpoint-before-clear pattern available
- [ ] No references to old commands (execute-phase, verify-work)
</success_criteria>
