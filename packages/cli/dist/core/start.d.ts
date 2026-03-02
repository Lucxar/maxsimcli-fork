/**
 * Start — Orchestrates Dashboard launch + browser open
 *
 * Provides a unified `maxsimcli start` entry point that:
 * 1. Checks for a running dashboard
 * 2. Starts the dashboard if needed
 * 3. Opens the browser
 * 4. Reports status
 */
import type { CmdResult } from './types.js';
export declare function cmdStart(cwd: string, options: {
    noBrowser?: boolean;
    networkMode?: boolean;
}): Promise<CmdResult>;
//# sourceMappingURL=start.d.ts.map