# Plan 01-03 Summary: Sync/Async Deduplication

**Status:** Complete
**Commit:** pushed to main
**Date:** 2026-03-09

## What Was Done

### Task 1: core.ts Deduplication
Eliminated 10 sync/async function pairs in core.ts:
- Deleted all sync variants (loadConfig, searchPhaseInDir, findPhaseInternal, getArchivedPhaseDirs, getRoadmapPhaseInternal, getMilestoneInfo, archivePath, pathExistsInternal, listSubDirs, safeReadFile)
- Renamed async variants to canonical names (dropped `Async` suffix)
- Removed sync fs imports (`import fs from 'node:fs'`)
- Updated barrel exports in index.ts

### Task 2: Consumer File Updates (21 files)
- **init.ts:** Converted 20+ functions to async (cmdInit*, extractReqIds, agent init functions)
- **Core modules:** frontmatter.ts, drift.ts, state.ts, context-loader.ts, artefakte.ts, skills.ts, verify.ts, template.ts, commands.ts — all updated with `await`
- **MCP tools:** phase-tools.ts, context-tools.ts, config-tools.ts — all updated
- **cli.ts:** All handlers properly await cmdInit* results
- **Tests:** core-errors.test.ts (16 tests), skills.test.ts (2 tests) updated to async/await

### BUG-1 Fixed
findPhaseInternal now consistently searches both active phases AND archived phases (the sync version only searched active).

## Requirements Satisfied
- INFRA-06: Every function in core.ts exists in exactly one form (async), zero sync duplicates
- INFRA-04: Update checker hook builds and is present in dist/assets/hooks/
- BUG-1: Fixed — findPhaseInternal searches both active and archived directories

## Verification
- tsc --noEmit: zero errors
- npm run build: success
- npm test: 212/212 tests pass
- Zero Async-suffixed function names in source
- Zero sync filesystem operations in core.ts
- Update checker hook present in dist/assets/hooks/

## Impact
- Net -273 lines across 21 files
- Entire CLI codebase is async-only with no duplication
