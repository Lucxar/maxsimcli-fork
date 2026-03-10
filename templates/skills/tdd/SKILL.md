---
name: tdd
description: >-
  Test-driven development with red-green-refactor cycle and atomic commits.
  Write failing test first, then minimal passing code, then refactor. Use when
  implementing business logic, API endpoints, data transformations, validation
  rules, or algorithms.
---

# Test-Driven Development (TDD)

Write the test first. Watch it fail. Write minimal code to pass. Clean up.

## When to Use TDD

**Good fit:** Business logic with defined I/O, API endpoints with contracts, data transformations, validation rules, algorithms, state machines.

**Poor fit:** UI layout, configuration files, build scripts, one-off scripts, mechanical renames.

## The Red-Green-Refactor Cycle

### 1. RED -- Write One Failing Test

- Write ONE minimal test describing the desired behavior
- Test name describes what SHOULD happen, not implementation details
- Use real code paths -- mocks only when unavoidable (external APIs, databases)

### 2. VERIFY RED -- Run the Test

- Test MUST fail with an assertion (not error out from syntax or imports)
- Failure message must match the missing behavior
- If the test passes immediately, you are testing existing behavior -- rewrite it

### 3. GREEN -- Write Minimal Code

- Write the SIMPLEST code that makes the test pass
- Do NOT add features the test does not require
- Do NOT refactor yet

### 4. VERIFY GREEN -- Run All Tests

- The new test MUST pass
- ALL existing tests MUST still pass
- If any test fails, fix code -- not tests

### 5. REFACTOR -- Clean Up (Tests Still Green)

- Remove duplication, improve names, extract helpers
- Run tests after every change
- Do NOT add new behavior during refactor

### 6. REPEAT -- Next failing test for next behavior

## Commit Pattern

Each TDD cycle produces 2-3 atomic commits:

- **RED commit:** `test({scope}): add failing test for [feature]`
- **GREEN commit:** `feat({scope}): implement [feature]`
- **REFACTOR commit (if changes made):** `refactor({scope}): clean up [feature]`

## Context Budget

TDD uses approximately 40% more context than direct implementation due to the RED-GREEN-REFACTOR overhead. Plan accordingly for long task lists.

## Common Pitfalls

| Excuse | Why It Fails |
|--------|-------------|
| "Too simple to test" | Simple code breaks. The test takes 30 seconds. |
| "I'll add tests after" | Tests written after pass immediately -- they prove nothing. |
| "I know the code works" | Knowledge is not evidence. A passing test is evidence. |
| "TDD is slower" | TDD is faster than debugging. Every skip creates debt. |

Stop immediately if you catch yourself writing implementation code before writing a test, writing a test that passes on the first run, skipping the VERIFY RED step, or adding features beyond what the current test requires.

See also: `/verification-before-completion` for evidence-based completion claims after TDD cycles.
