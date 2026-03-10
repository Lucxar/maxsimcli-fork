# Phase 4: Prompt & Skill Architecture - Research

**Researched:** 2026-03-10
**Domain:** AI Agent Prompt Engineering, Claude Code Skill/Agent System, Progressive Context Disclosure
**Confidence:** HIGH (primary sources: official Claude Code docs, Anthropic platform docs)

---

## User Constraints

Copied verbatim from 04-CONTEXT.md. These are LOCKED decisions -- the planner MUST honor every one.

### 1. Skill Triggering Mechanism

- Use Claude Code's native skill system: SKILL.md files with YAML frontmatter
- Static declaration: Skills authored and installed as files; Claude Code auto-discovers from `.claude/skills/`
- Lazy/deferred loading: Descriptions always visible, full content loads on-demand
- Agent-driven: Agents decide when to load skills; no orchestrator pre-injection
- Orchestrator can suggest relevant skills in spawn prompt, but agent controls loading
- Project skills extend or override MAXSIM built-in skills (project > personal > plugin)
- Extract all shared agent patterns to skills: agent_system_map, handoff contracts, input validation, tool priority guides
- **Conventions + verification protocol are always-loaded** (see Critical Finding below for implementation)
- Skills can mention "see also: /related-skill" but do NOT auto-load sub-skills
- Rewrite from scratch (not incremental migration)
- Full inheritance: Subagents inherit all available skills from session
- Aggressive extraction: 10+ internal skills
- Match existing MAXSIM skill description patterns
- Internal skills hidden: `user-invocable: false`

### 2. Agent Consolidation Scope

- Exactly 4 agent types: Executor, Planner, Researcher, Verifier
- Code-reviewer, spec-reviewer, debugger fold into Verifier
- Native Claude Code agent format: `.claude/agents/` with standard frontmatter
- No custom MAXSIM-specific frontmatter extensions
- Orchestrator instructions + skills for specialization (one generic agent per type)
- Verifier differentiation via orchestrator natural language instructions (no mode concept)
- Hybrid model selection: config profile baseline + orchestrator override per-spawn
- Handoff contract as a skill, not hardcoded in agent prompts
- Orchestrators rewritten to work with 4-agent model
- Simple names: `executor`, `planner`, `researcher`, `verifier` (no `maxsim-` prefix)
- Base tools + orchestrator additions in frontmatter
- Hybrid context loading: orchestrator file paths + MCP tools for GitHub Issues
- Both orchestrator skill suggestions and agent auto-discovery
- Keep AGENTS.md registry
- Agents CAN spawn sub-agents (not limited to orchestrator routing)
- Agent self-retries with limits, escalation after exhausting
- Spawn prompt format: natural language with `## Task`, `## Context`, `## Files to Read`, `## Suggested Skills`
- State persistence via GitHub Issues

### 3. Gate Failure Protocol

- Retry with feedback: agent gets context about WHY it failed
- Any tool output qualifies as evidence; agent CANNOT pass based on reasoning alone
- Strong anti-rationalization with explicit forbidden phrases
- 2 retries (3 total attempts), then escalate
- Shared base `verification-gates` skill + agent-specific additions
- 4 gate types: input validation, pre-action, completion, quality
- Hard enforceable -- no escape hatch, no advisory mode
- All gate failures logged to GitHub Issues

### 4. Skill Granularity

