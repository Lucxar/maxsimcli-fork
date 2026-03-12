# Architecture

> Generated: 2026-03-09

## Pattern Overview

**Name:** Three-Layer Meta-Prompting System with CLI Tools Router

**Key Characteristics:**
- MAXSIM is a spec-driven development system where the "runtime" is the AI itself. Markdown command prompts, workflow specifications, and agent definitions are the primary execution units. TypeScript code exists as the tools/services layer that these markdown-driven agents invoke.
- Three content layers: **commands** (user entry points) load **workflows** (multi-step processes) which spawn **agents** (specialized subagent prompts). Agents call back into compiled TypeScript via `node maxsim-tools.cjs <command>` (CLI tools router) or via MCP server tools.
- The project operates as an npm-published package (`maxsimcli`) that installs markdown files into the Claude Code config directory (`~/.claude/`). The delivered artifact is markdown prompts plus compiled CJS bundles.
- Data lives in a `.planning/` directory in user projects as structured markdown files (STATE.md, ROADMAP.md, phase plans/summaries). The TypeScript layer provides CRUD operations on these files.

## Layers

### Layer 1: Templates (Markdown Prompt Layer)

**Purpose:** Define user-facing commands, multi-step workflows, and specialized agent prompts that Claude Code executes.

**Location:** `templates/`

**Contains:**
- `templates/commands/maxsim/*.md` — 9 slash-command definitions (user types `/maxsim:execute-phase`, etc.)
- `templates/workflows/*.md` — 25 workflow implementation files (detailed multi-step procedures)
- `templates/agents/*.md` — 4 agent prompt definitions + 1 index (AGENTS.md) (specialized subagent prompts with structured sections)
- `templates/references/*.md` — 16 shared reference documents (conventions, patterns, profiles)
- `templates/skills/` — 20 skill directories (behavioral rules: TDD, verification, debugging, etc.)
- `templates/templates/` — Scaffold templates for planning documents

**Depends on:** Layer 2 (CLI tools router) for data operations. References tools as `node ~/.claude/maxsim/bin/maxsim-tools.cjs <command>` or MCP tool calls.

**Used by:** Claude Code AI runtime. Users invoke commands via `/maxsim:<name>` which loads the command markdown, which references workflows, which spawn agents.

### Layer 2: CLI Tools Router (TypeScript Business Logic)

**Purpose:** Provide deterministic, structured data operations that markdown-driven agents call via the Bash tool or MCP protocol. Handles all file I/O, state management, phase lifecycle, verification, and context assembly.

**Location:** `packages/cli/src/`

**Contains:**
- `packages/cli/src/cli.ts` — Main tools router entry point. Dispatches 40+ commands via a `COMMANDS` registry map. Parses args, invokes `cmd*` functions, handles `CmdResult` dispatch.
- `packages/cli/src/core/` — 21 modules providing all business logic (state, phase, roadmap, verify, config, init, template, frontmatter, artefakte, context-loader, skills, drift, etc.)
- `packages/cli/src/core/types.ts` — Branded types (`PhaseNumber`, `PhasePath`, `PhaseSlug`), `Result<T>`, `CmdResult`, and 60+ interface definitions
- `packages/cli/src/core/index.ts` — Barrel re-export of all core modules (300+ exports)
- `packages/cli/src/mcp/` — MCP tool registrations (8 tool modules: phase, todo, state, context, roadmap, config, github, board)
- `packages/cli/src/github/` — GitHub Issues/Projects v2 integration (8 modules: gh CLI wrapper, issue CRUD, project board, labels, milestones, mapping, sync, templates)
- `packages/cli/src/hooks/` — Claude Code hooks (statusline, context monitor, update checker)
- `packages/cli/src/install/` — npm install orchestration (11 modules: file copying, hooks setup, dashboard, manifest, patches, uninstall)
- `packages/cli/src/backend/` — Unified backend server (Express + WebSocket + MCP + terminal)

**Depends on:** Node.js runtime, `simple-git`, `slugify`, `@modelcontextprotocol/sdk`, `zod`, `express`, `ws`, `chokidar`, `detect-port`

