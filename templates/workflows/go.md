<purpose>
Auto-detect project state through deep context gathering, surface problems proactively, and dispatch to the appropriate MAXSIM command. Uses the Show + Act pattern: display detection reasoning first, then act immediately.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="immediate_feedback">
**Show immediate feedback while gathering context:**

```
Analyzing project state...
```

This ensures the user sees something immediately while context gathering runs.
</step>

<step name="deep_context_gathering">
**Phase 1: Deep Context Gathering**

Gather all project signals in parallel for speed. Run these checks simultaneously:

**1. Project existence check:**
```bash
PLANNING_EXISTS=$(test -d .planning && echo "true" || echo "false")
```

If `.planning/` does not exist, skip all other checks and go directly to the decision tree (Rule 1: No project found).

**2. Load project state (if .planning/ exists):**
```bash
# State snapshot
STATE=$(node ~/.claude/maxsim/bin/maxsim-tools.cjs state-snapshot 2>/dev/null || echo "{}")

# Roadmap analysis
ROADMAP=$(node ~/.claude/maxsim/bin/maxsim-tools.cjs roadmap analyze 2>/dev/null || echo "{}")
```

**3. Read key files (if they exist):**
- `.planning/PROJECT.md` -- project name and vision
- `.planning/STATE.md` -- blockers, decisions, session continuity
- `.planning/ROADMAP.md` -- phase structure and progress

**4. Git context:**
```bash
# Uncommitted changes
GIT_STATUS=$(git status --porcelain 2>/dev/null | head -20)

# Recent commits
RECENT_COMMITS=$(git log --oneline -5 2>/dev/null)
```

**5. Phase directory scan:**
```bash
# List phase directories and their contents
ls -1 .planning/phases/ 2>/dev/null
```

For each phase directory, check for PLAN.md, SUMMARY.md, CONTEXT.md, RESEARCH.md files to determine phase state.
</step>

<step name="problem_detection">
**Phase 2: Problem Detection**

Check for problems BEFORE suggesting any action. All problems are blocking -- no severity tiers.

**Check each of these in order:**

**1. Uncommitted changes in .planning/**
```bash
git status --porcelain .planning/ 2>/dev/null | head -10
```
If uncommitted changes exist in `.planning/`:
```
## Problem Detected

**Issue:** Uncommitted changes in .planning/ directory
**Impact:** State drift -- local planning files may diverge from team or lose work
**Resolution:** Commit planning changes to preserve state

**Files with changes:**
{list of changed files}

Resolve this before continuing. Options:
1. Commit now (recommended)
2. Investigate changes first
3. Skip and continue anyway
```

Block until user responds.

**2. Blockers in STATE.md**
Extract blockers from state snapshot. If any exist:
```
## Problem Detected

**Issue:** Active blocker recorded in project state
**Blocker:** {blocker text}
**Impact:** Execution cannot proceed safely until this is resolved
**Resolution:** Address the blocker or remove it if no longer relevant

Resolve this before continuing. Options:
1. Investigate and resolve
2. Remove blocker (if no longer relevant)
3. Skip and continue anyway
```

Block until user responds.

**3. Failed verification**
Check for VERIFICATION.md in the current/latest phase with FAIL status:
```bash
grep -l "FAIL\|status: failed" .planning/phases/*/VERIFICATION.md 2>/dev/null | tail -1
```
If found:
```
## Problem Detected

**Issue:** Phase verification failed
**Phase:** {phase number and name}
**Impact:** Phase is not verified as complete -- may have gaps
**Resolution:** Re-run verification or fix identified issues

Resolve this before continuing. Options:
1. View verification results
2. Re-execute to fix issues
3. Skip and continue anyway
```

Block until user responds.

**If any problem is found:** Surface it and wait for user resolution. Do NOT proceed to the decision tree until all problems are cleared or explicitly skipped.

**If no problems found:** Proceed to the decision tree.
</step>

<step name="decision_tree">
**Phase 3: Decision Tree**

Apply rules in strict precedence order. The FIRST matching rule determines the action.

```
Rule 1: No .planning/ directory?
  -> Action: /maxsim:init
  -> Reasoning: "No MAXSIM project found in this directory."

