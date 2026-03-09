# Structure

> Generated: 2026-03-09

## Directory Layout

```
maxsim/                              # Monorepo root (npm workspaces)
├── packages/
│   ├── cli/                         # Main published package (maxsimcli on npm)
│   │   ├── src/
│   │   │   ├── cli.ts               # Tools router entry point (40+ commands)
│   │   │   ├── mcp-server.ts        # MCP stdio server entry point
│   │   │   ├── backend-server.ts    # Backend server entry point (Express+WS+MCP)
│   │   │   ├── index.ts             # Stub export (placeholder)
│   │   │   ├── core/                # Business logic modules (21 files)
│   │   │   ├── mcp/                 # MCP tool registrations (11 files)
│   │   │   ├── github/              # GitHub Issues/Projects integration (10 files)
│   │   │   ├── hooks/               # Claude Code hooks (5 files)
│   │   │   ├── install/             # Install orchestration (11 files)
│   │   │   └── backend/             # Unified backend server (5 files)
│   │   ├── dist/                    # Built output (CJS bundles + assets)
│   │   │   ├── install.cjs          # npm bin entry (install wizard)
│   │   │   ├── cli.cjs              # Tools router bundle
│   │   │   ├── mcp-server.cjs       # MCP server bundle
│   │   │   ├── backend-server.cjs   # Backend server bundle
│   │   │   └── assets/              # Templates, hooks, dashboard, changelog
│   │   ├── tests/                   # Vitest test suites
│   │   ├── scripts/                 # Build helper scripts
│   │   ├── tsdown.config.ts         # tsdown build configuration
│   │   ├── tsconfig.json            # TypeScript config
│   │   ├── vitest.config.ts         # Unit test config
│   │   ├── vitest.e2e.config.ts     # E2E test config
│   │   └── package.json             # Published as maxsimcli
│   ├── dashboard/                   # Web dashboard (Vite + React + Express)
│   │   ├── src/
│   │   │   ├── App.tsx              # Root React component
│   │   │   ├── main.tsx             # React entry point
│   │   │   ├── server.ts            # Express server (52K lines)
│   │   │   ├── mcp-server.ts        # Dashboard MCP server
│   │   │   ├── components/          # UI components by feature
│   │   │   ├── hooks/               # React data hooks
│   │   │   ├── lib/                 # Client utilities
│   │   │   └── terminal/            # xterm.js + PTY manager
│   │   ├── dist/                    # Build output (client + server.js)
│   │   ├── tsdown.config.server.mts # Server build config
│   │   └── package.json             # @maxsim/dashboard (private)
│   └── website/                     # Marketing website (separate deploy)
│       ├── src/
│       │   ├── App.tsx              # Website root
│       │   ├── components/          # Website UI components
│       │   ├── pages/               # Route pages
│       │   ├── content/             # Markdoc content
│       │   └── markdoc/             # Markdoc config
│       └── package.json             # Private, not published
├── templates/                       # Markdown prompt assets (source of truth)
│   ├── agents/                      # 15 agent prompt files + AGENTS.md registry
│   ├── commands/maxsim/             # 39 slash-command definitions
│   ├── workflows/                   # 42 workflow implementation files
│   ├── references/                  # 16 shared reference documents
│   ├── skills/                      # 12 skill directories (behavioral rules)
│   └── templates/                   # 30+ scaffold templates for planning docs
├── scripts/                         # Repo-level scripts (e2e-test, pre-push check)
├── docs/                            # Reference docs, user guide, research papers
├── assets/                          # Static assets (images, etc.)
├── .github/                         # CI/CD workflows, issue/PR templates
│   ├── workflows/
│   │   ├── publish.yml              # Auto-publish on push to main
│   │   ├── deploy-website.yml       # Website deployment
│   │   └── cleanup-npm.yml          # npm cleanup
│   ├── ISSUE_TEMPLATE/              # Issue templates
│   └── PULL_REQUEST_TEMPLATE.md     # PR template
├── .husky/                          # Git hooks (pre-push)
├── .planning/                       # MAXSIM's own planning data (dogfooding)
│   └── codebase/                    # Codebase analysis documents
├── package.json                     # Workspace root (npm workspaces)
├── tsconfig.base.json               # Shared TypeScript config
├── tsconfig.json                    # Root TypeScript config
├── biome.json                       # Biome linter/formatter config
├── .releaserc.json                  # semantic-release config
├── CLAUDE.md                        # Claude Code project instructions
├── CHANGELOG.md                     # Auto-generated changelog
└── README.md                        # Project readme
```

