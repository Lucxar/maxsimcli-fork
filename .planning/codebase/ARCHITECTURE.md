# MAXSIM Architecture

**Date:** 2026-03-03

## Pattern Overview

MAXSIM is a **task orchestration and context engineering platform** that runs as a distributed system with three primary components:

- **CLI Tools** (`packages/cli/src/cli.ts`) — Command dispatcher that routes 150+ operations to core modules
- **MCP Server** (`packages/cli/src/mcp-server.ts`) — Model Context Protocol endpoint for Claude integration
- **Backend Service** (`packages/cli/src/backend/server.ts`) — Persistent HTTP/WebSocket server for dashboard and real-time operations
- **Dashboard** (`packages/dashboard/`) — Vite+React frontend + Express backend, bundled into CLI distribution

The core domain models (phases, state, roadmap, requirements) are represented as markdown files in `.planning/` directories in user projects. The CLI and backend are thin adapters that read, parse, validate, and transform these files.

**Key characteristic:** MAXSIM is not prescriptive about *how* work is done — it provides a structured framework for *planning* and *tracking* work. It exports no APIs; instead it ships markdown templates and command/workflow files that Claude instances execute.

## Layers

### Layer 1: Entry Points & Routing

**Purpose:** Accept user commands and dispatch to appropriate handlers.

**Location:**
- `packages/cli/src/cli.ts` — CLI command dispatcher (566 lines)
- `packages/cli/src/mcp-server.ts` — MCP server bootstrap
- `packages/cli/src/backend-server.ts` — Backend server bootstrap

**Contains:**
- `cli.ts`: Main command registry (COMMANDS object with 40+ handlers), argument parsing, error/output handling
- `mcp-server.ts`: Simple server startup script
- `backend-server.ts`: Backend server startup script

**Depends on:**
- `packages/cli/src/core/index.ts` — All command implementations
- `packages/cli/src/core/core.ts` — Utilities and error handling

**Used by:**
- Node.js child processes spawned by CLI installations
- MCP-compatible Claude Code runtime
- Dashboard WebSocket clients

### Layer 2: Command Implementation (Core Modules)

**Purpose:** Implement all business logic for MAXSIM operations.

**Location:** `packages/cli/src/core/`

**Key modules:**

| Module | Purpose | Size | Key Functions |
|--------|---------|------|---|
| `core.ts` | Constants, git helpers, path resolution, phase parsing | 777 lines | `execGit()`, `normalizePhaseName()`, `comparePhaseNum()`, `findPhaseInternal()`, `loadConfig()` |
| `types.ts` | Branded types (PhaseNumber, PhasePath), interfaces, result types | 512 lines | `CmdResult`, `AgentType`, `ModelProfiles` definitions |
| `phase.ts` | Phase CRUD, listing, completion, archive management | 940 lines | `cmdPhaseAdd()`, `cmdPhaseComplete()`, `cmdPhasesList()` |
| `state.ts` | STATE.md read/write, decisions, blockers, metrics | 536 lines | `cmdStateLoad()`, `cmdStateAddDecision()`, `cmdStateAdvancePlan()` |
| `roadmap.ts` | ROADMAP.md parsing, phase goal/criteria extraction, analysis | 159 lines | `cmdRoadmapGetPhase()`, `cmdRoadmapAnalyze()` |
| `verify.ts` | Plan validation, consistency checks, health repair | 965 lines | `cmdVerifyPlanStructure()`, `cmdValidateHealth()` |
| `init.ts` | Workflow bootstrap contexts (execute-phase, plan-phase, etc.) | 791 lines | `cmdInitExecutePhase()`, `cmdInitPlanPhase()` |
| `frontmatter.ts` | YAML frontmatter parsing and splicing | 210 lines | `extractFrontmatter()`, `spliceFrontmatter()` |
| `context-loader.ts` | Smart file selection for workflow context | 265 lines | `cmdContextLoad()` — filters planning files by topic |
| `commands.ts` | Utility commands (slug generation, git commits, todos) | 693 lines | `cmdGenerateSlug()`, `cmdCommit()`, `cmdHistoryDigest()` |
| `milestone.ts` | Milestone completion, requirements marking, archival | 228 lines | `cmdMilestoneComplete()`, `cmdRequirementsMarkComplete()` |
| `config.ts` | .planning/config.json read/write | 148 lines | `cmdConfigGet()`, `cmdConfigSet()` |
| `template.ts` | Template selection and filling for scaffolding | 272 lines | `cmdTemplateSelect()`, `cmdTemplateFill()` |
| `dashboard-launcher.ts` | Dashboard process management | 263 lines | `spawnDashboard()`, `findRunningDashboard()` |
| `artefakte.ts` | Ad-hoc artifact storage (key-value pairs in phase context) | 198 lines | `cmdArtefakteRead()`, `cmdArtefakteWrite()` |
| `skills.ts` | Skill (reusable prompt package) installation | 169 lines | `cmdSkillInstall()`, `cmdSkillUpdate()` |
| `start.ts` | Project bootstrap and server startup | 99 lines | `cmdStart()` |

