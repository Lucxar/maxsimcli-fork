# Technology Stack

**Date:** 2026-03-03

## Languages

### Primary
- **TypeScript** 5.9.3: All source code in `packages/cli/src/`, `packages/dashboard/src/`, `packages/website/src/`
- **JavaScript** (Node.js): Target ES2022 for Node 22+ environments

### Secondary
- **HTML/CSS**: Dashboard UI via React + Tailwind CSS
- **YAML**: Frontmatter in markdown files and configuration

## Runtime & Environment

### Node.js
- **Minimum version:** 22.0.0
- **Requirement:** Specified in `package.json` engines field for all packages
- **Target:** ES2022 in `tsconfig.base.json`
- **Platform:** Cross-platform (Windows, macOS, Linux)

### Package Manager
- **npm**: npm workspaces (not pnpm or Yarn)
- **Lockfile:** `package-lock.json` (v3 lockfile format)
- **Monorepo:** 3 npm workspaces in `packages/`

## Frameworks & Core Libraries

### CLI Core (packages/cli)
- **Framework:** Node.js HTTP servers (Express via dashboard, native for MCP)
- **Express:** 4.22.1 (HTTP server for dashboard backend)
- **Model Context Protocol (MCP):** `@modelcontextprotocol/sdk` 1.27.1 (server implementation)
- **WebSockets:** `ws` 8.19.0 (real-time communication with dashboard)
- **File watching:** `chokidar` 4.0.3 (monitor `.planning/` directory changes)
- **Port detection:** `detect-port` 2.1.0 (dynamic port allocation)
- **YAML parsing:** `yaml` 2.8.2 (FRONTMATTER parsing in STATE.md, etc.)

### Dashboard (packages/dashboard)
- **Frontend:** React 19 + Vite 6 (client SPA bundled to `dist/client/`)
- **Styling:** Tailwind CSS 4 (via `@tailwindcss/vite`)
- **Code editor:** CodeMirror 6 with markdown language support (`@codemirror/lang-markdown`)
- **Terminal emulation:** xterm.js 6.0.0 (`@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-webgl`)
- **Backend:** Express 4 + Node.js http server + MCP server, bundled as single `dist/server.js`
- **PTY (pseudo-terminal):** `node-pty` 1.1.0 (shell process management)
- **Real-time updates:** WebSockets (`ws`) + Chokidar for file watching
- **Process launcher:** `open` 10 (cross-platform process opening)
- **QR codes:** `qrcode` 1 (network access QR generation)

### Website (packages/website)
- **Framework:** React 19 + Vite 7.3.1
- **Styling:** Tailwind CSS 4
- **Helmet:** `react-helmet-async` 2.0.5 (meta tag management)
- **Icons:** `lucide-react` 0.575.0

### Shared Libraries
- **Zod:** 3.25.0 (schema validation, used in CLI core)
- **Slugification:** `slugify` 1.6.6 (normalize file/directory names)
- **Utilities:** `fs-extra` 11.3.3 (enhanced file operations), `minimist` 1.2.8 (CLI argument parsing)
- **CLI output:** `chalk` 5.6.2 (colored terminal output), `ora` 9.3.0 (spinners), `figlet` 1.10.0 (ASCII art)
- **Prompts:** `@inquirer/prompts` 8.3.0 (interactive terminal prompts)
- **Animation:** `motion` 12 (React component animations)
- **Git operations:** `simple-git` 3.32.2 (programmatic git commands)
- **Markdown rendering:** `react-markdown` 10.1.0 (parse/render markdown in UI)
- **Debouncing:** `lodash.debounce` 4.0.8 (rate-limit event handlers)
- **Class merging:** `clsx` 2, `tailwind-merge` 3 (Tailwind CSS utilities)
- **Static file serving:** `sirv` 3 (lightweight static asset server)

## Build & Bundling

### Bundlers
- **tsdown** 0.20.3: Bundles TypeScript → CommonJS for Node.js targets
  - CLI entry: `packages/cli/src/cli.ts` → `dist/cli.cjs`
  - Installer: `packages/cli/src/install.ts` → `dist/install.cjs`
  - Dashboard server: `packages/dashboard/src/server.ts` → `dist/server.js` (with `noExternal` inlining all deps)
  - Hooks: `packages/cli/src/hooks/*.ts` → `dist/assets/hooks/*.cjs`

- **Vite** 6.x / 7.3.1: Bundles React frontends
  - Dashboard client: `packages/dashboard/src/main.tsx` → `dist/client/`
  - Website: `packages/website/src/main.tsx` → `dist/`

### Build Pipeline
1. Dashboard: Vite bundles client to `packages/dashboard/dist/client/`, tsdown bundles server to `packages/dashboard/dist/server.js`
2. CLI: tsdown bundles `src/cli.ts` and `src/install.ts` to `.cjs`, builds hooks
3. Copy assets: `packages/cli/scripts/copy-assets.cjs` copies templates, dashboard build, hooks, CHANGELOG, README into `packages/cli/dist/assets/`
4. Result: `packages/cli/dist/` contains complete, self-contained npm package

### Build Commands
```bash
npm run build          # Full build (dashboard + cli + assets)
npm run build:cli      # CLI only (tsdown + copy-assets)
npm run build:dashboard # Dashboard only (vite + tsdown server)
```

## Testing