## Directory Purposes

### `packages/cli/src/core/` — Core Business Logic

**Purpose:** All deterministic business logic for MAXSIM operations. Stateless functions that read/write `.planning/` files.

**Contains:** 21 TypeScript modules covering state management, phase lifecycle, roadmap parsing, verification, configuration, context assembly, template operations, frontmatter parsing, skill management, drift detection, and shared utilities.

**Key files:**
- `core.ts` (34K) — Constants, model profiles, output helpers, file/git utilities, phase search, path helpers
- `types.ts` (18K) — All type definitions: branded types, CmdResult, 60+ interfaces
- `index.ts` (7K) — Barrel re-export (300+ exports)
- `init.ts` (43K) — Context assembly for 15+ workflow types
- `phase.ts` (42K) — Phase add/insert/remove/complete/archive lifecycle
- `state.ts` (26K) — STATE.md CRUD, field extract/replace, decisions, blockers, metrics
- `verify.ts` (33K) — Plan structure, phase completeness, reference, commit, artifact checks
- `commands.ts` (26K) — Utility commands: slugs, timestamps, todos, history, commits, web search
- `config.ts` (5K) — config.json CRUD
- `roadmap.ts` (10K) — ROADMAP.md parsing, phase analysis
- `milestone.ts` (9K) — Milestone completion and archiving
- `template.ts` (9K) — Template scaffolding and filling
- `frontmatter.ts` (7K) — YAML frontmatter parsing with schema validation
- `context-loader.ts` (9K) — Intelligent context file selection
- `artefakte.ts` (7K) — DECISIONS.md, ACCEPTANCE-CRITERIA.md, NO-GOS.md CRUD
- `dashboard-launcher.ts` (10K) — Dashboard spawn, health check, port management
- `drift.ts` (7K) — Drift report read/write, requirement extraction
- `skills.ts` (6K) — Skill list/install/update operations
- `start.ts` (3K) — Start command (backend + dashboard)

### `packages/cli/src/mcp/` — MCP Tool Layer

**Purpose:** Expose core operations as MCP tools via JSON-RPC. Thin adapter layer between MCP protocol and core functions.

**Contains:** 11 files. 8 tool modules + index orchestrator + utils.

**Key files:**
- `index.ts` — Registers all 8 tool groups via `registerAllTools(server)`
- `phase-tools.ts` (18K) — Phase CRUD with GitHub integration (find, list, add, insert, complete)
- `github-tools.ts` (30K) — GitHub sync, issue create, board operations
- `todo-tools.ts` (13K) — Todo CRUD with GitHub issue sync
- `state-tools.ts` (13K) — STATE.md get/set/patch with GitHub blocker linking
- `board-tools.ts` (18K) — Project board queries, issue search, estimate setting
- `context-tools.ts` (9K) — Context loading and codebase doc access
- `roadmap-tools.ts` (4K) — Roadmap read operations
- `config-tools.ts` (3K) — Config get/set
- `utils.ts` (2K) — `detectProjectRoot()`, `mcpSuccess()`, `mcpError()`

### `packages/cli/src/github/` — GitHub Integration

**Purpose:** GitHub Issues and Projects v2 integration via `gh` CLI. Graceful degradation when GitHub is unavailable.

**Contains:** 10 files. Core `gh` CLI wrapper, issue/project CRUD, mapping persistence, sync.

