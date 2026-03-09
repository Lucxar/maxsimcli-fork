# No-Gos

**Generated:** 2026-03-09
**Source:** Init-existing initialization

## Must Not Break

- Existing npm publish pipeline (semantic-release on push to main)
- `npx maxsimcli@latest` install flow (entry point for all users)

## Anti-Patterns

- **No sync/async duplication** — write async only, no new sync variants (caused BUG-1)
- **No parser copies** — all markdown parsers must live in core, shared via imports
- **Never import output()/error() in MCP or backend** — they throw and kill the process
- **No silent failures** — all errors must produce non-zero exit code + stderr output
- **No dual-path implementations** — one path, done right. No fallbacks (causes divergence)
- **No global install** — local only (.claude/ per project)

## Scope Boundaries

- No migration tooling from v4.x .planning/ schema (clean break)
- No multi-runtime support (Claude Code only)
- No dashboard web UI (GitHub Project Board replaces it)
- No offline/no-GitHub fallback (`gh` CLI is hard requirement)

---
*No-gos captured during /maxsim:init-existing initialization*