**Used by:** Layer 1 (agents call tools via CLI or MCP), Layer 3 (dashboard imports from `@maxsim/core` path alias)

### Layer 3: Dashboard (React Frontend + Express Backend)

**Purpose:** Real-time web UI for monitoring and interacting with MAXSIM project state. Displays phase progress, plans, blockers, todos, and provides terminal access.

**Location:** `packages/dashboard/src/`

**Contains:**
- `packages/dashboard/src/server.ts` — Express server (52K lines) with WebSocket, file watching, MCP endpoint, and REST API
- `packages/dashboard/src/mcp-server.ts` — Dashboard-specific MCP server for question/answer flow
- `packages/dashboard/src/App.tsx` — Root React component
- `packages/dashboard/src/components/` — UI components organized by feature (dashboard panels, editor, layout, network, providers, simple-mode, terminal)
- `packages/dashboard/src/hooks/` — React hooks for data fetching and WebSocket
- `packages/dashboard/src/lib/` — Client utilities
- `packages/dashboard/src/terminal/` — xterm.js terminal integration with PTY backend

**Depends on:** Layer 2 (`@maxsim/core` via path alias), React 19, xterm.js, Tailwind CSS v4, CodeMirror, motion, WebSocket

**Used by:** End users via browser. Spawned by `maxsimcli dashboard` command or `maxsim-tools start`.

### Layer 4: Install/Delivery Layer

**Purpose:** Package and deliver MAXSIM as a self-contained npm package. Handles installation of markdown templates, hooks, and tools into the Claude Code config directory.

**Location:** `packages/cli/src/install/`

**Contains:**
- `packages/cli/src/install/index.ts` — Main install entry point (the npm `bin` command). Handles global/local install mode selection, interactive prompts, file copying.
- `packages/cli/src/install/hooks.ts` — Claude Code hook installation and configuration
- `packages/cli/src/install/dashboard.ts` — Dashboard subcommand handling and firewall setup
- `packages/cli/src/install/manifest.ts` — Install manifest tracking (detects modified files for patching)
- `packages/cli/src/install/patches.ts` — Local customization preservation across upgrades
- `packages/cli/src/install/uninstall.ts` — Clean removal of installed files
- `packages/cli/src/install/shared.ts` — Shared utilities (template paths, skill discovery, verification)
- `packages/cli/src/install/copy.ts` — File copy with path replacement
- `packages/cli/src/install/adapters.ts` — Commit attribution for different AI runtimes

**Depends on:** `chalk`, `figlet`, `ora`, `@inquirer/prompts`, `minimist`, `fs-extra`

**Used by:** `npx maxsimcli@latest` (end users). Copies files to `~/.claude/` (global) or project-local `.claude/`.

## Data Flow

### Flow 1: Command Execution (User -> Plans -> Code)

1. User types `/maxsim:execute-phase 03` in Claude Code
2. Claude Code loads `templates/commands/maxsim/execute-phase.md`
3. Command references `@./workflows/execute-phase.md` which Claude reads
4. Workflow step 1: runs `node maxsim-tools.cjs init execute-phase "03"` to assemble context JSON
5. Init module (`packages/cli/src/core/init.ts`) reads `.planning/config.json`, finds phase directory, resolves models, returns structured JSON with all paths and flags
6. Workflow groups plans into waves, spawns `Task` subagents with `@./agents/maxsim-executor.md`
7. Each executor subagent reads its plan file, implements tasks, calls tools for commits/state updates
8. Orchestrator collects results, updates STATE.md progress, triggers verification if enabled

### Flow 2: MCP Tool Invocation (Agent -> MCP Server -> Core)

1. Agent or dashboard calls an MCP tool (e.g., `mcp_find_phase`)
2. MCP server (`packages/cli/src/mcp-server.ts`) receives JSON-RPC request over stdio
3. Tool registration (`packages/cli/src/mcp/index.ts`) routes to specific tool module
4. Tool module (e.g., `packages/cli/src/mcp/phase-tools.ts`) calls core functions directly
5. Core function reads/writes `.planning/` files, returns structured data
6. MCP tool wraps result in `mcpSuccess`/`mcpError` format, returns via JSON-RPC

