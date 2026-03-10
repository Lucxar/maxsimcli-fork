# Phase 5 Research: Parallel Execution Model

**Researched:** 2026-03-10
**Agents:** 8 parallel research agents across all requirements
**Confidence:** HIGH (codebase analysis + existing pattern validation)

## Executive Summary

Phase 5 transforms MAXSIM's execution model from orchestrator-sequential to orchestrator-coordinated-parallel. The core infrastructure already exists (batch.md, execute-phase.md parallelization flag, Agent Teams install). Phase 5 integrates these into the `/maxsim:execute` command with worktree isolation, formalized review loops, and spec-driven enforcement.

**Key insight:** This is an integration + enhancement phase, not a greenfield build. Most building blocks exist.

## Requirement Analysis

### EXEC-01: Native Parallel Execution with Worktree Isolation (up to 30 agents)

**What exists:**
- `isolation="worktree"` parameter on Task() — creates isolated git worktrees automatically
- batch.md workflow uses worktrees for independent unit execution
- `parallelization: true` config flag controls within-wave parallelism in execute-phase.md
- execute-phase.md already spawns parallel agents within waves (lines 95-221)

**What needs to change:**
- execute-phase.md must add `isolation="worktree"` when spawning parallel plan executors
- New config: `worktree_mode: "auto|always|never"` (default: "auto")
- Auto-detection: 3+ plans in single wave → use worktrees automatically
- Override flags: `--worktrees` / `--no-worktrees` on execute command
- Worktree lifecycle: create before spawn, cleanup after wave completes
- Metadata handling: agents write SUMMARY.md in worktree, orchestrator collects after completion

**Merge strategy:** No conflicts by design — plans in same wave touch different files. Metadata files (STATE.md, ROADMAP.md) updated only by orchestrator after all agents complete.

**Worktree model:** Worktree-per-plan (recommended over worktree-per-wave or worktree-per-task).

### EXEC-02: Agent Teams for Multi-Agent Coordination

**What exists:**
- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` env var — set during install
- Install prompts user to enable Agent Teams
- Orchestrator-mediated communication pattern (AGENTS.md)
- `team_name` parameter available on Task() but undocumented/unused

**What needs to change:**
- Execute workflow uses `team_name` parameter to group agents in a wave
- Team coordination through orchestrator: spawn all → collect results → aggregate
- Status tracking via progress table (existing pattern from batch.md)
- Inter-wave handoff: orchestrator passes wave N results as context to wave N+1 agents

**Key constraint:** Subagents CANNOT spawn other subagents. All coordination routes through orchestrator. Agent Teams provides grouping/tracking, not direct inter-agent messaging.

**Practical implication:** Agent Teams in MAXSIM means "orchestrator tracks a named group of parallel agents" — not peer-to-peer communication.

### EXEC-03: Two-Stage Review Loop with Retry

**What exists (already 4-stage in execute-plan.md):**
1. Spec Review — verifier checks plan spec compliance (PASS/FAIL)
2. Code Review — verifier checks code quality (APPROVED/BLOCKED)
3. Simplify — 3 parallel reviewers find reuse/quality/efficiency issues
4. Final Review — re-review after simplification changes

**What needs to change:**
- Formalize retry counters: max 3 attempts per stage
- Add escalation protocol: after 3 failures → user checkpoint with full context
- Make Simplify stage config-optional: `simplify_review: true|false` (default: true)
- Add review caching: don't re-review unchanged code (git diff check)
- Enhanced SUMMARY.md reporting: attempt counts, timing, detailed findings per stage
- Orchestrator spot-check enhancement: verify `## Review Cycle` section has both Spec and Code stages PASS

**The "two-stage" = Spec + Code (both mandatory). Simplify = enhancement (optional).**

### EXEC-04: Batch Execution Integrated into Execute Command

**What exists:**
- batch.md workflow — separate decomposition + worktree execution for ad-hoc tasks
- maxsim-batch skill — batch constraints and documentation
- execute-phase.md — wave-based execution without worktree isolation

**What needs to change:**
- Add `decide_execution_mode` step to execute-phase.md (after discover_and_group_plans)
- Decision logic: worktree_mode config + flag override + auto-detection threshold
- Split `execute_waves` into two paths: batch (worktree isolation) and standard (current)
- Batch path: create worktrees → spawn parallel agents → track → collect → cleanup
- Standard path: existing wave-by-wave execution (unchanged)
- Keep batch.md for ad-hoc task decomposition (different use case)