**Key files:**
- `types.ts` (3K) — `GhResult<T>`, `IssueMappingFile`, `IssueStatus`, label/point constants
- `gh.ts` (10K) — `checkGhAuth()`, `detectGitHubMode()`, `ghExec()` wrapper
- `issues.ts` (23K) — Issue create, close, comment, label, parent task list update
- `projects.ts` (12K) — Project board item management, status/estimate fields
- `mapping.ts` (6K) — `.planning/github-issues.json` load/save
- `sync.ts` (11K) — Bidirectional sync check between local phases and GitHub state
- `milestones.ts` (5K) — Milestone create/close with completion detection
- `labels.ts` (2K) — Label ensure/create
- `templates.ts` (3K) — Issue body templates
- `index.ts` — Barrel re-export

### `packages/cli/src/install/` — Install Orchestration

**Purpose:** npm package installation wizard. Copies templates, hooks, and tools to the Claude Code config directory.

**Contains:** 11 files. Main installer, hook setup, dashboard handling, manifest tracking, patch preservation.

**Key files:**
- `index.ts` (22K) — Main install entry. Parses args, detects mode (global/local), interactive prompts, orchestrates copy
- `hooks.ts` (9K) — Hook file installation, `.claude/settings.json` modification, statusline toggle
- `dashboard.ts` (10K) — Dashboard subcommand routing, firewall rule, node-pty setup
- `shared.ts` (5K) — `pkg`, `templatesRoot()`, `getGlobalDir()`, skill discovery, verification
- `manifest.ts` (3K) — Install manifest (tracks installed files for update detection)
- `patches.ts` (3K) — Local customization preservation across upgrades
- `uninstall.ts` (8K) — Clean removal of all installed files
- `copy.ts` (2K) — File copy with path replacement tokens
- `adapters.ts` (1K) — Commit attribution per runtime
- `utils.ts` (2K) — Attribution processing

### `packages/cli/src/backend/` — Unified Backend Server

**Purpose:** Persistent per-project server providing HTTP API, WebSocket, MCP endpoint, and terminal management.

**Contains:** 5 files. Server, lifecycle management, terminal PTY, types.

**Key files:**
- `server.ts` (44K) — Express app, WebSocket server, MCP via StreamableHTTP, chokidar file watcher, REST API routes
- `lifecycle.ts` (5K) — Start/stop/status with lock file discovery
- `terminal.ts` (8K) — PTY session management with graceful node-pty degradation
- `types.ts` (2K) — `BackendConfig`, `BackendStatus`, `WSMessage`, `PendingQuestion`
- `index.ts` — Barrel re-export

### `packages/cli/src/hooks/` — Claude Code Hooks

**Purpose:** Runtime hooks that execute during Claude Code sessions. Compiled as standalone CJS bundles.

**Contains:** 5 files. Three hook implementations, shared utilities, test barrel.

**Key files:**
- `maxsim-statusline.ts` (4K) — Renders model + context usage bar, writes bridge file
- `maxsim-context-monitor.ts` (4K) — Reads bridge metrics, injects context warnings at thresholds
- `maxsim-check-update.ts` (3K) — Checks npm registry for newer version
- `shared.ts` (1K) — `readStdinJson()`, `CLAUDE_DIR` constant
- `index.ts` (1K) — Re-exports for unit testing (not used at runtime)

### `packages/dashboard/src/components/` — Dashboard UI Components

**Purpose:** React components organized by feature area for the web dashboard.

**Contains:** 9 subdirectories with 25+ component files.

**Key files:**
- `dashboard/` — Core dashboard panels: phase list, phase detail, plan card, blockers, todos, stats header, state editor, task list, phase progress, connection banner
- `layout/` — App shell, sidebar, project switcher
- `terminal/` — Terminal component wrapping xterm.js
- `simple-mode/` — Simplified action-oriented UI: action grid, action card, action form, first-run card, mode toggle
- `simple-mode/discussion/` — Discussion flow: question card, option card, answered card, confirmation dialog
- `providers/` — React context providers: WebSocket, discussion, simple-mode
- `editor/` — Plan editor using CodeMirror
- `network/` — QR code for mobile access

