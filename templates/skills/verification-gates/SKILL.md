---
name: verification-gates
description: >-
  Hard gate framework for evidence-based verification. Defines four gate types
  (input validation, pre-action, completion, quality), retry logic with feedback,
  anti-rationalization enforcement, and escalation protocol. Use when implementing
  verification checkpoints, completion gates, or quality checks.
user-invocable: false
---

# Verification Gates

Evidence before claims, always. No exceptions.

## Gate Types

### 1. Input Validation Gate

**When:** Before starting any work.
**Purpose:** Verify all required inputs exist (files, env vars, CLI args, state).

**Evidence required:**
- File existence checks (`test -f path`)
- Environment variable checks
- State file readability

**On failure:** Return structured error immediately. Do NOT attempt partial work.

```
AGENT RESULT: INPUT VALIDATION FAILED
Missing: [list of missing inputs]
Expected from: [source -- orchestrator, user, prior agent]
```

### 2. Pre-Action Gate

**When:** Before destructive actions (file writes, git commits, PRs, deployments).
**Purpose:** Verify intent and impact before irreversible changes.

**Evidence required:**
- State what will be changed
- Confirm target files/branches are correct
- Verify no unintended side effects (e.g., `git status` before commit)

**On failure:** Abort the action. Report what was wrong and what would have happened.

### 3. Completion Gate

**When:** Before claiming any task, plan, or phase is done.
**Purpose:** Verify all done criteria are met with fresh tool output.

**HARD GATE -- No completion claims without fresh verification evidence.**

Do NOT pass this gate by arguing it's "close enough", "minor issue", or "will fix later".
Either evidence passes or it fails. No middle ground.
Partial success is failure. "Good enough" is not enough.

If you have not run the verification command in THIS turn, you cannot claim it passes.

**Evidence required:**
- Run every verification command from the task's verify block
- Check every item in the done criteria list
- Produce an evidence block for each claim

### 4. Quality Gate

**When:** After implementation, before marking work as shippable.
**Purpose:** Verify code quality standards are met.

**Evidence required:**
- Test suite output (all passing, zero failures)
- Build output (exit code 0)
- Lint output (zero errors -- warnings acceptable if project allows)

**On failure:** Fix quality issues before proceeding. Do not defer quality failures.

## Anti-Rationalization

FORBIDDEN PHRASES -- if you catch yourself using these, STOP. You are rationalizing:

- "should work"
- "probably passes"
- "I'm confident that..."
- "based on my analysis..."
- "the logic suggests..."
- "it's reasonable to assume..."

These phrases replace evidence with reasoning. The gate requires tool output, not arguments.

Additional forbidden rationalizations:
- "It's close enough" -- close is not done
- "Minor issue, will fix later" -- later is never
- "The logic is correct so it must pass" -- run it and find out
- "I already verified this in a previous step" -- previous steps are stale; verify now

## Evidence Standard

Any tool output qualifies as evidence: test output, build results, git diff, file reads, linter output, command exit codes.

| Claim | Requires | Not Sufficient |
|-------|----------|----------------|
| "Tests pass" | Test command output showing 0 failures | Previous run, "should pass" |
| "Build succeeds" | Build command with exit code 0 | Linter passing only |
| "Bug is fixed" | Original failing test now passes | "Code changed, assumed fixed" |
| "Task complete" | All done criteria checked with evidence | "I implemented everything" |
| "No regressions" | Full test suite passing | "I only changed one file" |
| "File created" | `test -f path` or Read tool output | "I wrote it with Write tool" |

## Evidence Block Format

```
CLAIM: [what you are claiming]
EVIDENCE: [exact command run in THIS turn]
OUTPUT: [relevant excerpt of actual output]
VERDICT: PASS | FAIL
```

Produce one evidence block per claim. Group related claims if verified by the same command.

## Retry Protocol

Maximum 2 retries (3 total attempts) per gate.

**Retry feedback loop:**
1. Gate fails -- capture: what failed, expected result, actual result
2. Analyze the failure output (do not guess; read the error)
3. Fix the identified issue
4. Re-run the verification command
5. Produce a new evidence block

Each retry MUST include in its evidence block:
- Attempt number (1/3, 2/3, 3/3)
- What changed since last attempt
- Fresh verification output

**After 3rd failure -- escalation:**

Return full failure context to orchestrator:

```markdown
## GATE FAILURE -- ESCALATION

**Gate:** [gate type]
**Attempts:** 3/3
**Final evidence:**
CLAIM: [claim]
EVIDENCE: [command]
OUTPUT: [output]
VERDICT: FAIL

**History:**
- Attempt 1: [what failed, what was tried]
- Attempt 2: [what failed, what was tried]
- Attempt 3: [what failed -- escalating]

**Recommended action:** [what the orchestrator or user should do]
```

## Audit Trail

Log every gate attempt to GitHub Issues as a comment on the active phase issue:

- Gate name and type
- Attempt number
- Evidence provided (abbreviated)
- PASS or FAIL result
- Timestamp

This creates an auditable record of all verification activity for debugging and improvement.
