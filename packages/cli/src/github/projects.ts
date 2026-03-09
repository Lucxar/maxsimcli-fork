/**
 * GitHub Projects v2 — Board creation, field setup, and item management
 *
 * Manages GitHub Projects v2 boards for MAXSIM task tracking.
 * Uses `gh project` CLI commands for most operations, falling back to
 * `gh api graphql` for operations with no CLI equivalent (adding
 * single-select status options).
 *
 * One project board per repo (not per milestone). 4 columns:
 * To Do, In Progress, In Review, Done.
 *
 * CRITICAL: Never import octokit or any npm GitHub SDK.
 * CRITICAL: Never call process.exit() — return GhResult instead.
 */

import type { GhErrorCode, GhResult } from './types.js';
import { ghExec, ghGraphQL } from './gh.js';
import { loadMapping, saveMapping, createEmptyMapping } from './mapping.js';

// ---- Helpers ---------------------------------------------------------------

/**
 * Extract error info from a failed GhResult and re-wrap it for a different
 * generic type. This avoids TypeScript narrowing issues with discriminated
 * union property access.
 */
function fail<T>(result: { ok: false; error: string; code: GhErrorCode }): GhResult<T> {
  return { ok: false, error: result.error, code: result.code };
}

// ---- Project Board Creation ------------------------------------------------

/**
 * Create a new GitHub Projects v2 board.
 *
 * Runs `gh project create --owner @me --title "{title}" --format json`.
 * Returns the project number and node ID.
 */
export async function createProjectBoard(
  title: string,
): Promise<GhResult<{ number: number; id: string }>> {
  const result = await ghExec<{ number: number; id: string }>(
    ['project', 'create', '--owner', '@me', '--title', title, '--format', 'json'],
    { parseJson: true },
  );

  if (!result.ok) {
    return result;
  }

  return { ok: true, data: { number: result.data.number, id: result.data.id } };
}

// ---- Ensure Project Board --------------------------------------------------

/**
 * Ensure a project board exists, creating it if needed.
 *
 * Checks the mapping file for an existing project. If found, verifies it
 * still exists via `gh project view`. If not found, creates a new board
 * and sets up fields and status options.
 *
 * Returns the project number, ID, and whether it was newly created.
 */
export async function ensureProjectBoard(
  title: string,
  cwd: string,
): Promise<GhResult<{ number: number; id: string; created: boolean }>> {
  // Check mapping file for existing project
  const mapping = loadMapping(cwd);

  if (mapping && mapping.project_number > 0 && mapping.project_id) {
    // Verify the project still exists
    const viewResult = await ghExec(
      ['project', 'view', String(mapping.project_number), '--owner', '@me', '--format', 'json'],
      { parseJson: true },
    );

    if (viewResult.ok) {
      return {
        ok: true,
        data: {
          number: mapping.project_number,
          id: mapping.project_id,
          created: false,
        },
      };
    }

    // Project was deleted — fall through to create a new one
  }

  // Create the project board
  const createResult = await createProjectBoard(title);
  if (!createResult.ok) {
    return fail(createResult);
  }

  const { number, id } = createResult.data;

  // Set up fields and status options
  const setupResult = await setupProjectFields(number, id, cwd);
  if (!setupResult.ok) {
    return fail(setupResult);
  }

  return { ok: true, data: { number, id, created: true } };
}

// ---- Field Queries ---------------------------------------------------------

type FieldInfo = {
  id: string;
  name: string;
  type: string;
  options?: Array<{ id: string; name: string }>;
};

/**
 * Get all fields for a project board.
 *
 * Runs `gh project field-list {num} --owner @me --format json`.
 * Returns field list with IDs, names, types, and options (for single-select).
 */
export async function getProjectFields(
  projectNum: number,
): Promise<GhResult<FieldInfo[]>> {
  const result = await ghExec<{ fields: FieldInfo[] }>(
    ['project', 'field-list', String(projectNum), '--owner', '@me', '--format', 'json'],
    { parseJson: true },
  );

  if (!result.ok) {
    return fail(result);
  }

  // gh project field-list returns { fields: [...] } or a flat array in JSON format
  const fields = result.data.fields ?? (result.data as unknown as FieldInfo[]);

  return { ok: true, data: fields };
}

// ---- Status Option Management ----------------------------------------------

/**
 * Add a new single-select option to a project field via GraphQL.
 *
 * The `updateProjectV2Field` mutation REPLACES all options, so all existing
 * options must be included alongside the new one.
 *
 * Returns the new option's ID.
 */
export async function addStatusOption(
  projectId: string,
  statusFieldId: string,
  optionName: string,
  existingOptions: Array<{ id: string; name: string }>,
): Promise<GhResult<string>> {
  // Build the options array: existing + new
  // The mutation replaces all options, so we must include every existing one
  const allOptions = [
    ...existingOptions.map(o => `{name: "${o.name}", description: "", color: GRAY}`),
    `{name: "${optionName}", description: "", color: BLUE}`,
  ];

  const query = `
    mutation {
      updateProjectV2Field(input: {
        projectId: "${projectId}"
        fieldId: "${statusFieldId}"
        singleSelectOptions: [${allOptions.join(', ')}]
      }) {
        projectV2Field {
          ... on ProjectV2SingleSelectField {
            options { id name }
          }
        }
      }
    }
  `;

  const result = await ghGraphQL<{
    updateProjectV2Field: {
      projectV2Field: {
        options: Array<{ id: string; name: string }>;
      };
    };
  }>(query);

  if (!result.ok) {
    return fail(result);
  }

  const options = result.data.updateProjectV2Field.projectV2Field.options;
  const newOption = options.find(o => o.name === optionName);

  if (!newOption) {
    return {
      ok: false,
      error: `Option "${optionName}" was not found after mutation — it may have been renamed or rejected`,
      code: 'UNKNOWN',
    };
  }

  return { ok: true, data: newOption.id };
}

