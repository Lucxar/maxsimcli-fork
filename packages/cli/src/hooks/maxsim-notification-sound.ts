#!/usr/bin/env node
/**
 * Notification Sound Hook — PostToolUse hook that plays a sound
 * when Claude asks the user a question (AskUserQuestion tool).
 */

import { readStdinJson, playSound } from './shared';

interface NotificationSoundInput {
  tool_name?: string;
}

export function processNotificationSound(data: NotificationSoundInput): void {
  playSound('question');
}

// Standalone entry
if (require.main === module) {
  readStdinJson<NotificationSoundInput>((data) => {
    processNotificationSound(data);
  });
}
