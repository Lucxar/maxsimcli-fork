# Phase 04 Context: Prompt & Skill Architecture

**Phase Goal:** Agent prompts use skills for on-demand context loading instead of upfront monolithic instructions
**Requirements:** PROMPT-01, PROMPT-02, PROMPT-03, PROMPT-04, PROMPT-05
**Created:** 2026-03-10

## 1. Skill Triggering Mechanism

### Discovery Model
- Use **Claude Code's native skill system**: SKILL.md files with YAML frontmatter (name, description, etc.)
- **Static declaration**: Skills are authored and installed as files; Claude Code auto-discovers them from `.claude/skills/`
- Agents see skill names + descriptions in context (~2% budget); full content loads on-demand when triggered

### Loading Strategy
- **Lazy/deferred loading**: Descriptions always visible, full skill content loads only when invoked
- Leverages Claude Code's built-in deferred loading (name + description shown, content loaded on trigger)
- Skills load via Claude's native mechanism — either user `/skill-name` or Claude auto-invocation based on description matching

### Injection Responsibility
- **Agent-driven**: Agents themselves decide when to load skills via Claude Code's native mechanism
- No orchestrator pre-injection of skill content
- Orchestrator can *suggest* relevant skills in spawn prompt, but agent controls actual loading

### Project Skills Interaction
- **Extend or override**: Project `.claude/skills/` can override MAXSIM built-in skills
- Follows Claude Code's native scope hierarchy: project > personal > plugin
- Users can customize any MAXSIM skill by creating a same-named skill in their project

### Shared Pattern Extraction
- **Extract all shared agent patterns to skills**: agent_system_map (14x duplicated), handoff contracts, input validation, tool priority guides all become standalone skills
- Each extracted pattern becomes its own skill in `.claude/skills/<name>/SKILL.md`

### alwaysApply Skills
- **Conventions + verification protocol** are `alwaysApply: true`
- Core coding conventions and hard gate verification protocol always loaded into every session
- All other skills load on-demand only

### Skill Composition
- **Suggestion-based**: Skills can mention "see also: /related-skill" but do NOT auto-load sub-skills
- Agent decides whether to follow skill suggestions
- No skill-to-skill automatic dependency chains

### Transition Strategy
- **Rewrite from scratch**: Design the ideal skill-based agent architecture first, then implement
- No incremental migration of old patterns — clean slate

### Subagent Skill Access
- **Full inheritance**: Subagents spawned via Agent tool inherit all available skills from the session
- No restriction to declared-only skills — full flexibility

### Extraction Scope
- **Aggressive extraction (10+ internal skills)**: Break everything down into composable skills
- Maximum reuse across the 4 agent types

### Description Style
- **Match existing MAXSIM skill description patterns** for consistency
- Claude Code uses descriptions for auto-invocation — keyword-rich, action-oriented

### Internal Skill Visibility
- **Hidden** (`user-invocable: false`): Internal skills (protocol, reference) are invisible to users
- Only agents auto-invoke internal skills based on description matching
- Clean user experience — users see only user-facing skills

---

## 2. Agent Consolidation Scope

### Agent Count
- **Exactly 4 agent types**: Executor, Planner, Researcher, Verifier
- Down from 14 current agents to 4 generic types
- Skills handle all specialization within each type

### Orphan Agent Mapping
- **code-reviewer, spec-reviewer, debugger fold into Verifier**
- Code review, spec review, drift checking, integration checking, debugging are all Verifier specializations
- Orchestrator differentiates via natural language instructions; methodology skills provide domain knowledge

### Agent File Format
- **Native Claude Code agent format**: Use standard `.claude/agents/` with Claude Code frontmatter
- Leverage the platform — standard fields: name, description, tools, model, context
- No custom MAXSIM-specific frontmatter extensions

### Specialization Mechanism
- **Orchestrator instructions + skills**: One generic agent per type
- Orchestrator provides task-specific instructions in the spawn prompt
- Skills add shared methodology (e.g., research-methodology, evidence-collection)

### Verifier Differentiation
- **Entirely via orchestrator natural language instructions** — no mode concept
- Orchestrator says "Review this code for security and quality" or "Debug this failing test"
- Relevant methodology skills auto-trigger based on orchestrator context

