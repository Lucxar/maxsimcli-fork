import { defineConfig } from 'tsdown';

const shared = {
  format: 'cjs' as const,
  platform: 'node' as const,
  target: 'es2022' as const,
  banner: { js: '#!/usr/bin/env node' },
  dts: false,
  sourcemap: true,
  tsconfig: 'tsconfig.json',
  external: [/^node:/],
  inlineOnly: false,
};

const hookShared = {
  format: 'cjs' as const,
  platform: 'node' as const,
  target: 'es2022' as const,
  sourcemap: true,
  tsconfig: 'tsconfig.json',
  external: [/^node:/],
  outDir: 'dist/assets/hooks',
  inlineOnly: false,
};

export default defineConfig([
  {
    ...shared,
    entry: { install: 'src/install/index.ts' },
    clean: true,
  },
  {
    ...shared,
    entry: { cli: 'src/cli.ts' },
    noExternal: [/^@octokit/],
  },
  {
    ...shared,
    entry: { 'mcp-server': 'src/mcp-server.ts' },
    noExternal: [/^@modelcontextprotocol/, /^zod/, /^@octokit/],
  },
  // Hooks — compiled as standalone bundles into dist/assets/hooks/
  {
    ...hookShared,
    entry: { 'maxsim-check-update': 'src/hooks/maxsim-check-update.ts' },
    dts: false,
  },
  {
    ...hookShared,
    entry: { 'maxsim-statusline': 'src/hooks/maxsim-statusline.ts' },
    dts: false,
  },
]);
