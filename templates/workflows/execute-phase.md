<sanity_check>
Before executing any step in this workflow, verify:
1. The current directory contains a `.planning/` folder — if not, stop and tell the user to run `/maxsim:init` first.
2. `.planning/ROADMAP.md` exists — if not, stop and tell the user to initialize the project.
</sanity_check>

<purpose>
Execute all plans in a phase using wave-based parallel execution. Orchestrator stays lean — delegates plan execution to subagents. Plans are read from GitHub issue comments; summaries are posted as GitHub comments; task sub-issues are transitioned on the board per task.
</purpose>

<core_principle>
Orchestrator coordinates, not executes. Each subagent loads the full execute-plan context. Orchestrator: discover plans from GitHub → analyze deps → group waves → spawn agents → handle checkpoints → collect results.
</core_principle>

<agent_teams>
**Agent Teams Model:** MAXSIM uses Agent Teams for grouping parallel agents, NOT for peer-to-peer communication.

- `team_name` groups agents in a wave so Claude Code can track them as a unit
- All coordination routes through the orchestrator (this workflow)
- Subagents CANNOT spawn other subagents — only the orchestrator spawns agents
- Inter-wave handoff: orchestrator passes wave N results as context to wave N+1 agents
- Status tracking: orchestrator maintains a progress table per wave
</agent_teams>

<required_reading>
Read STATE.md before any operation to load project context.

@./references/dashboard-bridge.md
</required_reading>

<process>

<step name="initialize" priority="first">
Load all context in one call:

```bash
INIT=$(node ~/.claude/maxsim/bin/maxsim-tools.cjs init execute-phase "${PHASE_ARG}")
```

Parse JSON for: `executor_model`, `verifier_model`, `commit_docs`, `parallelization`, `branching_strategy`, `branch_name`, `phase_found`, `phase_dir`, `phase_number`, `phase_name`, `phase_slug`, `plans`, `incomplete_plans`, `plan_count`, `incomplete_count`, `state_exists`, `roadmap_exists`, `phase_req_ids`, `phase_issue_number`, `task_mappings`.

Also extract parallel execution fields:
```
WORKTREE_MODE (from init JSON worktree_mode — "auto", "always", or "never")
MAX_PARALLEL_AGENTS (from init JSON max_parallel_agents — default 10)
REVIEW_CONFIG (from init JSON review_config — spec_review, code_review, simplify_review, retry_limit)
```

**If `phase_found` is false:** Error — phase directory not found.
**If `plan_count` is 0:** Check GitHub before reporting no plans (see discover_and_group_plans step).
**If `state_exists` is false but `.planning/` exists:** Offer reconstruct or continue.

When `parallelization` is false, plans within a wave execute sequentially.
</step>

<step name="probe_dashboard">
Probe for MCP dashboard availability (see @dashboard-bridge). If `DASHBOARD_ACTIVE`, emit:
```
mcp__maxsim-dashboard__submit_lifecycle_event(
  event_type: "phase-started",
  phase_name: PHASE_NAME,
  phase_number: PHASE_NUMBER
)
```

**Note:** The dashboard is NOT auto-launched. Users start it explicitly via `maxsim dashboard`. This step only checks if a running dashboard is reachable via MCP.
</step>

<step name="handle_branching">
Check `branching_strategy` from init:

**"none":** Skip, continue on current branch.

**"phase" or "milestone":** Use pre-computed `branch_name` from init:
```bash
git checkout -b "$BRANCH_NAME" 2>/dev/null || git checkout "$BRANCH_NAME"
```

All subsequent commits go to this branch. User handles merging.
</step>

<step name="validate_phase">
From init JSON: `phase_dir`, `plan_count`, `incomplete_count`.

Report: "Found {plan_count} plans in {phase_dir} ({incomplete_count} incomplete)"
</step>

<step name="discover_and_group_plans">

## Plan Discovery -- GitHub First

When `phase_issue_number` is set (GitHub integration active):

1. **Check for external edits (WIRE-06):**
   ```
   mcp_detect_external_edits(issue_number: phase_issue_number)
   ```
   If external edits detected: warn user before continuing.

