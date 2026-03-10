---
name: maxsim-batch
description: >-
  Parallel worktree execution for independent work units. Isolates agents in
  separate git worktrees for conflict-free parallel implementation. Use when
  executing multiple independent plans, batch processing, or parallelizable
  tasks.
---

# Batch Worktree Execution

Decompose large tasks into independent units and execute each in an isolated git worktree.

## When to Use

- 3 or more independent work units with no shared file modifications
- Tasks that can be verified independently (each unit's tests pass without the others)
- Parallelizable implementation where speed matters

**Do not use for:** Fewer than 3 units (overhead not worth it), sequential dependencies, tasks that modify the same files.

## Process

### 1. DECOMPOSE -- Analyze Independence

List all units with a one-line description each. For each unit, list the files it will create or modify. Verify:

- No file appears in more than one unit
- No runtime dependency (unit A output is not unit B input)
- Each unit's tests pass without the other units' changes

If overlap exists, merge overlapping units or extract shared code into a prerequisite unit that runs first.

### 2. PLAN -- Define Unit Specifications

For each unit, prepare:

- Unit description and acceptance criteria
- The list of files it owns (and only those files)
- The base branch to branch from
- Instructions: implement, test, commit, push, create PR

### 3. SPAWN -- Create Worktree Per Unit

For each unit, create an isolated worktree and spawn an agent. Each agent works independently: read source, implement changes, run tests, commit, push, create PR.

### 4. TRACK -- Monitor Progress

Maintain a status table:

| # | Unit | Status | PR |
|---|------|--------|----|
| 1 | description | done | #123 |
| 2 | description | in-progress | -- |

Statuses: `pending`, `in-progress`, `done`, `failed`

### 5. MERGE -- Collect Results

When all units complete, list all created PRs. Handle failures:

- Unit fails tests: spawn a fix agent in the same worktree
- Merge conflict: decomposition was wrong -- fix overlap and re-run unit
- 3+ failures on same unit: stop and escalate

## Limits

- Up to 30 parallel agents, but typically 3-10 for manageable coordination
- Fast-forward merge preferred, rebase if needed
- Each unit must be independently mergeable

## Common Pitfalls

- "The overlap is minor" -- Minor overlap causes merge conflicts. Split shared code into a prerequisite unit.
- "We'll merge in the right order" -- Order-dependent merges are not independent. Serialize those units.
- "Only 2 units, let's still use worktrees" -- Worktree overhead is not worth it for fewer than 3 units.

## Verification

Before reporting completion:

- [ ] All units touch non-overlapping files
- [ ] Each unit was implemented in an isolated worktree
- [ ] Each unit's tests pass independently
- [ ] Each unit has its own PR
- [ ] No PR depends on another PR being merged first
