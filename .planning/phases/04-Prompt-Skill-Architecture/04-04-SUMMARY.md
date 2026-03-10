---
phase: 04-Prompt-Skill-Architecture
plan: 04
subsystem: workflows, cli-core, installer
tags: [agent-consolidation, workflow-update, type-system, installer]
requires: [04-01]
provides: [consolidated-agent-references, new-agent-types, rules-installation]
affects: [all-workflows, model-resolution, install-flow]
tech-stack: [typescript, markdown]
key-files:
  created:
    - packages/cli/src/install/index.ts (rules/ installation block)
  modified:
    - templates/workflows/execute-phase.md
    - templates/workflows/execute-plan.md
    - templates/workflows/execute.md
    - templates/workflows/plan-phase.md
    - templates/workflows/plan-create.md
    - templates/workflows/plan-discuss.md
    - templates/workflows/plan-research.md
    - templates/workflows/discuss-phase.md
    - templates/workflows/batch.md
    - templates/workflows/quick.md
    - templates/workflows/sdd.md
    - templates/workflows/verify-work.md
    - templates/workflows/research-phase.md
    - templates/workflows/new-project.md
    - templates/workflows/new-milestone.md
    - templates/workflows/init-existing.md
    - templates/workflows/diagnose-issues.md
    - packages/cli/src/core/types.ts
    - packages/cli/src/core/core.ts
    - packages/cli/src/core/init.ts
    - packages/cli/src/install/hooks.ts
    - packages/cli/src/install/index.ts
key-decisions:
  - "Orphan cleanup entries added to hooks.ts (not patches.ts as plan specified) since cleanupOrphanedFiles() lives there"
  - "MODEL_PROFILES uses highest-tier mapping per consolidated role: planner=opus/opus/sonnet, executor=opus/sonnet/sonnet, researcher=opus/sonnet/haiku, verifier=sonnet/sonnet/haiku"
  - "diagnose-issues.md debug agents updated from general-purpose to verifier with systematic-debugging skill suggestion"
  - "new-project.md, new-milestone.md, init-existing.md, research-phase.md also updated (not listed in original plan but contained old agent names)"
requirements-completed:
  - PROMPT-02
  - PROMPT-03
duration: ~25min
completed: 2026-03-10T14:39:00Z
---

# 04-04 Summary: Agent name consolidation across workflows and CLI source

Systematic replacement of 14 old maxsim-* agent names with 4 generic types (executor, planner, researcher, verifier) across all workflow files and CLI source code, plus rules directory installation support.

## Task Execution

| Task | Name | Status | Commit | Files |
|------|------|--------|--------|-------|
| 1 | Update all workflow files to reference new agent names | PASS | 2c81d3f | 17 workflow files |
| 2 | Update CLI source code (AgentType, MODEL_PROFILES, installer, orphan cleanup) | PASS | a2e5c46 | 5 CLI source files |

## What Changed

### Task 1: Workflow Agent Name Updates (17 files)
- Replaced all `subagent_type="maxsim-*"` with new 4-agent names
- Replaced all `resolve-model maxsim-*` CLI calls with new names
- Replaced all textual references ("maxsim-executor agent" -> "executor agent")
- Removed all `read ~/.claude/agents/maxsim-*.md` manual file loading patterns (Claude Code loads agents natively via subagent_type)
- Enriched specialist replacement spawns with `## Task` and `## Suggested Skills` sections:
  - spec-reviewer -> verifier + "Task: Review for spec compliance" + "Skills: verification-gates, evidence-collection"
  - code-reviewer -> verifier + "Task: Review for code quality" + "Skills: code-review"
  - debugger -> verifier + "Task: Diagnose root cause" + "Skills: systematic-debugging"
  - plan-checker -> planner + "Task: Verify plans achieve phase goal" + "Skills: verification-gates"

### Task 2: CLI Source Code Updates (5 files)
- **types.ts**: AgentType reduced from 12 entries to 4 (executor, planner, researcher, verifier)
- **core.ts**: MODEL_PROFILES reduced from 12 entries to 4 with tier mappings
- **init.ts**: All 33 resolveModelInternal() calls updated to new agent names
- **hooks.ts**: 14 old agent files added to orphan cleanup list for v4.x upgrades
- **index.ts**: New rules/ directory installation block (copies templates/rules/ -> .claude/rules/)

## Deviations

1. **[Rule 2 - Missing critical functionality]** The plan listed 15 workflow files but grep revealed 4 additional files with old agent names: new-project.md, new-milestone.md, init-existing.md, research-phase.md, diagnose-issues.md. Updated all of them.

2. **[Plan deviation]** The plan specified adding orphan entries to `packages/cli/src/install/patches.ts`, but the actual `cleanupOrphanedFiles()` function lives in `packages/cli/src/install/hooks.ts`. Added entries there instead.

3. **[Plan deviation]** The plan specified `executor: quality=opus, balanced=sonnet, budget=haiku` but the existing maxsim-executor profile used `budget=sonnet`. Preserved the higher sonnet budget tier for executor since executors do the heavy lifting of code changes.

## Review Cycle
- Spec: PASS (0 retries) -- all must_haves verified via automated grep and build
- Code: PASS (0 retries) -- build succeeds, 212/212 tests pass
- Issues: 0 critical, 0 warnings

## Verification Evidence

**Must-have 1**: All workflow files reference new names
```
grep -rl "maxsim-(executor|planner|...)" templates/workflows/ -> ZERO MATCHES
```

**Must-have 2**: AgentType has exactly 4 entries
```
types.ts lines 83-87: executor, planner, researcher, verifier
```

**Must-have 3**: MODEL_PROFILES maps 4 new names
```
core.ts lines 31-34: executor, planner, researcher, verifier with quality/balanced/budget/tokenburner tiers
```

**Must-have 4**: Installer copies rules/
```
index.ts: New rules/ installation block after skills/ block
```

**Must-have 5**: resolve-model works with new names
```
All 33 resolveModelInternal() calls in init.ts updated; build passes
```

**Must-have 6**: No workflow references old agent names
```
grep -rl across templates/workflows/ -> ZERO MATCHES
```

## Self-Check: PASSED
