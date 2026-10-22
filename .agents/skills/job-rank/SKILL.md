---
name: job-rank
description: >
  Batch-score the postings /scrape collected against the fit framework and return a ranked shortlist. Codex entry point for /rank. Use for 공고 순위, 우선순위 정하기, rank jobs, shortlist.
---

# job-rank (Codex entry point for `/rank`)

`/rank` is defined once, for every runtime, in `.claude/commands/rank.md`. Read that file now
and follow it step by step, exactly as written.

- The text the user wrote after `$job-rank` is the command's `$ARGUMENTS` (empty
  if they wrote nothing).
- Wherever that file names a Claude Code tool or path (AskUserQuestion, the
  Agent tool and its subagents, Skill, WebFetch/WebSearch, Read on a PDF, the
  session scratchpad, `.claude/settings.json`), apply the "Running the
  workflows in Codex" rules in the repository's `AGENTS.md`.
- This file is only a pointer. Do not work from memory of the steps or from a
  summary: the canonical file changes with upstream updates, and this one does
  not.
