# Skill: GitHub Artifact Protocol

## Trigger
When reading from or writing to GitHub Issues for MAXSIM artifacts.

## Protocol

### Artifact Types and Comment Conventions

All MAXSIM artifacts are stored as GitHub Issue comments with type metadata:

| Artifact | Comment Type | Tool | Format |
|----------|-------------|------|--------|
| Context decisions | `context` | `mcp_post_comment` | `<!-- maxsim:type=context -->` header |
| Research findings | `research` | `mcp_post_comment` | `<!-- maxsim:type=research -->` header |
| Plan content | (plan header) | `mcp_post_plan_comment` | `<!-- maxsim:type=plan -->` header |
| Summary | `summary` | `mcp_post_comment` | `<!-- maxsim:type=summary -->` header |
| Verification | `verification` | `mcp_post_comment` | `<!-- maxsim:type=verification -->` header |
| UAT | `uat` | `mcp_post_comment` | `<!-- maxsim:type=uat -->` header |
| Completion | (structured) | `mcp_post_completion` | Commit SHA + files |

### Issue Lifecycle State Machine

**Phase Issues:**
```
To Do --> In Progress --> In Review --> Done
(created)  (plan done)    (PR created)  (PR merged + verified)
```

**Task Sub-Issues:**
```
To Do --> In Progress --> Done
(created)  (started)      (completed + review passed)
Done --> In Progress (review failed, reopened)
```

### Write Order (WIRE-01)

1. Build content in memory
2. POST to GitHub via MCP tool
3. If successful, operation succeeds
4. If failed, operation aborts entirely -- no partial state

### Rollback Pattern (WIRE-07)

On partial failure during batch operations:
1. Close partially-created issues with `state_reason: 'not_planned'`
2. Post `[MAXSIM-ROLLBACK]` comment explaining why
3. Report what succeeded and what failed
4. Offer targeted retry

### External Edit Detection (WIRE-06)

- Body hash (SHA-256) stored in `github-issues.json` mapping after each write
- On read, compare live body hash against stored hash
- If different, warn user about external modification
- Do not auto-incorporate -- user decides

### What Stays Local

- `config.json` -- project settings
- `PROJECT.md` -- project vision
- `REQUIREMENTS.md` -- requirements
- `ROADMAP.md` -- phase structure
- `STATE.md` -- decisions, blockers, metrics
- `github-issues.json` -- mapping cache (rebuildable)
- `codebase/` -- stack, architecture, conventions
- `todos/` -- pending/completed todos
