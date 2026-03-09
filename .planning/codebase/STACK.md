# STACK.md

> Technology stack reference for MAXSIM. Updated 2026-03-09.

---

## Languages

### Primary: TypeScript

- **Version:** ~5.9.3 (workspace root and all packages)
- **Target:** ES2022
- **Module system:** NodeNext (CLI), ESNext/Bundler (dashboard client), CommonJS (dashboard server)
- **Strict mode:** Enabled globally via `tsconfig.base.json`
- **Branded types:** Use `Brand<T, B>` pattern in `packages/cli/src/core/types.ts` for `PhaseNumber`, `PhasePath`, `PhaseSlug`
- **Discriminated unions:** `Result<T>`, `CmdResult` for typed error handling without exceptions

### Secondary: JavaScript (CommonJS)

- Build scripts use `.cjs` extension: `scripts/copy-assets.cjs`, `scripts/pre-push-docs-check.cjs`, `scripts/e2e-test.cjs`
- Generated hook bundles output as `.cjs` for Node.js compatibility

### Secondary: Markdown

- 38 command specs in `templates/commands/maxsim/*.md`
- 40 workflow files in `templates/workflows/*.md`
- 15 agent prompts in `templates/agents/*.md`
- Markdown files are the "runtime" -- AI agents execute them as prompt instructions

---

## Runtime

### Environment

- **Runtime:** Node.js >= 22.0.0 (enforced in root `package.json` and `packages/cli/package.json` via `engines` field)
- **Current dev version:** v25.2.1
- **Platform:** Cross-platform (Windows, macOS, Linux). CI runs on `ubuntu-latest`.

### Package Manager

- **Manager:** npm (workspaces)
- **Lockfile:** `package-lock.json` (553KB, committed)
- **Workspace config:** Root `package.json` declares `"workspaces": ["packages/cli", "packages/dashboard", "packages/website"]`

### Monorepo Structure

| Package | Name | Published | Role |
|---------|------|-----------|------|
| `packages/cli` | `maxsimcli` | Yes (npm) | Main CLI, tools router, core logic, MCP server, backend server, hooks |
| `packages/dashboard` | `@maxsim/dashboard` | No (private) | Vite+React frontend + Express backend, bundled into CLI dist |
| `packages/website` | `@maxsim/website` | No (private) | Marketing website, deployed to GitHub Pages |

---

## Frameworks

### Core

| Framework | Version | Package | Purpose |
|-----------|---------|---------|---------|
| Express | ^4.22.1 | `packages/cli` | HTTP API server for backend and dashboard |
| ws | ^8.19.0 | `packages/cli` | WebSocket server for real-time dashboard updates |
| @modelcontextprotocol/sdk | ^1.27.1 | `packages/cli` | MCP server implementation (stdio + streamable HTTP transports) |
| zod | ^3.25.0 | `packages/cli` | Schema validation for MCP tool inputs |
| React | ^19 | `packages/dashboard` | Dashboard frontend UI |
| React DOM | ^19 | `packages/dashboard` | React rendering |

### Build & Dev

| Tool | Version | Purpose | Config File |
|------|---------|---------|-------------|
| tsdown | ^0.20.3 | TypeScript bundler (esbuild-based) | `packages/cli/tsdown.config.ts`, `packages/dashboard/tsdown.config.server.mts` |
| Vite | ^6 (dashboard), ^7.3.1 (website) | Frontend bundler and dev server | `packages/dashboard/vite.config.ts`, `packages/website/vite.config.ts` |
| @vitejs/plugin-react | ^4 (dashboard), ^5.1.1 (website) | React JSX transform for Vite | Configured in `vite.config.ts` |
| esbuild | ^0.24.0 | Underlying bundler for tsdown | Transitive dependency |

### Testing

| Tool | Version | Purpose | Config File |
|------|---------|---------|-------------|
| Vitest | ^4.0.18 | Test runner (unit + e2e) | `packages/cli/vitest.config.ts`, `packages/cli/vitest.e2e.config.ts` |

### Linting & Formatting

| Tool | Version | Purpose | Config File |
|------|---------|---------|-------------|
| Biome | ^2.4.4 | Linting only (formatter disabled) | `biome.json` |

### CSS

| Tool | Version | Purpose | Package |
|------|---------|---------|---------|
| Tailwind CSS | ^4 | Utility-first CSS | `packages/dashboard` |
| @tailwindcss/vite | ^4 | Vite plugin for Tailwind | `packages/dashboard` |
| @tailwindcss/postcss | ^4 | PostCSS plugin for Tailwind | `packages/dashboard` |
| PostCSS | ^8 | CSS processing | `packages/dashboard` |

### CI/CD & Release