2. **Fetch the phase issue and its comments:**
   ```
   mcp_get_issue_detail(issue_number: phase_issue_number)
   ```

3. **Parse plan comments:** Identify comments containing either:
   - `<!-- maxsim:type=plan -->` HTML marker, OR
   - A heading `## Plan NN` (where NN is a number)

4. **For each plan comment:**
   - Extract plan number from the heading or frontmatter
   - Parse YAML frontmatter from the comment body for: `wave`, `dependencies`, `autonomous`, `objective`, `gap_closure`, `task_count`
   - Store plan content in memory as `PLAN_COMMENTS[]`

5. **Determine completion status for each plan:**
   - Call `mcp_list_sub_issues(issue_number: phase_issue_number)` to get all task sub-issues
   - A plan is complete when all its task sub-issues are closed (cross-reference using `task_mappings`)
   - Also check for `<!-- maxsim:type=summary -->` comments as a secondary completion signal

6. **Build plan inventory:**
   - `plans[]`: each with `id`, `wave`, `autonomous`, `objective`, `has_summary` (true if all sub-issues closed), `plan_comment_body`, `task_mappings`
   - `waves`: map of wave number → plan IDs
   - `incomplete`: IDs of plans that are not yet complete
   - `has_checkpoints`: true if any plan has `autonomous: false`

**Filtering:** Skip plans where `has_summary: true`. If `--gaps-only`: also skip non-gap_closure plans. If all filtered: "No matching incomplete plans" → exit.

**Fallback -- no GitHub integration:**

When `phase_issue_number` is not set, use local file scanning:

```bash
PLAN_INDEX=$(node ~/.claude/maxsim/bin/maxsim-tools.cjs phase-plan-index "${PHASE_NUMBER}")
```

Parse JSON for: `phase`, `plans[]` (each with `id`, `wave`, `autonomous`, `objective`, `files_modified`, `task_count`, `has_summary`), `waves` (map of wave number → plan IDs), `incomplete`, `has_checkpoints`.

**Skip plans where `has_summary: true`** (local SUMMARY.md file present). If `--gaps-only`: also skip non-gap_closure plans.

Report:
```
## Execution Plan

**Phase {X}: {Name}** — {total_plans} plans across {wave_count} waves

| Wave | Plans | What it builds |
|------|-------|----------------|
| 1 | 01-01, 01-02 | {from plan objectives, 3-8 words} |
| 2 | 01-03 | ... |
```
</step>

<step name="decide_execution_mode">
After discovering plans and grouping by wave, determine whether to use batch (worktree) or standard execution.

```bash
# Parse --worktrees / --no-worktrees flags from $ARGUMENTS
FLAG_OVERRIDE=""
if echo "$ARGUMENTS" | grep -q "\-\-worktrees"; then FLAG_OVERRIDE="worktrees"; fi
if echo "$ARGUMENTS" | grep -q "\-\-no-worktrees"; then FLAG_OVERRIDE="no-worktrees"; fi

# Call CLI decision function
MODE_RESULT=$(node ~/.claude/maxsim/bin/maxsim-tools.cjs decide-execution-mode \
  "${INCOMPLETE_PLAN_COUNT}" "${WAVE_COUNT}" \
  --worktree-mode "${WORKTREE_MODE}" \
  ${FLAG_OVERRIDE:+--flag-override "$FLAG_OVERRIDE"})
EXECUTION_MODE=$(echo "$MODE_RESULT" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).mode))")
```

Display decision:
```
**Execution Mode:** {Batch (worktree isolation) | Standard}
{If batch: "Will create {N} worktrees for parallel plan execution"}
{If standard and parallelization true: "Parallel within waves, sequential across waves"}
{If standard and parallelization false: "Sequential execution"}
```

**If batch mode, validate plan independence:**
```bash
# Build plans JSON from plan inventory data
VALID=$(node ~/.claude/maxsim/bin/maxsim-tools.cjs validate-plan-independence "$PLANS_JSON")
```
If conflicts found: report conflicts, fall back to standard mode with warning.
</step>

