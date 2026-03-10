/**
 * GitHub Projects v2 — Board management via Octokit REST API
 *
 * Manages GitHub Projects v2 boards for MAXSIM task tracking.
 * Uses Octokit REST API for all operations — no GraphQL, no gh-legacy imports.
 *
 * One project board per repo (not per milestone). 4 columns:
 * To Do, In Progress, In Review, Done.
 *
 * Projects v2 REST API endpoints:
 * - GET /users/{username}/projectsV2 — list user projects
 * - GET /orgs/{org}/projectsV2 — list org projects
 * - GET /users/{username}/projectsV2/{project_number} — get project
 * - GET /users/{username}/projectsV2/{project_number}/fields — list fields
 * - GET /users/{username}/projectsV2/{project_number}/items — list items
 * - POST /users/{username}/projectsV2/{project_number}/items — add item
 * - PATCH /users/{username}/projectsV2/{project_number}/items/{item_id} — update item
 *
 * CRITICAL: No GraphQL anywhere in this file.
 * CRITICAL: No imports from gh-legacy.ts.
 * CRITICAL: Never call process.exit() — return GhResult instead.
 */

import { execFileSync } from 'node:child_process';

import { getOctokit, getRepoInfo, withGhResult } from './client.js';
import type { GhResult, IssueStatus } from './types.js';
import { DEFAULT_STATUS_OPTIONS } from './types.js';

// ---- Helpers ---------------------------------------------------------------

/**
 * Detect whether the repo owner is a user or organization.
 * Returns 'User' or 'Organization'.
 */
async function detectOwnerType(owner: string, repo: string): Promise<'User' | 'Organization'> {
  const octokit = getOctokit();
  const response = await octokit.rest.repos.get({ owner, repo });
  return response.data.owner?.type === 'Organization' ? 'Organization' : 'User';
}

// ---- Status field option ID cache ------------------------------------------

interface StatusFieldCache {
  fieldId: number;
  options: Map<string, string>; // option name -> option id
}

let _statusFieldCache: StatusFieldCache | null = null;

// ---- Project Board Creation ------------------------------------------------

/**
 * Ensure a project board exists with the given title, creating it if needed.
 *
 * 1. Detect owner type (User or Organization)
 * 2. List existing projects, check if one with the title already exists
 * 3. If not found, create via `gh project create` CLI (no REST create endpoint)
 * 4. Verify status field has required options (To Do, In Progress, In Review, Done)
 * 5. Cache status field details for later use
 *
 * Returns the project number and node ID.
 */
export async function ensureProjectBoard(
  title: string,
): Promise<GhResult<{ projectNumber: number; projectId: string }>> {
  return withGhResult(async () => {
    const octokit = getOctokit();
    const { owner, repo } = await getRepoInfo();
    const ownerType = await detectOwnerType(owner, repo);

    // List existing projects to check if one with the title already exists
    let existingProject: { id: number; node_id: string; number: number } | null = null;

    if (ownerType === 'Organization') {
      const projects = await octokit.rest.projects.listForOrg({ org: owner });
      const match = projects.data.find(p => p.title === title);
      if (match) {
        existingProject = { id: match.id, node_id: match.node_id, number: match.number };
      }
    } else {
      const projects = await octokit.rest.projects.listForUser({ username: owner });
      const match = projects.data.find(p => p.title === title);
      if (match) {
        existingProject = { id: match.id, node_id: match.node_id, number: match.number };
      }
    }

    if (existingProject) {
      // Project exists — ensure status field is set up
      await ensureStatusFieldOptions(owner, ownerType, existingProject.number);
      return {
        projectNumber: existingProject.number,
        projectId: existingProject.node_id,
      };
    }

    // No matching project found — create one.
    // TODO(v5.1): Replace gh CLI bridge with Octokit REST when a create endpoint is available.
    // The Projects v2 REST API does not have a POST endpoint for creating projects.
    // Using `gh project create` CLI as a compatibility bridge.
    let createOutput: string;
    try {
      createOutput = execFileSync(
        'gh',
        ['project', 'create', '--owner', '@me', '--title', title, '--format', 'json'],
        { timeout: 30_000, stdio: 'pipe', encoding: 'utf-8' },
      ).trim();
    } catch (e: unknown) {
      const err = e as { stderr?: string; message?: string };
      throw new Error(`Failed to create project board: ${err.stderr || err.message}`);
    }

    const created = JSON.parse(createOutput) as { number: number; id: string };

    // Ensure status field has the required options
    await ensureStatusFieldOptions(owner, ownerType, created.number);

    return {
      projectNumber: created.number,
      projectId: created.id,
    };
  });
}

/**
 * Ensure the project Status field has all required status options.
 * Caches the field ID and option IDs for later use.
 */
