---
name: linkareer-search
version: 1.0.0
description: >
  Use this skill to search live job postings - new-graduate roles and
  internships especially - on Linkareer (링커리어, linkareer.com), a South
  Korean career platform for students and recent graduates, or to read a
  specific Linkareer posting in full. Covers 채용 (jobs and internships) only,
  not 공모전, 대외활동 or 교육. Trigger phrases: internships in Korea, Korean
  new-grad jobs, entry-level jobs in Seoul, Linkareer posting, 링커리어,
  링커리어 공고, 인턴 공고, 체험형 인턴, 채용연계형 인턴, 신입 채용, 대학생 인턴,
  채용공고 검색, 이 공고 보여줘.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/linkareer-search/cli/src/cli.ts *)
---

# Linkareer Search Skill

Search live job postings on **[Linkareer (링커리어)](https://linkareer.com)**, a
South Korean career platform aimed at students and recent graduates. Its
strength is **신입 and internships** (체험형, 채용연계형); experienced roles exist
but are few. No authentication, no API key, and **zero runtime dependencies** -
it runs with just `bun`.

Scope is Linkareer's **채용** section (jobs, internships included). Its 공모전,
대외활동 and 교육 listings are out of scope: they have no employer role to
apply to, so they don't fit this repo's application workflow.

## ⚠️ Personal use only

This skill sends the same search query Linkareer's own list page runs against
its public API, and reads public posting pages - all paths its `robots.txt`
permits - identifying itself honestly in its User-Agent. Linkareer's terms
(제16조) forbid automated access that loads its servers or disrupts the
service, reverse-engineering the service, and commercial use without consent;
제39조 also lists accessing the service "by automated programs or macros". So:

- Use it **for your own job search only** - one request per search, one per
  posting detail; never loop it into a crawl.
- **No commercial use, no bulk collection, no republishing** of postings.
- Run it on **your own responsibility**.

## When to use this skill

- Search Korean 신입 / intern / contract / experienced postings by keyword,
  narrowed by province (and optionally district) and registration date
- Read one posting's full detail: type and intern kind, education, salary,
  organization size, external apply link, dates, and the description - text
  plus any images it contains

## Commands

### Search job postings

```bash
bun run .agents/skills/linkareer-search/cli/src/cli.ts search --query "<keywords>" [flags]
```

Flags:
- `--query <text>` / `-q <text>` - keywords. **Required.** Matching leans on titles, so use
  role words (`마케팅`, `백엔드`, `데이터`) rather than long phrases.
- `--location <place>` / `-l <place>` - a province: `서울`, `경기`, `인천`, `부산`, `대구`,
  `광주`, `대전`, `울산`, `강원`, `충청`, `전라`, `경상`, `제주`, `세종`, `해외` (official names
  such as `경기도`, `충청남도` work too). Add a district to narrow further: `서울 강남구`,
  `경기 분당구`. A district alone (`강남구`) or a place that is not a province (`판교`) is
  rejected.
- `--career <types>` - `new` (신입), `experienced` (경력), `intern` (인턴), `contract` (계약직);
  comma-separate for several, e.g. `--career new,intern`.
- `--jobage <days>` - registered within N days.
- `--page <n>` - 1-indexed page, 20 results per page. Default 1.
- `--limit <n>` / `-n <n>` - cap results emitted (client-side).
- `--format json|table|plain` - default `json`.

Results are always newest first (by registration); Linkareer offers no other order.

### Fetch full job detail

```bash
bun run .agents/skills/linkareer-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the `id` from a `search` result (e.g. `357883`); a
`https://linkareer.com/activity/<id>` URL also works. URLs from any other site
are rejected, and an id that is not a job posting (a 공모전 or 대외활동) fails with
`UNSUPPORTED_TYPE`.

Returns the title, company, full work address, `date` (registration),
`recruitStart` (applications open), `deadline`, job types, intern types, job
category, education, salary, organization type, `applyUrl` (most postings send
you to the company's own careers page), `description` (text, or `null`),
`descriptionImages` (image URLs), and `isActive`.

**Images in descriptions.** Many postings put part or all of the description in
an image, often hosted by the employer's ATS. The text is in `description`;
anything shown as an image is only in `descriptionImages`. Fetch and view those
URLs - or the `applyUrl` - when the text looks incomplete.

## Usage examples

```bash
# Marketing internships in Seoul
bun run .agents/skills/linkareer-search/cli/src/cli.ts search -q "마케팅" --career intern -l "서울" --format table

# New-grad or intern backend roles registered in the last 14 days
bun run .agents/skills/linkareer-search/cli/src/cli.ts search -q "백엔드" --career new,intern --jobage 14 --format table

# Data roles in Bundang
bun run .agents/skills/linkareer-search/cli/src/cli.ts search -q "데이터" -l "경기 분당구" --format table

# Design roles in Seoul, second page
bun run .agents/skills/linkareer-search/cli/src/cli.ts search -q "디자인" -l "서울" --page 2 --format table

# Full details for a specific posting
bun run .agents/skills/linkareer-search/cli/src/cli.ts detail 357883 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default - programmatic use |
| `table` | Quick human-readable scanning (Hangul-aware column widths) |
| `plain` | Reading results or one posting's full detail |

Search JSON is `{ "meta": { "count", "page", "total" }, "results": [...] }`. Each
result carries `id`, `title`, `company`, `location`, `date`, `recruitStart`,
`deadline`, `alwaysOpen`, `recruitType`, `jobTypes`, `jobCategory`, and `url`
(missing values are `null`, never omitted). All errors are written to
**stderr** as `{ "error": "...", "code": "..." }` and the process exits with code
`1`; `PARSE_FAILED` means Linkareer changed its API or page structure (see
`url-reference.md`).

## Notes

- **Dates.** `date` is when the posting was registered on Linkareer;
  `recruitStart` is when applications opened, which can be earlier.
- **Deadlines.** `recruitType` is `NORMAL` (a real deadline in `deadline`),
  `ASAP` (채용시 마감 - closes when filled) or `ALWAYS` (상시채용). For the latter
  two `deadline` is `null` and `alwaysOpen` is `true`: Linkareer stores an
  automatic expiry 90 days after opening for them, which is not a deadline the
  employer set. Deadlines can close early at the employer's discretion.
- **Closed postings.** Linkareer keeps a posting's status `OPEN` after it
  closes, so `isActive` compares the close time with now.
- **Location.** The region filter is province-level only. A district in
  `--location` is matched against each posting's listed districts after the
  search returns, so a page can hold fewer than 20 results and `meta.total`
  counts the whole province. `location` in results is the first work site
  (`서울 중구`, or `서울 중구 외 1` for several).
- **Coverage.** Postings are fewer than on JobKorea or Saramin - a Seoul
  "백엔드" search returned 14 open postings - so use this alongside them,
  especially for internships.
- Requests retry 429/5xx with exponential backoff; a missing posting returns
  `NOT_FOUND`.
