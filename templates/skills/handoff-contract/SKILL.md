---
name: handoff-contract
description: >-
  Structured return format for agent handoffs. Defines Key Decisions, Artifacts,
  Status, and Deferred Items sections that every agent must include when returning
  results. Use when completing any agent task, returning results to orchestrator,
  or transitioning between workflow stages.
user-invocable: false
---

# Handoff Contract

Every agent returns results using this structured format. The orchestrator depends on these sections for state tracking, artifact management, and pipeline decisions.

## Required Return Sections

### Key Decisions

Document decisions made during execution that affect downstream work:

```markdown
### Key Decisions
- Chose X over Y because [reason]
- Deferred Z to [phase/plan] because [reason]
```

Include: technology choices, scope adjustments, interpretation of ambiguous requirements. Omit: routine implementation details.

### Artifacts

List all files created or modified, grouped by action:

```markdown
### Artifacts
- Created: path/to/new-file.ts
- Created: path/to/another-file.md
- Modified: path/to/existing-file.ts
```

Use absolute paths from project root. Include every file touched, not just the primary deliverables.

### Status

One of three values:

| Status | Meaning | Orchestrator Action |
|--------|---------|-------------------|
| `complete` | All tasks done, verification passed | Advance to next plan or stage |
| `blocked` | Cannot proceed without external input | Present blocker to user, await resolution |
| `partial` | Some tasks done, stopped at checkpoint | Resume from checkpoint with user input |

```markdown
### Status
complete
```

### Deferred Items

Work discovered but not implemented (outside current scope):

```markdown
### Deferred Items
- [feature] Add caching layer -- not in current plan scope
- [bug] Race condition in parallel writes -- needs investigation
- [refactor] Extract shared validation logic -- deferred to Phase 5
```

If none: `### Deferred Items\nNone`

Categories: `feature`, `bug`, `refactor`, `investigation`
