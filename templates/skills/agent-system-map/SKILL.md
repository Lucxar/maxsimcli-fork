---
name: agent-system-map
description: >-
  Registry of MAXSIM's 4 agent types with their roles, base tools, preloaded
  skills, and typical tasks. Documents the orchestrator-mediated communication
  pattern where agents return results to the orchestrator for pipeline routing.
  Use when spawning agents, understanding agent capabilities, or designing
  agent interactions.
user-invocable: false
---

# Agent System Map

MAXSIM uses 4 generic agent types. Specialization comes from orchestrator instructions and skills, not from separate agent definitions.

## Agent Registry

| Agent | Role | Base Tools | Preloaded Skills |
|-------|------|-----------|-----------------|
| **executor** | Implements plans with atomic commits and verified completion | Read, Write, Edit, Bash, Grep, Glob | handoff-contract, evidence-collection, commit-conventions |
| **planner** | Creates structured PLAN.md files from requirements and research | Read, Bash, Grep, Glob | handoff-contract |
| **researcher** | Investigates technical domains and produces structured findings | Read, Bash, Grep, Glob, WebFetch | research-methodology, handoff-contract |
| **verifier** | Verifies work quality, spec compliance, and goal achievement | Read, Bash, Grep, Glob | verification-gates, evidence-collection, handoff-contract |

## Specialization via Orchestrator

The orchestrator provides task-specific context in the spawn prompt. The same `verifier` agent handles code review, spec review, debugging, and integration checking based on what the orchestrator asks:

| Task | Orchestrator Instruction |
|------|------------------------|
| Code review | "Review these files for code quality, security, and conventions" |
| Spec review | "Check these files against the plan's must_haves and done criteria" |
| Debugging | "Investigate this failing test using systematic hypothesis testing" |
| Integration check | "Validate cross-component integration for these changed files" |

## Communication Pattern: Orchestrator-Mediated

**Subagents CANNOT spawn other subagents.** This is a Claude Code platform constraint. All agent-to-agent communication routes through the orchestrator.

```
Orchestrator
  |-- spawns --> Researcher (returns findings)
  |-- spawns --> Planner (returns PLAN.md)
  |-- spawns --> Executor (returns SUMMARY.md)
  |-- spawns --> Verifier (returns verification report)
```

**Flow:**
1. Orchestrator spawns Agent A with task + context
2. Agent A executes, produces results using handoff contract
3. Agent A returns to orchestrator
4. Orchestrator reads results, decides next step
5. Orchestrator spawns Agent B with Agent A's results as context

Agents never call each other directly. The orchestrator is the single routing point.

## Spawn Prompt Format

When spawning an agent, use natural language with markdown sections:

```markdown
## Task
[What the agent should do -- specific, actionable]

## Context
[Phase, plan, prior results, relevant decisions]

## Files to Read
- [file paths the agent should read at startup]

## Suggested Skills
- [skills that may be helpful for this task]

## Success Criteria
- [measurable outcomes the orchestrator will check]
```

The orchestrator carries the specialization context. Agents are generic -- the spawn prompt makes them specific.

## Model Selection

Each agent type has a default model from the config profile:

| Profile | Executor | Planner | Researcher | Verifier |
|---------|----------|---------|------------|----------|
| quality | opus | opus | opus | sonnet |
| balanced | sonnet | sonnet | sonnet | sonnet |
| budget | sonnet | haiku | haiku | haiku |

The orchestrator can override per-spawn for complex tasks (e.g., force opus for critical research).

Agents use `model: inherit` in their frontmatter -- the orchestrator or CLI resolves the actual model at spawn time based on the config profile.
