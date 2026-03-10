---
name: memory-management
description: >-
  Pattern and error persistence across sessions. Defines what to persist, where
  to store it, and when to capture. Use when encountering recurring patterns,
  solving non-trivial problems, making architectural decisions, or discovering
  environment-specific behaviors.
---

# Memory Management

Context dies with each session. Patterns discovered but not saved are patterns lost.

## What to Persist

| Trigger | Threshold | What to Save |
|---------|-----------|-------------|
| Same error encountered | 2+ occurrences | Error pattern, root cause, fix |
| Same debugging path followed | 2+ times | The shortcut or solution |
| Architectural decision made | Once (if significant) | Decision, rationale, alternatives rejected |
| Non-obvious convention discovered | Once | The convention and where it applies |
| Workaround for tooling/framework quirk | Once | The quirk and the workaround |
| Project-specific pattern confirmed | 2+ uses | The pattern and when to apply it |

**Do NOT save:** Session-specific context, information already in CLAUDE.md, speculative conclusions, temporary workarounds, or obvious patterns.

## Where to Store

| Location | Content | When Loaded |
|----------|---------|-------------|
| STATE.md | Project-level decisions, blockers, metrics | Every MAXSIM session |
| CLAUDE.md | Project conventions, build commands, architecture | Every Claude Code session |
| LESSONS.md | Cross-session codebase-specific lessons | MAXSIM execution startup |

### Entry Format

```markdown
- [YYYY-MM-DD] [{phase}-{plan}] {actionable lesson}
```

For LESSONS.md entries. For STATE.md decisions, use the `state add-decision` tool.

## When to Persist

Persist at natural breakpoints:

- After resolving a non-trivial bug (save error pattern + fix)
- After making an architectural decision (save decision + rationale)
- After discovering a recurring pattern (save pattern + when to apply)
- At checkpoints (save current understanding before context resets)
- At session end (review what was learned, save anything missed)

## Error Escalation

```
Error seen once     -- Note it, move on
Error seen twice    -- Save to LESSONS.md with pattern and fix
Error seen 3+ times -- Save AND add to CLAUDE.md for immediate visibility
```

## Process

1. **DETECT** -- Recognize a save trigger from the table above
2. **CHECK** -- Read existing memory files before writing to avoid duplicates
3. **WRITE** -- Add the entry to the appropriate file
4. **VERIFY** -- Re-read the file to confirm the entry was written correctly and is actionable

## Common Pitfalls

- Encountering the same error a second time without saving it
- Making the same architectural decision you made in a previous session
- Debugging a problem you already solved before
- Leaving a session without updating memory for patterns discovered

If any of these occur: stop, write the memory entry now, then continue.