**Depends on:**
- Node.js fs, path, os modules
- `simple-git` — git operations
- `slugify` — slug generation

**Used by:**
- `cli.ts` (command handlers call core functions)
- `mcp/` — MCP tool registrations
- `backend/server.ts` — API endpoints

### Layer 3: Adapters & Runtimes

**Purpose:** Handle installation and runtime-specific configuration.

**Location:** `packages/cli/src/adapters/` and `packages/cli/src/install/`

**Adapters** (`adapters/`):
- `base.ts` — Shared utilities (frontmatter extraction, settings I/O, tilde expansion)
- `claude.ts` — Claude Code runtime handler (installs to ~/.claude, reads settings.json)
- `types.ts` — Adapter interfaces

**Install orchestration** (`install/`):
- `index.ts` — Main install entry point, user interaction, file copying workflow
- `adapters.ts` — Runtime detection and adapter selection
- `copy.ts` — Recursive copy with path variable replacement (`{CLAUSE_CONFIG_DIR}`)
- `hooks.ts` — Pre-commit/post-commit hook configuration
- `dashboard.ts` — Dashboard subprocess management
- `manifest.ts` — Installation manifest tracking
- `patches.ts` — Local patch persistence
- `uninstall.ts` — Cleanup and file removal
- `shared.ts` — Shared utilities (version, paths, validation)

**Depends on:**
- `packages/cli/src/core/` — Configuration and utilities
- `ora`, `chalk`, `inquirer` — CLI UI

**Used by:**
- Node.js `npx maxsimcli` invocations
- CI/CD install hooks

### Layer 4: MCP Tool Bridge

**Purpose:** Register MAXSIM core commands as MCP tools for Claude integration.

**Location:** `packages/cli/src/mcp/`

**Contains:**
- `index.ts` — Tool registry dispatcher
- `phase-tools.ts` — Phase lifecycle tools
- `state-tools.ts` — State and decision tools
- `roadmap-tools.ts` — Roadmap querying tools
- `todo-tools.ts` — Todo management tools
- `context-tools.ts` — Context loading tools
- `config-tools.ts` — Configuration tools
- `utils.ts` — Shared MCP utilities

**Depends on:**
- `@modelcontextprotocol/sdk` — MCP types and server
- `packages/cli/src/core/` — Command implementations

**Used by:**
- `backend/server.ts` — Registers tools on MCP server instance

### Layer 5: Backend & Real-Time Communication

**Purpose:** Provide persistent HTTP/WebSocket server for dashboard and real-time operations.

**Location:** `packages/cli/src/backend/`

**Contains:**
- `server.ts` — Main backend server (Express + WebSocket + MCP)
- `lifecycle.ts` — Server process management (start, stop, status)
- `terminal.ts` — PTY (pseudo-terminal) management for shell access
- `types.ts` — Backend configuration and message types

