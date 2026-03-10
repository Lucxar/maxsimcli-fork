<purpose>
Planning stage sub-workflow for /maxsim:plan. Spawns the planner agent to create PLAN.md files, then optionally spawns the planner (in plan-checking mode) for verification with a revision loop.

This file is loaded by the plan.md orchestrator. It does NOT handle gate confirmations or stage routing -- the orchestrator handles that. This sub-workflow focuses ONLY on creating and verifying plans.
</purpose>

<process>

## Step 1: Check Prerequisites

The orchestrator provides phase context. Verify we have what we need:

- `phase_number`, `phase_name`, `phase_dir`, `padded_phase`, `phase_slug`
- `planner_model`, `checker_model`, `plan_checker_enabled`
- `commit_docs`
- `state_path`, `roadmap_path`, `requirements_path`, `context_path`, `research_path`
- `phase_req_ids` (requirement IDs that this phase must address)
- `--skip-verify` flag presence

## Step 2: Resolve Models

```bash
PLANNER_MODEL=$(node .claude/maxsim/bin/maxsim-tools.cjs resolve-model planner --raw)
CHECKER_MODEL=$(node .claude/maxsim/bin/maxsim-tools.cjs resolve-model planner --raw)
```

## Step 3: Check Existing Plans

```bash
ls "${phase_dir}"/*-PLAN.md 2>/dev/null
```

**If plans exist:** Offer options via natural conversation:
```
Phase {phase_number} already has plan(s):
{list of existing plan files}

1. Add more plans (keep existing)
2. View existing plans
3. Re-plan from scratch (deletes existing plans)
```

- If "Add more": Continue to Step 4 with existing plans preserved.
- If "View": Display plan files, then re-offer options.
- If "Re-plan": Delete existing PLAN.md files, continue to Step 4.

**If no plans exist:** Continue to Step 4.

## Step 4: Gather Context Paths

Extract file paths from the orchestrator context (provided via init JSON):

```bash
STATE_PATH=$(echo "$INIT" | jq -r '.state_path // empty')
ROADMAP_PATH=$(echo "$INIT" | jq -r '.roadmap_path // empty')
REQUIREMENTS_PATH=$(echo "$INIT" | jq -r '.requirements_path // empty')
RESEARCH_PATH=$(echo "$INIT" | jq -r '.research_path // empty')
CONTEXT_PATH=$(echo "$INIT" | jq -r '.context_path // empty')
```

## Step 5: Spawn Planner

Display:
```
Planning Phase {phase_number}: {phase_name}...
```

Construct the planner prompt:

```markdown
<planning_context>
**Phase:** {phase_number}
**Mode:** standard

<files_to_read>
- {state_path} (Project State)
- {roadmap_path} (Roadmap)
- {requirements_path} (Requirements)
- {context_path} (USER DECISIONS from discussion stage)
- {research_path} (Technical Research)
</files_to_read>

**Phase requirement IDs (every ID MUST appear in a plan's `requirements` field):** {phase_req_ids}

**Project instructions:** Read ./CLAUDE.md if exists -- follow project-specific guidelines
**Project skills:** Check .skills/ directory (if exists) -- read SKILL.md files, plans should account for project skill rules
</planning_context>

<downstream_consumer>
Output consumed by /maxsim:execute. Plans need:
- Frontmatter (wave, depends_on, files_modified, autonomous)
- Tasks in XML format
- Verification criteria
- must_haves for goal-backward verification
</downstream_consumer>

<quality_gate>
- [ ] PLAN.md files created in phase directory
- [ ] Each plan has valid frontmatter
- [ ] Tasks are specific and actionable
- [ ] Dependencies correctly identified
- [ ] Waves assigned for parallel execution
- [ ] must_haves derived from phase goal
</quality_gate>
```

Spawn the planner:

```
Task(
  prompt=planner_prompt,
  subagent_type="planner",
  model="{planner_model}",
  description="Plan Phase {phase_number}"
)
```

## Step 6: Handle Planner Return

Parse the planner's return message:

- **`## PLANNING COMPLETE`:**
  Validate PLAN.md files were created:
  ```bash
  ls "${phase_dir}"/*-PLAN.md 2>/dev/null | wc -l
  ```

  If plans found:
  - Display plan count and filenames.
  - If `--skip-verify` flag is set OR `plan_checker_enabled` is false: skip to Step 9.
  - Otherwise: continue to Step 7 (verification).

  If no plans found:
  - Error: "Planner reported complete but no PLAN.md files found."
  - Offer: retry or abort.

