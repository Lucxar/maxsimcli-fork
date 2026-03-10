---
name: research-methodology
description: >-
  Research process with tool priorities, confidence levels, and source evaluation.
  Defines how to investigate technical domains, evaluate sources, and structure
  findings with confidence tags. Use when researching libraries, APIs, architecture
  patterns, or any domain requiring external knowledge gathering.
user-invocable: false
---

# Research Methodology

Systematic process for investigating technical domains and producing structured findings with confidence levels.

## Research Process

### 1. Define Questions

Before researching, write explicit questions:

- What specific information do I need?
- What decisions will this research inform?
- What would change my approach if I learned X vs Y?

Avoid open-ended exploration. Each question should have a clear "answered" state.

### 2. Identify Sources

Use this priority order for source selection:

| Priority | Source Type | Tool | Best For |
|----------|-----------|------|----------|
| 1 | Official documentation | WebFetch | API specs, config options, platform features |
| 2 | Codebase (existing code) | Grep, Glob, Read | Current patterns, conventions, dependencies |
| 3 | CLI tool help | Bash (`--help`, `--version`) | Tool capabilities, available flags |
| 4 | Package registries | WebFetch (npm, PyPI) | Version info, dependency trees |
| 5 | Reputable technical blogs | WebFetch | Architecture patterns, best practices |
| 6 | Community forums | WebFetch | Edge cases, workarounds, known issues |

### 3. Evaluate Sources

Not all sources are equal. Tag each finding with a confidence level:

| Level | Criteria | Examples |
|-------|----------|---------|
| **HIGH** | Official docs, verified by tool output, multiple primary sources agree | Platform docs, API reference, confirmed by running code |
| **MEDIUM** | Reputable blogs, community consensus, single primary source | Well-known tech blogs, Stack Overflow accepted answers, conference talks |
| **LOW** | Single non-official source, outdated (>1 year), unverified claims | Personal blogs, forum posts, AI-generated content without verification |

**Source evaluation checklist:**
- Is this a primary source (official docs) or secondary (blog post)?
- When was it published or last updated?
- Does it match what I see in the actual codebase/tool?
- Do multiple independent sources agree?

### 4. Cross-Reference Claims

For any finding that influences architecture or design:

- Find at least 2 independent sources
- Verify against actual tool behavior (run a command, read a config)
- Note when sources disagree and which you trust more
- Mark single-source findings as LOW confidence

### 5. Structure Output

Research findings follow this format:

```markdown
## Finding: [Title]

**Confidence:** HIGH | MEDIUM | LOW
**Sources:** [list of sources with links]

[Finding description -- what was learned]

**Implications:** [How this affects our decisions]
**Open questions:** [What remains unclear]
```

## Research Output Template

```markdown
# [Domain] Research

**Researched:** [date]
**Confidence:** [overall confidence level]

## Key Findings
- [Finding 1] (HIGH confidence)
- [Finding 2] (MEDIUM confidence)

## Standard Stack
| Component | Choice | Why |
|-----------|--------|-----|
| [area] | [choice] | [reason] |

## Don't Hand-Roll
| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| [problem] | [custom solution] | [existing solution] |

## Common Pitfalls
### Pitfall 1: [name]
**What goes wrong:** [description]
**How to avoid:** [recommendation]

## Open Questions
- [Unanswered questions for future investigation]

## Sources
### Primary (HIGH confidence)
- [source with link]
### Secondary (MEDIUM confidence)
- [source with link]
```

## Common Research Mistakes

| Mistake | Why It's Wrong | Do Instead |
|---------|---------------|------------|
| Using only AI knowledge | May be outdated or hallucinated | Fetch actual docs with WebFetch |
| Trusting a single blog post | Could be wrong, outdated, or opinionated | Cross-reference with official docs |
| Skipping version checks | APIs change between versions | Verify against the actual version in use |
| Assuming current codebase is correct | Code may have bugs or outdated patterns | Verify patterns against official docs |
| Not recording sources | Cannot verify or update findings later | Always include links and dates |
| Research without questions | Leads to unfocused exploration | Define questions first, research to answer them |

## Time Boxing

Research is a means to an end, not the end itself:

- **Quick lookup** (5 min): Single question, check official docs, done
- **Standard research** (30 min): Multiple questions, cross-reference, structured output
- **Deep investigation** (60 min): Architecture decision, multiple domains, full template

If you cannot answer a question within the time box, document it as an open question and move on.