**Key subsystems:**
1. **Express API** — Serves `/api/roadmap`, `/api/phases`, `/api/state`, file read/write endpoints
2. **WebSocket** — Real-time file watch notifications and terminal output
3. **MCP Endpoint** — HTTP transport for MCP requests
4. **File Watching** — Detects changes in `.planning/` and broadcasts to connected clients
5. **Terminal Management** — Spawns and manages pseudo-terminals for shell commands

**Depends on:**
- `express` — Web framework
- `ws` — WebSocket library
- `node-pty` — Terminal emulation
- `@modelcontextprotocol/sdk` — MCP integration
- `packages/cli/src/core/` — Core commands and utilities

**Used by:**
- Dashboard (`packages/dashboard/`)
- Claude Code (via MCP)

## Data Flow

### Flow 1: CLI Command Execution

```
User: node maxsim-tools state get --field "Current Phase"
  ↓
cli.ts:main() — parse args, validate cwd
  ↓
COMMANDS['state'] = handleState()
  ↓
handlers['get']() → cmdStateGet(cwd, field)
  ↓
core/state.ts: cmdStateGet()
  - Load STATE.md from .planning/STATE.md
  - Extract field with regex pattern matching
  ↓
stateExtractField(content, "Current Phase") → returns value
  ↓
handleResult(CmdResult) → output(result) or error(message)
  ↓
Output: JSON or --raw text to stdout
```

### Flow 2: Workflow Bootstrap (init-execute-phase)

```
User: /maxsim:execute-phase 01
  ↓
CLI command routed through workflow markdown → calls:
  node maxsim-tools init execute-phase 01
  ↓
cli.ts:handleInit() → cmdInitExecutePhase(cwd, "01")
  ↓
core/init.ts: cmdInitExecutePhase()
  - Find phase directory: findPhaseInternal(cwd, "01")
  - Load ROADMAP.md: getRoadmapPhaseInternal(cwd, "01")
  - Load config: loadConfig(cwd)
  - List phase plans: glob `01-01-PLAN.md`, `01-02-PLAN.md`, etc.
  - Resolve executor/verifier models from config
  ↓
Returns ExecutePhaseContext object with:
  - phase_number, phase_name, phase_dir
  - plans[], summaries[], incomplete_plans[]
  - executor_model, verifier_model (resolved from model_profile)
  - branching_strategy, branch_name
  ↓
Workflow markdown receives context and spawns agent subprocesses
```

### Flow 3: Dashboard Real-Time Updates

```
User opens dashboard at http://localhost:3000
  ↓
Dashboard WebSocket connects to backend (:3001 or auto-detected port)
  ↓
backend/server.ts: WebSocketServer listens on /ws
  ↓
File watcher monitors .planning/ changes:
  - fs.watch() on .planning/ and .planning/phases/
  - Debounces rapid changes (300ms)
  - Filters out internal writes to prevent loops
  ↓
On file change: broadcast { type: "file_changed", path, content } to all WS clients
  ↓
Dashboard receives update → React state change → re-renders phase list
  ↓
User clicks "Execute Phase" button
  ↓
POST /api/command { command: "execute-phase", phase: "01" }
  ↓
backend/server.ts: handles POST
  - Validates path is within .planning/
  - Calls core/init.ts functions
  - Returns context JSON
  ↓
Dashboard displays phase details and form
```

### Flow 4: MCP Tool Invocation (Claude Code)

```
Claude Code user calls: `<use_mcp_tool>{ "name": "phase_add", ... }</use_mcp_tool>`
  ↓
MCP client sends request to backend MCP endpoint
  ↓
backend/server.ts: handleMcpRequest()
  - Parses request
  - Routes to registerAllTools() registered tool handlers
  ↓
mcp/phase-tools.ts: tool handler → cmdPhaseAdd(cwd, name)
  ↓
core/phase.ts: cmdPhaseAdd()
  - Find next phase number: comparePhaseNum() sorting
  - Create phase directory
  - Scaffold phase files (CONTEXT.md, RESEARCH.md, etc.)
  - Update ROADMAP.md
  ↓
Returns { ok: true, result: PhaseAddResult }
  ↓
MCP response sent back to Claude Code
```

