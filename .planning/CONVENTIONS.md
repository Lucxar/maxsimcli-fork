# Coding Conventions

**Source:** init-existing scan + user confirmation
**Status:** confirmed

## Tech Stack (Locked)

| Technology | Version | Decision |
|------------|---------|----------|
| TypeScript | 5.9 | Keep |
| tsdown | 0.20 | Keep |
| React 19 + Tailwind v4 | latest | Keep (website only) |
| Vitest | 4.0 | Keep |
| Express | 4.22 | Keep |
| MCP SDK | 1.27 | Keep |
| Biome | 2.4 | Keep (linting only) |

## Naming

### Files
- Core modules: `kebab-case.ts`
- Type files: `types.ts` per directory
- Barrel files: `index.ts` per directory
- Hook files: `maxsim-` prefix
- MCP tools: `-tools.ts` suffix
- Tests: `<name>.test.ts`
- React components: `PascalCase.tsx`

### Functions
- Command handlers: `cmd<Domain><Action>()` — e.g. `cmdStateLoad()`
- Internal helpers: `<domain><Action>Internal()` — async only (no sync variants)
- Path builders: `<thing>Path()` — e.g. `planningPath()`
- MCP responses: `mcpSuccess()`, `mcpError()`
- React hooks: `use<Name>()`

### Variables
- Local: `camelCase`
- Module constants: `UPPER_SNAKE_CASE`
- Private caches: `_<name>` prefix
- Types/Interfaces: `PascalCase`
- Branded types: `PascalCase` with factory functions

## Error Handling

- **CLI:** `CmdResult` discriminated unions via `cmdOk()`/`cmdErr()`
- **MCP:** `mcpSuccess()`/`mcpError()` — NEVER import `output()`/`error()`
- **Backend:** Same as MCP — never call `process.exit()`
- **All layers:** Non-zero exit code + stderr for all errors

## Code Style

### Principles (SOLID, KISS, DRY, YAGNI)
- **Async only** — no new synchronous filesystem operations
- **Single source** — parsers, utilities, types shared from `core/`
- **No duplication** — one implementation path, no fallbacks
- **Branded types** for compile-time safety (PhaseNumber, PhasePath, PhaseSlug)
- **Markdown-as-data-store** with regex parsing for `.planning/` files

## Testing

- Unit tests in `packages/cli/tests/`
- E2E tests in `packages/cli/tests/e2e/`
- Core parser logic should have targeted unit tests (improvement area)
- Vitest as test runner

---
*Conventions confirmed: 2026-03-09*