**Trigger threshold:** `wave_count == 1 AND plan_count > 2` → auto-enable batch mode.

### EXEC-05: Spec-Driven Development as Core Methodology

**What exists:**
- Plan frontmatter `requirements: [REQ-IDS]` field links plans to requirements
- Planner receives `phase_req_ids` and must cover all across plans
- Spec Review stage in execute-plan.md review cycle
- `requirements mark-complete` CLI command updates REQUIREMENTS.md
- SDD skill documents fresh-context-per-task pattern

**What needs to change:**
- Add pre-execution gate G1: validate requirements exist in REQUIREMENTS.md before execution
- Add pre-execution gate G2: fail if any requirement already marked Complete
- Add post-execution gate G6: validate SUMMARY.md has evidence for each requirement
- Enhanced requirement evidence section in SUMMARY.md template
- End-to-end traceability: REQUIREMENTS.md → ROADMAP.md → PLAN.md → SUMMARY.md → REQUIREMENTS.md

**7 enforcement gates identified:**
1. G1: Requirement Existence (pre-execution)
2. G2: Requirement Status (pre-execution)
3. G3: Requirement Coverage (planning stage — existing)
4. G4: Spec Compliance (post-execution — existing)
5. G5: Code Quality (post-execution — existing)
6. G6: Evidence Completeness (before metadata commit)
7. G7: Deviation Reconciliation (before requirement marking)

## Architecture Design

### Execution Mode Decision Flow

```
/maxsim:execute {phase} [--worktrees|--no-worktrees]
  ↓
1. Initialize (existing)
2. Detect State (existing)
3. Discover & Group Plans (existing)
4. *** Decide Execution Mode (NEW) ***
   ├─ Read config: worktree_mode (auto|always|never)
   ├─ Check flags: --worktrees / --no-worktrees
   ├─ Auto-detect: wave_count==1 AND plan_count>2 → batch
   └─ Display: "Execution Mode: Batch (worktree isolation) | Standard"
5a. IF BATCH MODE:
   ├─ Validate plan independence (no file overlap)
   ├─ Create worktrees (one per plan)
   ├─ Spawn executor agents (isolation="worktree", run_in_background=true)
   ├─ Track progress (status table)
   ├─ Collect results from each worktree
   └─ Cleanup worktrees
5b. IF STANDARD MODE:
   └─ Execute waves (existing logic, unchanged)
6. Aggregate Results (enhanced for both paths)
7. Auto-Verify (existing)
8. Retry Loop (existing)
9. Update Roadmap (existing)
```

### Metadata Conflict Prevention

**Problem:** Parallel agents cannot concurrently write STATE.md/ROADMAP.md.

**Solution (orchestrator-only metadata):**
1. Agents write SUMMARY.md only (local to their plan/worktree)
2. Agents do NOT update STATE.md or ROADMAP.md
3. Orchestrator collects all SUMMARYs after wave completes
4. Orchestrator performs single batch update to STATE.md/ROADMAP.md
5. File-based lock (.planning/.state.lock) for safety during sequential updates

### Review Cycle Enhancement

```
Stage 1: Spec Review (MANDATORY)
  ├─ Run: max 3 attempts
  ├─ PASS → proceed to Stage 2
  └─ FAIL after 3 → escalate to user checkpoint

Stage 2: Code Review (MANDATORY)
  ├─ Run: max 3 attempts
  ├─ APPROVED → proceed to Stage 3 (if enabled)
  └─ BLOCKED after 3 → escalate to user checkpoint

Stage 3: Simplify (OPTIONAL, config-driven)
  ├─ 3 parallel reviewers: reuse, quality, efficiency
  ├─ ALL CLEAN → skip Stage 4
  └─ ISSUES_FOUND → fix → proceed to Stage 4

Stage 4: Final Review (only if Stage 3 applied fixes)
  ├─ APPROVED → plan done
  └─ BLOCKED → fix, retry (max 3)
```

## CLI/TypeScript Changes

### New Core Module: `packages/cli/src/core/worktree.ts`

