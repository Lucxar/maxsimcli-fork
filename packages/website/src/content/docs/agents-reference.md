---
id: agents-reference
title: Agent Reference
group: Agents
---

{% doctable headers=["Agent", "Slug", "Responsibility"] rows=[["Planner", "maxsim-planner", "Creates executable PLAN.md files with task breakdown, types, and dependencies"], ["Roadmapper", "maxsim-roadmapper", "Creates ROADMAP.md with phase groupings and milestone structure"], ["Executor", "maxsim-executor", "Implements plans atomically, handles deviations, writes SUMMARY.md"], ["Phase Researcher", "maxsim-phase-researcher", "Researches how to implement a phase — writes RESEARCH.md"], ["Project Researcher", "maxsim-project-researcher", "Researches domain ecosystem before roadmap creation"], ["Research Synthesizer", "maxsim-research-synthesizer", "Synthesizes multiple research outputs into a unified summary"], ["Debugger", "maxsim-debugger", "Investigates bugs with scientific method, persistent state across sessions"], ["Codebase Mapper", "maxsim-codebase-mapper", "Explores codebase and writes structured analysis to .planning/codebase/"], ["Verifier", "maxsim-verifier", "Validates phase deliverables against success criteria — writes VERIFICATION.md"], ["Plan Checker", "maxsim-plan-checker", "Verifies PLAN.md completeness and achievability before execution"], ["Integration Checker", "maxsim-integration-checker", "Validates cross-phase integration and end-to-end user flows"]] %}
{% /doctable %}

All agents follow the same basic pattern: read context from .planning/ files, do focused work, write a structured artifact, update STATE.md. Agents never talk to each other directly — they read each other's output files.
