---
id: dashboard-features
title: Features
group: Dashboard
---

The dashboard provides a structured view of your project's .planning/ directory with interactive editing capabilities. Every panel is connected to the filesystem — changes you make in the dashboard are written immediately to the corresponding markdown file.

{% doctable headers=["Panel", "Description"] rows=[["Phase overview", "Progress bars per phase, milestone stats, completion percentages"], ["Phase drill-down", "Expand any phase to see individual plans and task checkboxes"], ["Inline editor", "CodeMirror Markdown editor for any .planning/ file — Ctrl+S to save"], ["Todos panel", "Create, complete, and delete todos from .planning/todos/"], ["Blockers panel", "View and resolve blockers from STATE.md"], ["STATE.md editor", "Edit project state, decisions, and session bookmarks inline"]] %}
{% /doctable %}

The inline CodeMirror editor supports Markdown syntax highlighting and renders a preview alongside the raw text. Task checkboxes in the drill-down view are bidirectional — checking one in the UI writes the change to the PLAN.md on disk.

{% callout type="tip" %}
Use the STATE.md editor to manually add decisions after ad-hoc conversations with the AI. If you discussed something important outside of MAXSIM's structured workflow, recording it in STATE.md ensures future agents have that context.
{% /callout %}
