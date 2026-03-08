---
id: installation
title: Installation
group: Introduction
---

MAXSIM requires Node.js 22 or later. It installs markdown files into your AI runtime's config directories — no long-running process, no global binary, no daemon.

### Run the installer

{% codeblock language="bash" %}
npx maxsimcli@latest
{% /codeblock %}

The interactive installer asks which AI runtimes you use (Claude Code, OpenCode, Gemini CLI, Codex) and copies the appropriate files. You can skip the prompts with flags:

{% codeblock language="bash" %}
npx maxsimcli@latest --claude     # Claude Code only
npx maxsimcli@latest --opencode   # OpenCode only
npx maxsimcli@latest --all        # All runtimes, no prompts
{% /codeblock %}

### What gets installed

For Claude Code, MAXSIM installs into `~/.claude/`:

{% codeblock language="text" %}
~/.claude/
├── commands/maxsim/   # 30+ user-facing commands (/maxsim:*)
├── agents/            # 11 specialized subagent prompts
├── hooks/             # Pre/post session hooks
└── dashboard/         # Bundled web dashboard (Vite + Express)
{% /codeblock %}

{% callout type="note" %}
MAXSIM does not modify your project files during install. The .planning/ directory is created per-project when you run /maxsim:new-project inside a project.
{% /callout %}
