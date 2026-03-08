---
id: verify-work
title: Verify Work
group: Workflow
---

`/maxsim:verify-work` validates that a completed phase actually delivers what it promised. The verifier agent reads ROADMAP.md, all SUMMARY.md files for the phase, and systematically checks each deliverable against the original plan's success criteria.

{% codeblock language="bash" %}
/maxsim:verify-work 1
{% /codeblock %}

Verification runs in two passes. First, the integration checker validates that cross-phase connections are intact — APIs that phase 2 depends on were correctly built in phase 1. Second, the verifier runs a UAT-style session where it exercises actual functionality and records pass/fail against specific acceptance criteria.

For every broken item found, verify-work creates a decimal fix phase. If phase 1 has two broken items, you'll get phases 1.1 and 1.2 — each with its own focused PLAN.md. Run `/maxsim:execute-phase 1.1` to close the gap, then re-run verify-work to confirm the fix.

{% callout type="tip" %}
Don't skip verify-work to save time. The UAT session catches integration issues that individual executor tests miss — especially cross-phase contract violations and edge cases in user flows that weren't explicitly specified.
{% /callout %}
