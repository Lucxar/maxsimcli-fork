---
id: hook-system
title: Hook System
group: Advanced
---

MAXSIM installs three hooks into your AI runtime's hook system. These run automatically without any command — they're background utilities that improve your development experience.

{% doctable headers=["Hook", "When it runs", "What it does"] rows=[["maxsim-statusline", "Every session", "Shows model · task · directory · context bar in the terminal statusline"], ["maxsim-context-monitor", "Continuously during sessions", "Warns at 35% context used, prompts to pause at 25% remaining"], ["maxsim-check-update", "Session start", "Checks for new MAXSIM version, notifies once per day"]] %}
{% /doctable %}

The context monitor is the most important hook. It watches your context window usage and warns you before you hit the limit. At 35% context remaining, it suggests starting a new session soon. At 25% remaining, it prompts you to run `/maxsim:pause-work` to save state before the context fills up completely.

The statusline hook reads from STATE.md to show the current task and phase in your terminal prompt. This gives you a quick glance at where MAXSIM thinks you are without opening the dashboard.
