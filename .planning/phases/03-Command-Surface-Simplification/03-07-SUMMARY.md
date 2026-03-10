# Plan 03-07 Summary: Update Cross-References for 9-Command Surface

**Plan:** 03-07
**Phase:** 03-Command-Surface-Simplification
**Status:** Complete
**Duration:** 8m 39s
**Tasks:** 2/2

## What Was Built

Systematic grep-and-replace pass across the entire templates/ directory to update all cross-references from old command names to the 9-command surface (init, plan, execute, go, progress, debug, quick, settings, help). This was the "Pitfall 2" mitigation from RESEARCH.md: ensuring no stale references remain after Plan 06 deleted old command files.

## Task Results

| Task | Name | Commit | Files Changed |
|------|------|--------|---------------|
| 01 | Rewrite using-maxsim SKILL.md | `cdcddf3` | 1 (SKILL.md) |
| 02 | Update all cross-references | `d4ee968` | 34 files |

## Key Changes

### Task 01: SKILL.md Rewrite
- Routing table rewritten with 11 entries mapping situations to new commands
- Available Agents table updated with correct "Triggered By" values
- Hard Gate section uses new command names (init, plan, execute)
- File kept under 120 lines (111 lines)

### Task 02: Cross-Reference Cleanup (34 files)
- **9 agent prompts updated:** executor, planner, plan-checker, phase-researcher, project-researcher, research-synthesizer, roadmapper, verifier, drift-checker
- **1 command file updated:** debug.md (plan-phase --gaps -> plan --gaps)
- **2 reference files updated:** continuation-format.md (all examples), model-profiles.md (set-profile -> settings)
- **8 template files updated:** UAT.md, VALIDATION.md, discovery.md, phase-prompt.md, planner-subagent-prompt.md, project.md, research.md, state.md
- **14 workflow files updated:** batch, discovery-phase, discuss-phase, execute-phase, execute-plan, health, init-existing, new-milestone, new-project, plan-phase, research-phase, sdd, verify-phase, verify-work

### Command Mapping Applied

| Old Name | New Name |
|----------|----------|
| /maxsim:plan-phase | /maxsim:plan |
| /maxsim:execute-phase | /maxsim:execute |
| /maxsim:discuss-phase | /maxsim:plan (discussion stage) |
| /maxsim:research-phase | /maxsim:plan --research |
| /maxsim:verify-work | /maxsim:execute (verification) |
| /maxsim:verify-phase | /maxsim:execute (auto-verify stage) |
| /maxsim:new-project | /maxsim:init |
| /maxsim:init-existing | /maxsim:init |
| /maxsim:new-milestone | /maxsim:init |
| /maxsim:set-profile | /maxsim:settings |
| /maxsim:map-codebase | /maxsim:init (codebase mapping) |
| /maxsim:add-todo / check-todos | /maxsim:quick --todo |
| /maxsim:health | /maxsim:progress (health check) |
| /maxsim:roadmap | /maxsim:progress |
| /maxsim:complete-milestone | /maxsim:progress |
| /maxsim:insert-phase | MCP tool |
| /maxsim:sdd | /maxsim:execute (SDD mode) |

## Verification

Final grep confirms zero matches for any old command name across templates/:
```
grep -rl 'maxsim:plan-phase|maxsim:execute-phase|...' templates/
(zero results)
```

## Key Decisions

- AGENTS.md was already clean (no /maxsim: command references, only agent names like maxsim-executor) -- no changes needed
- Workflow files that are kept (not deleted by Plan 06) but reference old commands were updated to use new names with contextual parenthetical annotations (e.g., "/maxsim:plan (discussion stage)")
- Agent frontmatter descriptions updated alongside inline references for consistency

## Artifacts

- Modified: templates/skills/using-maxsim/SKILL.md
- Modified: 9 agent files in templates/agents/
- Modified: 1 command file in templates/commands/maxsim/
- Modified: 2 reference files in templates/references/
- Modified: 8 template files in templates/templates/
- Modified: 14 workflow files in templates/workflows/

## Deviations

- [Rule 2 - Auto-add missing] Fixed /maxsim:research-phase references (5 occurrences in agents/planner, agents/research-synthesizer, templates/discovery, workflows/discovery-phase) not explicitly listed in the plan but found during systematic grep. Updated to /maxsim:plan --research.

## Review Cycle

Skipped -- this is a documentation-only cross-reference cleanup plan with no code changes. All changes are mechanical find-and-replace in markdown files.
