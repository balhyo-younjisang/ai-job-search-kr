---
name: jobkorea-search
version: 1.0.0
description: >
  Use this skill to search live job postings on JobKorea (잡코리아,
  jobkorea.co.kr), one of South Korea's largest general job boards, or to read
  a specific JobKorea posting in full. Covers all sectors and career levels
  (신입 and 경력) across Korea. Trigger phrases: find jobs in Korea, Seoul /
  Pangyo / Busan jobs, Korean job search, JobKorea posting, look up this
  JobKorea job, 잡코리아, 잡코리아 공고, 채용공고 검색, 채용정보, 구인,
  일자리 찾기, 신입 채용, 경력 채용, 개발자 채용, 공채, 이 공고 보여줘.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/jobkorea-search/cli/src/cli.ts *)
---

# JobKorea Search Skill

Search live job postings on **[JobKorea (잡코리아)](https://www.jobkorea.co.kr)**,
a large South Korean job board covering every sector and both new-graduate
(신입) and experienced (경력) hiring. No authentication, no API key, and **zero
runtime dependencies** - it runs with just `bun`.

## ⚠️ Personal use only

This skill reads JobKorea's public web pages on paths its `robots.txt` permits,
and identifies itself honestly in its User-Agent (project name and contact URL).
JobKorea's member terms (제18조, checked 2026-10-21) forbid copying,
reproducing, or passing on information from the service without its prior
consent, and limit use to job seeking and career management. They have no
clause on automated access, and the CLI does not log in. JobKorea has gone to
court over third-party crawling of its postings before, so:

- **Keep volume low** - a handful of searches per session, not a crawl.
- **No commercial use, no bulk collection, no republishing** of postings.
- Run it on **your own responsibility**.

JobKorea's official job-listing API is issued only to public institutions and
schools, which is why this skill uses the public pages instead.

## When to use this skill

- Search Korean job postings by keyword, optionally narrowed by place,
  career level (신입/경력), and recency
- Read one posting's full detail: employment type, salary, hours, address,
  and the description (상세요강) - as text, or as image URLs when the employer
  posted the description as an image

## Commands

### Search job postings

```bash
bun run .agents/skills/jobkorea-search/cli/src/cli.ts search --query "<keywords>" [flags]
```

Flags:
- `--query <text>` / `-q <text>` - keywords (title, skill, company). **Required.** Korean
  keywords work best (`백엔드`, `데이터 분석`, `회계`); English tech terms also match.
- `--location <place>` / `-l <place>` - place name, e.g. `서울`, `판교`, `부산`, `강남구`,
  `성남`. **Matched as a keyword** (see Notes), so district and area names work too.
- `--career new|experienced` - 신입 or 경력. Postings open to both (신입·경력) match either.
- `--jobage <days>` - posted within N days.
- `--sort relevance|date` - default `relevance`; `date` = newest first.
- `--page <n>` - 1-indexed page, 20 results per page. Default 1.
- `--limit <n>` / `-n <n>` - cap results emitted (client-side).
- `--format json|table|plain` - default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/jobkorea-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the `id` from a `search` result (e.g. `50159061`). A JobKorea posting URL
(`https://www.jobkorea.co.kr/Recruit/GI_Read/50159061?...`, mobile host included)
also works; URLs from any other site are rejected.

Returns the title, company, address, posting date, deadline, employment type,
experience, education, salary, working hours, `description` (text, or `null`),
`descriptionImages` (image URLs), and `isActive`.

**Image-only descriptions.** Many Korean postings put the whole description in a
single image. Then `description` is `null` and `descriptionImages` holds the
image URL(s). To read it, fetch the image URL and view it - the requirements
(자격요건, 우대사항) are usually in it. The summary fields (salary, hours,
address, experience) are still text.

## Usage examples

```bash
# Experienced backend roles in Pangyo, table view
bun run .agents/skills/jobkorea-search/cli/src/cli.ts search -q "백엔드" -l "판교" --career experienced --format table

# Data analyst roles in Seoul posted in the last 7 days, newest first
bun run .agents/skills/jobkorea-search/cli/src/cli.ts search -q "데이터 분석" -l "서울" --jobage 7 --sort date --format table

# New-graduate frontend roles anywhere in Korea
bun run .agents/skills/jobkorea-search/cli/src/cli.ts search -q "프론트엔드" --career new --format table

# Accounting roles in Busan
bun run .agents/skills/jobkorea-search/cli/src/cli.ts search -q "회계" -l "부산" --format table

# Second page of results
bun run .agents/skills/jobkorea-search/cli/src/cli.ts search -q "마케팅" -l "서울" --page 2 --format table

# Full details for a specific posting
bun run .agents/skills/jobkorea-search/cli/src/cli.ts detail 50159061 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default - programmatic use |
| `table` | Quick human-readable scanning (Hangul-aware column widths) |
| `plain` | Reading results or one posting's full detail |

Search JSON is `{ "meta": { "count", "page", "total", "totalPages" }, "results": [...] }`.
Each result carries `id`, `title`, `company`, `location`, `areaCodes`, `date`
(posting date, `YYYY-MM-DD`), `deadline`, `alwaysOpen`, `career`, `education`,
`jobCategory`, and `url` (missing values are `null`, never omitted). All errors
are written to **stderr** as `{ "error": "...", "code": "..." }` and the process
exits with code `1`; `PARSE_FAILED` means the page loaded but no longer has the
expected structure (see `url-reference.md`).

## Notes

- **Location is a keyword.** JobKorea's own region filter is ignored for
  anonymous requests, but its keyword search matches place names precisely, so
  `--location 판교` searches for `<query> 판교`. A posting that lists several
  work sites matches any of them. `location` in results is JobKorea's own label
  for the first site (e.g. `서울 서초구 외 1`); `areaCodes` lists every site's
  region code.
- **Deadlines.** `deadline` is the application end date. Postings open until
  filled (상시채용) have `deadline: null` and `alwaysOpen: true`. Deadlines can
  close early at the employer's discretion.
- **Recency.** `--jobage` maps to JobKorea's posting-date filter (today / 3 days /
  1 week / 1 month) and then trims to the exact window by `date`. `meta.total`
  is JobKorea's count for the coarser bucket, so it can exceed what the exact
  window would hold.
- **Organic results only.** Sponsored cards and the premium block shown above the
  results are skipped; each page has up to 20 organic postings.
- **`career`** uses JobKorea's wording: `신입`, `경력`, `경력 N년↑`, `신입·경력`, `경력무관`.
  **`education`** is the minimum: `고졸↑`, `초대졸↑`, `대졸↑`, `석사↑`, `박사↑`, or `학력무관`.
- Requests retry 429/5xx with exponential backoff; a missing posting returns
  `NOT_FOUND`.
