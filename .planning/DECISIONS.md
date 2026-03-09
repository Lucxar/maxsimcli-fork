# Key Decisions

**Generated:** 2026-03-09
**Source:** Init-existing initialization

| # | Decision | Rationale | Alternatives Considered | Status |
|---|----------|-----------|------------------------|--------|
| 1 | GitHub Issues as source of truth | Single system, no drift. AI reads/writes issues via `gh` | .planning/ as source with GitHub sync (rejected: two systems = two error sources) | Locked |
| 2 | `gh` CLI hard requirement | Dual paths cause bugs (TD-1). One path, done right | Fallback to local-only (rejected: violates DRY principle) | Locked |
| 3 | Local-only install | Projects need GitHub repo context. Global doesn't make sense | Keep global+local (rejected: adds complexity) | Locked |
| 4 | Remove dashboard | GitHub Project Board replaces it. Eliminates 52K-line server | Keep dashboard (rejected: redundant with GitHub) | Locked |
| 5 | ~9 commands from ~35 | Less confusion, better docs, easier maintenance | Keep all commands (rejected: too many, poorly scoped) | Locked |
| 6 | State-machine commands | Idempotent, picks up from GitHub state. No sequence memorization | Separate commands per step (rejected: user must remember order) | Locked |
| 7 | Skills for progressive disclosure | Load on-demand, prevent context pollution | Workflows with @references (rejected: too nested) | Locked |
| 8 | Clean break, no migration | Prototype stage. Migration tooling = complexity for minimal users | Migration tool (rejected: YAGNI) | Locked |
| 9 | Quality model profile | Opus for research/roadmap during architectural overhaul | Balanced (rejected: want deeper analysis for v5.0) | Locked |
| 10 | Prototype stage | Early alpha, breaking changes OK. Rapid iteration | Production (rejected: not stable enough yet) | Locked |

---
*Decisions captured during /maxsim:init-existing initialization*
