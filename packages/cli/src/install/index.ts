import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import fsExtra from 'fs-extra';

import chalk from 'chalk';
import figlet from 'figlet';
import ora from 'ora';
import { confirm } from '@inquirer/prompts';
import minimist from 'minimist';

import {
  processAttribution,
} from './utils.js';
import {
  pkg,
  templatesRoot,
  getDirName,
  verifyInstalled,
  verifyFileInstalled,
  builtInSkills,
  verifyInstallComplete,
} from './shared.js';
import type { InstallResult } from './shared.js';
import { getCommitAttribution } from './adapters.js';
import {
  cleanupOrphanedFiles,
  installHookFiles,
  configureSettingsHooks,
  handleStatusline,
  finishInstall,
} from './hooks.js';
import { writeManifest, readManifest, MANIFEST_NAME } from './manifest.js';
import { saveLocalPatches, reportLocalPatches } from './patches.js';
import {
  copyWithPathReplacement,
} from './copy.js';
import { uninstall } from './uninstall.js';

// Parse args
const args = process.argv.slice(2);
const argv = minimist(args, {
  boolean: ['local', 'claude', 'uninstall', 'help', 'version', 'force-statusline', 'network'],
  string: ['config-dir'],
  alias: { l: 'local', u: 'uninstall', h: 'help', c: 'config-dir' },
});
const hasLocal = !!argv['local'];
const hasUninstall = !!argv['uninstall'];

const banner =
  '\n' +
  chalk.cyan(
    figlet.textSync('MAXSIM', { font: 'ANSI Shadow' })
      .split('\n')
      .map((line) => '  ' + line)
      .join('\n'),
  ) +
  '\n' +
  '\n' +
  '  MAXSIM ' +
  chalk.dim('v' + pkg.version) +
  '\n' +
  '  A meta-prompting, context engineering and spec-driven\n' +
  '  development system for Claude Code.\n';

// Parse --config-dir argument
const explicitConfigDir: string | null = argv['config-dir'] || null;
const hasHelp = !!argv['help'];
const hasVersion = !!argv['version'];
const forceStatusline = !!argv['force-statusline'];

// Reject deprecated multi-runtime flags
const deprecatedFlags = ['opencode', 'gemini', 'codex', 'both', 'all'] as const;
for (const flag of deprecatedFlags) {
  if (argv[flag]) {
    console.error(`Error: The --${flag} flag is no longer supported. MAXSIM v2.0 is Claude Code only.`);
    process.exit(1);
  }
}

// Reject --global flag (no longer supported in v5.0+)
if (argv['global'] || argv['g']) {
  console.error(chalk.red('Error: Global install is no longer supported.'));
  console.error('MAXSIM v5.0+ installs locally to .claude/ in your project directory.');
  console.error('Run: npx maxsimcli --local');
  process.exit(1);
}

// Show version if requested (before banner for clean output)
if (hasVersion) {
  console.log(pkg.version);
  process.exit(0);
}

console.log(banner);

// Show help if requested
if (hasHelp) {
  console.log(
    `  ${chalk.yellow('Usage:')} npx maxsimcli [options]\n\n  ${chalk.yellow('Options:')}\n    ${chalk.cyan('-l, --local')}               Install to current project directory (default)\n    ${chalk.cyan('-u, --uninstall')}           Uninstall MAXSIM (remove all MAXSIM files)\n    ${chalk.cyan('-c, --config-dir <path>')}   Specify custom local directory name\n    ${chalk.cyan('-h, --help')}                Show this help message\n    ${chalk.cyan('--force-statusline')}        Replace existing statusline config\n\n  ${chalk.yellow('Examples:')}\n    ${chalk.dim('# Install to current project')}\n    npx maxsimcli\n\n    ${chalk.dim('# Explicit local install')}\n    npx maxsimcli --local\n\n    ${chalk.dim('# Uninstall MAXSIM')}\n    npx maxsimcli --local --uninstall\n\n  ${chalk.yellow('Notes:')}\n    MAXSIM installs to .claude/ in your project directory.\n    The --config-dir option specifies a custom directory name (relative to CWD).\n`,
  );
  process.exit(0);
}

