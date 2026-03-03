# Key Decisions

**Generated:** 2026-03-03
**Source:** Init-existing initialization for v5.0 milestone

| # | Decision | Rationale | Alternatives Considered | Status |
|---|----------|-----------|------------------------|--------|
| 1 | Claude Code only — drop all multi-runtime support | Simplifies codebase, enables deeper integration, one runtime to optimize for | Keep multi-runtime (broader reach but thinner integration), Claude Code first with others later | Locked |
| 2 | SDD as core methodology | Two-stage review (spec + quality) catches more errors than end-of-phase review; Superpowers research validated this approach | Phase-only review (current), manual code review, no formal review | Locked |
| 3 | Rename conflicting skills (simplify -> maxsim-simplify, batch -> maxsim-batch) | Claude Code has built-in simplify/batch commands; naming collision confuses users and causes activation conflicts | Keep current names (causes collisions), use prefixed slash commands only (inconsistent) | Locked |
| 4 | MVP stage assessment | Tests + CI + npm publishing exist but agent coherence and spec management need significant work before production | Production (premature — agent system not coherent enough), Prototype (undersells current capability) | Locked |
| 5 | YOLO mode with standard depth | Project owner knows the codebase well; interactive confirmations slow down iteration | Interactive mode (safer but slower), Quick depth (too shallow for v5.0 scope), Comprehensive (overkill) | Locked |
| 6 | Balanced model profile | Good quality/cost ratio for iterative development; Opus reserved for critical phases | Quality (higher cost), Budget (lower quality), Tokenburner (excessive for most tasks) | Locked |
| 7 | Spec drift management as dedicated command | Users need an explicit mechanism to detect and correct divergence between plan and reality; this is a core SDD requirement | Manual comparison (error-prone), automatic drift detection on every command (too heavy), no drift management (status quo) | Locked |

---
*Decisions captured during /maxsim:init-existing initialization*