### Test Runner
- **Vitest** 4.0.18: Unit and e2e test execution
- **Configuration:**
  - Unit tests: `packages/cli/vitest.config.ts` (excludes e2e tests)
  - E2E tests: `packages/cli/vitest.e2e.config.ts` (60s timeout, hooks-based setup)
  - Global setup: `packages/cli/tests/e2e/globalSetup.ts`

### Test Organization
- **Unit tests:** `packages/cli/tests/unit/` (e.g., `pack.test.ts`)
- **E2E tests:** `packages/cli/tests/e2e/` (install, tools, dashboard integration)

### Test Commands
```bash
npm test              # Run unit tests
npm run e2e           # Run e2e tests
```

## Code Quality & Linting

### Linter
- **Biome** 2.4.4: JavaScript/TypeScript linting and formatting checks
- **Config file:** `biome.json`
- **Scope:** `packages/*/src/**/*.ts`, `packages/*/src/**/*.tsx`, `scripts/**/*.cjs`
- **Rules:** VCS-aware (uses `.gitignore`), custom linting rules
- **Format disabled:** Formatting not enforced (eslint-like linting only)

### Linting Command
```bash
npm run lint
```

## Version Control & Release

### Git Hooks
- **Husky** 9.1.7: Git hook management
- **Pre-push:** Verify build succeeds before pushing (mandatory for main)

### Semantic Versioning
- **semantic-release** 24.2.5: Automated version bumping and npm publishing
- **Plugins:**
  - `@semantic-release/commit-analyzer`: Parse conventional commits (feat, fix, etc.)
  - `@semantic-release/changelog`: Update CHANGELOG.md
  - `@semantic-release/npm`: Publish to npm (CLI package only)
  - `@semantic-release/git`: Create git tags and commits
  - `@semantic-release/github`: Create GitHub releases
- **Version mapping:**
  - `feat:` → minor version bump
  - `fix:` → patch version bump
  - `fix!:` / `feat!:` → major version bump (breaking change)
  - `chore:`, `docs:`, `test:` → no publish

### Release Config
- **File:** `.releaserc.json`
- **Trigger:** Automatic on every push to `main`
- **Artifacts:** Updated `CHANGELOG.md`, `packages/cli/package.json`, git tags

## Configuration Files

### TypeScript
- **Base config:** `tsconfig.base.json` (ES2022, strict mode, Node.js module resolution)
- **Root config:** `tsconfig.json` (extends base)
- **Package configs:**
  - `packages/cli/tsconfig.json`: Excludes tests, outputs to `dist/`
  - `packages/dashboard/tsconfig.server.json`: For server bundling
  - `packages/website/tsconfig.app.json`: ESNext modules, strict JSX

### Build Tools
- **tsdown.config.cli.mts** (implicit): CLI bundling config
- **packages/dashboard/tsdown.config.server.mts**: Server bundling with `noExternal` (all deps inlined)
- **packages/dashboard/vite.config.ts**: Client bundling config with alias `@maxsim/core` → `../cli/src/core/`
- **packages/website/vite.config.ts**: Website bundling

## Environment Variables

### CLI Runtime
- `CLAUDE_CONFIG_DIR`: Override Claude Code config directory (adapter)
- `MAXSIM_DEBUG`: Enable debug logging in `core.ts`
- `MAXSIM_PORT`: Dashboard port (default 3333, auto-detected if occupied)
- `MAXSIM_PROJECT_CWD`: Project working directory for dashboard (default current dir)
- `MAXSIM_NETWORK_MODE`: Enable network-accessible dashboard (env var check for '1')
- `BRAVE_API_KEY`: Optional Brave Search API key (fallback to file in user config)
- `STANDALONE_BUILD`: Set in CI/CD to enable standalone build mode

### Git/CI
- `NODE_AUTH_TOKEN`: npm registry authentication (set in CI/CD)
- `GITHUB_TOKEN`: GitHub API access (semantic-release)
- `NPM_TOKEN`: npm registry publish token (semantic-release)
- `HUSKY`: Disable hooks in CI (set to '0' in semantic-release)

## Platform Requirements

### Development
- **Node.js:** 22.0.0 or higher
- **npm:** Included with Node.js 22
- **Git:** For version control and semantic-release
- **Supported OS:** Windows 11 Pro, macOS, Linux

### Production (User Installation)
- **Node.js:** 22.0.0 or higher
- **npm:** Included with Node.js 22
- **Supported OS:** Any OS where Node.js 22 runs
- **Delivery:** npm package (`maxsimcli` published to registry)
- **Installation:** `npx maxsimcli@latest` (automatic)

## Deployment & Distribution

### npm Package
- **Package name:** `maxsimcli`
- **Current version:** 4.2.0
- **Registry:** npmjs.org
- **Binary:** `dist/install.cjs` (entry point via `bin.maxsimcli`)
- **Main export:** `dist/cli.cjs` (tools router)
- **Assets included:**
  - Templates: `dist/assets/templates/`
  - Dashboard: `dist/assets/dashboard/` (client + bundled server)
  - Hooks: `dist/assets/hooks/`
  - CHANGELOG: `dist/assets/CHANGELOG.md`

### GitHub Pages
- **Website:** Deployed to GitHub Pages on every push to `main`
- **Source:** `packages/website/dist/`
- **Workflow:** `.github/workflows/deploy-website.yml`

### CI/CD Pipeline
- **Trigger:** Every push to `main` and manual dispatch
- **Jobs:** build-and-test → e2e → release (sequential)
- **Node version:** 22 (pinned in workflows)
- **Build env:** `STANDALONE_BUILD=true` for full builds
