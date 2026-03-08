---
id: commands-todos
title: Todo Commands
group: Commands Reference
---

{% doctable headers=["Command", "Description"] rows=[["/maxsim:add-todo", "Capture an idea or task from the current conversation as a todo file"], ["/maxsim:check-todos", "List pending todos and interactively select one to work on next"]] %}
{% /doctable %}

Todos are stored as markdown files in `.planning/todos/pending/`. Each todo has a title, description, priority, and creation timestamp. Completed todos move to `.planning/todos/completed/`.

{% codeblock language="bash" %}
# Save an idea as a todo (from conversation context)
/maxsim:add-todo

# Review and pick a todo to work on
/maxsim:check-todos
{% /codeblock %}