### Flow 5: State Progression (Decisions & Blockers)

```
Agent calls: node maxsim-tools state add-decision --summary "..." --rationale "..."
  ↓
cli.ts:handleState() → cmdStateAddDecision(cwd, options)
  ↓
core/state.ts: cmdStateAddDecision()
  - Load STATE.md
  - Find "## Decisions" section
  - Append new entry: "- **Phase 01, 2026-03-03**: ... (rationale: ...)"
  - Remove placeholder text if present
  - Write STATE.md back
  ↓
Returns updated state snapshot
```

## Key Abstractions

### Branded Types (Type Safety)

**Pattern:** Use TypeScript's unique symbol brand to create compile-time type distinctions.

**Examples in** `packages/cli/src/core/types.ts`:
```typescript
type PhaseNumber = Brand<string, 'PhaseNumber'>;
type PhasePath = Brand<string, 'PhasePath'>;
type PhaseSlug = Brand<string, 'PhaseSlug'>;
```

**Purpose:** Prevent mixing phase numbers ("01"), paths ("/phases/01-Foundation"), and slugs ("foundation") at the type level. Functions that accept `PhaseNumber` will not compile if passed a raw string.

**Usage:** `phaseNumber("01")` returns type-branded value; functions like `comparePhaseNum(a: PhaseNumber, b: PhaseNumber)` enforce correct inputs.

### Result Type (Functional Error Handling)

**Pattern:** Return discriminated union instead of throwing exceptions.

**Example in** `packages/cli/src/core/types.ts`:
```typescript
type CmdResult =
  | { ok: true; result: unknown; rawValue?: unknown }
  | { ok: false; error: string };
```

**Purpose:** Commands return typed results; CLI dispatcher handles ok/error branches at entry point (`cli.ts:handleResult()`). No try-catch needed in core modules.

**Usage:** `cmdOk(data)` for success, `cmdErr("message")` for errors. Handlers check `.ok` flag.

### CliOutput/CliError (Control Flow)

**Pattern:** Throw special exception types to signal successful output or fatal errors.

**Location:** `packages/cli/src/core/core.ts`

**Usage:**
```typescript
export function output(result: unknown): never { throw new CliOutput(result); }
export function error(message: string): never { throw new CliError(message); }
```

**Purpose:** Separates output logic from command logic. Commands call `output()` or `error()`, which throw. `cli.ts:main()` catch-block converts throws to process exit codes and stdout/stderr writes.

**Benefit:** Commands don't need to return anything; success is signaled by throwing CliOutput.

### Frontmatter Parsing (Structured Markdown)

**Location:** `packages/cli/src/core/frontmatter.ts`

**Pattern:** YAML frontmatter embedded in markdown files for structured metadata.

**Example:**
```markdown
---
phase: 01
plan: 1
duration: 4h
---
## Plan Description
...
```

**Functions:**
- `extractFrontmatter(content)` → `{ phase: "01", plan: "1", ... }`
- `spliceFrontmatter(content, newObj)` → updated markdown with new frontmatter

**Purpose:** Store structured task metadata without separate JSON files. Readable in any markdown editor.

### Phase Number Normalization

**Location:** `packages/cli/src/core/core.ts`

**Pattern:** Phases can be: `01`, `01A`, `01B`, `01.1`, `01.2`, etc.

**Functions:**
- `normalizePhaseName("01A")` → `"01a"` (lowercase for comparison)
- `comparePhaseNum(a, b)` → numeric sort: `01 < 01A < 01B < 01.1 < 02`

**Purpose:** Flexible phase naming while maintaining deterministic ordering. Supports:
- Decimal phases (phases within phases): `01.1`, `01.2`
- Letter suffixes (duplicates/variations): `01A`, `01B`
- Mixed sorting: `01 < 01A < 01B < 01.1 < 01.2 < 02`

### Model Resolution (Agent Model Selection)

