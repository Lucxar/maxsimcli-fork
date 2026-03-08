---
id: branching-strategies
title: Branching Strategies
group: Configuration
---

MAXSIM can manage git branches automatically during execution. Set `branching_strategy` in config.json to one of three options.

{% doctable headers=["Strategy", "Branch created", "Example"] rows=[["none", "All work on current branch (default)", "main"], ["phase", "One branch per phase", "maxsim/phase-01-foundation"], ["milestone", "One branch per milestone", "maxsim/milestone-1-mvp"]] %}
{% /doctable %}

{% codeblock language="json" %}
{
  "branching_strategy": "phase"
}
{% /codeblock %}

With `phase` branching, execute-phase creates a branch named `maxsim/phase-NN-name` before execution and leaves it there for you to review and merge. With `milestone` branching, the branch spans all phases in the milestone.

{% callout type="note" %}
Branching strategies require a clean working tree before execution. MAXSIM will warn you if there are uncommitted changes that would block branch creation.
{% /callout %}