<step name="execute_waves">
Execute each wave in sequence. The execution path depends on `EXECUTION_MODE` from the decide_execution_mode step.

**BATCH PATH (when EXECUTION_MODE == "batch"):**

For each wave:

1. **Create worktrees for all plans in the wave:**
   ```bash
   for PLAN_ID in $WAVE_PLANS; do
     WT=$(node ~/.claude/maxsim/bin/maxsim-tools.cjs worktree-create "${PHASE_NUMBER}" "$PLAN_ID" "$WAVE_NUM")
     # Parse WT JSON for path and branch
   done
   ```

2. **Describe what is being built (BEFORE spawning):**

   Read each plan's `<objective>` from the plan comment content. Extract what is being built and why.

   ```
   ---
   ## Wave {N} (Batch Mode)

   **{Plan ID}: {Plan Name}**
   {2-3 sentences: what this builds, technical approach, why it matters}

   Spawning {count} isolated agent(s) in worktrees...
   ---
   ```

3. **Spawn executor agents with worktree isolation:**

   ```
   Task(
     subagent_type="executor",
     model="{executor_model}",
     isolation="worktree",
     team_name="maxsim-phase-{PHASE_NUMBER}-wave-{WAVE_NUM}",
     prompt="
       <objective>
       Execute plan {plan_number} of phase {phase_number}-{phase_name}.
       Commit each task atomically. Post SUMMARY as GitHub comment.
       Move task sub-issues on the board: In Progress when started, Done when completed.
       IMPORTANT: Do NOT update STATE.md or ROADMAP.md — the orchestrator handles metadata.
       </objective>

       <execution_context>
       @./workflows/execute-plan.md
       @./templates/summary.md
       @./references/checkpoints.md
       </execution_context>

       <github_context>
       Phase issue number: {phase_issue_number}
       Plan comment body: {plan_comment_body}
       Task mappings: {task_mappings_for_this_plan}
       </github_context>

       <files_to_read>
       Read these files at execution start using the Read tool:
       - .planning/STATE.md (State — READ ONLY, do not modify)
       - .planning/config.json (Config, if exists)
       - ./CLAUDE.md (Project instructions, if exists)
       </files_to_read>

       <constraints>
       - You are running in a worktree. Do NOT modify .planning/STATE.md or .planning/ROADMAP.md.
       - Only post summary comment to GitHub and commit task code.
       - The orchestrator will handle metadata updates after all agents complete.
       </constraints>

       <success_criteria>
       - [ ] All tasks executed
       - [ ] Each task committed individually
       - [ ] Summary posted as GitHub comment (type=summary) on phase issue #{phase_issue_number}
       - [ ] Task sub-issues moved: In Progress → Done per task
       </success_criteria>
     ",
     run_in_background=true
   )
   ```

4. **Track progress with status table** (update as agents complete):
   ```
   | Plan | Agent | Status | Duration |
   |------|-------|--------|----------|
   | 05-01 | agent-abc | Running... | 2m |
   | 05-02 | agent-def | Complete | 5m |
   ```

5. **After all agents in wave complete, collect results:**
   - Check for `<!-- maxsim:type=summary -->` comments on the phase issue for each plan
   - Run spot-checks (same as standard path: summary comment exists, commits present, sub-issues closed, review cycle check)
   - Orchestrator performs batch metadata updates:
     ```bash
     for PLAN_ID in $COMPLETED_PLANS; do
       node ~/.claude/maxsim/bin/maxsim-tools.cjs state advance-plan
       node ~/.claude/maxsim/bin/maxsim-tools.cjs state update-progress
     done
     node ~/.claude/maxsim/bin/maxsim-tools.cjs roadmap update-plan-progress "${PHASE_NUMBER}"
     ```
   - Report:
     ```
     ---
     ## Wave {N} Complete (Batch)

     **{Plan ID}: {Plan Name}**
     {What was built — from summary comment}
     {Notable deviations, if any}

     {If more waves: what this enables for next wave}
     ---
     ```

6. **Cleanup worktrees after wave completes:**
   ```bash
   node ~/.claude/maxsim/bin/maxsim-tools.cjs worktree-cleanup --all
   ```