Functions needed:
- `createWorktree(cwd, phase, wave, agentType)` → WorktreeInfo
- `listWorktrees(cwd)` → WorktreeInfo[]
- `cleanupWorktree(cwd, worktreeId)` → void
- `assignPlansToWorktrees(plans, waveConfig, maxParallel)` → WorktreeAssignment[]

### Type Additions (types.ts)

```
WorktreeState = 'active' | 'completed' | 'failed' | 'cleanup'
WorktreeInfo { id, branch, wave, assigned_agent, status, plan_ids[], created_at }
ParallelExecutionConfig { enabled, max_worktrees, worktree_mode, review_gates }
ReviewGateResult { passed, failed_criteria[], evidence[], retry_count }
WaveExecutionResult { wave_num, completed_plans, failed_plans, review_results }
```

### Config Additions

```json
{
  "parallelization": true,
  "worktree_mode": "auto",
  "max_parallel_agents": 10,
  "review": {
    "spec_review": true,
    "code_review": true,
    "simplify_review": true,
    "retry_limit": 3
  }
}
```

### Estimated Changes by File

| File | Changes | Complexity |
|------|---------|-----------|
| `worktree.ts` (NEW) | Worktree lifecycle management | Large (~300 lines) |
| `types.ts` | New interfaces for worktree, review, parallel | Small (~150 lines) |
| `cli.ts` | New commands: worktree-create/list/cleanup | Medium (~150 lines) |
| `init.ts` | Extend ExecutePhaseContext with worktree/review fields | Medium (~100 lines) |
| `config.ts` | Add worktree_mode, review config defaults | Small (~50 lines) |
| `state.ts` | File-based locking for concurrent safety | Medium (~100 lines) |
| `phase.ts` | Extend plan-index with worktree assignments | Medium (~100 lines) |
| `verify.ts` | Add spec/code review gate functions | Large (~150 lines) |

### Template Changes

| File | Changes |
|------|---------|
| `workflows/execute-phase.md` | Add decide_execution_mode step, split execute_waves into batch/standard paths |
| `workflows/execute-plan.md` | Add retry counters to review cycle, escalation protocol, config-optional simplify |
| `workflows/execute.md` | Add --worktrees flag documentation, update flow diagram |
| `commands/maxsim/execute.md` | Add --worktrees argument hint |
| `agents/executor.md` | Clarify worktree behavior, metadata restriction |
| `templates/summary.md` | Add requirement evidence section, enhanced review cycle reporting |

## Common Pitfalls

1. **Agents writing STATE.md in parallel** → Race condition. Solution: orchestrator-only metadata.
2. **Same branch in multiple worktrees** → Git error. Solution: unique branch per worktree.
3. **Reviewing unchanged code** → Wasted time. Solution: git diff check before re-review.
4. **Infinite review loops** → Max 3 attempts, then escalate.
5. **Worktree cleanup failure** → Orphaned worktrees. Solution: explicit cleanup step + fallback.
6. **Agent Teams as peer-to-peer** → Not supported. All coordination through orchestrator.

## Open Questions

1. **Worktree file visibility:** Can orchestrator read SUMMARY.md from agent's worktree path after agent completes? Or does agent need to output content for orchestrator to reconstruct?
2. **Team API surface:** `team_name` parameter exists but behavior is undocumented. Need runtime experimentation.
3. **Scale testing:** 30 parallel worktrees untested. Start with 5-10 and scale up.

## Standard Stack

| Component | Technology | Justification |
|-----------|-----------|---------------|
| Worktree management | git worktree CLI | Native, no dependencies, proven in batch.md |
| Parallel spawn | Task(run_in_background=true) | Existing Claude Code capability |
| Agent isolation | isolation="worktree" | Existing Claude Code capability |
| Team coordination | Orchestrator-mediated | Only supported pattern (no peer-to-peer) |
| Review gates | Verifier agent + anti-rationalization | Existing verification-gates skill |
| File locking | .planning/.state.lock | Simple, single-machine, no dependencies |

## Don't Hand-Roll

- Git worktree lifecycle — use Claude Code's `isolation="worktree"` parameter
- Agent communication — use orchestrator-mediated pattern, don't attempt peer-to-peer
- Review automation — use existing verifier agent with enhanced prompts
- Parallel tracking — use existing batch.md status table pattern

---
*Research completed: 2026-03-10 via 8 parallel research agents*
