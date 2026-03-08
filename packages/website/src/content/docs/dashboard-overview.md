---
id: dashboard-overview
title: Overview
group: Dashboard
---

MAXSIM ships a real-time web dashboard bundled inside the CLI — no separate install, no Docker, no configuration. It's a Vite+React frontend backed by an Express server that watches your `.planning/` directory with chokidar and pushes updates over WebSocket the moment any file changes.

{% codeblock language="bash" %}
npx maxsimcli dashboard
{% /codeblock %}

The dashboard auto-detects an available port in the range 3333-3343. If the default port is in use, it tries the next one. Once started, it opens your browser automatically and displays the current project state.

The dashboard is also launched automatically during `/maxsim:execute-phase` so you always have a live view of what the executor is doing. You can open it on a second monitor and watch plans complete in real time.

{% codeblock language="bash" %}
# Start dashboard
npx maxsimcli dashboard

# Stop dashboard
npx maxsimcli dashboard --stop
{% /codeblock %}
