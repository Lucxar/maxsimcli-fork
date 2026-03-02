/**
 * Commands — Standalone utility commands
 *
 * Ported from maxsim/bin/lib/commands.cjs
 */
import type { WebSearchOptions, ScaffoldOptions, TimestampFormat, CmdResult } from './types.js';
export interface TodoFrontmatter {
    created: string;
    title: string;
    area: string;
    completed?: string;
}
export declare function parseTodoFrontmatter(content: string): TodoFrontmatter;
export declare function cmdGenerateSlug(text: string | undefined, raw: boolean): CmdResult;
export declare function cmdCurrentTimestamp(format: TimestampFormat, raw: boolean): CmdResult;
export declare function cmdListTodos(cwd: string, area: string | undefined, raw: boolean): CmdResult;
export declare function cmdVerifyPathExists(cwd: string, targetPath: string | undefined, raw: boolean): CmdResult;
export declare function cmdHistoryDigest(cwd: string, raw: boolean): CmdResult;
export declare function cmdResolveModel(cwd: string, agentType: string | undefined, raw: boolean): CmdResult;
export declare function cmdCommit(cwd: string, message: string | undefined, files: string[], raw: boolean, amend: boolean): Promise<CmdResult>;
export declare function cmdSummaryExtract(cwd: string, summaryPath: string | undefined, fields: string[] | null, raw: boolean): CmdResult;
export declare function cmdWebsearch(query: string | undefined, options: WebSearchOptions, raw: boolean): Promise<CmdResult>;
export declare function cmdProgressRender(cwd: string, format: string, raw: boolean): CmdResult;
export declare function cmdTodoComplete(cwd: string, filename: string | undefined, raw: boolean): CmdResult;
export declare function cmdScaffold(cwd: string, type: string | undefined, options: ScaffoldOptions, raw: boolean): CmdResult;
//# sourceMappingURL=commands.d.ts.map