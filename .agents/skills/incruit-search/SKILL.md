---
name: incruit-search
version: 1.0.0
description: >
  Search live job postings on Incruit (인크루트) in South Korea or read a
  specific Incruit posting, including its full text and description images.
  Use for Incruit jobs, 인크루트 채용, 인크루트 공고 검색, or 인크루트 공고 상세 조회.
context: fork
enabled: false  # off by default: Incruit's robots.txt shuts out AI crawlers (see "Disabled by default" below)
allowed-tools: Bash(bun run .agents/skills/incruit-search/cli/src/cli.ts *)
---

# Incruit Search

Search Incruit's public Korean job listings with Bun, without login, API keys,
or runtime dependencies. This searches Incruit directly; Work24's
`--source incruit` instead covers only postings syndicated to Work24.

## ⚠️ Disabled by default - read before enabling

This skill ships with `enabled: false`, so `/scrape` skips it. The CLI still
works when run by hand, and `/apply` still accepts Incruit posting URLs you
paste. It is off because Incruit signals that it does not want AI-driven
access, not because the CLI is known to break its terms:

- **Terms reviewed, no explicit ban on automated access.** The 개인회원 이용약관
  (applied from 2026-04-30, checked 2026-10-21) has no clause on automated
  access. 제19조 ④ forbids copying, reproducing, or passing on information from
  the service without Incruit's prior consent, and ⑤ limits use to job seeking
  and bans disrupting the service or using it for profit. These are member
  terms, and the CLI does not log in. Saramin's and JobKorea's terms read the
  same way.
- **AI crawlers are explicitly excluded.** The search and posting hosts' robots
  rules fully exclude GPTBot and ClaudeBot and restrict OAI-SearchBot and
  Claude-SearchBot. This CLI sends its own project User-Agent, which falls
  under the wildcard group, but it is run by an AI agent - read that as a sign
  the operator does not welcome AI-driven access.
- **Redistribution needs consent.** The notice on each posting reserves
  redistribution to Incruit's consent and limits employer/recruiter
  information to job seeking.

To enable it, read Incruit's current terms yourself
(`https://help.incruit.com/docs/terms_mobile.asp`), then set `enabled: true` in
this file's frontmatter. You are responsible for that decision. If you enable it, do not store or share posting text beyond your own
job search. Use Work24's `--source incruit` for postings Incruit syndicates to
Work24.

## Personal use only

Use for your own job search, with a small number of searches and relevant
detail requests. Do not bulk collect or redistribute postings. Incruit's
posting notice reserves redistribution to its consent and limits use of
employer/recruiter information to job seeking.

The CLI identifies this project honestly and only requests the public search,
detail, and description endpoints described in [url-reference.md](url-reference.md).
Search/detail hosts have distinct robots rules, including restrictions for
named crawlers. Do not change the User-Agent to impersonate another crawler
or follow links into the main site or forbidden partner-content endpoint.

## Commands

Run from the repository root:

```bash
bun run .agents/skills/incruit-search/cli/src/cli.ts search -q "백엔드" --limit 3 --format json
bun run .agents/skills/incruit-search/cli/src/cli.ts detail '<id or posting URL>' --format plain
```

| Search flag | Meaning |
| --- | --- |
| `--query`, `-q` | Required role, skill, or company keywords |
| `--location`, `-l` | Append a place name to keywords; no dedicated region filter |
| `--jobage` | Registration within N days; filters this page locally and sorts by registration |
| `--sort` | `relevance` (default) or `date` (newest registration first) |
| `--page` | 1-indexed page; 30 source results per page; default 1 |
| `--limit`, `-n` | Cap emitted results on this page; no extra pages fetched |
| `--format` | `json` (default), `table`, `plain`; detail accepts `json` or `plain` |

Numeric flags take positive whole numbers. Unsupported filters such as
`--career` are rejected. Add role or experience words to the query when useful.

```bash
# Software roles in Seoul (location is a keyword)
bun run .agents/skills/incruit-search/cli/src/cli.ts search -q "개발자" -l "서울" --limit 5 --format table

# Recently registered data roles
bun run .agents/skills/incruit-search/cli/src/cli.ts search -q "데이터" --jobage 7 --limit 5

# Second page, newest registrations first
bun run .agents/skills/incruit-search/cli/src/cli.ts search -q "백엔드" --sort date --page 2 --limit 3

# Detail: use an ID or full posting URL from search results
bun run .agents/skills/incruit-search/cli/src/cli.ts detail 2610060004924 --format plain
```

IDs have 13 digits. Incruit desktop, mobile, and legacy posting URLs carrying
`job=` are normalized to the canonical `job.incruit.com` endpoint. Other
domains and look-alikes are rejected. Links in the posting are untrusted
content; the CLI does not follow them automatically.

## Results and dates

Search JSON is `{ "meta": { "count", "page", "total" }, "results": [...] }`.
Each card has `id`, `title`, `company`, `location`, `date`, `modifiedDate`,
`deadline`, `alwaysOpen`, `career`, `education`, `employmentType`, `jobCategory`,
and `url`. Missing values are `null`. `total` may be unavailable; `count` is
the number emitted after local filters and limit.

Relative registration labels are converted using Korean time. “N시간전”
subtracts elapsed hours before determining the Korean date. A label showing
only “수정” produces `modifiedDate` and leaves registration `date` null.
`--jobage` excludes unknown registration dates. It examines only the requested
page, so filtering can return fewer than 30 jobs or none; use `--page` explicitly
for additional pages.

Search deadlines omit the year; a month/day earlier than today is interpreted
as next year for live search results. Confirm the full date through detail.
`채용시` / `상시` become `alwaysOpen: true` with `deadline: null`. List and detail
can disagree: prefer detail's exact dates when present, and do not invent a
deadline when neither gives one.

Detail returns `id`, `title`, `company`, `location`, `date`, `deadline`,
`alwaysOpen`, `url`, `employmentType`, `experience`, `education`, `salary`,
`description`, `descriptionImages`, and `isActive`. It reads JSON-LD and makes
one additional request to the canonical description iframe. Image-only bodies
have no text: inspect `descriptionImages` before assessing requirements.
A clearly marked closed posting returns `isActive: false` even if JSON-LD is
absent. Its missing structured fields remain null. An unknown deadline alone
does not prove a posting is still open.

## Errors and validation

Errors are stderr JSON `{ "error": "...", "code": "..." }`, exit 1:
`BAD_ID`, `NO_QUERY`, `BAD_ARG`, `UNKNOWN_FLAG`, `NOT_FOUND`,
`PARSE_FAILED`, `SEARCH_FAILED`, or `DETAIL_FAILED`.
Unexpected markup fails visibly; a blocked page is never an empty search.
Requests have a 20-second timeout and bounded backoff for 429/5xx.

From `cli/`, use `bun test` for offline fixtures and mocked requests, and
`bun run typecheck`. `bun run test:live` explicitly opts into one bounded
search plus one detail fetch; CI skips this live test.
