---
name: job-scrape
description: >
  Find new job postings matching the profile through the installed portal search CLIs (JobKorea, Saramin, Linkareer, Work24, LinkedIn, Freehire), deduplicated across runs. Codex entry point for /scrape. Use for 공고 검색, 새 공고 찾기, find jobs, scrape jobs.
---

# job-scrape (Codex entry point for `/scrape`)

`/scrape` is defined once, for every runtime, in `.claude/skills/job-scraper/SKILL.md`. Read that file now
and follow it step by step, exactly as written.

- The text the user wrote after `$job-scrape` is the command's `$ARGUMENTS` (empty
  if they wrote nothing).
- Wherever that file names a Claude Code tool or path (AskUserQuestion, the
  Agent tool and its subagents, Skill, WebFetch/WebSearch, Read on a PDF, the
  session scratchpad, `.claude/settings.json`), apply the "Running the
  workflows in Codex" rules in the repository's `AGENTS.md`.
- This file is only a pointer. Do not work from memory of the steps or from a
  summary: the canonical file changes with upstream updates, and this one does
  not.
