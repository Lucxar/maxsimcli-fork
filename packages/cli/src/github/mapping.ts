/**
 * GitHub Issues Mapping — Persistence layer for github-issues.json
 *
 * Manages the `.planning/github-issues.json` file that maps MAXSIM tasks/todos
 * to their corresponding GitHub issue numbers, node IDs, and project item IDs.
 *
 * All file operations use synchronous fs (matching the pattern in existing core modules).
 * Uses planningPath() from core to construct file paths.
 *
 * CRITICAL: Never call process.exit() — throw or return null instead.
 */

import fs from 'node:fs';
import path from 'node:path';

import { planningPath } from '../core/core.js';
import type { IssueMappingFile, PhaseMapping, TaskIssueMapping } from './types.js';

// ---- Constants -------------------------------------------------------------

const MAPPING_FILENAME = 'github-issues.json';

// ---- Helpers ---------------------------------------------------------------

/**
 * Get the absolute path to `.planning/github-issues.json` for a given cwd.
 */
function mappingFilePath(cwd: string): string {
  return planningPath(cwd, MAPPING_FILENAME);
}

// ---- Public API ------------------------------------------------------------

/**
 * Load and parse the mapping file.
 *
 * Returns null if the file does not exist.
 * Throws on malformed JSON or invalid structure (missing required fields).
 */
export function loadMapping(cwd: string): IssueMappingFile | null {
  const filePath = mappingFilePath(cwd);

  try {
    fs.statSync(filePath);
  } catch {
    return null;
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  // Validate basic structure — must have project_number and repo
  if (typeof parsed.project_number !== 'number' || typeof parsed.repo !== 'string') {
    throw new Error(
      `Invalid github-issues.json: missing required fields 'project_number' (number) and 'repo' (string)`,
    );
  }

  return parsed as unknown as IssueMappingFile;
}

/**
 * Write the mapping file to `.planning/github-issues.json`.
 *
 * Creates the `.planning/` directory if it does not exist.
 * Writes with 2-space indent for readability and diff-friendliness.
 */
export function saveMapping(cwd: string, mapping: IssueMappingFile): void {
  const filePath = mappingFilePath(cwd);
  const dir = path.dirname(filePath);

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(mapping, null, 2) + '\n', 'utf-8');
}

/**
 * Update a specific task's issue mapping within a phase.
 *
 * Load-modify-save pattern. Creates phase entry if it does not exist.
 * Merges partial data with existing entry (if any).
 *
 * @throws If mapping file does not exist (must be initialized first via saveMapping)
 */
export function updateTaskMapping(
  cwd: string,
  phaseNum: string,
  taskId: string,
  data: Partial<TaskIssueMapping>,
): void {
  const mapping = loadMapping(cwd);
  if (!mapping) {
    throw new Error('github-issues.json does not exist. Run project setup first.');
  }

  // Create phase entry if missing
  if (!mapping.phases[phaseNum]) {
    mapping.phases[phaseNum] = {
      tracking_issue: { number: 0, node_id: '', item_id: '', status: 'To Do' },
      plan: '',
      tasks: {},
    } satisfies PhaseMapping;
  }

  // Merge with existing task data (if any)
  const existing = mapping.phases[phaseNum].tasks[taskId];
  const defaults: TaskIssueMapping = { number: 0, node_id: '', item_id: '', status: 'To Do' };
  mapping.phases[phaseNum].tasks[taskId] = Object.assign(defaults, existing, data);

  saveMapping(cwd, mapping);
}

/**
 * Update a specific todo's issue mapping.
 *
 * Load-modify-save pattern. Creates `todos` section if missing.
 * Merges partial data with existing entry (if any).
 *
 * @throws If mapping file does not exist (must be initialized first via saveMapping)
 */
export function updateTodoMapping(
  cwd: string,
  todoId: string,
  data: Partial<TaskIssueMapping>,
): void {
  const mapping = loadMapping(cwd);
  if (!mapping) {
    throw new Error('github-issues.json does not exist. Run project setup first.');
  }

  // Create todos section if missing
  if (!mapping.todos) {
    mapping.todos = {};
  }

  // Merge with existing todo data (if any)
  const existing = mapping.todos[todoId];
  const defaults: TaskIssueMapping = { number: 0, node_id: '', item_id: '', status: 'To Do' };
  mapping.todos[todoId] = Object.assign(defaults, existing, data);

  saveMapping(cwd, mapping);
}

/**
 * Create a properly typed empty mapping object with sensible defaults.
 *
 * Used during initial project setup to create the mapping file.
 */
export function createEmptyMapping(repo: string): IssueMappingFile {
  return {
    project_number: 0,
    project_id: '',
    repo,
    status_field_id: '',
    status_options: {},
    estimate_field_id: '',
    milestone_id: 0,
    milestone_title: '',
    labels: {},
    phases: {},
    todos: {},
  };
}

/**
 * Quick lookup: get the issue mapping for a specific task in a phase.
 *
 * Returns null if the mapping file, phase, or task does not exist.
 */
export function getIssueForTask(
  cwd: string,
  phaseNum: string,
  taskId: string,
): TaskIssueMapping | null {
  const mapping = loadMapping(cwd);
  if (!mapping) return null;

  const phase = mapping.phases[phaseNum];
  if (!phase) return null;

  return phase.tasks[taskId] ?? null;
}

/**
 * Quick lookup: get the issue mapping for a specific todo.
 *
 * Returns null if the mapping file or todo does not exist.
 */
export function getIssueForTodo(cwd: string, todoId: string): TaskIssueMapping | null {
  const mapping = loadMapping(cwd);
  if (!mapping) return null;

  return mapping.todos?.[todoId] ?? null;
}