7. **Prepare inter-wave handoff context (for waves after Wave 1):**

   When spawning agents for the next wave, include a brief context block so they can reference prior wave outputs without fetching full summary comments:

   ```
   <prior_wave_results>
   Wave {N-1} completed:
   {For each plan in prior wave: plan ID, one-liner from summary comment, key files created/modified}
   </prior_wave_results>
   ```

   Add this block to the `<objective>` section of the next wave's Task() prompts.

8. **Proceed to next wave.**

**STANDARD PATH (when EXECUTION_MODE == "standard"):**

**For each wave:**

1. **Describe what's being built (BEFORE spawning):**

   Read each plan's `<objective>` from the plan comment content (or local PLAN.md in fallback). Extract what's being built and why.

   ```
   ---
   ## Wave {N}

   **{Plan ID}: {Plan Name}**
   {2-3 sentences: what this builds, technical approach, why it matters}

   Spawning {count} agent(s)...
   ---
   ```

   - Bad: "Executing terrain generation plan"
   - Good: "Procedural terrain generator using Perlin noise — creates height maps, biome zones, and collision meshes. Required before vehicle physics can interact with ground."

2. **Emit plan-started lifecycle event** (if `DASHBOARD_ACTIVE`):
   ```
   mcp__maxsim-dashboard__submit_lifecycle_event(
     event_type: "plan-started",
     phase_name: PHASE_NAME, phase_number: PHASE_NUMBER,
     step: plan_index, total_steps: total_plans
   )
   ```

3. **Spawn executor agents:**

   Pass plan content from GitHub and GitHub context — executors do NOT need to read local PLAN.md files.
   This keeps orchestrator context lean (~10-15%).

   When the wave has multiple plans (parallel execution), add `team_name` to group agents:

   ```
   Task(
     subagent_type="executor",
     model="{executor_model}",
     team_name="maxsim-phase-{PHASE_NUMBER}-wave-{WAVE_NUM}",  // only for multi-plan waves
     prompt="
       <objective>
       Execute plan {plan_number} of phase {phase_number}-{phase_name}.
       Commit each task atomically. Post SUMMARY as GitHub comment. Update STATE.md and ROADMAP.md.
       Move task sub-issues on the board: In Progress when started, Done when completed.
       </objective>

       <execution_context>
       @./workflows/execute-plan.md
       @./templates/summary.md
       @./references/checkpoints.md
       @./references/tdd.md
       </execution_context>

       <github_context>
       Phase issue number: {phase_issue_number}
       Plan comment body: {plan_comment_body}
       Task mappings: {task_mappings_for_this_plan}
       </github_context>

       <files_to_read>
       Read these files at execution start using the Read tool:
       - .planning/STATE.md (State)
       - .planning/config.json (Config, if exists)
       - ./CLAUDE.md (Project instructions, if exists — follow project-specific guidelines and coding conventions)
       - .skills/ (Project skills, if exists — list skills, read SKILL.md for each, follow relevant rules during implementation)
       </files_to_read>

       <success_criteria>
       - [ ] All tasks executed
       - [ ] Each task committed individually
       - [ ] Summary posted as GitHub comment (type=summary) on phase issue #{phase_issue_number}
       - [ ] Task sub-issues moved: In Progress when started, Done when completed
       - [ ] STATE.md updated with position and decisions
       - [ ] ROADMAP.md updated with plan progress (via `roadmap update-plan-progress`)
       </success_criteria>
     "
   )
   ```

3. **Wait for all agents in wave to complete.**