async function install(): Promise<InstallResult> {
  const dirName = getDirName();
  const src = templatesRoot;

  const targetDir = explicitConfigDir
    ? path.resolve(process.cwd(), explicitConfigDir)
    : path.join(process.cwd(), dirName);

  const locationLabel = targetDir.replace(process.cwd(), '.');

  const pathPrefix = `./${dirName}/`;

  console.log(
    `  Installing for ${chalk.cyan('Claude Code')} to ${chalk.cyan(locationLabel)}\n`,
  );

  const failures: string[] = [];

  // Detect prior install via manifest -- used for re-run safety
  const existingManifest = readManifest(targetDir);
  const isAlreadyCurrent = existingManifest !== null && existingManifest.version === pkg.version;

  if (existingManifest !== null) {
    const { complete, missing } = verifyInstallComplete(targetDir, existingManifest);
    if (!complete) {
      console.log(`  ${chalk.yellow('!')} Previous install (v${existingManifest.version}) is incomplete -- ${missing.length} missing file(s). Re-installing.`);
    } else if (isAlreadyCurrent) {
      console.log(`  ${chalk.dim(`Version ${pkg.version} already installed -- upgrading in place`)}`);
    }
  }

  // Save any locally modified MAXSIM files before they get wiped
  saveLocalPatches(targetDir);

  // Clean up orphaned files from previous versions
  cleanupOrphanedFiles(targetDir);

  // Claude uses commands/maxsim/
  let spinner = ora({ text: 'Installing commands...', color: 'cyan' }).start();
  const commandsDir = path.join(targetDir, 'commands');
  fs.mkdirSync(commandsDir, { recursive: true });

  const maxsimSrc = path.join(src, 'commands', 'maxsim');
  const maxsimDest = path.join(commandsDir, 'maxsim');
  copyWithPathReplacement(maxsimSrc, maxsimDest, pathPrefix, explicitConfigDir, true);
  if (verifyInstalled(maxsimDest, 'commands/maxsim')) {
    spinner.succeed(chalk.green('\u2713') + ' Installed commands/maxsim');
  } else {
    spinner.fail('Failed to install commands/maxsim');
    failures.push('commands/maxsim');
  }

  // Copy maxsim directory content (workflows, templates, references) with path replacement
  spinner = ora({ text: 'Installing workflows and templates...', color: 'cyan' }).start();
  const skillDest = path.join(targetDir, 'maxsim');
  const maxsimSubdirs = ['workflows', 'templates', 'references'];
  if (fs.existsSync(skillDest)) {
    fs.rmSync(skillDest, { recursive: true });
  }
  fs.mkdirSync(skillDest, { recursive: true });
  for (const subdir of maxsimSubdirs) {
    const subdirSrc = path.join(src, subdir);
    if (fs.existsSync(subdirSrc)) {
      const subdirDest = path.join(skillDest, subdir);
      copyWithPathReplacement(subdirSrc, subdirDest, pathPrefix, explicitConfigDir);
    }
  }
  if (verifyInstalled(skillDest, 'maxsim')) {
    spinner.succeed(chalk.green('\u2713') + ' Installed maxsim');
  } else {
    spinner.fail('Failed to install maxsim');
    failures.push('maxsim');
  }

  // Copy agents to agents directory
  const agentsSrc = path.join(src, 'agents');
  if (fs.existsSync(agentsSrc)) {
    spinner = ora({ text: 'Installing agents...', color: 'cyan' }).start();
    const agentsDest = path.join(targetDir, 'agents');
    fs.mkdirSync(agentsDest, { recursive: true });

    // Remove old MAXSIM agents before copying new ones
    if (fs.existsSync(agentsDest)) {
      for (const file of fs.readdirSync(agentsDest)) {
        if (file.startsWith('maxsim-') && file.endsWith('.md')) {
          fs.unlinkSync(path.join(agentsDest, file));
        }
      }
    }

    const agentEntries = fs.readdirSync(agentsSrc, { withFileTypes: true });
    for (const entry of agentEntries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        let content = fs.readFileSync(
          path.join(agentsSrc, entry.name),
          'utf8',
        );
        const dirRegex = /~\/\.claude\//g;
        content = content.replace(dirRegex, pathPrefix);
        content = processAttribution(content, getCommitAttribution(explicitConfigDir));
        fs.writeFileSync(path.join(agentsDest, entry.name), content);
      }
    }
    if (verifyInstalled(agentsDest, 'agents')) {
      spinner.succeed(chalk.green('\u2713') + ' Installed agents');
    } else {
      spinner.fail('Failed to install agents');
      failures.push('agents');
    }
  }

  // Remove legacy agents/skills/ directory (skills moved to skills/ in v1.x)
  const legacySkillsDir = path.join(targetDir, 'agents', 'skills');
  if (fs.existsSync(legacySkillsDir)) {
    fs.rmSync(legacySkillsDir, { recursive: true });
    console.log(`  ${chalk.green('\u2713')} Removed legacy agents/skills/ directory`);
  }

  // Copy skills to skills/ directory
  const skillsSrc = path.join(src, 'skills');
  if (fs.existsSync(skillsSrc)) {
    spinner = ora({ text: 'Installing skills...', color: 'cyan' }).start();
    const skillsDest = path.join(targetDir, 'skills');

    // Remove old MAXSIM built-in skills before copying new ones (preserve user custom skills)
    if (fs.existsSync(skillsDest)) {
      for (const skill of builtInSkills) {
        const skillDir = path.join(skillsDest, skill);
        if (fs.existsSync(skillDir)) {
          fs.rmSync(skillDir, { recursive: true });
        }
      }
    }

    // Copy skills directory recursively
    fsExtra.copySync(skillsSrc, skillsDest, { overwrite: true });

    // Process path prefixes in skill files
    const skillEntries = fs.readdirSync(skillsDest, { withFileTypes: true });
    for (const entry of skillEntries) {
      if (entry.isDirectory()) {
        const skillMd = path.join(skillsDest, entry.name, 'SKILL.md');
        if (fs.existsSync(skillMd)) {
          let content = fs.readFileSync(skillMd, 'utf8');
          const dirRegex = /~\/\.claude\//g;
          content = content.replace(dirRegex, pathPrefix);
          content = processAttribution(content, getCommitAttribution(explicitConfigDir));
          fs.writeFileSync(skillMd, content);
        }
      }
    }

    const installedSkillDirs = fs.readdirSync(skillsDest, { withFileTypes: true })
      .filter(e => e.isDirectory()).length;
    if (installedSkillDirs > 0) {
      spinner.succeed(chalk.green('\u2713') + ` Installed ${installedSkillDirs} skills to skills/`);
    } else {
      spinner.fail('Failed to install skills');
      failures.push('skills');
    }
  }

  // Copy rules to rules/ directory
  const rulesSrc = path.join(src, 'rules');
  if (fs.existsSync(rulesSrc)) {
    spinner = ora({ text: 'Installing rules...', color: 'cyan' }).start();
    const rulesDest = path.join(targetDir, 'rules');
    fs.mkdirSync(rulesDest, { recursive: true });

    // Copy MAXSIM rules (overwrite existing MAXSIM rules, preserve user rules)
    const ruleEntries = fs.readdirSync(rulesSrc, { withFileTypes: true });
    for (const entry of ruleEntries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        let content = fs.readFileSync(path.join(rulesSrc, entry.name), 'utf8');
        const dirRegex = /~\/\.claude\//g;
        content = content.replace(dirRegex, pathPrefix);
        fs.writeFileSync(path.join(rulesDest, entry.name), content);
      }
    }

    const installedRuleFiles = fs.readdirSync(rulesDest).filter(f => f.endsWith('.md')).length;
    if (installedRuleFiles > 0) {
      spinner.succeed(chalk.green('\u2713') + ` Installed ${installedRuleFiles} rules to rules/`);
    } else {
      spinner.fail('Failed to install rules');
      failures.push('rules');
    }
  }

  // Copy CHANGELOG.md
  const changelogSrc = path.join(src, '..', 'CHANGELOG.md');
  const changelogDest = path.join(targetDir, 'maxsim', 'CHANGELOG.md');
  if (fs.existsSync(changelogSrc)) {
    spinner = ora({ text: 'Installing CHANGELOG.md...', color: 'cyan' }).start();
    fs.copyFileSync(changelogSrc, changelogDest);
    if (verifyFileInstalled(changelogDest, 'CHANGELOG.md')) {
      spinner.succeed(chalk.green('\u2713') + ' Installed CHANGELOG.md');
    } else {
      spinner.fail('Failed to install CHANGELOG.md');
      failures.push('CHANGELOG.md');
    }
  }

  // Copy CLAUDE.md
  const claudeMdSrc = path.join(src, 'CLAUDE.md');
  const claudeMdDest = path.join(targetDir, 'CLAUDE.md');
  if (fs.existsSync(claudeMdSrc)) {
    spinner = ora({ text: 'Installing CLAUDE.md...', color: 'cyan' }).start();
    fs.copyFileSync(claudeMdSrc, claudeMdDest);
    if (verifyFileInstalled(claudeMdDest, 'CLAUDE.md')) {
      spinner.succeed(chalk.green('\u2713') + ' Installed CLAUDE.md');
    } else {
      spinner.fail('Failed to install CLAUDE.md');
      failures.push('CLAUDE.md');
    }
  }

  // Write VERSION file
  const versionDest = path.join(targetDir, 'maxsim', 'VERSION');
  fs.writeFileSync(versionDest, pkg.version);
  if (verifyFileInstalled(versionDest, 'VERSION')) {
    console.log(
      `  ${chalk.green('\u2713')} Wrote VERSION (${pkg.version})`,
    );
  } else {
    failures.push('VERSION');
  }

  // Write package.json to force CommonJS mode for MAXSIM scripts
  const pkgJsonDest = path.join(targetDir, 'package.json');
  fs.writeFileSync(pkgJsonDest, '{"type":"commonjs"}\n');
  console.log(
    `  ${chalk.green('\u2713')} Wrote package.json (CommonJS mode)`,
  );

  // Install maxsim-tools.cjs binary
  const toolSrc = path.resolve(__dirname, 'cli.cjs');
  const binDir = path.join(targetDir, 'maxsim', 'bin');
  const toolDest = path.join(binDir, 'maxsim-tools.cjs');
  if (fs.existsSync(toolSrc)) {
    fs.mkdirSync(binDir, { recursive: true });
    fs.copyFileSync(toolSrc, toolDest);
    console.log(`  ${chalk.green('\u2713')} Installed maxsim-tools.cjs`);
  } else {
    console.warn(`  ${chalk.yellow('!')} cli.cjs not found at ${toolSrc} -- maxsim-tools.cjs not installed`);
    failures.push('maxsim-tools.cjs');
  }

  // Install mcp-server.cjs
  const mcpSrc = path.resolve(__dirname, 'mcp-server.cjs');
  const mcpDest = path.join(binDir, 'mcp-server.cjs');
  if (fs.existsSync(mcpSrc)) {
    fs.mkdirSync(binDir, { recursive: true });
    fs.copyFileSync(mcpSrc, mcpDest);
    console.log(`  ${chalk.green('\u2713')} Installed mcp-server.cjs`);
  } else {
    console.warn(`  ${chalk.yellow('!')} mcp-server.cjs not found -- MCP server not installed`);
  }

  // Install hooks (always local mode)
  installHookFiles(targetDir, false, failures);

  // Write .mcp.json for Claude Code MCP server auto-discovery
  const mcpJsonPath = path.join(process.cwd(), '.mcp.json');
  let mcpConfig: Record<string, unknown> = {};
  let skipMcpConfig = false;

  if (fs.existsSync(mcpJsonPath)) {
    // Back up existing .mcp.json before modification
    fs.copyFileSync(mcpJsonPath, mcpJsonPath + '.bak');

    try {
      mcpConfig = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8'));
    } catch {
      // Corrupted .mcp.json -- warn user
      console.warn(`  ${chalk.yellow('!')} .mcp.json is corrupted (invalid JSON). Backup saved to .mcp.json.bak`);
      let startFresh = true;
      try {
        startFresh = await confirm({
          message: '.mcp.json is corrupted. Start with a fresh config? (No = abort MCP setup)',
          default: true,
        });
      } catch {
        // Non-interactive -- default to starting fresh
      }
      if (!startFresh) {
        console.log(`  ${chalk.yellow('!')} Skipping .mcp.json configuration`);
        skipMcpConfig = true;
      }
    }
  }

  if (!skipMcpConfig) {
    const mcpServers = (mcpConfig.mcpServers as Record<string, unknown>) ?? {};
    mcpServers['maxsim'] = {
      command: 'node',
      args: ['.claude/maxsim/bin/mcp-server.cjs'],
      env: {},
    };
    mcpConfig.mcpServers = mcpServers;

    fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2) + '\n', 'utf-8');
    console.log(`  ${chalk.green('\u2713')} Configured .mcp.json for MCP server auto-discovery`);
  }

  if (failures.length > 0) {
    console.error(
      `\n  ${chalk.yellow('Installation incomplete!')} Failed: ${failures.join(', ')}`,
    );
    process.exit(1);
  }

  // Write file manifest for future modification detection
  writeManifest(targetDir);
  console.log(
    `  ${chalk.green('\u2713')} Wrote file manifest (${MANIFEST_NAME})`,
  );

  // Report any backed-up local patches
  reportLocalPatches(targetDir);

  // Configure statusline and hooks in settings.json (always local mode)
  const { settingsPath, settings, statuslineCommand } = configureSettingsHooks(targetDir, false);

  return { settingsPath, settings, statuslineCommand };
}