### Model Selection
- **Hybrid**: Config profile (quality/balanced/budget) provides baseline mapping per agent type
- Orchestrator can override per-spawn for complex tasks (e.g., force Opus for critical research)
- `MODEL_PROFILES` in config.json defines defaults; orchestrator has final say

### Prompt Size
- **No target** — include what's essential for the agent to function without loading skills
- Size follows content; don't artificially constrain

### Handoff Contract
- **Structured but as a skill**: Same reliable format (Key Decisions, Artifacts, Status, Deferred Items)
- Loaded via `handoff-contract` skill, not hardcoded in agent prompts
- Maintains parsing reliability while reducing agent prompt size

### Orchestrator Refactoring
- **Yes, refactor orchestrators**: Orchestrators rewritten to work with the new 4-agent model
- Richer task-specific instructions since agents are now generic
- Orchestrators carry more context, agents carry less

### Agent Naming
- **Simple names without prefix**: `executor`, `planner`, `researcher`, `verifier`
- Located at `.claude/agents/executor.md`, etc.
- Clean, no `maxsim-` namespace needed

### Tool Access
- **Base tools + orchestrator additions**: Agent declares base tools in frontmatter
- Orchestrator can add tools (Edit, Write, WebSearch) when spawning for specific tasks
- Executor base: Read, Grep, Glob, Bash. Orchestrator adds: Edit, Write for implementation tasks

### Context Loading
- **Hybrid**: Orchestrator passes file paths + task description
- Agent also uses MCP tools (mcp_get_state, mcp_get_roadmap) to discover context from GitHub Issues
- Aligns with Phase 2 architecture where GitHub Issues is the source of truth

### Skill Routing
- **Both**: Orchestrator suggests primary skills in spawn prompt
- Agent can also auto-discover and load additional skills it finds relevant
- Best coverage without being rigid

### Agent Documentation
- **Keep AGENTS.md registry**: Central reference documenting all 4 agents, their roles, tool access, and skill mappings
- Useful for orchestrator authors and contributors

### Agent Validation
- **UAT + lightweight smoke tests**: Manual user acceptance testing for behavior correctness
- Automated smoke tests for structural checks (frontmatter valid, required sections present)

### Agent-to-Agent Communication
- **Agents CAN spawn sub-agents**: Not limited to orchestrator routing
- E.g., Executor can spawn Verifier for self-check
- More autonomous coordination

### Error Handling
- **Agent self-retries with limits**: Agent retries failed tool calls internally
- Escalates to orchestrator only after exhausting retry limit
- Makes agents more self-sufficient

### Spawn Prompt Format
- **Natural language with markdown sections**: `## Task`, `## Context`, `## Files to Read`, `## Suggested Skills`
- Readable, not rigid XML. Consistent structure without being brittle.

### State Persistence
- **Via GitHub Issues**: Agents write findings as GitHub Issue comments
- Next agent in pipeline reads from the same issue
- Aligned with Phase 2 architecture — GitHub Issues as the source of truth

---

## 3. Gate Failure Protocol

### Failure Behavior
- **Retry with feedback**: Agent gets context about WHY it failed, attempts to fix
- After exhausting retries, escalate to orchestrator/user
- Feedback includes: what failed, expected evidence, actual result

### Evidence Standard
- **Any tool output qualifies**: Test output, build results, git diff, file reads, linter output
- Key rule: agent CANNOT pass a gate based on its own reasoning alone
- Must cite specific tool call results as evidence

### Anti-Rationalization Language
- **Strong, with explicit forbidden phrases**:
  - "Do NOT pass this gate by arguing it's 'close enough', 'minor issue', or 'will fix later'"
  - "Either evidence passes or it fails. No middle ground."
  - "Partial success is failure. 'Good enough' is not enough."
- Every hard gate includes these exact phrases

### Retry Limits
- **2 retries (3 total attempts)**: Enough to self-correct without spinning
- After 3rd failure, escalate with full failure context
- Each retry includes feedback from previous attempt

