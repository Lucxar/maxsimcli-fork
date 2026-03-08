---
id: debug-sessions
title: Debug Sessions
group: Advanced
---

`/maxsim:debug` runs the debugger agent with persistent state. Unlike a regular conversation, debugging state is written to a file after each step — so if the context window fills up, you can start a fresh session and continue from exactly where you stopped.

{% codeblock language="bash" %}
/maxsim:debug "auth token not refreshing after 401"
{% /codeblock %}

The debugger uses a scientific method approach: it forms a hypothesis, tests it, records the result, and forms the next hypothesis based on evidence. Each step is committed to the debug state file. If the issue spans multiple sessions, the next session reads the existing state and continues the investigation.

Debugging state is stored in `.planning/debug/`. Each debug session has a slug derived from the issue description. You can have multiple concurrent debug sessions for different issues.
