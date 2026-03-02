/**
 * State — STATE.md operations and progression engine
 *
 * Ported from maxsim/bin/lib/state.cjs
 */
import type { StateMetricOptions, StateDecisionOptions, StateBlockerOptions, StateSessionOptions, CmdResult } from './types.js';
export declare function stateExtractField(content: string, fieldName: string): string | null;
export declare function stateReplaceField(content: string, fieldName: string, newValue: string): string | null;
/**
 * Append an entry to a section in STATE.md content, removing placeholder text.
 * Returns updated content or null if section not found.
 */
export declare function appendToStateSection(content: string, sectionPattern: RegExp, entry: string, placeholderPatterns?: RegExp[]): string | null;
export declare function cmdStateLoad(cwd: string, raw: boolean): Promise<CmdResult>;
export declare function cmdStateGet(cwd: string, section: string | null, raw: boolean): CmdResult;
export declare function cmdStatePatch(cwd: string, patches: Record<string, string>, raw: boolean): CmdResult;
export declare function cmdStateUpdate(cwd: string, field: string | undefined, value: string | undefined): CmdResult;
export declare function cmdStateAdvancePlan(cwd: string, raw: boolean): CmdResult;
export declare function cmdStateRecordMetric(cwd: string, options: StateMetricOptions, raw: boolean): CmdResult;
export declare function cmdStateUpdateProgress(cwd: string, raw: boolean): CmdResult;
export declare function cmdStateAddDecision(cwd: string, options: StateDecisionOptions, raw: boolean): CmdResult;
export declare function cmdStateAddBlocker(cwd: string, text: string | StateBlockerOptions, raw: boolean): CmdResult;
export declare function cmdStateResolveBlocker(cwd: string, text: string | null, raw: boolean): CmdResult;
export declare function cmdStateRecordSession(cwd: string, options: StateSessionOptions, raw: boolean): CmdResult;
export declare function cmdStateSnapshot(cwd: string, raw: boolean): CmdResult;
//# sourceMappingURL=state.d.ts.map