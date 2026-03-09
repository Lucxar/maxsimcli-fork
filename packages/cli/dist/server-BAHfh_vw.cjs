#!/usr/bin/env node
const require_cli = require('./cli.cjs');
let node_fs = require("node:fs");
node_fs = require_cli.__toESM(node_fs);
let node_path = require("node:path");
node_path = require_cli.__toESM(node_path);
let node_child_process = require("node:child_process");
let node_os = require("node:os");
node_os = require_cli.__toESM(node_os);
let node_http = require("node:http");
let express = require("express");
express = require_cli.__toESM(express);
let ws = require("ws");
let _modelcontextprotocol_sdk_server_mcp_js = require("@modelcontextprotocol/sdk/server/mcp.js");
let _modelcontextprotocol_sdk_server_streamableHttp_js = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
let detect_port = require("detect-port");
detect_port = require_cli.__toESM(detect_port);
let zod = require("zod");
let node_util = require("node:util");

//#region src/github/gh.ts
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
const execFileAsync = (0, node_util.promisify)(node_child_process.execFile);
/**
* Check if the `gh` CLI is installed and authenticated with required scopes.
*
* Parses the output of `gh auth status` (which writes to stderr, not stdout).
* Returns structured AuthStatus with scope detection for 'project' scope.
* Timeout: 10 seconds.
*/
async function checkGhAuth() {
	try {
		const { stdout, stderr } = await execFileAsync("gh", ["auth", "status"], { timeout: 1e4 });
		const output = stderr || stdout;
		const authenticated = !output.includes("not logged in");
		const scopeMatch = output.match(/Token scopes?:\s*'([^']+(?:',\s*'[^']+)*)'/);
		const scopes = [];
		if (scopeMatch) {
			const allScopes = scopeMatch[0].matchAll(/'([^']+)'/g);
			for (const m of allScopes) scopes.push(m[1]);
		}
		const userMatch = output.match(/Logged in to [^\s]+ as ([^\s(]+)/);
		return {
			installed: true,
			authenticated,
			scopes,
			hasProjectScope: scopes.includes("project") || scopes.includes("read:project"),
			username: userMatch ? userMatch[1] : null
		};
	} catch (e) {
		const error = e;
		if (error.code === "ENOENT") return {
			installed: false,
			authenticated: false,
			scopes: [],
			hasProjectScope: false,
			username: null
		};
		error.stderr || error.message;
		return {
			installed: true,
			authenticated: false,
			scopes: [],
			hasProjectScope: false,
			username: null
		};
	}
}
/**
* Detect the GitHub integration mode based on auth status.
*
* Returns 'full' only when gh is installed, authenticated, and has the
* 'project' scope. Otherwise returns 'local-only' for graceful degradation.
*/
async function detectGitHubMode() {
	const auth = await checkGhAuth();
	if (!auth.installed) return "local-only";
	if (!auth.authenticated) return "local-only";
	if (!auth.hasProjectScope) {
		console.error("[maxsim] GitHub Projects requires 'project' scope. Run: gh auth refresh -s project");
		return "local-only";
	}
	return "full";
}
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
async function ghExec(args, options) {
	const timeout = options?.timeout ?? 3e4;
	const isIssueCreate = args[0] === "issue" && args[1] === "create";
	const hasJsonFlag = args.includes("--json") || args.some((a) => a.startsWith("--format"));
	const shouldParseJson = options?.parseJson ?? (hasJsonFlag && !isIssueCreate);
	try {
		const { stdout, stderr } = await execFileAsync("gh", args, {
			cwd: options?.cwd,
			timeout,
			maxBuffer: 10 * 1024 * 1024
		});
		if (shouldParseJson) try {
			return {
				ok: true,
				data: JSON.parse(stdout)
			};
		} catch {
			return {
				ok: false,
				error: `Failed to parse gh output as JSON: ${stdout.slice(0, 500)}`,
				code: "UNKNOWN"
			};
		}
		return {
			ok: true,
			data: stdout.trim()
		};
	} catch (e) {
		return mapExecError(e);
	}
}
/**
* Execute a GraphQL query via `gh api graphql`.
*
* - String variables use `-f key=value`
* - Non-string variables (numbers, booleans) use `-F key=value`
* - Parses JSON response and checks for GraphQL `errors` array
*/
async function ghGraphQL(query, variables) {
	const args = [
		"api",
		"graphql",
		"-f",
		`query=${query}`
	];
	if (variables) for (const [key, value] of Object.entries(variables)) if (typeof value === "string") args.push("-f", `${key}=${value}`);
	else args.push("-F", `${key}=${String(value)}`);
	const result = await ghExec(args, { parseJson: true });
	if (!result.ok) return result;
	if (result.data.errors && result.data.errors.length > 0) {
		const messages = result.data.errors.map((e) => e.message).join("; ");
		const code = mapGraphQLErrorCode(messages);
		return {
			ok: false,
			error: `GraphQL error: ${messages}`,
			code
		};
	}
	if (result.data.data === void 0) return {
		ok: false,
		error: "GraphQL response missing data field",
		code: "UNKNOWN"
	};
	return {
		ok: true,
		data: result.data.data
	};
}
/**
* Map an execFile error to a GhResult with appropriate GhErrorCode.
*/
function mapExecError(e) {
	const error = e;
	if (error.code === "ENOENT") return {
		ok: false,
		error: "gh CLI is not installed. Install from https://cli.github.com/",
		code: "NOT_INSTALLED"
	};
	const stderr = error.stderr || error.message || "";
	if (error.status === 4) return {
		ok: false,
		error: `Not found: ${stderr}`,
		code: "NOT_FOUND"
	};
	if (stderr.includes("not logged in") || stderr.includes("authentication") || stderr.includes("auth login") || stderr.includes("401")) return {
		ok: false,
		error: `Authentication required: ${stderr}`,
		code: "NOT_AUTHENTICATED"
	};
	if (stderr.includes("403") || stderr.includes("permission") || stderr.includes("denied")) return {
		ok: false,
		error: `Permission denied: ${stderr}`,
		code: "PERMISSION_DENIED"
	};
	if (stderr.includes("rate limit") || stderr.includes("429") || stderr.includes("API rate")) return {
		ok: false,
		error: `Rate limited: ${stderr}`,
		code: "RATE_LIMITED"
	};
	if (stderr.includes("scope") || stderr.includes("insufficient")) return {
		ok: false,
		error: `Missing scope: ${stderr}`,
		code: "SCOPE_MISSING"
	};
	if (stderr.includes("not found") || stderr.includes("404") || stderr.includes("Could not resolve")) return {
		ok: false,
		error: `Not found: ${stderr}`,
		code: "NOT_FOUND"
	};
	return {
		ok: false,
		error: `gh command failed: ${stderr}`,
		code: "UNKNOWN"
	};
}
/**
* Map GraphQL error messages to GhErrorCode.
*/
function mapGraphQLErrorCode(message) {
	const lower = message.toLowerCase();
	if (lower.includes("not found") || lower.includes("could not resolve")) return "NOT_FOUND";
	if (lower.includes("insufficient") || lower.includes("scope")) return "SCOPE_MISSING";
	if (lower.includes("forbidden") || lower.includes("permission")) return "PERMISSION_DENIED";
	if (lower.includes("rate") || lower.includes("throttl")) return "RATE_LIMITED";
	return "UNKNOWN";
}

//#endregion
//#region src/github/mapping.ts
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
const MAPPING_FILENAME = "github-issues.json";
/**
* Get the absolute path to `.planning/github-issues.json` for a given cwd.
*/
function mappingFilePath(cwd) {
	return require_cli.planningPath(cwd, MAPPING_FILENAME);
}
/**
* Load and parse the mapping file.
*
* Returns null if the file does not exist.
* Throws on malformed JSON or invalid structure (missing required fields).
*/
function loadMapping(cwd) {
	const filePath = mappingFilePath(cwd);
	try {
		node_fs.default.statSync(filePath);
	} catch {
		return null;
	}
	const raw = node_fs.default.readFileSync(filePath, "utf-8");
	const parsed = JSON.parse(raw);
	if (typeof parsed.project_number !== "number" || typeof parsed.repo !== "string") throw new Error(`Invalid github-issues.json: missing required fields 'project_number' (number) and 'repo' (string)`);
	return parsed;
}
/**
* Write the mapping file to `.planning/github-issues.json`.
*
* Creates the `.planning/` directory if it does not exist.
* Writes with 2-space indent for readability and diff-friendliness.
*/
function saveMapping(cwd, mapping) {
	const filePath = mappingFilePath(cwd);
	const dir = node_path.default.dirname(filePath);
	node_fs.default.mkdirSync(dir, { recursive: true });
	node_fs.default.writeFileSync(filePath, JSON.stringify(mapping, null, 2) + "\n", "utf-8");
}
/**
* Update a specific task's issue mapping within a phase.
*
* Load-modify-save pattern. Creates phase entry if it does not exist.
* Merges partial data with existing entry (if any).
*
* @throws If mapping file does not exist (must be initialized first via saveMapping)
*/
function updateTaskMapping(cwd, phaseNum, taskId, data) {
	const mapping = loadMapping(cwd);
	if (!mapping) throw new Error("github-issues.json does not exist. Run project setup first.");
	if (!mapping.phases[phaseNum]) mapping.phases[phaseNum] = {
		tracking_issue: {
			number: 0,
			node_id: "",
			item_id: "",
			status: "To Do"
		},
		plan: "",
		tasks: {}
	};
	const existing = mapping.phases[phaseNum].tasks[taskId];
	const defaults = {
		number: 0,
		node_id: "",
		item_id: "",
		status: "To Do"
	};
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
function updateTodoMapping(cwd, todoId, data) {
	const mapping = loadMapping(cwd);
	if (!mapping) throw new Error("github-issues.json does not exist. Run project setup first.");
	if (!mapping.todos) mapping.todos = {};
	const existing = mapping.todos[todoId];
	const defaults = {
		number: 0,
		node_id: "",
		item_id: "",
		status: "To Do"
	};
	mapping.todos[todoId] = Object.assign(defaults, existing, data);
	saveMapping(cwd, mapping);
}
/**
* Create a properly typed empty mapping object with sensible defaults.
*
* Used during initial project setup to create the mapping file.
*/
function createEmptyMapping(repo) {
	return {
		project_number: 0,
		project_id: "",
		repo,
		status_field_id: "",
		status_options: {},
		estimate_field_id: "",
		milestone_id: 0,
		milestone_title: "",
		labels: {},
		phases: {},
		todos: {}
	};
}

//#endregion
//#region src/github/issues.ts
/**
* Parse an issue number from a `gh issue create` stdout URL.
*
* `gh issue create` outputs a URL like:
*   https://github.com/owner/repo/issues/42\n
*
* We trim whitespace and extract the last path segment as the issue number.
*/
function parseIssueNumberFromUrl(stdout) {
	const lastSegment = stdout.trim().split("/").pop();
	if (!lastSegment) return null;
	const num = parseInt(lastSegment, 10);
	return Number.isNaN(num) ? null : num;
}
/**
* After creating an issue (parsed number from URL), fetch its node_id
* via `gh issue view {number} --json nodeId,number,url`.
*/
async function fetchIssueDetails(issueNumber) {
	const result = await ghExec([
		"issue",
		"view",
		String(issueNumber),
		"--json",
		"nodeId,number,url"
	], { parseJson: true });
	if (!result.ok) return {
		ok: false,
		error: result.error,
		code: result.code
	};
	return {
		ok: true,
		data: {
			number: result.data.number,
			url: result.data.url,
			node_id: result.data.nodeId
		}
	};
}
/**
* Create a task issue with full specification body in collapsible details section.
*
* Title format: `[P{phaseNum}] {title}`
* Body includes summary, actions, acceptance criteria, dependencies in `<details>`.
* Labels: maxsim, phase-task.
*
* Returns the issue number, URL, and node_id.
*/
async function createTaskIssue(opts) {
	const issueTitle = `[P${opts.phaseNum}] ${opts.title}`;
	const depsSection = opts.dependencies && opts.dependencies.length > 0 ? `\n### Dependencies\nDepends on: ${opts.dependencies.map((d) => `#${d}`).join(", ")}\n` : "";
	const estimateSection = opts.estimate !== void 0 ? `\n### Estimate\n${opts.estimate} points\n` : "";
	const args = [
		"issue",
		"create",
		"--title",
		issueTitle,
		"--body",
		`## Summary
${opts.summary}

<details>
<summary>Full Specification</summary>

### Actions
${opts.actions.map((a) => `- ${a}`).join("\n")}

### Acceptance Criteria
${opts.acceptanceCriteria.map((c) => `- [ ] ${c}`).join("\n")}
${depsSection}${estimateSection}
</details>

---
*Phase: ${opts.phaseNum} | Plan: ${opts.planNum} | Task: ${opts.taskId}*
*Generated by MAXSIM*`
	];
	args.push("--label", "maxsim");
	args.push("--label", "phase-task");
	if (opts.labels) for (const label of opts.labels) args.push("--label", label);
	if (opts.milestone) args.push("--milestone", opts.milestone);
	if (opts.projectTitle) args.push("--project", opts.projectTitle);
	const createResult = await ghExec(args);
	if (!createResult.ok) return {
		ok: false,
		error: createResult.error,
		code: createResult.code
	};
	const issueNumber = parseIssueNumberFromUrl(createResult.data);
	if (issueNumber === null) return {
		ok: false,
		error: `Failed to parse issue number from gh output: ${createResult.data}`,
		code: "UNKNOWN"
	};
	return fetchIssueDetails(issueNumber);
}
/**
* Create a parent tracking issue for a phase with a live checkbox task list.
*
* Title format: `[Phase {phaseNum}] {phaseName}`
* Body includes task list with checkbox links: `- [ ] #{childNumber}`
* Labels: maxsim, phase-task.
*/
async function createParentTrackingIssue(opts) {
	const issueTitle = `[Phase ${opts.phaseNum}] ${opts.phaseName}`;
	const taskList = opts.childIssueNumbers.map((n) => `- [ ] #${n}`).join("\n");
	const args = [
		"issue",
		"create",
		"--title",
		issueTitle,
		"--body",
		`## Phase ${opts.phaseNum}: ${opts.phaseName}

### Tasks
${taskList}

---
*Phase tracking issue -- Generated by MAXSIM*`
	];
	args.push("--label", "maxsim");
	args.push("--label", "phase-task");
	if (opts.milestone) args.push("--milestone", opts.milestone);
	if (opts.projectTitle) args.push("--project", opts.projectTitle);
	const createResult = await ghExec(args);
	if (!createResult.ok) return {
		ok: false,
		error: createResult.error,
		code: createResult.code
	};
	const issueNumber = parseIssueNumberFromUrl(createResult.data);
	if (issueNumber === null) return {
		ok: false,
		error: `Failed to parse issue number from gh output: ${createResult.data}`,
		code: "UNKNOWN"
	};
	return fetchIssueDetails(issueNumber);
}
/**
* Create a todo issue with a lighter body (no collapsible details section).
*
* Labels: maxsim, todo.
*/
async function createTodoIssue(opts) {
	let body = "";
	if (opts.description) body += `${opts.description}\n`;
	if (opts.acceptanceCriteria && opts.acceptanceCriteria.length > 0) {
		body += `\n### Acceptance Criteria\n`;
		body += opts.acceptanceCriteria.map((c) => `- [ ] ${c}`).join("\n");
		body += "\n";
	}
	body += `\n---\n*Generated by MAXSIM*`;
	const args = [
		"issue",
		"create",
		"--title",
		opts.title,
		"--body",
		body
	];
	args.push("--label", "maxsim");
	args.push("--label", "todo");
	if (opts.milestone) args.push("--milestone", opts.milestone);
	if (opts.projectTitle) args.push("--project", opts.projectTitle);
	const createResult = await ghExec(args);
	if (!createResult.ok) return {
		ok: false,
		error: createResult.error,
		code: createResult.code
	};
	const issueNumber = parseIssueNumberFromUrl(createResult.data);
	if (issueNumber === null) return {
		ok: false,
		error: `Failed to parse issue number from gh output: ${createResult.data}`,
		code: "UNKNOWN"
	};
	return fetchIssueDetails(issueNumber);
}
/**
* Build a PR description body with `Closes #{N}` lines for auto-close on merge (AC-08).
*
* This function is called by `mcp_create_pr` in Plan 04's github-tools.ts.
*/
function buildPrBody(closesIssues, additionalContent) {
	return `${closesIssues.map((n) => `Closes #${n}`).join("\n")}${additionalContent ? `\n\n${additionalContent}` : ""}`;
}
/**
* Close an issue with an optional reason.
*
* Reason defaults to 'completed' if not specified.
*/
async function closeIssue(issueNumber, reason) {
	const args = [
		"issue",
		"close",
		String(issueNumber)
	];
	if (reason) args.push("--reason", reason);
	const result = await ghExec(args);
	if (!result.ok) return {
		ok: false,
		error: result.error,
		code: result.code
	};
	return {
		ok: true,
		data: void 0
	};
}
/**
* Close an issue as superseded by a newer issue.
*
* 1. Posts "Superseded by #{newIssueNumber}" comment on old issue
* 2. Adds 'superseded' label to old issue
* 3. Closes old issue as completed
* 4. Posts "Replaces #{oldIssueNumber}" comment on new issue
*
* Creates bidirectional cross-references.
*/
async function closeIssueAsSuperseded(oldIssueNumber, newIssueNumber) {
	const commentResult = await postComment(oldIssueNumber, `Superseded by #${newIssueNumber}`);
	if (!commentResult.ok) return {
		ok: false,
		error: commentResult.error,
		code: commentResult.code
	};
	const labelResult = await ghExec([
		"issue",
		"edit",
		String(oldIssueNumber),
		"--add-label",
		"superseded"
	]);
	if (!labelResult.ok) return {
		ok: false,
		error: labelResult.error,
		code: labelResult.code
	};
	const closeResult = await closeIssue(oldIssueNumber, "completed");
	if (!closeResult.ok) return closeResult;
	const replaceCommentResult = await postComment(newIssueNumber, `Replaces #${oldIssueNumber}`);
	if (!replaceCommentResult.ok) return {
		ok: false,
		error: replaceCommentResult.error,
		code: replaceCommentResult.code
	};
	return {
		ok: true,
		data: void 0
	};
}
/**
* Post a comment on an issue.
*/
async function postComment(issueNumber, body) {
	const result = await ghExec([
		"issue",
		"comment",
		String(issueNumber),
		"--body",
		body
	]);
	if (!result.ok) return {
		ok: false,
		error: result.error,
		code: result.code
	};
	return {
		ok: true,
		data: void 0
	};
}
/**
* Import an existing external GitHub issue into MAXSIM tracking.
*
* Reads the issue details and adds 'maxsim' and 'imported' labels.
* Returns the issue details for the AI to decide placement.
*/
async function importExternalIssue(issueNumber) {
	const viewResult = await ghExec([
		"issue",
		"view",
		String(issueNumber),
		"--json",
		"title,labels,body,state"
	], { parseJson: true });
	if (!viewResult.ok) return {
		ok: false,
		error: viewResult.error,
		code: viewResult.code
	};
	const labelResult = await ghExec([
		"issue",
		"edit",
		String(issueNumber),
		"--add-label",
		"maxsim,imported"
	]);
	if (!labelResult.ok) return {
		ok: false,
		error: labelResult.error,
		code: labelResult.code
	};
	const existingLabels = viewResult.data.labels.map((l) => l.name);
	const allLabels = Array.from(new Set([
		...existingLabels,
		"maxsim",
		"imported"
	]));
	return {
		ok: true,
		data: {
			number: issueNumber,
			title: viewResult.data.title,
			labels: allLabels
		}
	};
}
/**
* Update the parent tracking issue's task list checkbox.
*
* Reads the parent issue body, finds `- [ ] #{childNumber}` or `- [x] #{childNumber}`,
* toggles the checkbox, and updates the issue body via `gh issue edit`.
*/
async function updateParentTaskList(parentIssueNumber, childIssueNumber, checked) {
	const viewResult = await ghExec([
		"issue",
		"view",
		String(parentIssueNumber),
		"--json",
		"body"
	], { parseJson: true });
	if (!viewResult.ok) return {
		ok: false,
		error: viewResult.error,
		code: viewResult.code
	};
	const currentBody = viewResult.data.body;
	const checkboxPattern = new RegExp(`- \\[([ x])\\] #${childIssueNumber}\\b`, "g");
	const newCheckState = checked ? "x" : " ";
	const updatedBody = currentBody.replace(checkboxPattern, `- [${newCheckState}] #${childIssueNumber}`);
	if (updatedBody === currentBody) return {
		ok: true,
		data: void 0
	};
	const editResult = await ghExec([
		"issue",
		"edit",
		String(parentIssueNumber),
		"--body",
		updatedBody
	]);
	if (!editResult.ok) return {
		ok: false,
		error: editResult.error,
		code: editResult.code
	};
	return {
		ok: true,
		data: void 0
	};
}
/**
* Create all issues for a plan at once (eager creation on plan finalization).
*
* 1. Creates all task issues with concurrency limit of 5 (rate limit safety).
* 2. After all task issues created, creates parent tracking issue.
* 3. Updates mapping file for all created issues.
* 4. Returns parent issue number and all task issue numbers.
*
* Handles partial failures: continues batch, reports which failed.
*/
async function createAllPlanIssues(opts) {
	const BATCH_SIZE = 5;
	const results = [];
	const failures = [];
	for (let i = 0; i < opts.tasks.length; i += BATCH_SIZE) {
		const batchPromises = opts.tasks.slice(i, i + BATCH_SIZE).map(async (task) => {
			let depIssueNumbers;
			if (task.dependencies && task.dependencies.length > 0) depIssueNumbers = task.dependencies.map((depId) => {
				const found = results.find((r) => r.taskId === depId);
				return found ? found.issueNumber : 0;
			}).filter((n) => n > 0);
			const result = await createTaskIssue({
				title: task.title,
				phaseNum: opts.phaseNum,
				planNum: opts.planNum,
				taskId: task.taskId,
				summary: task.summary,
				actions: task.actions,
				acceptanceCriteria: task.acceptanceCriteria,
				dependencies: depIssueNumbers,
				milestone: opts.milestone,
				projectTitle: opts.projectTitle,
				estimate: task.estimate
			});
			return {
				taskId: task.taskId,
				result
			};
		});
		const batchResults = await Promise.all(batchPromises);
		for (const { taskId, result } of batchResults) if (result.ok) results.push({
			taskId,
			issueNumber: result.data.number,
			nodeId: result.data.node_id
		});
		else failures.push({
			taskId,
			error: result.error
		});
	}
	if (results.length === 0) return {
		ok: false,
		error: `All task issue creations failed: ${failures.map((f) => `${f.taskId}: ${f.error}`).join("; ")}`,
		code: "UNKNOWN"
	};
	const childNumbers = results.map((r) => r.issueNumber);
	const parentResult = await createParentTrackingIssue({
		phaseNum: opts.phaseNum,
		phaseName: opts.phaseName,
		childIssueNumbers: childNumbers,
		milestone: opts.milestone,
		projectTitle: opts.projectTitle
	});
	if (!parentResult.ok) return {
		ok: false,
		error: `Task issues created but parent tracking issue failed: ${parentResult.error}`,
		code: parentResult.code
	};
	const mapping = loadMapping(opts.cwd);
	if (mapping) {
		if (!mapping.phases[opts.phaseNum]) mapping.phases[opts.phaseNum] = {
			tracking_issue: {
				number: 0,
				node_id: "",
				item_id: "",
				status: "To Do"
			},
			plan: "",
			tasks: {}
		};
		mapping.phases[opts.phaseNum].tracking_issue = {
			number: parentResult.data.number,
			node_id: parentResult.data.node_id,
			item_id: "",
			status: "To Do"
		};
		mapping.phases[opts.phaseNum].plan = `${opts.phaseNum}-${opts.planNum}`;
		for (const r of results) mapping.phases[opts.phaseNum].tasks[r.taskId] = {
			number: r.issueNumber,
			node_id: r.nodeId,
			item_id: "",
			status: "To Do"
		};
		saveMapping(opts.cwd, mapping);
	}
	const taskIssues = results.map((r) => ({
		taskId: r.taskId,
		issueNumber: r.issueNumber
	}));
	return {
		ok: true,
		data: {
			parentIssue: parentResult.data.number,
			taskIssues
		}
	};
}
/**
* Supersede old plan's issues when a plan is re-planned (fresh issues per plan).
*
* 1. Load mapping to find old plan's issue numbers.
* 2. For each old issue, close as superseded with cross-reference to new issue.
* 3. Close old parent tracking issue as superseded.
* 4. Update mapping: mark old entries, add new entries.
*/
async function supersedePlanIssues(opts) {
	const mapping = loadMapping(opts.cwd);
	if (!mapping) return {
		ok: false,
		error: "github-issues.json does not exist. Run project setup first.",
		code: "NOT_FOUND"
	};
	const phase = mapping.phases[opts.phaseNum];
	if (!phase) return {
		ok: false,
		error: `No phase ${opts.phaseNum} found in mapping file`,
		code: "NOT_FOUND"
	};
	const currentPlan = phase.plan;
	const expectedOldPlan = `${opts.phaseNum}-${opts.oldPlanNum}`;
	if (currentPlan !== expectedOldPlan) return {
		ok: false,
		error: `Phase ${opts.phaseNum} is on plan '${currentPlan}', expected '${expectedOldPlan}'`,
		code: "UNKNOWN"
	};
	const failures = [];
	const oldTasks = Object.entries(phase.tasks);
	for (const [taskId, oldTask] of oldTasks) {
		const newIssue = opts.newIssueNumbers.find((n) => n.taskId === taskId);
		if (!newIssue) {
			const closeResult = await closeIssue(oldTask.number, "completed");
			if (!closeResult.ok) failures.push(`close task ${taskId} (#${oldTask.number}): ${closeResult.error}`);
			continue;
		}
		const supersedeResult = await closeIssueAsSuperseded(oldTask.number, newIssue.issueNumber);
		if (!supersedeResult.ok) failures.push(`supersede task ${taskId} (#${oldTask.number} -> #${newIssue.issueNumber}): ${supersedeResult.error}`);
	}
	if (phase.tracking_issue.number > 0) {
		const closeResult = await closeIssue(phase.tracking_issue.number, "completed");
		if (!closeResult.ok) failures.push(`close parent tracking issue #${phase.tracking_issue.number}: ${closeResult.error}`);
	}
	phase.plan = `${opts.phaseNum}-${opts.newPlanNum}`;
	phase.tasks = {};
	for (const newIssue of opts.newIssueNumbers) phase.tasks[newIssue.taskId] = {
		number: newIssue.issueNumber,
		node_id: "",
		item_id: "",
		status: "To Do"
	};
	saveMapping(opts.cwd, mapping);
	if (failures.length > 0) return {
		ok: false,
		error: `Partial failure during supersession: ${failures.join("; ")}`,
		code: "UNKNOWN"
	};
	return {
		ok: true,
		data: void 0
	};
}

//#endregion
//#region src/github/projects.ts
/**
* Extract error info from a failed GhResult and re-wrap it for a different
* generic type. This avoids TypeScript narrowing issues with discriminated
* union property access.
*/
function fail$2(result) {
	return {
		ok: false,
		error: result.error,
		code: result.code
	};
}
/**
* Create a new GitHub Projects v2 board.
*
* Runs `gh project create --owner @me --title "{title}" --format json`.
* Returns the project number and node ID.
*/
async function createProjectBoard(title) {
	const result = await ghExec([
		"project",
		"create",
		"--owner",
		"@me",
		"--title",
		title,
		"--format",
		"json"
	], { parseJson: true });
	if (!result.ok) return result;
	return {
		ok: true,
		data: {
			number: result.data.number,
			id: result.data.id
		}
	};
}
/**
* Ensure a project board exists, creating it if needed.
*
* Checks the mapping file for an existing project. If found, verifies it
* still exists via `gh project view`. If not found, creates a new board
* and sets up fields and status options.
*
* Returns the project number, ID, and whether it was newly created.
*/
async function ensureProjectBoard(title, cwd) {
	const mapping = loadMapping(cwd);
	if (mapping && mapping.project_number > 0 && mapping.project_id) {
		if ((await ghExec([
			"project",
			"view",
			String(mapping.project_number),
			"--owner",
			"@me",
			"--format",
			"json"
		], { parseJson: true })).ok) return {
			ok: true,
			data: {
				number: mapping.project_number,
				id: mapping.project_id,
				created: false
			}
		};
	}
	const createResult = await createProjectBoard(title);
	if (!createResult.ok) return fail$2(createResult);
	const { number, id } = createResult.data;
	const setupResult = await setupProjectFields(number, id, cwd);
	if (!setupResult.ok) return fail$2(setupResult);
	return {
		ok: true,
		data: {
			number,
			id,
			created: true
		}
	};
}
/**
* Get all fields for a project board.
*
* Runs `gh project field-list {num} --owner @me --format json`.
* Returns field list with IDs, names, types, and options (for single-select).
*/
async function getProjectFields(projectNum) {
	const result = await ghExec([
		"project",
		"field-list",
		String(projectNum),
		"--owner",
		"@me",
		"--format",
		"json"
	], { parseJson: true });
	if (!result.ok) return fail$2(result);
	return {
		ok: true,
		data: result.data.fields ?? result.data
	};
}
/**
* Add a new single-select option to a project field via GraphQL.
*
* The `updateProjectV2Field` mutation REPLACES all options, so all existing
* options must be included alongside the new one.
*
* Returns the new option's ID.
*/
async function addStatusOption(projectId, statusFieldId, optionName, existingOptions) {
	const result = await ghGraphQL(`
    mutation {
      updateProjectV2Field(input: {
        projectId: "${projectId}"
        fieldId: "${statusFieldId}"
        singleSelectOptions: [${[...existingOptions.map((o) => `{name: "${o.name}", description: "", color: GRAY}`), `{name: "${optionName}", description: "", color: BLUE}`].join(", ")}]
      }) {
        projectV2Field {
          ... on ProjectV2SingleSelectField {
            options { id name }
          }
        }
      }
    }
  `);
	if (!result.ok) return fail$2(result);
	const newOption = result.data.updateProjectV2Field.projectV2Field.options.find((o) => o.name === optionName);
	if (!newOption) return {
		ok: false,
		error: `Option "${optionName}" was not found after mutation — it may have been renamed or rejected`,
		code: "UNKNOWN"
	};
	return {
		ok: true,
		data: newOption.id
	};
}
/**
* Set up project fields: Status options and Estimate number field.
*
* Orchestrates the full field setup:
* (a) Get existing fields
* (b) Find Status field, verify "In Review" option exists or add it
* (c) Create Estimate NUMBER field via `gh project field-create`
* (d) Store all field/option IDs in the mapping file
*/
async function setupProjectFields(projectNum, projectId, cwd) {
	const fieldsResult = await getProjectFields(projectNum);
	if (!fieldsResult.ok) return fail$2(fieldsResult);
	const fields = fieldsResult.data;
	const statusField = fields.find((f) => f.name === "Status" && (f.type === "SINGLE_SELECT" || f.type === "ProjectV2SingleSelectField"));
	if (!statusField) return {
		ok: false,
		error: "Status field not found on project board. This is unexpected for a Projects v2 board.",
		code: "NOT_FOUND"
	};
	const statusOptions = statusField.options ?? [];
	const statusOptionsMap = {};
	for (const opt of statusOptions) statusOptionsMap[opt.name] = opt.id;
	if (!statusOptionsMap["In Review"]) {
		const addResult = await addStatusOption(projectId, statusField.id, "In Review", statusOptions);
		if (!addResult.ok) return fail$2(addResult);
		statusOptionsMap["In Review"] = addResult.data;
	}
	if (statusOptionsMap["Todo"] && !statusOptionsMap["To Do"]) statusOptionsMap["To Do"] = statusOptionsMap["Todo"];
	const estimateField = fields.find((f) => f.name === "Estimate");
	let estimateFieldId = estimateField?.id ?? "";
	if (!estimateField) {
		const createFieldResult = await ghExec([
			"project",
			"field-create",
			String(projectNum),
			"--owner",
			"@me",
			"--name",
			"Estimate",
			"--data-type",
			"NUMBER"
		]);
		if (!createFieldResult.ok) return fail$2(createFieldResult);
		const refetch = await getProjectFields(projectNum);
		if (refetch.ok) {
			const est = refetch.data.find((f) => f.name === "Estimate");
			if (est) estimateFieldId = est.id;
		}
	}
	const repoResult = await ghExec([
		"repo",
		"view",
		"--json",
		"nameWithOwner",
		"--jq",
		".nameWithOwner"
	]);
	const repo = repoResult.ok ? repoResult.data.trim() : "";
	const mapping = loadMapping(cwd) ?? createEmptyMapping(repo);
	mapping.project_number = projectNum;
	mapping.project_id = projectId;
	mapping.status_field_id = statusField.id;
	mapping.status_options = statusOptionsMap;
	mapping.estimate_field_id = estimateFieldId;
	if (repo && !mapping.repo) mapping.repo = repo;
	saveMapping(cwd, mapping);
	return {
		ok: true,
		data: void 0
	};
}
/**
* Add an issue to a project board.
*
* Runs `gh project item-add {num} --owner @me --url {issueUrl} --format json`.
* Returns the project item ID (different from the issue ID).
*/
async function addItemToProject(projectNum, issueUrl) {
	const result = await ghExec([
		"project",
		"item-add",
		String(projectNum),
		"--owner",
		"@me",
		"--url",
		issueUrl,
		"--format",
		"json"
	], { parseJson: true });
	if (!result.ok) return fail$2(result);
	return {
		ok: true,
		data: { item_id: result.data.id }
	};
}
/**
* Move a project item to a specific status column.
*
* Runs `gh project item-edit` with single-select-option-id for the
* Status field.
*/
async function moveItemToStatus(projectId, itemId, statusFieldId, statusOptionId) {
	const result = await ghExec([
		"project",
		"item-edit",
		"--project-id",
		projectId,
		"--id",
		itemId,
		"--field-id",
		statusFieldId,
		"--single-select-option-id",
		statusOptionId
	]);
	if (!result.ok) return fail$2(result);
	return {
		ok: true,
		data: void 0
	};
}
/**
* Set the Estimate (story points) field on a project item.
*
* Runs `gh project item-edit` with --number flag for the Estimate field.
*/
async function setEstimate(projectId, itemId, estimateFieldId, points) {
	const result = await ghExec([
		"project",
		"item-edit",
		"--project-id",
		projectId,
		"--id",
		itemId,
		"--field-id",
		estimateFieldId,
		"--number",
		String(points)
	]);
	if (!result.ok) return fail$2(result);
	return {
		ok: true,
		data: void 0
	};
}

//#endregion
//#region src/github/milestones.ts
/**
* Re-wrap a failed GhResult for a different generic type.
*/
function fail$1(result) {
	return {
		ok: false,
		error: result.error,
		code: result.code
	};
}
/**
* Create a new GitHub milestone.
*
* Uses the REST API: `POST /repos/{owner}/{repo}/milestones`.
* The `{owner}` and `{repo}` placeholders are auto-resolved by `gh api`.
*
* Returns the milestone number and internal ID.
*/
async function createMilestone(title, description) {
	const args = [
		"api",
		"repos/{owner}/{repo}/milestones",
		"-X",
		"POST",
		"-f",
		`title=${title}`,
		"-f",
		"state=open"
	];
	if (description) args.push("-f", `description=${description}`);
	const result = await ghExec(args, { parseJson: true });
	if (!result.ok) return result;
	return {
		ok: true,
		data: {
			number: result.data.number,
			id: result.data.id
		}
	};
}
/**
* Find an existing milestone by title.
*
* Uses the REST API: `GET /repos/{owner}/{repo}/milestones`.
* Fetches all open milestones and filters by exact title match.
*
* Returns null if no milestone with the given title exists.
*/
async function findMilestone(title) {
	const result = await ghExec([
		"api",
		"repos/{owner}/{repo}/milestones",
		"--paginate"
	], { parseJson: true });
	if (!result.ok) return fail$1(result);
	const match = result.data.find((m) => m.title === title);
	if (!match) return {
		ok: true,
		data: null
	};
	return {
		ok: true,
		data: {
			number: match.number,
			id: match.id
		}
	};
}
/**
* Ensure a milestone exists, creating it if needed. Idempotent.
*
* First attempts to find an existing milestone with the given title.
* If not found, creates a new one. Returns whether it was newly created.
*/
async function ensureMilestone(title, description) {
	const findResult = await findMilestone(title);
	if (!findResult.ok) return fail$1(findResult);
	if (findResult.data) return {
		ok: true,
		data: {
			...findResult.data,
			created: false
		}
	};
	const createResult = await createMilestone(title, description);
	if (!createResult.ok) return fail$1(createResult);
	return {
		ok: true,
		data: {
			...createResult.data,
			created: true
		}
	};
}
/**
* Close a milestone if all its issues are closed.
*
* Fetches milestone details via REST API to check `open_issues` count.
* If open_issues === 0, patches the milestone state to "closed".
*
* This implements AC-12: milestones auto-close when all issues are closed.
*/
async function closeMilestoneIfComplete(milestoneNumber) {
	const detailResult = await ghExec(["api", `repos/{owner}/{repo}/milestones/${milestoneNumber}`], { parseJson: true });
	if (!detailResult.ok) return fail$1(detailResult);
	const milestone = detailResult.data;
	if (milestone.state === "closed") return {
		ok: true,
		data: { closed: true }
	};
	if (milestone.open_issues > 0) return {
		ok: true,
		data: { closed: false }
	};
	const closeResult = await ghExec([
		"api",
		`repos/{owner}/{repo}/milestones/${milestoneNumber}`,
		"-X",
		"PATCH",
		"-f",
		"state=closed"
	]);
	if (!closeResult.ok) return fail$1(closeResult);
	return {
		ok: true,
		data: { closed: true }
	};
}

//#endregion
//#region src/github/sync.ts
/**
* Re-wrap a failed GhResult for a different generic type.
*/
function fail(result) {
	return {
		ok: false,
		error: result.error,
		code: result.code
	};
}
/**
* Batch-fetch issue details via a single GraphQL query.
*
* Fetches up to 100 issues per query using node ID lookups.
* Falls back to sequential `gh issue view` if GraphQL fails.
*/
async function batchFetchIssues(repo, issueNumbers) {
	if (issueNumbers.length === 0) return {
		ok: true,
		data: /* @__PURE__ */ new Map()
	};
	const [owner, name] = repo.split("/");
	if (!owner || !name) return {
		ok: false,
		error: `Invalid repo format: ${repo}. Expected "owner/repo".`,
		code: "UNKNOWN"
	};
	const BATCH_SIZE = 100;
	const resultMap = /* @__PURE__ */ new Map();
	for (let i = 0; i < issueNumbers.length; i += BATCH_SIZE) {
		const batch = issueNumbers.slice(i, i + BATCH_SIZE);
		const result = await ghGraphQL(`
      query {
        repository(owner: "${owner}", name: "${name}") {
          ${batch.map((num, idx) => `issue_${idx}: issue(number: ${num}) { number state title labels(first: 20) { nodes { name } } }`).join("\n    ")}
        }
      }
    `);
		if (!result.ok) return batchFetchIssuesSequential(issueNumbers);
		const repoData = result.data.repository;
		for (let idx = 0; idx < batch.length; idx++) {
			const issueData = repoData[`issue_${idx}`];
			if (issueData) resultMap.set(issueData.number, {
				state: issueData.state.toLowerCase(),
				title: issueData.title,
				labels: issueData.labels.nodes.map((l) => l.name)
			});
		}
	}
	return {
		ok: true,
		data: resultMap
	};
}
/**
* Sequential fallback: fetch issues one at a time via `gh issue view`.
*/
async function batchFetchIssuesSequential(issueNumbers) {
	const resultMap = /* @__PURE__ */ new Map();
	for (const num of issueNumbers) {
		const result = await ghExec([
			"issue",
			"view",
			String(num),
			"--json",
			"state,title,labels"
		], { parseJson: true });
		if (result.ok) resultMap.set(num, {
			state: result.data.state.toLowerCase(),
			title: result.data.title,
			labels: result.data.labels.map((l) => l.name)
		});
	}
	return {
		ok: true,
		data: resultMap
	};
}
/**
* Compare local mapping file against GitHub reality.
*
* For each tracked issue (phases + todos), fetches current GitHub state
* and compares against the local mapping. Reports discrepancies in
* state, title, and labels.
*
* Uses batched GraphQL for efficiency (single query for up to 100 issues).
*/
async function syncCheck(cwd) {
	const mapping = loadMapping(cwd);
	if (!mapping) return {
		ok: false,
		error: "github-issues.json does not exist. Run project setup first.",
		code: "NOT_FOUND"
	};
	if (!mapping.repo) return {
		ok: false,
		error: "No repo configured in github-issues.json.",
		code: "NOT_FOUND"
	};
	const trackedIssues = [];
	for (const [phaseNum, phase] of Object.entries(mapping.phases)) {
		if (phase.tracking_issue.number > 0) trackedIssues.push({
			issueNumber: phase.tracking_issue.number,
			localStatus: phase.tracking_issue.status,
			source: `phase ${phaseNum} tracking`
		});
		for (const [taskId, task] of Object.entries(phase.tasks)) if (task.number > 0) trackedIssues.push({
			issueNumber: task.number,
			localStatus: task.status,
			source: `phase ${phaseNum}, task ${taskId}`
		});
	}
	if (mapping.todos) {
		for (const [todoId, todo] of Object.entries(mapping.todos)) if (todo.number > 0) trackedIssues.push({
			issueNumber: todo.number,
			localStatus: todo.status,
			source: `todo ${todoId}`
		});
	}
	if (trackedIssues.length === 0) return {
		ok: true,
		data: {
			inSync: true,
			changes: []
		}
	};
	const issueNumbers = trackedIssues.map((t) => t.issueNumber);
	const fetchResult = await batchFetchIssues(mapping.repo, issueNumbers);
	if (!fetchResult.ok) return fail(fetchResult);
	const remoteStates = fetchResult.data;
	const changes = [];
	for (const tracked of trackedIssues) {
		const remote = remoteStates.get(tracked.issueNumber);
		if (!remote) {
			changes.push({
				issueNumber: tracked.issueNumber,
				field: "existence",
				localValue: "exists",
				remoteValue: "not found"
			});
			continue;
		}
		const isRemoteClosed = remote.state === "closed";
		const isLocalDone = tracked.localStatus === "Done";
		if (isRemoteClosed && !isLocalDone) changes.push({
			issueNumber: tracked.issueNumber,
			field: "state",
			localValue: tracked.localStatus,
			remoteValue: "closed (Done)"
		});
		else if (!isRemoteClosed && isLocalDone) changes.push({
			issueNumber: tracked.issueNumber,
			field: "state",
			localValue: "Done",
			remoteValue: `open (${remote.state})`
		});
	}
	return {
		ok: true,
		data: {
			inSync: changes.length === 0,
			changes
		}
	};
}

//#endregion
//#region src/mcp/utils.ts
/**
* MCP Utilities — Shared helpers for MCP tools
*
* CRITICAL: Never import output() or error() from core — they call process.exit().
* CRITICAL: Never write to stdout — it is reserved for MCP JSON-RPC protocol.
*/
/**
* Walk up from startDir to find a directory containing `.planning/`.
* Returns the directory containing `.planning/` or null if not found.
*/
let _cachedRoot;
function detectProjectRoot(startDir) {
	if (startDir === void 0 && _cachedRoot !== void 0) return _cachedRoot;
	let dir = startDir || process.cwd();
	for (let i = 0; i < 100; i++) {
		const planningDir = node_path.default.join(dir, ".planning");
		try {
			if (node_fs.default.statSync(planningDir).isDirectory()) {
				if (startDir === void 0) _cachedRoot = dir;
				return dir;
			}
		} catch {}
		const parent = node_path.default.dirname(dir);
		if (parent === dir) {
			if (startDir === void 0) _cachedRoot = null;
			return null;
		}
		dir = parent;
	}
	if (startDir === void 0) _cachedRoot = null;
	return null;
}
/**
* Return a structured MCP success response.
*/
function mcpSuccess(data, summary) {
	return { content: [{
		type: "text",
		text: JSON.stringify({
			success: true,
			data,
			summary
		}, null, 2)
	}] };
}
/**
* Return a structured MCP error response.
*/
function mcpError(error, summary) {
	return {
		content: [{
			type: "text",
			text: JSON.stringify({
				success: false,
				error,
				summary
			}, null, 2)
		}],
		isError: true
	};
}

//#endregion
//#region src/mcp/phase-tools.ts
/**
* Phase CRUD MCP Tools — Phase operations exposed as MCP tools
*
* Integrates with GitHub: phase completion triggers sync check, issue close,
* board move to Done, and milestone completion check. Find/list enrich
* responses with GitHub issue data when available.
*
* CRITICAL: Never import output() or error() from core — they call process.exit().
* CRITICAL: Never write to stdout — it is reserved for MCP JSON-RPC protocol.
* CRITICAL: Never call process.exit() — the server must stay alive after every tool call.
*/
/**
* Register all phase CRUD tools on the MCP server.
*/
function registerPhaseTools(server) {
	server.tool("mcp_find_phase", "Find a phase directory by number or name. Returns phase details including plans, summaries, and status.", { phase: zod.z.string().describe("Phase number or name (e.g. \"01\", \"1\", \"01A\", \"1.1\")") }, async ({ phase }) => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			const result = require_cli.findPhaseInternal(cwd, phase);
			if (!result) return mcpError(`Phase ${phase} not found`, "Phase not found");
			let githubTracking = null;
			let githubTaskIssues = null;
			let githubWarning;
			try {
				const mapping = loadMapping(cwd);
				if (mapping && result.phase_number) {
					const phaseMapping = mapping.phases[result.phase_number];
					if (phaseMapping) {
						if (phaseMapping.tracking_issue.number > 0) githubTracking = {
							number: phaseMapping.tracking_issue.number,
							status: phaseMapping.tracking_issue.status
						};
						const taskEntries = Object.entries(phaseMapping.tasks);
						if (taskEntries.length > 0) {
							githubTaskIssues = {};
							for (const [taskId, task] of taskEntries) if (task.number > 0) githubTaskIssues[taskId] = {
								number: task.number,
								status: task.status
							};
						}
					}
				}
			} catch (e) {
				githubWarning = `GitHub data enrichment failed: ${e.message}`;
			}
			return mcpSuccess({
				found: result.found,
				directory: result.directory,
				phase_number: result.phase_number,
				phase_name: result.phase_name,
				phase_slug: result.phase_slug,
				plans: result.plans,
				summaries: result.summaries,
				incomplete_plans: result.incomplete_plans,
				has_research: result.has_research,
				has_context: result.has_context,
				has_verification: result.has_verification,
				archived: result.archived ?? null,
				github_tracking_issue: githubTracking,
				github_task_issues: githubTaskIssues,
				...githubWarning ? { github_warning: githubWarning } : {}
			}, `Found phase ${result.phase_number}: ${result.phase_name ?? "unnamed"}`);
		} catch (e) {
			return mcpError(e.message, "Operation failed");
		}
	});
	server.tool("mcp_list_phases", "List phase directories with pagination. Returns sorted phases with offset/limit support.", {
		include_archived: zod.z.boolean().optional().default(false).describe("Include archived phases from completed milestones"),
		offset: zod.z.number().optional().default(0).describe("Number of phases to skip (for pagination)"),
		limit: zod.z.number().optional().default(20).describe("Maximum number of phases to return")
	}, async ({ include_archived, offset, limit }) => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			const phasesDir = require_cli.phasesPath(cwd);
			if (!node_fs.default.existsSync(phasesDir)) return mcpSuccess({
				directories: [],
				count: 0,
				total_count: 0,
				offset,
				limit,
				has_more: false
			}, "No phases directory found");
			let dirs = require_cli.listSubDirs(phasesDir);
			if (include_archived) {
				const archived = require_cli.getArchivedPhaseDirs(cwd);
				for (const a of archived) dirs.push(`${a.name} [${a.milestone}]`);
			}
			dirs.sort((a, b) => require_cli.comparePhaseNum(a, b));
			const total_count = dirs.length;
			const paginated = dirs.slice(offset, offset + limit);
			const has_more = offset + limit < total_count;
			let githubIssueCounts = null;
			let githubWarning;
			try {
				if (await detectGitHubMode() === "full") {
					const mapping = loadMapping(cwd);
					if (mapping && Object.keys(mapping.phases).length > 0) {
						githubIssueCounts = {};
						for (const [phaseNum, phaseData] of Object.entries(mapping.phases)) {
							let open = 0;
							let closed = 0;
							for (const task of Object.values(phaseData.tasks)) if (task.number > 0) if (task.status === "Done") closed++;
							else open++;
							githubIssueCounts[phaseNum] = {
								open,
								closed
							};
						}
					}
				}
			} catch (e) {
				githubWarning = `GitHub enrichment failed: ${e.message}`;
			}
			return mcpSuccess({
				directories: paginated,
				count: paginated.length,
				total_count,
				offset,
				limit,
				has_more,
				github_issue_counts: githubIssueCounts,
				...githubWarning ? { github_warning: githubWarning } : {}
			}, `Showing ${paginated.length} of ${total_count} phase(s)`);
		} catch (e) {
			return mcpError(e.message, "Operation failed");
		}
	});
	server.tool("mcp_create_phase", "Create a new phase. Adds the next sequential phase directory and appends to ROADMAP.md.", { name: zod.z.string().describe("Phase description/name (e.g. \"Authentication System\")") }, async ({ name }) => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			if (!name || !name.trim()) return mcpError("Phase name must not be empty", "Validation failed");
			const result = await require_cli.phaseAddCore(cwd, name, { includeStubs: true });
			return mcpSuccess({
				phase_number: result.phase_number,
				padded: result.padded,
				name: result.description,
				slug: result.slug,
				directory: result.directory
			}, `Created Phase ${result.phase_number}: ${result.description}`);
		} catch (e) {
			return mcpError(e.message, "Operation failed");
		}
	});
	server.tool("mcp_insert_phase", "Insert a decimal phase after a specified phase (e.g. 01.1 after 01). Creates directory and updates ROADMAP.md.", {
		name: zod.z.string().describe("Phase description/name"),
		after: zod.z.string().describe("Phase number to insert after (e.g. \"01\", \"1\")")
	}, async ({ name, after }) => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			if (!name || !name.trim()) return mcpError("Phase name must not be empty", "Validation failed");
			const result = await require_cli.phaseInsertCore(cwd, after, name, { includeStubs: true });
			return mcpSuccess({
				phase_number: result.phase_number,
				after_phase: result.after_phase,
				name: result.description,
				slug: result.slug,
				directory: result.directory
			}, `Inserted Phase ${result.phase_number}: ${result.description} after Phase ${result.after_phase}`);
		} catch (e) {
			return mcpError(e.message, "Operation failed");
		}
	});
	server.tool("mcp_complete_phase", "Mark a phase as complete. Updates ROADMAP.md checkbox, progress table, plan count, STATE.md, and REQUIREMENTS.md.", { phase: zod.z.string().describe("Phase number to complete (e.g. \"01\", \"1\", \"1.1\")") }, async ({ phase }) => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			let syncDiscrepancies = [];
			let githubWarning;
			try {
				if (await detectGitHubMode() === "full") {
					const syncResult = await syncCheck(cwd);
					if (syncResult.ok && !syncResult.data.inSync) syncDiscrepancies = syncResult.data.changes;
				}
			} catch (e) {
				githubWarning = `Sync check failed: ${e.message}`;
			}
			const result = await require_cli.phaseCompleteCore(cwd, phase);
			let githubClosed = false;
			let milestoneClosed = false;
			try {
				if (await detectGitHubMode() === "full") {
					const mapping = loadMapping(cwd);
					if (mapping) {
						const phaseMapping = mapping.phases[phase];
						if (phaseMapping) {
							if (phaseMapping.tracking_issue.number > 0) {
								if ((await closeIssue(phaseMapping.tracking_issue.number, "completed")).ok) {
									githubClosed = true;
									phaseMapping.tracking_issue.status = "Done";
									if (phaseMapping.tracking_issue.item_id && mapping.status_field_id && mapping.status_options["Done"]) await moveItemToStatus(mapping.project_id, phaseMapping.tracking_issue.item_id, mapping.status_field_id, mapping.status_options["Done"]);
								}
							}
							for (const [_taskId, task] of Object.entries(phaseMapping.tasks)) if (task.number > 0 && task.status !== "Done") {
								if ((await closeIssue(task.number, "completed")).ok) {
									task.status = "Done";
									if (task.item_id && mapping.status_field_id && mapping.status_options["Done"]) await moveItemToStatus(mapping.project_id, task.item_id, mapping.status_field_id, mapping.status_options["Done"]);
									if (phaseMapping.tracking_issue.number > 0) await updateParentTaskList(phaseMapping.tracking_issue.number, task.number, true);
								}
							}
							saveMapping(cwd, mapping);
							if (mapping.milestone_id > 0) {
								const msResult = await closeMilestoneIfComplete(mapping.milestone_id);
								if (msResult.ok) milestoneClosed = msResult.data.closed;
							}
						}
					}
				}
			} catch (e) {
				githubWarning = (githubWarning ? githubWarning + "; " : "") + `GitHub completion operations failed: ${e.message}`;
			}
			return mcpSuccess({
				completed_phase: result.completed_phase,
				phase_name: result.phase_name,
				plans_executed: result.plans_executed,
				next_phase: result.next_phase,
				next_phase_name: result.next_phase_name,
				is_last_phase: result.is_last_phase,
				date: result.date,
				roadmap_updated: result.roadmap_updated,
				state_updated: result.state_updated,
				sync_discrepancies: syncDiscrepancies.length > 0 ? syncDiscrepancies : null,
				github_closed: githubClosed,
				milestone_closed: milestoneClosed,
				...githubWarning ? { github_warning: githubWarning } : {}
			}, `Phase ${phase} marked as complete${result.next_phase ? `, next: Phase ${result.next_phase}` : ""}`);
		} catch (e) {
			return mcpError(e.message, "Operation failed");
		}
	});
	server.tool("mcp_bounce_issue", "Bounce a task back from In Review to In Progress with a detailed comment explaining what failed. Implements reviewer feedback loop (AC-05).", {
		issue_number: zod.z.number().describe("GitHub issue number to bounce back"),
		reason: zod.z.string().describe("Detailed reason why the task is being bounced back (reviewer feedback)")
	}, async ({ issue_number, reason }) => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			if (await detectGitHubMode() === "local-only") {
				const mapping = loadMapping(cwd);
				if (mapping) {
					if (updateLocalMappingStatus$1(mapping, issue_number, "In Progress")) {
						saveMapping(cwd, mapping);
						return mcpSuccess({
							mode: "local-only",
							issue_number,
							status: "In Progress",
							local_updated: true,
							reason
						}, `Local-only: issue #${issue_number} bounced to In Progress (reason recorded locally)`);
					}
				}
				return mcpSuccess({
					mode: "local-only",
					issue_number,
					reason,
					note: "Bounce recorded locally. GitHub operations skipped."
				}, `Local-only: bounce for issue #${issue_number} recorded`);
			}
			const mapping = loadMapping(cwd);
			let githubWarning;
			let moved = false;
			let commented = false;
			try {
				const commentResult = await postComment(issue_number, `## Bounced Back to In Progress\n\n**Reason:** ${reason}\n\n---\n*Review feedback posted by MAXSIM*`);
				commented = commentResult.ok;
				if (!commentResult.ok) githubWarning = `Comment failed: ${commentResult.error}`;
			} catch (e) {
				githubWarning = `Comment failed: ${e.message}`;
			}
			try {
				if (mapping) {
					const issueEntry = findIssueInMapping$2(mapping, issue_number);
					if (issueEntry?.item_id && mapping.status_field_id && mapping.status_options["In Progress"]) {
						const moveResult = await moveItemToStatus(mapping.project_id, issueEntry.item_id, mapping.status_field_id, mapping.status_options["In Progress"]);
						moved = moveResult.ok;
						if (!moveResult.ok) githubWarning = (githubWarning ? githubWarning + "; " : "") + `Board move failed: ${moveResult.error}`;
					}
					updateLocalMappingStatus$1(mapping, issue_number, "In Progress");
					saveMapping(cwd, mapping);
				}
			} catch (e) {
				githubWarning = (githubWarning ? githubWarning + "; " : "") + `Board move failed: ${e.message}`;
			}
			return mcpSuccess({
				mode: "full",
				issue_number,
				status: "In Progress",
				commented,
				moved,
				reason,
				...githubWarning ? { github_warning: githubWarning } : {}
			}, `Issue #${issue_number} bounced to In Progress${commented ? " with feedback comment" : ""}`);
		} catch (e) {
			return mcpError(e.message, "Operation failed");
		}
	});
}
/**
* Find an issue entry in the mapping file (searches phases and todos).
*/
function findIssueInMapping$2(mapping, issueNumber) {
	for (const phase of Object.values(mapping.phases)) {
		if (phase.tracking_issue.number === issueNumber) return phase.tracking_issue;
		for (const task of Object.values(phase.tasks)) if (task.number === issueNumber) return task;
	}
	if (mapping.todos) {
		for (const todo of Object.values(mapping.todos)) if (todo.number === issueNumber) return todo;
	}
	return null;
}
/**
* Update local mapping status for an issue (mutates mapping in-place).
* Returns true if the issue was found and updated.
*/
function updateLocalMappingStatus$1(mapping, issueNumber, status) {
	for (const phase of Object.values(mapping.phases)) {
		if (phase.tracking_issue.number === issueNumber) {
			phase.tracking_issue.status = status;
			return true;
		}
		for (const task of Object.values(phase.tasks)) if (task.number === issueNumber) {
			task.status = status;
			return true;
		}
	}
	if (mapping.todos) {
		for (const todo of Object.values(mapping.todos)) if (todo.number === issueNumber) {
			todo.status = status;
			return true;
		}
	}
	return false;
}

