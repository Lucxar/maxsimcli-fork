# MAXSIM Code Conventions

**Date:** 2026-03-03

This document describes code style, naming patterns, error handling, and module organization conventions used in the MAXSIM codebase.

## Language & Formatting

### TypeScript

- **Language:** TypeScript exclusively (no JavaScript in `src/`)
- **Target:** Node.js 22+
- **Linter:** Biome (linting enabled, formatting disabled)
- **Biome Config:** `biome.json` — linting rules enabled with `recommended: false`, single quotes enforced
- **Build:** tsdown bundles TS into CommonJS (`dist/cli.cjs`, `dist/install.cjs`)

### Quote Style

Use **single quotes** for all string literals per Biome config.

```typescript
// Good
const message = 'Hello, world!';
const json = '{ "key": "value" }';

// Bad
const message = "Hello, world!";
```

## Naming Patterns

### Files

- **Lowercase with hyphens:** `state.ts`, `phase.ts`, `roadmap.ts`
- **Utilities with underscores where needed:** `dashboard-launcher.ts`, `context-loader.ts`, `mcp-server.ts`
- **Test files:** `{feature}.test.ts` (unit) or `{feature}.test.ts` (e2e)
- **Barrel file:** `index.ts` exports the public API

### Functions & Variables

- **camelCase:** `cmdStateLoad`, `parseTodoFrontmatter`, `expandTilde`, `phaseAddCore`
- **Constants:** `UPPERCASE` (e.g., `MODEL_PROFILES`)
- **Command functions:** Always prefix with `cmd` — `cmdStateLoad`, `cmdPhaseAdd`, `cmdRoadmapAnalyze`
- **Internal helpers:** Suffix with `Internal` — `generateSlugInternal`, `findPhaseInternal`, `resolveModelInternal`
- **Predicate functions:** Prefix with `is` or end with `Exists` — `isPlanFile`, `isSummaryFile`, `pathExistsAsync`
- **Async versions:** Suffix with `Async` — `listSubDirsAsync`, `safeReadFileAsync`, `findPhaseInternalAsync`

### Interfaces & Types

- **PascalCase:** `TemplateSelectResult`, `PhaseAddResult`, `AppConfig`, `CmdResult`
- **Branded types:** Separate file or inline — `PhaseNumber`, `PhasePath`, `PhaseSlug` (see `types.ts`)
- **Result/option objects:** Explicit interfaces — `TemplateFillOptions`, `StateMetricOptions`, `PhaseCreateOptions`

### Boolean Flags

Always use `--flag-name` in CLI args (hyphenated), converted to camelCase in code:

```typescript
// CLI: --raw, --offset, --limit
// Code: raw, offset, limit
function getFlag(args: string[], flag: string): string | null {
  const idx = args.indexOf(`--${flag}`);
  return idx !== -1 ? args[idx + 1] ?? null : null;
}
```

## Imports & Export Organization

### Import Order

1. Node.js built-ins (`node:fs`, `node:path`, `node:os`)
2. Third-party packages (`chalk`, `slugify`, `simple-git`)
3. Type-only imports from relative modules
4. Function/constant imports from relative modules
5. Barrel imports from `index.ts`

```typescript
import { promises as fsp } from 'node:fs';
import path from 'node:path';

import chalk from 'chalk';
import slugify from 'slugify';

import type { CmdResult, AppConfig } from './types.js';
import { cmdOk, cmdErr } from './types.js';
import { normalizePhaseName, findPhaseInternal } from './core.js';
```

### Path Aliases

- None explicitly configured. Relative imports only.
- Dashboard uses `@maxsim/core` → resolved via tsconfig path alias to `../cli/src/core/`

### Barrel Files

- `src/core/index.ts` exports all public functions and types
- `src/adapters/index.ts` exports adapter registry
- `src/mcp/index.ts` exports MCP tool definitions

Never export everything with `export *` — always explicit re-exports:

```typescript
// Good
export { cmdStateLoad, cmdStateGet } from './state.js';
export type { AppConfig } from './types.js';

// Avoid
export * from './state.js';
```

