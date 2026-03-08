---
id: milestones
title: Milestones
group: Workflow
---

Milestones group phases into shippable deliverables. After completing all phases in a milestone, you audit, gap-close, and archive the milestone. MAXSIM provides three commands for this workflow.

{% codeblock language="bash" %}
# Audit milestone — find gaps before archiving
/maxsim:audit-milestone

# Create fix phases for all gaps found in the audit
/maxsim:plan-milestone-gaps

# Archive the milestone and start the next one
/maxsim:complete-milestone

# Create a new milestone in ROADMAP.md
/maxsim:new-milestone
{% /codeblock %}

The audit command reads all phase SUMMARY.md files and original REQUIREMENTS.md entries for the milestone, then identifies unmet requirements, partially implemented features, and missing deliverables. The result is a structured audit report.

`/maxsim:plan-milestone-gaps` reads the audit report and creates one new phase per gap — with full PLAN.md files ready to execute. This converts the qualitative audit into an actionable backlog.
