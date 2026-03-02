---
name: tdd
description: >-
  Enforces test-driven development with the Red-Green-Refactor cycle: write a
  failing test first, implement minimal code to pass, then refactor. Use when
  implementing features, fixing bugs, or adding new behavior.
---

# Test-Driven Development (TDD)

Write the test first. Watch it fail. Write minimal code to pass. Clean up.

**HARD GATE: No implementation code without a failing test first. If you wrote production code before the test, delete it and start over. No exceptions.**

## Process

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

## Common Pitfalls

| Excuse | Why it fails |
|--------|-------------|
| "Too simple to test" | Simple code breaks. The test takes 30 seconds. |
| "I'll add tests after" | Tests written after pass immediately -- they prove nothing. |
| "I know the code works" | Knowledge is not evidence. A passing test is evidence. |
| "TDD is slower" | TDD is faster than debugging. Every skip creates debt. |
| "Let me keep the code as reference" | You will adapt it instead of writing test-first. Delete means delete. |

Stop immediately if you catch yourself:

- Writing implementation code before writing a test
- Writing a test that passes on the first run
- Skipping the VERIFY RED step
- Adding features beyond what the current test requires
- Keeping pre-TDD code "as reference"

## Verification

Before claiming TDD compliance, confirm:

- [ ] Every new function/method has a corresponding test
- [ ] Each test was written BEFORE its implementation
- [ ] Each test was observed to FAIL before implementation was written
- [ ] Each test failed for the expected reason (missing behavior, not syntax error)
- [ ] Minimal code was written to pass each test
- [ ] All tests pass after implementation
- [ ] Refactoring (if any) did not break any tests

## MAXSIM Integration

In MAXSIM plan execution, tasks marked `tdd="true"` follow this cycle with per-step commits:

- **RED commit:** `test({phase}-{plan}): add failing test for [feature]`
- **GREEN commit:** `feat({phase}-{plan}): implement [feature]`
- **REFACTOR commit (if changes made):** `refactor({phase}-{plan}): clean up [feature]`
