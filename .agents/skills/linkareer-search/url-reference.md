# Linkareer URL Reference

Investigated 2026-10-20 (KST) against the live site. This is the file to update
when Linkareer changes its API or pages - every field and anchor the CLI relies
on is listed here.

## Access and identity

### robots.txt

- `https://linkareer.com/robots.txt`: `User-agent: *` -> `Allow: /`, with 14
  `Disallow` lines under `/stem/learn/...` only. The one named group is Bingbot
  (`Crawl-delay: 1`). No AI-crawler groups.
- `https://api.linkareer.com/robots.txt`: **404** (`Cannot GET /robots.txt`). Under
  RFC 9309 no published policy means access is allowed.
- Both rechecked on 2026-10-21: detail paths still allowed, API robots still 404.

The CLI requests only:

| Request | Purpose |
|---------|---------|
| `POST https://api.linkareer.com/graphql` (`activities` query) | search |
| `GET https://linkareer.com/activity/{id}` | detail |

### User-Agent

```
Mozilla/5.0 (compatible; ai-job-search-kr/1.0; linkareer-search; +https://github.com/balhyo-younjisang/ai-job-search-kr)
```

The product token matches no named group. It names the project and a contact
URL, and must not borrow another agent's token, impersonate a browser, or
contain `bot`/`scrapy`-style words. GraphQL requests carry no `Origin` or
`Referer`: the API answers without them, and the CLI does not pose as the site.

### Terms of service

`https://linkareer.com/terms` (applied from 2026.08.12; checked 2026-10-21):
- 제16조 forbids using "자동 접속 프로그램 등" to load the servers or disrupt the
  service, reverse-engineering / copying / imitating the service, commercial use
  without consent, and infringing the company's business model.
- 제39조 2호 lists accessing the service or posting "by automated programs,
  macros or other mechanical means" (in the context of spam); 제40조 sets
  suspension for violations.
- 제20조 bans crawling and scraping, but only for 링커리어 STEM's uploaded exam
  material (기출콘텐츠). The CLI never touches STEM.

Hence the personal-use-only warning in `SKILL.md`, one request per search and
per detail, and a query built only from field names the site's own pages use
(no schema exploration in the code).

### Maintenance check

Re-run these whenever a parser is fixed, `/scrape health` flags this portal, or
every few months:

```bash
python3 tools/robots_check.py "https://linkareer.com/activity/357883"
python3 tools/robots_check.py "https://linkareer.com/list/recruit?filterBy_q=x"
curl -s -o /dev/null -w "%{http_code}\n" https://api.linkareer.com/robots.txt   # expect 404
```

If `api.linkareer.com` starts publishing a robots.txt, check `/graphql` against
it with `robots_check.py`. If the API is disallowed or starts requiring
authentication or an Origin check, switch search to the SSR list page below
(and drop `--jobage`, since it has no registration date) or set
`enabled: false` - do not work around it.

### Official API

None. Linkareer offers no public or partner API (only "광고 및 제휴 문의").

So `api.linkareer.com/graphql` is **undocumented**: it is the API Linkareer's
own pages call, and it answers anonymous requests, but Linkareer has not
published it for third parties. The CLI keeps to what the site's pages already
request (one `activities` query, fields the pages use, no login, no
introspection). If Linkareer blocks it, restricts it, or says it is not for
outside use, switch search to the SSR list page below or set `enabled: false`.

## Search (GraphQL)

```
POST https://api.linkareer.com/graphql
Content-Type: application/json
```

Anonymous requests work. Introspection is disabled (`INTROSPECTION_DISABLED`).
A query the schema rejects returns **HTTP 400** with
`{"errors":[{"extensions":{"code":"GRAPHQL_VALIDATION_FAILED"},...}]}` - the CLI
reports that as `PARSE_FAILED`.

```graphql
query SearchRecruit($filterBy: ActivityFilter, $pagination: Pagination, $orderBy: ActivityOrder) {
  activities(filterBy: $filterBy, pagination: $pagination, orderBy: $orderBy) {
    totalCount
    nodes {
      id title organizationName activityTypeID createdAt recruitStartAt recruitCloseAt recruitType jobTypes
      regions { id name }
      regionDistricts { name region { name } }
      addresses { sido sigungu }
      categories { id name }
    }
  }
}
```

Variables:

