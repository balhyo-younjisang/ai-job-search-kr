---
name: saramin-search
version: 1.0.0
description: >
  Use this skill to search live job postings on Saramin (사람인,
  saramin.co.kr), one of South Korea's largest general job boards, or to read
  a specific Saramin posting in full. Covers all sectors and career levels
  (신입 and 경력) across Korea, with region filters down to the district.
  Trigger phrases: find jobs in Korea, Seoul / Gangnam / Pangyo / Busan jobs,
  Korean job search, Saramin posting, look up this Saramin job, 사람인,
  사람인 공고, 채용공고 검색, 채용정보, 구인, 일자리 찾기, 신입 채용, 경력 채용,
  개발자 채용, 공채, 이 공고 보여줘.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/saramin-search/cli/src/cli.ts *)
---

# Saramin Search Skill

Search live job postings on **[Saramin (사람인)](https://www.saramin.co.kr)**, a
large South Korean job board covering every sector and both new-graduate (신입)
and experienced (경력) hiring. No authentication, no API key, and **zero runtime
dependencies** - it runs with just `bun`.

## ⚠️ Personal use only

This skill reads Saramin's public web pages on paths its `robots.txt` permits,
and identifies itself honestly in its User-Agent (project name and contact URL).
Saramin's terms forbid copying, republishing, or passing on what the service
shows without its consent, and using the service for anything other than job
seeking. So:

- Use it **for your own job search only**.
- **Keep volume low** - a handful of searches per session, not a crawl.
- **No commercial use, no bulk collection, no republishing** of postings.
- Run it on **your own responsibility**.

## When to use this skill

- Search Korean job postings by keyword, narrowed by province or district
  and career level (신입/경력)
- Read one posting's full detail: employment type, salary, position, address,
  dates, and the description (상세요강) - text plus any images it contains

## Commands

### Search job postings

```bash
bun run .agents/skills/saramin-search/cli/src/cli.ts search --query "<keywords>" [flags]
```

Flags:
- `--query <text>` / `-q <text>` - keywords (title, skill, company). **Required.**
- `--location <place>` / `-l <place>` - a province (`서울`, `경기도`, `부산`, `충청남도`, `세종`)
  or district (`강남구`, `분당구`, `성남시 분당구`, `부산 중구`), mapped to Saramin's region
  filter. A district name several provinces share (`중구`, `남구`, `강서구`) is rejected with
  the choices - add the province. A place Saramin has no region code for (`판교`, `여의도`)
  is added to the keyword instead.
- `--career new|experienced` - 신입 or 경력. `experienced` also returns 신입·경력 and
  경력무관 postings, which accept experienced applicants.
- `--sort relevance|date` - default `relevance`; `date` = newest registration first.
- `--page <n>` - 1-indexed page, 40 results per page. Default 1.
- `--limit <n>` / `-n <n>` - cap results emitted (client-side).
- `--format json|table|plain` - default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/saramin-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the `id` from a `search` result (Saramin's `rec_idx`, e.g. `55210151`). A
Saramin URL carrying `rec_idx=` (desktop or mobile) also works; only the id is
taken from it. URLs from any other site are rejected.

Returns the title, company, work location, `date` (the posting's start date),
`deadline`, employment type, experience, education, salary, position,
`description` (text, or `null`), `descriptionImages` (image URLs), and `isActive`.

**Images in descriptions.** Saramin descriptions often mix text with images, and
some are images only. The text is in `description`; anything shown as an image -
often the requirements (자격요건, 우대사항) or the benefits - is only in
`descriptionImages`. Fetch and view those URLs when the text looks incomplete.

## Usage examples

```bash
# Experienced backend roles in Bundang, table view
bun run .agents/skills/saramin-search/cli/src/cli.ts search -q "백엔드" -l "성남시 분당구" --career experienced --format table

# New-graduate data roles in Seoul
bun run .agents/skills/saramin-search/cli/src/cli.ts search -q "데이터 분석" -l "서울" --career new --format table

# Frontend roles in Gangnam, newest first
bun run .agents/skills/saramin-search/cli/src/cli.ts search -q "프론트엔드" -l "강남구" --sort date --format table

# Accounting roles in Busan, second page
bun run .agents/skills/saramin-search/cli/src/cli.ts search -q "회계" -l "부산" --page 2 --format table

# Pangyo has no region code, so it joins the keyword
bun run .agents/skills/saramin-search/cli/src/cli.ts search -q "백엔드" -l "판교" --format table

# Full details for a specific posting
bun run .agents/skills/saramin-search/cli/src/cli.ts detail 55210151 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default - programmatic use |
| `table` | Quick human-readable scanning (Hangul-aware column widths) |
| `plain` | Reading results or one posting's full detail |

Search JSON is `{ "meta": { "count", "page", "total" }, "results": [...] }`. Each
result carries `id`, `title`, `company`, `location`, `date`, `modifiedDate`,
`deadline`, `alwaysOpen`, `career`, `education`, `employmentType`, `jobCategory`,
and `url` (missing values are `null`, never omitted). All errors are written to
**stderr** as `{ "error": "...", "code": "..." }` and the process exits with code
`1`; `PARSE_FAILED` means the page loaded but no longer has the expected
structure (see `url-reference.md`).

## Notes

- **`date` can be null in search results.** A Saramin result card shows either
  its registration date (`등록일`) or, once edited, only its modification date
  (`수정일`) - about 40% of cards. The registration date goes in `date`; a
  modification-only card has `date: null` and the edit date in `modifiedDate`.
  The CLI never passes an edit date off as a posting date. `detail` always has
  the real start date.
- **No recency flag.** Saramin has no posting-date filter, so this CLI has no
  `--jobage`; passing it fails with `UNKNOWN_FLAG`. Faking one by switching to
  the registration-date sort let unrelated postings crowd out relevant ones, so
  it was removed. Keep the default relevance sort and filter by `date` after
  the call (what `/scrape` does for portals without a recency flag). A card
  with `date: null` has only `modifiedDate`: treat it as unknown, not as old,
  and check `detail` for its real start date when it matters.
- **Location.** Region filtering is Saramin's own and also returns postings
  that list the region among several work sites, so a card's `location` (its
  first site, e.g. `서울전체, 강남구`) may name another place.
- **Deadlines.** Search cards print `~ MM/DD(요일)` without a year; the CLI reads it
  as the next such date in Korea time. `오늘마감`/`내일마감` are resolved to dates.
  `채용시` / `상시채용` (open until filled) give `deadline: null` and
  `alwaysOpen: true`. Deadlines can close early at the employer's discretion.
- Requests retry 429/5xx with exponential backoff; a missing posting returns
  `NOT_FOUND`.
