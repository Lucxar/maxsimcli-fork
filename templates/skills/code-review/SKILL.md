---
name: code-review
description: >-
  Code quality review covering security, interfaces, error handling, test
  coverage, and conventions. Produces structured findings with severity and
  evidence. Use when reviewing pull requests, completed implementations, or
  code changes.
---

# Code Review

Shipping unreviewed code is shipping unknown risk. Review before sign-off.

## Review Dimensions

Follow these dimensions in order for every review.

### 1. SCOPE -- Identify All Changes

- Diff against the starting point to see every changed file
- List all new, modified, and deleted files
- Do not skip generated files, config changes, or minor edits

### 2. SECURITY -- Check for Vulnerabilities

| Category | What to Look For |
|----------|-----------------|
| Injection | Unsanitized user input in SQL, shell commands, HTML output, template strings |
| Authentication | Missing auth checks, hardcoded credentials, tokens in source |
| Authorization | Missing permission checks, privilege escalation paths |
| Data exposure | Secrets in logs, overly broad API responses, sensitive data in error messages |
| Dependencies | New dependencies with known vulnerabilities, unnecessary dependencies |

Any security issue is a blocking finding. No exceptions.

### 3. INTERFACES -- Verify API Contracts

- Do public function signatures match their documentation?
- Are return types accurate and complete?
- Do error types cover all failure modes?
- Are breaking changes documented and intentional?

### 4. ERROR HANDLING -- Check Failure Paths

- Are all external calls wrapped in error handling?
- Do error messages provide enough context to diagnose the issue?
- Are errors propagated correctly (not swallowed silently)?
- Are edge cases handled (empty input, null values, boundary conditions)?

### 5. TESTS -- Evaluate Coverage

- Does every new public function have corresponding tests?
- Do tests cover both success and failure paths?
- Are edge cases tested?
- Do tests verify behavior, not implementation details?

### 6. CONVENTIONS -- Assess Compliance

- Is naming consistent with existing codebase conventions?
- Is the complexity justified by the requirements?
- Are comments present where logic is non-obvious?

## Review Output Format

```
REVIEW SCOPE: [number] files changed, [number] additions, [number] deletions
SECURITY: PASS | ISSUES FOUND (list)
INTERFACES: PASS | ISSUES FOUND (list)
ERROR HANDLING: PASS | ISSUES FOUND (list)
TEST COVERAGE: PASS | GAPS FOUND (list)
CONVENTIONS: PASS | ISSUES FOUND (list)
VERDICT: APPROVED | BLOCKED (list blocking issues)
```

### Severity Reference

| Severity | Examples |
|----------|---------|
| Blocker | SQL injection, XSS, hardcoded secrets, broken public API, data loss risk |
| High | Performance regression, missing critical tests, no error path tests |
| Medium | Naming inconsistency, dead code, convention mismatch |

Blocker and High severity issues block approval. Medium issues should be filed for follow-up.

## Spec Review vs Code Review

| Dimension | Spec Review | Code Review |
|-----------|------------|-------------|
| Question | Does it match the requirements? | Is the code correct and quality? |
| Checks | Acceptance criteria, requirement coverage, scope | Security, interfaces, errors, tests, conventions |
| Output | PASS/FAIL per requirement | APPROVED/BLOCKED per dimension |

Both reviews are needed -- spec review alone does not catch security issues, and code review alone does not catch missing requirements.

## Common Pitfalls

| Issue | Reality |
|-------|---------|
| "Tests pass, so the code is fine" | Tests verify behavior, not code quality. Review is separate. |
| "I wrote it, so I know it's correct" | Author bias is real. Review as if someone else wrote it. |
| "It's just a small change" | Small changes cause large outages. |
| "Generated code doesn't need review" | Generated code has the same bugs. Review it. |

See also: `/maxsim-simplify` for maintainability optimization (duplication, dead code, complexity).
