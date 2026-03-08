---
id: discuss-phase
title: Discuss Phase
group: Workflow
---

`/maxsim:discuss-phase` is an optional but highly recommended step before planning. It runs an adaptive questioning session that surfaces assumptions, gray areas, and implicit requirements before a single plan is written.

{% codeblock language="bash" %}
/maxsim:discuss-phase 1
{% /codeblock %}

The discussion agent reads your ROADMAP.md, PROJECT.md, and REQUIREMENTS.md, then asks targeted questions about the phase. Questions adapt based on your answers — if you mention a third-party API, it asks about rate limits and authentication. If you mention real-time features, it asks about WebSocket vs. polling tradeoffs.

At the end of the session, the agent writes a `CONTEXT.md` file for the phase. The planner reads CONTEXT.md as primary input when creating the plan — so the time you spend in discussion directly improves plan quality.

{% callout type="note" %}
discuss-phase is especially valuable for phases that touch infrastructure, external services, or cross-phase integration points. The questions it asks are the same ones an experienced architect would ask in a pre-sprint meeting.
{% /callout %}
