---
name: job-apply
description: >
  Evaluate one job posting (URL or pasted text), then draft, review and compile a tailored CV and cover letter. Codex entry point for /apply. Use for 지원서 작성, 이 공고 지원, 커버레터, apply to this job.
---

# job-apply (Codex entry point for `/apply`)

`/apply` is defined once, for every runtime, in `.claude/commands/apply.md`. Read that file now
and follow it step by step, exactly as written.

- The text the user wrote after `$job-apply` is the command's `$ARGUMENTS` (empty
  if they wrote nothing).
- Wherever that file names a Claude Code tool or path (AskUserQuestion, the
  Agent tool and its subagents, Skill, WebFetch/WebSearch, Read on a PDF, the
  session scratchpad, `.claude/settings.json`), apply the "Running the
  workflows in Codex" rules in the repository's `AGENTS.md`.
- This file is only a pointer. Do not work from memory of the steps or from a
  summary: the canonical file changes with upstream updates, and this one does
  not.
