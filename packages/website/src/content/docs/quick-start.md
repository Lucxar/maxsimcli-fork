---
id: quick-start
title: Quick Start
group: Introduction
---

The core MAXSIM workflow follows six steps. Each step is a slash command that spawns one or more focused subagents with fresh context.

{% codeblock language="bash" %}
# 1. Initialize project — creates .planning/ with vision, requirements, roadmap
/maxsim:new-project

# 2. (Optional) Discuss a phase before planning it — surfaces assumptions
/maxsim:discuss-phase 1

# 3. Research + plan + verify — spawns researcher, planner, plan-checker agents
/maxsim:plan-phase 1

# 4. Execute — implements plans with atomic commits and deviation tracking
/maxsim:execute-phase 1

# 5. Verify — UAT-style validation, broken items become decimal fix phases
/maxsim:verify-work 1

# 6. Watch live progress in the dashboard
npx maxsimcli dashboard
{% /codeblock %}

After execution, each plan has a SUMMARY.md committed to git. STATE.md tracks decisions, blockers, and metrics across the entire project lifetime. You can always run `/maxsim:progress` to see where you are and what to do next.

{% callout type="tip" %}
Run /maxsim:discuss-phase before /maxsim:plan-phase. The discussion command surfaces assumptions and gray areas through adaptive questioning — saving you from discovering them mid-execution when they're more expensive to fix.
{% /callout %}
