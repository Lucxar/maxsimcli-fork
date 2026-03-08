---
id: new-project
title: New Project
group: Workflow
---

`/maxsim:new-project` initializes a MAXSIM project in your current directory. It runs an interactive session that asks about your project vision, constraints, non-goals, and target users — then spawns a project researcher and roadmapper to create structured artifacts.

{% codeblock language="bash" %}
/maxsim:new-project
{% /codeblock %}

The command creates the entire `.planning/` directory structure. PROJECT.md captures your vision. REQUIREMENTS.md separates v1 must-haves from v2 nice-to-haves and explicit out-of-scope items. ROADMAP.md breaks the project into phases grouped by milestone.

The project researcher agent uses web search (if Brave Search is configured) to analyze the technology ecosystem — frameworks, libraries, known pitfalls — before the roadmapper creates the phase breakdown. This prevents phases that are sized wrong or ordered incorrectly.

{% callout type="tip" %}
Be specific when the researcher asks questions. Vague answers produce vague phases. If you already have a stack decision, say so. If you have deadline constraints, mention them. The more context you give during new-project, the better every subsequent plan will be.
{% /callout %}