- **`## CHECKPOINT REACHED`:**
  Present checkpoint to user, get response, spawn continuation agent with checkpoint context. If planner needs a decision, relay it to the user.

- **`## PLANNING INCONCLUSIVE`:**
  Display what was attempted. Offer:
  ```
  Planning inconclusive after {N} attempts.

  1. Provide more context and retry
  2. Try with different approach
  3. Abort
  ```
  Handle user choice accordingly.

## Step 7: Spawn Plan Checker

Initialize iteration tracking: `iteration_count = 1`.

Display:
```
Verifying plans...
```

Construct the checker prompt:

```markdown
<verification_context>
**Phase:** {phase_number}
**Phase Goal:** {goal from ROADMAP}

<files_to_read>
- {phase_dir}/*-PLAN.md (Plans to verify)
- {roadmap_path} (Roadmap)
- {requirements_path} (Requirements)
- {context_path} (USER DECISIONS from discussion stage)
- {research_path} (Technical Research)
</files_to_read>

**Phase requirement IDs (MUST ALL be covered):** {phase_req_ids}

**Project instructions:** Read ./CLAUDE.md if exists -- verify plans honor project guidelines
**Project skills:** Check .skills/ directory (if exists) -- verify plans account for project skill rules
</verification_context>

<expected_output>
- ## VERIFICATION PASSED -- all checks pass
- ## ISSUES FOUND -- structured issue list
</expected_output>
```

Spawn the checker:

```
Task(
  prompt="## Task: Verify plans achieve phase goal\n\n## Suggested Skills: verification-gates\n\n" + checker_prompt,
  subagent_type="planner",
  model="{checker_model}",
  description="Verify Phase {phase_number} plans"
)
```

## Step 8: Handle Checker Return and Revision Loop

- **`## VERIFICATION PASSED`:**
  Display confirmation:
  ```
  Plan verification passed.
  ```
  Continue to Step 9.

- **`## ISSUES FOUND`:**
  Display the issues found. Check iteration count.

  **If iteration_count < 3:**

  Display:
  ```
  Sending plans back for revision... (iteration {iteration_count}/3)
  ```

  Construct revision prompt:

  ```markdown
  <revision_context>
  **Phase:** {phase_number}
  **Mode:** revision

  <files_to_read>
  - {phase_dir}/*-PLAN.md (Existing plans)
  - {context_path} (USER DECISIONS from discussion stage)
  </files_to_read>

  **Checker issues:** {structured_issues_from_checker}
  </revision_context>

  <instructions>
  Make targeted updates to address checker issues.
  Do NOT replan from scratch unless issues are fundamental.
  Return what changed.
  </instructions>
  ```

  Spawn planner for revision:

  ```
  Task(
    prompt=revision_prompt,
    subagent_type="planner",
    model="{planner_model}",
    description="Revise Phase {phase_number} plans"
  )
  ```

  After planner returns: increment `iteration_count`, re-spawn checker (go back to Step 7).

  **If iteration_count >= 3:**

  Display:
  ```
  Max verification iterations reached. {N} issues remain:
  {issue list}

  1. Force proceed -- accept plans with known issues
  2. Provide guidance -- give planner hints and retry
  3. Abort -- stop planning
  ```

  Wait for user choice.

  - If "Force proceed": Continue to Step 9.
  - If "Provide guidance": Get user input, re-spawn planner with user guidance, reset iteration_count, go to Step 7.
  - If "Abort": Exit workflow.

## Step 9: Commit Plans

If `commit_docs` is true:

```bash
node .claude/maxsim/bin/maxsim-tools.cjs commit "docs(${padded_phase}): create phase plan" --files "${phase_dir}"
```

## Step 10: Return to Orchestrator

After plans are created and optionally verified, return control to the plan.md orchestrator. Do NOT show gate confirmation or next steps -- the orchestrator handles the final gate.

Display a brief completion message:
```
Planning complete. {plan_count} plan(s) created in {phase_dir}.
```

</process>

<success_criteria>
- Planner and checker models resolved from config
- Existing plans detected and handled (add/view/replan options)
- Planner agent spawned with full context (STATE.md, ROADMAP.md, REQUIREMENTS.md, CONTEXT.md, RESEARCH.md)
- PLAN.md files created and validated
- Checker verification loop runs (max 3 iterations) unless --skip-verify
- Revision loop sends issues back to planner for targeted fixes
- Plan files committed if commit_docs is true
- Control returned to orchestrator without showing gate or next steps
</success_criteria>