### Gate Architecture
- **Shared base skill + agent-specific additions**
- Base `verification-gates` skill defines: retry logic, evidence rules, anti-rationalization language, escalation protocol
- Agent prompts add type-specific gates (Executor adds pre-commit gate, Verifier adds completion gate)

### Gate Types (all 4 implemented)
1. **Input validation gate**: Verify all required inputs present before starting
2. **Pre-action gate**: Before destructive actions (writes, commits, PRs), verify intent and impact
3. **Completion gate**: Before claiming done, run verification commands and cite tool output
4. **Quality gate**: After implementation, check code quality (lint, test, build)

### Enforcement Level
- **Hard enforceable — no escape hatch**: Gate is a hard stop
- Agent MUST meet criteria; no "I'll skip this because..." allowed
- No advisory mode, no config override — gates are non-negotiable

### Audit Trail
- **Always log to GitHub Issues**: Every gate failure + retry logged as issue comment
- Full audit trail for debugging, improvement, and accountability
- Includes: gate name, attempt number, evidence provided, pass/fail result

---

## 4. Skill Granularity

### Minimum Size
- **At least a meaningful procedure (10-30 lines)**: A skill must be a self-contained, useful unit
- Not just a snippet — enough context to be actionable standalone
- If it's less than 10 lines, it should be inline in the agent prompt

### Skill Categories
All 4 categories will be implemented:
1. **Protocol skills**: Structural patterns for how agents operate (handoff, validation, gates)
2. **Methodology skills**: Domain knowledge for how to do specific work (research, review, debug)
3. **Convention skills**: Project standards and rules (coding, commits, naming)
4. **Reference skills**: Lookup data and system knowledge (agent map, tool guide, model profiles)

### Size Uniformity
- **Varied — match content to scope**: A handoff contract may be 15 lines, a research methodology 100 lines
- Both are valid skills. Content dictates size, not an arbitrary target
- Don't artificially split or pad skills

### File Organization
- **Native Claude Code format**: `.claude/skills/<skill-name>/SKILL.md`
- Flat directory structure — one directory per skill
- Follow Anthropic's skill authoring protocol exactly

### Initial Skill Inventory (8 internal skills)

| Skill | Category | Description |
|-------|----------|-------------|
| `handoff-contract` | Protocol | Structured return format: Key Decisions, Artifacts, Status, Deferred Items |
| `verification-gates` | Protocol | Hard gate framework: evidence rules, anti-rationalization, retry, escalation |
| `input-validation` | Protocol | Startup validation: check required inputs, fail with structured error |
| `evidence-collection` | Methodology | How to gather fresh evidence: run commands, read outputs, cite results |
| `research-methodology` | Methodology | Research process: tool priorities, confidence levels, source evaluation |
| `agent-system-map` | Reference | Registry of all agents, roles, relationships — single source of truth |
| `commit-conventions` | Convention | Commit format, conventional commits, atomic commit rules |
| `tool-priority-guide` | Reference | When to use which tools (Read vs Bash, Grep vs Glob, etc.) |

### Existing Skills
- **Refactor all 13 user-facing skills** to match the new architecture and conventions
- Consistent structure, descriptions, and patterns across all skills (internal + user-facing)

### Meta-Skill
- **No meta-skill needed**: Claude Code natively handles skill discovery and invocation
- Trust the platform — don't duplicate Claude Code's built-in capability

### Supporting Files
- **Full flexibility**: Skills can include any supporting files (examples, tools, scripts, reference docs)
- Skills can also reference external docs and resources
- SKILL.md must explain how to use all supporting materials

### Update Strategy
- **Overwrite entire .claude/ on update**: `npx maxsimcli@latest` replaces all MAXSIM files
- Include changelog so an agent can review changes and correct planning context
- Users customize via project-level `.claude/skills/` overrides (not by editing installed files)

---

## Deferred Ideas

*Captured during discussion but outside Phase 4 scope:*

- None captured — all discussion stayed within phase boundary

---

*Context created: 2026-03-10*
*Gray areas discussed: 4 (Skill Triggering, Agent Consolidation, Gate Failure Protocol, Skill Granularity)*
*Total decisions: 49*
