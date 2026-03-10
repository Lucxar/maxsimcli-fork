---
name: commit-conventions
description: >-
  Commit message format using conventional commits with scope. Defines atomic
  commit rules, breaking change markers, and co-author attribution for
  AI-assisted work. Use when creating git commits, reviewing commit messages,
  or establishing commit conventions for a project.
user-invocable: false
---

# Commit Conventions

Consistent commit messages that enable automated versioning, changelogs, and clear project history.

## Conventional Commit Format

```
{type}({scope}): {description}

- {key change 1}
- {key change 2}
```

### Types

| Type | When | Triggers |
|------|------|---------|
| `feat` | New feature or capability | Minor version bump |
| `fix` | Bug fix | Patch version bump |
| `chore` | Build, deps, config, maintenance | No version bump |
| `docs` | Documentation only | No version bump |
| `test` | Adding or fixing tests | No version bump |
| `refactor` | Code change that's neither fix nor feature | No version bump |

### Breaking Changes

Append `!` after the type for breaking changes:

```
feat!(install): require Node 20 minimum
fix!(config): rename model_profile to profile
```

Breaking changes trigger a major version bump.

### Scope

Scope identifies the area of change:

- Phase work: `feat(04-01):`, `fix(phase-04):`
- Module: `fix(install):`, `refactor(core):`
- Component: `feat(dashboard):`, `test(cli):`

## Atomic Commits

One logical change per commit:

- **DO:** Separate feature implementation from test additions
- **DO:** Commit each task in a plan individually
- **DO NOT:** Bundle unrelated changes in one commit
- **DO NOT:** Include "fix typo" changes in feature commits

## Co-Author Attribution

When work is AI-assisted, include the co-author line:

```
Co-Authored-By: Claude <noreply@anthropic.com>
```

## Commit Message Guidelines

- **Subject line:** Under 72 characters, imperative mood ("add" not "added")
- **Body:** Bullet points for key changes (optional for small commits)
- **Why over what:** The diff shows what changed; the message explains why