//#endregion
//#region src/mcp/todo-tools.ts
/**
* Todo CRUD MCP Tools — Todo operations exposed as MCP tools
*
* Integrates with GitHub: todo add creates GitHub issue in 'full' mode,
* todo complete closes GitHub issue and moves to Done on board,
* todo list enriches with GitHub issue data when available.
*
* CRITICAL: Never import output() or error() from core — they call process.exit().
* CRITICAL: Never write to stdout — it is reserved for MCP JSON-RPC protocol.
* CRITICAL: Never call process.exit() — the server must stay alive after every tool call.
*/
/**
* Register all todo CRUD tools on the MCP server.
*/
function registerTodoTools(server) {
	server.tool("mcp_add_todo", "Create a new todo item in .planning/todos/pending/ with frontmatter metadata.", {
		title: zod.z.string().describe("Title of the todo item"),
		description: zod.z.string().optional().describe("Optional description body"),
		area: zod.z.string().optional().default("general").describe("Area/category (default: general)"),
		phase: zod.z.string().optional().describe("Associated phase number")
	}, async ({ title, description, area, phase }) => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			const pendingDir = require_cli.planningPath(cwd, "todos", "pending");
			node_fs.default.mkdirSync(pendingDir, { recursive: true });
			const today = require_cli.todayISO();
			const slug = require_cli.generateSlugInternal(title) || "untitled";
			const filename = `${Date.now()}-${slug}.md`;
			const filePath = node_path.default.join(pendingDir, filename);
			const content = `---\ncreated: ${today}\ntitle: ${title}\narea: ${area || "general"}\nphase: ${phase || "unassigned"}\n---\n${description || ""}\n`;
			node_fs.default.writeFileSync(filePath, content, "utf-8");
			let githubIssueNumber = null;
			let githubIssueUrl = null;
			let githubWarning;
			try {
				if (await detectGitHubMode() === "full") {
					const mapping = loadMapping(cwd);
					const issueResult = await createTodoIssue({
						title,
						description: description || void 0,
						milestone: mapping?.milestone_title || void 0
					});
					if (issueResult.ok) {
						githubIssueNumber = issueResult.data.number;
						githubIssueUrl = issueResult.data.url;
						if (mapping && mapping.project_number > 0) {
							const issueUrl = `https://github.com/${mapping.repo}/issues/${issueResult.data.number}`;
							const addResult = await addItemToProject(mapping.project_number, issueUrl);
							if (addResult.ok) {
								updateTodoMapping(cwd, filename, {
									number: issueResult.data.number,
									node_id: issueResult.data.node_id,
									item_id: addResult.data.item_id,
									status: "To Do"
								});
								if (mapping.status_field_id && mapping.status_options["To Do"]) await moveItemToStatus(mapping.project_id, addResult.data.item_id, mapping.status_field_id, mapping.status_options["To Do"]);
							} else {
								updateTodoMapping(cwd, filename, {
									number: issueResult.data.number,
									node_id: issueResult.data.node_id,
									item_id: "",
									status: "To Do"
								});
								githubWarning = `Issue created but board add failed: ${addResult.error}`;
							}
						} else githubWarning = "Issue created but no project board configured for board tracking.";
					} else githubWarning = `GitHub issue creation failed: ${issueResult.error}`;
				}
			} catch (e) {
				githubWarning = `GitHub operation failed: ${e.message}`;
			}
			return mcpSuccess({
				file: filename,
				path: `.planning/todos/pending/${filename}`,
				title,
				area: area || "general",
				github_issue_number: githubIssueNumber,
				github_issue_url: githubIssueUrl,
				...githubWarning ? { github_warning: githubWarning } : {}
			}, `Todo created: ${title}${githubIssueNumber ? ` (GitHub #${githubIssueNumber})` : ""}`);
		} catch (e) {
			return mcpError(e.message, "Operation failed");
		}
	});
	server.tool("mcp_complete_todo", "Mark a pending todo as completed by moving it from pending/ to completed/ with a completion timestamp.", { todo_id: zod.z.string().describe("Filename of the todo (e.g., 1234567890-my-task.md)") }, async ({ todo_id }) => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			const pendingDir = require_cli.planningPath(cwd, "todos", "pending");
			const completedDir = require_cli.planningPath(cwd, "todos", "completed");
			const sourcePath = node_path.default.join(pendingDir, todo_id);
			if (!node_fs.default.existsSync(sourcePath)) return mcpError(`Todo not found in pending: ${todo_id}`, "Todo not found");
			node_fs.default.mkdirSync(completedDir, { recursive: true });
			let content = node_fs.default.readFileSync(sourcePath, "utf-8");
			const today = require_cli.todayISO();
			content = `completed: ${today}\n` + content;
			node_fs.default.writeFileSync(node_path.default.join(completedDir, todo_id), content, "utf-8");
			node_fs.default.unlinkSync(sourcePath);
			let githubClosed = false;
			let githubWarning;
			try {
				if (await detectGitHubMode() === "full") {
					const mapping = loadMapping(cwd);
					if (mapping?.todos?.[todo_id]) {
						const todoMapping = mapping.todos[todo_id];
						if (todoMapping.number > 0) {
							const closeResult = await closeIssue(todoMapping.number, "completed");
							githubClosed = closeResult.ok;
							if (!closeResult.ok) githubWarning = `GitHub issue close failed: ${closeResult.error}`;
							if (todoMapping.item_id && mapping.status_field_id && mapping.status_options["Done"]) await moveItemToStatus(mapping.project_id, todoMapping.item_id, mapping.status_field_id, mapping.status_options["Done"]);
							todoMapping.status = "Done";
							saveMapping(cwd, mapping);
						}
					}
				}
			} catch (e) {
				githubWarning = `GitHub operation failed: ${e.message}`;
			}
			return mcpSuccess({
				completed: true,
				file: todo_id,
				date: today,
				github_closed: githubClosed,
				...githubWarning ? { github_warning: githubWarning } : {}
			}, `Todo completed: ${todo_id}${githubClosed ? " (GitHub issue closed)" : ""}`);
		} catch (e) {
			return mcpError(e.message, "Operation failed");
		}
	});
	server.tool("mcp_list_todos", "List todo items, optionally filtered by area and status (pending, completed, or all).", {
		area: zod.z.string().optional().describe("Filter by area/category"),
		status: zod.z.enum([
			"pending",
			"completed",
			"all"
		]).optional().default("pending").describe("Which todos to list (default: pending)")
	}, async ({ area, status }) => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			const todosBase = require_cli.planningPath(cwd, "todos");
			const dirs = [];
			if (status === "pending" || status === "all") dirs.push(node_path.default.join(todosBase, "pending"));
			if (status === "completed" || status === "all") dirs.push(node_path.default.join(todosBase, "completed"));
			const todos = [];
			let todoMappings = null;
			let githubWarning;
			try {
				if (await detectGitHubMode() === "full") {
					const mapping = loadMapping(cwd);
					if (mapping?.todos) {
						todoMappings = {};
						for (const [todoId, data] of Object.entries(mapping.todos)) if (data.number > 0) todoMappings[todoId] = {
							number: data.number,
							status: data.status
						};
					}
				}
			} catch (e) {
				githubWarning = `GitHub enrichment failed: ${e.message}`;
			}
			for (const dir of dirs) {
				const dirStatus = dir.endsWith("pending") ? "pending" : "completed";
				let files = [];
				try {
					files = node_fs.default.readdirSync(dir).filter((f) => f.endsWith(".md"));
				} catch {
					continue;
				}
				for (const file of files) try {
					const fm = require_cli.parseTodoFrontmatter(node_fs.default.readFileSync(node_path.default.join(dir, file), "utf-8"));
					if (area && fm.area !== area) continue;
					const todoEntry = {
						file,
						created: fm.created,
						title: fm.title,
						area: fm.area,
						status: dirStatus,
						path: `.planning/todos/${dirStatus}/${file}`
					};
					if (todoMappings?.[file]) {
						todoEntry.github_issue_number = todoMappings[file].number;
						todoEntry.github_status = todoMappings[file].status;
					}
					todos.push(todoEntry);
				} catch {}
			}
			return mcpSuccess({
				count: todos.length,
				todos,
				...githubWarning ? { github_warning: githubWarning } : {}
			}, `${todos.length} todos found`);
		} catch (e) {
			return mcpError(e.message, "Operation failed");
		}
	});
}

