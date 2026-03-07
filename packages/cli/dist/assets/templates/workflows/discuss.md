<sanity_check>
Before executing any step in this workflow, verify:
1. The current directory contains a `.planning/` folder -- if not, stop and tell the user to run `/maxsim:new-project` first.
2. `.planning/ROADMAP.md` exists -- if not, stop and tell the user to initialize the project.
</sanity_check>

<purpose>
Triage an unknown problem, idea, or bug into the right size -- quick todo or new phase -- through collaborative discussion.

You are a thinking partner, not a form collector. The user has something on their mind -- help them clarify it, size it, and file it in the right place. Then offer the next action so momentum continues.

**Key distinction:** This workflow triages an UNKNOWN item into the right size. `/maxsim:discuss-phase` gathers decisions for a KNOWN phase. They are complementary, not overlapping.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
@./references/dashboard-bridge.md
@./references/thinking-partner.md
</required_reading>

<tool_mandate>
**CRITICAL -- Structured user interaction is MANDATORY.**

Every question directed at the user MUST use a structured tool. NEVER write a question as plain text and wait for the user to respond. This applies to:

- Existing todo confirmation
- Every clarifying question during discussion
- Triage size classification proposal
- Filing confirmation
- Next action offers
- Any follow-up or clarification

**Tool selection:** At workflow start, probe for the dashboard (see @dashboard-bridge). Then:
- **DASHBOARD_ACTIVE = true** -- use `mcp__maxsim-dashboard__ask_question` (questions appear in browser). Follow the schema translation rules from @dashboard-bridge.
- **DASHBOARD_ACTIVE = false** -- use `AskUserQuestion` (questions appear in terminal).

**The rule is simple:** If you need input from the user -- use the appropriate structured tool based on dashboard availability. Zero exceptions.
</tool_mandate>

<process>

<step name="init_context">
Load project state and todo context:

```bash
STATE=$(node ~/.claude/maxsim/bin/maxsim-tools.cjs state-load --raw)
```

Check `planning_exists` from state. **Hard stop** if false -- tell user to run `/maxsim:new-project` first.

```bash
INIT=$(node ~/.claude/maxsim/bin/maxsim-tools.cjs init todos)
```

Extract from init JSON: `commit_docs`, `date`, `timestamp`, `todo_count`, `todos`, `pending_dir`, `todos_dir_exists`.

Ensure directories exist:
```bash
mkdir -p .planning/todos/pending .planning/todos/done
```

Parse user input from $ARGUMENTS (if any):
- If arguments provided: store as `user_input` for use in detect_existing_todo and gather_context
- If no arguments: `user_input` is empty -- will ask interactively in gather_context

Note existing areas from the todos array for consistency in later area inference.
</step>

<step name="detect_existing_todo">
**Only runs if `user_input` is non-empty.**

Search pending todos for a title or slug match against the user's input:

```bash
# Search for matching words in existing todo titles
grep -l -i "[key words from user_input]" .planning/todos/pending/*.md 2>/dev/null
```

Also compare against the `todos` array from init context -- check `title` and filename fields for partial matches.

**If a match is found:**

Use AskUserQuestion:
- header: "Existing Todo"
- question: "Found a pending todo that might match: **[todo title]**. Want to discuss this one?"
- options:
  - "Yes, discuss this todo" -- Load its context and continue discussion about it
  - "No, this is something new" -- Proceed as a new item

If "Yes": Read the matched todo file. Use its content as context for the discussion. The user may want to refine scope, change priority, or decide to work on it now.

If "No": Proceed to gather_context as a new item, using `user_input` as the starting description.

**If no match found (or no user_input):**

Proceed to gather_context.
</step>

<step name="gather_context">
Use adaptive questioning to understand what the user is describing.

**Apply thinking-partner behaviors from @./references/thinking-partner.md:**
- Challenge vague descriptions -- "broken" means what exactly?
- Surface unstated assumptions -- "this should be easy" might hide complexity
- Propose alternatives if the user's framing suggests a different approach
- Follow the thread -- build each question on the previous answer

**If `user_input` is non-empty (user provided a description):**

Start by reflecting back what you understood, then ask your first clarifying question.

