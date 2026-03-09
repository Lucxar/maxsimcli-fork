# Phase 1: GitHub Issues Integration for MCP Task Management — No-Gos

- Do NOT make GitHub auth truly mandatory -- must be skippable with graceful degradation
- Do NOT use a separate Blocked column on the project board -- use GitHub's native "blocked by" linking
- Do NOT create issues lazily (just-in-time) -- all issues created eagerly on plan finalization
- Do NOT simplify the MAXSIM command surface in this phase -- command removal is a deferred future phase
