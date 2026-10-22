---
name: job-setup
description: >
  Build or update the candidate profile (CV, LinkedIn export, documents or an interview) that every other job-search workflow reads. Codex entry point for /setup. Use for first-time setup, 프로필 설정, 이력 정보 입력, or updating the profile.
---

# job-setup (Codex entry point for `/setup`)

`/setup` is defined once, for every runtime, in `.claude/commands/setup.md`. Read that file now
and follow it step by step, exactly as written.

- The text the user wrote after `$job-setup` is the command's `$ARGUMENTS` (empty
  if they wrote nothing).
- Wherever that file names a Claude Code tool or path (AskUserQuestion, the
  Agent tool and its subagents, Skill, WebFetch/WebSearch, Read on a PDF, the
  session scratchpad, `.claude/settings.json`), apply the "Running the
  workflows in Codex" rules in the repository's `AGENTS.md`.
- This file is only a pointer. Do not work from memory of the steps or from a
  summary: the canonical file changes with upstream updates, and this one does
  not.
