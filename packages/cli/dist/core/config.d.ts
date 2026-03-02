/**
 * Config — Planning config CRUD operations
 *
 * Ported from maxsim/bin/lib/config.cjs
 */
import type { CmdResult } from './types.js';
export declare function cmdConfigEnsureSection(cwd: string, raw: boolean): CmdResult;
export declare function cmdConfigSet(cwd: string, keyPath: string | undefined, value: string | undefined, raw: boolean): CmdResult;
export declare function cmdConfigGet(cwd: string, keyPath: string | undefined, raw: boolean): CmdResult;
//# sourceMappingURL=config.d.ts.map