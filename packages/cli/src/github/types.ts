/**
 * GitHub Integration — Type definitions
 *
 * All types for the GitHub Issues/Projects v2 integration layer.
 * Used by gh.ts, mapping.ts, and downstream modules (issues, projects, etc.).
 */

// ---- Error codes for gh CLI wrapper ----------------------------------------

export type GhErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'NOT_INSTALLED'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'SCOPE_MISSING'
  | 'UNKNOWN';

// ---- GhResult discriminated union ------------------------------------------

export type GhResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: GhErrorCode };

// ---- Auth status -----------------------------------------------------------

export interface AuthStatus {
  installed: boolean;
  authenticated: boolean;
  scopes: string[];
  hasProjectScope: boolean;
  username: string | null;
}

// ---- GitHub operation mode -------------------------------------------------

export type GitHubMode = 'full' | 'local-only';

// ---- Issue status ----------------------------------------------------------

export type IssueStatus = 'To Do' | 'In Progress' | 'In Review' | 'Done';

// ---- Task-to-issue mapping -------------------------------------------------

export interface TaskIssueMapping {
  number: number;
  node_id: string;
  item_id: string;
  status: IssueStatus;
}

// ---- Phase mapping ---------------------------------------------------------

export interface PhaseMapping {
  tracking_issue: TaskIssueMapping;
  plan: string;
  tasks: Record<string, TaskIssueMapping>;
}

// ---- Root mapping file (.planning/github-issues.json) ----------------------

export interface IssueMappingFile {
  project_number: number;
  project_id: string;
  repo: string;
  status_field_id: string;
  status_options: Record<string, string>;
  estimate_field_id: string;
  milestone_id: number;
  milestone_title: string;
  labels: Record<string, string>;
  phases: Record<string, PhaseMapping>;
  todos: Record<string, TaskIssueMapping>;
}

// ---- Label definitions -----------------------------------------------------

export const MAXSIM_LABELS = [
  { name: 'maxsim', color: '6f42c1', description: 'MAXSIM managed issue' },
  { name: 'phase-task', color: '0075ca', description: 'MAXSIM phase task' },
  { name: 'todo', color: 'fbca04', description: 'MAXSIM todo item' },
  { name: 'imported', color: 'e4e669', description: 'Imported into MAXSIM tracking' },
  { name: 'superseded', color: 'd73a4a', description: 'Superseded by newer plan' },
] as const;

// ---- Fibonacci story points ------------------------------------------------

export const FIBONACCI_POINTS = [1, 2, 3, 5, 8, 13, 21, 34] as const;

// ---- Default project board status columns ----------------------------------

export const DEFAULT_STATUS_OPTIONS = ['To Do', 'In Progress', 'In Review', 'Done'] as const;