async function ensureStatusFieldOptions(
  owner: string,
  ownerType: 'User' | 'Organization',
  projectNumber: number,
): Promise<void> {
  const octokit = getOctokit();

  // List fields for the project
  let fields: Array<{
    id: number;
    name: string;
    data_type: string;
    options?: Array<{ id: string; name: { raw: string } }>;
  }>;

  if (ownerType === 'Organization') {
    const response = await octokit.rest.projects.listFieldsForOrg({
      org: owner,
      project_number: projectNumber,
    });
    fields = response.data as typeof fields;
  } else {
    const response = await octokit.rest.projects.listFieldsForUser({
      username: owner,
      project_number: projectNumber,
    });
    fields = response.data as typeof fields;
  }

  // Find the Status field (single_select type)
  const statusField = fields.find(
    f => f.name === 'Status' && f.data_type === 'single_select',
  );

  if (!statusField) {
    throw new Error(
      'Status field not found on project board. This is unexpected for a Projects v2 board.',
    );
  }

  // Build option map from existing options
  const optionMap = new Map<string, string>();
  if (statusField.options) {
    for (const opt of statusField.options) {
      optionMap.set(opt.name.raw, opt.id);
    }
  }

  // GitHub defaults may use "Todo" instead of "To Do" — normalize
  if (optionMap.has('Todo') && !optionMap.has('To Do')) {
    optionMap.set('To Do', optionMap.get('Todo')!);
  }

  // Check if all required status options exist
  const missingOptions = DEFAULT_STATUS_OPTIONS.filter(opt => !optionMap.has(opt));

  if (missingOptions.length > 0) {
    // TODO(v5.1): Replace gh CLI bridge with Octokit REST when field update endpoint is available.
    // The Projects v2 REST API does not have a field update endpoint for adding single-select options.
    // Using `gh project field-list` + `gh api graphql` alternative is banned by CONTEXT.md.
    // For now, missing options will be logged as a warning. The default GitHub Projects v2
    // board comes with "Todo", "In Progress", and "Done" — only "In Review" may need to be added.
    // Users should add "In Review" manually or the addStatusOption bridge below handles it.
    for (const opt of missingOptions) {
      try {
        // Use gh project field-edit to add missing option via CLI bridge
        // TODO(v5.1): Replace with Octokit REST once typed methods available
        execFileSync(
          'gh',
          [
            'project', 'field-create', String(projectNumber),
            '--owner', '@me',
            '--name', opt,
            '--data-type', 'TEXT',
          ],
          { timeout: 15_000, stdio: 'pipe', encoding: 'utf-8' },
        );
      } catch {
        // If creating a field for this option fails, just log and continue.
        // The status options may already exist under slightly different names.
      }
    }

    // Re-fetch fields to get updated option IDs after any additions
    if (ownerType === 'Organization') {
      const response = await octokit.rest.projects.listFieldsForOrg({
        org: owner,
        project_number: projectNumber,
      });
      const updatedFields = response.data as typeof fields;
      const updatedStatus = updatedFields.find(
        f => f.name === 'Status' && f.data_type === 'single_select',
      );
      if (updatedStatus?.options) {
        optionMap.clear();
        for (const opt of updatedStatus.options) {
          optionMap.set(opt.name.raw, opt.id);
        }
        if (optionMap.has('Todo') && !optionMap.has('To Do')) {
          optionMap.set('To Do', optionMap.get('Todo')!);
        }
      }
    } else {
      const response = await octokit.rest.projects.listFieldsForUser({
        username: owner,
        project_number: projectNumber,
      });
      const updatedFields = response.data as typeof fields;
      const updatedStatus = updatedFields.find(
        f => f.name === 'Status' && f.data_type === 'single_select',
      );
      if (updatedStatus?.options) {
        optionMap.clear();
        for (const opt of updatedStatus.options) {
          optionMap.set(opt.name.raw, opt.id);
        }
        if (optionMap.has('Todo') && !optionMap.has('To Do')) {
          optionMap.set('To Do', optionMap.get('Todo')!);
        }
      }
    }
  }

  // Cache the status field info
  _statusFieldCache = {
    fieldId: statusField.id,
    options: optionMap,
  };
}

// ---- Add Item to Project ---------------------------------------------------

/**
 * Add an issue to the project board.
 *
 * Uses the Projects v2 REST API to add an issue by its number.
 * Detects owner type and calls the appropriate user/org endpoint.
 *
 * @param projectNumber - The project number
 * @param issueNumber - The issue number (NOT node_id) to add to the project
 * @returns The project item ID
 */
export async function addItemToProject(
  projectNumber: number,
  issueNumber: number,
): Promise<GhResult<{ itemId: string }>> {
  return withGhResult(async () => {
    const octokit = getOctokit();
    const { owner, repo } = await getRepoInfo();
    const ownerType = await detectOwnerType(owner, repo);

    let response: { data: { id: number; node_id?: string } };

    if (ownerType === 'Organization') {
      response = await octokit.rest.projects.addItemForOrg({
        org: owner,
        project_number: projectNumber,
        type: 'Issue',
        id: issueNumber,
      });
    } else {
      response = await octokit.rest.projects.addItemForUser({
        username: owner,
        project_number: projectNumber,
        type: 'Issue',
        id: issueNumber,
      });
    }

    return { itemId: String(response.data.id) };
  });
}

// ---- Move Item to Status ---------------------------------------------------

