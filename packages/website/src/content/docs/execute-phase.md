---
id: execute-phase
title: Execute Phase
group: Workflow
---

`/maxsim:execute-phase` is the core execution engine. It reads all PLAN.md files for a phase, groups them by wave, and runs each wave's plans in parallel using Claude's subagent system.

{% codeblock language="bash" %}
/maxsim:execute-phase 1

# Only execute plans without SUMMARY.md (fill gaps, retry failed)
/maxsim:execute-phase 1 --gaps-only
{% /codeblock %}

Each executor agent works atomically: it commits after every completed task, writes a SUMMARY.md when all tasks are done, and updates STATE.md with decisions and metrics. If execution is interrupted, the next run with `--gaps-only` picks up exactly where things stopped — it skips any plan that already has a SUMMARY.md.

Deviation handling is built into the executor. When it encounters bugs, missing error handling, or blocking issues, it auto-fixes them (Rules 1-3) without asking for permission. When it encounters architectural decisions or new tables, it pauses and returns a structured checkpoint for you to review (Rule 4). All deviations are documented in SUMMARY.md.

### Deviation rules

{% doctable headers=["Rule", "Trigger", "Action"] rows=[["Rule 1", "Code doesn't work as intended", "Auto-fix inline, track in SUMMARY"], ["Rule 2", "Missing critical functionality (auth, validation)", "Auto-add, track in SUMMARY"], ["Rule 3", "Something blocks task completion", "Auto-fix blocker, track in SUMMARY"], ["Rule 4", "Architectural change required", "STOP — return checkpoint for human decision"]] %}
{% /doctable %}

{% callout type="note" %}
Wave parallelization requires Claude's extended thinking or subagent features. If your runtime doesn't support parallel subagents, plans execute sequentially in wave order.
{% /callout %}
