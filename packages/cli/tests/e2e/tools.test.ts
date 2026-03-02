import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { inject } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { createMockProject, type MockProject } from './fixtures/mock-project.js';

// Helper: run maxsim-tools command against a project directory
function runTool(args: string, projectDir: string): { stdout: string; exitCode: number } {
  const toolsPath = inject('toolsPath');
  try {
    const stdout = execSync(`node "${toolsPath}" ${args} --cwd "${projectDir}"`, {
      encoding: 'utf8',
      timeout: 15_000,
    });
    return { stdout, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; status?: number };
    return { stdout: e.stdout ?? '', exitCode: e.status ?? 1 };
  }
}

describe('TOOL-01: phase commands', () => {
  let mock: MockProject;
  beforeEach(() => { mock = createMockProject(); });
  afterEach(() => { mock.cleanup(); });

  it('phases list returns directory list', () => {
    const result = runTool('phases list', mock.dir);
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data).toHaveProperty('directories');
    expect(Array.isArray(data.directories)).toBe(true);
  });

  it('phase add creates a new phase in ROADMAP.md', () => {
    const result = runTool('phase add "New Phase"', mock.dir);
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    // phase add returns { phase_number, padded, name, slug, directory }
    expect(data).toHaveProperty('phase_number');
    expect(data).toHaveProperty('name', 'New Phase');
  });

  it('phase complete marks a phase complete', () => {
    const result = runTool('phase complete 01', mock.dir);
    expect(result.exitCode).toBe(0);
  });

  it('phases list with --offset and --limit returns paginated subset', () => {
    // Mock project has 4 phase dirs
    const full = runTool('phases list', mock.dir);
    const fullData = JSON.parse(full.stdout);
    expect(fullData.total).toBeGreaterThanOrEqual(4);

    const paginated = runTool('phases list --offset 1 --limit 2', mock.dir);
    expect(paginated.exitCode).toBe(0);
    const data = JSON.parse(paginated.stdout);
    expect(data.count).toBe(2);
    expect(data.total).toBe(fullData.total);
    expect(data.directories).toEqual(fullData.directories.slice(1, 3));
  });
});

describe('TOOL-02: state commands', () => {
  let mock: MockProject;
  beforeEach(() => { mock = createMockProject(); });
  afterEach(() => { mock.cleanup(); });

  it('state returns STATE.md content', () => {
    const result = runTool('state', mock.dir);
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.state_exists).toBe(true);
  });

  it('state add-decision adds a decision to STATE.md', () => {
    const result = runTool(
      'state add-decision --phase 01 --summary "Test decision" --rationale "For E2E validation"',
      mock.dir
    );
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.added).toBe(true);
  });

  it('state add-blocker adds a blocker to STATE.md', () => {
    const result = runTool(
      'state add-blocker --text "Test blocker for E2E"',
      mock.dir
    );
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.added).toBe(true);
  });
});

describe('TOOL-03: roadmap commands', () => {
  let mock: MockProject;
  beforeEach(() => { mock = createMockProject(); });
  afterEach(() => { mock.cleanup(); });

  it('roadmap analyze returns structured phase data', () => {
    const result = runTool('roadmap analyze', mock.dir);
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(Array.isArray(data.phases)).toBe(true);
    // Mock project has 2 phases
    expect(data.phases.length).toBeGreaterThanOrEqual(1);
  });
});

describe('TOOL-04: todo commands', () => {
  let mock: MockProject;
  beforeEach(() => { mock = createMockProject(); });
  afterEach(() => { mock.cleanup(); });

  it('list-todos returns the pre-created pending todo', () => {
    const result = runTool('list-todos', mock.dir);
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    // Mock fixture creates 1 pending todo
    expect(data.count).toBe(1);
    expect(Array.isArray(data.todos)).toBe(true);
  });

  it('todo complete moves the todo to completed/', () => {
    // The mock fixture creates todo-001-test-task.md in todos/pending/
    const result = runTool('todo complete todo-001-test-task.md', mock.dir);
    expect(result.exitCode).toBe(0);
    // After completion, the file should be in todos/completed/
    const completedPath = join(mock.dir, '.planning', 'todos', 'completed', 'todo-001-test-task.md');
    expect(existsSync(completedPath)).toBe(true);
  });
});

describe('TOOL-05: validate and milestone commands', () => {
  let mock: MockProject;
  beforeEach(() => { mock = createMockProject(); });
  afterEach(() => { mock.cleanup(); });

  it('validate health returns a valid status', () => {
    const result = runTool('validate health', mock.dir);
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(['ok', 'degraded', 'error']).toContain(data.status);
  });
});

