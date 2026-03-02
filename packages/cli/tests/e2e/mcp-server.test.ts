import { describe, it, expect } from 'vitest';
import { inject } from 'vitest';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Send a JSON-RPC request over MCP stdio protocol.
 * MCP uses Content-Length header framing (like LSP).
 */
function sendMcpRequest(
  proc: ReturnType<typeof spawn>,
  method: string,
  params: Record<string, unknown> = {},
  id: number = 1,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`MCP request '${method}' timed out`)), 10_000);
    let buffer = '';

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      // Parse JSON-RPC response — MCP uses newline-delimited JSON
      const lines = buffer.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.id === id || parsed.method === undefined) {
            clearTimeout(timeout);
            proc.stdout!.off('data', onData);
            resolve(parsed);
            return;
          }
        } catch {
          // Not a complete JSON line yet
        }
      }
    };

    proc.stdout!.on('data', onData);

    const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    proc.stdin!.write(body + '\n');
  });
}

describe('MCP-01: MCP server startup and tools', () => {
  it('mcp-server.cjs is installed in the correct location', () => {
    const installDir = inject('installDir');
    const mcpPath = join(installDir, '.claude', 'maxsim', 'bin', 'mcp-server.cjs');
    expect(existsSync(mcpPath)).toBe(true);
  });

  it('MCP server starts without module errors', async () => {
    const installDir = inject('installDir');
    const mcpPath = join(installDir, '.claude', 'maxsim', 'bin', 'mcp-server.cjs');

    const proc = spawn('node', [mcpPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: installDir,
    });

    // Collect stderr to check for startup message or errors
    let stderr = '';
    proc.stderr!.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    // Wait for server to start (it writes to stderr on success)
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        // If no error after 3s, consider it started
        resolve();
      }, 3_000);

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      proc.on('exit', (code) => {
        if (code !== 0) {
          clearTimeout(timeout);
          reject(new Error(`MCP server exited with code ${code}: ${stderr}`));
        }
      });

      // Check stderr for startup confirmation
      proc.stderr!.on('data', () => {
        if (stderr.includes('MAXSIM MCP server started')) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    // Server started — verify no "Cannot find module" errors
    expect(stderr).not.toContain('Cannot find module');
    expect(stderr).not.toContain('MODULE_NOT_FOUND');
    expect(stderr).toContain('MAXSIM MCP server started');

    proc.kill();
  });

  it('MCP server responds to initialize request', async () => {
    const installDir = inject('installDir');
    const mcpPath = join(installDir, '.claude', 'maxsim', 'bin', 'mcp-server.cjs');

    const proc = spawn('node', [mcpPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: installDir,
    });

    // Wait for startup
    await new Promise<void>((resolve) => {
      proc.stderr!.on('data', (chunk: Buffer) => {
        if (chunk.toString().includes('MAXSIM MCP server started')) resolve();
      });
      setTimeout(resolve, 3_000);
    });

    // Send initialize request
    const response = await sendMcpRequest(proc, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0.0' },
    });

    expect(response).toHaveProperty('result');
    const result = response.result as Record<string, unknown>;
    expect(result).toHaveProperty('serverInfo');

    proc.kill();
  });

  it('MCP server lists available tools', async () => {
    const installDir = inject('installDir');
    const mcpPath = join(installDir, '.claude', 'maxsim', 'bin', 'mcp-server.cjs');

    const proc = spawn('node', [mcpPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: installDir,
    });

    // Wait for startup
    await new Promise<void>((resolve) => {
      proc.stderr!.on('data', (chunk: Buffer) => {
        if (chunk.toString().includes('MAXSIM MCP server started')) resolve();
      });
      setTimeout(resolve, 3_000);
    });

    // Initialize first
    await sendMcpRequest(proc, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0.0' },
    }, 1);

    // List tools
    const response = await sendMcpRequest(proc, 'tools/list', {}, 2);

    expect(response).toHaveProperty('result');
    const result = response.result as { tools: Array<{ name: string }> };
    expect(Array.isArray(result.tools)).toBe(true);
    expect(result.tools.length).toBeGreaterThan(0);

    // Verify known tools exist
    const toolNames = result.tools.map((t) => t.name);
    expect(toolNames).toContain('mcp_find_phase');

    proc.kill();
  });
});