//#endregion
//#region src/mcp/state-tools.ts
/**
* State Management MCP Tools — STATE.md operations exposed as MCP tools
*
* Integrates with GitHub: blocker add/resolve uses best-effort GitHub
* issue linking when blocker text references issue numbers.
*
* CRITICAL: Never import output() or error() from core — they call process.exit().
* CRITICAL: Never write to stdout — it is reserved for MCP JSON-RPC protocol.
* CRITICAL: Never call process.exit() — the server must stay alive after every tool call.
*/
/**
* Extract GitHub issue numbers from text.
*
* Matches patterns like "#42", "issue 42", "issue #42", "blocked by #42".
* Returns unique issue numbers found.
*/
function extractIssueNumbers(text) {
	const matches = text.matchAll(/#(\d+)|issue\s+#?(\d+)/gi);
	const numbers = /* @__PURE__ */ new Set();
	for (const match of matches) {
		const num = parseInt(match[1] || match[2], 10);
		if (!Number.isNaN(num) && num > 0) numbers.add(num);
	}
	return Array.from(numbers);
}
/**
* Register all state management tools on the MCP server.
*/
function registerStateTools(server) {
	server.tool("mcp_get_state", "Read STATE.md content — full file, a specific **field:** value, or a ## section.", { field: zod.z.string().optional().describe("Specific field or section name, or omit for full STATE.md") }, async ({ field }) => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			const stPath = require_cli.statePath(cwd);
			if (!node_fs.default.existsSync(stPath)) return mcpError("STATE.md not found", "STATE.md missing");
			const content = node_fs.default.readFileSync(stPath, "utf-8");
			if (!field) return mcpSuccess({ content }, "Full STATE.md retrieved");
			const fieldValue = require_cli.stateExtractField(content, field);
			if (fieldValue) return mcpSuccess({
				content: fieldValue,
				field
			}, `State field retrieved: ${field}`);
			const fieldEscaped = require_cli.escapeStringRegexp(field);
			const sectionPattern = new RegExp(`##\\s*${fieldEscaped}\\s*\n([\\s\\S]*?)(?=\\n##|$)`, "i");
			const sectionMatch = content.match(sectionPattern);
			if (sectionMatch) return mcpSuccess({
				content: sectionMatch[1].trim(),
				field
			}, `State section retrieved: ${field}`);
			return mcpError(`Section or field "${field}" not found in STATE.md`, "Field not found");
		} catch (e) {
			return mcpError(e.message, "Operation failed");
		}
	});
	server.tool("mcp_update_state", "Update a **field:** value in STATE.md (e.g., \"Status\", \"Current focus\").", {
		field: zod.z.string().describe("Field name (e.g., \"Status\", \"Current focus\")"),
		value: zod.z.string().describe("New value for the field")
	}, async ({ field, value }) => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			const stPath = require_cli.statePath(cwd);
			if (!node_fs.default.existsSync(stPath)) return mcpError("STATE.md not found", "STATE.md missing");
			const updated = require_cli.stateReplaceField(node_fs.default.readFileSync(stPath, "utf-8"), field, value);
			if (!updated) return mcpError(`Field "${field}" not found in STATE.md`, "Field not found");
			node_fs.default.writeFileSync(stPath, updated, "utf-8");
			return mcpSuccess({
				updated: true,
				field,
				value
			}, `State updated: ${field}`);
		} catch (e) {
			return mcpError(e.message, "Operation failed");
		}
	});
	server.tool("mcp_add_decision", "Record a decision in the Decisions section of STATE.md.", {
		summary: zod.z.string().describe("Decision summary"),
		rationale: zod.z.string().optional().describe("Optional rationale"),
		phase: zod.z.string().optional().describe("Associated phase number")
	}, async ({ summary, rationale, phase }) => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			const stPath = require_cli.statePath(cwd);
			if (!node_fs.default.existsSync(stPath)) return mcpError("STATE.md not found", "STATE.md missing");
			const content = node_fs.default.readFileSync(stPath, "utf-8");
			const entry = `- [Phase ${phase || "?"}]: ${summary}${rationale ? ` -- ${rationale}` : ""}`;
			const updated = require_cli.appendToStateSection(content, /(###?\s*(?:Decisions|Decisions Made|Accumulated.*Decisions)\s*\n)([\s\S]*?)(?=\n###?|\n##[^#]|$)/i, entry, [/None yet\.?\s*\n?/gi, /No decisions yet\.?\s*\n?/gi]);
			if (!updated) return mcpError("Decisions section not found in STATE.md", "Section not found");
			node_fs.default.writeFileSync(stPath, updated, "utf-8");
			return mcpSuccess({
				added: true,
				decision: entry
			}, "Decision recorded");
		} catch (e) {
			return mcpError(e.message, "Operation failed");
		}
	});
	server.tool("mcp_add_blocker", "Add a blocker entry to the Blockers section of STATE.md.", { text: zod.z.string().describe("Blocker description") }, async ({ text }) => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			const stPath = require_cli.statePath(cwd);
			if (!node_fs.default.existsSync(stPath)) return mcpError("STATE.md not found", "STATE.md missing");
			const updated = require_cli.appendToStateSection(node_fs.default.readFileSync(stPath, "utf-8"), /(###?\s*(?:Blockers|Blockers\/Concerns|Concerns)\s*\n)([\s\S]*?)(?=\n###?|\n##[^#]|$)/i, `- ${text}`, [/None\.?\s*\n?/gi, /None yet\.?\s*\n?/gi]);
			if (!updated) return mcpError("Blockers section not found in STATE.md", "Section not found");
			node_fs.default.writeFileSync(stPath, updated, "utf-8");
			let githubLinked = [];
			let githubWarning;
			try {
				if (await detectGitHubMode() === "full") {
					const issueNumbers = extractIssueNumbers(text);
					if (issueNumbers.length > 0) {
						for (const issueNum of issueNumbers) if ((await postComment(issueNum, `**Blocker added in MAXSIM:**\n\n${text}\n\n---\n*Posted by MAXSIM blocker tracking*`)).ok) githubLinked.push(issueNum);
					}
				}
			} catch (e) {
				githubWarning = `GitHub linking failed: ${e.message}`;
			}
			return mcpSuccess({
				added: true,
				blocker: text,
				github_linked_issues: githubLinked.length > 0 ? githubLinked : null,
				...githubWarning ? { github_warning: githubWarning } : {}
			}, `Blocker added${githubLinked.length > 0 ? ` (linked to ${githubLinked.map((n) => `#${n}`).join(", ")})` : ""}`);
		} catch (e) {
			return mcpError(e.message, "Operation failed");
		}
	});
	server.tool("mcp_resolve_blocker", "Remove a blocker from STATE.md by matching text (case-insensitive partial match).", { text: zod.z.string().describe("Text to match against blocker entries (case-insensitive partial match)") }, async ({ text }) => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			const stPath = require_cli.statePath(cwd);
			if (!node_fs.default.existsSync(stPath)) return mcpError("STATE.md not found", "STATE.md missing");
			let content = node_fs.default.readFileSync(stPath, "utf-8");
			const sectionPattern = /(###?\s*(?:Blockers|Blockers\/Concerns|Concerns)\s*\n)([\s\S]*?)(?=\n###?|\n##[^#]|$)/i;
			const match = content.match(sectionPattern);
			if (!match) return mcpError("Blockers section not found in STATE.md", "Section not found");
			const lines = match[2].split("\n");
			const matchingLines = [];
			let newBody = lines.filter((line) => {
				if (!line.startsWith("- ")) return true;
				if (line.toLowerCase().includes(text.toLowerCase())) {
					matchingLines.push(line);
					return false;
				}
				return true;
			}).join("\n");
			if (!newBody.trim() || !newBody.includes("- ")) newBody = "None\n";
			content = content.replace(sectionPattern, (_match, header) => `${header}${newBody}`);
			node_fs.default.writeFileSync(stPath, content, "utf-8");
			let githubCommented = [];
			let githubWarning;
			try {
				if (await detectGitHubMode() === "full") {
					const issueNumbers = extractIssueNumbers(matchingLines.join(" ") + " " + text);
					if (issueNumbers.length > 0) {
						for (const issueNum of issueNumbers) if ((await postComment(issueNum, `**Blocker resolved in MAXSIM:**\n\nResolved blocker matching: "${text}"\n\n---\n*Posted by MAXSIM blocker tracking*`)).ok) githubCommented.push(issueNum);
					}
				}
			} catch (e) {
				githubWarning = `GitHub comment failed: ${e.message}`;
			}
			return mcpSuccess({
				resolved: true,
				blocker: text,
				github_commented_issues: githubCommented.length > 0 ? githubCommented : null,
				...githubWarning ? { github_warning: githubWarning } : {}
			}, `Blocker resolved${githubCommented.length > 0 ? ` (commented on ${githubCommented.map((n) => `#${n}`).join(", ")})` : ""}`);
		} catch (e) {
			return mcpError(e.message, "Operation failed");
		}
	});
}