Use AskUserQuestion:
- header: "Clarify"
- question: Based on the user's description, ask the most important clarifying question. For example: "You mentioned [X]. What specifically is the problem -- is it [scenario A] or [scenario B]?"
- options: 2-3 concrete options that capture likely answers, plus the implicit "Other" for free-text

**If `user_input` is empty (no arguments):**

Use AskUserQuestion:
- header: "Discuss"
- question: "What's on your mind? Describe the problem, idea, or bug you want to discuss."
- options: (none -- free text only, do not provide options for the opening question)

**After the first response, ask 1-2 more adaptive follow-up questions:**

Each follow-up uses AskUserQuestion with header, question, and options tailored to what the user just said.

**Adaptive depth:**
- If answers reveal the item is simple and well-defined (clear problem, clear scope, obvious size): move to triage after 2 questions
- If answers reveal complexity (multiple systems involved, unclear scope, competing approaches): ask up to 2 more questions before triage
- Maximum: 4 questions before triage. Read the room -- don't over-probe simple bugs.

**What to extract from the discussion:**
- `title`: 3-10 word descriptive title (action verb preferred)
- `problem`: What is wrong or why this is needed
- `scope_hint`: Simple fix, or touches multiple systems?
- `files`: Any file paths or areas mentioned
- `size_signal`: Does this feel like a quick todo or a multi-day phase?
</step>

<step name="triage">
Based on gathered context, propose a size classification.

**Assess the item:**
- Quick todo: Well-defined problem, clear fix, single area, could be done in one session
- Phase: Touches multiple systems, needs research, unclear approach, requires planning

**Present classification via AskUserQuestion:**
- header: "Size"
- question: "Based on what you described, this looks like [your assessment with brief explanation]. Does that match?"
- options:
  - "Quick fix (todo)" -- File as a todo for later or work on it now
  - "Needs a phase" -- Too big for a todo, add to the roadmap as a new phase
  - "Let me explain more" -- I want to provide more context before deciding

Include a brief explanation of WHY you suggest the classification you suggest. For example: "This sounds like a focused bug fix in one file -- a quick todo should cover it." Or: "This touches auth, database, and the API layer -- that's phase-sized work."

**CRITICAL: Always present this as a question. Never auto-route.** Even if the size is obvious, the user confirms.

**If user selects "Let me explain more":**
Loop back to gather_context for 1-2 more questions, then return to triage with updated assessment.

**If user selects "Quick fix (todo)":**
Proceed to file_as_todo.

**If user selects "Needs a phase":**
Proceed to file_as_phase.
</step>

<step name="file_as_todo">
File the item as a todo using existing maxsim-tools.cjs commands.

**1. Generate slug:**
```bash
slug=$(node ~/.claude/maxsim/bin/maxsim-tools.cjs generate-slug "$title" --raw)
```

**2. Infer area from discussion context:**

Use file paths and topic from the discussion to infer area:

| Path pattern | Area |
|--------------|------|
| `src/api/*`, `api/*` | `api` |
| `src/components/*`, `src/ui/*` | `ui` |
| `src/auth/*`, `auth/*` | `auth` |
| `src/db/*`, `database/*` | `database` |
| `tests/*`, `__tests__/*` | `testing` |
| `docs/*` | `docs` |
| `.planning/*` | `planning` |
| `scripts/*`, `bin/*` | `tooling` |
| No files or unclear | `general` |

Use existing areas from init context if a similar match exists.

**3. Check for duplicates:**
```bash
# Search for key words from title in existing todos
grep -l -i "[key words from title]" .planning/todos/pending/*.md 2>/dev/null
```

If potential duplicate found, read the existing todo and compare scope.

If overlapping, use AskUserQuestion:
- header: "Duplicate?"
- question: "A similar todo already exists: **[existing title]**. What would you like to do?"
- options:
  - "Skip" -- Keep the existing todo as-is
  - "Replace" -- Update the existing todo with new context from this discussion
  - "Add anyway" -- Create a separate todo (they cover different aspects)

If "Skip": Jump to offer_next_action (nothing filed).
If "Replace": Update the existing file instead of creating new.
If "Add anyway": Continue creating new todo.

