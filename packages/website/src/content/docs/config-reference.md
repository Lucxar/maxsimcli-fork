---
id: config-reference
title: config.json Reference
group: Configuration
---

Place `.planning/config.json` to customize MAXSIM behavior per-project. All keys have sensible defaults — start with an empty object and add only what you need to change.

{% codeblock language="json" %}
{
  "model_profile": "balanced",
  "branching_strategy": "none",
  "commit_docs": true,
  "research": true,
  "plan_checker": true,
  "verifier": true,
  "parallelization": true,
  "brave_search": false,
  "model_overrides": {}
}
{% /codeblock %}

{% doctable headers=["Key", "Type", "Default", "Description"] rows=[["model_profile", "string", "balanced", "Active model profile for all agents"], ["branching_strategy", "string", "none", "Git branching: none, phase, or milestone"], ["commit_docs", "boolean", "true", "Include SUMMARY.md and STATE.md in git commits"], ["research", "boolean", "true", "Enable phase researcher agent before planning"], ["plan_checker", "boolean", "true", "Enable plan-checker agent before execution"], ["verifier", "boolean", "true", "Enable verifier agent after execution"], ["parallelization", "boolean", "true", "Enable wave-based parallel plan execution"], ["brave_search", "boolean", "false", "Enable Brave Search API in research agents"], ["model_overrides", "object", "{}", "Per-agent model overrides (see Model Overrides)"]] %}
{% /doctable %}
