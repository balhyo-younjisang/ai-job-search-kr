---
name: worknet-search
version: 1.0.0
description: >
  Search Korean job postings on Work24 (고용24, formerly Worknet 워크넷),
  or read a posting's detail. Defaults to Work24's own postings; optionally
  include selected syndicated providers or all providers listed by Work24.
  Use for 고용24 채용, 워크넷 공고, 공공기관 채용 검색, or 고용24 연계 채용정보.
context: fork
enabled: true
allowed-tools: Bash(bun run .agents/skills/worknet-search/cli/src/cli.ts *)
---

# Work24 / Worknet Search

Search public [고용24](https://www.work24.go.kr) job pages with Bun. No login,
API key, or runtime dependencies are required. Use for personal job searches;
keep requests bounded to relevant searches and postings. The CLI identifies
this project in its User-Agent and uses Work24 search/detail paths rather than
the legacy Worknet `/empInfo/` paths. Source structure: [url-reference.md](url-reference.md).

## Search

Run from the repository root:

```bash
bun run .agents/skills/worknet-search/cli/src/cli.ts search -q "개발자" -l "서울" --limit 3 --format json
```

| Flag | Meaning |
| --- | --- |
| `--query`, `-q` | Required keywords: role, skill, or company |
| `--location`, `-l` | Province such as 서울, 경기도, 충청남도; other names such as 판교 or 강남구 are appended to the keyword |
| `--career` | `new` (신입) or `experienced` (경력) |
| `--jobage` | Registration date within N days, using Korean dates |
| `--source` | Comma-separated provider names or codes; defaults to `work` |
| `--all-sources` | Include all providers; cannot be combined with `--source` |
| `--page` | 1-indexed page, newest registration first, 30 results per page |
| `--limit`, `-n` | Cap emitted results on that page; does not fetch extra pages |
| `--format` | `json` (default), `table`, or `plain` |

`--jobage`, `--page`, and `--limit` take positive whole numbers.

## Include other platforms

By default only **고용24 자체 공고** are searched, to reduce duplication with
the other portal skills. Explicit `--source` **replaces** that default: include
`work` to keep Work24 postings alongside the other providers.

```bash
# 고용24 + 잡코리아 + 사람인
bun run .agents/skills/worknet-search/cli/src/cli.ts search -q "개발자" --source work,jobkorea,saramin --limit 5 --format table

# 나라일터 + 알리오 only
bun run .agents/skills/worknet-search/cli/src/cli.ts search -q "행정" --source nara,alio --limit 3

# All providers listed by Work24
bun run .agents/skills/worknet-search/cli/src/cli.ts search -q "개발자" --all-sources --limit 5
```

These options search **other platforms' postings syndicated into Work24**.
They do not directly crawl those platforms and do not cover every posting on
the original sites. Use the corresponding portal skill for a direct search.

| Names (`--source`) | Providers |
| --- | --- |
| `work` | 고용24 |
| `nara`, `alio`, `wih`, `cleaneye`, `mma` | 나라일터, 알리오, 여성기업일자리허브, 클린아이, 병역일터 |
| `jobkorea`, `saramin`, `incruit`, `career` | 잡코리아, 사람인, 인크루트, 커리어 |
| `mediajob`, `gongchae`, `medijob`, `midasin`, `pharm` | 미디어잡, 공채속보, 메디잡, 마이다스인, 팜리크루트 |
| `ssis`, `ibk`, `rndjob`, `kosmes` | 한국사회보장정보원, i-ONE JOB, 알앤디잡, 중소벤처기업진흥공단 |
| `catch`, `wanted`, `demand`, `conworker` | 캐치, 원티드, 디맨드, 건설워커 |

Provider names and codes are case-insensitive. Every result includes a
`source` provider label. In `/scrape`, the portal tag remains `worknet-search`
and acquisition `source` remains `cli`; the result's provider label is a
different concept. Deduplicate cross-portal results by company/title as usual.

## Detail

```bash
bun run .agents/skills/worknet-search/cli/src/cli.ts detail '<search result url>' --format plain
```

Use the **full result URL for syndicated postings**: its `infoTypeCd` and
`infoTypeGroup` select the right provider. A bare `wantedAuthNo` ID assumes a
Work24 posting. Legacy Worknet URLs are normalized to Work24; arbitrary hosts
are rejected.

JSON detail includes `id`, `title`, `company`, `location`, `date`, `deadline`,
`alwaysOpen`, `url`, `employmentType`, `workSchedule`, `experience`, `education`,
`salary`, `source`, `description`, `descriptionUrl`, and `isActive`.
Some syndicated descriptions live in an external iframe: `descriptionUrl`
exposes that address without automatically fetching it. The text in
`description` can therefore be incomplete. Consult the original posting or
the corresponding portal's detail skill before evaluating requirements.

## Output and limitations

Search JSON is `{ "meta": { "count", "page", "total" }, "results": [...] }`.
Each card contains `id`, `title`, `company`, `location`, `date`, `deadline`,
`alwaysOpen`, `career`, `education`, `salary`, `workHours`, `source`, `url`.
Unavailable values are `null`; dates are `YYYY-MM-DD`. `total` counts matches
on the server; `count` counts emitted results after `--limit`.

`alwaysOpen` identifies 채용시까지 (including Work24's 2099 sentinel dates);
its `deadline` is `null`. Detail `isActive` compares a known deadline against
today in Korea. An absent deadline does not prove a posting is still open.
Provider templates may omit structured fields that the search card contains;
retain known search metadata rather than replacing it with detail nulls.

Errors go to stderr as `{ "error": "...", "code": "..." }`, exit 1.
`PARSE_FAILED` indicates unexpected markup, `NOT_FOUND` a missing detail,
and `SEARCH_FAILED` / `DETAIL_FAILED` a request failure. Requests have a
20-second timeout and bounded backoff for 429/5xx. Do not treat a blocked
request as an empty search or repeat it in an unbounded crawl.

## Validation

From `cli/`: `bun test` (offline), `bun run typecheck`.
For a bounded live check, run the first search example, then fetch one result
URL. Live checks are manual and excluded from CI.
