/**
 * @maxsim/hooks -- Re-exports for unit testing.
 * Do NOT import this module at runtime; hooks run as standalone CJS bundles.
 */

export { checkForUpdate } from './maxsim-check-update';
export type { UpdateCheckResult, CheckForUpdateOptions } from './maxsim-check-update';

export { formatStatusline } from './maxsim-statusline';
export type { StatuslineInput, ProgressCache } from './maxsim-statusline';
