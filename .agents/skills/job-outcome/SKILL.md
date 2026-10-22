---
name: job-outcome
description: >
  Record the result of an application (applied, interview, offer, rejection) in the tracker. Codex entry point for /outcome. Use for 지원 결과 기록, 합격, 불합격, record outcome.
---

# job-outcome (Codex entry point for `/outcome`)

`/outcome` is defined once, for every runtime, in `.claude/commands/outcome.md`. Read that file now
and follow it step by step, exactly as written.

- The text the user wrote after `$job-outcome` is the command's `$ARGUMENTS` (empty
  if they wrote nothing).
- Wherever that file names a Claude Code tool or path (AskUserQuestion, the
  Agent tool and its subagents, Skill, WebFetch/WebSearch, Read on a PDF, the
  session scratchpad, `.claude/settings.json`), apply the "Running the
  workflows in Codex" rules in the repository's `AGENTS.md`.
- This file is only a pointer. Do not work from memory of the steps or from a
  summary: the canonical file changes with upstream updates, and this one does
  not.