//#endregion
//#region src/mcp/context-tools.ts
/**
* Context Query MCP Tools — Project context exposed as MCP tools
*
* CRITICAL: Never import output() or error() from core — they call process.exit().
* CRITICAL: Never write to stdout — it is reserved for MCP JSON-RPC protocol.
* CRITICAL: Never call process.exit() — the server must stay alive after every tool call.
*/
/**
* Register all context query tools on the MCP server.
*/
function registerContextTools(server) {
	server.tool("mcp_get_active_phase", "Get the currently active phase and next phase from roadmap analysis and STATE.md.", {}, async () => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			const roadmapResult = await require_cli.cmdRoadmapAnalyze(cwd);
			let current_phase = null;
			let next_phase = null;
			let phase_name = null;
			let status = null;
			if (roadmapResult.ok) {
				const data = roadmapResult.result;
				current_phase = data.current_phase ?? null;
				next_phase = data.next_phase ?? null;
			}
			const stateContent = require_cli.safeReadFile(require_cli.planningPath(cwd, "STATE.md"));
			if (stateContent) {
				const statePhase = require_cli.stateExtractField(stateContent, "Current Phase");
				if (statePhase) phase_name = statePhase;
				const stateStatus = require_cli.stateExtractField(stateContent, "Status");
				if (stateStatus) status = stateStatus;
			}
			return mcpSuccess({
				current_phase,
				next_phase,
				phase_name,
				status
			}, `Active phase: ${phase_name ?? current_phase ?? "unknown"}`);
		} catch (e) {
			return mcpError("Failed: " + e.message, "Error occurred");
		}
	});
	server.tool("mcp_get_guidelines", "Get project guidelines: PROJECT.md vision, config, and optionally phase-specific context.", { phase: zod.z.string().optional().describe("Optional phase number to include phase-specific context") }, async ({ phase }) => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			const project_vision = require_cli.safeReadFile(require_cli.planningPath(cwd, "PROJECT.md"));
			const config = require_cli.loadConfig(cwd);
			let phase_context = null;
			if (phase) {
				const phaseInfo = require_cli.findPhaseInternal(cwd, phase);
				if (phaseInfo) phase_context = require_cli.safeReadFile(node_path.default.join(phaseInfo.directory, `${phaseInfo.phase_number}-CONTEXT.md`));
			}
			return mcpSuccess({
				project_vision,
				config,
				phase_context
			}, `Guidelines loaded${phase ? ` with phase ${phase} context` : ""}`);
		} catch (e) {
			return mcpError("Failed: " + e.message, "Error occurred");
		}
	});
	server.tool("mcp_get_context_for_task", "Load context files for a task. Includes project context, roadmap, artefakte, and codebase docs filtered by topic. Topic keywords select relevant codebase docs: \"ui/frontend\" loads CONVENTIONS+STRUCTURE, \"api/backend\" loads ARCHITECTURE+CONVENTIONS, \"testing\" loads TESTING+CONVENTIONS, \"database\" loads ARCHITECTURE+STACK, \"refactor\" loads CONCERNS+ARCHITECTURE. Without topic, defaults to STACK+ARCHITECTURE.", {
		phase: zod.z.string().optional().describe("Phase number to scope context to"),
		topic: zod.z.string().optional().describe("Topic keywords to filter codebase docs (e.g. \"frontend\", \"api\", \"testing\", \"database\", \"refactor\")")
	}, async ({ phase, topic }) => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			const result = require_cli.cmdContextLoad(cwd, phase, topic, true);
			if (!result.ok) return mcpError(result.error, "Context load failed");
			return mcpSuccess({ context: result.result }, `Context loaded${phase ? ` for phase ${phase}` : ""}${topic ? ` topic "${topic}"` : ""}`);
		} catch (e) {
			return mcpError("Failed: " + e.message, "Error occurred");
		}
	});
	server.tool("mcp_get_project_overview", "Get a high-level project overview: PROJECT.md, REQUIREMENTS.md, and STATE.md contents.", {}, async () => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			return mcpSuccess({
				project: require_cli.safeReadFile(require_cli.planningPath(cwd, "PROJECT.md")),
				requirements: require_cli.safeReadFile(require_cli.planningPath(cwd, "REQUIREMENTS.md")),
				state: require_cli.safeReadFile(require_cli.planningPath(cwd, "STATE.md"))
			}, "Project overview loaded");
		} catch (e) {
			return mcpError("Failed: " + e.message, "Error occurred");
		}
	});
	server.tool("mcp_get_phase_detail", "Get detailed information about a specific phase including all its files (plans, summaries, context, research, verification).", { phase: zod.z.string().describe("Phase number or name (e.g. \"01\", \"1\", \"01A\")") }, async ({ phase }) => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			const phaseInfo = require_cli.findPhaseInternal(cwd, phase);
			if (!phaseInfo) return mcpError(`Phase ${phase} not found`, "Phase not found");
			const files = [];
			try {
				const entries = node_fs.default.readdirSync(phaseInfo.directory);
				for (const entry of entries) {
					const fullPath = node_path.default.join(phaseInfo.directory, entry);
					if (node_fs.default.statSync(fullPath).isFile()) files.push({
						name: entry,
						content: require_cli.safeReadFile(fullPath)
					});
				}
			} catch {}
			return mcpSuccess({
				phase_number: phaseInfo.phase_number,
				phase_name: phaseInfo.phase_name,
				directory: phaseInfo.directory,
				files
			}, `Phase ${phaseInfo.phase_number} detail: ${files.length} file(s)`);
		} catch (e) {
			return mcpError("Failed: " + e.message, "Error occurred");
		}
	});
}

//#endregion
//#region src/mcp/roadmap-tools.ts
/**
* Register all roadmap query tools on the MCP server.
*/
function registerRoadmapTools(server) {
	server.tool("mcp_get_roadmap", "Get the full roadmap analysis including all phases, their status, and progress.", {}, async () => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			const result = await require_cli.cmdRoadmapAnalyze(cwd);
			if (!result.ok) return mcpError(result.error, "Roadmap analysis failed");
			return mcpSuccess({ roadmap: result.result }, "Roadmap analysis complete");
		} catch (e) {
			return mcpError("Failed: " + e.message, "Error occurred");
		}
	});
	server.tool("mcp_get_roadmap_progress", "Get a focused progress summary: total phases, completed, in-progress, not started, and progress percentage.", {}, async () => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			const result = await require_cli.cmdRoadmapAnalyze(cwd);
			if (!result.ok) return mcpError(result.error, "Roadmap analysis failed");
			const data = result.result;
			const phases = data.phases ?? [];
			const total_phases = phases.length;
			let completed = 0;
			let in_progress = 0;
			let not_started = 0;
			for (const p of phases) {
				const status = String(p.status ?? "").toLowerCase();
				if (status === "completed" || status === "done") completed++;
				else if (status === "in-progress" || status === "in_progress" || status === "active") in_progress++;
				else not_started++;
			}
			const progress_percent = total_phases > 0 ? Math.round(completed / total_phases * 100) : 0;
			return mcpSuccess({
				total_phases,
				completed,
				in_progress,
				not_started,
				progress_percent,
				current_phase: data.current_phase ?? null,
				next_phase: data.next_phase ?? null
			}, `Progress: ${completed}/${total_phases} phases complete (${progress_percent}%)`);
		} catch (e) {
			return mcpError("Failed: " + e.message, "Error occurred");
		}
	});
}

//#endregion
//#region src/mcp/config-tools.ts
/**
* Config Query MCP Tools — Project configuration exposed as MCP tools
*
* CRITICAL: Never import output() or error() from core — they call process.exit().
* CRITICAL: Never write to stdout — it is reserved for MCP JSON-RPC protocol.
* CRITICAL: Never call process.exit() — the server must stay alive after every tool call.
*/
/**
* Register all config query tools on the MCP server.
*/
function registerConfigTools(server) {
	server.tool("mcp_get_config", "Get project configuration. Optionally provide a key path to get a specific value.", { key: zod.z.string().optional().describe("Optional dot-separated key path (e.g. \"model_profile\", \"branching.strategy\")") }, async ({ key }) => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			if (key) {
				const result = require_cli.cmdConfigGet(cwd, key, true);
				if (!result.ok) return mcpError(result.error, "Config get failed");
				return mcpSuccess({
					key,
					value: result.rawValue ?? result.result
				}, `Config value for "${key}"`);
			}
			return mcpSuccess({ config: require_cli.loadConfig(cwd) }, "Full configuration loaded");
		} catch (e) {
			return mcpError("Failed: " + e.message, "Error occurred");
		}
	});
	server.tool("mcp_update_config", "Update a project configuration value by key path.", {
		key: zod.z.string().describe("Dot-separated key path (e.g. \"model_profile\", \"branching.strategy\")"),
		value: zod.z.string().describe("New value to set")
	}, async ({ key, value }) => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			const result = require_cli.cmdConfigSet(cwd, key, value, true);
			if (!result.ok) return mcpError(result.error, "Config update failed");
			return mcpSuccess({
				updated: true,
				key,
				value
			}, `Config "${key}" updated to "${value}"`);
		} catch (e) {
			return mcpError("Failed: " + e.message, "Error occurred");
		}
	});
}

//#endregion
//#region src/github/types.ts
const MAXSIM_LABELS = [
	{
		name: "maxsim",
		color: "6f42c1",
		description: "MAXSIM managed issue"
	},
	{
		name: "phase-task",
		color: "0075ca",
		description: "MAXSIM phase task"
	},
	{
		name: "todo",
		color: "fbca04",
		description: "MAXSIM todo item"
	},
	{
		name: "imported",
		color: "e4e669",
		description: "Imported into MAXSIM tracking"
	},
	{
		name: "superseded",
		color: "d73a4a",
		description: "Superseded by newer plan"
	}
];
const FIBONACCI_POINTS = [
	1,
	2,
	3,
	5,
	8,
	13,
	21,
	34
];

//#endregion
//#region src/github/labels.ts
/**
* Ensure all MAXSIM labels exist on the repository.
*
* Iterates over MAXSIM_LABELS and runs `gh label create` with `--force`
* for each label. The `--force` flag updates existing labels with the
* specified color and description.
*
* Continues on individual label failures (logs to stderr).
* Only fails if ALL labels fail to create.
*/
async function ensureLabels() {
	let successCount = 0;
	const errors = [];
	for (const label of MAXSIM_LABELS) {
		const result = await ghExec([
			"label",
			"create",
			label.name,
			"--color",
			label.color,
			"--description",
			label.description,
			"--force"
		]);
		if (result.ok) successCount++;
		else {
			const errMsg = result.error;
			console.error(`[maxsim] Failed to create label "${label.name}": ${errMsg}`);
			errors.push(`${label.name}: ${errMsg}`);
		}
	}
	if (successCount === 0 && errors.length > 0) return {
		ok: false,
		error: `All labels failed to create: ${errors.join("; ")}`,
		code: "UNKNOWN"
	};
	return {
		ok: true,
		data: void 0
	};
}

//#endregion
//#region src/github/templates.ts
/**
* GitHub Issue Templates — Template file generation
*
* Installs GitHub Issue Form YAML templates into `.github/ISSUE_TEMPLATE/`
* for the MAXSIM-managed issue types: phase tasks and todos.
*
* These are file-system operations only (no gh CLI needed).
* Uses synchronous fs to match existing core module patterns.
*
* CRITICAL: Never call process.exit().
*/
/**
* Phase task issue template (GitHub Issue Forms YAML format).
*
* Used for issues created from MAXSIM phase plans.
* Labels: maxsim, phase-task
*/
const PHASE_TASK_TEMPLATE = `name: "MAXSIM Phase Task"
description: "Task generated by MAXSIM phase planning"
labels: ["maxsim", "phase-task"]
body:
  - type: markdown
    attributes:
      value: |
        This issue was auto-generated by MAXSIM.

  - type: textarea
    id: summary
    attributes:
      label: Summary
      description: Task summary
    validations:
      required: true

  - type: textarea
    id: spec
    attributes:
      label: Full Specification
      description: Detailed task specification including actions, criteria, and dependencies
`;
/**
* Todo issue template (GitHub Issue Forms YAML format).
*
* Used for issues created from MAXSIM todo items.
* Labels: maxsim, todo
*/
const TODO_TEMPLATE = `name: "MAXSIM Todo"
description: "Todo item tracked by MAXSIM"
labels: ["maxsim", "todo"]
body:
  - type: textarea
    id: description
    attributes:
      label: Description
      description: Brief description of the todo item
    validations:
      required: true

  - type: textarea
    id: acceptance
    attributes:
      label: Acceptance Criteria
      description: What defines "done" for this todo?
`;
/**
* Install MAXSIM issue templates into the project's `.github/ISSUE_TEMPLATE/` directory.
*
* Creates the directory recursively if it does not exist.
* Writes two YAML files:
*   - phase-task.yml (for phase plan tasks)
*   - todo.yml (for todo items)
*
* Overwrites existing templates if present (to ensure latest version).
* This is a synchronous file write operation (no gh CLI needed).
*/
function installIssueTemplates(cwd) {
	const templateDir = node_path.default.join(cwd, ".github", "ISSUE_TEMPLATE");
	node_fs.default.mkdirSync(templateDir, { recursive: true });
	node_fs.default.writeFileSync(node_path.default.join(templateDir, "phase-task.yml"), PHASE_TASK_TEMPLATE, "utf-8");
	node_fs.default.writeFileSync(node_path.default.join(templateDir, "todo.yml"), TODO_TEMPLATE, "utf-8");
}

//#endregion
//#region src/mcp/github-tools.ts
/**
* GitHub Issue Lifecycle MCP Tools — GitHub operations exposed as MCP tools
*
* Provides MCP tools for issue CRUD, PR creation with auto-close linking (AC-08),
* sync checking (AC-09), and issue import. Every tool checks detectGitHubMode()
* and degrades gracefully to local-only behavior when GitHub is not configured.
*
* CRITICAL: Never import output() or error() from core — they call process.exit().
* CRITICAL: Never write to stdout — it is reserved for MCP JSON-RPC protocol.
* CRITICAL: Never call process.exit() — the server must stay alive after every tool call.
*/
/**
* Register all GitHub issue lifecycle tools on the MCP server.
*/
function registerGitHubTools(server) {
	server.tool("mcp_github_setup", "Set up GitHub integration: create project board, labels, milestone, and issue templates.", { milestone_title: zod.z.string().optional().describe("Milestone title (defaults to current milestone from STATE.md)") }, async ({ milestone_title }) => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			if (await detectGitHubMode() === "local-only") {
				installIssueTemplates(cwd);
				return mcpSuccess({
					mode: "local-only",
					templates_installed: true,
					board_created: false,
					labels_created: false,
					milestone_created: false
				}, "Local-only mode: installed issue templates only. Run `gh auth login` with project scope for full GitHub integration.");
			}
			const boardResult = await ensureProjectBoard("MAXSIM Task Board", cwd);
			if (!boardResult.ok) return mcpError(`Board setup failed: ${boardResult.error}`, "Setup failed");
			const labelsResult = await ensureLabels();
			if (!labelsResult.ok) return mcpError(`Label setup failed: ${labelsResult.error}`, "Setup failed");
			let milestoneData = null;
			if (milestone_title) {
				const msResult = await ensureMilestone(milestone_title);
				if (msResult.ok) {
					milestoneData = msResult.data;
					const mapping = loadMapping(cwd);
					if (mapping) {
						mapping.milestone_id = msResult.data.number;
						mapping.milestone_title = milestone_title;
						saveMapping(cwd, mapping);
					}
				}
			}
			installIssueTemplates(cwd);
			return mcpSuccess({
				mode: "full",
				board: {
					number: boardResult.data.number,
					created: boardResult.data.created
				},
				labels_created: true,
				milestone: milestoneData ? {
					number: milestoneData.number,
					title: milestone_title,
					created: milestoneData.created
				} : null,
				templates_installed: true
			}, `GitHub integration set up: board #${boardResult.data.number}, labels, ${milestoneData ? `milestone "${milestone_title}"` : "no milestone"}, templates`);
		} catch (e) {
			return mcpError(e.message, "Operation failed");
		}
	});
	server.tool("mcp_create_plan_issues", "Create GitHub issues for all tasks in a finalized plan. Creates task issues and parent tracking issue.", {
		phase: zod.z.string().describe("Phase number (e.g. \"01\")"),
		plan: zod.z.string().describe("Plan number (e.g. \"01\")"),
		phase_name: zod.z.string().describe("Phase description for the tracking issue title"),
		tasks: zod.z.array(zod.z.object({
			taskId: zod.z.string(),
			title: zod.z.string(),
			summary: zod.z.string(),
			actions: zod.z.array(zod.z.string()),
			acceptanceCriteria: zod.z.array(zod.z.string()),
			dependencies: zod.z.array(zod.z.string()).optional(),
			estimate: zod.z.number().optional()
		})).describe("Array of task objects to create issues for"),
		milestone: zod.z.string().optional().describe("Milestone title to assign")
	}, async ({ phase, plan, phase_name, tasks, milestone }) => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			if (await detectGitHubMode() === "local-only") return mcpSuccess({
				mode: "local-only",
				warning: "GitHub not configured, issues not created",
				tasks_count: tasks.length
			}, "Local-only mode: GitHub issues not created. Run `gh auth login` for full integration.");
			const mapping = loadMapping(cwd);
			const result = await createAllPlanIssues({
				phaseNum: phase,
				planNum: plan,
				phaseName: phase_name,
				tasks,
				milestone,
				projectTitle: mapping?.project_number ? void 0 : void 0,
				cwd
			});
			if (!result.ok) return mcpError(`Issue creation failed: ${result.error}`, "Creation failed");
			if (mapping && mapping.project_number > 0) {
				const repo = mapping.repo;
				const allIssueNumbers = [result.data.parentIssue, ...result.data.taskIssues.map((t) => t.issueNumber)];
				for (const issueNum of allIssueNumbers) {
					const issueUrl = `https://github.com/${repo}/issues/${issueNum}`;
					const addResult = await addItemToProject(mapping.project_number, issueUrl);
					if (addResult.ok) {
						const taskEntry = result.data.taskIssues.find((t) => t.issueNumber === issueNum);
						if (taskEntry) updateTaskMapping(cwd, phase, taskEntry.taskId, { item_id: addResult.data.item_id });
						if (mapping.status_options["To Do"] && mapping.status_field_id) await moveItemToStatus(mapping.project_id, addResult.data.item_id, mapping.status_field_id, mapping.status_options["To Do"]);
						if (taskEntry && mapping.estimate_field_id) {
							const taskDef = tasks.find((t) => t.taskId === taskEntry.taskId);
							if (taskDef?.estimate) await setEstimate(mapping.project_id, addResult.data.item_id, mapping.estimate_field_id, taskDef.estimate);
						}
					}
				}
			}
			return mcpSuccess({
				mode: "full",
				parent_issue: result.data.parentIssue,
				task_issues: result.data.taskIssues,
				total_created: result.data.taskIssues.length + 1
			}, `Created ${result.data.taskIssues.length} task issues + parent tracking issue #${result.data.parentIssue}`);
		} catch (e) {
			return mcpError(e.message, "Operation failed");
		}
	});
	server.tool("mcp_create_todo_issue", "Create a GitHub issue for a todo item.", {
		title: zod.z.string().describe("Todo title"),
		description: zod.z.string().optional().describe("Todo description"),
		acceptance_criteria: zod.z.array(zod.z.string()).optional().describe("Acceptance criteria list")
	}, async ({ title, description, acceptance_criteria }) => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			if (await detectGitHubMode() === "local-only") return mcpSuccess({
				mode: "local-only",
				warning: "GitHub not configured. Use mcp_add_todo for local todo tracking.",
				title
			}, "Local-only mode: GitHub todo issue not created.");
			const mapping = loadMapping(cwd);
			const result = await createTodoIssue({
				title,
				description,
				acceptanceCriteria: acceptance_criteria,
				milestone: mapping?.milestone_title || void 0
			});
			if (!result.ok) return mcpError(`Todo issue creation failed: ${result.error}`, "Creation failed");
			if (mapping && mapping.project_number > 0) {
				const issueUrl = `https://github.com/${mapping.repo}/issues/${result.data.number}`;
				const addResult = await addItemToProject(mapping.project_number, issueUrl);
				if (addResult.ok && mapping) {
					if (!mapping.todos) mapping.todos = {};
					mapping.todos[`todo-${result.data.number}`] = {
						number: result.data.number,
						node_id: result.data.node_id,
						item_id: addResult.data.item_id,
						status: "To Do"
					};
					saveMapping(cwd, mapping);
				}
			}
			return mcpSuccess({
				mode: "full",
				issue_number: result.data.number,
				url: result.data.url
			}, `Created todo issue #${result.data.number}: ${title}`);
		} catch (e) {
			return mcpError(e.message, "Operation failed");
		}
	});
	server.tool("mcp_move_issue", "Move a GitHub issue to a new status column (To Do, In Progress, In Review, Done).", {
		issue_number: zod.z.number().describe("GitHub issue number"),
		status: zod.z.enum([
			"To Do",
			"In Progress",
			"In Review",
			"Done"
		]).describe("Target status column")
	}, async ({ issue_number, status }) => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			const mode = await detectGitHubMode();
			const mapping = loadMapping(cwd);
			if (mode === "local-only") {
				if (mapping) {
					if (updateLocalMappingStatus(mapping, issue_number, status)) {
						saveMapping(cwd, mapping);
						return mcpSuccess({
							mode: "local-only",
							issue_number,
							status,
							local_updated: true
						}, `Local mapping updated: issue #${issue_number} -> ${status}`);
					}
				}
				return mcpError(`Issue #${issue_number} not found in local mapping`, "Issue not tracked");
			}
			if (!mapping) return mcpError("github-issues.json not found. Run mcp_github_setup first.", "Setup required");
			const issueEntry = findIssueInMapping$1(mapping, issue_number);
			if (!issueEntry) return mcpError(`Issue #${issue_number} not found in local mapping`, "Issue not tracked");
			if (!issueEntry.item_id) return mcpError(`Issue #${issue_number} has no project item_id. It may not have been added to the board.`, "Not on board");
			const statusOptionId = mapping.status_options[status];
			if (!statusOptionId) return mcpError(`Status "${status}" not found in project board options`, "Invalid status");
			const moveResult = await moveItemToStatus(mapping.project_id, issueEntry.item_id, mapping.status_field_id, statusOptionId);
			if (!moveResult.ok) return mcpError(`Move failed: ${moveResult.error}`, "Move failed");
			updateLocalMappingStatus(mapping, issue_number, status);
			saveMapping(cwd, mapping);
			return mcpSuccess({
				mode: "full",
				issue_number,
				status,
				moved: true
			}, `Issue #${issue_number} moved to "${status}"`);
		} catch (e) {
			return mcpError(e.message, "Operation failed");
		}
	});
	server.tool("mcp_close_issue", "Close a GitHub issue as completed or not planned.", {
		issue_number: zod.z.number().describe("GitHub issue number"),
		reason: zod.z.enum(["completed", "not_planned"]).optional().default("completed").describe("Close reason")
	}, async ({ issue_number, reason }) => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			if (await detectGitHubMode() === "local-only") return mcpSuccess({
				mode: "local-only",
				warning: "GitHub not configured. Cannot close remote issue.",
				issue_number
			}, "Local-only mode: cannot close GitHub issue.");
			const result = await closeIssue(issue_number, reason);
			if (!result.ok) return mcpError(`Close failed: ${result.error}`, "Close failed");
			const mapping = loadMapping(cwd);
			if (mapping) {
				const issueEntry = findIssueInMapping$1(mapping, issue_number);
				if (issueEntry?.item_id && mapping.status_options["Done"] && mapping.status_field_id) await moveItemToStatus(mapping.project_id, issueEntry.item_id, mapping.status_field_id, mapping.status_options["Done"]);
				updateLocalMappingStatus(mapping, issue_number, "Done");
				saveMapping(cwd, mapping);
			}
			return mcpSuccess({
				mode: "full",
				issue_number,
				reason,
				closed: true
			}, `Issue #${issue_number} closed (${reason})`);
		} catch (e) {
			return mcpError(e.message, "Operation failed");
		}
	});
	server.tool("mcp_post_comment", "Post a progress comment on a GitHub issue.", {
		issue_number: zod.z.number().describe("GitHub issue number"),
		body: zod.z.string().describe("Comment body (markdown supported)")
	}, async ({ issue_number, body }) => {
		try {
			if (await detectGitHubMode() === "local-only") return mcpSuccess({
				mode: "local-only",
				warning: "GitHub not configured. Cannot post comment.",
				issue_number
			}, "Local-only mode: cannot post comment on GitHub issue.");
			const result = await postComment(issue_number, body);
			if (!result.ok) return mcpError(`Comment failed: ${result.error}`, "Comment failed");
			return mcpSuccess({
				mode: "full",
				issue_number,
				commented: true
			}, `Comment posted on issue #${issue_number}`);
		} catch (e) {
			return mcpError(e.message, "Operation failed");
		}
	});
	server.tool("mcp_import_issue", "Import an external GitHub issue into MAXSIM tracking.", { issue_number: zod.z.number().describe("GitHub issue number to import") }, async ({ issue_number }) => {
		try {
			if (await detectGitHubMode() === "local-only") return mcpSuccess({
				mode: "local-only",
				warning: "GitHub not configured. Cannot import issue.",
				issue_number
			}, "Local-only mode: cannot import GitHub issue.");
			const result = await importExternalIssue(issue_number);
			if (!result.ok) return mcpError(`Import failed: ${result.error}`, "Import failed");
			return mcpSuccess({
				mode: "full",
				issue_number: result.data.number,
				title: result.data.title,
				labels: result.data.labels,
				imported: true
			}, `Imported issue #${result.data.number}: "${result.data.title}". Assign to a phase or todo for tracking.`);
		} catch (e) {
			return mcpError(e.message, "Operation failed");
		}
	});
	server.tool("mcp_sync_check", "Check for external changes to tracked GitHub issues.", {}, async () => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			if (await detectGitHubMode() === "local-only") return mcpSuccess({
				mode: "local-only",
				warning: "GitHub not configured. Sync check not available.",
				in_sync: true,
				changes: []
			}, "Local-only mode: sync check skipped.");
			const result = await syncCheck(cwd);
			if (!result.ok) return mcpError(`Sync check failed: ${result.error}`, "Sync failed");
			return mcpSuccess({
				mode: "full",
				in_sync: result.data.inSync,
				changes: result.data.changes,
				change_count: result.data.changes.length
			}, result.data.inSync ? "All tracked issues are in sync with GitHub." : `${result.data.changes.length} discrepancies found between local mapping and GitHub.`);
		} catch (e) {
			return mcpError(e.message, "Operation failed");
		}
	});
	server.tool("mcp_supersede_plan", "Close old plan issues and link to new plan issues.", {
		phase: zod.z.string().describe("Phase number"),
		old_plan: zod.z.string().describe("Old plan number to supersede"),
		new_plan: zod.z.string().describe("New plan number that replaces it")
	}, async ({ phase, old_plan, new_plan }) => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			if (await detectGitHubMode() === "local-only") return mcpSuccess({
				mode: "local-only",
				warning: "GitHub not configured. Cannot supersede plan issues.",
				phase,
				old_plan,
				new_plan
			}, "Local-only mode: plan supersession skipped.");
			const mapping = loadMapping(cwd);
			if (!mapping) return mcpError("github-issues.json not found. Run mcp_github_setup first.", "Setup required");
			const newPhaseMapping = mapping.phases[phase];
			if (!newPhaseMapping) return mcpError(`Phase ${phase} not found in mapping. Create new plan issues first.`, "Phase not found");
			const result = await supersedePlanIssues({
				phaseNum: phase,
				oldPlanNum: old_plan,
				newPlanNum: new_plan,
				newIssueNumbers: Object.entries(newPhaseMapping.tasks).map(([taskId, task]) => ({
					taskId,
					issueNumber: task.number
				})),
				cwd
			});
			if (!result.ok) return mcpError(`Supersession failed: ${result.error}`, "Supersession failed");
			return mcpSuccess({
				mode: "full",
				phase,
				old_plan,
				new_plan,
				superseded: true
			}, `Plan ${phase}-${old_plan} superseded by ${phase}-${new_plan}`);
		} catch (e) {
			return mcpError(e.message, "Operation failed");
		}
	});
	server.tool("mcp_create_pr", "Create a pull request with auto-close linking for tracked GitHub issues. Generates PR description with Closes #N lines (AC-08).", {
		issue_numbers: zod.z.array(zod.z.number()).describe("Issue numbers to auto-close when PR merges"),
		branch: zod.z.string().describe("Source branch name for the PR"),
		title: zod.z.string().describe("PR title"),
		base: zod.z.string().optional().default("main").describe("Base branch (default: main)"),
		additional_context: zod.z.string().optional().describe("Additional context to include in PR body"),
		draft: zod.z.boolean().optional().default(false).describe("Create as draft PR")
	}, async ({ issue_numbers, branch, title, base, additional_context, draft }) => {
		try {
			const mode = await detectGitHubMode();
			const prBody = buildPrBody(issue_numbers, additional_context);
			if (mode === "local-only") return mcpSuccess({
				mode: "local-only",
				warning: "GitHub not configured. PR not created. Use the body below to create manually.",
				pr_body: prBody,
				issues_linked: issue_numbers
			}, "Local-only mode: PR body generated but PR not created.");
			const args = [
				"pr",
				"create",
				"--title",
				title,
				"--body",
				prBody,
				"--head",
				branch
			];
			if (base) args.push("--base", base);
			if (draft) args.push("--draft");
			const createResult = await ghExec(args);
			if (!createResult.ok) return mcpError(`PR creation failed: ${createResult.error}`, "PR creation failed");
			const prUrl = createResult.data.trim();
			const prNumberMatch = prUrl.match(/\/pull\/(\d+)/);
			return mcpSuccess({
				mode: "full",
				pr_number: prNumberMatch ? parseInt(prNumberMatch[1], 10) : null,
				pr_url: prUrl,
				issues_linked: issue_numbers,
				draft
			}, `PR${draft ? " (draft)" : ""} created: ${prUrl} — auto-closes ${issue_numbers.map((n) => `#${n}`).join(", ")}`);
		} catch (e) {
			return mcpError(e.message, "Operation failed");
		}
	});
}
/**
* Find an issue entry in the mapping file (searches phases and todos).
*/
function findIssueInMapping$1(mapping, issueNumber) {
	for (const phase of Object.values(mapping.phases)) {
		if (phase.tracking_issue.number === issueNumber) return phase.tracking_issue;
		for (const task of Object.values(phase.tasks)) if (task.number === issueNumber) return task;
	}
	if (mapping.todos) {
		for (const todo of Object.values(mapping.todos)) if (todo.number === issueNumber) return todo;
	}
	return null;
}
/**
* Update local mapping status for an issue (mutates mapping in-place).
* Returns true if the issue was found and updated.
*/
function updateLocalMappingStatus(mapping, issueNumber, status) {
	for (const phase of Object.values(mapping.phases)) {
		if (phase.tracking_issue.number === issueNumber) {
			phase.tracking_issue.status = status;
			return true;
		}
		for (const task of Object.values(phase.tasks)) if (task.number === issueNumber) {
			task.status = status;
			return true;
		}
	}
	if (mapping.todos) {
		for (const todo of Object.values(mapping.todos)) if (todo.number === issueNumber) {
			todo.status = status;
			return true;
		}
	}
	return false;
}

