---
id: workflow-toggles
title: Workflow Toggles
group: Configuration
---

MAXSIM's planning workflow includes optional agents you can disable to trade thoroughness for speed. Each toggle is a boolean in config.json that can also be overridden per-command with a flag.

{% doctable headers=["Toggle", "Agent", "Cost when enabled", "When to disable"] rows=[["research", "maxsim-phase-researcher", "1–3 min + tokens", "Small phases, already-researched domains"], ["plan_checker", "maxsim-plan-checker", "1–2 min + tokens", "Simple plans, rapid iteration"], ["verifier", "maxsim-verifier", "2–5 min + tokens", "Speed runs, trusted executors"], ["parallelization", "Concurrent subagents", "Varies by wave count", "Sequential debugging, cost control"], ["brave_search", "Web search in researchers", "Per-search API cost", "Offline, cost control"]] %}
{% /doctable %}

{% codeblock language="json" %}
{
  "research": false,
  "plan_checker": true,
  "verifier": true,
  "parallelization": false
}
{% /codeblock %}

{% callout type="warn" %}
Disabling the verifier means broken items won't automatically generate fix phases. You'll need to run /maxsim:verify-work manually and check results yourself. Recommended only for throwaway or prototype phases.
{% /callout %}