4. **Report completion — spot-check claims and review cycle:**

   For each completed plan:
   - Fetch the phase issue comments and verify a `<!-- maxsim:type=summary -->` comment exists for this plan
   - Check `git log --oneline --all --grep="{phase}-{plan}"` returns ≥1 commit
   - Verify all task sub-issues for this plan are closed:
     ```
     mcp_list_sub_issues(issue_number: phase_issue_number)
     ```
   - Check for `## Self-Check: FAILED` in the summary comment body
   - **Check for `## Review Cycle` section** in the summary comment — verify both review stages (Spec and Code) show PASS or SKIPPED (not BLOCKED or FAIL)

   If ANY spot-check fails: report which plan failed, route to failure handler — ask "Retry plan?" or "Continue with remaining waves?"

   If review cycle is missing or has unresolved issues: flag the plan as **review-incomplete** — ask "Run review cycle for this plan?" or "Continue (review will block phase completion)?"

   **Note:** The executor agent runs the two-stage review (Spec Review + Code Review) after each wave. The orchestrator does NOT run reviews itself — it only checks the executor's review results in the summary comment. If review is missing, the executor failed to run it, and the orchestrator should offer to re-run the affected plan.

   Review stages to check: `Spec:` and `Code:` lines in `## Review Cycle`. Both must be PASS or SKIPPED for the plan to be considered review-complete.

   If pass — **emit plan-complete lifecycle event** (if `DASHBOARD_ACTIVE`):
   ```
   mcp__maxsim-dashboard__submit_lifecycle_event(
     event_type: "plan-complete",
     phase_name: PHASE_NAME, phase_number: PHASE_NUMBER,
     step: plan_index, total_steps: total_plans
   )
   ```

   Then report:
   ```
   ---
   ## Wave {N} Complete

   **{Plan ID}: {Plan Name}**
   {What was built — from summary comment}
   {Notable deviations, if any}

   {If more waves: what this enables for next wave}
   ---
   ```

   - Bad: "Wave 2 complete. Proceeding to Wave 3."
   - Good: "Terrain system complete — 3 biome types, height-based texturing, physics collision meshes. Vehicle physics (Wave 3) can now reference ground surfaces."

5. **Handle failures:**

   **Known Claude Code bug (classifyHandoffIfNeeded):** If an agent reports "failed" with error containing `classifyHandoffIfNeeded is not defined`, this is a Claude Code runtime bug — not a MAXSIM or agent issue. The error fires in the completion handler AFTER all tool calls finish. In this case: run the same spot-checks as step 4 (summary comment exists, git commits present, sub-issues closed, no Self-Check: FAILED). If spot-checks PASS → treat as **successful**. If spot-checks FAIL → treat as real failure below.

   For real failures: report which plan failed → ask "Continue?" or "Stop?" → if continue, dependent plans may also fail. If stop, partial completion report.

6. **Execute checkpoint plans between waves** — see `<checkpoint_handling>`.

7. **Prepare inter-wave handoff context (for waves after Wave 1):**

   When spawning agents for the next wave, include a brief context block so they can reference prior wave outputs without fetching full summary comments:

   ```
   <prior_wave_results>
   Wave {N-1} completed:
   {For each plan in prior wave: plan ID, one-liner from summary comment, key files created/modified}
   </prior_wave_results>
   ```

   Add this block to the `<objective>` section of the next wave's Task() prompts.

8. **Proceed to next wave.**
</step>

<step name="checkpoint_handling">
Plans with `autonomous: false` require user interaction.

**Auto-mode checkpoint handling:**

Read auto-advance config:
```bash
AUTO_CFG=$(node ~/.claude/maxsim/bin/maxsim-tools.cjs config-get workflow.auto_advance 2>/dev/null || echo "false")
```

When executor returns a checkpoint AND `AUTO_CFG` is `"true"`:
- **human-verify** → Auto-spawn continuation agent with `{user_response}` = `"approved"`. Log `⚡ Auto-approved checkpoint`.
- **decision** → Auto-spawn continuation agent with `{user_response}` = first option from checkpoint details. Log `⚡ Auto-selected: [option]`.
- **human-action** → Present to user (existing behavior below). Auth gates cannot be automated.

**Standard flow (not auto-mode, or human-action type):**

1. Spawn agent for checkpoint plan
2. Agent runs until checkpoint task or auth gate → returns structured state
3. Agent return includes: completed tasks table, current task + blocker, checkpoint type/details, what's awaited
4. **Present to user:**
   ```
   ## Checkpoint: [Type]

   **Plan:** 03-03 Dashboard Layout
   **Progress:** 2/3 tasks complete

   [Checkpoint Details from agent return]
   [Awaiting section from agent return]
   ```
