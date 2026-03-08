---
id: plan-phase
title: Plan Phase
group: Workflow
---

`/maxsim:plan-phase` is where research becomes executable plans. It spawns up to three sequential agents: a phase researcher that studies the codebase and domain, a planner that creates task breakdowns, and a plan-checker that verifies the plan will actually achieve the phase goal.

{% codeblock language="bash" %}
/maxsim:plan-phase 1

# Skip research (already done or small phase)
/maxsim:plan-phase 1 --skip-research

# Skip verification (speed over thoroughness)
/maxsim:plan-phase 1 --skip-verify

# Fully autonomous — no pauses for decisions
/maxsim:plan-phase 1 --auto
{% /codeblock %}

Each PLAN.md is a structured document with frontmatter (phase, plan number, type, wave, dependencies), an objective, task breakdown with type annotations (auto vs checkpoint), verification criteria, and success conditions. The plan-checker reads this document and validates that it's complete, unambiguous, and correctly scoped.

Plans support wave-based parallelization via the `wave` frontmatter field. Plans in wave 1 run in parallel, then wave 2 runs after all wave 1 plans complete, and so on. The planner infers wave assignments from task dependencies.

### Plan types

{% doctable headers=["Type", "Meaning"] rows=[["auto", "Fully autonomous — executor runs without pausing"], ["checkpoint:human-verify", "Pauses for you to visually verify the result in a browser"], ["checkpoint:decision", "Pauses when an architectural choice needs human input"], ["checkpoint:human-action", "Pauses when a manual step is unavoidable (auth code, email link)"]] %}
{% /doctable %}
