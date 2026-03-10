---
name: brainstorming
description: >-
  Multi-approach exploration before design decisions. Generates 3+ approaches
  with tradeoff analysis before selecting. Use when facing architectural
  choices, library selection, design decisions, or any problem with multiple
  viable solutions.
---

# Brainstorming

The first idea is rarely the best idea. Explore the space before committing to a direction.

## Process

### 1. Frame the Problem

Define the problem clearly before proposing solutions:

- What is the goal? What does success look like?
- What are the constraints (performance, compatibility, timeline)?
- What has been tried or considered already?
- What are the non-negotiables vs. nice-to-haves?

Ask the user ONE question at a time. Each answer informs the next question.

### 2. Research Context

Before proposing solutions, gather evidence:

- Read relevant code and check for prior decisions
- Identify patterns already in use in the codebase
- Check STATE.md for existing architectural decisions

### 3. Present 3+ Approaches

For each approach, provide:

| Aspect | Content |
|--------|---------|
| **Summary** | One sentence |
| **How it works** | 3-5 implementation bullets |
| **Pros** | Concrete advantages ("200 fewer lines" beats "simpler") |
| **Cons** | Honest drawbacks -- do not hide weaknesses |
| **Effort** | Low / Medium / High |
| **Risk** | What could go wrong and how recoverable |

If one approach is clearly superior, say so -- but still present alternatives so the user can validate your reasoning.

### 4. Discuss and Refine

- Ask which approach the user prefers or whether they want a hybrid
- Answer follow-up questions honestly
- If no approach fits, propose new ones informed by the discussion
- Continue one question at a time -- do not assume consensus

### 5. Get Explicit Approval

The user must explicitly approve one approach (e.g., "Go with A", "Approved"). Vague responses like "Sounds good" or "Interesting" are not approval. If ambiguous, ask: "To confirm -- should I proceed with [specific approach]?"

### 6. Document the Decision

Record: chosen approach, rejected alternatives with reasons, key implementation decisions, and risks.

## Output Format

```markdown
## Problem Statement
[What needs to be decided]

## Approaches

| # | Approach | Effort | Risk |
|---|----------|--------|------|
| A | [summary] | Low/Med/High | Low/Med/High |
| B | [summary] | Low/Med/High | Low/Med/High |
| C | [summary] | Low/Med/High | Low/Med/High |

### Approach A: [name]
[How it works, pros, cons]

### Approach B: [name]
[How it works, pros, cons]

### Approach C: [name]
[How it works, pros, cons]

## Selected: [letter]
**Rationale:** [why this approach was chosen]
**Rejected:** [why alternatives were not chosen]
```

## Common Pitfalls

| Excuse | Reality |
|--------|---------|
| "I already know the best approach" | You know your preferred approach. Alternatives may be better. |
| "There's only one way to do this" | There is almost never only one way. |
| "Brainstorming slows us down" | Building the wrong thing is slower. 30 minutes of design saves days of rework. |

Stop immediately if you catch yourself writing code before presenting approaches, presenting only one option, asking multiple questions at once, or assuming approval without explicit confirmation.