| Tool | Version | Purpose |
|------|---------|---------|
| semantic-release | ^24.2.5 | Automatic versioning and npm publishing |
| @semantic-release/commit-analyzer | ^13.0.1 | Parse conventional commits for version bumps |
| @semantic-release/changelog | ^6.0.3 | Generate CHANGELOG.md |
| @semantic-release/npm | ^12.0.1 | Publish to npm registry |
| @semantic-release/git | ^10.0.1 | Commit version bumps and changelog |
| @semantic-release/github | ^11.0.1 | Create GitHub releases |
| @semantic-release/release-notes-generator | ^14.0.3 | Generate release notes |
| husky | ^9.1.7 | Git hooks manager |

---

## Key Dependencies

### Critical (runtime, shipped in npm package)

| Dependency | Version | Location | Purpose |
|------------|---------|----------|---------|
| @modelcontextprotocol/sdk | ^1.27.1 | `packages/cli` | MCP protocol server (stdio + HTTP transports) |
| express | ^4.22.1 | `packages/cli` | Backend HTTP server |
| ws | ^8.19.0 | `packages/cli` | WebSocket for real-time communication |
| zod | ^3.25.0 | `packages/cli` | Input validation for MCP tools |
| chokidar | ^4.0.3 | `packages/cli` | File system watching for `.planning/` directory |
| detect-port | ^2.1.0 | `packages/cli` | Find available ports for backend/dashboard |
| figlet | ^1.10.0 | `packages/cli` | ASCII art banner in installer |

### Infrastructure (devDependencies, used during build/install but bundled)

| Dependency | Version | Location | Purpose |
|------------|---------|----------|---------|
| chalk | ^5.6.2 | `packages/cli` | Colored terminal output in installer |
| ora | ^9.3.0 | `packages/cli` | Spinner animations in installer |
| @inquirer/prompts | ^8.3.0 | `packages/cli` | Interactive CLI prompts (select, confirm) |
| minimist | ^1.2.8 | `packages/cli` | CLI argument parsing |
| fs-extra | ^11.3.3 | `packages/cli` | Enhanced file system operations |
| simple-git | ^3.32.2 | `packages/cli` | Git operations (check-ignore, raw commands) |
| slugify | ^1.6.6 | `packages/cli` | Generate URL-safe slugs from text |
| yaml | ^2.8.2 | `packages/cli` | YAML frontmatter parsing |
| escape-string-regexp | ^5.0.0 | `packages/cli` | Safe regex escaping |

### Dashboard-Specific Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| @xterm/xterm | ^6.0.0 | Terminal emulation in browser |
| @xterm/addon-fit | ^0.11.0 | Auto-resize terminal to container |
| @xterm/addon-webgl | ^0.19.0 | WebGL-accelerated terminal rendering |
| @xterm/addon-serialize | ^0.14.0 | Serialize terminal state |
| node-pty | ^1.1.0 | Native PTY for terminal sessions (optional, graceful degradation) |
| @uiw/react-codemirror | ^4 | Code/markdown editor component |
| @codemirror/lang-markdown | ^6 | Markdown syntax for CodeMirror |
| @codemirror/theme-one-dark | ^6 | Dark theme for CodeMirror |
| motion | ^12 | Animation library (Framer Motion successor) |
| react-markdown | ^10.1.0 | Markdown rendering in React |
| sirv | ^3 | Static file server for built dashboard assets |
| open | ^10 | Open URLs in default browser |
| qrcode | ^1 | QR code generation for network mode |
| clsx | ^2 | Conditional className utility |
| tailwind-merge | ^3 | Merge Tailwind classes without conflicts |
| lodash.debounce | ^4.0.8 | Debounce utility for file watcher events |

### Website-Specific Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| @markdoc/markdoc | ^0.5.5 | Markdoc content rendering |
| lucide-react | ^0.575.0 | Icon library |
| react-helmet-async | ^2.0.5 | Document head management |
| motion | ^12.34.3 | Animations |
| vite-plugin-sitemap | ^0.8.2 | Sitemap generation |

---

## Configuration

### TypeScript Configuration Hierarchy

```
tsconfig.base.json          -- Shared: ES2022, NodeNext, strict, composite, declarationMap
  tsconfig.json             -- Root: references packages/cli only
  packages/cli/tsconfig.json        -- CLI: outDir=dist, rootDir=src
  packages/dashboard/tsconfig.json  -- Dashboard client: react-jsx, ESNext, bundler moduleResolution, path aliases
  packages/dashboard/tsconfig.server.json  -- Dashboard server: CommonJS, node moduleResolution
  packages/website/tsconfig.json    -- Website: separate config
```

### Path Aliases

| Alias | Target | Used In |
|-------|--------|---------|
| `@/*` | `./src/*` | `packages/dashboard` (tsconfig + vite) |
| `@maxsim/core` | `../cli/src/core/index.ts` | `packages/dashboard` (tsconfig + vite + tsdown) |

### Build Configuration

