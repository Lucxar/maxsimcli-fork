#!/usr/bin/env node
/**
 * Stop Sound Hook — Stop event hook that plays a sound
 * when Claude finishes working.
 */

import { readStdinJson, playSound } from './shared';

interface StopSoundInput {
  stop_hook_active?: boolean;
}

export function processStopSound(data: StopSoundInput): void {
  playSound('stop');
}

// Standalone entry
if (require.main === module) {
  readStdinJson<StopSoundInput>((data) => {
    processStopSound(data);
  });
}
