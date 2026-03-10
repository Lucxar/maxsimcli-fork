---
name: input-validation
description: >-
  Validates required inputs exist before agent work begins. Checks file paths,
  environment variables, and CLI arguments at startup. Use at agent startup to
  fail fast with structured error instead of proceeding with missing context.
user-invocable: false
---

# Input Validation

Validate all required inputs before doing any work. Fail fast with a structured error -- never attempt partial work with missing context.

## Process

At agent startup, before any implementation:

1. **List required inputs** -- files, env vars, CLI args, state files
2. **Check each input exists** -- use tool calls, not assumptions
3. **Collect all missing inputs** -- do not stop at the first missing item
4. **If any missing: return structured error immediately**

## Structured Error Format

```
AGENT RESULT: INPUT VALIDATION FAILED

Missing:
- [input 1] -- [what it is, where it should come from]
- [input 2] -- [what it is, where it should come from]

Expected from: [source -- orchestrator spawn prompt, user environment, prior agent output]
```

## Validation Checks by Type

| Input Type | How to Check | Example |
|-----------|-------------|---------|
| File path | `test -f "path"` or Read tool | PLAN.md, STATE.md, config.json |
| Directory | `test -d "path"` | .planning/, templates/ |
| Env variable | `echo "$VAR"` or `test -n "$VAR"` | GITHUB_TOKEN, NODE_ENV |
| CLI argument | Check prompt context for required fields | Phase number, plan number |
| Prior output | Check expected file or git commit exists | SUMMARY.md from previous plan |

## Rules

- **Check ALL inputs before reporting** -- collect the complete list of missing items
- **Do NOT attempt partial work** -- if inputs are missing, the output will be wrong
- **Do NOT guess missing values** -- return the error and let the orchestrator fix it
- **Include the source** -- tell the user where the missing input should come from
- **This is a hard gate** -- no workarounds, no "I'll proceed without it"