//#endregion
//#region src/mcp/board-tools.ts
/**
* Board Query MCP Tools — Project board operations exposed as MCP tools
*
* Provides MCP tools for querying the GitHub project board, searching issues,
* getting issue details, and setting estimates. Every tool checks detectGitHubMode()
* and degrades gracefully to local-only behavior when GitHub is not configured.
*
* CRITICAL: Never import output() or error() from core — they call process.exit().
* CRITICAL: Never write to stdout — it is reserved for MCP JSON-RPC protocol.
* CRITICAL: Never call process.exit() — the server must stay alive after every tool call.
*/
/**
* Register all board query tools on the MCP server.
*/
function registerBoardTools(server) {
	server.tool("mcp_query_board", "Query the GitHub project board. Returns all items with their status, estimates, and issue details.", {
		status: zod.z.enum([
			"To Do",
			"In Progress",
			"In Review",
			"Done"
		]).optional().describe("Filter by status column"),
		phase: zod.z.string().optional().describe("Filter by phase number (matches issue title prefix)")
	}, async ({ status, phase }) => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			const mode = await detectGitHubMode();
			const mapping = loadMapping(cwd);
			if (mode === "local-only") {
				if (!mapping) return mcpSuccess({
					mode: "local-only",
					items: [],
					count: 0
				}, "Local-only mode: no mapping file found.");
				const items = buildLocalBoardItems(mapping, status, phase);
				return mcpSuccess({
					mode: "local-only",
					items,
					count: items.length
				}, `Local-only mode: ${items.length} items from local mapping.`);
			}
			if (!mapping || !mapping.project_number) return mcpError("No project board configured. Run mcp_github_setup first.", "Setup required");
			const result = await ghExec([
				"project",
				"item-list",
				String(mapping.project_number),
				"--owner",
				"@me",
				"--format",
				"json"
			], { parseJson: true });
			if (!result.ok) return mcpError(`Board query failed: ${result.error}`, "Query failed");
			let items = result.data.items || [];
			if (status) items = items.filter((item) => item.status === status);
			if (phase) {
				const phasePrefix = `[P${phase}]`;
				const phasePrefixAlt = `[Phase ${phase}]`;
				items = items.filter((item) => item.title?.includes(phasePrefix) || item.title?.includes(phasePrefixAlt) || item.content?.title?.includes(phasePrefix) || item.content?.title?.includes(phasePrefixAlt));
			}
			const formatted = items.map((item) => ({
				item_id: item.id,
				title: item.content?.title ?? item.title,
				issue_number: item.content?.number ?? null,
				status: item.status ?? "No Status",
				url: item.content?.url ?? null
			}));
			return mcpSuccess({
				mode: "full",
				items: formatted,
				count: formatted.length
			}, `Board query: ${formatted.length} items${status ? ` in "${status}"` : ""}${phase ? ` for phase ${phase}` : ""}`);
		} catch (e) {
			return mcpError(e.message, "Operation failed");
		}
	});
	server.tool("mcp_search_issues", "Search GitHub issues by label, milestone, state, or text query.", {
		labels: zod.z.array(zod.z.string()).optional().describe("Filter by label names"),
		milestone: zod.z.string().optional().describe("Filter by milestone title"),
		state: zod.z.enum([
			"open",
			"closed",
			"all"
		]).optional().default("open").describe("Filter by issue state"),
		query: zod.z.string().optional().describe("Text search query")
	}, async ({ labels, milestone, state, query }) => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			if (await detectGitHubMode() === "local-only") {
				const mapping = loadMapping(cwd);
				if (!mapping) return mcpSuccess({
					mode: "local-only",
					issues: [],
					count: 0
				}, "Local-only mode: no mapping file found.");
				const items = buildLocalSearchResults(mapping, state);
				return mcpSuccess({
					mode: "local-only",
					issues: items,
					count: items.length
				}, `Local-only mode: ${items.length} items from local mapping.`);
			}
			const args = [
				"issue",
				"list",
				"--json",
				"number,title,state,labels,milestone",
				"--limit",
				"100"
			];
			if (state && state !== "all") args.push("--state", state);
			else if (state === "all") args.push("--state", "all");
			if (labels && labels.length > 0) for (const label of labels) args.push("--label", label);
			if (milestone) args.push("--milestone", milestone);
			if (query) args.push("--search", query);
			const result = await ghExec(args, { parseJson: true });
			if (!result.ok) return mcpError(`Search failed: ${result.error}`, "Search failed");
			const issues = result.data.map((issue) => ({
				number: issue.number,
				title: issue.title,
				state: issue.state,
				labels: issue.labels.map((l) => l.name),
				milestone: issue.milestone?.title ?? null
			}));
			return mcpSuccess({
				mode: "full",
				issues,
				count: issues.length
			}, `Found ${issues.length} issues`);
		} catch (e) {
			return mcpError(e.message, "Operation failed");
		}
	});
	server.tool("mcp_get_issue_detail", "Get full details of a specific GitHub issue including comments.", { issue_number: zod.z.number().describe("GitHub issue number") }, async ({ issue_number }) => {
		try {
			if (await detectGitHubMode() === "local-only") return mcpSuccess({
				mode: "local-only",
				warning: "GitHub not configured. Cannot fetch issue details.",
				issue_number
			}, "Local-only mode: cannot fetch issue details.");
			const result = await ghExec([
				"issue",
				"view",
				String(issue_number),
				"--json",
				"number,title,body,state,labels,comments,assignees"
			], { parseJson: true });
			if (!result.ok) return mcpError(`Fetch failed: ${result.error}`, "Fetch failed");
			const issue = result.data;
			return mcpSuccess({
				mode: "full",
				number: issue.number,
				title: issue.title,
				body: issue.body,
				state: issue.state,
				labels: issue.labels.map((l) => l.name),
				assignees: issue.assignees.map((a) => a.login),
				comments: issue.comments.map((c) => ({
					author: c.author.login,
					body: c.body,
					created_at: c.createdAt
				})),
				comment_count: issue.comments.length
			}, `Issue #${issue.number}: ${issue.title} (${issue.state})`);
		} catch (e) {
			return mcpError(e.message, "Operation failed");
		}
	});
	server.tool("mcp_set_estimate", "Set Fibonacci story points on a GitHub issue.", {
		issue_number: zod.z.number().describe("GitHub issue number"),
		points: zod.z.number().describe("Fibonacci story points (1, 2, 3, 5, 8, 13, 21, 34)")
	}, async ({ issue_number, points }) => {
		try {
			const cwd = detectProjectRoot();
			if (!cwd) return mcpError("No .planning/ directory found", "Project not detected");
			if (!FIBONACCI_POINTS.includes(points)) return mcpError(`Invalid points: ${points}. Must be one of: ${FIBONACCI_POINTS.join(", ")}`, "Validation failed");
			if (await detectGitHubMode() === "local-only") return mcpSuccess({
				mode: "local-only",
				warning: "GitHub not configured. Cannot set estimate.",
				issue_number,
				points
			}, "Local-only mode: cannot set estimate on GitHub project.");
			const mapping = loadMapping(cwd);
			if (!mapping) return mcpError("github-issues.json not found. Run mcp_github_setup first.", "Setup required");
			if (!mapping.estimate_field_id) return mcpError("Estimate field not configured. Re-run mcp_github_setup.", "Setup required");
			const issueEntry = findIssueInMapping(mapping, issue_number);
			if (!issueEntry) return mcpError(`Issue #${issue_number} not found in local mapping`, "Issue not tracked");
			if (!issueEntry.item_id) return mcpError(`Issue #${issue_number} has no project item_id. It may not have been added to the board.`, "Not on board");
			const result = await setEstimate(mapping.project_id, issueEntry.item_id, mapping.estimate_field_id, points);
			if (!result.ok) return mcpError(`Set estimate failed: ${result.error}`, "Estimate failed");
			return mcpSuccess({
				mode: "full",
				issue_number,
				points,
				set: true
			}, `Estimate set: issue #${issue_number} = ${points} points`);
		} catch (e) {
			return mcpError(e.message, "Operation failed");
		}
	});
}
/**
* Find an issue entry in the mapping file (searches phases and todos).
*/
function findIssueInMapping(mapping, issueNumber) {
	for (const phase of Object.values(mapping.phases)) {
		if (phase.tracking_issue.number === issueNumber) return phase.tracking_issue;
		for (const task of Object.values(phase.tasks)) if (task.number === issueNumber) return task;
	}
	if (mapping.todos) {
		for (const todo of Object.values(mapping.todos)) if (todo.number === issueNumber) return todo;
	}
	return null;
}
/**
* Build local board items from the mapping file (for local-only mode).
*/
function buildLocalBoardItems(mapping, statusFilter, phaseFilter) {
	const items = [];
	for (const [phaseNum, phase] of Object.entries(mapping.phases)) {
		if (phaseFilter && phaseNum !== phaseFilter) continue;
		if (phase.tracking_issue.number > 0) {
			const entry = {
				issue_number: phase.tracking_issue.number,
				title: `[Phase ${phaseNum}] Tracking`,
				status: phase.tracking_issue.status,
				source: `phase ${phaseNum}`
			};
			if (!statusFilter || entry.status === statusFilter) items.push(entry);
		}
		for (const [taskId, task] of Object.entries(phase.tasks)) if (task.number > 0) {
			const entry = {
				issue_number: task.number,
				title: `[P${phaseNum}] Task ${taskId}`,
				status: task.status,
				source: `phase ${phaseNum}, task ${taskId}`
			};
			if (!statusFilter || entry.status === statusFilter) items.push(entry);
		}
	}
	if (!phaseFilter && mapping.todos) {
		for (const [todoId, todo] of Object.entries(mapping.todos)) if (todo.number > 0) {
			const entry = {
				issue_number: todo.number,
				title: `Todo: ${todoId}`,
				status: todo.status,
				source: `todo ${todoId}`
			};
			if (!statusFilter || entry.status === statusFilter) items.push(entry);
		}
	}
	return items;
}
/**
* Build local search results from the mapping file (for local-only mode).
*/
function buildLocalSearchResults(mapping, stateFilter) {
	const items = [];
	for (const [phaseNum, phase] of Object.entries(mapping.phases)) for (const [taskId, task] of Object.entries(phase.tasks)) if (task.number > 0) {
		const state = task.status === "Done" ? "closed" : "open";
		if (stateFilter && stateFilter !== "all" && state !== stateFilter) continue;
		items.push({
			issue_number: task.number,
			title: `[P${phaseNum}] Task ${taskId}`,
			state,
			source: `phase ${phaseNum}`
		});
	}
	if (mapping.todos) {
		for (const [todoId, todo] of Object.entries(mapping.todos)) if (todo.number > 0) {
			const state = todo.status === "Done" ? "closed" : "open";
			if (stateFilter && stateFilter !== "all" && state !== stateFilter) continue;
			items.push({
				issue_number: todo.number,
				title: `Todo: ${todoId}`,
				state,
				source: "todo"
			});
		}
	}
	return items;
}

//#endregion
//#region src/mcp/index.ts
/**
* Register all MCP tools on the given server instance.
*/
function registerAllTools(server) {
	registerPhaseTools(server);
	registerTodoTools(server);
	registerStateTools(server);
	registerContextTools(server);
	registerRoadmapTools(server);
	registerConfigTools(server);
	registerGitHubTools(server);
	registerBoardTools(server);
}

//#endregion
//#region ../../node_modules/node-pty/lib/utils.js
var require_utils = /* @__PURE__ */ require_cli.__commonJSMin(((exports) => {
	/**
	* Copyright (c) 2017, Daniel Imms (MIT License).
	* Copyright (c) 2018, Microsoft Corporation (MIT License).
	*/
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.loadNativeModule = exports.assign = void 0;
	function assign(target) {
		var sources = [];
		for (var _i = 1; _i < arguments.length; _i++) sources[_i - 1] = arguments[_i];
		sources.forEach(function(source) {
			return Object.keys(source).forEach(function(key) {
				return target[key] = source[key];
			});
		});
		return target;
	}
	exports.assign = assign;
	function loadNativeModule(name) {
		var dirs = [
			"build/Release",
			"build/Debug",
			"prebuilds/" + process.platform + "-" + process.arch
		];
		var relative = ["..", "."];
		var lastError;
		for (var _i = 0, dirs_1 = dirs; _i < dirs_1.length; _i++) {
			var d = dirs_1[_i];
			for (var _a = 0, relative_1 = relative; _a < relative_1.length; _a++) {
				var dir = relative_1[_a] + "/" + d + "/";
				try {
					return {
						dir,
						module: require(dir + "/" + name + ".node")
					};
				} catch (e) {
					lastError = e;
				}
			}
		}
		throw new Error("Failed to load native module: " + name + ".node, checked: " + dirs.join(", ") + ": " + lastError);
	}
	exports.loadNativeModule = loadNativeModule;
}));

//#endregion
//#region ../../node_modules/node-pty/lib/eventEmitter2.js
var require_eventEmitter2 = /* @__PURE__ */ require_cli.__commonJSMin(((exports) => {
	/**
	* Copyright (c) 2019, Microsoft Corporation (MIT License).
	*/
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.EventEmitter2 = void 0;
	var EventEmitter2 = function() {
		function EventEmitter2() {
			this._listeners = [];
		}
		Object.defineProperty(EventEmitter2.prototype, "event", {
			get: function() {
				var _this = this;
				if (!this._event) this._event = function(listener) {
					_this._listeners.push(listener);
					return { dispose: function() {
						for (var i = 0; i < _this._listeners.length; i++) if (_this._listeners[i] === listener) {
							_this._listeners.splice(i, 1);
							return;
						}
					} };
				};
				return this._event;
			},
			enumerable: false,
			configurable: true
		});
		EventEmitter2.prototype.fire = function(data) {
			var queue = [];
			for (var i = 0; i < this._listeners.length; i++) queue.push(this._listeners[i]);
			for (var i = 0; i < queue.length; i++) queue[i].call(void 0, data);
		};
		return EventEmitter2;
	}();
	exports.EventEmitter2 = EventEmitter2;
}));

//#endregion
//#region ../../node_modules/node-pty/lib/terminal.js
var require_terminal = /* @__PURE__ */ require_cli.__commonJSMin(((exports) => {
	/**
	* Copyright (c) 2012-2015, Christopher Jeffrey (MIT License)
	* Copyright (c) 2016, Daniel Imms (MIT License).
	* Copyright (c) 2018, Microsoft Corporation (MIT License).
	*/
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Terminal = exports.DEFAULT_ROWS = exports.DEFAULT_COLS = void 0;
	var events_1 = require("events");
	var eventEmitter2_1 = require_eventEmitter2();
	exports.DEFAULT_COLS = 80;
	exports.DEFAULT_ROWS = 24;
	/**
	* Default messages to indicate PAUSE/RESUME for automatic flow control.
	* To avoid conflicts with rebound XON/XOFF control codes (such as on-my-zsh),
	* the sequences can be customized in `IPtyForkOptions`.
	*/
	var FLOW_CONTROL_PAUSE = "";
	var FLOW_CONTROL_RESUME = "";
	var Terminal = function() {
		function Terminal(opt) {
			this._pid = 0;
			this._fd = 0;
			this._cols = 0;
			this._rows = 0;
			this._readable = false;
			this._writable = false;
			this._onData = new eventEmitter2_1.EventEmitter2();
			this._onExit = new eventEmitter2_1.EventEmitter2();
			this._internalee = new events_1.EventEmitter();
			this.handleFlowControl = !!(opt === null || opt === void 0 ? void 0 : opt.handleFlowControl);
			this._flowControlPause = (opt === null || opt === void 0 ? void 0 : opt.flowControlPause) || FLOW_CONTROL_PAUSE;
			this._flowControlResume = (opt === null || opt === void 0 ? void 0 : opt.flowControlResume) || FLOW_CONTROL_RESUME;
			if (!opt) return;
			this._checkType("name", opt.name ? opt.name : void 0, "string");
			this._checkType("cols", opt.cols ? opt.cols : void 0, "number");
			this._checkType("rows", opt.rows ? opt.rows : void 0, "number");
			this._checkType("cwd", opt.cwd ? opt.cwd : void 0, "string");
			this._checkType("env", opt.env ? opt.env : void 0, "object");
			this._checkType("uid", opt.uid ? opt.uid : void 0, "number");
			this._checkType("gid", opt.gid ? opt.gid : void 0, "number");
			this._checkType("encoding", opt.encoding ? opt.encoding : void 0, "string");
		}
		Object.defineProperty(Terminal.prototype, "onData", {
			get: function() {
				return this._onData.event;
			},
			enumerable: false,
			configurable: true
		});
		Object.defineProperty(Terminal.prototype, "onExit", {
			get: function() {
				return this._onExit.event;
			},
			enumerable: false,
			configurable: true
		});
		Object.defineProperty(Terminal.prototype, "pid", {
			get: function() {
				return this._pid;
			},
			enumerable: false,
			configurable: true
		});
		Object.defineProperty(Terminal.prototype, "cols", {
			get: function() {
				return this._cols;
			},
			enumerable: false,
			configurable: true
		});
		Object.defineProperty(Terminal.prototype, "rows", {
			get: function() {
				return this._rows;
			},
			enumerable: false,
			configurable: true
		});
		Terminal.prototype.write = function(data) {
			if (this.handleFlowControl) {
				if (data === this._flowControlPause) {
					this.pause();
					return;
				}
				if (data === this._flowControlResume) {
					this.resume();
					return;
				}
			}
			this._write(data);
		};
		Terminal.prototype._forwardEvents = function() {
			var _this = this;
			this.on("data", function(e) {
				return _this._onData.fire(e);
			});
			this.on("exit", function(exitCode, signal) {
				return _this._onExit.fire({
					exitCode,
					signal
				});
			});
		};
		Terminal.prototype._checkType = function(name, value, type, allowArray) {
			if (allowArray === void 0) allowArray = false;
			if (value === void 0) return;
			if (allowArray) {
				if (Array.isArray(value)) {
					value.forEach(function(v, i) {
						if (typeof v !== type) throw new Error(name + "[" + i + "] must be a " + type + " (not a " + typeof v[i] + ")");
					});
					return;
				}
			}
			if (typeof value !== type) throw new Error(name + " must be a " + type + " (not a " + typeof value + ")");
		};
		/** See net.Socket.end */
		Terminal.prototype.end = function(data) {
			this._socket.end(data);
		};
		/** See stream.Readable.pipe */
		Terminal.prototype.pipe = function(dest, options) {
			return this._socket.pipe(dest, options);
		};
		/** See net.Socket.pause */
		Terminal.prototype.pause = function() {
			return this._socket.pause();
		};
		/** See net.Socket.resume */
		Terminal.prototype.resume = function() {
			return this._socket.resume();
		};
		/** See net.Socket.setEncoding */
		Terminal.prototype.setEncoding = function(encoding) {
			if (this._socket._decoder) delete this._socket._decoder;
			if (encoding) this._socket.setEncoding(encoding);
		};
		Terminal.prototype.addListener = function(eventName, listener) {
			this.on(eventName, listener);
		};
		Terminal.prototype.on = function(eventName, listener) {
			if (eventName === "close") {
				this._internalee.on("close", listener);
				return;
			}
			this._socket.on(eventName, listener);
		};
		Terminal.prototype.emit = function(eventName) {
			var args = [];
			for (var _i = 1; _i < arguments.length; _i++) args[_i - 1] = arguments[_i];
			if (eventName === "close") return this._internalee.emit.apply(this._internalee, arguments);
			return this._socket.emit.apply(this._socket, arguments);
		};
		Terminal.prototype.listeners = function(eventName) {
			return this._socket.listeners(eventName);
		};
		Terminal.prototype.removeListener = function(eventName, listener) {
			this._socket.removeListener(eventName, listener);
		};
		Terminal.prototype.removeAllListeners = function(eventName) {
			this._socket.removeAllListeners(eventName);
		};
		Terminal.prototype.once = function(eventName, listener) {
			this._socket.once(eventName, listener);
		};
		Terminal.prototype._close = function() {
			this._socket.readable = false;
			this.write = function() {};
			this.end = function() {};
			this._writable = false;
			this._readable = false;
		};
		Terminal.prototype._parseEnv = function(env) {
			var keys = Object.keys(env || {});
			var pairs = [];
			for (var i = 0; i < keys.length; i++) {
				if (keys[i] === void 0) continue;
				pairs.push(keys[i] + "=" + env[keys[i]]);
			}
			return pairs;
		};
		return Terminal;
	}();
	exports.Terminal = Terminal;
}));