5. User responds: "approved"/"done" | issue description | decision selection
6. **Spawn continuation agent (NOT resume)** using continuation-prompt.md template:
   - `{completed_tasks_table}`: From checkpoint return
   - `{resume_task_number}` + `{resume_task_name}`: Current task
   - `{user_response}`: What user provided
   - `{resume_instructions}`: Based on checkpoint type
   - `{github_context}`: Pass phase_issue_number and task_mappings for board transitions
7. Continuation agent verifies previous commits, continues from resume point
8. Repeat until plan completes or user stops

**Why fresh agent, not resume:** Resume relies on internal serialization that breaks with parallel tool calls. Fresh agents with explicit state are more reliable.

**Checkpoints in parallel waves:** Agent pauses and returns while other parallel agents may complete. Present checkpoint, spawn continuation, wait for all before next wave.
</step>

<step name="aggregate_results">
After all waves:

```markdown
## Phase {X}: {Name} Execution Complete

**Execution Mode:** {Batch (worktree) | Standard}
**Worktrees Used:** {N} (batch only — omit for standard mode)
**Waves:** {N} | **Plans:** {M}/{total} complete

| Wave | Plans | Status |
|------|-------|--------|
| 1 | plan-01, plan-02 | ✓ Complete |
| CP | plan-03 | ✓ Verified |
| 2 | plan-04 | ✓ Complete |

### Plan Details
1. **03-01**: [one-liner from summary comment]
2. **03-02**: [one-liner from summary comment]

### Review Cycle Summary
| Plan | Spec Review | Code Review | Retries |
|------|-------------|-------------|---------|
| 03-01 | PASS | PASS | 0 |
| 03-02 | PASS | PASS | 1 |

[Aggregate review findings from each plan's summary comment `## Review Cycle` section.
If any plan has no Review Cycle section in its summary comment: mark as "NOT RUN" and flag for attention.
If any plan has unresolved BLOCKED/FAIL status: list the blocking issues below.]

### Unresolved Review Issues
[List any plans with BLOCKED or FAIL review stages. These MUST be resolved before phase completion.]

### Issues Encountered
[Aggregate from summary comments, or "None"]
```

**Phase completion gate:** If any plan has unresolved review issues (BLOCKED or FAIL in Spec Review or Code Review stages), the phase CANNOT proceed to `verify_phase_goal`. Present unresolved issues and offer:
- "Fix review issues now" — re-run the review cycle for affected plans
- "Override and continue" — mark as acknowledged, proceed (adds warning to VERIFICATION.md)
</step>

<step name="close_parent_artifacts">
**For decimal/polish phases only (X.Y pattern):** Close the feedback loop by resolving parent UAT and debug artifacts.

**Skip if** phase number has no decimal (e.g., `3`, `04`) — only applies to gap-closure phases like `4.1`, `03.1`.

**1. Detect decimal phase and derive parent:**
```bash
# Check if phase_number contains a decimal
if [[ "$PHASE_NUMBER" == *.* ]]; then
  PARENT_PHASE="${PHASE_NUMBER%%.*}"
