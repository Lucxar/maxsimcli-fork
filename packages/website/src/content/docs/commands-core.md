---
id: commands-core
title: Core Commands
group: Commands Reference
---

{% doctable headers=["Command", "Description", "Flags"] rows=[["/maxsim:new-project", "Initialize project — creates .planning/ with vision, requirements, roadmap", "—"], ["/maxsim:discuss-phase N", "Adaptive questioning before planning — writes CONTEXT.md", "—"], ["/maxsim:plan-phase N", "Research, plan, verify phase N", "--auto, --skip-research, --skip-verify"], ["/maxsim:execute-phase N", "Execute all plans in phase N with wave parallelization", "--gaps-only"], ["/maxsim:verify-work N", "UAT verification — broken items become decimal fix phases", "—"], ["/maxsim:quick", "Ad-hoc task with atomic commits, no workflow agents", "--full"], ["/maxsim:debug", "Systematic debugging with persistent state across sessions", "—"], ["/maxsim:progress", "Show project state and route to next action", "—"], ["/maxsim:resume-work", "Restore full context from STATE.md and phase files", "—"], ["/maxsim:pause-work", "Record current state and next action to STATE.md", "—"], ["/maxsim:roadmap", "Display ROADMAP.md with phase status icons and milestone summary", "—"], ["/maxsim:map-codebase", "Analyze codebase with parallel mapper agents", "—"]] %}
{% /doctable %}
