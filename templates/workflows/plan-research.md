<purpose>
Research stage sub-workflow for /maxsim:plan. Spawns the researcher agent with phase context to produce RESEARCH.md.

This file is loaded by the plan.md orchestrator. It does NOT handle gate confirmations or stage routing -- the orchestrator handles that. This sub-workflow focuses ONLY on running research and validating the output.
</purpose>

<process>

## Step 1: Check Prerequisites

The orchestrator provides phase context. Verify we have what we need:

- `phase_number`, `phase_name`, `phase_dir`, `padded_phase`, `phase_slug`
- `researcher_model`, `research_enabled`
- `has_research` (whether RESEARCH.md already exists)
- `state_path`, `roadmap_path`, `requirements_path`, `context_path`
- `phase_req_ids` (requirement IDs that this phase must address)
- `--force-research` flag presence

## Step 2: Resolve Researcher Model

```bash
RESEARCHER_MODEL=$(node .claude/maxsim/bin/maxsim-tools.cjs resolve-model researcher --raw)
```

## Step 3: Check Existing Research

**If `has_research` is true AND `--force-research` is NOT set:**

Research already exists. Display:
```
Using existing research from: {research_path}
```

Return control to orchestrator -- no need to re-research.

**If `has_research` is true AND `--force-research` IS set:**

Continue to Step 4 (re-research will overwrite existing RESEARCH.md).

**If `has_research` is false:**

Continue to Step 4.

**If `research_enabled` is false AND `--force-research` is NOT set:**

Research is disabled in config. Display:
```
Research disabled in config (workflow.research = false).
Skipping research stage.
```

Return control to orchestrator.

## Step 4: Gather Phase Context

```bash
PHASE_DESC=$(node .claude/maxsim/bin/maxsim-tools.cjs roadmap get-phase "${PHASE}" 2>/dev/null)
```

Extract the phase section/description from the JSON output for the researcher prompt.

## Step 5: Spawn Researcher

Display:
```
Researching Phase {phase_number}: {phase_name}...
```

Construct the research prompt:

```markdown
<objective>
Research how to implement Phase {phase_number}: {phase_name}
Answer: "What do I need to know to PLAN this phase well?"
</objective>

<files_to_read>
- {context_path} (USER DECISIONS -- locked choices that constrain research)
- {requirements_path} (Project requirements)
- {state_path} (Project decisions and history)
</files_to_read>

<additional_context>
**Phase description:** {phase_description from PHASE_DESC}
**Phase requirement IDs (MUST address):** {phase_req_ids}

**Project instructions:** Read ./CLAUDE.md if exists -- follow project-specific guidelines
**Project skills:** Check .skills/ directory (if exists) -- read SKILL.md files, research should account for project skill patterns
</additional_context>

<output>
Write to: {phase_dir}/{padded_phase}-RESEARCH.md
</output>
```

Spawn the researcher:

```
Task(
  prompt=research_prompt,
  subagent_type="researcher",
  model="{researcher_model}",
  description="Research Phase {phase_number}"
)
```

## Step 6: Handle Researcher Return

Parse the researcher's return message:

- **`## RESEARCH COMPLETE`:**
  Validate RESEARCH.md was created:
  ```bash
  test -f "${phase_dir}/${padded_phase}-RESEARCH.md" && echo "FOUND" || echo "MISSING"
  ```

  If FOUND:
  - If `commit_docs` is true:
    ```bash
    node .claude/maxsim/bin/maxsim-tools.cjs commit "docs(${padded_phase}): research phase domain" --files "${phase_dir}/${padded_phase}-RESEARCH.md"
    ```
  - Display confirmation:
    ```
    Research complete. RESEARCH.md written to {path}.
    ```
  - Return control to orchestrator.

  If MISSING:
  - Error: "Researcher reported complete but RESEARCH.md not found at expected path."
  - Check for alternative paths:
    ```bash
    ls "${phase_dir}"/*RESEARCH* 2>/dev/null
    ```
  - If found elsewhere, note the actual path and continue.
  - If truly missing, offer: retry or skip research.

- **`## RESEARCH BLOCKED`:**
  Display the blocker reason. Offer options:
  ```
  Research blocked: {reason}

  1. Provide additional context and retry
  2. Skip research and proceed to planning
  3. Abort
  ```
  Wait for user choice.

  - If "Provide context": Get additional info, re-spawn researcher with augmented prompt.
  - If "Skip": Return to orchestrator without RESEARCH.md.
  - If "Abort": Exit workflow.

- **`## RESEARCH INCONCLUSIVE`:**
  Display what was attempted. Offer:
  ```
  Research inconclusive after {N} attempts.

  1. Provide more context and retry
  2. Skip research
  3. Abort
  ```
  Handle same as BLOCKED options.

## Step 7: Return to Orchestrator

After RESEARCH.md is validated (or research is skipped), return control to the plan.md orchestrator. Do NOT show gate confirmation or next steps -- the orchestrator handles the gate between Research and Planning.

</process>

<success_criteria>
- Researcher model resolved from config
- Existing research detected and reused (unless --force-research)
- researcher agent spawned with full context (CONTEXT.md, requirements, state)
- RESEARCH.md created and validated
- Blocked/inconclusive scenarios handled with user options
- Control returned to orchestrator without showing gate or next steps
</success_criteria>