/**
 * Prompt whether to enable Agent Teams (experimental feature)
 */
async function promptAgentTeams(): Promise<boolean> {
  console.log();
  console.log(chalk.cyan('  Agent Teams') + chalk.dim(' (experimental)'));
  console.log(chalk.dim('  Coordinate multiple Claude Code instances working in parallel.'));
  console.log(chalk.dim('  Enables CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS in settings.json.'));
  console.log();

  return confirm({
    message: 'Enable Agent Teams?',
    default: false,
  });
}

/**
 * Install MAXSIM for Claude Code (always local)
 */
async function installForClaude(
  isInteractive: boolean,
): Promise<void> {
  const result = await install();

  let shouldInstallStatusline = false;
  if (result.settings) {
    shouldInstallStatusline = await handleStatusline(
      result.settings,
      isInteractive,
      forceStatusline,
    );
  }

  // Agent Teams setup
  const agentTeamsAlreadyEnabled = process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === '1';
  let enableAgentTeams = false;

  if (agentTeamsAlreadyEnabled) {
    console.log(`  ${chalk.green('\u2713')} Agent Teams: enabled`);
  } else if (isInteractive) {
    enableAgentTeams = await promptAgentTeams();
  } else {
    // Non-interactive: show guidance for enabling Agent Teams
    console.log();
    console.log(chalk.cyan('  Agent Teams') + chalk.dim(' (Recommended for Parallel Execution)'));
    console.log(chalk.dim('  MAXSIM\'s parallel execution uses Agent Teams for coordinating multiple agents.'));
    console.log(chalk.dim('  To enable, add to your environment:'));
    console.log();
    console.log(chalk.yellow('    export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1'));
    console.log();
    console.log(chalk.dim('  Or add to your shell profile (~/.bashrc, ~/.zshrc, etc.)'));
  }

  // Apply Agent Teams setting
  if ((enableAgentTeams || agentTeamsAlreadyEnabled) && result.settings) {
    const env = (result.settings.env as Record<string, unknown>) ?? {};
    env['CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS'] = '1';
    result.settings.env = env;
  }

  finishInstall(
    result.settingsPath,
    result.settings,
    result.statuslineCommand,
    shouldInstallStatusline,
    false, // always local
  );
}