Rule 2: Has blockers in STATE.md? (not cleared in problem detection)
  -> Action: Surface blocker, suggest resolution
  -> Reasoning: "BLOCKED: {blocker text}"

Rule 3: Active phase has plans but not all executed?
  -> Check: summaries < plans in current phase directory
  -> Action: /maxsim:execute {N}
  -> Reasoning: "Phase {N} ({name}) has {X} plans, {Y} executed. Ready to continue."

Rule 4: Active phase needs planning? (no PLAN.md files)
  -> Check: no PLAN.md files in current phase directory
  -> Action: /maxsim:plan {N}
  -> Reasoning: "Phase {N} ({name}) needs planning."

  Sub-check: Does CONTEXT.md exist?
  -> If yes: "Discussion complete, ready for research + planning."
  -> If no: "Starting from discussion stage."

Rule 5: Current phase complete, next phase exists?
  -> Check: all plans have summaries AND next phase exists in roadmap
  -> Action: /maxsim:plan {N+1}
  -> Reasoning: "Phase {N} complete. Next: Phase {N+1} ({name})."

Rule 6: All phases complete?
  -> Check: all phases in roadmap have all plans executed
  -> Action: /maxsim:progress
  -> Reasoning: "All phases complete. Milestone ready for review."

Rule 7: None of the above?
  -> Action: Show interactive menu
  -> Reasoning: "Project state is ambiguous. Here are your options."
```
</step>

<step name="show_and_act">
**Phase 4: Show + Act**

Once a rule matches, display detection reasoning FIRST, then act immediately.

**Format for auto-dispatch (Rules 1-6):**

```
## Detected: {summary of what was found}

**Project:** {project name from PROJECT.md, or "New project"}
**Milestone:** {milestone from ROADMAP.md, or "Not started"}
**Current phase:** {phase N - name, or "None"}
**Status:** {description of current state}

**Action:** Running /maxsim:{command} {args}...
```

Then immediately dispatch the command using the SlashCommand tool. The user can Ctrl+C if the detection is wrong.

**Important:** Show the detection block, then dispatch. Do not ask for confirmation -- this is Show + Act, not Show + Ask.
</step>

<step name="interactive_menu">
**Phase 5: Interactive Menu (Rule 7 -- no obvious action)**

When no clear action is detected, show a contextual menu. The menu items are NOT static -- filter based on what makes sense for the current project state.

```
## Project Status

**Project:** {project name}
**Milestone:** {milestone}
**Progress:** {X}/{Y} phases complete

What would you like to do?

1. /maxsim:plan {next_phase} -- Plan next phase
2. /maxsim:quick -- Quick ad-hoc task
3. /maxsim:progress -- View detailed progress
4. /maxsim:debug -- Debug an issue

Or describe what you'd like to do:
```

**Contextual filtering rules:**
- If phases are planned but not executed: show execute options prominently
- If all phases are done: show `/maxsim:progress` (offers milestone completion)
- If recent git activity suggests debugging: show `/maxsim:debug` prominently
- If no phases exist: show `/maxsim:plan` prominently
- Always include `/maxsim:quick` as it is always relevant
- Always include an open-ended fallback ("Or describe what you'd like to do")

Wait for user selection, then dispatch the chosen command.
</step>

</process>

<constraints>
- Never ask for confirmation before dispatching (Show + Act, not Show + Ask)
- Always surface problems BEFORE suggesting actions
- All problems block -- no severity tiers, no "warnings"
- No arguments accepted -- this is pure auto-detection
- No mention of old commands (plan-phase, execute-phase, etc.)
- Keep initial feedback fast -- show "Analyzing..." before heavy operations
- If context gathering fails (tools not available, etc.), fall back to the interactive menu
</constraints>