### Flow 3: CLI Tools Router (Agent -> Bash -> Core)

1. Agent calls `node ~/.claude/maxsim/bin/maxsim-tools.cjs state get "Current Phase"` via Bash tool
2. `cli.ts` parses args, extracts `--cwd` and `--raw` flags, looks up command in `COMMANDS` registry
3. Command handler calls `cmd*` function from core modules (e.g., `cmdStateGet`)
4. Core function reads `.planning/STATE.md`, parses structured markdown, extracts field
5. Returns `CmdResult` (`{ok: true, result: ...}` or `{ok: false, error: ...}`)
6. `handleResult()` throws `CliOutput` or `CliError`
7. `main()` catches these, writes JSON to stdout (or `@file:/tmp/...` for large outputs >50KB)

### Flow 4: Backend Server (Dashboard -> HTTP/WS -> Core)

1. Dashboard client connects via WebSocket to backend server
2. Backend (`packages/cli/src/backend/server.ts`) watches `.planning/` directory via chokidar
3. File changes trigger WebSocket broadcasts (`file-changes` messages) to all connected clients
4. Dashboard fetches data via REST API (`/api/phases`, `/api/state`, `/api/roadmap`)
5. Backend reads `.planning/` files using core module functions, parses and returns JSON
6. Backend also exposes MCP endpoint at `/mcp` using `StreamableHTTPServerTransport`
7. Terminal PTY sessions managed by `PtyManager` class with WebSocket relay

### State Management

- **Project state:** `.planning/STATE.md` — markdown with `**Field:** Value` pairs and structured sections (decisions, blockers, metrics)
- **Configuration:** `.planning/config.json` — JSON with model profile, workflow flags, branching strategy. Loaded via `loadConfig()` with in-memory cache.
- **Phase data:** `.planning/phases/<NN>-<Name>/` — directory per phase containing PLAN.md, SUMMARY.md, CONTEXT.md, RESEARCH.md, VERIFICATION.md files
- **Roadmap:** `.planning/ROADMAP.md` — phase listing with headings `## Phase NN: Name`. Parsed by regex in `getPhasePattern()`.
- **GitHub mapping:** `.planning/github-issues.json` — maps phases/tasks to GitHub Issues and Projects v2 items

## Key Abstractions

### CmdResult (Result Type for CLI Commands)

**Purpose:** Unified return type for all `cmd*` functions, replacing direct `process.exit()` calls.

**Example paths:** `packages/cli/src/core/types.ts` (definition), every `cmd*` function in `packages/cli/src/core/`

**Pattern:** Discriminated union `{ok: true, result, rawValue?} | {ok: false, error}`. Constructed via `cmdOk(result)` / `cmdErr(error)`. CLI entry point catches and dispatches via `handleResult()`. MCP tools call core functions directly and wrap in their own format.

### Branded Types (PhaseNumber, PhasePath, PhaseSlug)

**Purpose:** Compile-time type safety for phase identifiers, preventing string mix-ups.

**Example paths:** `packages/cli/src/core/types.ts`

**Pattern:** `Brand<string, 'PhaseNumber'>` using a unique symbol. Constructed via `phaseNumber()`, `phasePath()`, `phaseSlug()` factory functions that validate format.

### AppConfig (Application Configuration)

**Purpose:** Typed representation of `.planning/config.json` with defaults for every field.

**Example paths:** `packages/cli/src/core/types.ts` (interface), `packages/cli/src/core/core.ts` (`loadConfig()`)

**Pattern:** Single cached load from JSON file. Falls back to defaults if file missing or unparseable. Supports nested config sections with flat access (`get()` helper traverses sections).

### Init Context (Workflow Bootstrapping)

**Purpose:** Assemble all context needed for a workflow in a single call, preventing multiple round-trips.

**Example paths:** `packages/cli/src/core/init.ts` (15+ context types and `cmdInit*` functions)