## Error Handling

### Throwing vs. Returning

Use **exception signals** instead of try-catch for CLI control flow:

- **`CliOutput`** (success): Thrown by `output()` to signal completion
- **`CliError`** (failure): Thrown by `error()` to signal CLI error
- **Catch and re-throw:** Always call `rethrowCliSignals(e)` in error handlers

```typescript
// In src/core/state.ts
export async function cmdStateLoad(cwd: string, raw: boolean): Promise<CmdResult> {
  try {
    const content = await fsp.readFile(statePathUtil(cwd), 'utf-8');
    return cmdOk({ state_exists: true, content }, content);
  } catch (thrown) {
    rethrowCliSignals(thrown);
    return cmdErr('STATE.md not found');
  }
}
```

### Function Return Types

Core functions return `CmdResult` union (not throwing):

```typescript
export type CmdResult =
  | { ok: true; result: unknown; rawValue?: unknown }
  | { ok: false; error: string };

export function cmdOk(result: unknown, rawValue?: unknown): CmdResult {
  return { ok: true, result, rawValue };
}

export function cmdErr(error: string): CmdResult {
  return { ok: false, error };
}
```

Utilities return `Result<T>` for validation:

```typescript
export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string };
```

### Error Messages

- Prefix internal errors with context: `Failed to read ROADMAP.md: {originalError}`
- Use descriptive messages for missing files: `ROADMAP.md not found`, `Phase 01 not found`
- Include file paths in backticks when relevant: `phase-path required`, `template file not found: ${filePath}`

## Logging

### Console Output

Use **only for errors**. Regular logging goes through the `CliOutput` mechanism.

```typescript
// Errors only — prefixed with context
console.error(`[maxsim:config-load-failed]`, error);
console.warn(`[maxsim] Warning: config.json exists but could not be parsed — using defaults.`);

// Debug output
export function debugLog(contextOrError: unknown, error?: unknown): void {
  if (error) {
    console.error(`[maxsim:${contextOrError}]`, error);
  } else {
    console.error(contextOrError);
  }
}
```

### Debug Logging

Call `debugLog()` for non-critical failures or edge cases — logged to stderr, doesn't affect CLI return:

```typescript
try {
  const dirs = await listSubDirsAsync(phasesDir);
} catch (e) {
  debugLog('list-subdirs-failed', e);
  // Continue with empty list or fallback
}
```

## Comments & Documentation

### File Headers

Every module starts with a JSDoc comment describing its purpose:

```typescript
/**
 * State — STATE.md operations and progression engine
 *
 * Ported from maxsim/bin/lib/state.cjs
 */
```

### Section Headers

Use Unicode box separators to organize logical sections (improves readability):

```typescript
// ─── Internal helpers ────────────────────────────────────────────────────────

function parseTableRow(row: string): string[] {
  // ...
}

// ─── State commands ──────────────────────────────────────────────────────────

export async function cmdStateLoad(cwd: string, raw: boolean): Promise<CmdResult> {
  // ...
}
```

Copy-paste friendly: `─── (U+2500 × 3, spaces, text, spaces, U+2500 to line end)`

### Inline Comments

- Comment **why**, not what: `// Escaped pipes with placeholder to preserve cell content` (good), not `// Split by pipe` (bad)
- Keep functions small enough that their logic is obvious
- Always comment regex patterns that are non-obvious:

```typescript
// Match **fieldName:** with optional extra whitespace around name and colon
const boldPattern = new RegExp(`\\*\\*\\s*${escaped}\\s*:\\s*\\*\\*\\s*(.+)`, 'i');
```

### JSDoc

Use JSDoc for public exports and complex signatures:

```typescript
/**
 * Append an entry to a section in STATE.md content, removing placeholder text.
 * Returns updated content or null if section not found.
 */
export function appendToStateSection(
  content: string,
  sectionPattern: RegExp,
  entry: string,
  placeholderPatterns?: RegExp[],
): string | null {
  // ...
}
```

**Not required for:** simple utility functions, getters/setters, internal helpers