- **CLI build:** `tsdown` produces 6 entry bundles, all CJS format targeting ES2022 with Node platform:
  - `dist/install.cjs` -- npm install entry point (bin)
  - `dist/cli.cjs` -- Tools router
  - `dist/mcp-server.cjs` -- MCP stdio server
  - `dist/backend-server.cjs` -- Unified backend (Express + WS + MCP + terminal)
  - `dist/assets/hooks/*.cjs` -- 3 hook bundles (statusline, context-monitor, check-update)
- **Dashboard build:** Vite produces `dist/client/` (static SPA), tsdown produces `dist/server.cjs` (renamed to `dist/server.js`)
- **Copy-assets step:** Copies templates, dashboard build, CHANGELOG, README into `dist/assets/`
- **Banner:** All CLI bundles include `#!/usr/bin/env node` shebang
- **Sourcemaps:** Enabled for all bundles
- **DTS:** Disabled (set to `false` to avoid OOM during build)
- **Memory:** Build uses `NODE_OPTIONS=--max-old-space-size=8192` for CLI builds

### Bundling Strategy

| Bundle | External | Inlined (noExternal) |
|--------|----------|---------------------|
| `install.cjs` | `node:*` | Everything else (chalk, figlet, ora, inquirer, fs-extra, minimist) |
| `cli.cjs` | `node:*` | Everything else (simple-git, slugify, yaml, escape-string-regexp) |
| `mcp-server.cjs` | `node:*` | `@modelcontextprotocol/*`, `zod` |
| `backend-server.cjs` | `node:*`, `node-pty` | `@modelcontextprotocol/*`, `zod`, `express`, `ws`, `chokidar`, `detect-port` |
| Dashboard `server.js` | `node-pty` | Everything else (express, sirv, ws, chokidar, detect-port, open, @maxsim/core, zod) |

### Biome Configuration (`biome.json`)

- **Linting:** Enabled with `recommended: false` (minimal rule set)
- **Formatting:** Disabled
- **File scope:** `packages/*/src/**/*.ts`, `packages/*/src/**/*.tsx`, `scripts/**/*.cjs`
- **VCS:** Git-aware, respects `.gitignore`

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `MAXSIM_PORT` | Backend server port | `3142` |
| `MAXSIM_PROJECT_CWD` | Project working directory for backend | `process.cwd()` |
| `MAXSIM_NETWORK_MODE` | Enable network access to dashboard | `0` (disabled) |
| `MAXSIM_DEBUG` | Enable debug logging to stderr | Not set |
| `STANDALONE_BUILD` | CI flag for build | Not set |
| `NPM_TOKEN` | npm registry auth (CI only) | Secret |
| `GITHUB_TOKEN` | GitHub API auth (CI only) | Secret |
| `HUSKY` | Disable husky hooks in CI | Set to `'0'` in CI |

### Semantic Release Configuration (`.releaserc.json`)

- **Branch:** `main` only
- **Plugins (in order):** commit-analyzer, release-notes-generator, changelog, npm (pkgRoot: `packages/cli`), git (commits changelog + package.json), github
- **Conventional commits:** `fix:` = patch, `feat:` = minor, `feat!:`/`fix!:` = major, `chore:`/`docs:`/`test:` = no release

---

## Platform Requirements

### Development

- Node.js >= 22.0.0
- npm (included with Node.js)
- Git (for husky hooks, simple-git operations)
- `gh` CLI (optional, for GitHub Issues integration -- graceful degradation if absent)
- `node-pty` native addon (optional, for terminal in dashboard -- graceful degradation if unavailable)

### Production (End User)

- Node.js >= 22.0.0 (for `npx maxsimcli@latest`)
- Claude Code, OpenCode, Gemini CLI, or Codex (AI runtime that executes the installed markdown prompts)
- Git (most workflows depend on git operations)
- `gh` CLI (optional, for GitHub Issues features)

### CI/CD

- GitHub Actions (`ubuntu-latest`)
- Node.js 22 (via `actions/setup-node@v4`)
- npm registry access (NPM_TOKEN secret)
- GitHub token (GITHUB_TOKEN secret)

---

## Git Hooks

### Pre-push (``.husky/pre-push``)

Runs sequentially before every push:
1. `npm run build` -- Full monorepo build
2. `npm run lint` -- Biome lint check
3. `node scripts/pre-push-docs-check.cjs` -- Documentation consistency check
4. `npm test` -- Unit tests

---

## npm Package Output

The published `maxsimcli` package contains:
- `dist/install.cjs` -- Entry point (bin)
- `dist/cli.cjs` -- Tools router
- `dist/mcp-server.cjs` -- MCP server
- `dist/backend-server.cjs` -- Backend server
- `dist/assets/` -- Templates (commands, workflows, agents), hooks, dashboard, changelog, README
- `README.md` -- Auto-copied from repo root at prepublish time

Current version: 4.6.0
