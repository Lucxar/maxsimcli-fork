---
name: evidence-collection
description: >-
  Systematic evidence gathering using tool output before making claims. Covers
  what counts as evidence, the collection process, and common pitfalls that lead
  to false claims. Use when verifying work completion, checking test results,
  validating build success, or before any completion gate.
user-invocable: false
---

# Evidence Collection

Gather fresh evidence using tool output before making any claim. Evidence must come from THIS turn -- not prior turns, not cached knowledge, not reasoning.

## Collection Process

For each claim you need to support:

1. **IDENTIFY** -- What command proves this claim?
   - Pick the most direct verification (e.g., `npm test` for "tests pass", not "I wrote the test")
   - If no single command exists, identify all required checks

2. **RUN** -- Execute the command fresh in THIS turn
   - Do not reuse output from a previous turn
   - Do not rely on output from a different command
   - Run the full command, not a partial check

3. **READ** -- Read the complete output
   - Check the exit code (0 = success, non-zero = failure)
   - Read all output, not just the summary line
   - Look for warnings or partial failures hidden in verbose output

4. **CHECK** -- Does the output actually confirm the claim?
   - Match output against specific expected values
   - A passing build does not mean passing tests
   - A created file does not mean correct file contents

5. **CITE** -- Include the evidence in your response
   - Use the evidence block format
   - Quote specific output lines, not paraphrased summaries

## What Counts as Evidence

| Claim | Requires | Not Sufficient |
|-------|----------|----------------|
| "Tests pass" | Test command output showing 0 failures | Previous run, "should pass", partial run |
| "Build succeeds" | Build command with exit code 0 | Linter passing, "logs look clean" |
| "Bug is fixed" | Original failing test now passes | "Code changed, assumed fixed" |
| "Task complete" | All done criteria checked with evidence | "I implemented everything in the plan" |
| "No regressions" | Full test suite passing | "I only changed one file" |
| "File created" | Read tool or `test -f` output | "I ran the Write tool" (verify it wrote) |
| "Content correct" | Read tool showing expected content | "I wrote the correct content" |
| "API responds" | curl/fetch output with status code | "Server is running" without calling it |

## Evidence Block Format

```
CLAIM: [what you are claiming]
EVIDENCE: [exact command run in THIS turn]
OUTPUT: [relevant excerpt of actual output]
VERDICT: PASS | FAIL
```

## Common Pitfalls

| Excuse | Why It Fails |
|--------|-------------|
| "Should work now" | "Should" is not evidence. Run the command. |
| "I'm confident in the logic" | Confidence is not evidence. Run it. |
| "The linter passed" | Linter passing does not mean tests pass or build succeeds. |
| "I only changed one line" | One line can break everything. Verify. |
| "The subagent reported success" | Trust test output and VCS diffs, not agent reports. |
| "I already checked this" | In a previous turn. Evidence expires each turn. Run it again. |
| "The error was in a different file" | Side effects cross files. Run the full suite. |
| "It compiled, so it works" | Compilation checks types, not logic. Run tests. |

## Key Rules

- **THIS-turn only**: Evidence from prior turns is stale. Always re-run.
- **Tool output only**: Your reasoning, analysis, and confidence are not evidence.
- **Full output**: Read the complete output, not just the first or last line.
- **Specific citations**: Quote the output. "It passed" is not a citation.
- **One block per claim**: Each distinct claim needs its own evidence or an explicit grouping note.

## See Also

The `verification-gates` skill defines the gate framework where evidence collection is applied. The always-loaded `verification-protocol` rule provides the enforcement language.