## Function Design

### Parameters

- **Keep function signatures simple:** Max 3-4 parameters
- **Use option objects for optional parameters:**

```typescript
// Good
export async function phaseAddCore(
  cwd: string,
  description: string,
  options?: PhaseCreateOptions,
): Promise<PhaseAddResult>

// Less clean
export async function phaseAddCore(
  cwd: string,
  description: string,
  includeStubs?: boolean,
): Promise<PhaseAddResult>
```

### Return Types

- **Async functions return promises:** `Promise<CmdResult>`, `Promise<void>`
- **CLI functions return CmdResult union:** Never throw from `cmd*` functions
- **Always include rawValue for --raw flag compatibility:**

```typescript
export function cmdTemplateSelect(cwd: string, planPath: string | null): CmdResult {
  // ...
  return cmdOk(result, template); // result for JSON, template for --raw
}
```

### Function Size

- **Aim for <100 lines:** Break large functions into helpers
- **Extract parsing, validation, transformation:** Separate from I/O
- **Private helpers above public exports**

```typescript
// Private helper first
function parseTableRow(row: string): string[] { }

// Public export after
export function stateExtractField(content: string, fieldName: string): string | null { }
```

## Module Design

### Single Responsibility

Each module handles one concern:

- `state.ts` — STATE.md CRUD
- `phase.ts` — Phase lifecycle (add, insert, remove, complete)
- `roadmap.ts` — Roadmap parsing and analysis
- `verify.ts` — Verification and validation suite
- `template.ts` — Template selection and file generation
- `core.ts` — Shared utilities, constants, helpers

### Exports

- **Export only what's public:** No underscore prefix (not idiomatic in Node.js)
- **Group related exports:** Commands, then helpers, then types at bottom
- **Use barrel file for package API:** Never `import { ... } from '../src/core/state.js'` from outside `src/`

```typescript
// src/core/index.ts
export { cmdStateLoad, cmdStateGet, cmdStatePatch } from './state.js';
export { stateExtractField, stateReplaceField } from './state.js';
export type { StateSnapshot } from './types.js';
```

## Async Patterns

### Promise Handling

- **Prefer `async/await`** over `.then()` chains
- **Use `Promise.all()` for independent parallel operations:**

```typescript
// Good
await Promise.all([
  fsp.writeFile(path1, content1),
  fsp.writeFile(path2, content2),
]);

// Less clean
await fsp.writeFile(path1, content1);
await fsp.writeFile(path2, content2);
```

- **Always wrap file operations in try-catch:**

```typescript
try {
  content = await fsp.readFile(rmPath, 'utf-8');
} catch {
  throw new Error('ROADMAP.md not found');
}
```

### Null-safe Reads

Async file read utility returns `null` on failure:

```typescript
export async function safeReadFileAsync(filePath: string): Promise<string | null> {
  try {
    return await fsp.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

// Use it
const content = await safeReadFileAsync(rmPath);
if (!content) return cmdErr('ROADMAP.md not found');
```

## Specific Patterns

### Regex with Escaped Special Chars

Always escape user input in regex patterns:

```typescript
import escapeStringRegexp from 'escape-string-regexp';

export function stateExtractField(content: string, fieldName: string): string | null {
  const escaped = escapeStringRegexp(fieldName);
  const boldPattern = new RegExp(`\\*\\*\\s*${escaped}\\s*:\\s*\\*\\*\\s*(.+)`, 'i');
  // ...
}
```

### Date Handling

Use ISO format (YYYY-MM-DD) consistently:

```typescript
export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

// Use it
const today = todayISO(); // "2026-03-03"
```

### Path Normalization

Always normalize phase numbers and names:

```typescript
export function normalizePhaseName(name: string): string {
  // Pads "1" → "01", uppercases "1a" → "01A", handles decimals
  const match = name.match(/^(\d+)([a-zA-Z])?(\.\d+)?$/i);
  if (!match) return name;
  const num = match[1].padStart(2, '0');
  const letter = match[2]?.toUpperCase() ?? '';
  const decimal = match[3] ?? '';
  return num + letter + decimal;
}
```