//#endregion
//#region ../../node_modules/node-pty/lib/shared/conout.js
var require_conout = /* @__PURE__ */ require_cli.__commonJSMin(((exports) => {
	/**
	* Copyright (c) 2020, Microsoft Corporation (MIT License).
	*/
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.getWorkerPipeName = void 0;
	function getWorkerPipeName(conoutPipeName) {
		return conoutPipeName + "-worker";
	}
	exports.getWorkerPipeName = getWorkerPipeName;
}));

//#endregion
//#region ../../node_modules/node-pty/lib/windowsConoutConnection.js
var require_windowsConoutConnection = /* @__PURE__ */ require_cli.__commonJSMin(((exports) => {
	/**
	* Copyright (c) 2020, Microsoft Corporation (MIT License).
	*/
	var __awaiter = exports && exports.__awaiter || function(thisArg, _arguments, P, generator) {
		function adopt(value) {
			return value instanceof P ? value : new P(function(resolve) {
				resolve(value);
			});
		}
		return new (P || (P = Promise))(function(resolve, reject) {
			function fulfilled(value) {
				try {
					step(generator.next(value));
				} catch (e) {
					reject(e);
				}
			}
			function rejected(value) {
				try {
					step(generator["throw"](value));
				} catch (e) {
					reject(e);
				}
			}
			function step(result) {
				result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
			}
			step((generator = generator.apply(thisArg, _arguments || [])).next());
		});
	};
	var __generator = exports && exports.__generator || function(thisArg, body) {
		var _ = {
			label: 0,
			sent: function() {
				if (t[0] & 1) throw t[1];
				return t[1];
			},
			trys: [],
			ops: []
		}, f, y, t, g;
		return g = {
			next: verb(0),
			"throw": verb(1),
			"return": verb(2)
		}, typeof Symbol === "function" && (g[Symbol.iterator] = function() {
			return this;
		}), g;
		function verb(n) {
			return function(v) {
				return step([n, v]);
			};
		}
		function step(op) {
			if (f) throw new TypeError("Generator is already executing.");
			while (_) try {
				if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
				if (y = 0, t) op = [op[0] & 2, t.value];
				switch (op[0]) {
					case 0:
					case 1:
						t = op;
						break;
					case 4:
						_.label++;
						return {
							value: op[1],
							done: false
						};
					case 5:
						_.label++;
						y = op[1];
						op = [0];
						continue;
					case 7:
						op = _.ops.pop();
						_.trys.pop();
						continue;
					default:
						if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
							_ = 0;
							continue;
						}
						if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
							_.label = op[1];
							break;
						}
						if (op[0] === 6 && _.label < t[1]) {
							_.label = t[1];
							t = op;
							break;
						}
						if (t && _.label < t[2]) {
							_.label = t[2];
							_.ops.push(op);
							break;
						}
						if (t[2]) _.ops.pop();
						_.trys.pop();
						continue;
				}
				op = body.call(thisArg, _);
			} catch (e) {
				op = [6, e];
				y = 0;
			} finally {
				f = t = 0;
			}
			if (op[0] & 5) throw op[1];
			return {
				value: op[0] ? op[1] : void 0,
				done: true
			};
		}
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.ConoutConnection = void 0;
	var worker_threads_1 = require("worker_threads");
	var conout_1 = require_conout();
	var path_1 = require("path");
	var eventEmitter2_1 = require_eventEmitter2();
	/**
	* The amount of time to wait for additional data after the conpty shell process has exited before
	* shutting down the worker and sockets. The timer will be reset if a new data event comes in after
	* the timer has started.
	*/
	var FLUSH_DATA_INTERVAL = 1e3;
	/**
	* Connects to and manages the lifecycle of the conout socket. This socket must be drained on
	* another thread in order to avoid deadlocks where Conpty waits for the out socket to drain
	* when `ClosePseudoConsole` is called. This happens when data is being written to the terminal when
	* the pty is closed.
	*
	* See also:
	* - https://github.com/microsoft/node-pty/issues/375
	* - https://github.com/microsoft/vscode/issues/76548
	* - https://github.com/microsoft/terminal/issues/1810
	* - https://docs.microsoft.com/en-us/windows/console/closepseudoconsole
	*/
	var ConoutConnection = function() {
		function ConoutConnection(_conoutPipeName, _useConptyDll) {
			var _this = this;
			this._conoutPipeName = _conoutPipeName;
			this._useConptyDll = _useConptyDll;
			this._isDisposed = false;
			this._onReady = new eventEmitter2_1.EventEmitter2();
			var workerData = { conoutPipeName: _conoutPipeName };
			var scriptPath = __dirname.replace("node_modules.asar", "node_modules.asar.unpacked");
			this._worker = new worker_threads_1.Worker(path_1.join(scriptPath, "worker/conoutSocketWorker.js"), { workerData });
			this._worker.on("message", function(message) {
				switch (message) {
					case 1:
						_this._onReady.fire();
						return;
					default: console.warn("Unexpected ConoutWorkerMessage", message);
				}
			});
		}
		Object.defineProperty(ConoutConnection.prototype, "onReady", {
			get: function() {
				return this._onReady.event;
			},
			enumerable: false,
			configurable: true
		});
		ConoutConnection.prototype.dispose = function() {
			if (!this._useConptyDll && this._isDisposed) return;
			this._isDisposed = true;
			this._drainDataAndClose();
		};
		ConoutConnection.prototype.connectSocket = function(socket) {
			socket.connect(conout_1.getWorkerPipeName(this._conoutPipeName));
		};
		ConoutConnection.prototype._drainDataAndClose = function() {
			var _this = this;
			if (this._drainTimeout) clearTimeout(this._drainTimeout);
			this._drainTimeout = setTimeout(function() {
				return _this._destroySocket();
			}, FLUSH_DATA_INTERVAL);
		};
		ConoutConnection.prototype._destroySocket = function() {
			return __awaiter(this, void 0, void 0, function() {
				return __generator(this, function(_a) {
					switch (_a.label) {
						case 0: return [4, this._worker.terminate()];
						case 1:
							_a.sent();
							return [2];
					}
				});
			});
		};
		return ConoutConnection;
	}();
	exports.ConoutConnection = ConoutConnection;
}));

//#endregion
//#region ../../node_modules/node-pty/lib/windowsPtyAgent.js
var require_windowsPtyAgent = /* @__PURE__ */ require_cli.__commonJSMin(((exports) => {
	/**
	* Copyright (c) 2012-2015, Christopher Jeffrey, Peter Sunde (MIT License)
	* Copyright (c) 2016, Daniel Imms (MIT License).
	* Copyright (c) 2018, Microsoft Corporation (MIT License).
	*/
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.argsToCommandLine = exports.WindowsPtyAgent = void 0;
	var fs$1 = require("fs");
	var os = require("os");
	var path$1 = require("path");
	var child_process_1 = require("child_process");
	var net_1 = require("net");
	var windowsConoutConnection_1 = require_windowsConoutConnection();
	var utils_1 = require_utils();
	var conptyNative;
	var winptyNative;
	/**
	* The amount of time to wait for additional data after the conpty shell process has exited before
	* shutting down the socket. The timer will be reset if a new data event comes in after the timer
	* has started.
	*/
	var FLUSH_DATA_INTERVAL = 1e3;
	/**
	* This agent sits between the WindowsTerminal class and provides a common interface for both conpty
	* and winpty.
	*/
	var WindowsPtyAgent = function() {
		function WindowsPtyAgent(file, args, env, cwd, cols, rows, debug, _useConpty, _useConptyDll, conptyInheritCursor) {
			var _this = this;
			if (_useConptyDll === void 0) _useConptyDll = false;
			if (conptyInheritCursor === void 0) conptyInheritCursor = false;
			this._useConpty = _useConpty;
			this._useConptyDll = _useConptyDll;
			this._pid = 0;
			this._innerPid = 0;
			if (this._useConpty === void 0 || this._useConpty === true) this._useConpty = this._getWindowsBuildNumber() >= 18309;
			if (this._useConpty) {
				if (!conptyNative) conptyNative = utils_1.loadNativeModule("conpty").module;
			} else if (!winptyNative) winptyNative = utils_1.loadNativeModule("pty").module;
			this._ptyNative = this._useConpty ? conptyNative : winptyNative;
			cwd = path$1.resolve(cwd);
			var commandLine = argsToCommandLine(file, args);
			var term;
			if (this._useConpty) term = this._ptyNative.startProcess(file, cols, rows, debug, this._generatePipeName(), conptyInheritCursor, this._useConptyDll);
			else {
				term = this._ptyNative.startProcess(file, commandLine, env, cwd, cols, rows, debug);
				this._pid = term.pid;
				this._innerPid = term.innerPid;
			}
			this._fd = term.fd;
			this._pty = term.pty;
			this._outSocket = new net_1.Socket();
			this._outSocket.setEncoding("utf8");
			this._conoutSocketWorker = new windowsConoutConnection_1.ConoutConnection(term.conout, this._useConptyDll);
			this._conoutSocketWorker.onReady(function() {
				_this._conoutSocketWorker.connectSocket(_this._outSocket);
			});
			this._outSocket.on("connect", function() {
				_this._outSocket.emit("ready_datapipe");
			});
			var inSocketFD = fs$1.openSync(term.conin, "w");
			this._inSocket = new net_1.Socket({
				fd: inSocketFD,
				readable: false,
				writable: true
			});
			this._inSocket.setEncoding("utf8");
			if (this._useConpty) this._innerPid = this._ptyNative.connect(this._pty, commandLine, cwd, env, this._useConptyDll, function(c) {
				return _this._$onProcessExit(c);
			}).pid;
		}
		Object.defineProperty(WindowsPtyAgent.prototype, "inSocket", {
			get: function() {
				return this._inSocket;
			},
			enumerable: false,
			configurable: true
		});
		Object.defineProperty(WindowsPtyAgent.prototype, "outSocket", {
			get: function() {
				return this._outSocket;
			},
			enumerable: false,
			configurable: true
		});
		Object.defineProperty(WindowsPtyAgent.prototype, "fd", {
			get: function() {
				return this._fd;
			},
			enumerable: false,
			configurable: true
		});
		Object.defineProperty(WindowsPtyAgent.prototype, "innerPid", {
			get: function() {
				return this._innerPid;
			},
			enumerable: false,
			configurable: true
		});
		Object.defineProperty(WindowsPtyAgent.prototype, "pty", {
			get: function() {
				return this._pty;
			},
			enumerable: false,
			configurable: true
		});
		WindowsPtyAgent.prototype.resize = function(cols, rows) {
			if (this._useConpty) {
				if (this._exitCode !== void 0) throw new Error("Cannot resize a pty that has already exited");
				this._ptyNative.resize(this._pty, cols, rows, this._useConptyDll);
				return;
			}
			this._ptyNative.resize(this._pid, cols, rows);
		};
		WindowsPtyAgent.prototype.clear = function() {
			if (this._useConpty) this._ptyNative.clear(this._pty, this._useConptyDll);
		};
		WindowsPtyAgent.prototype.kill = function() {
			var _this = this;
			if (this._useConpty) if (!this._useConptyDll) {
				this._inSocket.readable = false;
				this._outSocket.readable = false;
				this._getConsoleProcessList().then(function(consoleProcessList) {
					consoleProcessList.forEach(function(pid) {
						try {
							process.kill(pid);
						} catch (e) {}
					});
				});
				this._ptyNative.kill(this._pty, this._useConptyDll);
				this._conoutSocketWorker.dispose();
			} else {
				this._inSocket.destroy();
				this._ptyNative.kill(this._pty, this._useConptyDll);
				this._outSocket.on("data", function() {
					_this._conoutSocketWorker.dispose();
				});
			}
			else {
				var processList = this._ptyNative.getProcessList(this._pid);
				this._ptyNative.kill(this._pid, this._innerPid);
				processList.forEach(function(pid) {
					try {
						process.kill(pid);
					} catch (e) {}
				});
			}
		};
		WindowsPtyAgent.prototype._getConsoleProcessList = function() {
			var _this = this;
			return new Promise(function(resolve) {
				var agent = child_process_1.fork(path$1.join(__dirname, "conpty_console_list_agent"), [_this._innerPid.toString()]);
				agent.on("message", function(message) {
					clearTimeout(timeout);
					resolve(message.consoleProcessList);
				});
				var timeout = setTimeout(function() {
					agent.kill();
					resolve([_this._innerPid]);
				}, 5e3);
			});
		};
		Object.defineProperty(WindowsPtyAgent.prototype, "exitCode", {
			get: function() {
				if (this._useConpty) return this._exitCode;
				var winptyExitCode = this._ptyNative.getExitCode(this._innerPid);
				return winptyExitCode === -1 ? void 0 : winptyExitCode;
			},
			enumerable: false,
			configurable: true
		});
		WindowsPtyAgent.prototype._getWindowsBuildNumber = function() {
			var osVersion = /(\d+)\.(\d+)\.(\d+)/g.exec(os.release());
			var buildNumber = 0;
			if (osVersion && osVersion.length === 4) buildNumber = parseInt(osVersion[3]);
			return buildNumber;
		};
		WindowsPtyAgent.prototype._generatePipeName = function() {
			return "conpty-" + Math.random() * 1e7;
		};
		/**
		* Triggered from the native side when a contpy process exits.
		*/
		WindowsPtyAgent.prototype._$onProcessExit = function(exitCode) {
			var _this = this;
			this._exitCode = exitCode;
			if (!this._useConptyDll) {
				this._flushDataAndCleanUp();
				this._outSocket.on("data", function() {
					return _this._flushDataAndCleanUp();
				});
			}
		};
		WindowsPtyAgent.prototype._flushDataAndCleanUp = function() {
			var _this = this;
			if (this._useConptyDll) return;
			if (this._closeTimeout) clearTimeout(this._closeTimeout);
			this._closeTimeout = setTimeout(function() {
				return _this._cleanUpProcess();
			}, FLUSH_DATA_INTERVAL);
		};
		WindowsPtyAgent.prototype._cleanUpProcess = function() {
			if (this._useConptyDll) return;
			this._inSocket.readable = false;
			this._outSocket.readable = false;
			this._outSocket.destroy();
		};
		return WindowsPtyAgent;
	}();
	exports.WindowsPtyAgent = WindowsPtyAgent;
	function argsToCommandLine(file, args) {
		if (isCommandLine(args)) {
			if (args.length === 0) return file;
			return argsToCommandLine(file, []) + " " + args;
		}
		var argv = [file];
		Array.prototype.push.apply(argv, args);
		var result = "";
		for (var argIndex = 0; argIndex < argv.length; argIndex++) {
			if (argIndex > 0) result += " ";
			var arg = argv[argIndex];
			var hasLopsidedEnclosingQuote = xOr(arg[0] !== "\"", arg[arg.length - 1] !== "\"");
			var hasNoEnclosingQuotes = arg[0] !== "\"" && arg[arg.length - 1] !== "\"";
			var quote = arg === "" || (arg.indexOf(" ") !== -1 || arg.indexOf("	") !== -1) && arg.length > 1 && (hasLopsidedEnclosingQuote || hasNoEnclosingQuotes);
			if (quote) result += "\"";
			var bsCount = 0;
			for (var i = 0; i < arg.length; i++) {
				var p = arg[i];
				if (p === "\\") bsCount++;
				else if (p === "\"") {
					result += repeatText("\\", bsCount * 2 + 1);
					result += "\"";
					bsCount = 0;
				} else {
					result += repeatText("\\", bsCount);
					bsCount = 0;
					result += p;
				}
			}
			if (quote) {
				result += repeatText("\\", bsCount * 2);
				result += "\"";
			} else result += repeatText("\\", bsCount);
		}
		return result;
	}
	exports.argsToCommandLine = argsToCommandLine;
	function isCommandLine(args) {
		return typeof args === "string";
	}
	function repeatText(text, count) {
		var result = "";
		for (var i = 0; i < count; i++) result += text;
		return result;
	}
	function xOr(arg1, arg2) {
		return arg1 && !arg2 || !arg1 && arg2;
	}
}));

//#endregion
//#region ../../node_modules/node-pty/lib/windowsTerminal.js
var require_windowsTerminal = /* @__PURE__ */ require_cli.__commonJSMin(((exports) => {
	/**
	* Copyright (c) 2012-2015, Christopher Jeffrey, Peter Sunde (MIT License)
	* Copyright (c) 2016, Daniel Imms (MIT License).
	* Copyright (c) 2018, Microsoft Corporation (MIT License).
	*/
	var __extends = exports && exports.__extends || (function() {
		var extendStatics = function(d, b) {
			extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d, b) {
				d.__proto__ = b;
			} || function(d, b) {
				for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
			};
			return extendStatics(d, b);
		};
		return function(d, b) {
			extendStatics(d, b);
			function __() {
				this.constructor = d;
			}
			d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
		};
	})();
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.WindowsTerminal = void 0;
	var terminal_1 = require_terminal();
	var windowsPtyAgent_1 = require_windowsPtyAgent();
	var utils_1 = require_utils();
	var DEFAULT_FILE = "cmd.exe";
	var DEFAULT_NAME = "Windows Shell";
	var WindowsTerminal = function(_super) {
		__extends(WindowsTerminal, _super);
		function WindowsTerminal(file, args, opt) {
			var _this = _super.call(this, opt) || this;
			_this._checkType("args", args, "string", true);
			args = args || [];
			file = file || DEFAULT_FILE;
			opt = opt || {};
			opt.env = opt.env || process.env;
			if (opt.encoding) console.warn("Setting encoding on Windows is not supported");
			var env = utils_1.assign({}, opt.env);
			_this._cols = opt.cols || terminal_1.DEFAULT_COLS;
			_this._rows = opt.rows || terminal_1.DEFAULT_ROWS;
			var cwd = opt.cwd || process.cwd();
			var name = opt.name || env.TERM || DEFAULT_NAME;
			var parsedEnv = _this._parseEnv(env);
			_this._isReady = false;
			_this._deferreds = [];
			_this._agent = new windowsPtyAgent_1.WindowsPtyAgent(file, args, parsedEnv, cwd, _this._cols, _this._rows, false, opt.useConpty, opt.useConptyDll, opt.conptyInheritCursor);
			_this._socket = _this._agent.outSocket;
			_this._pid = _this._agent.innerPid;
			_this._fd = _this._agent.fd;
			_this._pty = _this._agent.pty;
			_this._socket.on("ready_datapipe", function() {
				_this._socket.once("data", function() {
					if (!_this._isReady) {
						_this._isReady = true;
						_this._deferreds.forEach(function(fn) {
							fn.run();
						});
						_this._deferreds = [];
					}
				});
				_this._socket.on("error", function(err) {
					_this._close();
					if (err.code) {
						if (~err.code.indexOf("errno 5") || ~err.code.indexOf("EIO")) return;
					}
					if (_this.listeners("error").length < 2) throw err;
				});
				_this._socket.on("close", function() {
					_this.emit("exit", _this._agent.exitCode);
					_this._close();
				});
			});
			_this._file = file;
			_this._name = name;
			_this._readable = true;
			_this._writable = true;
			_this._forwardEvents();
			return _this;
		}
		WindowsTerminal.prototype._write = function(data) {
			this._defer(this._doWrite, data);
		};
		WindowsTerminal.prototype._doWrite = function(data) {
			this._agent.inSocket.write(data);
		};
		/**
		* openpty
		*/
		WindowsTerminal.open = function(options) {
			throw new Error("open() not supported on windows, use Fork() instead.");
		};
		/**
		* TTY
		*/
		WindowsTerminal.prototype.resize = function(cols, rows) {
			var _this = this;
			if (cols <= 0 || rows <= 0 || isNaN(cols) || isNaN(rows) || cols === Infinity || rows === Infinity) throw new Error("resizing must be done using positive cols and rows");
			this._deferNoArgs(function() {
				_this._agent.resize(cols, rows);
				_this._cols = cols;
				_this._rows = rows;
			});
		};
		WindowsTerminal.prototype.clear = function() {
			var _this = this;
			this._deferNoArgs(function() {
				_this._agent.clear();
			});
		};
		WindowsTerminal.prototype.destroy = function() {
			var _this = this;
			this._deferNoArgs(function() {
				_this.kill();
			});
		};
		WindowsTerminal.prototype.kill = function(signal) {
			var _this = this;
			this._deferNoArgs(function() {
				if (signal) throw new Error("Signals not supported on windows.");
				_this._close();
				_this._agent.kill();
			});
		};
		WindowsTerminal.prototype._deferNoArgs = function(deferredFn) {
			var _this = this;
			if (this._isReady) {
				deferredFn.call(this);
				return;
			}
			this._deferreds.push({ run: function() {
				return deferredFn.call(_this);
			} });
		};
		WindowsTerminal.prototype._defer = function(deferredFn, arg) {
			var _this = this;
			if (this._isReady) {
				deferredFn.call(this, arg);
				return;
			}
			this._deferreds.push({ run: function() {
				return deferredFn.call(_this, arg);
			} });
		};
		Object.defineProperty(WindowsTerminal.prototype, "process", {
			get: function() {
				return this._name;
			},
			enumerable: false,
			configurable: true
		});
		Object.defineProperty(WindowsTerminal.prototype, "master", {
			get: function() {
				throw new Error("master is not supported on Windows");
			},
			enumerable: false,
			configurable: true
		});
		Object.defineProperty(WindowsTerminal.prototype, "slave", {
			get: function() {
				throw new Error("slave is not supported on Windows");
			},
			enumerable: false,
			configurable: true
		});
		return WindowsTerminal;
	}(terminal_1.Terminal);
	exports.WindowsTerminal = WindowsTerminal;
}));

