import * as fs from 'node:fs';

import chalk from 'chalk';
import { confirm } from '@inquirer/prompts';

import {
  readSettings,
  writeSettings,
  buildHookCommand,
} from './utils.js';
import { getDirName, verifyInstalled } from './shared.js';
import * as path from 'node:path';
import ora from 'ora';

/**
 * Clean up orphaned files from previous MAXSIM versions
 */
export function cleanupOrphanedFiles(configDir: string): void {
  const orphanedFiles = [
    // Legacy hooks
    'hooks/maxsim-notify.sh',
    'hooks/statusline.js',

    // v5.0: Removed command files (Phase 3 - Command Surface Simplification)
    'commands/maxsim/add-phase.md',
    'commands/maxsim/add-tests.md',
    'commands/maxsim/add-todo.md',
    'commands/maxsim/artefakte.md',
    'commands/maxsim/audit-milestone.md',
    'commands/maxsim/batch.md',
    'commands/maxsim/check-drift.md',
    'commands/maxsim/check-todos.md',
    'commands/maxsim/cleanup.md',
    'commands/maxsim/complete-milestone.md',
    'commands/maxsim/discuss-phase.md',
    'commands/maxsim/discuss.md',
    'commands/maxsim/execute-phase.md',
    'commands/maxsim/health.md',
    'commands/maxsim/init-existing.md',
    'commands/maxsim/insert-phase.md',
    'commands/maxsim/list-phase-assumptions.md',
    'commands/maxsim/map-codebase.md',
    'commands/maxsim/new-milestone.md',
    'commands/maxsim/new-project.md',
    'commands/maxsim/pause-work.md',
    'commands/maxsim/plan-milestone-gaps.md',
    'commands/maxsim/plan-phase.md',
    'commands/maxsim/realign.md',
    'commands/maxsim/reapply-patches.md',
    'commands/maxsim/remove-phase.md',
    'commands/maxsim/research-phase.md',
    'commands/maxsim/resume-work.md',
    'commands/maxsim/roadmap.md',
    'commands/maxsim/sdd.md',
    'commands/maxsim/set-profile.md',
    'commands/maxsim/update.md',
    'commands/maxsim/verify-work.md',

    // v5.x: Old agent files (Phase 4 - Agent Consolidation: 14 agents -> 4 generic types)
    'agents/maxsim-code-reviewer.md',
    'agents/maxsim-codebase-mapper.md',
    'agents/maxsim-debugger.md',
    'agents/maxsim-drift-checker.md',
    'agents/maxsim-executor.md',
    'agents/maxsim-integration-checker.md',
    'agents/maxsim-phase-researcher.md',
    'agents/maxsim-plan-checker.md',
    'agents/maxsim-planner.md',
    'agents/maxsim-project-researcher.md',
    'agents/maxsim-research-synthesizer.md',
    'agents/maxsim-roadmapper.md',
    'agents/maxsim-spec-reviewer.md',
    'agents/maxsim-verifier.md',

    // v5.x: Context monitor removal (Phase 6)
    'hooks/maxsim-context-monitor.js',

    // v5.0: Removed workflow files (Phase 3)
    'maxsim/workflows/add-phase.md',
    'maxsim/workflows/add-tests.md',
    'maxsim/workflows/add-todo.md',
    'maxsim/workflows/audit-milestone.md',
    'maxsim/workflows/check-drift.md',
    'maxsim/workflows/check-todos.md',
    'maxsim/workflows/cleanup.md',
    'maxsim/workflows/complete-milestone.md',
    'maxsim/workflows/discuss.md',
    'maxsim/workflows/insert-phase.md',
    'maxsim/workflows/list-phase-assumptions.md',
    'maxsim/workflows/map-codebase.md',
    'maxsim/workflows/pause-work.md',
    'maxsim/workflows/plan-milestone-gaps.md',
    'maxsim/workflows/realign.md',
    'maxsim/workflows/remove-phase.md',
    'maxsim/workflows/resume-project.md',
    'maxsim/workflows/roadmap.md',
    'maxsim/workflows/set-profile.md',
    'maxsim/workflows/transition.md',
    'maxsim/workflows/update.md',
  ];

  for (const relPath of orphanedFiles) {
    const fullPath = path.join(configDir, relPath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log(`  ${chalk.green('\u2713')} Removed orphaned ${relPath}`);
    }
  }
}

/**
 * Clean up orphaned hook registrations from settings.json
 */
