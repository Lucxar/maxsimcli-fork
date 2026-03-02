"use strict";
/**
 * Skills — List, install, and update skill templates
 *
 * Skills are installed to `.claude/skills/<name>/SKILL.md`.
 * Source templates live in `templates/skills/<name>/SKILL.md`.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cmdSkillList = cmdSkillList;
exports.cmdSkillInstall = cmdSkillInstall;
exports.cmdSkillUpdate = cmdSkillUpdate;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const core_js_1 = require("./core.js");
const frontmatter_js_1 = require("./frontmatter.js");
// ─── Internal helpers ────────────────────────────────────────────────────────
/**
 * Resolve the installed skills directory for the current project.
 * Skills live at `.claude/skills/` relative to cwd.
 */
function skillsDir(cwd) {
    return node_path_1.default.join(cwd, '.claude', 'skills');
}
/**
 * Resolve the templates source directory for skills.
 * At runtime (from dist/cli.cjs), templates are bundled at dist/assets/templates/skills/.
 */
function skillsTemplateDir() {
    return node_path_1.default.resolve(__dirname, 'assets', 'templates', 'skills');
}
/**
 * Read a single skill's metadata from its SKILL.md frontmatter.
 */
function readSkillInfo(skillDir, dirName) {
    const skillMd = node_path_1.default.join(skillDir, 'SKILL.md');
    const content = (0, core_js_1.safeReadFile)(skillMd);
    if (!content)
        return null;
    const fm = (0, frontmatter_js_1.extractFrontmatter)(content);
    return {
        name: fm.name ?? dirName,
        description: fm.description ?? '',
        directory: dirName,
    };
}
// ─── Commands ────────────────────────────────────────────────────────────────
/**
 * List all installed skills from `.claude/skills/`.
 */
function cmdSkillList(cwd, raw) {
    const dir = skillsDir(cwd);
    if (!node_fs_1.default.existsSync(dir)) {
        (0, core_js_1.output)({ skills: [], count: 0 }, raw, 'No skills installed.');
    }
    const entries = node_fs_1.default.readdirSync(dir, { withFileTypes: true });
    const skills = [];
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        const info = readSkillInfo(node_path_1.default.join(dir, entry.name), entry.name);
        if (info)
            skills.push(info);
    }
    (0, core_js_1.output)({ skills, count: skills.length }, raw, skills.map(s => `${s.name}: ${s.description}`).join('\n'));
}
/**
 * Install a specific skill from the templates directory.
 */
function cmdSkillInstall(cwd, skillName, raw) {
    if (!skillName) {
        (0, core_js_1.error)('skill name required. Usage: skill-install <name>');
    }
    const srcFile = node_path_1.default.join(skillsTemplateDir(), skillName, 'SKILL.md');
    if (!node_fs_1.default.existsSync(srcFile)) {
        // List available skills for a helpful error
        const available = listAvailableTemplates();
        (0, core_js_1.error)(`Skill "${skillName}" not found in templates. Available: ${available.join(', ')}`);
    }
    const destDir = node_path_1.default.join(skillsDir(cwd), skillName);
    const destFile = node_path_1.default.join(destDir, 'SKILL.md');
    node_fs_1.default.mkdirSync(destDir, { recursive: true });
    node_fs_1.default.copyFileSync(srcFile, destFile);
    (0, core_js_1.output)({ installed: true, skill: skillName, path: node_path_1.default.relative(cwd, destFile) }, raw, `Installed skill: ${skillName}`);
}
/**
 * Update one or all installed skills from the templates source.
 */
function cmdSkillUpdate(cwd, skillName, raw) {
    const dir = skillsDir(cwd);
    const templateDir = skillsTemplateDir();
    if (skillName) {
        // Update a single skill
        const srcFile = node_path_1.default.join(templateDir, skillName, 'SKILL.md');
        if (!node_fs_1.default.existsSync(srcFile)) {
            (0, core_js_1.error)(`Skill template "${skillName}" not found.`);
        }
        const destDir = node_path_1.default.join(dir, skillName);
        if (!node_fs_1.default.existsSync(destDir)) {
            (0, core_js_1.error)(`Skill "${skillName}" is not installed. Use skill-install first.`);
        }
        const destFile = node_path_1.default.join(destDir, 'SKILL.md');
        node_fs_1.default.copyFileSync(srcFile, destFile);
        (0, core_js_1.output)({ updated: [skillName], skipped: [], not_found: [] }, raw, `Updated skill: ${skillName}`);
        return;
    }
    // Update all installed skills
    if (!node_fs_1.default.existsSync(dir)) {
        (0, core_js_1.output)({ updated: [], skipped: [], not_found: [] }, raw, 'No skills installed.');
        return;
    }
    const entries = node_fs_1.default.readdirSync(dir, { withFileTypes: true });
    const updated = [];
    const skipped = [];
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        const name = entry.name;
        const srcFile = node_path_1.default.join(templateDir, name, 'SKILL.md');
        if (!node_fs_1.default.existsSync(srcFile)) {
            // Custom/user skill — no template to update from
            skipped.push(name);
            continue;
        }
        const destFile = node_path_1.default.join(dir, name, 'SKILL.md');
        node_fs_1.default.copyFileSync(srcFile, destFile);
        updated.push(name);
    }
    const summary = updated.length > 0
        ? `Updated ${updated.length} skill(s): ${updated.join(', ')}`
        : 'No skills updated.';
    (0, core_js_1.output)({ updated, skipped }, raw, summary);
}
// ─── Helpers ──────────────────────────────────────────────────────────────────
function listAvailableTemplates() {
    const dir = skillsTemplateDir();
    if (!node_fs_1.default.existsSync(dir))
        return [];
    return node_fs_1.default.readdirSync(dir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name);
}
//# sourceMappingURL=skills.js.map