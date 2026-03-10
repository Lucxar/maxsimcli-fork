---
name: tool-priority-guide
description: >-
  Tool selection guide for Claude Code operations. Maps common tasks to preferred
  tools, explaining when to use Read over cat, Grep over rg, Glob over find,
  Write over echo, and Edit over sed. Use when deciding which tool to use for
  file operations, search, content modification, or web content retrieval.
user-invocable: false
---

# Tool Priority Guide

Use dedicated Claude Code tools over Bash equivalents. Dedicated tools provide better permissions handling, output formatting, and user experience.

## File Reading

| Task | Use | Not |
|------|-----|-----|
| Read file contents | **Read tool** | `cat`, `head`, `tail` via Bash |
| Read specific lines | **Read tool** (with offset/limit) | `sed -n 'X,Yp'` via Bash |
| Read images | **Read tool** (multimodal) | Not possible via Bash |
| Read PDFs | **Read tool** (with pages param) | `pdftotext` via Bash |

**Why Read:** Handles permissions, large files, binary formats. Returns line-numbered output.

## File Writing

| Task | Use | Not |
|------|-----|-----|
| Create new file | **Write tool** | `echo > file`, `cat <<EOF` via Bash |
| Rewrite entire file | **Write tool** (after Read) | `cat > file` via Bash |
| Modify part of file | **Edit tool** | `sed`, `awk` via Bash |
| Rename string across file | **Edit tool** (replace_all) | `sed -i 's/old/new/g'` via Bash |

**Why Write/Edit:** Atomic operations, preserves encoding, provides diff view for review.

## Searching

| Task | Use | Not |
|------|-----|-----|
| Search file contents | **Grep tool** | `grep`, `rg` via Bash |
| Find files by pattern | **Glob tool** | `find`, `ls -R` via Bash |
| Search with context | **Grep tool** (-A, -B, -C params) | `grep -C N` via Bash |
| Count matches | **Grep tool** (output_mode: count) | `grep -c` via Bash |

**Why Grep/Glob:** Optimized permissions, structured output, result limiting.

## Web Content

| Task | Use | Not |
|------|-----|-----|
| Fetch documentation | **WebFetch tool** | `curl` via Bash |
| Read API responses | **WebFetch tool** | `curl | jq` via Bash |
| Download files | **Bash** (`curl -O`) | WebFetch (not for binary downloads) |

**Why WebFetch:** Handles authentication, follows redirects, parses HTML.

## When Bash IS the Right Tool

| Task | Why Bash |
|------|---------|
| Run build/test commands | `npm test`, `npm run build` -- no dedicated tool |
| Git operations | `git status`, `git commit` -- no dedicated tool |
| Install dependencies | `npm install` -- no dedicated tool |
| Check file existence | `test -f path` -- lightweight, often part of larger commands |
| Run project CLI tools | Project-specific commands -- no dedicated tool |
| Chained operations | Multiple sequential commands with `&&` |

## Quick Reference

```
Read file    --> Read tool
Write file   --> Write tool (new) or Edit tool (modify)
Search code  --> Grep tool
Find files   --> Glob tool
Fetch URL    --> WebFetch tool
Run commands --> Bash tool
```

The general principle: if a dedicated tool exists for the operation, use it. Fall back to Bash only when no dedicated tool covers the task.
