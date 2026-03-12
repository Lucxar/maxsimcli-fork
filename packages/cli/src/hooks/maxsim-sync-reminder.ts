#!/usr/bin/env node
/**
 * Sync Reminder Hook — No longer needed.
 * GitHub Issues is the sole source of truth for phase artifacts and todos.
 * Local .planning/ writes no longer need sync reminders.
 */

import { readStdinJson } from './shared';

export interface SyncReminderInput {
  session_id?: string;
  cwd?: string;
  tool_input?: { file_path?: string };
}

export interface SyncReminderOutput {
  hookSpecificOutput: {
    hookEventName: string;
    additionalContext: string;
  };
}

export const DEBOUNCE_CALLS = 10;

export function processSyncReminder(
  _data: SyncReminderInput,
): SyncReminderOutput | null {
  // No-op: GitHub Issues is SSOT for phase artifacts and todos.
  return null;
}

// Standalone entry
if (require.main === module) {
  readStdinJson<SyncReminderInput>((data) => {
    const result = processSyncReminder(data);
    if (result) {
      process.stdout.write(JSON.stringify(result));
    }
  });
}
