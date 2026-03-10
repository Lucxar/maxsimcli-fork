---
name: maxsim-simplify
description: >-
  Maintainability optimization covering duplication, dead code, complexity, and
  naming. Produces structured findings with before/after metrics. Use when
  reviewing code for simplification, during refactoring passes, or when
  codebase complexity is increasing.
---

# Simplify

Every line of code is a liability. Remove what does not earn its place.

## Scope

Only simplify touched files unless explicitly asked for broader refactoring. The goal is incremental maintainability improvement, not a codebase-wide rewrite.

## Dimensions

### 1. DUPLICATION -- Eliminate Repeated Logic

- Are there patterns repeated across files that should be a shared helper?
- Does new code duplicate existing utilities or library functions?
- Could two similar implementations be merged behind a single interface?

**Rule of three:** If the same pattern appears three times, extract it.

### 2. DEAD CODE -- Remove What Is Not Called

- Delete unused imports, variables, functions, and parameters
- Remove commented-out code blocks (version control is the archive)
- Strip unreachable branches and impossible conditions
- Drop feature flags for features that no longer exist

### 3. COMPLEXITY -- Question Every Abstraction

- Does every wrapper, adapter, or indirection layer justify its existence?
- Are there generics or parametrization that serve only one concrete case?
- Could a 20-line class be replaced by a 3-line function?
- Is there defensive programming that guards against conditions that cannot occur?

**If removing it does not break anything, it should not be there.**

### 4. NAMING -- Tighten Clarity

- Are names self-documenting? Rename anything that needs a comment to explain.
- Could nested logic be flattened with early returns?
- Is control flow straightforward, or does it require tracing to understand?

## Process

1. **DIFF** -- Collect the set of modified and added files. Read each file in full, not just changed hunks.
2. **SCAN** -- Check each dimension (duplication, dead code, complexity, naming) against each file.
3. **RECORD** -- Document findings with file path, line range, dimension, and suggested fix.
4. **FIX** -- Apply fixes for all actionable items. Blocker and High priority first.
5. **VERIFY** -- Re-run tests to confirm nothing broke. Simplify, do not alter behavior.

## Output Format

```
DIMENSION: [Duplication | Dead Code | Complexity | Naming]
FILE: [path]
FINDING: [description]
SEVERITY: [Blocker | High | Medium]
FIX: [what was done or recommended]
```

## Common Rationalizations -- Reject These

| Excuse | Why It Fails |
|--------|-------------|
| "It might be needed later" | Delete it. Re-adding is cheaper than maintaining unused code. |
| "The abstraction makes it extensible" | Extensibility serving no current requirement is dead weight. |
| "Refactoring is risky" | Small, tested simplifications reduce risk. Accumulated complexity increases it. |
| "I'll clean it up later" | Later never comes. Simplify now while context is fresh. |

Stop if you catch yourself skipping the simplification pass because the diff is small, keeping dead code "just in case", or adding complexity during a simplification pass.

## Verification

Before reporting completion:

- [ ] All changed files reviewed in full (not just diffs)
- [ ] No duplicated logic remains that appears three or more times
- [ ] No dead code: unused imports, commented blocks, unreachable branches
- [ ] No unnecessary abstractions, wrappers, or indirection layers
- [ ] All tests pass after simplification
- [ ] No behavioral changes introduced (simplify only, do not alter)

See also: `/code-review` for correctness review (security, interfaces, error handling, test coverage).
