/**
 * Skills — List, install, and update skill templates
 *
 * Skills are installed to `.claude/skills/<name>/SKILL.md`.
 * Source templates live in `templates/skills/<name>/SKILL.md`.
 */
/**
 * List all installed skills from `.claude/skills/`.
 */
export declare function cmdSkillList(cwd: string, raw: boolean): void;
/**
 * Install a specific skill from the templates directory.
 */
export declare function cmdSkillInstall(cwd: string, skillName: string | undefined, raw: boolean): void;
/**
 * Update one or all installed skills from the templates source.
 */
export declare function cmdSkillUpdate(cwd: string, skillName: string | undefined, raw: boolean): void;
//# sourceMappingURL=skills.d.ts.map