**Location:** `packages/cli/src/core/core.ts`

**Pattern:** Configuration maps agent types to model tiers via profiles.

**Config structure** (`.planning/config.json`):
```json
{
  "model_profile": "balanced",
  "agents": { "maxsim-executor": "inherit" }
}
```

**Lookup in** `MODEL_PROFILES`:
```typescript
MODEL_PROFILES['maxsim-executor'] = {
  quality: 'opus',
  balanced: 'sonnet',
  budget: 'sonnet'
}
```

**Resolution:** `resolveModelInternal(cwd, "maxsim-executor", "inherit")`:
1. Load config, get `model_profile` (default: "balanced")
2. Look up agent in `MODEL_PROFILES`
3. Return profile[model_profile] (e.g., "sonnet")

**Benefit:** Agents don't hardcode model names; they resolve at runtime from config.

### Smart Context Selection (Context Loader)

**Location:** `packages/cli/src/core/context-loader.ts`

**Pattern:** Filter planning files by task domain to prevent context overload.

**Topic mapping:**
```typescript
const TOPIC_TO_CODEBASE_DOCS: Record<string, string[]> = {
  ui: ['CONVENTIONS.md', 'STRUCTURE.md'],
  api: ['ARCHITECTURE.md', 'CONVENTIONS.md'],
  database: ['ARCHITECTURE.md', 'STACK.md'],
  testing: ['TESTING.md', 'CONVENTIONS.md'],
  ...
};
```

**Usage:** `cmdContextLoad(cwd, phase, "api")` returns only files relevant to API work:
- Phase-specific files (PLAN, RESEARCH, CONTEXT)
- Codebase docs (ARCHITECTURE.md, CONVENTIONS.md)
- excludes irrelevant docs

**Benefit:** Keeps Claude's context window focused, prevents prompt injection from unrelated docs.

## Entry Points

### 1. CLI Entry Point: `packages/cli/src/cli.ts`

**Trigger:** `node maxsim-tools <command> [args]`

**Responsibilities:**
- Parse command-line arguments (with `--cwd`, `--raw`, `--` flags)
- Validate working directory exists
- Route command to appropriate handler (COMMANDS object)
- Handle async/await for async handlers
- Catch `CliOutput` / `CliError` exceptions
- Write results to stdout or errors to stderr
- Call `process.exit(0)` or `process.exit(1)`

**Key patterns:**
- Subcommands use nested handlers: `handleState()`, `handlePhase()`, etc.
- Large outputs (>50KB) are written to tmpfiles and returned as `@file:/path`
- `--raw` flag outputs raw text instead of JSON (useful for piping)

### 2. MCP Server Entry Point: `packages/cli/src/mcp-server.ts`

**Trigger:** `node maxsim-tools start-server` or `node .mcp-server.cjs`

**Responsibilities:**
- Create MCP server instance
- Register all tools via `registerAllTools(server)`
- Start HTTP or stdio transport

**Used by:** Claude Code's MCP integration to invoke tools as native functions.

### 3. Backend Server Entry Point: `packages/cli/src/backend-server.ts`

**Trigger:** `node .mcp-server.cjs` (alternative to MCP) or `node maxsim-tools backend-start`

**Responsibilities:**
- Create Express + WebSocket + MCP server
- Bind to auto-detected port (3001, 3002, ... if ports busy)
- Write lock file to `.planning/.maxsim-backend.lock`
- Listen for WebSocket connections
- Watch `.planning/` directory for file changes
- Provide REST API endpoints

**Used by:** Dashboard and real-time clients.

### 4. Install Entry Point: `packages/cli/src/install/index.ts`

**Trigger:** `npx maxsimcli [--global] [--local] [--uninstall]`

**Responsibilities:**
- Detect runtime (Claude Code)
- Show interactive prompts (install location, force flags)
- Copy templates, hooks, dashboard to runtime config
- Write manifest for tracking
- Generate runtime-specific settings

**Entry point for:** Users installing MAXSIM for the first time.

## Error Handling

### Strategy: Exception-Based Control Flow

