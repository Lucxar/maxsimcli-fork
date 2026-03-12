/**
 * Install utility tests.
 *
 * Verifies base utilities that were inlined from the former adapters/base.ts
 * into install/utils.ts and install/shared.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  expandTilde,
  processAttribution,
  buildHookCommand,
  readSettings,
  writeSettings,
} from '../../src/install/utils.js';

// shared.ts has module-level side effects (reads package.json via __dirname which
// doesn't resolve in test context). Mock fs-extra and intercept the readFileSync call.
vi.mock('fs-extra', () => ({ default: {}, ensureDirSync: vi.fn(), copySync: vi.fn() }));
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  const origReadFileSync = actual.readFileSync;
  return {
    ...actual,
    default: {
      ...actual,
      readFileSync: (p: any, ...args: any[]) => {
        if (typeof p === 'string' && p.endsWith('package.json')) {
          return JSON.stringify({ version: '0.0.0-test' });
        }
        return origReadFileSync(p, ...args);
      },
    },
    readFileSync: (p: any, ...args: any[]) => {
      if (typeof p === 'string' && p.endsWith('package.json')) {
        return JSON.stringify({ version: '0.0.0-test' });
      }
      return origReadFileSync(p, ...args);
    },
  };
});

import {
  getGlobalDir,
  getDirName,
} from '../../src/install/shared.js';

// --- Base utilities (install/utils.ts) ---

describe('expandTilde', () => {
  it('expands ~/path to homedir/path', () => {
    const result = expandTilde('~/foo/bar');
    expect(result).toBe(path.join(os.homedir(), 'foo/bar'));
  });

  it('returns non-tilde paths unchanged', () => {
    expect(expandTilde('/absolute/path')).toBe('/absolute/path');
    expect(expandTilde('relative/path')).toBe('relative/path');
  });

  it('returns empty string unchanged', () => {
    expect(expandTilde('')).toBe('');
  });

  it('does not expand tilde in the middle of a path', () => {
    expect(expandTilde('/some/~/path')).toBe('/some/~/path');
  });
});

describe('processAttribution', () => {
  const content = 'Some commit message\n\nCo-Authored-By: Claude <noreply@anthropic.com>';

  it('removes Co-Authored-By lines when attribution is null', () => {
    const result = processAttribution(content, null);
    expect(result).toBe('Some commit message');
    expect(result).not.toContain('Co-Authored-By');
  });

  it('keeps content unchanged when attribution is undefined', () => {
    const result = processAttribution(content, undefined);
    expect(result).toBe(content);
  });

  it('replaces Co-Authored-By name when attribution is a string', () => {
    const result = processAttribution(content, 'Custom Author <custom@example.com>');
    expect(result).toContain('Co-Authored-By: Custom Author <custom@example.com>');
    expect(result).not.toContain('Claude');
  });

  it('handles content without Co-Authored-By lines gracefully', () => {
    const plain = 'No attribution here';
    expect(processAttribution(plain, null)).toBe(plain);
    expect(processAttribution(plain, undefined)).toBe(plain);
    expect(processAttribution(plain, 'Someone')).toBe(plain);
  });
});

describe('buildHookCommand', () => {
  it('constructs a node command with forward slashes', () => {
    const result = buildHookCommand('/home/user/.claude', 'statusline.cjs');
    expect(result).toBe('node "/home/user/.claude/hooks/statusline.cjs"');
  });

  it('converts backslashes to forward slashes', () => {
    const result = buildHookCommand('C:\\Users\\me\\.claude', 'hook.cjs');
    expect(result).toBe('node "C:/Users/me/.claude/hooks/hook.cjs"');
  });
});

describe('readSettings / writeSettings', () => {
  let tmpDir: string;
  let settingsPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maxsim-test-'));
    settingsPath = path.join(tmpDir, 'settings.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('readSettings returns empty object for non-existent file', () => {
    expect(readSettings(settingsPath)).toEqual({});
  });

  it('writeSettings creates a JSON file and readSettings reads it back', () => {
    const data = { key: 'value', nested: { a: 1 } };
    writeSettings(settingsPath, data);
    const result = readSettings(settingsPath);
    expect(result).toEqual(data);
  });

  it('readSettings returns empty object for invalid JSON', () => {
    fs.writeFileSync(settingsPath, 'not json');
    expect(readSettings(settingsPath)).toEqual({});
  });

  it('writeSettings formats JSON with 2-space indent and trailing newline', () => {
    writeSettings(settingsPath, { a: 1 });
    const raw = fs.readFileSync(settingsPath, 'utf8');
    expect(raw).toBe('{\n  "a": 1\n}\n');
  });
});

// --- Inlined shared functions (install/shared.ts) ---

describe('getGlobalDir', () => {
  const originalEnv = process.env.CLAUDE_CONFIG_DIR;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR;
    } else {
      process.env.CLAUDE_CONFIG_DIR = originalEnv;
    }
  });

  it('returns explicit dir when provided', () => {
    const result = getGlobalDir('/explicit/dir');
    expect(result).toBe('/explicit/dir');
  });

  it('expands tilde in explicit dir', () => {
    const result = getGlobalDir('~/myconfig');
    expect(result).toBe(path.join(os.homedir(), 'myconfig'));
  });

  it('falls back to CLAUDE_CONFIG_DIR env var', () => {
    process.env.CLAUDE_CONFIG_DIR = '/from/env';
    const result = getGlobalDir();
    expect(result).toBe('/from/env');
  });

  it('defaults to ~/.claude when no explicit dir or env var', () => {
    delete process.env.CLAUDE_CONFIG_DIR;
    const result = getGlobalDir();
    expect(result).toBe(path.join(os.homedir(), '.claude'));
  });
});

describe('getDirName', () => {
  it('returns .claude', () => {
    expect(getDirName()).toBe('.claude');
  });
});
