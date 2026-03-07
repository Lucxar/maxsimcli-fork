# Research Summary

**Domain:** TypeScript codebase refactoring and test infrastructure for CLI tool
**Project:** MAXSIM v5.1 Surgical Cleanup
**Researched:** 2026-03-08
**Confidence:** HIGH

## Executive Summary

The MAXSIM v5.1 milestone targets tech debt elimination in an 8693-line TypeScript core module codebase. The existing stack (TypeScript 5.9.3 with `strict: true`, Vitest 4.0.18, Biome 2.4.4, tsdown 0.20.3) is solid and requires no replacement. Three additive dev dependencies -- `@vitest/coverage-v8` for coverage measurement, `knip` for dead code detection, and `memfs` for filesystem error simulation in tests -- are sufficient to enable safe refactoring.

The error handling migration from `CliOutput`/`CliError` exceptions to `CmdResult` returns is 94% complete: 299 usages of `cmdOk`/`cmdErr` across 17 files versus only 18 remaining `CliOutput`/`CliError` references in 4 files (`core.ts`, `cli.ts`, `index.ts`, `install/index.ts`). The migration is a finishing task, not a rewrite.

The three untested modules (phase.ts 1193 lines, init.ts 1060 lines, verify.ts 965 lines) already have partial error-path tests. The established testing pattern -- real temp directories with scaffolded `.planning/` structures -- is the correct approach and should be extended. `memfs` supplements for error simulation only.

TypeScript compiler flags (`noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`) should be enabled BEFORE refactoring begins to serve as a safety net during code extraction. The sync/async I/O inconsistency (126 sync `fs` calls vs 97 async `fsp` calls across core modules) is a deliberate architectural pattern -- init.ts and verify.ts are synchronous by design for CLI tool speed -- and should NOT be "fixed" as part of this cleanup.

## Key Findings

- **Error handling migration is 94% done:** Only 18 CliOutput/CliError references remain across 4 files. The CmdResult pattern dominates with 299 usages across 17 files.
- **No new runtime dependencies needed:** All three recommended additions (`@vitest/coverage-v8`, `knip`, `memfs`) are dev-only.
- **Established test patterns are correct:** The temp-dir + scaffoldPlanning() pattern in existing tests is the right default. Extend it, do not replace it.
- **Helper extraction is low-risk:** `loadJsonFile()` has 10+ duplication sites with identical try/catch/JSON.parse patterns. Phase-dir resolution has 8 sites.
- **Dead code detection needs tooling:** 4 unused workflow files are known, but unknown unused exports across 17 modules need Knip to identify.
- **Sync I/O in init.ts and verify.ts is intentional:** These modules serve the CLI tools router where synchronous operation avoids callback complexity. Do not convert to async.

## Implications for Roadmap

### Phase 1: Safety Net Setup
- Enable additional TypeScript compiler flags (noUnusedLocals, noUnusedParameters)
- Add @vitest/coverage-v8 and configure coverage thresholds
- Add knip and run initial dead code scan
- Enhance Biome rules for refactoring safety
- **Rationale:** Must have safety nets BEFORE any code changes. Coverage baseline measurement needed.
- **Features:** Coverage config, Knip config, TS flag additions, Biome rule additions
- **Pitfalls:** noUncheckedIndexedAccess may produce many warnings in array-heavy phase.ts -- assess before enabling

### Phase 2: Helper Extraction & Deduplication
- Extract `loadJsonFile()` / `loadJsonFileAsync()` shared helper
- Extract phase-dir resolution helper
- Extract duplicated logging patterns
- Remove 4 unused workflow files (confirmed by Knip)
- **Rationale:** Extraction creates smaller, testable units. Must happen before adding tests so tests target the final function shapes.
- **Features:** Shared helpers in core.ts, dead code removal
- **Pitfalls:** Phase-dir resolution has 8 sites with slightly different error handling -- needs careful signature unification

### Phase 3: Error Handling Unification
- Convert remaining CliOutput/CliError usages to CmdResult in core.ts exports
- Update cli.ts dispatch to handle CmdResult for converted functions
- Remove CliOutput/CliError classes once fully migrated
- **Rationale:** Must happen after extraction so helper functions use the correct return pattern from the start.
- **Features:** Unified CmdResult returns across all core modules
- **Pitfalls:** cli.ts catches CliOutput/CliError at the top level -- the dispatch logic must be updated per-module or the catch block must handle both patterns during transition

### Phase 4: Unit Test Addition
- Add tests for verify.ts (9 exported functions, ~15-20 test cases)
- Add tests for init.ts (20 cmdInit* functions, template pattern)
- Expand tests for phase.ts (happy paths, remaining error paths)
- Set coverage thresholds to ratchet up
- **Rationale:** Tests added last so they cover the final refactored code, not the pre-refactoring state. Tests for pre-refactoring code would need rewriting.
- **Features:** Comprehensive unit test suite, coverage enforcement
- **Pitfalls:** init.ts has 20 functions with similar structure -- use a test factory/helper to avoid 20x boilerplate

### Phase ordering rationale
Safety nets (Phase 1) must come first because they catch regressions during all subsequent phases. Extraction (Phase 2) before error handling (Phase 3) because extracted helpers should use CmdResult from the start. Error handling (Phase 3) before tests (Phase 4) because tests should validate the final API shape. Writing tests against pre-refactoring code wastes effort.

### Research flags
- **noUncheckedIndexedAccess impact:** Needs assessment before enabling -- phase.ts does extensive array indexing that may require many `!` assertions or guard clauses
- **memfs Windows compatibility:** Should be validated early with a spike test on the Windows development environment
- **Knip false positives:** The markdown templates in `templates/` are not TypeScript imports -- Knip should ignore them, but verify the config works correctly

## Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Existing stack versions | HIGH | Verified from package.json, lock file not checked |
| New dependency versions | HIGH | Verified via npm registry web search |
| Testing patterns | HIGH | Verified from existing test files in codebase |
| Error handling migration scope | HIGH | Grep counts verified across codebase |
| TypeScript compiler flags | HIGH | Verified from TS 5.9 official documentation |
| Knip configuration | MEDIUM | Based on documentation, not tested against this specific codebase |
| memfs Windows behavior | MEDIUM | Documented as compatible, not tested in this environment |

## Gaps to Address

1. **Exact Knip false positive count:** Need to run `npx knip` against the actual codebase to see if markdown templates cause false positives
2. **noUncheckedIndexedAccess warning count:** Need to enable the flag and count violations before committing to it
3. **Coverage baseline:** Need to run `vitest --coverage` to establish current coverage percentage before setting thresholds
4. **memfs + Windows paths:** Need a spike test to verify memfs handles Windows-style paths correctly in this environment

---
*Research summary for: MAXSIM v5.1 Surgical Cleanup*
*Researched: 2026-03-08*