**Pattern:** Each workflow type has a dedicated context interface (e.g., `ExecutePhaseContext`, `PlanPhaseContext`). The `cmdInit*` function loads config, finds phase, resolves models, checks file existence, and returns a dense JSON blob. Agents call this once at startup.

### MODEL_PROFILES (Agent-to-Model Mapping)

**Purpose:** Map each agent type to a Claude model tier based on the configured profile.

**Example paths:** `packages/cli/src/core/core.ts`

**Pattern:** `Record<AgentType, ModelProfileEntry>` where each entry maps `{quality, balanced, budget, tokenburner}` to `'opus' | 'sonnet' | 'haiku'`. Resolved via `resolveModelInternal(cwd, agentType)`.

### MCP Tool Registration

**Purpose:** Expose core operations as Model Context Protocol tools for agent and dashboard consumption.

**Example paths:** `packages/cli/src/mcp/index.ts` (orchestrator), `packages/cli/src/mcp/phase-tools.ts`, `packages/cli/src/mcp/state-tools.ts`

**Pattern:** Each module exports a `register*Tools(server: McpServer)` function that calls `server.tool(name, description, zodSchema, handler)`. Handlers use `detectProjectRoot()` for directory discovery, call core functions, and return `mcpSuccess()`/`mcpError()` responses. Eight tool modules are registered.

### GitHub Integration Layer

**Purpose:** Optional GitHub Issues/Projects v2 integration for external task tracking.

**Example paths:** `packages/cli/src/github/` (8 modules)

**Pattern:** Graceful degradation via `detectGitHubMode()` which returns `'full'` or `'local-only'`. All operations check mode first. Uses `gh` CLI (via `execFile`, never `exec`) for security. Mapping file at `.planning/github-issues.json` links phases/tasks to GitHub issue numbers and project board items.

## Entry Points

### `dist/install.cjs` (npm bin entry)

**Location:** Built from `packages/cli/src/install/index.ts`

**Triggers:** `npx maxsimcli@latest`, `npx maxsimcli --local`, `npx maxsimcli --uninstall`

**Responsibilities:** Interactive install wizard. Copies templates, hooks, and tools to `~/.claude/` (global) or `.claude/` (local). Handles manifest tracking, patch preservation, hook configuration, dashboard setup.

### `dist/cli.cjs` (Tools Router)

**Location:** Built from `packages/cli/src/cli.ts`

**Triggers:** `node maxsim-tools.cjs <command> [args]` — called by agents via the Bash tool

**Responsibilities:** Parses command and arguments. Dispatches to `cmd*` functions via `COMMANDS` registry (40+ commands). Handles `--cwd` override for sandboxed subagents. Returns JSON to stdout. Uses throw-based flow control (`CliOutput`/`CliError`) for clean exit handling.

### `dist/mcp-server.cjs` (Stdio MCP Server)

**Location:** Built from `packages/cli/src/mcp-server.ts`

**Triggers:** Started by Claude Code when configured in `.mcp.json`. Communicates over stdio.

**Responsibilities:** Registers 8 tool module groups via `registerAllTools()`. Handles MCP JSON-RPC protocol over stdio. Uses `@modelcontextprotocol/sdk` for server framework. All logging to stderr only (stdout reserved for protocol).

### `dist/backend-server.cjs` (Unified Backend Server)

**Location:** Built from `packages/cli/src/backend-server.ts`

**Triggers:** `maxsim-tools backend-start` spawns as detached child process. Port derived from project path hash (range 3100-3199).

**Responsibilities:** Express HTTP API, WebSocket for real-time updates, MCP endpoint at `/mcp`, PTY terminal management, chokidar file watcher on `.planning/`. Lock file at `.planning/.backend-lock` for discovery.

### `dist/assets/dashboard/server.js` (Dashboard Server)

**Location:** Built from `packages/dashboard/src/server.ts`

**Triggers:** `maxsimcli dashboard` command. Spawns as detached process.