export function cleanupOrphanedHooks(
  settings: Record<string, unknown>,
): Record<string, unknown> {
  const orphanedHookPatterns = [
    'maxsim-notify.sh',
    'hooks/statusline.js',
    'maxsim-intel-index.js',
    'maxsim-intel-session.js',
    'maxsim-intel-prune.js',
    'maxsim-context-monitor',
  ];

  let cleanedHooks = false;

  interface HookEntry {
    hooks?: Array<{ command?: string }>;
  }

  const hooks = settings.hooks as Record<string, HookEntry[]> | undefined;
  if (hooks) {
    for (const eventType of Object.keys(hooks)) {
      const hookEntries = hooks[eventType];
      if (Array.isArray(hookEntries)) {
        const filtered = hookEntries.filter((entry: HookEntry) => {
          if (entry.hooks && Array.isArray(entry.hooks)) {
            const hasOrphaned = entry.hooks.some(
              (h) =>
                h.command &&
                orphanedHookPatterns.some((pattern) =>
                  h.command!.includes(pattern),
                ),
            );
            if (hasOrphaned) {
              cleanedHooks = true;
              return false;
            }
          }
          return true;
        });
        hooks[eventType] = filtered;
      }
    }
  }

  if (cleanedHooks) {
    console.log(
      `  ${chalk.green('\u2713')} Removed orphaned hook registrations`,
    );
  }

  const statusLine = settings.statusLine as { command?: string } | undefined;
  if (
    statusLine &&
    statusLine.command &&
    statusLine.command.includes('statusline.js') &&
    !statusLine.command.includes('maxsim-statusline.js')
  ) {
    statusLine.command = statusLine.command.replace(
      /statusline\.js/,
      'maxsim-statusline.js',
    );
    console.log(
      `  ${chalk.green('\u2713')} Updated statusline path (statusline.js \u2192 maxsim-statusline.js)`,
    );
  }

  return settings;
}

/**
 * Install hook files and configure settings.json
 */
export function installHookFiles(
  targetDir: string,
  failures: string[],
): void {
  // Copy hooks from bundled assets directory
  let hooksSrc: string | null = null;
  const bundledHooksDir = path.resolve(__dirname, 'assets', 'hooks');
  if (fs.existsSync(bundledHooksDir)) {
    hooksSrc = bundledHooksDir;
  } else {
    console.warn(`  ${chalk.yellow('!')} bundled hooks not found - hooks will not be installed`);
  }

  if (hooksSrc) {
    const spinner = ora({ text: 'Installing hooks...', color: 'cyan' }).start();
    const hooksDest = path.join(targetDir, 'hooks');
    fs.mkdirSync(hooksDest, { recursive: true });
    const hookEntries = fs.readdirSync(hooksSrc);
    const configDirReplacement = "'.claude'";
    for (const entry of hookEntries) {
      const srcFile = path.join(hooksSrc, entry);
      if (fs.statSync(srcFile).isFile() && entry.endsWith('.cjs') && !entry.includes('.d.')) {
        const destName = entry.replace(/\.cjs$/, '.js');
        const destFile = path.join(hooksDest, destName);
        let content = fs.readFileSync(srcFile, 'utf8');
        content = content.replace(/'\.claude'/g, configDirReplacement);
        fs.writeFileSync(destFile, content);
      }
    }
    if (verifyInstalled(hooksDest, 'hooks')) {
      spinner.succeed(chalk.green('\u2713') + ' Installed hooks (bundled)');
    } else {
      spinner.fail('Failed to install hooks');
      failures.push('hooks');
    }
  }
}

/**
 * Configure hooks and statusline in settings.json
 */