//#endregion
//#region ../../node_modules/node-pty/lib/unixTerminal.js
var require_unixTerminal = /* @__PURE__ */ require_cli.__commonJSMin(((exports) => {
	var __extends = exports && exports.__extends || (function() {
		var extendStatics = function(d, b) {
			extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d, b) {
				d.__proto__ = b;
			} || function(d, b) {
				for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
			};
			return extendStatics(d, b);
		};
		return function(d, b) {
			extendStatics(d, b);
			function __() {
				this.constructor = d;
			}
			d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
		};
	})();
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.UnixTerminal = void 0;
	/**
	* Copyright (c) 2012-2015, Christopher Jeffrey (MIT License)
	* Copyright (c) 2016, Daniel Imms (MIT License).
	* Copyright (c) 2018, Microsoft Corporation (MIT License).
	*/
	var fs = require("fs");
	var path = require("path");
	var tty = require("tty");
	var terminal_1 = require_terminal();
	var utils_1 = require_utils();
	var native = utils_1.loadNativeModule("pty");
	var pty = native.module;
	var helperPath = native.dir + "/spawn-helper";
	helperPath = path.resolve(__dirname, helperPath);
	helperPath = helperPath.replace("app.asar", "app.asar.unpacked");
	helperPath = helperPath.replace("node_modules.asar", "node_modules.asar.unpacked");
	var DEFAULT_FILE = "sh";
	var DEFAULT_NAME = "xterm";
	var DESTROY_SOCKET_TIMEOUT_MS = 200;
	var UnixTerminal = function(_super) {
		__extends(UnixTerminal, _super);
		function UnixTerminal(file, args, opt) {
			var _a, _b;
			var _this = _super.call(this, opt) || this;
			_this._boundClose = false;
			_this._emittedClose = false;
			if (typeof args === "string") throw new Error("args as a string is not supported on unix.");
			args = args || [];
			file = file || DEFAULT_FILE;
			opt = opt || {};
			opt.env = opt.env || process.env;
			_this._cols = opt.cols || terminal_1.DEFAULT_COLS;
			_this._rows = opt.rows || terminal_1.DEFAULT_ROWS;
			var uid = (_a = opt.uid) !== null && _a !== void 0 ? _a : -1;
			var gid = (_b = opt.gid) !== null && _b !== void 0 ? _b : -1;
			var env = utils_1.assign({}, opt.env);
			if (opt.env === process.env) _this._sanitizeEnv(env);
			var cwd = opt.cwd || process.cwd();
			env.PWD = cwd;
			var name = opt.name || env.TERM || DEFAULT_NAME;
			env.TERM = name;
			var parsedEnv = _this._parseEnv(env);
			var encoding = opt.encoding === void 0 ? "utf8" : opt.encoding;
			var onexit = function(code, signal) {
				if (!_this._emittedClose) {
					if (_this._boundClose) return;
					_this._boundClose = true;
					var timeout_1 = setTimeout(function() {
						timeout_1 = null;
						_this._socket.destroy();
					}, DESTROY_SOCKET_TIMEOUT_MS);
					_this.once("close", function() {
						if (timeout_1 !== null) clearTimeout(timeout_1);
						_this.emit("exit", code, signal);
					});
					return;
				}
				_this.emit("exit", code, signal);
			};
			var term = pty.fork(file, args, parsedEnv, cwd, _this._cols, _this._rows, uid, gid, encoding === "utf8", helperPath, onexit);
			_this._socket = new tty.ReadStream(term.fd);
			if (encoding !== null) _this._socket.setEncoding(encoding);
			_this._writeStream = new CustomWriteStream(term.fd, encoding || void 0);
			_this._socket.on("error", function(err) {
				if (err.code) {
					if (~err.code.indexOf("EAGAIN")) return;
				}
				_this._close();
				if (!_this._emittedClose) {
					_this._emittedClose = true;
					_this.emit("close");
				}
				if (err.code) {
					if (~err.code.indexOf("errno 5") || ~err.code.indexOf("EIO")) return;
				}
				if (_this.listeners("error").length < 2) throw err;
			});
			_this._pid = term.pid;
			_this._fd = term.fd;
			_this._pty = term.pty;
			_this._file = file;
			_this._name = name;
			_this._readable = true;
			_this._writable = true;
			_this._socket.on("close", function() {
				if (_this._emittedClose) return;
				_this._emittedClose = true;
				_this._close();
				_this.emit("close");
			});
			_this._forwardEvents();
			return _this;
		}
		Object.defineProperty(UnixTerminal.prototype, "master", {
			get: function() {
				return this._master;
			},
			enumerable: false,
			configurable: true
		});
		Object.defineProperty(UnixTerminal.prototype, "slave", {
			get: function() {
				return this._slave;
			},
			enumerable: false,
			configurable: true
		});
		UnixTerminal.prototype._write = function(data) {
			this._writeStream.write(data);
		};
		Object.defineProperty(UnixTerminal.prototype, "fd", {
			get: function() {
				return this._fd;
			},
			enumerable: false,
			configurable: true
		});
		Object.defineProperty(UnixTerminal.prototype, "ptsName", {
			get: function() {
				return this._pty;
			},
			enumerable: false,
			configurable: true
		});
		/**
		* openpty
		*/
		UnixTerminal.open = function(opt) {
			var self = Object.create(UnixTerminal.prototype);
			opt = opt || {};
			if (arguments.length > 1) opt = {
				cols: arguments[1],
				rows: arguments[2]
			};
			var cols = opt.cols || terminal_1.DEFAULT_COLS;
			var rows = opt.rows || terminal_1.DEFAULT_ROWS;
			var encoding = opt.encoding === void 0 ? "utf8" : opt.encoding;
			var term = pty.open(cols, rows);
			self._master = new tty.ReadStream(term.master);
			if (encoding !== null) self._master.setEncoding(encoding);
			self._master.resume();
			self._slave = new tty.ReadStream(term.slave);
			if (encoding !== null) self._slave.setEncoding(encoding);
			self._slave.resume();
			self._socket = self._master;
			self._pid = -1;
			self._fd = term.master;
			self._pty = term.pty;
			self._file = process.argv[0] || "node";
			self._name = process.env.TERM || "";
			self._readable = true;
			self._writable = true;
			self._socket.on("error", function(err) {
				self._close();
				if (self.listeners("error").length < 2) throw err;
			});
			self._socket.on("close", function() {
				self._close();
			});
			return self;
		};
		UnixTerminal.prototype.destroy = function() {
			var _this = this;
			this._close();
			this._socket.once("close", function() {
				_this.kill("SIGHUP");
			});
			this._socket.destroy();
			this._writeStream.dispose();
		};
		UnixTerminal.prototype.kill = function(signal) {
			try {
				process.kill(this.pid, signal || "SIGHUP");
			} catch (e) {}
		};
		Object.defineProperty(UnixTerminal.prototype, "process", {
			get: function() {
				if (process.platform === "darwin") {
					var title = pty.process(this._fd);
					return title !== "kernel_task" ? title : this._file;
				}
				return pty.process(this._fd, this._pty) || this._file;
			},
			enumerable: false,
			configurable: true
		});
		/**
		* TTY
		*/
		UnixTerminal.prototype.resize = function(cols, rows) {
			if (cols <= 0 || rows <= 0 || isNaN(cols) || isNaN(rows) || cols === Infinity || rows === Infinity) throw new Error("resizing must be done using positive cols and rows");
			pty.resize(this._fd, cols, rows);
			this._cols = cols;
			this._rows = rows;
		};
		UnixTerminal.prototype.clear = function() {};
		UnixTerminal.prototype._sanitizeEnv = function(env) {
			delete env["TMUX"];
			delete env["TMUX_PANE"];
			delete env["STY"];
			delete env["WINDOW"];
			delete env["WINDOWID"];
			delete env["TERMCAP"];
			delete env["COLUMNS"];
			delete env["LINES"];
		};
		return UnixTerminal;
	}(terminal_1.Terminal);
	exports.UnixTerminal = UnixTerminal;
	/**
	* A custom write stream that writes directly to a file descriptor with proper
	* handling of backpressure and errors. This avoids some event loop exhaustion
	* issues that can occur when using the standard APIs in Node.
	*/
	var CustomWriteStream = function() {
		function CustomWriteStream(_fd, _encoding) {
			this._fd = _fd;
			this._encoding = _encoding;
			this._writeQueue = [];
		}
		CustomWriteStream.prototype.dispose = function() {
			clearImmediate(this._writeImmediate);
			this._writeImmediate = void 0;
		};
		CustomWriteStream.prototype.write = function(data) {
			var buffer = typeof data === "string" ? Buffer.from(data, this._encoding) : Buffer.from(data);
			if (buffer.byteLength !== 0) {
				this._writeQueue.push({
					buffer,
					offset: 0
				});
				if (this._writeQueue.length === 1) this._processWriteQueue();
			}
		};
		CustomWriteStream.prototype._processWriteQueue = function() {
			var _this = this;
			this._writeImmediate = void 0;
			if (this._writeQueue.length === 0) return;
			var task = this._writeQueue[0];
			fs.write(this._fd, task.buffer, task.offset, function(err, written) {
				if (err) {
					if ("code" in err && err.code === "EAGAIN") _this._writeImmediate = setImmediate(function() {
						return _this._processWriteQueue();
					});
					else {
						_this._writeQueue.length = 0;
						console.error("Unhandled pty write error", err);
					}
					return;
				}
				task.offset += written;
				if (task.offset >= task.buffer.byteLength) _this._writeQueue.shift();
				_this._processWriteQueue();
			});
		};
		return CustomWriteStream;
	}();
}));

//#endregion
//#region ../../node_modules/node-pty/lib/index.js
var require_lib = /* @__PURE__ */ require_cli.__commonJSMin(((exports) => {
	/**
	* Copyright (c) 2012-2015, Christopher Jeffrey, Peter Sunde (MIT License)
	* Copyright (c) 2016, Daniel Imms (MIT License).
	* Copyright (c) 2018, Microsoft Corporation (MIT License).
	*/
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.native = exports.open = exports.createTerminal = exports.fork = exports.spawn = void 0;
	var utils_1 = require_utils();
	var terminalCtor;
	if (process.platform === "win32") terminalCtor = require_windowsTerminal().WindowsTerminal;
	else terminalCtor = require_unixTerminal().UnixTerminal;
	/**
	* Forks a process as a pseudoterminal.
	* @param file The file to launch.
	* @param args The file's arguments as argv (string[]) or in a pre-escaped
	* CommandLine format (string). Note that the CommandLine option is only
	* available on Windows and is expected to be escaped properly.
	* @param options The options of the terminal.
	* @throws When the file passed to spawn with does not exists.
	* @see CommandLineToArgvW https://msdn.microsoft.com/en-us/library/windows/desktop/bb776391(v=vs.85).aspx
	* @see Parsing C++ Comamnd-Line Arguments https://msdn.microsoft.com/en-us/library/17w5ykft.aspx
	* @see GetCommandLine https://msdn.microsoft.com/en-us/library/windows/desktop/ms683156.aspx
	*/
	function spawn(file, args, opt) {
		return new terminalCtor(file, args, opt);
	}
	exports.spawn = spawn;
	/** @deprecated */
	function fork(file, args, opt) {
		return new terminalCtor(file, args, opt);
	}
	exports.fork = fork;
	/** @deprecated */
	function createTerminal(file, args, opt) {
		return new terminalCtor(file, args, opt);
	}
	exports.createTerminal = createTerminal;
	function open(options) {
		return terminalCtor.open(options);
	}
	exports.open = open;
	/**
	* Expose the native API when not Windows, note that this is not public API and
	* could be removed at any time.
	*/
	exports.native = process.platform !== "win32" ? utils_1.loadNativeModule("pty").module : null;
}));

//#endregion
//#region src/backend/terminal.ts
const MAX_SCROLLBACK = 5e4;
var SessionStore = class {
	scrollback = [];
	append(data) {
		this.scrollback.push(data);
		if (this.scrollback.length > MAX_SCROLLBACK * 1.5) this.scrollback = this.scrollback.slice(-MAX_SCROLLBACK);
	}
	getAll() {
		return this.scrollback.join("");
	}
	clear() {
		this.scrollback = [];
	}
};
let pty = null;
let ptyLoadError = null;
try {
	pty = require_lib();
} catch (err) {
	ptyLoadError = err instanceof Error ? err.message : String(err);
}
const DISCONNECT_TIMEOUT_MS = 6e4;
const STATUS_INTERVAL_MS = 1e3;
const ACTIVE_THRESHOLD_MS = 2e3;
function ptyLog(level, ...args) {
	const ts = (/* @__PURE__ */ new Date()).toISOString();
	const msg = args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" ");
	console.error(`[${ts}] [${level}] [pty-manager] ${msg}`);
}
var PtyManager = class PtyManager {
	static instance = null;
	session = null;
	connectedClients = /* @__PURE__ */ new Set();
	lastOutputTime = 0;
	statusInterval = null;
	static getInstance() {
		if (!PtyManager.instance) PtyManager.instance = new PtyManager();
		return PtyManager.instance;
	}
	spawn(opts) {
		if (!pty) {
			ptyLog("ERROR", `node-pty not available: ${ptyLoadError}`);
			this.broadcastToClients({
				type: "output",
				data: `\r\n\x1b[31mTerminal unavailable: node-pty is not installed.\r\nError: ${ptyLoadError}\r\nRun: npm install node-pty\x1b[0m\r\n`
			});
			return;
		}
		if (this.session) {
			ptyLog("INFO", "Killing existing session before spawn");
			this.kill();
		}
		const isWin = process.platform === "win32";
		const shell = isWin ? "cmd.exe" : "/bin/sh";
		const claudeCmd = `claude${opts.skipPermissions ? " --dangerously-skip-permissions" : ""}`;
		const shellArgs = isWin ? ["/c", claudeCmd] : ["-c", claudeCmd];
		ptyLog("INFO", `Spawning: shell=${shell}, args=${JSON.stringify(shellArgs)}, cwd=${opts.cwd}`);
		const proc = pty.spawn(shell, shellArgs, {
			name: "xterm-256color",
			cols: opts.cols ?? 120,
			rows: opts.rows ?? 30,
			cwd: opts.cwd,
			env: process.env
		});
		ptyLog("INFO", `Process spawned with pid=${proc.pid}`);
		const store = new SessionStore();
		this.session = {
			process: proc,
			pid: proc.pid,
			startTime: Date.now(),
			cwd: opts.cwd,
			skipPermissions: opts.skipPermissions,
			disconnectTimer: null,
			store
		};
		this.lastOutputTime = Date.now();
		proc.onData((data) => {
			this.lastOutputTime = Date.now();
			store.append(data);
			if (this.session?.pid === proc.pid) this.broadcastToClients({
				type: "output",
				data
			});
		});
		proc.onExit(({ exitCode }) => {
			ptyLog("INFO", `Process exited with code=${exitCode}`);
			if (this.session?.pid !== proc.pid) {
				ptyLog("INFO", `Ignoring stale exit for old pid=${proc.pid}`);
				return;
			}
			this.broadcastToClients({
				type: "exit",
				code: exitCode
			});
			this.stopStatusBroadcast();
			this.session = null;
		});
		this.broadcastToClients({
			type: "started",
			pid: proc.pid
		});
		this.startStatusBroadcast();
	}
	write(data) {
		if (this.session) this.session.process.write(data);
	}
	resize(cols, rows) {
		if (this.session) this.session.process.resize(cols, rows);
	}
	kill() {
		if (this.session) {
			this.stopStatusBroadcast();
			try {
				this.session.process.kill();
			} catch {}
			if (this.session.disconnectTimer) clearTimeout(this.session.disconnectTimer);
			this.session = null;
		}
	}
	getStatus() {
		if (!this.session) return null;
		return {
			pid: this.session.pid,
			uptime: Math.floor((Date.now() - this.session.startTime) / 1e3),
			cwd: this.session.cwd,
			memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024 * 10) / 10,
			isActive: Date.now() - this.lastOutputTime < ACTIVE_THRESHOLD_MS,
			skipPermissions: this.session.skipPermissions,
			alive: true
		};
	}
	addClient(ws) {
		this.connectedClients.add(ws);
		if (this.session?.disconnectTimer) {
			clearTimeout(this.session.disconnectTimer);
			this.session.disconnectTimer = null;
		}
		if (this.session) {
			const scrollback = this.session.store.getAll();
			if (scrollback) ws.send(JSON.stringify({
				type: "scrollback",
				data: scrollback
			}));
			const status = this.getStatus();
			if (status) ws.send(JSON.stringify({
				type: "status",
				...status
			}));
		}
	}
	removeClient(ws) {
		this.connectedClients.delete(ws);
		if (this.connectedClients.size === 0 && this.session) this.session.disconnectTimer = setTimeout(() => {
			console.error("[pty] No clients connected for 60s, killing process");
			this.kill();
		}, DISCONNECT_TIMEOUT_MS);
	}
	isAlive() {
		return this.session !== null;
	}
	isAvailable() {
		return pty !== null;
	}
	broadcastToClients(message) {
		const data = JSON.stringify(message);
		for (const client of this.connectedClients) if (client.readyState === 1) client.send(data);
	}
	startStatusBroadcast() {
		this.stopStatusBroadcast();
		this.statusInterval = setInterval(() => {
			const status = this.getStatus();
			if (status) this.broadcastToClients({
				type: "status",
				...status
			});
		}, STATUS_INTERVAL_MS);
	}
	stopStatusBroadcast() {
		if (this.statusInterval) {
			clearInterval(this.statusInterval);
			this.statusInterval = null;
		}
	}
};