### `templates/agents/` — Agent Prompts

**Purpose:** Specialized subagent prompt definitions with structured sections (role, upstream/downstream, input validation, deferred items).

**Contains:** 15 agent `.md` files + `AGENTS.md` registry.

**Key files:**
- `maxsim-executor.md` (20K) — Plan execution with TDD and verified completion
- `maxsim-planner.md` (24K) — Plan creation with goal-backward verification
- `maxsim-debugger.md` (19K) — Systematic bug investigation
- `maxsim-drift-checker.md` (19K) — Spec-vs-code drift detection
- `maxsim-verifier.md` (15K) — Phase goal achievement verification
- `maxsim-phase-researcher.md` (12K) — Phase domain research
- `maxsim-project-researcher.md` (14K) — Project ecosystem research
- `maxsim-codebase-mapper.md` (11K) — Codebase structure analysis
- `maxsim-roadmapper.md` (12K) — Roadmap creation
- `maxsim-plan-checker.md` (13K) — Plan quality verification
- `maxsim-integration-checker.md` (11K) — Cross-component integration validation
- `maxsim-research-synthesizer.md` (10K) — Research output synthesis
- `maxsim-code-reviewer.md` (8K) — Code quality review
- `maxsim-spec-reviewer.md` (8K) — Spec compliance review
- `AGENTS.md` (7K) — Agent-to-skill registry and coherence conventions

### `templates/workflows/` — Workflow Specifications

**Purpose:** Multi-step workflow procedures that commands reference. Detailed step-by-step processes with tool invocations and decision gates.

**Contains:** 42 workflow `.md` files.

**Key files:**
- `execute-phase.md` (20K) — Wave-based parallel plan execution orchestration
- `execute-plan.md` (28K) — Single plan execution with checkpoints
- `new-project.md` (46K) — Full project initialization workflow
- `init-existing.md` (47K) — Brownfield project onboarding
- `discuss-phase.md` (26K) — Interactive phase discussion with user
- `quick.md` (17K) — Quick task execution
- `plan-phase.md` (18K) — Phase planning workflow
- `verify-work.md` (16K) — Verification workflow with gap detection
- `complete-milestone.md` (20K) — Milestone completion and archiving
- `batch.md` (13K) — Parallel batch execution strategy
- `check-drift.md` (8K) — Spec drift detection workflow
- `realign.md` (13K) — Drift realignment workflow

### `templates/skills/` — Behavioral Skills

**Purpose:** Behavioral rule sets that agents auto-load. Each skill directory contains a `SKILL.md` with `alwaysApply` or agent-triggered activation.

**Contains:** 12 skill directories.

**Key directories:** `tdd/`, `verification-before-completion/`, `systematic-debugging/`, `using-maxsim/`, `memory-management/`, `brainstorming/`, `roadmap-writing/`, `code-review/`, `maxsim-simplify/`, `sdd/`, `maxsim-batch/`

## Key File Locations

### Entry Points
- **npm install binary:** `packages/cli/src/install/index.ts` -> `dist/install.cjs`
- **CLI tools router:** `packages/cli/src/cli.ts` -> `dist/cli.cjs`
- **MCP stdio server:** `packages/cli/src/mcp-server.ts` -> `dist/mcp-server.cjs`
- **Backend server:** `packages/cli/src/backend-server.ts` -> `dist/backend-server.cjs`
- **Dashboard server:** `packages/dashboard/src/server.ts` -> `dist/server.js`
- **Dashboard client:** `packages/dashboard/src/main.tsx` -> `dist/client/`
- **Website:** `packages/website/src/main.tsx`

