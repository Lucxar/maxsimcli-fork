#!/usr/bin/env node
/**
 * Sync Reminder Hook — PostToolUse hook that detects .planning/ file writes
 * and gently reminds the user to sync changes to GitHub Issues.
 *
 * Debounces reminders: fires on the first .planning/ write per session,
 * then every DEBOUNCE_CALLS writes thereafter.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
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

interface DebounceState {
  callsSinceRemind: number;
  reminded: boolean;
}

/** Number of .planning/ writes between repeated reminders. */
export const DEBOUNCE_CALLS = 10;

const REMINDER_MESSAGE =
  '.planning/ files changed locally. Consider syncing to GitHub Issues when ready.';

export function processSyncReminder(
  data: SyncReminderInput,
): SyncReminderOutput | null {
  const sessionId = data.session_id;
  const filePath = data.tool_input?.file_path;

  if (!sessionId || !filePath) {
    return null;
  }

  // Normalize path for cross-platform (Windows backslash handling)
  const normalized = path.normalize(filePath);

  // Check if the file is inside a .planning/ directory
  const planningSegment = `${path.sep}.planning${path.sep}`;
  const planningEnd = `${path.sep}.planning`;
  if (
    !normalized.includes(planningSegment) &&
    !normalized.endsWith(planningEnd)
  ) {
    return null;
  }

  // Load debounce state from temp file
  const stateFile = path.join(
    os.tmpdir(),
    `maxsim-sync-${sessionId}.json`,
  );

  let state: DebounceState;
  try {
    if (fs.existsSync(stateFile)) {
      state = JSON.parse(fs.readFileSync(stateFile, 'utf8')) as DebounceState;
    } else {
      state = { callsSinceRemind: 0, reminded: false };
    }
  } catch {
    state = { callsSinceRemind: 0, reminded: false };
  }

  state.callsSinceRemind++;

  // Fire reminder on first write OR after debounce interval expires
  if (!state.reminded || state.callsSinceRemind >= DEBOUNCE_CALLS) {
    state.callsSinceRemind = 0;
    state.reminded = true;

    try {
      fs.writeFileSync(stateFile, JSON.stringify(state));
    } catch {
      // Silent fail -- never block hook execution
    }

    return {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: REMINDER_MESSAGE,
      },
    };
  }

  // Not time for a reminder yet
  try {
    fs.writeFileSync(stateFile, JSON.stringify(state));
  } catch {
    // Silent fail -- never block hook execution
  }

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
