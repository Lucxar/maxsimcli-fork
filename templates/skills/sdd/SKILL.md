---
name: sdd
description: >-
  Spec-driven development with fresh-agent-per-task execution. Prevents context
  rot by isolating each task in a clean context window with its spec. Use when
  executing multi-task plans, orchestrating agent work, or when context
  accumulation degrades quality.
---

# Spec-Driven Development (SDD)

Execute tasks sequentially, each in a fresh agent with clean context. Verify every task before moving to the next.

## Why SDD

Context rot is the primary failure mode for multi-task execution. As an agent processes more tasks, earlier context competes with later instructions. Quality degrades predictably after 3-5 tasks in a single context window. SDD solves this by giving each task a fresh context with only its specification.

## The SDD Process

### 1. LOAD -- Read the Plan

- Read the plan file (PLAN.md) to get the ordered task list
- For each task: description, acceptance criteria, relevant files
- Confirm task order respects dependencies

### 2. DISPATCH -- Spawn Fresh Agent Per Task

For each task in order:

1. Assemble minimal task context:
   - Task description and acceptance criteria from the plan
   - Only the files relevant to this specific task
   - Results from previous tasks (commit hashes, created files) -- NOT the full previous context
2. Spawn a fresh agent with this minimal context
3. The agent implements the task, runs verification, and commits

### 3. REVIEW -- Two-Stage Quality Gate

After each task completes:

**Stage 1: Spec Compliance** -- Does the implementation match the task spec? Are all acceptance criteria met? Were only specified files modified?

**Stage 2: Code Quality** -- Are there bugs, edge cases, or error handling gaps? Is the code consistent with codebase conventions? Do all tests pass?

Verdict: PASS or FAIL with specific issues per stage.

### 4. FIX -- Address Review Failures

If either review stage fails:

1. Spawn a NEW fresh agent with original task spec + review feedback + current file state
2. Fix agent addresses ONLY the review issues -- no new features
3. Re-run both review stages
4. If 3 fix attempts fail: STOP and escalate

### 5. ADVANCE -- Move to Next Task

Only after both review stages pass:

- Record task as complete with commit hash
- Pass minimal summary (not full context) to the next task

## Context Management

Each agent receives ONLY what it needs:

| Context Item | Included? |
|---|---|
| Task description + acceptance criteria | Always |
| Files relevant to this task | Always |
| Previous task commit hashes | Always |
| Previous task full diff | Never |
| Previous task agent conversation | Never |
| Full codebase | Never -- only specified files |

The point of SDD is fresh context. Loading the previous agent's full context defeats the purpose.

## When to Use SDD

- **Good fit:** Multi-task plans (3+ tasks), sequential work where each task builds on the previous, implementations where quality degrades over time
- **Poor fit:** Single-task work, highly interactive tasks requiring user feedback, tasks that share significant overlapping context

## Common Pitfalls

| Pitfall | Why It Matters |
|---|---|
| Skipping review for simple tasks | Simple tasks still have bugs. Review catches what the implementer missed. |
| Passing full context forward | Full context causes the exact rot SDD is designed to prevent. |
| Deferring fixes to the next task | The next task's agent does not know about the bug. Fix it now. |

See also: `/verification-before-completion` for the evidence-based verification methodology used within each SDD task.
