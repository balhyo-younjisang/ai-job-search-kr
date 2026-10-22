---
name: job-interview
description: >
  Build a stage-specific interview prep pack for a tracked application. Codex entry point for /interview. Use for 면접 준비, interview prep.
---

# job-interview (Codex entry point for `/interview`)

`/interview` is defined once, for every runtime, in `.claude/commands/interview.md`. Read that file now
and follow it step by step, exactly as written.

- The text the user wrote after `$job-interview` is the command's `$ARGUMENTS` (empty
  if they wrote nothing).
- Wherever that file names a Claude Code tool or path (AskUserQuestion, the
  Agent tool and its subagents, Skill, WebFetch/WebSearch, Read on a PDF, the
  session scratchpad, `.claude/settings.json`), apply the "Running the
  workflows in Codex" rules in the repository's `AGENTS.md`.
- This file is only a pointer. Do not work from memory of the steps or from a
  summary: the canonical file changes with upstream updates, and this one does
  not.