| Variable | Value |
|----------|-------|
| `filterBy.activityTypeID` | `"5"` (채용; 1 = 대외활동, 6 = 교육). Responses return it as a number. |
| `filterBy.status` | `"OPEN"` |
| `filterBy.q` | keyword (matches titles mostly) |
| `filterBy.regionIDs` | `["2"]` - see region ids below |
| `filterBy.jobTypes` | `["NEW","EXPERIENCED","INTERN","CONTRACT"]` subset |
| `pagination` | `{ "page": n, "pageSize": 20 }` |
| `orderBy` | `{ "field": "RECENT", "direction": "DESC" }` - matches `createdAt` descending. The only order the CLI uses. |

Node fields:

| Field | Example | Output |
|-------|---------|--------|
| `id` | `"911014"` | `id`, `url` = `https://linkareer.com/activity/{id}` |
| `title` | `"(산업기능요원) 백엔드 엔지니어"` | `title` |
| `organizationName` | `"예시러닝"` | `company` |
| `createdAt` | `1791961279000` (epoch ms) | `date` (KST `YYYY-MM-DD`) |
| `recruitStartAt` | epoch ms | `recruitStart` |
| `recruitType` + `recruitCloseAt` | `NORMAL` + real close / `ASAP` (채용시) / `ALWAYS` (상시) | `deadline` / `alwaysOpen`. For ASAP/ALWAYS `recruitCloseAt` is start + 90 days, an automatic expiry. |
| `jobTypes` | `["NEW","EXPERIENCED"]` | `jobTypes` as 신입/경력/인턴/계약직 |
| `regionDistricts[].region.name` + `name` | `서울` + `중구` | `location` (`regions[].name` when no district) |
| `categories[].name` | `백엔드/서버개발` | `jobCategory` |

### Region ids

From `activityFilterList(input: { activityTypeID: 5 })` (items need the inline
fragment `... on ActivityFilterItemByID { id name }`): 1 지역 제한없음, 2 서울, 3
부산, 4 대구, 5 인천, 6 광주, 7 대전, 8 울산, 9 경기, 10 강원, 11 충청, 25 전라, 26
경상, 27 제주, 28 세종, 29 해외. Province level only - there is no district
filter. `cli/src/regions.ts` holds this table; refresh it from the same query.
Job types there: `NEW` 신입, `EXPERIENCED` 경력직, `INTERN` 인턴, `CONTRACT` 계약직.

### SSR fallback (not used)

`GET https://linkareer.com/list/recruit?filterBy_q=..&filterBy_jobTypes=NEW&filterBy_regionIDs=2&page=1`
server-renders the same `activities` result into `__NEXT_DATA__` (Apollo
cache, `Activity:{id}` entries), but its nodes have **no `createdAt`**.

## Detail

```
GET https://linkareer.com/activity/{id}
```

- A missing id answers **301/302 to `/`** (`pageProps.err.statusCode`); the CLI
  fetches with `redirect: "manual"` and treats any 3xx or 404 as `NOT_FOUND`.
- `<script id="__NEXT_DATA__" type="application/json">` ->
  `props.pageProps.__APOLLO_STATE__["Activity:{id}"]`, with `{"__ref": "..."}`
  links into the same cache:
  - `title`, `organizationName`, `organizationType` (`대기업`), `activityTypeID`
  - `createdAt`, `recruitStartAt`, `recruitCloseAt`, `recruitType`, `status`
    (stays `OPEN` after closing - not a signal)
  - `jobTypes`, `distinctInternTypes[].name` (`체험형 인턴`, `채용연계형 인턴`),
    `education` (`NO_LIMIT`, `COLLEGE_GRADUATE_4_YEARS`, `COLLEGE_GRADUATE_2_3_YEARS`
    seen; others passed through)
  - `salaryType` (`YEARLY` seen), `minSalary`, `maxSalary`,
    `isSalaryDecidedByCompanyPolicy`, `isSalaryDecidedAfterInterview`
  - `applyDetail` (external apply URL), `applyTypes[].name` (`접수페이지`), `homepageURL`
  - `addresses[].address` (`경기 성남시 분당구 예시로 123`), `regionDistricts`, `categories`
  - `detailText -> ActivityText:{n}.text`: the description as editor HTML, text
    mixed with `<img>` (Linkareer's media CDN or the employer's ATS host)
- `pageProps.data.activityData.activity` holds a denormalized copy without
  `detailText` or `education`; the CLI reads the Apollo cache instead.
- JSON-LD `JobPosting` (`datePosted`, `validThrough` in UTC, `employmentType`,
  `hiringOrganization`, `jobLocation`) is present on open postings only;
  closed ones carry just a `BreadcrumbList`.
