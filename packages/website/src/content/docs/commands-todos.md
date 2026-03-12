---
id: commands-todos
title: Todo Commands
group: Commands Reference
---

{% doctable headers=["Command", "Description"] rows=[["/maxsim:quick --todo [desc]", "Capture an idea or task as a GitHub Issue with the 'todo' label"], ["/maxsim:quick --todo triage", "List pending todos and decide what to work on next"]] %}
{% /doctable %}

Todos are tracked as GitHub Issues with the `todo` label. Use `/maxsim:quick --todo` to capture, list, complete, or triage todos.

{% codeblock language="bash" %}
# Save an idea as a todo
/maxsim:quick --todo "Add pagination to the API"

# List pending todos
/maxsim:quick --todo list

# Complete a todo by issue number
/maxsim:quick --todo done 42

# Triage: prioritize what to work on next
/maxsim:quick --todo triage
{% /codeblock %}