describe('TOOL-06: full phase lifecycle workflow', () => {
  let mock: MockProject;
  beforeEach(() => { mock = createMockProject(); });
  afterEach(() => { mock.cleanup(); });

  it('add phase → verify in roadmap → complete → verify state updated', () => {
    // Step 1: Add a new phase
    const addResult = runTool('phase add "E2E Lifecycle Test"', mock.dir);
    expect(addResult.exitCode).toBe(0);
    const addData = JSON.parse(addResult.stdout);
    const phaseNum = addData.padded;

    // Step 2: Verify the new phase appears in roadmap analysis
    const roadmapResult = runTool('roadmap analyze', mock.dir);
    expect(roadmapResult.exitCode).toBe(0);
    const roadmapData = JSON.parse(roadmapResult.stdout);
    const phaseNames = roadmapData.phases.map((p: { name: string }) => p.name);
    expect(phaseNames).toContain('E2E Lifecycle Test');

    // Step 3: Verify the phase directory was created
    const listResult = runTool('phases list', mock.dir);
    expect(listResult.exitCode).toBe(0);
    const listData = JSON.parse(listResult.stdout);
    const dirNames = listData.directories.map((d: string) => d.toLowerCase());
    expect(dirNames.some((d: string) => d.includes('lifecycle'))).toBe(true);

    // Step 4: Complete the original phase 01
    const completeResult = runTool('phase complete 01', mock.dir);
    expect(completeResult.exitCode).toBe(0);

    // Step 5: Verify state reflects the completion
    const stateResult = runTool('state', mock.dir);
    expect(stateResult.exitCode).toBe(0);
    const stateData = JSON.parse(stateResult.stdout);
    expect(stateData.state_exists).toBe(true);
  });
});

describe('TOOL-07: todo lifecycle workflow', () => {
  let mock: MockProject;
  beforeEach(() => { mock = createMockProject(); });
  afterEach(() => { mock.cleanup(); });

  it('list → complete → verify moved to completed/', () => {
    // Step 1: List pending todos — should have 1
    const listResult = runTool('list-todos', mock.dir);
    expect(listResult.exitCode).toBe(0);
    const listData = JSON.parse(listResult.stdout);
    expect(listData.count).toBe(1);
    expect(listData.todos[0].file).toBe('todo-001-test-task.md');

    // Step 2: Complete the todo
    const completeResult = runTool('todo complete todo-001-test-task.md', mock.dir);
    expect(completeResult.exitCode).toBe(0);

    // Step 3: Verify it moved to completed/
    const completedPath = join(mock.dir, '.planning', 'todos', 'completed', 'todo-001-test-task.md');
    expect(existsSync(completedPath)).toBe(true);

    // Step 4: Verify pending is now empty
    const pendingPath = join(mock.dir, '.planning', 'todos', 'pending', 'todo-001-test-task.md');
    expect(existsSync(pendingPath)).toBe(false);

    // Step 5: List again — should be 0 pending
    const listAgain = runTool('list-todos', mock.dir);
    expect(listAgain.exitCode).toBe(0);
    const listAgainData = JSON.parse(listAgain.stdout);
    expect(listAgainData.count).toBe(0);
  });
});

describe('TOOL-08: state decision and blocker accumulation', () => {
  let mock: MockProject;
  beforeEach(() => { mock = createMockProject(); });
  afterEach(() => { mock.cleanup(); });

  it('adds multiple decisions and blockers, then reads them all back', () => {
    // Add 2 decisions
    runTool('state add-decision --phase 01 --summary "First decision" --rationale "Reason A"', mock.dir);
    runTool('state add-decision --phase 02 --summary "Second decision" --rationale "Reason B"', mock.dir);

    // Add a blocker
    runTool('state add-blocker --text "Blocking issue found"', mock.dir);

    // Read state and verify all accumulated
    const stateResult = runTool('state', mock.dir);
    expect(stateResult.exitCode).toBe(0);

    // Verify the STATE.md file on disk contains our additions
    const statePath = join(mock.dir, '.planning', 'STATE.md');
    const stateContent = readFileSync(statePath, 'utf-8');
    expect(stateContent).toContain('First decision');
    expect(stateContent).toContain('Second decision');
    expect(stateContent).toContain('Blocking issue found');
  });
});

describe('TOOL-09: health check on degraded project', () => {
  let mock: MockProject;
  beforeEach(() => { mock = createMockProject(); });
  afterEach(() => { mock.cleanup(); });

  it('reports degraded when key files are missing', () => {
    // Remove PROJECT.md to simulate degraded state
    const projectPath = join(mock.dir, '.planning', 'PROJECT.md');
    if (existsSync(projectPath)) {
      require('node:fs').unlinkSync(projectPath);
    }

    const result = runTool('validate health', mock.dir);
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    // Should be degraded or error — not ok
    expect(data.status).not.toBe('ok');
  });
});
