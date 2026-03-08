---
id: commands-phases
title: Phase Commands
group: Commands Reference
---

{% doctable headers=["Command", "Description"] rows=[["/maxsim:add-phase", "Append a new phase to ROADMAP.md at the end of a milestone"], ["/maxsim:insert-phase", "Insert a new phase between existing phases, renumbering as needed"], ["/maxsim:remove-phase", "Remove a phase from ROADMAP.md"], ["/maxsim:list-phase-assumptions", "List all open assumptions from a phase's CONTEXT.md"], ["/maxsim:research-phase", "Run the phase researcher agent independently, without planning"]] %}
{% /doctable %}

{% codeblock language="bash" %}
# Add a new phase after phase 3
/maxsim:add-phase

# Insert a phase between 01 and 02 (becomes 01A or 01.1 depending on type)
/maxsim:insert-phase

# Run research for phase 2 without proceeding to planning
/maxsim:research-phase 2
{% /codeblock %}