MAXSIM uses **throwing** for error signaling, not for exceptions:

| Throw Type | Usage | Caught By | Result |
|---|---|---|---|
| `CliOutput` | Command success (`output()` call) | `cli.ts:main()` catch | stdout JSON, exit 0 |
| `CliError` | Command failure (`error()` call) | `cli.ts:main()` catch | stderr message, exit 1 |
| Unexpected errors | Bugs in core code | `cli.ts:main()` catch | re-thrown, causes crash |

### Patterns in Core Modules

**Pattern 1: Return CmdResult instead of throwing**

`packages/cli/src/core/phase.ts`:
```typescript
export async function cmdPhaseAdd(cwd: string, description: string): Promise<CmdResult> {
  const phaseNum = await getNextPhaseNumber(cwd);
  if (!phaseNum) return cmdErr('No phases found in roadmap');
  // ... create phase ...
  return cmdOk({ phase_number: phaseNum, ... }, rawValue);
}
```

**Pattern 2: Rethrow CliSignals to propagate**

In helper functions:
```typescript
try {
  const config = loadConfig(cwd);
} catch (e: unknown) {
  rethrowCliSignals(e); // Re-throw CliOutput/CliError
  return cmdErr('Failed to load config: ' + (e as Error).message);
}
```

**Pattern 3: Synchronous reads with defaults**

`packages/cli/src/core/core.ts`:
```typescript
export function safeReadFile(cwd: string, relPath: string): string | null {
  const fullPath = path.join(cwd, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null; // Not an error, file may not exist
  }
}
```

## Cross-Cutting Concerns

### Logging & Debugging

**Pattern:** Optional debug output to stderr.

**Location:** `packages/cli/src/core/core.ts`

**Usage:**
```typescript
function debugLog(tag: string, message: string): void {
  if (process.env.MAXSIM_DEBUG) {
    console.error(`[DEBUG] [${tag}] ${message}`);
  }
}
```

**Activation:** Set `MAXSIM_DEBUG=1` in environment.

### Git Integration

**Pattern:** All git operations via `simpleGit()`.

**Location:** Core modules (phase completion, commits)

**Usage:**
```typescript
const git = simpleGit(cwd);
const log = await git.log({ maxCount: 50 });
await git.add(files);
await git.commit(message);
```

**Safety:** Always work in user's project directory; never modify MAXSIM's own repo.

### Path Resolution

**Pattern:** Consistent `.planning/` directory structure.

**Utilities in** `packages/cli/src/core/core.ts`:
- `planningPath(cwd)` → `${cwd}/.planning`
- `phasesPath(cwd)` → `${cwd}/.planning/phases`
- `roadmapPath(cwd)` → `${cwd}/.planning/ROADMAP.md`
- `statePath(cwd)` → `${cwd}/.planning/STATE.md`
- `configPath(cwd)` → `${cwd}/.planning/config.json`

**Benefit:** Single source of truth for path construction; easy to refactor.

### Validation & Health Checks

**Pattern:** Verify plan structure, phase completeness, references, commits.

**Location:** `packages/cli/src/core/verify.ts` (965 lines)

**Checks:**
- `cmdVerifyPlanStructure()` — PLAN.md frontmatter and sections
- `cmdVerifyPhaseCompleteness()` — Phase has required files
- `cmdVerifyReferences()` — Quoted files exist
- `cmdVerifyArtifacts()` — Artifacts linked in PLAN exist
- `cmdValidateHealth()` — Across all phases; includes auto-repair mode

**Used by:** CI/CD, pre-push hooks, user verification workflows.

### File Watching (Backend)

**Pattern:** Debounced fs.watch() with write-suppression.

**Location:** `packages/cli/src/backend/server.ts`

**Features:**
- Monitors `.planning/` directory
- Debounces changes (300ms) to batch rapid writes
- Filters out internal writes (prevents watcher loop when backend writes to files)
- Broadcasts file_changed events to WebSocket clients

**Used by:** Dashboard real-time updates.
