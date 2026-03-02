---
name: sdd
description: >-
  Executes plan tasks sequentially, each in a fresh subagent with minimal context,
  with mandatory two-stage review between tasks. Use when executing sequential
  tasks where context rot is a concern or running spec-driven dispatch.
---

# Spec-Driven Dispatch (SDD)

Execute tasks sequentially, each in a fresh subagent with clean context. Review every task before moving to the next.

**HARD GATE** -- No task starts until the previous task passes two-stage review. If the review found issues, they must be fixed before the next task begins. No exceptions, no deferral, no skipping review for simple tasks.

## Process

### 1. LOAD -- Read the Plan

- Read the plan file (PLAN.md) to get the ordered task list
- For each task, identify: description, acceptance criteria, relevant files
- Confirm task order makes sense (later tasks may depend on earlier ones)

### 2. DISPATCH -- Spawn Fresh Agent Per Task

For each task in order:

1. Assemble the task context:
   - Task description and acceptance criteria from the plan
   - Only the files relevant to this specific task
   - Results from previous tasks (commit hashes, created files) -- NOT the full previous context
2. Spawn a fresh agent with this minimal context
3. The agent implements the task, runs tests, and commits

### 3. REVIEW -- Two-Stage Quality Gate

After each task completes, run two review stages before proceeding:

**Stage 1: Spec Compliance**

- Does the implementation match the task description?
- Are all acceptance criteria met?
- Were only the specified files modified (no scope creep)?
- Do the changes align with the plan's intent?

Verdict: PASS or FAIL with specific issues.

**Stage 2: Code Quality**

- Are there obvious bugs, edge cases, or error handling gaps?
- Is the code readable and consistent with codebase conventions?
- Are there unnecessary complications or dead code?
- Do all tests pass?

Verdict: PASS or FAIL with specific issues.

### 4. FIX -- Address Review Failures

If either review stage fails:

1. Spawn a NEW fresh agent with the original task description, the review feedback, and the current file state
2. The fix agent addresses ONLY the review issues -- no new features
3. Re-run both review stages on the fixed code
4. If 3 fix attempts fail: STOP and escalate to the user

### 5. ADVANCE -- Move to Next Task

Only after both review stages pass:

- Record the task as complete
- Note the commit hash and any files created or modified
- Pass this minimal summary (not full context) to the next task's agent

### 6. REPORT -- Final Summary

After all tasks complete:

- List each task with its status and commit hash
- Note any tasks that required fix iterations
- Summarize the total changes made

## Context Management Rules

Each agent receives ONLY what it needs:

| Context Item | Included? |
|---|---|
| Task description + acceptance criteria | Always |
| Files relevant to this task | Always |
| Previous task commit hashes | Always |
| Previous task full diff | Never |
| Previous task agent conversation | Never |
| PROJECT.md / REQUIREMENTS.md | Only if task references project-level concerns |
| Full codebase | Never -- only specified files |

The point of SDD is fresh context. Loading the previous agent's full context defeats the purpose.

## Common Pitfalls

| Pitfall | Why it matters |
|---|---|
| Skipping review for simple tasks | Simple tasks still have bugs. Review takes seconds for simple code. |
| Passing full context forward | Full context causes context rot. Minimal summaries keep agents effective. |
| Deferring fixes to the next task | The next task's agent does not know about the bug. Fix it now. |
| Accumulating fix-later items across tasks | Each task must be clean before the next starts. |

## Verification

Before reporting completion, confirm:

- [ ] Every task was executed by a fresh agent with minimal context
- [ ] Every task passed both spec compliance and code quality review
- [ ] No task was skipped or started before the previous task passed review
- [ ] Fix iterations (if any) are documented
- [ ] All tests pass after the final task
- [ ] Summary includes per-task status and commit hashes

## MAXSIM Integration

When a plan specifies `skill: "sdd"`:

- The orchestrator reads tasks from PLAN.md in order
- Each task is dispatched to a fresh subagent
- Two-stage review runs between every task
- Failed reviews trigger fix agents (up to 3 attempts)
- Progress is tracked in STATE.md via decision entries
- Final results are recorded in SUMMARY.md