### Large JSON Output

If JSON output exceeds 50KB, write to tmpfile and return marker:

```typescript
// In src/core/core.ts
export function writeOutput(out: CliOutput): void {
  const json = JSON.stringify(out.result, null, 2);
  if (json.length > 50000) {
    const tmpPath = path.join(os.tmpdir(), `maxsim-${Date.now()}.json`);
    fs.writeFileSync(tmpPath, json, 'utf-8');
    process.stdout.write('@file:' + tmpPath);
  } else {
    process.stdout.write(json);
  }
}
```

### Field Extraction from Markdown

Use flexible regex patterns that match both bold (`**field:**`) and plain (`field:`) forms:

```typescript
export function stateExtractField(content: string, fieldName: string): string | null {
  // Try bold form first
  const boldPattern = new RegExp(`\\*\\*\\s*${escaped}\\s*:\\s*\\*\\*\\s*(.+)`, 'i');
  const boldMatch = content.match(boldPattern);
  if (boldMatch) return boldMatch[1].trim();

  // Fallback to plain form
  const plainPattern = new RegExp(`^\\s*${escaped}\\s*:\\s*(.+)`, 'im');
  const plainMatch = content.match(plainPattern);
  return plainMatch ? plainMatch[1].trim() : null;
}
```

## Type Safety

### Branded Types

Use branded types for semantic safety of similar types:

```typescript
// From src/core/types.ts
declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type PhaseNumber = Brand<string, 'PhaseNumber'>;
export type PhasePath = Brand<string, 'PhasePath'>;
export type PhaseSlug = Brand<string, 'PhaseSlug'>;

export function phaseNumber(value: string): PhaseNumber {
  const match = value.match(/^\d+[A-Z]?(\.\d+)?$/i);
  if (!match) throw new Error(`Invalid phase number: ${value}`);
  return value as PhaseNumber;
}
```

### Union Types

Use discriminated unions for result types:

```typescript
export type CmdResult =
  | { ok: true; result: unknown; rawValue?: unknown }
  | { ok: false; error: string };
```

Guard with exhaustiveness checks:

```typescript
if (result.ok) {
  // TypeScript now knows result.result exists
  return result.result;
} else {
  // TypeScript now knows result.error exists
  return result.error;
}
```

## File Organization

### Typical Module Structure

```typescript
/**
 * [Module name] — [responsibility]
 *
 * Ported from [original location]
 */

// Imports (organized by type)
import fs from 'node:fs';
import type { Type1, Type2 } from './types.js';
import { helper1, helper2 } from './core.js';

// ─── Interfaces ──────────────────────────────────────────────────────────

export interface Result {
  // ...
}

// ─── Private helpers ─────────────────────────────────────────────────────

function privateHelper(): void {
  // ...
}

// ─── Public commands ─────────────────────────────────────────────────────

export async function cmdExample(cwd: string): Promise<CmdResult> {
  // ...
}
```

## Configuration

### Config Loading

Configuration is loaded from `.planning/config.json` with defaults:

```typescript
export interface AppConfig {
  model_profile: ModelProfileName; // 'quality' | 'balanced' | 'budget' | 'tokenburner'
  branching_strategy: BranchingStrategy; // 'none' | 'phase' | 'milestone'
  // ... other fields
}

export function loadConfig(cwd: string): AppConfig {
  const configPath = path.join(cwd, '.planning/config.json');
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as AppConfig;
  } catch {
    // Return defaults
    return { model_profile: 'balanced', branching_strategy: 'none' };
  }
}
```

## Summary

- **One function = one thing:** Keep responsibilities clear
- **Fail explicitly:** Use CmdResult or throw CliError/CliOutput
- **Name for clarity:** `cmdStateLoad` immediately tells you it's a CLI command that loads state
- **Comment the why:** Explain intent, not syntax
- **Async/await:** Modern, readable promise handling
- **Types everywhere:** TypeScript is strict for a reason

The codebase prioritizes **clarity, predictability, and maintainability** over clever tricks.