**4. Create todo file:**

Use values from init context: `timestamp` and `date` are already available.

Write to `.planning/todos/pending/${date}-${slug}.md`:

```markdown
---
created: [timestamp]
title: [title]
area: [area]
mode: discussed
files:
  - [file paths from discussion, if any]
---

## Problem

[Problem description enriched with discussion insights -- enough context for a future Claude session to understand weeks later]

## Solution

[Approach hints from the discussion, or "TBD" if only the problem was clarified]
```

**5. Commit:**
```bash
node ~/.claude/maxsim/bin/maxsim-tools.cjs commit "docs: add todo [slug]" --files .planning/todos/pending/${date}-${slug}.md
```

Confirm to user: "Filed as todo: **[title]**"

Proceed to offer_next_action.
</step>

<step name="file_as_phase">
File the item as a new phase on the roadmap.

**1. Gather phase details via AskUserQuestion:**
- header: "Phase"
- question: "What should this phase be called? And in one sentence, what's the goal?"
- options: (none -- free text for naming)

Parse the response to extract:
- `phase_name`: Short name (2-5 words)
- `phase_goal`: One-sentence goal description

**2. Preview and confirm via AskUserQuestion:**

First, check the current roadmap to determine what the next phase number would be:
```bash
node ~/.claude/maxsim/bin/maxsim-tools.cjs roadmap analyze --raw
```

- header: "Confirm"
- question: "This would add **Phase [N]: [phase_name]** to the roadmap with goal: *[phase_goal]*. Proceed?"
- options:
  - "Yes, add it" -- Add to roadmap
  - "Let me adjust" -- I want to change the name or goal
  - "Cancel" -- Don't add anything

If "Let me adjust": Ask again for name/goal, then re-preview.
If "Cancel": Jump to offer_next_action (nothing filed).
If "Yes, add it": Continue.

**3. Create the phase:**
```bash
node ~/.claude/maxsim/bin/maxsim-tools.cjs phase add "[phase_name]"
```

**4. Commit:**
```bash
node ~/.claude/maxsim/bin/maxsim-tools.cjs commit "docs: add phase [phase_name]" --files .planning/ROADMAP.md .planning/phases/
```

Confirm to user: "Added to roadmap: **Phase [N]: [phase_name]**"

Proceed to offer_next_action.
</step>

<step name="offer_next_action">
After filing (or skipping), offer contextual next actions.

**If filed as todo:**

Use AskUserQuestion:
- header: "Next"
- question: "Todo filed. What would you like to do next?"
- options:
  - "Work on it now" -- Start a quick task with /maxsim:quick
  - "Save for later" -- It's captured, move on
  - "Check all todos" -- See pending todos with /maxsim:check-todos

If "Work on it now": Tell the user to run `/maxsim:quick [todo-title]` (print the command, do not auto-execute).
If "Save for later": Confirm and end workflow.
If "Check all todos": Tell the user to run `/maxsim:check-todos`.

**If filed as phase:**

Use AskUserQuestion:
- header: "Next"
- question: "Phase added to roadmap. What would you like to do next?"
- options:
  - "Discuss it" -- Gather implementation context with /maxsim:discuss-phase [phase]
  - "Plan it" -- Jump to planning with /maxsim:plan-phase [phase]
  - "Save for later" -- It's on the roadmap, move on

If "Discuss it": Tell the user to run `/maxsim:discuss-phase [phase-number]`.
If "Plan it": Tell the user to run `/maxsim:plan-phase [phase-number]`.
If "Save for later": Confirm and end workflow.

**If nothing was filed (duplicate skip or cancel):**

Confirm that no action was taken and the discussion is complete.

**User always chooses -- no auto-start.** Print the recommended command for the user to copy and run, do not execute it.
</step>

</process>

<success_criteria>
- [ ] User's problem/idea/bug understood through adaptive discussion
- [ ] Existing todo detected if user referenced one
- [ ] Triage routing confirmed by user before any filing
- [ ] Item filed correctly (todo file in pending, or phase added to roadmap)
- [ ] Git commit created for the filed item
- [ ] Next action offered with concrete commands to run
</success_criteria>
