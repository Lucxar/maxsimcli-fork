---
id: gap-closure
title: Gap Closure
group: Advanced
---

When verify-work finds broken items, it doesn't just report them — it creates focused fix phases automatically. If phase 1 has two broken items, they become phases 1.1 and 1.2. Each has its own PLAN.md and is executed independently.

{% codeblock language="bash" %}
# After verify-work finds broken items:
/maxsim:execute-phase 1.1
/maxsim:execute-phase 1.2

# Or re-run only plans without SUMMARY.md:
/maxsim:execute-phase 1 --gaps-only
{% /codeblock %}

The `--gaps-only` flag makes execute-phase skip any plan that already has a SUMMARY.md. This is the fastest way to retry after partial execution — you don't need to know which plans failed, MAXSIM figures it out from the filesystem.

After closing all gaps, re-run verify-work to confirm. Verification creates a new VERIFICATION.md that supersedes the previous one. The phase is marked complete only when a verification pass finds no broken items.
