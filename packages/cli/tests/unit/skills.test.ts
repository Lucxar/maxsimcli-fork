/**
 * Unit tests for skills.ts — CmdResult pattern
 *
 * Validates that cmdSkillList, cmdSkillInstall, and cmdSkillUpdate
 * return CmdResult objects instead of throwing via output()/error().
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { cmdSkillList, cmdSkillInstall, cmdSkillUpdate } from '../../src/core/skills.js';

// ─── cmdSkillList ─────────────────────────────────────────────────────────────

describe('cmdSkillList', () => {
  it('returns ok with empty skills when .claude/skills/ does not exist', () => {
    const fakeCwd = path.join(os.tmpdir(), `maxsim-test-skill-list-none-${Date.now()}`);
    const result = cmdSkillList(fakeCwd);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.result as { skills: unknown[]; count: number };
      expect(data.skills).toEqual([]);
      expect(data.count).toBe(0);
    }
  });

  it('returns ok with skill entries when directory has subdirs with SKILL.md files', () => {
    const fakeCwd = path.join(os.tmpdir(), `maxsim-test-skill-list-found-${Date.now()}`);
    const skillDir = path.join(fakeCwd, '.claude', 'skills', 'my-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: My Skill\ndescription: A test skill\n---\n# My Skill',
      'utf-8',
    );

    const result = cmdSkillList(fakeCwd);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.result as { skills: Array<{ name: string; description: string }>; count: number };
      expect(data.count).toBe(1);
      expect(data.skills[0].name).toBe('My Skill');
      expect(data.skills[0].description).toBe('A test skill');
    }

    fs.rmSync(fakeCwd, { recursive: true, force: true });
  });
});

// ─── builtInSkills sync guard ─────────────────────────────────────────────────

describe('builtInSkills sync guard', () => {
  // Resolve repo root from test location
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const skillsDir = path.join(repoRoot, 'templates', 'skills');
  const sharedPath = path.join(repoRoot, 'packages', 'cli', 'src', 'install', 'shared.ts');

  // Parse builtInSkills from source to avoid module-level side effects
  function parseBuiltInSkills(): string[] {
    const src = fs.readFileSync(sharedPath, 'utf-8');
    const match = src.match(/builtInSkills\s*=\s*\[([\s\S]*?)\]/);
    if (!match) throw new Error('builtInSkills not found in shared.ts');
    return (match[1].match(/'([^']+)'/g) || []).map(s => s.replace(/'/g, ''));
  }

  it('builtInSkills matches templates/skills/ directory contents', () => {
    const skills = parseBuiltInSkills();
    const dirs = fs.readdirSync(skillsDir).filter((d: string) =>
      fs.statSync(path.join(skillsDir, d)).isDirectory(),
    );

    expect(skills.sort()).toEqual(dirs.sort());
    expect(skills.length).toBe(dirs.length);
  });

  it('includes renamed skills and excludes old names', () => {
    const skills = parseBuiltInSkills();

    expect(skills).toContain('maxsim-simplify');
    expect(skills).toContain('maxsim-batch');
    expect(skills).not.toContain('simplify');
    expect(skills).not.toContain('batch-worktree');
  });
});

// ─── cmdSkillInstall ──────────────────────────────────────────────────────────

describe('cmdSkillInstall', () => {
  it('returns err when skillName is undefined', () => {
    const fakeCwd = path.join(os.tmpdir(), `maxsim-test-skill-install-noname-${Date.now()}`);
    const result = cmdSkillInstall(fakeCwd, undefined);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('skill name required');
    }
  });

  it('returns err when skill template does not exist', () => {
    const fakeCwd = path.join(os.tmpdir(), `maxsim-test-skill-install-missing-${Date.now()}`);
    const result = cmdSkillInstall(fakeCwd, 'nonexistent-skill');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('not found in templates');
    }
  });
});

// ─── cmdSkillUpdate ───────────────────────────────────────────────────────────

describe('cmdSkillUpdate', () => {
  it('returns ok with empty arrays when no skills directory (update all)', () => {
    const fakeCwd = path.join(os.tmpdir(), `maxsim-test-skill-update-none-${Date.now()}`);
    const result = cmdSkillUpdate(fakeCwd, undefined);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.result as { updated: string[]; skipped: string[]; not_found: string[] };
      expect(data.updated).toEqual([]);
      expect(data.skipped).toEqual([]);
    }
  });

  it('returns err when single skill not installed', () => {
    const fakeCwd = path.join(os.tmpdir(), `maxsim-test-skill-update-notinst-${Date.now()}`);
    const result = cmdSkillUpdate(fakeCwd, 'nonexistent-skill');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Could be "not found" (template missing) or "not installed"
      expect(result.error).toBeTruthy();
    }
  });
});