export function configureSettingsHooks(
  targetDir: string,
): { settingsPath: string; settings: Record<string, unknown>; statuslineCommand: string; updateCheckCommand: string; syncReminderCommand: string; notificationSoundCommand: string; stopSoundCommand: string } {
  const dirName = getDirName();

  const settingsPath = path.join(targetDir, 'settings.json');
  const settings = cleanupOrphanedHooks(readSettings(settingsPath));
  const statuslineCommand = 'node ' + dirName + '/hooks/maxsim-statusline.js';
  const updateCheckCommand = 'node ' + dirName + '/hooks/maxsim-check-update.js';
  const syncReminderCommand = 'node ' + dirName + '/hooks/maxsim-sync-reminder.js';
  const notificationSoundCommand = 'node ' + dirName + '/hooks/maxsim-notification-sound.js';
  const stopSoundCommand = 'node ' + dirName + '/hooks/maxsim-stop-sound.js';
  interface InstallHookEntry {
    matcher?: string;
    hooks?: Array<{ type: string; command: string }>;
  }

  // Configure SessionStart hook for update checking
  if (!settings.hooks) {
    settings.hooks = {};
  }
  const installHooks = settings.hooks as Record<string, InstallHookEntry[]>;
  if (!installHooks.SessionStart) {
    installHooks.SessionStart = [];
  }

  const hasMaxsimUpdateHook = installHooks.SessionStart.some(
    (entry: InstallHookEntry) =>
      entry.hooks &&
      entry.hooks.some(
        (h) => h.command && h.command.includes('maxsim-check-update'),
      ),
  );

  if (!hasMaxsimUpdateHook) {
    installHooks.SessionStart.push({
      hooks: [
        {
          type: 'command',
          command: updateCheckCommand,
        },
      ],
    });
    console.log(
      `  ${chalk.green('\u2713')} Configured update check hook`,
    );
  }

  // Configure PostToolUse hook for sync reminder
  if (!installHooks.PostToolUse) {
    installHooks.PostToolUse = [];
  }

  const hasMaxsimSyncReminder = installHooks.PostToolUse.some(
    (entry: InstallHookEntry) =>
      entry.hooks &&
      entry.hooks.some(
        (h) => h.command && h.command.includes('maxsim-sync-reminder'),
      ),
  );

  if (!hasMaxsimSyncReminder) {
    installHooks.PostToolUse.push({
      matcher: 'Write|Edit',
      hooks: [
        {
          type: 'command',
          command: syncReminderCommand,
        },
      ],
    });
    console.log(
      `  ${chalk.green('\u2713')} Configured sync reminder hook`,
    );
  }

  // Configure PostToolUse hook for notification sound on AskUserQuestion
  const hasNotificationSound = installHooks.PostToolUse.some(
    (entry: InstallHookEntry) =>
      entry.hooks &&
      entry.hooks.some(
        (h) => h.command && h.command.includes('maxsim-notification-sound'),
      ),
  );

  if (!hasNotificationSound) {
    installHooks.PostToolUse.push({
      matcher: 'AskUserQuestion',
      hooks: [
        {
          type: 'command',
          command: notificationSoundCommand,
        },
      ],
    });
    console.log(
      `  ${chalk.green('\u2713')} Configured notification sound hook`,
    );
  }

  // Configure Stop hook for stop sound
  if (!installHooks.Stop) {
    installHooks.Stop = [];
  }

  const hasStopSound = installHooks.Stop.some(
    (entry: InstallHookEntry) =>
      entry.hooks &&
      entry.hooks.some(
        (h) => h.command && h.command.includes('maxsim-stop-sound'),
      ),
  );

  if (!hasStopSound) {
    installHooks.Stop.push({
      hooks: [
        {
          type: 'command',
          command: stopSoundCommand,
        },
      ],
    });
    console.log(
      `  ${chalk.green('\u2713')} Configured stop sound hook`,
    );
  }

  return { settingsPath, settings, statuslineCommand, updateCheckCommand, syncReminderCommand, notificationSoundCommand, stopSoundCommand };
}

/**
 * Handle statusline configuration — returns true if MAXSIM statusline should be installed
 */
export async function handleStatusline(
  settings: Record<string, unknown>,
  isInteractive: boolean,
  forceStatusline: boolean,
): Promise<boolean> {
  const hasExisting = settings.statusLine != null;

  if (!hasExisting) return true;
  if (forceStatusline) return true;

  if (!isInteractive) {
    console.log(
      chalk.yellow('\u26a0') + ' Skipping statusline (already configured)',
    );
    console.log(
      '  Use ' + chalk.cyan('--force-statusline') + ' to replace\n',
    );
    return false;
  }

  const statusLine = settings.statusLine as { command?: string; url?: string };
  const existingCmd = statusLine.command || statusLine.url || '(custom)';

  console.log();
  console.log(chalk.yellow('\u26a0  Existing statusline detected'));
  console.log();
  console.log('  Your current statusline:');
  console.log('    ' + chalk.dim(`command: ${existingCmd}`));
  console.log();
  console.log('  MAXSIM includes a statusline showing:');
  console.log('    \u2022 Model name');
  console.log('    \u2022 Current phase number');
  console.log('    \u2022 Milestone progress percentage');
  console.log();

  const shouldReplace = await confirm({
    message: 'Replace with MAXSIM statusline?',
    default: false,
  });

  return shouldReplace;
}

/**
 * Apply statusline config, then print completion message
 */
export function finishInstall(
  settingsPath: string | null,
  settings: Record<string, unknown> | null,
  statuslineCommand: string | null,
  shouldInstallStatusline: boolean,
): void {
  if (shouldInstallStatusline) {
    settings!.statusLine = {
      type: 'command',
      command: statuslineCommand,
    };
    console.log(`  ${chalk.green('\u2713')} Configured statusline`);
  }

  if (settingsPath && settings) {
    writeSettings(settingsPath, settings);
  }

  console.log(`
  ${chalk.green('Done!')} Launch Claude Code and run ${chalk.cyan('/maxsim:help')}.

  ${chalk.cyan('Join the community:')} https://discord.gg/kNwgTu2sQW
`);
}