- Minimum 10-30 lines per skill (meaningful procedure)
- 4 categories: Protocol, Methodology, Convention, Reference
- Varied size -- match content to scope
- Native format: `.claude/skills/<skill-name>/SKILL.md`
- 8 internal skills (handoff-contract, verification-gates, input-validation, evidence-collection, research-methodology, agent-system-map, commit-conventions, tool-priority-guide)
- Refactor all 13 user-facing skills to match new architecture
- No meta-skill needed (trust Claude Code's native discovery)
- Skills can include supporting files
- Overwrite entire `.claude/` on update; users customize via project-level overrides

### Deferred Ideas

None captured during discussion.

---

## Critical Finding: `alwaysApply` Does Not Exist

**Confidence: HIGH** (verified against official Claude Code documentation at code.claude.com/docs/en/skills)

The 04-CONTEXT.md states: "Conventions + verification protocol are `alwaysApply: true`." However, `alwaysApply` is NOT a recognized Claude Code SKILL.md frontmatter field.

The actual Claude Code skill frontmatter fields are:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | No | Display name (lowercase, hyphens, max 64 chars) |
| `description` | Recommended | What skill does + when to use it (max 1024 chars) |
| `argument-hint` | No | Hint for autocomplete |
| `disable-model-invocation` | No | `true` = only user can invoke |
| `user-invocable` | No | `false` = only Claude can invoke |
| `allowed-tools` | No | Tools Claude can use when skill active |
| `model` | No | Model to use when active |
| `context` | No | `fork` = run in subagent context |
| `agent` | No | Subagent type when `context: fork` |
| `hooks` | No | Hooks scoped to skill lifecycle |

**There is no `alwaysApply` field.** The existing MAXSIM `using-maxsim` skill uses `alwaysApply: true` but this is a MAXSIM convention, not recognized by Claude Code.

### How to Achieve "Always Loaded" Behavior

Claude Code has a clear separation:

| Mechanism | When Loaded | Use For |
|-----------|-------------|---------|
| **CLAUDE.md** | Every session start, always | Universal project instructions |
| **.claude/rules/*.md** | Every session start (or path-scoped) | Coding standards, conventions |
| **Skills** | On-demand only (description match or `/invoke`) | Repeatable workflows, domain knowledge |

**Recommendation:** Use `.claude/rules/` for always-loaded content (conventions, verification protocol). Use skills for on-demand methodology and reference content. This follows Claude Code's native architecture rather than fighting it.

Specifically:
- Move conventions to `.claude/rules/conventions.md` (always loaded)
- Move verification protocol to `.claude/rules/verification-gates.md` (always loaded)
- Keep all other content as skills (loaded on-demand)

---

## Standard Stack

### Core (Native Claude Code Features)

| Feature | Purpose | Why Standard |
|---------|---------|--------------|
| `.claude/skills/<name>/SKILL.md` | On-demand context loading | Native skill system with progressive disclosure |
| `.claude/agents/<name>.md` | Custom subagent definitions | Native agent system with frontmatter config |
| `.claude/rules/*.md` | Always-loaded conventions | Native rules system, loaded every session |
| `CLAUDE.md` | Project-level instructions | Native memory system, universal context |
| Agent tool (formerly Task tool) | Spawning subagents | Native delegation mechanism |

### Supporting (MAXSIM CLI Tools)

| Tool | Purpose | Why Needed |
|------|---------|------------|
| `maxsim-tools.cjs resolve-model` | Model resolution per agent type | Maps config profiles to model aliases |
| `maxsim-tools.cjs init` | Context assembly for workflows | Assembles paths and state for orchestrators |
| `maxsim-tools.cjs commit` | Atomic doc commits | Standardized commit messages |

### Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Custom `alwaysApply` frontmatter | Not recognized by Claude Code; use `.claude/rules/` instead |
| MCP-based skill loading | Adds complexity; native skill system is sufficient |
| Custom agent format extensions | CONTEXT.md explicitly locks: "No custom MAXSIM-specific frontmatter extensions" |
| Skill-to-skill auto-loading chains | CONTEXT.md explicitly locks: "Skills can mention 'see also' but do NOT auto-load sub-skills" |

---

## Architecture Patterns

### Pattern 1: Native Skill Directory Structure

Source: [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills)

```
.claude/
  skills/
    handoff-contract/          # Protocol skill
      SKILL.md                 # Frontmatter + instructions
    verification-gates/        # Protocol skill (NOTE: also install as rule)
      SKILL.md
    evidence-collection/       # Methodology skill
      SKILL.md
    research-methodology/      # Methodology skill
      SKILL.md
      tool-priorities.md       # Supporting file
    agent-system-map/          # Reference skill
      SKILL.md
    commit-conventions/        # Convention skill
      SKILL.md
    tool-priority-guide/       # Reference skill
      SKILL.md
    input-validation/          # Protocol skill
      SKILL.md
  agents/
    executor.md                # Generic executor agent
    planner.md                 # Generic planner agent
    researcher.md              # Generic researcher agent
    verifier.md                # Generic verifier agent
    AGENTS.md                  # Agent registry
  rules/
    conventions.md             # Always-loaded coding conventions
    verification-protocol.md   # Always-loaded verification hard gates
```

### Pattern 2: Native Agent Frontmatter Format

Source: [Claude Code Subagents Documentation](https://code.claude.com/docs/en/sub-agents)

```yaml
---
name: executor
description: Executes plans with atomic commits, deviation handling, and verified completion. Use when implementing plan tasks, making code changes, or running build/test cycles.
tools: Read, Write, Edit, Bash, Grep, Glob
model: inherit
skills:
  - handoff-contract
  - evidence-collection
  - commit-conventions
---

[System prompt content -- the agent's role, responsibilities, and behavioral instructions]
```

Key native fields used:
- `name` + `description`: Required, drives auto-delegation
- `tools`: Base tool access; orchestrator can add more at spawn time
- `model`: Use `inherit` for config profile resolution, or explicit `sonnet`/`opus`/`haiku`
- `skills`: Preloaded skills injected at startup (full content, not just metadata)

**Critical: The `skills` field in agent frontmatter preloads full skill content at agent startup.** This is the mechanism for ensuring agents always have protocol skills loaded. Different from user-invoked skills, preloaded skills inject their full content into the subagent's context.

### Pattern 3: Skill Content Structure

Source: [Agent Skills Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)

```yaml
---
name: evidence-collection
description: >-
  Systematic evidence gathering using tool output before making claims.
  Use when verifying work completion, checking test results, or validating
  build success. Prevents false completion claims.
user-invocable: false
---

# Evidence Collection

[One-line philosophy]

**HARD GATE -- [enforcement language]**

## Process
[Numbered steps]

## What Counts as Evidence
[Table: Claim | Requires | Not Sufficient]

## Common Pitfalls
[Table: Excuse | Why It Fails]

## Verification
[Checklist before claiming done]
```

Guidelines from official best practices:
- Keep SKILL.md under 500 lines
- Description in third person ("Extracts..." not "I extract...")
- Description includes BOTH what it does AND when to use it
- References to supporting files one level deep only
- Concise: only include what Claude does not already know

### Pattern 4: Orchestrator-Agent Communication

Based on CONTEXT.md decision: "Natural language with markdown sections"

```markdown
## Task
Review this implementation for code quality and security vulnerabilities.

## Context
Phase 4, Plan 04-02. The executor completed tasks 1-3 implementing the
new skill architecture. All tests pass.

## Files to Read
- .planning/phases/04-Prompt-Skill-Architecture/04-02-PLAN.md
- .claude/agents/executor.md
- .claude/skills/handoff-contract/SKILL.md

## Suggested Skills
- code-review
- verification-before-completion

## Success Criteria
- All changed files reviewed
- No security vulnerabilities
- Public interfaces match contracts
- Evidence block for each finding
```

The orchestrator carries MORE context in the new model since agents are generic. The spawn prompt is where specialization happens.

### Pattern 5: Hard Gate with Anti-Rationalization

Source: [Superpowers Pattern](https://blog.fsck.com/2025/10/09/superpowers/), existing MAXSIM skills

```markdown
**HARD GATE -- No completion claims without fresh verification evidence.**

Do NOT pass this gate by arguing it's "close enough", "minor issue", or "will fix later".
Either evidence passes or it fails. No middle ground.
Partial success is failure. "Good enough" is not enough.

If you have not run the verification command in THIS turn, you cannot claim it passes.
"Should work" is not evidence. "I'm confident" is not evidence.

FORBIDDEN PHRASES (if you catch yourself using these, STOP):
- "should work"
- "probably passes"
- "I'm confident that..."
- "based on my analysis..."
- "the logic suggests..."
- "it's reasonable to assume..."

REQUIRED: Cite specific tool call output as evidence. No tool output = no pass.
```

Key principles from research:
- Gates must be psychologically costly to bypass (commitment framing)
- Enumerate forbidden rationalizations explicitly
- Require specific, recent tool output (not prior turn)
- No advisory mode -- gate is non-negotiable
- Each retry includes feedback from previous attempt

### Pattern 6: Progressive Disclosure Layering

Source: [Anthropic Agent Skills Overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)

Three levels of context loading:

| Level | When Loaded | Token Cost | Content |
|-------|-------------|------------|---------|
| **Level 1: Metadata** | Always (at startup) | ~100 tokens/skill | `name` + `description` from YAML frontmatter |
| **Level 2: Instructions** | When skill triggered | Under 5K tokens | SKILL.md body |
| **Level 3: Resources** | As needed during execution | Effectively unlimited | Supporting files read on demand |

For MAXSIM with ~20 skills at ~100 tokens each = ~2,000 tokens of metadata always in context. This is well within the 2% context budget (2% of 200K = 4,000 tokens).

### Anti-Patterns to Avoid

| Anti-Pattern | Why Wrong | Do Instead |
|--------------|-----------|------------|
| Deeply nested @references (3+ levels) | Claude partially reads nested files, misses content | Keep references max 1 level deep from SKILL.md |
| Copy-pasting shared content across agents | Maintenance nightmare (current: 14x agent_system_map) | Extract to skill, preload via `skills` frontmatter field |
| Monolithic agent prompts (500+ lines) | Context rot, agents ignore later instructions | Extract methodology to skills, keep agent prompt focused on role |
| `alwaysApply: true` in skill frontmatter | Not a real Claude Code field | Use `.claude/rules/` for always-loaded content |
| Skills auto-loading other skills | CONTEXT.md explicitly prohibits | Use "see also" suggestions only |
| Using `context: fork` for agents | Forked skills cannot spawn sub-agents (Agent tool unavailable) | Use native agent spawning via Agent tool |

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Skill discovery/loading | Custom skill loader, MCP tool | Claude Code native skill system | Native progressive disclosure with 2% budget, auto-discovery |
| Agent spawning | Custom agent protocol, wrapper scripts | Claude Code Agent tool + `.claude/agents/` | Native delegation with context isolation, model selection |
| Always-on context | Custom `alwaysApply` mechanism | `.claude/rules/*.md` | Native rules system, loaded every session, path-scoping available |
| Skill content injection for agents | Orchestrator reading + injecting skill content | `skills` field in agent frontmatter | Native preloading mechanism, full content injected at startup |
| Agent tool restrictions | Custom permission system | `tools` + `disallowedTools` in agent frontmatter | Native Claude Code capability |
| Model selection per agent | Custom model routing | `model` field in agent frontmatter + `resolve-model` CLI | `inherit` = session model, or explicit `sonnet`/`opus`/`haiku` |
| User/internal skill separation | Custom visibility flags | `user-invocable: false` frontmatter field | Native Claude Code feature |
| Subagent context isolation | Custom context management | Native Agent tool context windows | Each subagent gets fresh context window |

---

## Common Pitfalls

### Pitfall 1: Confusing Skills vs Rules for Always-Loaded Content

**What goes wrong:** Placing conventions or verification protocol as skills with `alwaysApply: true`, expecting them to load at session start.

**Why:** Claude Code skills are ALWAYS on-demand. The `alwaysApply` field does not exist in Claude Code. Skills only load when triggered by description match or user invocation. For content that must be present in every session, Claude Code provides `.claude/rules/` and CLAUDE.md.

**How to avoid:** Use `.claude/rules/` for always-loaded conventions and verification protocol. Use skills for methodology and reference content that loads on-demand.

**Warning signs:** Agent ignoring conventions or verification protocol; skills showing as "excluded" in `/context` output.

### Pitfall 2: Skill Descriptions That Don't Trigger

**What goes wrong:** Writing vague descriptions like "Helps with verification" that Claude cannot match to user requests.

**Why:** Claude uses skill descriptions for auto-invocation matching. Per Vercel's evaluation data, "skills were never invoked in 56% of test cases" with poor descriptions. Descriptions must include specific trigger keywords and context.

**How to avoid:** Write descriptions in third person with specific triggers: "Systematic evidence gathering using tool output before making claims. Use when verifying work completion, checking test results, or validating build success."

**Warning signs:** Skills not activating when expected; users having to invoke manually with `/skill-name`.

### Pitfall 3: Agent Prompts Too Large After Skill Preloading

**What goes wrong:** Preloading 5+ skills into an agent via `skills` frontmatter, consuming excessive startup context.

**Why:** The `skills` field injects FULL skill content at agent startup, not just metadata. 5 skills at 200 lines each = 1,000 lines of preloaded content before the agent even starts working.

**How to avoid:** Preload only essential protocol skills (handoff-contract, evidence-collection). Let agents auto-discover methodology and reference skills on-demand via description matching. Budget: 2-3 preloaded skills max per agent.

**Warning signs:** Agents running out of context quickly; agents ignoring instructions that appear late in their system prompt.

### Pitfall 4: Subagents Cannot Spawn Other Subagents

**What goes wrong:** Designing agent chains where Executor spawns Verifier spawns Debugger.

**Why:** Claude Code documentation explicitly states: "Subagents cannot spawn other subagents." The Agent tool is NOT available in subagent contexts. Only the main conversation thread (orchestrator) can spawn subagents.

**How to avoid:** CONTEXT.md says "Agents CAN spawn sub-agents" but this conflicts with Claude Code's limitation. The workaround: orchestrators handle all agent spawning. Agents return results to orchestrator, which then spawns the next agent. This is actually the current MAXSIM pattern and works correctly.

**Warning signs:** Agent errors about "Agent tool not available"; subagent attempting to use Task/Agent tool and failing.

### Pitfall 5: Deeply Nested @References

**What goes wrong:** Command references workflow, which references sub-workflow, which references reference doc (3+ levels deep).

**Why:** Per official best practices: "Claude may partially read files when they're referenced from other referenced files. When encountering nested references, Claude might use commands like `head -100` to preview content rather than reading entire files."

**How to avoid:** Maximum 2 levels: Command -> Workflow -> (inline content or skill references). Workflows should NOT @reference other workflows. Extract shared content to skills instead.

**Warning signs:** Agents missing instructions that appear in deeply nested files; partial behavior execution.

### Pitfall 6: Orchestrator Context Starvation

**What goes wrong:** Orchestrators carry too little context after consolidating from 14 to 4 agents, leaving agents confused about their task.

**Why:** With generic agents, the orchestrator spawn prompt must carry the specialization context. If the orchestrator just says "verify this," the Verifier doesn't know whether to do code review, spec review, or debugging.

**How to avoid:** Orchestrator spawn prompts use structured sections (Task, Context, Files to Read, Suggested Skills, Success Criteria) with specific instructions. Include what kind of verification, what criteria to check, and what tools to use.

**Warning signs:** Agents asking clarifying questions instead of working; agents performing wrong type of work.

### Pitfall 7: Gate Bypass Through Rationalization

**What goes wrong:** Agent argues that evidence is "not needed for this case" or "already verified in a previous step" to skip a hard gate.

**Why:** LLMs are natural rationalizers. Without explicit anti-rationalization language, agents construct convincing arguments for why they should skip verification. The Superpowers pattern research shows this is a fundamental tendency.

**How to avoid:** Every gate must include: (1) explicit forbidden phrases, (2) statement that partial success is failure, (3) requirement for THIS-turn tool output, (4) no exceptions clause. Make gate bypass psychologically costly.

**Warning signs:** Gate pass claims without corresponding tool calls in the same turn; phrases like "should work" or "based on my analysis" in gate evidence.

---

## Code Examples

### Example 1: Complete Agent Definition (executor.md)

Source: [Claude Code Subagents Documentation](https://code.claude.com/docs/en/sub-agents)

```yaml
---
name: executor
description: >-
  Implements plans with atomic commits, verified completion, and deviation
  handling. Use when executing PLAN.md tasks, making code changes, running
  build/test cycles, or implementing features from specifications.
tools: Read, Write, Edit, Bash, Grep, Glob
model: inherit
skills:
  - handoff-contract
  - evidence-collection
  - commit-conventions
---

You are a plan executor. You implement PLAN.md files atomically, creating
per-task commits, handling deviations, and producing SUMMARY.md files.

## Input Validation

Before any work, verify required inputs exist:
- PLAN.md file path (from orchestrator prompt)
- STATE.md readable

If missing, return immediately:

AGENT RESULT: INPUT VALIDATION FAILED
Missing: [list]

## Execution Protocol

For each task in the plan:

1. Read the task specification
2. Implement the changes
3. Run the task's verify block
4. Produce evidence block (CLAIM/EVIDENCE/OUTPUT/VERDICT)
5. Stage files and commit with conventional commit message
6. Move to next task

## Deviation Rules

- Auto-fix bugs found during execution (still verify)
- Cosmetic improvements: include if touched file
- Scope creep: log as deferred item, do NOT implement
- Architectural changes: STOP and return checkpoint

## Completion

Return structured result:

### Key Decisions
- [decisions made]

### Artifacts
- Created: [files]
- Modified: [files]

### Status
{complete | blocked | partial}

### Deferred Items
- [{category}] {description}
```

### Example 2: Complete Skill Definition (verification-gates)

```yaml
---
name: verification-gates
description: >-
  Hard gate framework for evidence-based verification. Defines retry logic,
  evidence standards, anti-rationalization language, and escalation protocol.
  Use when implementing verification checkpoints, completion gates, or
  quality checks in agent workflows.
user-invocable: false
---

# Verification Gates

Evidence before claims, always. No exceptions.

## Gate Types

### 1. Input Validation Gate
Before starting work, verify all required inputs exist.
Failure: Return structured error immediately. Do not attempt partial work.

### 2. Pre-Action Gate
Before destructive actions (writes, commits, PRs), verify intent and impact.
Required: State what will be changed, what could break, and confirm with evidence.

### 3. Completion Gate
Before claiming done, run verification commands and cite tool output.

**HARD GATE -- No completion claims without fresh verification evidence.**

Do NOT pass this gate by arguing it's "close enough", "minor issue", or "will fix later".
Either evidence passes or it fails. No middle ground.
Partial success is failure. "Good enough" is not enough.

FORBIDDEN PHRASES (if you catch yourself using these, STOP):
- "should work"
- "probably passes"
- "I'm confident that..."
- "based on my analysis..."
- "the logic suggests..."
- "it's reasonable to assume..."

REQUIRED: Cite specific tool call output as evidence. No tool output = no pass.

### 4. Quality Gate
After implementation, check code quality (lint, test, build).
All checks must pass with evidence before proceeding.

## Evidence Standard

Any tool output qualifies: test output, build results, git diff, file reads, linter output.

| Claim | Requires | Not Sufficient |
|-------|----------|----------------|
| "Tests pass" | Test command output showing 0 failures | Previous run, "should pass" |
| "Build succeeds" | Build command with exit code 0 | Linter passing only |
| "Bug is fixed" | Original failing test now passes | "Code changed, assumed fixed" |
| "Task complete" | All criteria checked with evidence | "I implemented everything" |

## Retry Protocol

- Maximum 2 retries (3 total attempts)
- Each retry includes: what failed, expected evidence, actual result
- After 3rd failure: escalate with full failure context
- Log every gate attempt to GitHub Issues as audit trail

## Evidence Block Format

CLAIM: [what you are claiming]
EVIDENCE: [exact command run in THIS turn]
OUTPUT: [relevant excerpt of actual output]
VERDICT: PASS | FAIL
```

### Example 3: Always-Loaded Rule (conventions.md)

```markdown
# MAXSIM Conventions

## Commit Messages
Use conventional commits: fix:, feat:, chore:, docs:, test:, refactor:
Include scope: fix(phase-04): description
Atomic commits: one logical change per commit

## File Naming
Skills: .claude/skills/<kebab-case>/SKILL.md
Agents: .claude/agents/<simple-name>.md
Rules: .claude/rules/<topic>.md

## Code Style
Follow project CLAUDE.md for language-specific conventions
TypeScript: async-only (no sync duplicates)
Markdown: Use ATX headers, no trailing whitespace

## Deferred Items Format
- [{category}] {description} -- {why deferred}
Categories: feature, bug, refactor, investigation
```

### Example 4: Orchestrator Spawn Prompt

```markdown
## Task
Execute Plan 04-02: Create skill files for the 8 internal skills
defined in the CONTEXT.md skill inventory.

## Context
Phase 4: Prompt & Skill Architecture. Plan 04-01 (agent definitions)
is complete. This plan creates the skill SKILL.md files that agents
reference in their `skills` frontmatter field.

## Files to Read
- .planning/phases/04-Prompt-Skill-Architecture/04-02-PLAN.md
- .planning/STATE.md
- .claude/agents/executor.md (to understand skill references)

## Suggested Skills
- commit-conventions
- verification-before-completion

## Success Criteria
- All 8 internal skills created in .claude/skills/<name>/SKILL.md
- Each skill has valid frontmatter (name, description)
- Internal skills have user-invocable: false
- Each skill is 10-200 lines (meaningful but concise)
- Build passes after changes
```

---

## State of the Art

| Old Approach (v4.x) | Current Approach (v5.0) | When Changed | Impact |
|---------------------|------------------------|--------------|--------|
| 14 specialized agents with copy-pasted system maps | 4 generic agents + skills for specialization | Phase 4 | 71% agent reduction, zero duplication |
| Monolithic agent prompts (300-600 lines) | Focused prompts + preloaded skills + on-demand skills | Phase 4 | Better context utilization, progressive disclosure |
| Custom `alwaysApply` in skill frontmatter | `.claude/rules/` for always-on + native skills for on-demand | Phase 4 | Uses native Claude Code mechanisms |
| @reference chains (3+ levels deep) | Max 2 levels: Command -> Workflow -> inline/skills | Phase 4 | Reliable content loading |
| Agents hardcode all protocols | Protocol skills preloaded via `skills` frontmatter | Phase 4 | Single source of truth, composable |
| Self-assessment completion claims | Hard gates with anti-rationalization + tool output evidence | Phase 4 | Prevents false completion claims |
| Orchestrator delegates to specialist agents | Orchestrator provides rich context to generic agents | Phase 4 | Orchestrator carries specialization |

---

## Open Questions

### 1. Subagent-to-Subagent Spawning Limitation

**What we know:** Claude Code documentation states "Subagents cannot spawn other subagents." The Agent tool is not available in subagent contexts.

**What's unclear:** The CONTEXT.md decision says "Agents CAN spawn sub-agents: Not limited to orchestrator routing. E.g., Executor can spawn Verifier for self-check." This directly conflicts with Claude Code's documented limitation.

**Recommendation:** Implement the orchestrator-mediated pattern (current MAXSIM approach). Agents return results to orchestrator, orchestrator spawns next agent. This works within Claude Code's constraints. Document this as a design constraint for the planner. If Claude Code adds subagent-to-subagent spawning in the future, this can be relaxed.

### 2. Agent `skills` Preloading vs On-Demand Budget

**What we know:** The `skills` field in agent frontmatter preloads FULL content at startup. On-demand skills load ~100 tokens of metadata until triggered.

**What's unclear:** The optimal balance between preloaded and on-demand skills for each agent type. Too many preloaded = context waste. Too few = agent misses critical protocols.

**Recommendation:** Preload 2-3 protocol skills per agent (handoff-contract, evidence-collection). Let methodology and reference skills load on-demand. Measure and adjust during execution if agents miss critical context.

### 3. Model Profile Mapping for 4 Agents

**What we know:** Current `MODEL_PROFILES` has 12 agent types. New architecture has 4. The CLI's `resolve-model` function maps agent type to model alias.

**What's unclear:** Whether the 4 new agent names (`executor`, `planner`, `researcher`, `verifier`) should replace or coexist with old names during transition.

**Recommendation:** Update `MODEL_PROFILES` and `AgentType` to the 4 new names. The CLI refactoring is in scope since orchestrators are being rewritten anyway. Old names become dead code.

---

## Phase Requirements to Research Support

| Req ID | Requirement | Research Support |
|--------|-------------|-----------------|
| PROMPT-01 | Skills-based progressive context disclosure | Pattern 6 (Progressive Disclosure Layering), native skill system verified, 3-level loading confirmed |
| PROMPT-02 | Custom agent definitions (4 types) | Pattern 2 (Native Agent Frontmatter), full spec verified with frontmatter fields |
| PROMPT-03 | Less nesting (max 2 @reference levels) | Pitfall 5 (Deeply Nested References), official best practices confirm 1-level deep recommendation |
| PROMPT-04 | Hard gates with anti-rationalization | Pattern 5 (Hard Gate with Anti-Rationalization), Superpowers pattern researched |
| PROMPT-05 | Evidence-based verification gates | Code Example 2 (verification-gates skill), evidence standard table, retry protocol |

---

## Sources

### Primary (HIGH confidence)

- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills) -- Complete SKILL.md frontmatter specification, skill loading behavior, progressive disclosure
- [Claude Code Subagents Documentation](https://code.claude.com/docs/en/sub-agents) -- Complete agent frontmatter specification, `skills` preloading, spawning constraints
- [Claude Code Memory Documentation](https://code.claude.com/docs/en/memory) -- CLAUDE.md, `.claude/rules/`, auto memory, loading order
- [Agent Skills Overview (Anthropic Platform)](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) -- Three-level progressive disclosure architecture
- [Skill Authoring Best Practices (Anthropic Platform)](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) -- Conciseness, description writing, progressive disclosure patterns, reference depth

### Secondary (MEDIUM confidence)

- [Building Effective Agents (Anthropic)](https://www.anthropic.com/research/building-effective-agents) -- Orchestrator-worker patterns, agent verification, ACI design
- [Superpowers Pattern (fsck.com)](https://blog.fsck.com/2025/10/09/superpowers/) -- Hard gate enforcement, anti-rationalization via persuasion principles
- [Progressive Disclosure for AI Coding Tools (alexop.dev)](https://alexop.dev/posts/stop-bloating-your-claude-md-progressive-disclosure-ai-coding-tools/) -- Practical layered context, 56% skill non-invocation data from Vercel

### Tertiary (LOW confidence)

- [Progressive Disclosure for AI Agents (honra.io)](https://www.honra.io/articles/progressive-disclosure-for-ai-agents) -- General progressive disclosure concepts
- [Context Engineering for Coding Agents (Martin Fowler)](https://martinfowler.com/articles/exploring-gen-ai/context-engineering-coding-agents.html) -- Context engineering patterns

---

## Metadata

| Area | Confidence | Reason |
|------|-----------|--------|
| Skill System Architecture | HIGH | Verified against official Claude Code docs (code.claude.com) |
| Agent Format Specification | HIGH | Verified against official Claude Code docs (code.claude.com) |
| `alwaysApply` Non-Existence | HIGH | Confirmed absent from official frontmatter reference table |
| Anti-Rationalization Patterns | MEDIUM | Superpowers pattern + existing MAXSIM patterns; no Anthropic official guidance |
| Progressive Disclosure | HIGH | Confirmed by both Claude Code docs and Anthropic Platform docs |
| Subagent Spawning Limitation | HIGH | Explicit in official docs: "Subagents cannot spawn other subagents" |
| Skill Preloading Behavior | HIGH | Documented in subagent `skills` field: "full content injected at startup" |

**Research date:** 2026-03-10
**Valid until:** ~2026-06-10 (Claude Code updates frequently; verify skill/agent API before major changes)

---
*Research completed: 2026-03-10*
*Domains investigated: Claude Code Skills API, Claude Code Agents API, Progressive Context Disclosure, Anti-Rationalization Patterns, Orchestrator-Agent Communication*