// ---- Field Setup Orchestration ---------------------------------------------

/**
 * Set up project fields: Status options and Estimate number field.
 *
 * Orchestrates the full field setup:
 * (a) Get existing fields
 * (b) Find Status field, verify "In Review" option exists or add it
 * (c) Create Estimate NUMBER field via `gh project field-create`
 * (d) Store all field/option IDs in the mapping file
 */
export async function setupProjectFields(
  projectNum: number,
  projectId: string,
  cwd: string,
): Promise<GhResult<void>> {
  // (a) Get existing fields
  const fieldsResult = await getProjectFields(projectNum);
  if (!fieldsResult.ok) {
    return fail(fieldsResult);
  }

  const fields = fieldsResult.data;

  // (b) Find Status field
  const statusField = fields.find(
    f => f.name === 'Status' && (f.type === 'SINGLE_SELECT' || f.type === 'ProjectV2SingleSelectField'),
  );

  if (!statusField) {
    return {
      ok: false,
      error: 'Status field not found on project board. This is unexpected for a Projects v2 board.',
      code: 'NOT_FOUND',
    };
  }

  const statusOptions = statusField.options ?? [];

  // Build status options map (existing)
  const statusOptionsMap: Record<string, string> = {};
  for (const opt of statusOptions) {
    statusOptionsMap[opt.name] = opt.id;
  }

  // Check if "In Review" exists
  if (!statusOptionsMap['In Review']) {
    const addResult = await addStatusOption(
      projectId,
      statusField.id,
      'In Review',
      statusOptions,
    );

    if (!addResult.ok) {
      return fail(addResult);
    }

    statusOptionsMap['In Review'] = addResult.data;
  }

  // Also ensure the default options are tracked
  // GitHub defaults may be "Todo" not "To Do" — normalize
  if (statusOptionsMap['Todo'] && !statusOptionsMap['To Do']) {
    statusOptionsMap['To Do'] = statusOptionsMap['Todo'];
  }

  // (c) Create Estimate NUMBER field (if it does not exist)
  const estimateField = fields.find(f => f.name === 'Estimate');
  let estimateFieldId = estimateField?.id ?? '';

  if (!estimateField) {
    const createFieldResult = await ghExec<string>(
      [
        'project', 'field-create', String(projectNum),
        '--owner', '@me',
        '--name', 'Estimate',
        '--data-type', 'NUMBER',
      ],
    );

    if (!createFieldResult.ok) {
      return fail(createFieldResult);
    }

    // Re-fetch fields to get the Estimate field ID
    const refetch = await getProjectFields(projectNum);
    if (refetch.ok) {
      const est = refetch.data.find(f => f.name === 'Estimate');
      if (est) {
        estimateFieldId = est.id;
      }
    }
  }

  // (d) Store field/option IDs in mapping file
  // Detect repo from git remote
  const repoResult = await ghExec<string>(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
  const repo = repoResult.ok ? repoResult.data.trim() : '';

  const mapping = loadMapping(cwd) ?? createEmptyMapping(repo);
  mapping.project_number = projectNum;
  mapping.project_id = projectId;
  mapping.status_field_id = statusField.id;
  mapping.status_options = statusOptionsMap;
  mapping.estimate_field_id = estimateFieldId;

  if (repo && !mapping.repo) {
    mapping.repo = repo;
  }

  saveMapping(cwd, mapping);

  return { ok: true, data: undefined };
}

// ---- Item Management -------------------------------------------------------

/**
 * Add an issue to a project board.
 *
 * Runs `gh project item-add {num} --owner @me --url {issueUrl} --format json`.
 * Returns the project item ID (different from the issue ID).
 */
export async function addItemToProject(
  projectNum: number,
  issueUrl: string,
): Promise<GhResult<{ item_id: string }>> {
  const result = await ghExec<{ id: string }>(
    [
      'project', 'item-add', String(projectNum),
      '--owner', '@me',
      '--url', issueUrl,
      '--format', 'json',
    ],
    { parseJson: true },
  );

  if (!result.ok) {
    return fail(result);
  }

  return { ok: true, data: { item_id: result.data.id } };
}

/**
 * Move a project item to a specific status column.
 *
 * Runs `gh project item-edit` with single-select-option-id for the
 * Status field.
 */
export async function moveItemToStatus(
  projectId: string,
  itemId: string,
  statusFieldId: string,
  statusOptionId: string,
): Promise<GhResult<void>> {
  const result = await ghExec<string>([
    'project', 'item-edit',
    '--project-id', projectId,
    '--id', itemId,
    '--field-id', statusFieldId,
    '--single-select-option-id', statusOptionId,
  ]);

  if (!result.ok) {
    return fail(result);
  }

  return { ok: true, data: undefined };
}

/**
 * Set the Estimate (story points) field on a project item.
 *
 * Runs `gh project item-edit` with --number flag for the Estimate field.
 */
export async function setEstimate(
  projectId: string,
  itemId: string,
  estimateFieldId: string,
  points: number,
): Promise<GhResult<void>> {
  const result = await ghExec<string>([
    'project', 'item-edit',
    '--project-id', projectId,
    '--id', itemId,
    '--field-id', estimateFieldId,
    '--number', String(points),
  ]);

  if (!result.ok) {
    return fail(result);
  }

  return { ok: true, data: undefined };
}