### Configuration
- **Workspace root:** `package.json` (npm workspaces definition)
- **CLI package:** `packages/cli/package.json` (published as `maxsimcli`)
- **Dashboard package:** `packages/dashboard/package.json` (`@maxsim/dashboard`, private)
- **TypeScript base:** `tsconfig.base.json`
- **Build config:** `packages/cli/tsdown.config.ts` (6 build targets)
- **Linter:** `biome.json`
- **Release:** `.releaserc.json` (semantic-release)
- **Git hooks:** `.husky/pre-push`

### Core Logic
- **All types:** `packages/cli/src/core/types.ts`
- **All core re-exports:** `packages/cli/src/core/index.ts`
- **Model profiles:** `MODEL_PROFILES` in `packages/cli/src/core/core.ts` (line 30)
- **Config loading:** `loadConfig()` in `packages/cli/src/core/core.ts` (line 180)
- **Phase search:** `findPhaseInternal()` in `packages/cli/src/core/core.ts` (line 376)
- **Phase lifecycle:** `packages/cli/src/core/phase.ts`
- **State operations:** `packages/cli/src/core/state.ts`
- **Context assembly:** `packages/cli/src/core/init.ts`

### Testing
- **Test directory:** `packages/cli/tests/`
- **Unit test config:** `packages/cli/vitest.config.ts`
- **E2E test config:** `packages/cli/vitest.e2e.config.ts`
- **E2E test runner:** `scripts/e2e-test.cjs`

### Build Pipeline
- **Build orchestration:** Root `package.json` scripts (`build`, `build:cli`, `build:dashboard`)
- **CLI bundler config:** `packages/cli/tsdown.config.ts`
- **Asset copy script:** `packages/cli/scripts/copy-assets.cjs`
- **Dashboard server build:** `packages/dashboard/tsdown.config.server.mts`
- **CI/CD:** `.github/workflows/publish.yml`

## Naming Conventions

### Files

- **TypeScript modules:** kebab-case (`context-loader.ts`, `board-tools.ts`, `phase-tools.ts`)
- **React components:** PascalCase for multi-word component files (`ProjectSwitcher.tsx`, `NetworkQRButton.tsx`), kebab-case for feature component files (`blockers-panel.tsx`, `phase-detail.tsx`)
- **Template markdown:** kebab-case matching command/workflow names (`execute-phase.md`, `check-drift.md`)
- **Agent prompts:** `maxsim-<role>.md` (e.g., `maxsim-executor.md`, `maxsim-planner.md`)
- **Planning docs:** UPPER-CASE with hyphens (`STATE.md`, `ROADMAP.md`, `DRIFT-REPORT.md`)
- **Config files:** lowercase (`config.json`, `biome.json`, `.releaserc.json`)
- **Build outputs:** source-matching names with `.cjs` extension (`cli.cjs`, `install.cjs`, `mcp-server.cjs`)
- **Hook files:** `maxsim-<name>.ts` → `maxsim-<name>.cjs` (e.g., `maxsim-statusline`)
- **Skill files:** `SKILL.md` inside skill-named directory

### Directories

- **Packages:** lowercase singular (`cli`, `dashboard`, `website`)
- **Source subdirectories:** lowercase singular or kebab-case (`core`, `mcp`, `github`, `hooks`, `install`, `backend`)
- **Component directories:** kebab-case by feature (`simple-mode`, `dashboard`, `layout`, `terminal`)
- **Template directories:** lowercase plural or kebab-case (`agents`, `commands`, `workflows`, `references`, `skills`)
- **Phase directories:** `<NN>-<Name>` format (e.g., `01-Foundation`, `01A-Hotfix`)
- **Skill directories:** kebab-case (`systematic-debugging`, `verification-before-completion`)

## Where to Add New Code

### New CLI Tool Command

1. Add the `cmd*` function in the appropriate core module (`packages/cli/src/core/<module>.ts`)
2. Export from `packages/cli/src/core/index.ts`
3. Import and register in the `COMMANDS` map in `packages/cli/src/cli.ts`
4. Add `Handler` function or inline handler for the command