// Main logic
// Subcommand routing -- intercept before install flow
const subcommand = argv._[0];

(async () => {
  // Skill management subcommands
  if (subcommand === 'skill-list' || subcommand === 'skill-install' || subcommand === 'skill-update') {
    const { cmdSkillList, cmdSkillInstall, cmdSkillUpdate } = await import('../core/skills.js');
    const { CliOutput, writeOutput, CliError } = await import('../core/core.js');
    const cwd = process.cwd();
    try {
      if (subcommand === 'skill-list') {
        cmdSkillList(cwd, false);
      } else if (subcommand === 'skill-install') {
        cmdSkillInstall(cwd, argv._[1] as string | undefined, false);
      } else if (subcommand === 'skill-update') {
        cmdSkillUpdate(cwd, argv._[1] as string | undefined, false);
      }
    } catch (thrown: unknown) {
      if (thrown instanceof CliOutput) {
        writeOutput(thrown);
        process.exit(0);
      }
      if (thrown instanceof CliError) {
        console.error('Error: ' + thrown.message);
        process.exit(1);
      }
      throw thrown;
    }
    return;
  }

  if (hasUninstall) {
    if (!hasLocal) {
      console.error(chalk.yellow('--uninstall requires --local'));
      process.exit(1);
    }
    uninstall(false, explicitConfigDir);
  } else {
    // Always install locally (interactive or not)
    const isInteractive = process.stdin.isTTY === true;
    await installForClaude(isInteractive);
  }
})().catch((err: unknown) => {
  if (err instanceof Error && err.message.includes('User force closed')) {
    // User pressed Ctrl+C during an @inquirer/prompts prompt -- exit cleanly
    console.log('\n' + chalk.yellow('Installation cancelled') + '\n');
    process.exit(0);
  }
  console.error(chalk.red('Unexpected error:'), err);
  process.exit(1);
});
