---
id: model-profiles
title: Model Profiles
group: Configuration
---

Model profiles control which Claude model each of the 11 specialized agents uses. Orchestrators always use leaner models to minimize cost on routing and coordination work. Planners, executors, and debuggers use the model tier configured by your profile.

{% doctable headers=["Agent", "quality", "balanced", "budget", "tokenburner"] rows=[["maxsim-planner", "opus", "sonnet", "sonnet", "opus"], ["maxsim-roadmapper", "opus", "sonnet", "sonnet", "opus"], ["maxsim-executor", "opus", "sonnet", "sonnet", "opus"], ["maxsim-phase-researcher", "sonnet", "sonnet", "haiku", "opus"], ["maxsim-project-researcher", "sonnet", "sonnet", "haiku", "opus"], ["maxsim-research-synthesizer", "sonnet", "haiku", "haiku", "opus"], ["maxsim-debugger", "opus", "sonnet", "sonnet", "opus"], ["maxsim-codebase-mapper", "sonnet", "haiku", "haiku", "opus"], ["maxsim-verifier", "sonnet", "sonnet", "haiku", "opus"], ["maxsim-plan-checker", "sonnet", "sonnet", "haiku", "opus"], ["maxsim-integration-checker", "sonnet", "sonnet", "haiku", "opus"]] %}
{% /doctable %}

The `balanced` profile (default) gives you Sonnet-quality planning and execution with Haiku for lighter tasks. The `quality` profile uses Opus for the heavy-lift agents. The `budget` profile uses Sonnet only for planners and executors. The `tokenburner` profile uses Opus for every agent — maximum quality, maximum cost.

{% codeblock language="bash" %}
/maxsim:set-profile quality
/maxsim:set-profile balanced
/maxsim:set-profile budget
/maxsim:set-profile tokenburner
{% /codeblock %}
