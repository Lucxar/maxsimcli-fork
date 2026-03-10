/**
 * @maxsim/hooks -- Re-exports for unit testing.
 * Do NOT import this module at runtime; hooks run as standalone CJS bundles.
 */

export { checkForUpdate, createBackupBeforeUpdate } from './maxsim-check-update';
export type { UpdateCheckResult, CheckForUpdateOptions } from './maxsim-check-update';

export { formatStatusline } from './maxsim-statusline';
export type { StatuslineInput, ProgressCache } from './maxsim-statusline';

export { processSyncReminder, DEBOUNCE_CALLS } from './maxsim-sync-reminder';
export type { SyncReminderInput, SyncReminderOutput } from './maxsim-sync-reminder';
