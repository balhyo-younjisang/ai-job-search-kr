---
name: job-upskill
description: >
  Compare tracked postings with the profile to find skill gaps and build a learning plan. Codex entry point for /upskill. Use for 부족한 역량, 학습 계획, skill gaps, what should I learn.
---

# job-upskill (Codex entry point for `/upskill`)

`/upskill` is defined once, for every runtime, in `.claude/skills/upskill/SKILL.md`. Read that file now
and follow it step by step, exactly as written.

- The text the user wrote after `$job-upskill` is the command's `$ARGUMENTS` (empty
  if they wrote nothing).
- Wherever that file names a Claude Code tool or path (AskUserQuestion, the
  Agent tool and its subagents, Skill, WebFetch/WebSearch, Read on a PDF, the
  session scratchpad, `.claude/settings.json`), apply the "Running the
  workflows in Codex" rules in the repository's `AGENTS.md`.
- This file is only a pointer. Do not work from memory of the steps or from a
  summary: the canonical file changes with upstream updates, and this one does
  not.
