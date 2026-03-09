# Acceptance Criteria

**Updated:** 2026-03-06
**Source:** Clean slate rewrite for v5.0 milestone

## Milestone-Level Criteria

- [x] Planning documents for a 50-phase project contain only the active milestone's phases
- [x] Agent prompts work as a coordinated system -- no isolated prompt islands
- [x] Spec drift between `.planning/` and codebase is detectable via a single command
- [x] Init flows produce context thorough enough that fresh agents never need clarifying questions
- [x] Every workflow step has a corresponding skill -- no gaps in coverage
- [x] `npm run build` and `npm test` pass after every phase

## Phase-Level Criteria

### Phase 1: GitHub Issues Integration for MCP Task Management

- [ ] GitHub Project board auto-created during MAXSIM setup with 4 columns (To Do, In Progress, In Review, Done)
- [ ] Plan finalization creates GitHub issues for all tasks with full spec in collapsible body sections
- [ ] Parent tracking issue per phase with live checkbox task list linking child issues
- [ ] Issues move through kanban columns as AI works: To Do → In Progress → In Review → Done
- [ ] Reviewer can bounce issues back to In Progress with detailed comment
- [ ] Todos create GitHub issues and go through same review cycle
- [ ] External GitHub issues can be imported into MAXSIM tracking
- [ ] PRs auto-link via `Closes #N` and auto-close issues on merge
- [ ] Sync check before each phase action detects external changes and verifies against code
- [ ] All existing task-tracking MCP tools replaced with GitHub-backed implementations
- [ ] New MCP tools: query board, search/filter issues, post comment, move cards
- [ ] GitHub Milestones created per MAXSIM milestone with auto-close on completion
- [ ] Fibonacci story points assigned via GitHub Projects Estimate field
- [ ] Labels (type, identity) created upfront during setup with color coding
- [ ] Issue templates installed in `.github/ISSUE_TEMPLATE/`
- [ ] Branch naming follows `maxsim/issue-{N}-{slug}` pattern
- [ ] Graceful degradation when `gh` CLI not authenticated

---
*Criteria derived from v5.0 planning rewrite*