fi
```

**2. Find parent UAT:**

When GitHub integration is active, look for `<!-- maxsim:type=uat -->` comments on the parent phase issue:
```
mcp_get_issue_detail(issue_number: parent_phase_issue_number)
```

As fallback, check local files:
```bash
PARENT_INFO=$(node ~/.claude/maxsim/bin/maxsim-tools.cjs find-phase "${PARENT_PHASE}" --raw)
# Extract directory from PARENT_INFO JSON, then find UAT file in that directory
```

**If no parent UAT found:** Skip this step (gap-closure may have been triggered by VERIFICATION.md instead).

**3. Update UAT gap statuses:**

Read the parent UAT content (from comment or local file). For each gap entry with `status: failed`:
- Update to `status: resolved`

**4. If all gaps resolved — update UAT status:**

- If posting to GitHub: update the UAT comment body with resolved statuses
- If local file: update frontmatter `status: diagnosed` → `status: resolved`, update `updated:` timestamp

**5. Resolve referenced debug sessions:**

For each gap that has a `debug_session:` field:
- Read the debug session file
- Update frontmatter `status:` → `resolved`
- Update frontmatter `updated:` timestamp
- Move to resolved directory:
```bash
mkdir -p .planning/debug/resolved
mv .planning/debug/{slug}.md .planning/debug/resolved/
```

**6. Commit updated artifacts:**
```bash
node ~/.claude/maxsim/bin/maxsim-tools.cjs commit "docs(phase-${PARENT_PHASE}): resolve UAT gaps and debug sessions after ${PHASE_NUMBER} gap closure" --files .planning/phases/*${PARENT_PHASE}*/*-UAT.md .planning/debug/resolved/*.md
```
</step>

<step name="verify_phase_goal">
Verify phase achieved its GOAL, not just completed tasks.

```
Task(
  prompt="Verify phase {phase_number} goal achievement.
Phase directory: {phase_dir}
Phase issue: #{phase_issue_number}
Phase goal: {goal from ROADMAP.md}
Phase requirement IDs: {phase_req_ids}
Check must_haves against actual codebase.
Cross-reference requirement IDs from plan frontmatter against REQUIREMENTS.md — every ID MUST be accounted for.
Post verification results as a GitHub comment (mcp_post_comment with type=verification) on phase issue #{phase_issue_number}.
Also write VERIFICATION.md to the phase directory for local reference.",
  subagent_type="verifier",
  model="{verifier_model}"
)
```

Read status from the verification comment posted to GitHub:
```
mcp_get_issue_detail(issue_number: phase_issue_number)
```

Look for `<!-- maxsim:type=verification -->` comment and parse `status:` field.

Fallback:
```bash
grep "^status:" "$PHASE_DIR"/*-VERIFICATION.md | cut -d: -f2 | tr -d ' '
```

| Status | Action |
|--------|--------|
| `passed` | → update_roadmap |
| `human_needed` | Present items for human testing, get approval or feedback |
| `gaps_found` | Present gap summary, offer `/maxsim:plan {phase} --gaps` |

**If human_needed:**
```
## Phase {X}: {Name} — Human Verification Required

All automated checks passed. {N} items need human testing:

{From verification comment human_verification section}

"approved" → continue | Report issues → gap closure
```

**If gaps_found:**
```
## Phase {X}: {Name} — Gaps Found

**Score:** {N}/{M} must-haves verified
**Report:** Phase issue #{phase_issue_number} (verification comment)

### What's Missing
{Gap summaries from verification comment}

---
## Next Up

`/maxsim:plan {X} --gaps`

<sub>`/clear` first → fresh context window</sub>

Also: view the verification comment on issue #{phase_issue_number} for the full report
Also: `/maxsim:execute {X}` (includes verification) — manual testing first
```

Gap closure cycle: `/maxsim:plan {X} --gaps` reads verification comment → creates gap plans as new comments on phase issue (with `gap_closure: true` frontmatter) → user runs `/maxsim:execute {X} --gaps-only` → verifier re-runs.
</step>

<step name="update_roadmap">
**Mark phase complete and update all tracking files:**

```bash
COMPLETION=$(node ~/.claude/maxsim/bin/maxsim-tools.cjs phase complete "${PHASE_NUMBER}")
```

The CLI handles:
- Marking phase checkbox `[x]` with completion date
- Updating Progress table (Status → Complete, date)
- Updating plan count to final
- Advancing STATE.md to next phase
- Updating REQUIREMENTS.md traceability

Extract from result: `next_phase`, `next_phase_name`, `is_last_phase`.

```bash
node ~/.claude/maxsim/bin/maxsim-tools.cjs commit "docs(phase-{X}): complete phase execution" --files .planning/ROADMAP.md .planning/STATE.md .planning/REQUIREMENTS.md {phase_dir}/*-VERIFICATION.md
```

**Move phase issue to Done on GitHub:**
```
mcp_move_issue(issue_number: phase_issue_number, status: "Done")
```

**Post phase completion summary comment on the phase issue:**
```
mcp_post_comment(
  issue_number: phase_issue_number,
  type: "phase-complete",
  body: "## Phase {phase_number} Execution Complete\n\nAll plans executed and verified.\n\n**Execution Mode:** {Batch | Standard}\n**Waves:** {wave_count}\n**Plans:** {completed}/{total}\n**Verification:** Passed\n\n### Plan Summary\n{one-liner per plan from summary comments}"
)
```

**Emit phase-complete lifecycle event** (if `DASHBOARD_ACTIVE`):
```
mcp__maxsim-dashboard__submit_lifecycle_event(
  event_type: "phase-complete",
  phase_name: PHASE_NAME,
  phase_number: PHASE_NUMBER
)
```
</step>

<step name="offer_next">

**Exception:** If `gaps_found`, the `verify_phase_goal` step already presents the gap-closure path (`/maxsim:plan {X} --gaps`). No additional routing needed — skip auto-advance.

**No-transition check (spawned by auto-advance chain):**

Parse `--no-transition` flag from $ARGUMENTS.

**If `--no-transition` flag present:**

Execute-phase was spawned by plan-phase's auto-advance. Do NOT run transition.md.
After verification passes and roadmap is updated, return completion status to parent:

```
## PHASE COMPLETE

Phase: ${PHASE_NUMBER} - ${PHASE_NAME}
Plans: ${completed_count}/${total_count}
Verification: {Passed | Gaps Found}
GitHub: Phase issue #{phase_issue_number} moved to Done

[Include aggregate_results output]
```

STOP. Do not proceed to auto-advance or transition.

**If `--no-transition` flag is NOT present:**

**Auto-advance detection:**

1. Parse `--auto` flag from $ARGUMENTS
2. Read `workflow.auto_advance` from config:
   ```bash
   AUTO_CFG=$(node ~/.claude/maxsim/bin/maxsim-tools.cjs config-get workflow.auto_advance 2>/dev/null || echo "false")
   ```

**If `--auto` flag present OR `AUTO_CFG` is true (AND verification passed with no gaps):**

```
╔══════════════════════════════════════════╗
║  AUTO-ADVANCING → TRANSITION             ║
║  Phase {X} verified, continuing chain    ║
╚══════════════════════════════════════════╝
```

Execute the transition workflow inline (do NOT use Task — orchestrator context is ~10-15%, transition needs phase completion data already in context):

Read and follow `~/.claude/maxsim/workflows/transition.md`, passing through the `--auto` flag so it propagates to the next phase invocation.

**If neither `--auto` nor `AUTO_CFG` is true:**

The workflow ends. The user runs `/maxsim:progress` or invokes the transition workflow manually.
</step>

</process>

<context_efficiency>
Orchestrator: ~10-15% context. Subagents: fresh 200k each. No polling (Task blocks). No context bleed.
Plan content passed directly from GitHub comments to subagents — no local PLAN.md reads in the orchestrator.
</context_efficiency>

<failure_handling>
- **classifyHandoffIfNeeded false failure:** Agent reports "failed" but error is `classifyHandoffIfNeeded is not defined` → Claude Code bug, not MAXSIM. Spot-check (summary comment exists, commits present, sub-issues closed) → if pass, treat as success
- **Agent fails mid-plan:** Missing summary comment on GitHub → report, ask user how to proceed
- **Dependency chain breaks:** Wave 1 fails → Wave 2 dependents likely fail → user chooses attempt or skip
- **All agents in wave fail:** Systemic issue → stop, report for investigation
- **Checkpoint unresolvable:** "Skip this plan?" or "Abort phase execution?" → record partial progress in STATE.md
- **GitHub integration unavailable:** Fall back to local file I/O for all plan reading and summary writing
</failure_handling>

<resumption>
Re-run `/maxsim:execute {phase}` → discover_and_group_plans fetches the phase issue comments and checks sub-issue closure → skips plans with all sub-issues closed → resumes from first incomplete plan → continues wave execution.

STATE.md tracks: last completed plan, current wave, pending checkpoints.
</resumption>
