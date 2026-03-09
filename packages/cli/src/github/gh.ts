/**
 * GitHub CLI Wrapper — Core gh CLI interaction layer
 *
 * Wraps the `gh` CLI using `child_process.execFile` (never `exec`) for security.
 * Provides typed results via GhResult<T> discriminated union.
 * Supports graceful degradation: detectGitHubMode() returns 'local-only'
 * when gh is not installed or not authenticated with required scopes.
 *
 * CRITICAL: Never import octokit or any npm GitHub SDK.
 * CRITICAL: Never call process.exit() — return GhResult instead.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { AuthStatus, GhErrorCode, GhResult, GitHubMode } from './types.js';

const execFileAsync = promisify(execFile);

// ---- Auth check ------------------------------------------------------------

/**
 * Check if the `gh` CLI is installed and authenticated with required scopes.
 *
 * Parses the output of `gh auth status` (which writes to stderr, not stdout).
 * Returns structured AuthStatus with scope detection for 'project' scope.
 * Timeout: 10 seconds.
 */
export async function checkGhAuth(): Promise<AuthStatus> {
  try {
    const { stdout, stderr } = await execFileAsync('gh', ['auth', 'status'], {
      timeout: 10_000,
    });

    // gh auth status writes to stderr (not stdout)
    const output = stderr || stdout;

    const authenticated = !output.includes('not logged in');

    // Parse scopes from "Token scopes: 'scope1', 'scope2', ..."
    const scopeMatch = output.match(/Token scopes?:\s*'([^']+(?:',\s*'[^']+)*)'/);
    const scopes: string[] = [];
    if (scopeMatch) {
      // Extract all quoted scope values
      const allScopes = scopeMatch[0].matchAll(/'([^']+)'/g);
      for (const m of allScopes) {
        scopes.push(m[1]);
      }
    }

    // Parse username from "Logged in to github.com as USERNAME"
    const userMatch = output.match(/Logged in to [^\s]+ as ([^\s(]+)/);

    return {
      installed: true,
      authenticated,
      scopes,
      hasProjectScope: scopes.includes('project') || scopes.includes('read:project'),
      username: userMatch ? userMatch[1] : null,
    };
  } catch (e: unknown) {
    const error = e as { code?: string; stderr?: string; message?: string };

    // ENOENT = gh CLI not found on PATH
    if (error.code === 'ENOENT') {
      return {
        installed: false,
        authenticated: false,
        scopes: [],
        hasProjectScope: false,
        username: null,
      };
    }

    // gh auth status exits with code 1 when not authenticated.
    // It may still write useful stderr — try to parse it.
    const output = error.stderr || error.message || '';

    // If stderr mentions "not logged in" or exit code 1, treat as not authenticated
    return {
      installed: true,
      authenticated: false,
      scopes: [],
      hasProjectScope: false,
      username: null,
    };
  }
}

// ---- Mode detection --------------------------------------------------------

/**
 * Detect the GitHub integration mode based on auth status.
 *
 * Returns 'full' only when gh is installed, authenticated, and has the
 * 'project' scope. Otherwise returns 'local-only' for graceful degradation.
 */
export async function detectGitHubMode(): Promise<GitHubMode> {
  const auth = await checkGhAuth();

  if (!auth.installed) {
    return 'local-only';
  }

  if (!auth.authenticated) {
    return 'local-only';
  }

  if (!auth.hasProjectScope) {
    // Warn to stderr (not stdout — stdout is reserved for MCP JSON-RPC)
    console.error(
      "[maxsim] GitHub Projects requires 'project' scope. Run: gh auth refresh -s project",
    );
    return 'local-only';
  }

  return 'full';
}

// ---- gh CLI exec -----------------------------------------------------------

/**
 * Execute a `gh` CLI command and return a typed GhResult.
 *
 * - Uses `execFile` (not `exec`) for security
 * - Default timeout: 30 seconds
 * - Auto-detects JSON output when args contain `--json` or `--format`
 * - Maps exit codes and stderr patterns to GhErrorCode
 * - For `gh issue create`: does NOT try to parse JSON (it returns a URL string)
 * - Always includes raw stderr in error messages for AI consumption
 */
export async function ghExec<T = string>(
  args: string[],
  options?: {
    cwd?: string;
    parseJson?: boolean;
    timeout?: number;
  },
): Promise<GhResult<T>> {
  const timeout = options?.timeout ?? 30_000;

  // Detect if output should be parsed as JSON
  const isIssueCreate = args[0] === 'issue' && args[1] === 'create';
  const hasJsonFlag = args.includes('--json') || args.some(a => a.startsWith('--format'));
  const shouldParseJson = options?.parseJson ?? (hasJsonFlag && !isIssueCreate);

  try {
    const { stdout, stderr } = await execFileAsync('gh', args, {
      cwd: options?.cwd,
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10 MB
    });

    if (shouldParseJson) {
      try {
        const parsed = JSON.parse(stdout) as T;
        return { ok: true, data: parsed };
      } catch {
        return {
          ok: false,
          error: `Failed to parse gh output as JSON: ${stdout.slice(0, 500)}`,
          code: 'UNKNOWN',
        };
      }
    }

    return { ok: true, data: stdout.trim() as unknown as T };
  } catch (e: unknown) {
    return mapExecError(e);
  }
}

// ---- GraphQL ---------------------------------------------------------------

/**
 * Execute a GraphQL query via `gh api graphql`.
 *
 * - String variables use `-f key=value`
 * - Non-string variables (numbers, booleans) use `-F key=value`
 * - Parses JSON response and checks for GraphQL `errors` array
 */
export async function ghGraphQL<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<GhResult<T>> {
  const args: string[] = ['api', 'graphql', '-f', `query=${query}`];

  if (variables) {
    for (const [key, value] of Object.entries(variables)) {
      if (typeof value === 'string') {
        args.push('-f', `${key}=${value}`);
      } else {
        // -F for non-string types (numbers, booleans, etc.)
        args.push('-F', `${key}=${String(value)}`);
      }
    }
  }

  const result = await ghExec<{ data?: T; errors?: Array<{ message: string }> }>(args, {
    parseJson: true,
  });

  if (!result.ok) {
    return result;
  }

  // Check for GraphQL-level errors
  if (result.data.errors && result.data.errors.length > 0) {
    const messages = result.data.errors.map(e => e.message).join('; ');
    const code = mapGraphQLErrorCode(messages);
    return { ok: false, error: `GraphQL error: ${messages}`, code };
  }

  if (result.data.data === undefined) {
    return { ok: false, error: 'GraphQL response missing data field', code: 'UNKNOWN' };
  }

  return { ok: true, data: result.data.data };
}

// ---- Error mapping ---------------------------------------------------------

/**
 * Map an execFile error to a GhResult with appropriate GhErrorCode.
 */
function mapExecError<T>(e: unknown): GhResult<T> {
  const error = e as {
    code?: string;
    stderr?: string;
    stdout?: string;
    message?: string;
    status?: number;
  };

  // gh CLI not found
  if (error.code === 'ENOENT') {
    return {
      ok: false,
      error: 'gh CLI is not installed. Install from https://cli.github.com/',
      code: 'NOT_INSTALLED',
    };
  }

  const stderr = error.stderr || error.message || '';
  const exitCode = error.status;

  // Exit code 4 = not found (gh convention)
  if (exitCode === 4) {
    return { ok: false, error: `Not found: ${stderr}`, code: 'NOT_FOUND' };
  }

  // Pattern matching on stderr for specific error types
  if (
    stderr.includes('not logged in') ||
    stderr.includes('authentication') ||
    stderr.includes('auth login') ||
    stderr.includes('401')
  ) {
    return { ok: false, error: `Authentication required: ${stderr}`, code: 'NOT_AUTHENTICATED' };
  }

  if (stderr.includes('403') || stderr.includes('permission') || stderr.includes('denied')) {
    return { ok: false, error: `Permission denied: ${stderr}`, code: 'PERMISSION_DENIED' };
  }

  if (stderr.includes('rate limit') || stderr.includes('429') || stderr.includes('API rate')) {
    return { ok: false, error: `Rate limited: ${stderr}`, code: 'RATE_LIMITED' };
  }

  if (stderr.includes('scope') || stderr.includes('insufficient')) {
    return { ok: false, error: `Missing scope: ${stderr}`, code: 'SCOPE_MISSING' };
  }

  if (stderr.includes('not found') || stderr.includes('404') || stderr.includes('Could not resolve')) {
    return { ok: false, error: `Not found: ${stderr}`, code: 'NOT_FOUND' };
  }

  return { ok: false, error: `gh command failed: ${stderr}`, code: 'UNKNOWN' };
}

/**
 * Map GraphQL error messages to GhErrorCode.
 */
function mapGraphQLErrorCode(message: string): GhErrorCode {
  const lower = message.toLowerCase();

  if (lower.includes('not found') || lower.includes('could not resolve')) {
    return 'NOT_FOUND';
  }
  if (lower.includes('insufficient') || lower.includes('scope')) {
    return 'SCOPE_MISSING';
  }
  if (lower.includes('forbidden') || lower.includes('permission')) {
    return 'PERMISSION_DENIED';
  }
  if (lower.includes('rate') || lower.includes('throttl')) {
    return 'RATE_LIMITED';
  }

  return 'UNKNOWN';
}
