# JobKorea URL Reference

Investigated 2026-10-19/20 (KST) against the live site. This is the file to
update when JobKorea changes its pages - every parsing anchor the CLI relies on
is listed here.

## Access and identity

### robots.txt

`https://www.jobkorea.co.kr/robots.txt` - **version 3.0, last updated
2026-08-21** at the time of writing (CLI paths rechecked as allowed on
2026-10-21). It sorts agents into groups:

| Group | Examples | `/Search/`, `/Recruit/GI_Read*` |
|-------|----------|---------------------------------|
| AI training crawlers | GPTBot, ClaudeBot, anthropic-ai, Google-Extended | **Disallow: /** |
| AI search/citation (user-initiated) | Claude-User, ChatGPT-User, OAI-SearchBot | allowed (same rules as `*`) |
| Known scrapers | CCBot, Diffbot, Scrapy | **Disallow: /** |
| Social preview | facebookexternalhit, Slackbot, kakaotalk-scrap | `/Search/` disallowed |
| `*` (everyone else) | - | allowed |

Paths disallowed for `*`: `/login/`, `/user/`, `/my/`, `/account/`,
`/RecrtMng/`, `/corp/`, `/text_co/`, `/Salary/mylist`,
`/Recruit/JobList/SpaceClick` (and capitalized variants). The CLI touches none of them.

The image hosts behind `descriptionImages` (`file1.jobkorea.co.kr`,
`file2.jobkorea.co.kr`) publish `User-agent: *` / `Disallow: /` (checked
2026-10-21). The CLI only reports those URLs and never requests them, and agents
must not fetch them either. `SKILL.md` describes the user-supplied path for
reading an image-only description.

### User-Agent

```
Mozilla/5.0 (compatible; ai-job-search-kr/1.0; jobkorea-search; +https://github.com/balhyo-younjisang/ai-job-search-kr)
```

- Its product token matches no named group, so the `*` rules apply. In
  substance the CLI is a user-initiated fetch run by an AI assistant - the
  "AI search/citation" category - which has the same rules as `*`. It never
  feeds model training.
- It names the project and a contact URL so JobKorea's operators can identify
  and reach the maintainer (same rationale as upstream `ce9b656` for freehire).
- It must not borrow another agent's token (`Claude-User` is Anthropic's),
  impersonate a browser (repo portal contract), contain `bot`/`scrapy`-style
  words that WAFs block on sight, or say `jobkorea-cli` (reads as an official
  JobKorea tool).
- Legal context: in JobKorea v. Saramin, the court found the competitor's
  crawling unlawful partly because it hid its identity in the User-Agent and
  ignored robots.txt, while JobKorea permitted crawlers that identified
  themselves. Honest identification and robots.txt compliance are load-bearing
  here, not decoration.

### Terms of service

`https://m.jobkorea.co.kr/service_jk/Provision_GG.asp` (회원 이용약관, applied
from 2026-01-29; checked 2026-10-21). The www host returns 404 for this path.
The operator is named "웍스피어 유한책임회사". One member account covers
jobkorea.co.kr and albamon.com.

- 제18조 ④: members may not copy, reproduce, translate, publish, broadcast, or
  otherwise use information obtained through the service, or give it to
  others, without the company's prior consent.
- 제18조 ⑤: the service may be used only for sound job seeking and career
  management. Banned acts include anything that threatens stable operation (7)
  and profit-making use of the site's information (8).
- No clause addresses automated access or crawling. These are member terms,
  and the CLI does not log in.

Hence the personal-use-only warning in `SKILL.md`: low volume, no bulk
collection, no republishing.

### Maintenance check

Re-run the repo's robots gate whenever a parser is fixed, `/scrape health`
flags this portal, or every few months:

```bash
python3 tools/robots_check.py "https://www.jobkorea.co.kr/Search/?stext=x&tabType=recruit"
python3 tools/robots_check.py "https://www.jobkorea.co.kr/Recruit/GI_Read/50159061"
python3 tools/robots_check.py "https://www.jobkorea.co.kr/Recruit/GI_Read_Comt_Ifrm?Gno=50159061"
```

Exit 0 (`ALLOWED`) on all three = fine. Update the version/date above. If the
`*` group starts disallowing `/Search/` or `/Recruit/`, set `enabled: false` in
`SKILL.md` instead of working around it.

### Official API (not used)

JobKorea publishes an XML job-listing API (`JK_GI_XML_List.asp` for general
postings, `JK_Starter_XML_List.asp` for new-graduate 공채; EUC-KR XML with
`GI_No`, `GI_Subject`, `C_Name`, `AreaCode`, `GI_Career`, `GI_W_Date`,
`GI_End_Date`, `JK_URL`, ...). Keys are issued only to public institutions and
schools, and the response has no description field. If a key ever becomes
available: replace `search` only (detail would still need the pages below),
read the key from an environment variable, and strip the `api=<key>`
parameter the API embeds in every returned URL before printing anything.

## Search

```
GET https://www.jobkorea.co.kr/Search/?stext={query}&tabType=recruit&Page_No={n}
```

| Parameter | Meaning | Values |
|-----------|---------|--------|
| `stext` | Keyword | Free text. Place names here filter by location precisely (`백엔드 판교`). |
| `tabType` | Result tab | `recruit` (job postings) |
| `Page_No` | Page | 1-indexed, 20 organic results per page |
| `careerType` | Career level | `1` 신입, `2` 경력, `4` 경력무관 (postings marked 신입·경력 match both 1 and 2). `careerMin`/`careerMax` exist for 경력 years (unused). |
| `period` | Posting date | `2` today, `3` last 3 days, `4` last week, `5` last month |
| `ord` | Sort | `RegDtDesc` = newest first; omitted = relevance |
| `local` | Region code | **Ignored** by the server-rendered page for anonymous requests (verified with `I000`, `B000`, `I010`, `B150`, multi-value, and origin codes - result count unchanged). Not sent. |

Other filter keys the frontend knows (unused): `duty`, `dkwrd`, `cotype`,
`edu`, `jobtype`, `industry`, `ikwrd`, `position`, `filter`, `featureWel`,
`payType`, `payMin`, `payMax`, `excludeText`.

### Response structure

Next.js app-router page, server-rendered (~440 KB).

**Structured data (primary).** The RSC flight payload is streamed as
`<script>self.__next_f.push([1,"<JSON string>"])</script>` chunks. Decode each
chunk as a JSON string literal and concatenate - records split across chunks.
The organic list is a dehydrated react-query entry:

```
{"dehydratedAt":...,"state":{"data":{"pageSize":20,"pageNumber":0,"totalElements":2377,"totalPages":119,"content":[...]}},...,"queryKey":["JOB_LIST",20,0,"1","DESC","백엔드",...],...}
```

Find `"queryKey":["JOB_LIST"`, take the last `{"dehydratedAt":` before it, and
brace-match (string-aware) to the end of that object. A zero-result search still
has this entry with `content: []`; a missing entry means the page changed.

Other entries to ignore: a `pageSize: 3` premium block (shown above the list) and
`COMPANY_LIST`.

`content[]` fields used:

| Field | Example | Output |
|-------|---------|--------|
| `id` | `"50007983"` | `id`, `url` (`/Recruit/GI_Read/{id}`) |
| `title` | `"AI백엔드 엔지니어 경력 모집"` | `title` |
| `companyName` / `postingCompanyName` | `"㈜가상러닝"` | `company` |
| `createdAt` | `"2026-09-17T10:01:28.32+09:00"` | `date` (date part) |
| `applicationPeriod.end` | `"2026-11-16T23:00:00+09:00"`; `"2070-01-01..."` = 상시채용 | `deadline` / `alwaysOpen` (year >= 2069) |
| `careerType`, `careerRange` | `"2"`, `5` | `career` = `경력 5년↑` (1 신입, 2 경력[ N년↑], 3 신입·경력, 4 경력무관; range 0 or 100 = no minimum) |
| `educationCode` | `"5"` | `education`: 3 고졸↑, 4 초대졸↑, 5 대졸↑, 6 석사↑, 7 박사↑; any other code (0, 255) 학력무관 |
| `areaCodeList` | `["I070"]` | `areaCodes` |
| `jobClassificationOrIndustry` | `",솔루션·SI·CRM·ERP,백엔드개발자,"` | `jobCategory` fallback |

Also present (unused): `legacyJobNo`, `employmentTypeCodeList`,
`benefitNameList`, `readCount`, `badges`, `payRange`, and `_internal_*`
ranking fields.

**Card HTML (location label only).** Each card is a
`<div ... data-sentry-component="CardJob">`. Its links are
`/Recruit/GI_Read/{id}?Oem_Code=C1&logpath=1&stext=...&listno={n}&sc={slot}`;
`sc=630` = organic, `sc=808` = sponsored insert. The first
`data-sentry-component="GrayChip"` holds the location label (`서울 구로구`,
`서울 서초구 외 1`), the second the job categories; the text sits in
`<span class="truncate ...">`.

### Region codes

`GET https://www.jobkorea.co.kr/Search/api/codes/area` returns the full table
(631 entries: `code`, `parentCode`, `displayName`, `tagDisplayName`). Top level:
`I000` 서울, `B000` 경기, `K000` 인천, `G000` 대전, `1000` 세종, `O000` 충남,
`P000` 충북, `L000` 전남광주, `M000` 전북, `F000` 대구, `D000` 경북, `H000` 부산,
`J000` 울산, `C000` 경남, `A000` 강원, `N000` 제주, `Q000` 전국, plus overseas
regions. Children share the prefix (`I070` 구로구, `B150` 성남시 분당구). Other
code tables: `/Search/api/codes/{name}`.

## Detail

```
GET https://www.jobkorea.co.kr/Recruit/GI_Read/{id}
```

404 for a nonexistent id. Accepted input URLs: `www.` or `m.` host,
`/Recruit/GI_Read/{id}` or `/Recruit/GI_Read_Comt_Ifrm?Gno={id}`.

- **JSON-LD** `<script type="application/ld+json">` with `"@type": "JobPosting"`:
  `title`, `datePosted`, `validThrough` (`2026-11-16T23:59`, no offset = KST),
  `employmentType` (`FULL_TIME`), `experienceRequirements` (`경력`),
  `educationRequirements` (`학력무관`), `hiringOrganization.name`,
  `jobLocation.address.streetAddress`. Its `description` is a one-line
  summary - not used. For 상시채용 postings `validThrough` is a date about a year
  out, so it is not trusted for those.
- **모집요강 summary**: rows marked `data-sentry-component="RecruitmentItem"`,
  label in `<span class="min-w-[80px]">`, value in the rest of the row up to the
  next component's opening tag. Labels used: `고용형태`, `급여`, `근무시간`,
  `근무지주소` (trailing `지도보기` link text dropped).
- **Always-open marker**: rendered text `마감일 상시채용` (tags stripped).

## Description iframe

```
GET https://www.jobkorea.co.kr/Recruit/GI_Read_Comt_Ifrm?Gno={id}
```

The posting body is the inner HTML of `<div id="detail-content" ...>`. Two shapes:

- **Text** (e.g. 50159061): headings and `ㆍ`-bulleted lines separated by
  `<br>`/block tags.
- **Image-only** (e.g. 50007983): a single
  `<img src="//file2.jobkorea.co.kr/Net/Mng/DownImage/CorpEditor?file_No=...">`;
  protocol-relative, normalized to `https:`.