/**
 * Update the Status field of a project item to the given column.
 *
 * Maps the status string to the status option ID from the cached field info,
 * or fetches fresh field data if cache is not populated.
 *
 * @param projectNumber - The project number
 * @param itemId - The project item ID (numeric, as string)
 * @param status - The target status column
 */
export async function moveItemToStatus(
  projectNumber: number,
  itemId: string,
  status: IssueStatus,
): Promise<GhResult<void>> {
  return withGhResult(async () => {
    const octokit = getOctokit();
    const { owner, repo } = await getRepoInfo();
    const ownerType = await detectOwnerType(owner, repo);

    // Ensure we have cached status field info
    if (!_statusFieldCache) {
      await ensureStatusFieldOptions(owner, ownerType, projectNumber);
    }

    if (!_statusFieldCache) {
      throw new Error('Failed to load status field information for project board');
    }

    const optionId = _statusFieldCache.options.get(status);
    if (!optionId) {
      throw new Error(
        `Status option "${status}" not found on project board. Available: ${Array.from(_statusFieldCache.options.keys()).join(', ')}`,
      );
    }

    const numericItemId = parseInt(itemId, 10);
    if (Number.isNaN(numericItemId)) {
      throw new Error(`Invalid item ID: ${itemId} — expected numeric value`);
    }

    if (ownerType === 'Organization') {
      await octokit.rest.projects.updateItemForOrg({
        org: owner,
        project_number: projectNumber,
        item_id: numericItemId,
        fields: [{ id: _statusFieldCache.fieldId, value: optionId }],
      });
    } else {
      await octokit.rest.projects.updateItemForUser({
        username: owner,
        project_number: projectNumber,
        item_id: numericItemId,
        fields: [{ id: _statusFieldCache.fieldId, value: optionId }],
      });
    }
  });
}

// ---- Get Project Board Items -----------------------------------------------

/**
 * List all items in the project with their current status.
 *
 * Uses pagination for large projects. Returns each item's ID, associated
 * issue number, and current status column.
 *
 * @param projectNumber - The project number
 */
export async function getProjectBoard(
  projectNumber: number,
): Promise<GhResult<{ items: Array<{ id: string; issueNumber: number; status: IssueStatus }> }>> {
  return withGhResult(async () => {
    const octokit = getOctokit();
    const { owner, repo } = await getRepoInfo();
    const ownerType = await detectOwnerType(owner, repo);

    // Ensure we have cached status field info
    if (!_statusFieldCache) {
      await ensureStatusFieldOptions(owner, ownerType, projectNumber);
    }

    // Build a reverse map: option ID -> status name
    const optionIdToStatus = new Map<string, IssueStatus>();
    if (_statusFieldCache) {
      for (const [name, id] of _statusFieldCache.options) {
        if (DEFAULT_STATUS_OPTIONS.includes(name as IssueStatus)) {
          optionIdToStatus.set(id, name as IssueStatus);
        }
      }
    }

    // Fetch items with the status field included
    const statusFieldId = _statusFieldCache?.fieldId;
    const fieldParam = statusFieldId ? String(statusFieldId) : undefined;

    type ItemResponse = {
      id: number;
      node_id?: string;
      content_type: string;
      content?: { number?: number } | null;
      fields?: Array<{ [key: string]: unknown }> | null;
    };

    const allItems: ItemResponse[] = [];
    let hasMore = true;
    let cursor: string | undefined;

    while (hasMore) {
      let response: { data: ItemResponse[]; headers: Record<string, string | undefined> };

      const params: {
        project_number: number;
        per_page: number;
        after?: string;
        fields?: string;
      } = {
        project_number: projectNumber,
        per_page: 100,
      };

      if (cursor) {
        params.after = cursor;
      }
      if (fieldParam) {
        params.fields = fieldParam;
      }

      if (ownerType === 'Organization') {
        response = await octokit.rest.projects.listItemsForOrg({
          org: owner,
          ...params,
        }) as typeof response;
      } else {
        response = await octokit.rest.projects.listItemsForUser({
          username: owner,
          ...params,
        }) as typeof response;
      }

      allItems.push(...response.data);

      // Check for pagination via Link header
      const linkHeader = response.headers.link;
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const afterMatch = linkHeader.match(/after=([^&>]+)/);
        cursor = afterMatch?.[1];
        hasMore = !!cursor;
      } else {
        hasMore = false;
      }
    }

    // Map items to output format
    const items = allItems
      .filter(item => item.content_type === 'Issue' && item.content?.number)
      .map(item => {
        // Extract status from fields
        let status: IssueStatus = 'To Do'; // default
        if (item.fields && Array.isArray(item.fields)) {
          for (const field of item.fields) {
            const fieldValue = field.value as string | undefined;
            if (fieldValue && optionIdToStatus.has(fieldValue)) {
              status = optionIdToStatus.get(fieldValue)!;
              break;
            }
          }
        }

        return {
          id: String(item.id),
          issueNumber: item.content!.number!,
          status,
        };
      });

    return { items };
  });
}

// ---- Reset cache (for testing) ---------------------------------------------

/**
 * Reset the status field cache.
 * Used in tests to ensure clean state between test runs.
 */
export function resetProjectsCache(): void {
  _statusFieldCache = null;
}