### New MCP Tool

1. Implement handler in existing or new `packages/cli/src/mcp/<domain>-tools.ts`
2. Use `server.tool(name, description, zodSchema, handler)` pattern
3. If new file: export `register*Tools(server)`, import and call in `packages/cli/src/mcp/index.ts`
4. Use `detectProjectRoot()` + `mcpSuccess()`/`mcpError()` from `utils.ts`

### New Agent

1. Create `templates/agents/maxsim-<name>.md` following required sections (frontmatter, system map, role, upstream/downstream, input validation, deferred items)
2. Add `AgentType` to union in `packages/cli/src/core/types.ts`
3. Add model mapping row in `MODEL_PROFILES` in `packages/cli/src/core/core.ts`
4. Update `<agent_system_map>` table in ALL existing agent prompts
5. Add entry to `templates/agents/AGENTS.md` registry

### New Workflow

1. Create `templates/workflows/<name>.md` with process steps
2. Create `templates/commands/maxsim/<name>.md` referencing the workflow via `@./workflows/<name>.md`
3. If workflow needs init context: add `cmdInit<Name>` in `packages/cli/src/core/init.ts`, add workflow type to `WorkflowType` union, wire up in `handleInit` in `packages/cli/src/cli.ts`

### New Skill

1. Create directory `templates/skills/<skill-name>/`
2. Add `SKILL.md` with frontmatter (`name`, `description`, optional `alwaysApply: true`)
3. Register agent-skill mapping in `templates/agents/AGENTS.md`
4. Skill is auto-discovered by `cmdSkillList()` in `packages/cli/src/core/skills.ts`

### New Core Module

1. Create `packages/cli/src/core/<module>.ts`
2. Export public API from `packages/cli/src/core/index.ts`
3. Follow `cmd*` function pattern returning `CmdResult`
4. Import shared utilities from `./core.js` (paths, file I/O, config)

### New Dashboard Component

1. Create component in `packages/dashboard/src/components/<feature>/`
2. Use kebab-case filename for feature components
3. Import `@maxsim/core` for shared types (resolved via path alias to `../cli/src/core/`)
4. Hook into WebSocket provider for real-time updates if needed

### New GitHub Integration Feature

1. Add to existing module in `packages/cli/src/github/` or create new module
2. Export from `packages/cli/src/github/index.ts`
3. Add types to `packages/cli/src/github/types.ts`
4. Use `GhResult<T>` return type, check `detectGitHubMode()` for graceful degradation
5. Wire into MCP tools in `packages/cli/src/mcp/github-tools.ts` or relevant tool module

## Special Directories

### `dist/` (CLI package build output)

**Purpose:** Compiled CJS bundles and copied assets. Published to npm.

**Generated:** Yes, by `npm run build:cli` (tsdown + copy-assets.cjs)

**Committed:** Yes (tracked in git for the CLI package, so npm can publish without build step)

### `dist/assets/` (Bundled templates and hooks)

**Purpose:** Self-contained copy of templates, hooks, dashboard, and changelog for npm distribution.

**Generated:** Yes, by `packages/cli/scripts/copy-assets.cjs`

**Committed:** Yes (part of published package)

### `.planning/` (MAXSIM's own planning data)

**Purpose:** MAXSIM dogfoods itself. Contains codebase analysis and planning artifacts for the MAXSIM project.

**Generated:** By MAXSIM agents during development

**Committed:** Yes (planning artifacts are version-controlled)

### `node_modules/`

**Purpose:** npm workspace dependencies

**Generated:** By `npm ci` or `npm install`

**Committed:** No (gitignored)

### `packages/dashboard/dist/`

**Purpose:** Built dashboard (Vite client + bundled server.js)

**Generated:** By `npm run build:dashboard`

**Committed:** No (copied into CLI dist/assets/dashboard/ during build)
