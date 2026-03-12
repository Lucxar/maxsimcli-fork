# AGENTS.md -- Agent Registry

4 generic agents replace 14 specialized agents. Specialization comes from orchestrator spawn prompts and skill preloading -- agents themselves are role-generic.

## Agent Registry

| Agent | Role | Tools | Preloaded Skills | On-Demand Skills |
|-------|------|-------|-----------------|-----------------|
| `executor` | Implements plans with atomic commits and deviation handling | Read, Write, Edit, Bash, Grep, Glob | handoff-contract, evidence-collection, commit-conventions | tool-priority-guide, agent-system-map |
| `planner` | Creates plans (posted as GitHub Issue comments) with task breakdown and goal-backward verification | Read, Write, Bash, Grep, Glob | handoff-contract, input-validation | research-methodology, agent-system-map |
| `researcher` | Investigates domains with source evaluation and confidence levels | Read, Bash, Grep, Glob, WebFetch | handoff-contract, evidence-collection | research-methodology, tool-priority-guide |
| `verifier` | Verifies work against specifications with fresh evidence and hard gates | Read, Bash, Grep, Glob | verification-gates, evidence-collection, handoff-contract | agent-system-map, tool-priority-guide |

## Consolidation Map

Which old agents map to which new agent:

| New Agent | Replaces |
|-----------|----------|
| `executor` | maxsim-executor |
| `planner` | maxsim-planner, maxsim-roadmapper, maxsim-plan-checker |
| `researcher` | maxsim-phase-researcher, maxsim-project-researcher, maxsim-research-synthesizer, maxsim-codebase-mapper |
| `verifier` | maxsim-verifier, maxsim-code-reviewer, maxsim-spec-reviewer, maxsim-debugger, maxsim-integration-checker, maxsim-drift-checker |

## Orchestrator-Agent Communication

Orchestrators spawn agents with structured natural-language prompts:

```markdown
## Task
[What the agent should do -- specific, actionable]

## Context
[Phase, plan, prior work, constraints]

## Files to Read
- [file paths the agent should load first]

## Suggested Skills
- [skills the orchestrator recommends the agent invoke on-demand]

## Success Criteria
- [measurable criteria for the agent to verify before returning]
```

**Key principles:**
- Orchestrator carries specialization context -- agents are generic
- Subagents CANNOT spawn other subagents -- orchestrator mediates all agent-to-agent communication
- Orchestrator can add tools beyond agent's base set at spawn time
- Agents return results using the handoff-contract format

## Skill Categories

| Category | Skills | Purpose |
|----------|--------|---------|
| Protocol | handoff-contract, verification-gates, input-validation | Structural patterns for how agents operate |
| Methodology | evidence-collection, research-methodology | Domain knowledge for how to do specific work |
| Convention | commit-conventions | Project standards and rules |
| Reference | agent-system-map, tool-priority-guide | Lookup data and system knowledge |

All internal skills use `user-invocable: false` -- only agents auto-invoke them based on description matching.

## Handoff Contract

Every agent return MUST include these sections (enforced by the handoff-contract skill):

| Section | Content |
|---------|---------|
| Key Decisions | Decisions made during execution that affect downstream work |
| Artifacts | Files created or modified (absolute paths from project root) |
| Status | `complete`, `blocked`, or `partial` with details |
| Deferred Items | Work discovered but not implemented, categorized |

## Model Selection

Config `model_profile` (quality/balanced/budget/tokenburner) provides baseline model per agent type. Orchestrator can override per-spawn for complex tasks.

| Agent | quality | balanced | budget | tokenburner |
|-------|---------|----------|--------|-------------|
| executor | opus | sonnet | sonnet | opus |
| planner | opus | opus | sonnet | opus |
| researcher | opus | sonnet | haiku | opus |
| verifier | sonnet | sonnet | haiku | opus |
| debugger | sonnet | sonnet | haiku | opus |

Model is set via `model: inherit` in agent frontmatter (uses session model) or explicit override in orchestrator spawn.