**Responsibilities:** Serves Vite-built React SPA. Provides REST API for project data. WebSocket for real-time state updates. Terminal PTY relay. MCP server for dashboard-specific question/answer flow.

### Claude Code Hooks (3 hooks)

**Location:** Built to `dist/assets/hooks/`

**Triggers:** Claude Code hook system. Statusline runs on `Notification` event. Context monitor runs on `PostToolUse`. Update checker runs on `PreToolUse`.

**Responsibilities:**
- `maxsim-statusline.cjs` — Renders model, context usage bar (scaled to 80% limit), writes bridge file for context monitor
- `maxsim-context-monitor.cjs` — Reads bridge file, injects warnings when context usage exceeds 35% or 25% remaining
- `maxsim-check-update.cjs` — Checks npm registry for newer version, warns user

## Error Handling

### Strategy

Throw-based flow control in the CLI tools router. Core `cmd*` functions return `CmdResult` discriminated unions. The CLI entry point catches `CliOutput` (success) and `CliError` (failure) and writes appropriate output. MCP tools call core functions directly and handle errors within each tool handler, never calling `process.exit()`.

### Patterns

- **CLI layer:** `output()` and `error()` throw `CliOutput`/`CliError` respectively. `main()` catches these. `rethrowCliSignals()` used in catch blocks to avoid swallowing flow control signals.
- **Core layer:** Functions return `CmdResult` via `cmdOk(result)` / `cmdErr(message)`. Internal `Result<T>` type used for module-internal results.
- **MCP layer:** CRITICAL constraint: never import `output()`/`error()` from core (they throw). Never call `process.exit()`. Use `mcpSuccess()`/`mcpError()` wrappers. Try/catch around every tool handler.
- **Backend layer:** Same constraints as MCP. All logging to stderr via `console.error()`. Server must stay alive after every request.
- **Large output protection:** JSON output >50KB is written to a temp file and returned as `@file:/path` to prevent overflowing Claude Code's Bash buffer.

## Cross-Cutting Concerns

### Logging

- **CLI tools:** No explicit logging framework. Errors go to stderr. Debug logging via `debugLog()` gated on `MAXSIM_DEBUG` env var.
- **MCP server:** All logging to stderr only (stdout reserved for protocol).
- **Backend server:** Structured logging via `log(level, tag, ...args)` writing to date-stamped log files in `.planning/logs/`.
- **Dashboard server:** Same structured logging pattern, writing to `dist/logs/` directory.

### Validation

- **Phase numbers:** Validated via `phaseNumber()` factory function (regex: `/^\d+[A-Z]?(\.\d+)?$/i`).
- **Config:** `loadConfig()` applies defaults for every field. Tolerates missing or malformed config files.
- **MCP inputs:** Zod schemas on every tool parameter.
- **Frontmatter:** Schema-based validation via `FRONTMATTER_SCHEMAS` and `cmdFrontmatterValidate()`.

### Authentication

- **GitHub integration:** Checks `gh auth status` via `checkGhAuth()`. Detects scopes, gracefully degrades to `'local-only'` mode.
- **No user auth:** MAXSIM runs locally as a development tool. No user authentication layer.

### Configuration Resolution

- **Project config:** `.planning/config.json` loaded once per cwd, cached in memory via `_configCache`.
- **Model resolution:** `resolveModelInternal(cwd, agentType)` reads config profile, looks up `MODEL_PROFILES[agentType][profile]`, supports per-agent overrides via `model_overrides`.
- **Path resolution:** Canonical helpers `planningPath()`, `statePath()`, `roadmapPath()`, `configPath()`, `phasesPath()` ensure consistent path construction.

### Context Assembly

- **Init functions:** `cmdInit*` functions in `packages/cli/src/core/init.ts` assemble comprehensive context for each workflow type in a single call, minimizing agent round-trips.
- **Context loader:** `packages/cli/src/core/context-loader.ts` provides intelligent file selection based on phase/topic, preventing context overload.
- **Codebase docs:** Detected at `packages/cli/src/core/init.ts` via `listCodebaseDocs()` — scans `.planning/codebase/` for architecture/convention reference files.
