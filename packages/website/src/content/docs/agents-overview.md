---
id: agents-overview
title: How Agents Work
group: Agents
---

MAXSIM's agents are markdown prompt files stored in `~/.claude/agents/` (for Claude Code). They are not executable binaries — they are specifications that the AI reads and executes as a subagent with a fresh context window.

Each agent has a single responsibility. The executor doesn't research. The researcher doesn't plan. The plan-checker doesn't write code. This separation ensures that each agent can be given exactly the context it needs without contamination from unrelated work.

Agents call `cli.cjs` — MAXSIM's tools router — via the Bash tool. The tools router dispatches to core modules that handle state management, phase lifecycle, roadmap parsing, and verification. Large outputs (over 50KB) are written to a tmpfile and returned as `@file:/path` to prevent buffer overflow in the Claude Code Bash tool.

Agents communicate with each other through filesystem artifacts, not direct messages. The researcher writes RESEARCH.md. The planner reads RESEARCH.md and writes PLAN.md. The executor reads PLAN.md and writes SUMMARY.md. Each hand-off is a structured document that persists in git.