//#endregion
//#region src/backend/server.ts
/**
* MAXSIM Backend Server — Unified persistent backend service
*
* Consolidates HTTP API, WebSocket, MCP endpoint, terminal management,
* and file watching into a single per-project process.
*
* CRITICAL: Never import output() or error() from core — they call process.exit().
* CRITICAL: Never write to stdout directly — stdout may be reserved for protocol use.
* All logging must go to stderr via console.error().
*/
function log(level, tag, ...args) {
	const ts = (/* @__PURE__ */ new Date()).toISOString();
	const msg = args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" ");
	console.error(`[${ts}] [${level}] [${tag}] ${msg}`);
}
function isWithinPlanning(cwd, targetPath) {
	const planningDir = node_path.resolve(cwd, ".planning");
	return node_path.resolve(cwd, targetPath).startsWith(planningDir);
}
function normalizeFsPath(p) {
	return p.replace(/\\/g, "/");
}
function parseRoadmap(cwd) {
	const roadmapPath = node_path.join(cwd, ".planning", "ROADMAP.md");
	if (!node_fs.existsSync(roadmapPath)) return null;
	const content = node_fs.readFileSync(roadmapPath, "utf-8").replace(/\r\n/g, "\n");
	const phasesDir = node_path.join(cwd, ".planning", "phases");
	const phasePattern = require_cli.getPhasePattern();
	const phases = [];
	let match;
	while ((match = phasePattern.exec(content)) !== null) {
		const phaseNum = match[1];
		const phaseName = match[2].replace(/\(INSERTED\)/i, "").trim();
		const sectionStart = match.index;
		const nextHeader = content.slice(sectionStart).match(/\n#{2,4}\s+Phase\s+\d/i);
		const sectionEnd = nextHeader ? sectionStart + nextHeader.index : content.length;
		const section = content.slice(sectionStart, sectionEnd);
		const goalMatch = section.match(/\*\*Goal(?::\*\*|\*\*:)\s*([^\n]+)/i);
		const goal = goalMatch ? goalMatch[1].trim() : null;
		const dependsMatch = section.match(/\*\*Depends on:\*\*\s*([^\n]+)/i);
		const depends_on = dependsMatch ? dependsMatch[1].trim() : null;
		const normalized = require_cli.normalizePhaseName(phaseNum);
		let diskStatus = "no_directory";
		let planCount = 0;
		let summaryCount = 0;
		let hasContext = false;
		let hasResearch = false;
		try {
			const dirMatch = node_fs.readdirSync(phasesDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).find((d) => d.startsWith(normalized + "-") || d === normalized);
			if (dirMatch) {
				const phaseFiles = node_fs.readdirSync(node_path.join(phasesDir, dirMatch));
				planCount = phaseFiles.filter((f) => f.endsWith("-PLAN.md") || f === "PLAN.md").length;
				summaryCount = phaseFiles.filter((f) => f.endsWith("-SUMMARY.md") || f === "SUMMARY.md").length;
				hasContext = phaseFiles.some((f) => f.endsWith("-CONTEXT.md") || f === "CONTEXT.md");
				hasResearch = phaseFiles.some((f) => f.endsWith("-RESEARCH.md") || f === "RESEARCH.md");
				if (summaryCount >= planCount && planCount > 0) diskStatus = "complete";
				else if (summaryCount > 0) diskStatus = "partial";
				else if (planCount > 0) diskStatus = "planned";
				else if (hasResearch) diskStatus = "researched";
				else if (hasContext) diskStatus = "discussed";
				else diskStatus = "empty";
			}
		} catch {}
		const checkboxPattern = new RegExp(`-\\s*\\[(x| )\\]\\s*.*Phase\\s+${phaseNum.replace(".", "\\.")}`, "i");
		const checkboxMatch = content.match(checkboxPattern);
		const roadmapComplete = checkboxMatch ? checkboxMatch[1] === "x" : false;
		phases.push({
			number: phaseNum,
			name: phaseName,
			goal,
			depends_on,
			plan_count: planCount,
			summary_count: summaryCount,
			has_context: hasContext,
			has_research: hasResearch,
			disk_status: diskStatus,
			roadmap_complete: roadmapComplete
		});
	}
	const milestones = [];
	const milestonePattern = /##\s*(.*v(\d+\.\d+)[^(\n]*)/gi;
	let mMatch;
	while ((mMatch = milestonePattern.exec(content)) !== null) milestones.push({
		heading: mMatch[1].trim(),
		version: "v" + mMatch[2]
	});
	const currentPhase = phases.find((p) => p.disk_status === "planned" || p.disk_status === "partial") || null;
	const nextPhase = phases.find((p) => p.disk_status === "empty" || p.disk_status === "no_directory" || p.disk_status === "discussed" || p.disk_status === "researched") || null;
	const totalPlans = phases.reduce((sum, p) => sum + p.plan_count, 0);
	const totalSummaries = phases.reduce((sum, p) => sum + p.summary_count, 0);
	const completedPhases = phases.filter((p) => p.disk_status === "complete").length;
	return {
		milestones,
		phases,
		phase_count: phases.length,
		completed_phases: completedPhases,
		total_plans: totalPlans,
		total_summaries: totalSummaries,
		progress_percent: totalPlans > 0 ? Math.min(100, Math.round(totalSummaries / totalPlans * 100)) : 0,
		current_phase: currentPhase ? currentPhase.number : null,
		next_phase: nextPhase ? nextPhase.number : null,
		missing_phase_details: null
	};
}
function parseState(cwd) {
	const statePath = node_path.join(cwd, ".planning", "STATE.md");
	if (!node_fs.existsSync(statePath)) return null;
	const content = node_fs.readFileSync(statePath, "utf-8").replace(/\r\n/g, "\n");
	const position = require_cli.stateExtractField(content, "Current Position") || require_cli.stateExtractField(content, "Phase");
	const lastActivity = require_cli.stateExtractField(content, "Last activity") || require_cli.stateExtractField(content, "Last Activity");
	const currentPhase = require_cli.stateExtractField(content, "Current Phase") || require_cli.stateExtractField(content, "Phase");
	const currentPlan = require_cli.stateExtractField(content, "Current Plan") || require_cli.stateExtractField(content, "Plan");
	const status = require_cli.stateExtractField(content, "Status");
	const progress = require_cli.stateExtractField(content, "Progress");
	const decisions = [];
	const decisionsMatch = content.match(/###?\s*Decisions\s*\n([\s\S]*?)(?=\n###?|\n##[^#]|$)/i);
	if (decisionsMatch) {
		const items = decisionsMatch[1].match(/^-\s+(.+)$/gm) || [];
		for (const item of items) decisions.push(item.replace(/^-\s+/, "").trim());
	}
	const blockers = [];
	const blockersMatch = content.match(/###?\s*(?:Blockers|Blockers\/Concerns)\s*\n([\s\S]*?)(?=\n###?|\n##[^#]|$)/i);
	if (blockersMatch) {
		const items = blockersMatch[1].match(/^-\s+(.+)$/gm) || [];
		for (const item of items) blockers.push(item.replace(/^-\s+/, "").trim());
	}
	return {
		position,
		lastActivity,
		currentPhase,
		currentPlan,
		status,
		progress,
		decisions,
		blockers,
		content
	};
}
function parsePhases(cwd) {
	const phasesDir = node_path.join(cwd, ".planning", "phases");
	if (!node_fs.existsSync(phasesDir)) return [];
	const phases = [];
	try {
		const dirs = node_fs.readdirSync(phasesDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort((a, b) => require_cli.comparePhaseNum(a, b));
		for (const dir of dirs) {
			const dm = dir.match(/^(\d+[A-Z]?(?:\.\d+)?)-?(.*)/i);
			const phaseNum = dm ? dm[1] : dir;
			const phaseName = dm && dm[2] ? dm[2].replace(/-/g, " ") : "";
			const phaseFiles = node_fs.readdirSync(node_path.join(phasesDir, dir));
			const planCount = phaseFiles.filter((f) => f.endsWith("-PLAN.md") || f === "PLAN.md").length;
			const summaryCount = phaseFiles.filter((f) => f.endsWith("-SUMMARY.md") || f === "SUMMARY.md").length;
			const hasContext = phaseFiles.some((f) => f.endsWith("-CONTEXT.md") || f === "CONTEXT.md");
			const hasResearch = phaseFiles.some((f) => f.endsWith("-RESEARCH.md") || f === "RESEARCH.md");
			let diskStatus = "no_directory";
			if (summaryCount >= planCount && planCount > 0) diskStatus = "complete";
			else if (summaryCount > 0) diskStatus = "partial";
			else if (planCount > 0) diskStatus = "planned";
			else if (hasResearch) diskStatus = "researched";
			else if (hasContext) diskStatus = "discussed";
			else diskStatus = "empty";
			phases.push({
				number: phaseNum,
				name: phaseName,
				goal: "",
				dependsOn: [],
				planCount,
				summaryCount,
				diskStatus,
				roadmapComplete: diskStatus === "complete",
				hasContext,
				hasResearch
			});
		}
	} catch {}
	return phases;
}
function parsePhaseDetail(cwd, phaseId) {
	const phasesDir = node_path.join(cwd, ".planning", "phases");
	if (!node_fs.existsSync(phasesDir)) return null;
	const normalized = require_cli.normalizePhaseName(phaseId);
	try {
		const dirMatch = node_fs.readdirSync(phasesDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).find((d) => d.startsWith(normalized + "-") || d === normalized);
		if (!dirMatch) return null;
		const phaseDir = node_path.join(phasesDir, dirMatch);
		const phaseFiles = node_fs.readdirSync(phaseDir);
		const planFileNames = phaseFiles.filter((f) => f.endsWith("-PLAN.md") || f === "PLAN.md").sort();
		const plans = [];
		for (const planFileName of planFileNames) {
			const planPath = node_path.join(phaseDir, planFileName);
			const content = node_fs.readFileSync(planPath, "utf-8").replace(/\r\n/g, "\n");
			const frontmatter = require_cli.extractFrontmatter(content);
			const tasks = [];
			const taskRegex = /<task\s+type="([^"]*)"[^>]*>\s*<name>([^<]+)<\/name>([\s\S]*?)<\/task>/g;
			let taskMatch;
			while ((taskMatch = taskRegex.exec(content)) !== null) {
				const taskType = taskMatch[1];
				const taskName = taskMatch[2].trim();
				const taskBody = taskMatch[3];
				const filesMatch = taskBody.match(/<files>([\s\S]*?)<\/files>/);
				const actionMatch = taskBody.match(/<action>([\s\S]*?)<\/action>/);
				const verifyMatch = taskBody.match(/<verify>([\s\S]*?)<\/verify>/);
				const doneMatch = taskBody.match(/<done>([\s\S]*?)<\/done>/);
				const files = filesMatch ? filesMatch[1].trim().split("\n").map((f) => f.trim()).filter(Boolean) : [];
				const doneText = doneMatch ? doneMatch[1].trim() : "";
				tasks.push({
					name: taskName,
					type: taskType,
					files,
					action: actionMatch ? actionMatch[1].trim() : "",
					verify: verifyMatch ? verifyMatch[1].trim() : "",
					done: doneText,
					completed: /^\[x\]/i.test(doneText)
				});
			}
			plans.push({
				path: node_path.join(".planning", "phases", dirMatch, planFileName),
				content,
				frontmatter,
				tasks
			});
		}
		let context = null;
		const contextFile = phaseFiles.find((f) => f.endsWith("-CONTEXT.md") || f === "CONTEXT.md");
		if (contextFile) context = node_fs.readFileSync(node_path.join(phaseDir, contextFile), "utf-8");
		let research = null;
		const researchFile = phaseFiles.find((f) => f.endsWith("-RESEARCH.md") || f === "RESEARCH.md");
		if (researchFile) research = node_fs.readFileSync(node_path.join(phaseDir, researchFile), "utf-8");
		return {
			plans,
			context,
			research
		};
	} catch {
		return null;
	}
}
function parseTodos(cwd) {
	const pendingDir = node_path.join(cwd, ".planning", "todos", "pending");
	const completedDir = node_path.join(cwd, ".planning", "todos", "completed");
	const pending = [];
	const completed = [];
	if (node_fs.existsSync(pendingDir)) try {
		const files = node_fs.readdirSync(pendingDir).filter((f) => f.endsWith(".md"));
		for (const file of files) try {
			const titleMatch = node_fs.readFileSync(node_path.join(pendingDir, file), "utf-8").match(/^title:\s*(.+)$/m);
			pending.push({
				text: titleMatch ? titleMatch[1].trim() : file.replace(".md", ""),
				completed: false,
				file
			});
		} catch {}
	} catch {}
	if (node_fs.existsSync(completedDir)) try {
		const files = node_fs.readdirSync(completedDir).filter((f) => f.endsWith(".md"));
		for (const file of files) try {
			const titleMatch = node_fs.readFileSync(node_path.join(completedDir, file), "utf-8").match(/^title:\s*(.+)$/m);
			completed.push({
				text: titleMatch ? titleMatch[1].trim() : file.replace(".md", ""),
				completed: true,
				file
			});
		} catch {}
	} catch {}
	return {
		pending,
		completed
	};
}
function parseProject(cwd) {
	const projectPath = node_path.join(cwd, ".planning", "PROJECT.md");
	const requirementsPath = node_path.join(cwd, ".planning", "REQUIREMENTS.md");
	return {
		project: node_fs.existsSync(projectPath) ? node_fs.readFileSync(projectPath, "utf-8") : null,
		requirements: node_fs.existsSync(requirementsPath) ? node_fs.readFileSync(requirementsPath, "utf-8") : null
	};
}
function createBackendServer(config) {
	const { projectCwd, host, enableTerminal, enableFileWatcher, enableMcp, logDir } = config;
	let resolvedPort = config.port;
	const startTime = Date.now();
	let serverReady = false;
	node_fs.mkdirSync(logDir, { recursive: true });
	const suppressedPaths = /* @__PURE__ */ new Map();
	const SUPPRESS_TTL_MS = 500;
	function suppressPath(filePath) {
		suppressedPaths.set(normalizeFsPath(filePath), Date.now());
	}
	function isSuppressed(filePath) {
		const normalized = normalizeFsPath(filePath);
		const timestamp = suppressedPaths.get(normalized);
		if (timestamp === void 0) return false;
		if (Date.now() - timestamp > SUPPRESS_TTL_MS) {
			suppressedPaths.delete(normalized);
			return false;
		}
		return true;
	}
	const cleanupInterval = setInterval(() => {
		const now = Date.now();
		for (const [p, ts] of suppressedPaths.entries()) if (now - ts > SUPPRESS_TTL_MS) suppressedPaths.delete(p);
	}, 6e4);
	cleanupInterval.unref();
	const questionQueue = [];
	const pendingAnswers = /* @__PURE__ */ new Map();
	let clientCount = 0;
	const wss = new ws.WebSocketServer({ noServer: true });
	wss.on("connection", (ws$1) => {
		clientCount++;
		log("INFO", "ws", `Client connected (${clientCount} total)`);
		ws$1.on("close", () => {
			clientCount--;
			log("INFO", "ws", `Client disconnected (${clientCount} total)`);
		});
		ws$1.on("error", (err) => {
			log("ERROR", "ws", `Client error: ${err.message}`);
		});
		ws$1.send(JSON.stringify({
			type: "connected",
			timestamp: Date.now()
		}));
		if (questionQueue.length > 0) ws$1.send(JSON.stringify({
			type: "questions-queued",
			questions: questionQueue,
			count: questionQueue.length
		}));
	});
	function broadcast(message) {
		const data = JSON.stringify(message);
		for (const client of wss.clients) if (client.readyState === ws.WebSocket.OPEN) client.send(data);
	}
	let watcher = null;
	async function setupWatcher() {
		if (!enableFileWatcher) return;
		const planningDir = node_path.join(projectCwd, ".planning");
		if (!node_fs.existsSync(planningDir)) {
			log("WARN", "watcher", `.planning/ directory not found at ${planningDir}`);
			return;
		}
		try {
			const chokidar = await import("chokidar");
			const changedPaths = /* @__PURE__ */ new Set();
			let flushTimer = null;
			function flushChanges() {
				if (changedPaths.size > 0) {
					const changes = Array.from(changedPaths);
					changedPaths.clear();
					log("INFO", "watcher", `Broadcasting ${changes.length} change(s)`);
					broadcast({
						type: "file-changes",
						changes,
						timestamp: Date.now()
					});
				}
			}
			function onFileChange(filePath) {
				const normalized = normalizeFsPath(filePath);
				if (isSuppressed(normalized)) return;
				changedPaths.add(normalized);
				if (flushTimer) clearTimeout(flushTimer);
				flushTimer = setTimeout(flushChanges, 500);
			}
			const w = chokidar.watch(planningDir, {
				persistent: true,
				ignoreInitial: true,
				depth: 5
			});
			w.on("add", onFileChange);
			w.on("change", onFileChange);
			w.on("unlink", onFileChange);
			w.on("error", (err) => {
				log("ERROR", "watcher", `Error: ${err.message}`);
			});
			watcher = w;
			log("INFO", "watcher", `Watching ${planningDir}`);
		} catch (err) {
			log("ERROR", "watcher", `Failed to start file watcher: ${err.message}`);
		}
	}
	const app = (0, express.default)();
	app.use(express.default.json());
	app.get("/api/health", (_req, res) => {
		res.json({
			status: "ok",
			ready: serverReady,
			port: resolvedPort,
			cwd: projectCwd,
			uptime: (Date.now() - startTime) / 1e3,
			pid: process.pid,
			mcpEndpoint: enableMcp ? `http://127.0.0.1:${resolvedPort}/mcp` : null,
			terminalAvailable: enableTerminal && PtyManager.getInstance().isAvailable(),
			connectedClients: clientCount
		});
	});
	app.get("/api/ready", (_req, res) => {
		if (serverReady) return res.json({
			ready: true,
			port: resolvedPort,
			cwd: projectCwd
		});
		return res.status(503).json({
			ready: false,
			message: "Server is starting up"
		});
	});
	app.get("/api/roadmap", (_req, res) => {
		try {
			const data = parseRoadmap(projectCwd);
			if (!data) return res.status(404).json({ error: "ROADMAP.md not found" });
			return res.json(data);
		} catch (err) {
			log("ERROR", "api", `GET /api/roadmap failed: ${err.message}`);
			return res.status(500).json({ error: "Internal server error" });
		}
	});
	app.patch("/api/roadmap", (req, res) => {
		try {
			const roadmapPath = node_path.join(projectCwd, ".planning", "ROADMAP.md");
			if (!node_fs.existsSync(roadmapPath)) return res.status(404).json({ error: "ROADMAP.md not found" });
			const { phaseNumber, checked } = req.body;
			if (!phaseNumber || checked === void 0) return res.status(400).json({ error: "phaseNumber and checked are required" });
			let content = node_fs.readFileSync(roadmapPath, "utf-8").replace(/\r\n/g, "\n");
			const escapedNum = phaseNumber.replace(".", "\\.");
			const pattern = new RegExp(`(-\\s*\\[)(x| )(\\]\\s*.*Phase\\s+${escapedNum})`, "i");
			if (!content.match(pattern)) return res.status(404).json({ error: `Phase ${phaseNumber} checkbox not found` });
			content = content.replace(pattern, `$1${checked ? "x" : " "}$3`);
			suppressPath(roadmapPath);
			node_fs.writeFileSync(roadmapPath, content, "utf-8");
			return res.json({
				updated: true,
				phaseNumber,
				checked
			});
		} catch (err) {
			log("ERROR", "api", `PATCH /api/roadmap failed: ${err.message}`);
			return res.status(500).json({ error: "Internal server error" });
		}
	});
	app.get("/api/state", (_req, res) => {
		try {
			const data = parseState(projectCwd);
			if (!data) return res.status(404).json({ error: "STATE.md not found" });
			return res.json(data);
		} catch (err) {
			log("ERROR", "api", `GET /api/state failed: ${err.message}`);
			return res.status(500).json({ error: "Internal server error" });
		}
	});
	app.patch("/api/state", (req, res) => {
		try {
			const statePath = node_path.join(projectCwd, ".planning", "STATE.md");
			if (!node_fs.existsSync(statePath)) return res.status(404).json({ error: "STATE.md not found" });
			const { field, value } = req.body;
			if (!field || value === void 0) return res.status(400).json({ error: "field and value are required" });
			const updated = require_cli.stateReplaceField(node_fs.readFileSync(statePath, "utf-8").replace(/\r\n/g, "\n"), field, value);
			if (!updated) return res.status(404).json({ error: `Field "${field}" not found in STATE.md` });
			suppressPath(statePath);
			node_fs.writeFileSync(statePath, updated, "utf-8");
			return res.json({
				updated: true,
				field
			});
		} catch (err) {
			log("ERROR", "api", `PATCH /api/state failed: ${err.message}`);
			return res.status(500).json({ error: "Internal server error" });
		}
	});
	function ensureStateMd(statePath) {
		if (node_fs.existsSync(statePath)) return;
		const planningDir = node_path.dirname(statePath);
		node_fs.mkdirSync(planningDir, { recursive: true });
		const template = `# Project State

## Current Position

Phase: 1
Status: In progress
Last activity: ${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]} — State file created

## Accumulated Context

### Decisions

None yet.

### Blockers/Concerns

None yet.
`;
		node_fs.writeFileSync(statePath, template, "utf-8");
	}
	function appendToStateSection(statePath, sectionPattern, entry, fallbackSection) {
		let content = node_fs.readFileSync(statePath, "utf-8").replace(/\r\n/g, "\n");
		const match = content.match(sectionPattern);
		if (match) {
			let sectionBody = match[2];
			sectionBody = sectionBody.replace(/None yet\.?\s*\n?/gi, "").replace(/No decisions yet\.?\s*\n?/gi, "").replace(/None\.?\s*\n?/gi, "");
			sectionBody = sectionBody.trimEnd() + "\n" + entry + "\n";
			content = content.replace(sectionPattern, (_m, header) => `${header}${sectionBody}`);
		} else content = content.trimEnd() + "\n\n" + fallbackSection + "\n" + entry + "\n";
		suppressPath(statePath);
		node_fs.writeFileSync(statePath, content, "utf-8");
	}
	app.post("/api/state/decision", (req, res) => {
		try {
			const statePath = node_path.join(projectCwd, ".planning", "STATE.md");
			ensureStateMd(statePath);
			const { phase, text } = req.body;
			if (!text?.trim()) return res.status(400).json({ error: "text is required" });
			const entry = `- [Phase ${phase?.trim() || "?"}]: ${text.trim()}`;
			appendToStateSection(statePath, /(###?\s*(?:Decisions|Decisions Made|Accumulated.*Decisions)\s*\n)([\s\S]*?)(?=\n###?|\n##[^#]|$)/i, entry, "### Decisions");
			return res.json({
				added: true,
				decision: entry
			});
		} catch (err) {
			log("ERROR", "api", `POST /api/state/decision failed: ${err.message}`);
			return res.status(500).json({ error: "Internal server error" });
		}
	});
	app.post("/api/state/blocker", (req, res) => {
		try {
			const statePath = node_path.join(projectCwd, ".planning", "STATE.md");
			ensureStateMd(statePath);
			const { text } = req.body;
			if (!text?.trim()) return res.status(400).json({ error: "text is required" });
			appendToStateSection(statePath, /(###?\s*(?:Blockers|Blockers\/Concerns|Concerns)\s*\n)([\s\S]*?)(?=\n###?|\n##[^#]|$)/i, `- ${text.trim()}`, "### Blockers/Concerns");
			return res.json({
				added: true,
				blocker: text.trim()
			});
		} catch (err) {
			log("ERROR", "api", `POST /api/state/blocker failed: ${err.message}`);
			return res.status(500).json({ error: "Internal server error" });
		}
	});
	app.get("/api/phases", (_req, res) => {
		try {
			return res.json(parsePhases(projectCwd));
		} catch (err) {
			log("ERROR", "api", `GET /api/phases failed: ${err.message}`);
			return res.status(500).json({ error: "Internal server error" });
		}
	});
	app.get("/api/phase/:id", (req, res) => {
		try {
			const data = parsePhaseDetail(projectCwd, req.params.id);
			if (!data) return res.status(404).json({ error: `Phase ${req.params.id} not found` });
			return res.json(data);
		} catch (err) {
			log("ERROR", "api", `GET /api/phase/:id failed: ${err.message}`);
			return res.status(500).json({ error: "Internal server error" });
		}
	});
	app.get("/api/todos", (_req, res) => {
		try {
			return res.json(parseTodos(projectCwd));
		} catch (err) {
			log("ERROR", "api", `GET /api/todos failed: ${err.message}`);
			return res.status(500).json({ error: "Internal server error" });
		}
	});
	app.post("/api/todos", (req, res) => {
		try {
			const pendingDir = node_path.join(projectCwd, ".planning", "todos", "pending");
			const { text } = req.body;
			if (!text) return res.status(400).json({ error: "text is required" });
			node_fs.mkdirSync(pendingDir, { recursive: true });
			const timestamp = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
			const filename = `${timestamp}-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.md`;
			const filePath = node_path.join(pendingDir, filename);
			const content = `title: ${text}\ncreated: ${timestamp}\narea: general\n\n${text}\n`;
			suppressPath(filePath);
			node_fs.writeFileSync(filePath, content, "utf-8");
			return res.json({
				created: true,
				file: filename,
				text
			});
		} catch (err) {
			log("ERROR", "api", `POST /api/todos failed: ${err.message}`);
			return res.status(500).json({ error: "Internal server error" });
		}
	});
	app.patch("/api/todos", (req, res) => {
		try {
			const pendingDir = node_path.join(projectCwd, ".planning", "todos", "pending");
			const completedDir = node_path.join(projectCwd, ".planning", "todos", "completed");
			const { file, completed } = req.body;
			if (!file) return res.status(400).json({ error: "file is required" });
			if (file.includes("/") || file.includes("\\") || file.includes("..")) return res.status(400).json({ error: "Invalid filename" });
			if (completed) {
				const sourcePath = node_path.join(pendingDir, file);
				if (!node_fs.existsSync(sourcePath)) return res.status(404).json({ error: "Todo not found in pending" });
				node_fs.mkdirSync(completedDir, { recursive: true });
				const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
				let content = node_fs.readFileSync(sourcePath, "utf-8");
				content = `completed: ${today}\n` + content;
				const destPath = node_path.join(completedDir, file);
				suppressPath(sourcePath);
				suppressPath(destPath);
				node_fs.writeFileSync(destPath, content, "utf-8");
				node_fs.unlinkSync(sourcePath);
				return res.json({
					completed: true,
					file,
					date: today
				});
			} else {
				const sourcePath = node_path.join(completedDir, file);
				if (!node_fs.existsSync(sourcePath)) return res.status(404).json({ error: "Todo not found in completed" });
				node_fs.mkdirSync(pendingDir, { recursive: true });
				let content = node_fs.readFileSync(sourcePath, "utf-8");
				content = content.replace(/^completed:\s*.+\n/m, "");
				const destPath = node_path.join(pendingDir, file);
				suppressPath(sourcePath);
				suppressPath(destPath);
				node_fs.writeFileSync(destPath, content, "utf-8");
				node_fs.unlinkSync(sourcePath);
				return res.json({
					completed: false,
					file
				});
			}
		} catch (err) {
			log("ERROR", "api", `PATCH /api/todos failed: ${err.message}`);
			return res.status(500).json({ error: "Internal server error" });
		}
	});
	app.get("/api/project", (_req, res) => {
		try {
			return res.json(parseProject(projectCwd));
		} catch (err) {
			log("ERROR", "api", `GET /api/project failed: ${err.message}`);
			return res.status(500).json({ error: "Internal server error" });
		}
	});
	app.get("/api/plan/*", (req, res) => {
		try {
			const pathSegments = req.params["0"].split("/");
			const relativePath = node_path.join(".planning", ...pathSegments);
			if (!isWithinPlanning(projectCwd, relativePath)) return res.status(403).json({ error: "Path traversal not allowed" });
			const fullPath = node_path.join(projectCwd, relativePath);
			if (!node_fs.existsSync(fullPath)) return res.status(404).json({ error: "File not found" });
			const content = node_fs.readFileSync(fullPath, "utf-8");
			return res.json({
				path: relativePath,
				content
			});
		} catch (err) {
			log("ERROR", "api", `GET /api/plan/* failed: ${err.message}`);
			return res.status(500).json({ error: "Internal server error" });
		}
	});
	app.put("/api/plan/*", (req, res) => {
		try {
			const pathSegments = req.params["0"].split("/");
			const relativePath = node_path.join(".planning", ...pathSegments);
			if (!isWithinPlanning(projectCwd, relativePath)) return res.status(403).json({ error: "Path traversal not allowed" });
			const { content } = req.body;
			if (content === void 0) return res.status(400).json({ error: "content is required" });
			const fullPath = node_path.join(projectCwd, relativePath);
			const dir = node_path.dirname(fullPath);
			if (!node_fs.existsSync(dir)) node_fs.mkdirSync(dir, { recursive: true });
			suppressPath(fullPath);
			node_fs.writeFileSync(fullPath, content, "utf-8");
			return res.json({
				written: true,
				path: relativePath
			});
		} catch (err) {
			log("ERROR", "api", `PUT /api/plan/* failed: ${err.message}`);
			return res.status(500).json({ error: "Internal server error" });
		}
	});
	app.get("/api/server-info", (_req, res) => {
		const localNetworkIp = getLocalNetworkIp();
		return res.json({
			localUrl: `http://127.0.0.1:${resolvedPort}`,
			networkUrl: localNetworkIp ? `http://${localNetworkIp}:${resolvedPort}` : null,
			projectName: node_path.basename(projectCwd),
			projectCwd
		});
	});
	let shutdownFn = null;
	app.post("/api/shutdown", (_req, res) => {
		res.json({ shutdown: true });
		setTimeout(() => shutdownFn?.(), 100);
	});
	app.post("/api/mcp-answer", (req, res) => {
		const { questionId, answer } = req.body;
		if (!questionId || !answer) return res.status(400).json({ error: "questionId and answer are required" });
		const resolve = pendingAnswers.get(questionId);
		if (!resolve) return res.status(404).json({ error: "No pending question with that ID" });
		pendingAnswers.delete(questionId);
		resolve(answer);
		return res.json({ answered: true });
	});
	if (enableMcp) {
		app.post("/mcp", async (req, res) => {
			const mcpServer = new _modelcontextprotocol_sdk_server_mcp_js.McpServer({
				name: "maxsim-backend",
				version: "1.0.0"
			});
			registerAllTools(mcpServer);
			try {
				const transport = new _modelcontextprotocol_sdk_server_streamableHttp_js.StreamableHTTPServerTransport({ sessionIdGenerator: void 0 });
				await mcpServer.connect(transport);
				await transport.handleRequest(req, res, req.body);
				res.on("close", () => {
					transport.close();
					mcpServer.close();
				});
			} catch (error) {
				log("ERROR", "mcp", `Error handling MCP POST request: ${error}`);
				if (!res.headersSent) res.status(500).json({
					jsonrpc: "2.0",
					error: {
						code: -32603,
						message: "Internal server error"
					},
					id: null
				});
			}
		});
		app.get("/mcp", (_req, res) => {
			res.writeHead(405).end(JSON.stringify({
				jsonrpc: "2.0",
				error: {
					code: -32e3,
					message: "Method not allowed."
				},
				id: null
			}));
		});
		app.delete("/mcp", (_req, res) => {
			res.status(200).end();
		});
	}
	const terminalWss = new ws.WebSocketServer({ noServer: true });
	const ptyManager = enableTerminal ? PtyManager.getInstance() : null;
	if (ptyManager && !ptyManager.isAvailable()) log("WARN", "server", "node-pty not available — terminal features disabled");
	terminalWss.on("connection", (ws$2) => {
		if (!ptyManager) return;
		log("INFO", "terminal-ws", "Client connected");
		ptyManager.addClient(ws$2);
		if (!ptyManager.isAvailable()) ws$2.send(JSON.stringify({
			type: "unavailable",
			reason: "node-pty is not installed"
		}));
		ws$2.on("message", (raw) => {
			try {
				const msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
				switch (msg.type) {
					case "input":
						ptyManager.write(msg.data);
						break;
					case "resize":
						ptyManager.resize(msg.cols, msg.rows);
						break;
					case "spawn":
						try {
							ptyManager.spawn({
								skipPermissions: !!msg.skipPermissions,
								cwd: projectCwd,
								cols: msg.cols,
								rows: msg.rows
							});
						} catch (err) {
							const errMsg = err instanceof Error ? err.message : String(err);
							ws$2.send(JSON.stringify({
								type: "output",
								data: `\r\n\x1b[31mFailed to start terminal: ${errMsg}\x1b[0m\r\n`
							}));
						}
						break;
					case "kill":
						ptyManager.kill();
						break;
				}
			} catch (err) {
				log("ERROR", "terminal-ws", `Message handling error: ${err.message}`);
			}
		});
		ws$2.on("close", () => {
			log("INFO", "terminal-ws", "Client disconnected");
			ptyManager.removeClient(ws$2);
		});
		ws$2.on("error", (err) => {
			log("ERROR", "terminal-ws", `Client error: ${err.message}`);
		});
	});
	const server = (0, node_http.createServer)(app);
	server.on("upgrade", (req, socket, head) => {
		const url = req.url || "/";
		if (url === "/ws/terminal" || url.startsWith("/ws/terminal?")) terminalWss.handleUpgrade(req, socket, head, (ws$3) => {
			terminalWss.emit("connection", ws$3, req);
		});
		else if (url === "/api/ws" || url.startsWith("/api/ws?")) wss.handleUpgrade(req, socket, head, (ws$4) => {
			wss.emit("connection", ws$4, req);
		});
		else socket.destroy();
	});
	async function start() {
		const port = await (0, detect_port.default)(config.port);
		resolvedPort = port;
		await setupWatcher();
		return new Promise((resolve) => {
			server.listen(port, host, () => {
				serverReady = true;
				log("INFO", "server", `Backend ready on ${host}:${port} for ${projectCwd}`);
				if (enableMcp) log("INFO", "mcp", `MCP endpoint available at http://127.0.0.1:${port}/mcp`);
				resolve();
			});
		});
	}
	async function stop() {
		log("INFO", "server", "Shutting down...");
		clearInterval(cleanupInterval);
		if (ptyManager) ptyManager.kill();
		if (watcher) await watcher.close().catch(() => {});
		terminalWss.close(() => {});
		wss.close(() => {});
		return new Promise((resolve) => {
			server.close(() => {
				log("INFO", "server", "Server closed");
				resolve();
			});
		});
	}
	shutdownFn = () => {
		stop().then(() => process.exit(0)).catch(() => process.exit(1));
	};
	function getStatus() {
		return {
			status: serverReady ? "ok" : "starting",
			ready: serverReady,
			port: resolvedPort,
			cwd: projectCwd,
			uptime: (Date.now() - startTime) / 1e3,
			pid: process.pid,
			mcpEndpoint: enableMcp ? `http://127.0.0.1:${resolvedPort}/mcp` : null,
			terminalAvailable: ptyManager?.isAvailable() ?? false,
			connectedClients: clientCount
		};
	}
	function getPort() {
		return resolvedPort;
	}
	return {
		start,
		stop,
		getStatus,
		getPort
	};
}
function getLocalNetworkIp() {
	const ifaces = node_os.networkInterfaces();
	for (const iface of Object.values(ifaces)) for (const info of iface ?? []) if (info.family === "IPv4" && !info.internal) return info.address;
	return null;
}

//#endregion
exports.createBackendServer = createBackendServer;
//# sourceMappingURL=server-BAHfh_vw.cjs.map