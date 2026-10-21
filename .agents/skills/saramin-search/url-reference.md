# Saramin URL Reference

Investigated 2026-10-20 (KST) against the live site. This is the file to update
when Saramin changes its pages - every parsing anchor the CLI relies on is
listed here.

## Access and identity

### robots.txt

`https://www.saramin.co.kr/robots.txt` has few named groups:

| Group | Rule |
|-------|------|
| Mediapartners-Google, ia_archiver, AdsBot-Google, AdsBot-Google-Mobile | allow all |
| GPTBot, Bytespider | **Disallow: /** |
| `*` (everyone else, including this CLI) | allowed except the paths below |

`*` disallows, among others: `/zf_user/recruit/view/`, `/recruit/recruit_view.php`,
`/zf_user/recruit/recruit-posting/`, `/zf_user/jobs/view/etc`,
`/zf_user/jobs/view*innerCampaign=headhuntingView`, `/zf_user/special-recruit/`,
`/zf_user/company/`, `/zf_user/persons/`, `/zf_user/auth`, `/zf_user/member/apply/`,
`/zf_user/recruit-apply/`, `/Click*`, `/ad`, `/helpdesk/`. The CLI requests only:

| Path | Purpose |
|------|---------|
| `/zf_user/search/recruit` | search |
| `/zf_user/jobs/view?rec_idx={id}&isPrint=yes` | detail summary and dates |
| `/zf_user/jobs/relay/view-detail?rec_idx={id}` | detail description |

`detail` accepts any Saramin URL with `rec_idx=` as *input*, including
disallowed forms, but only extracts the id from it; it never fetches the URL.

### User-Agent

```
Mozilla/5.0 (compatible; ai-job-search-kr/1.0; saramin-search; +https://github.com/balhyo-younjisang/ai-job-search-kr)
```

The product token matches no named group, so the `*` rules apply. It names the
project and a contact URL, and must not borrow another agent's token,
impersonate a browser, or contain `bot`/`scrapy`-style words.

### Terms of service

`/zf_user/help/terms-of-service/person` (개인 회원 약관, revised and applied
2026-01-22; checked 2026-10-21): members may not copy,
reproduce, publish, or pass on information obtained through the service without
Saramin's prior consent, and may not use the service for anything other than
job seeking or for profit. No clause addresses automated access or crawling;
these are member terms, and the CLI does not log in. Hence the
personal-use-only warning in `SKILL.md`.

The three CLI paths were rechecked as allowed by robots.txt on 2026-10-21.

### Maintenance check

Re-run the repo's robots gate whenever a parser is fixed, `/scrape health`
flags this portal, or every few months:

```bash
python3 tools/robots_check.py "https://www.saramin.co.kr/zf_user/search/recruit?searchword=x"
python3 tools/robots_check.py "https://www.saramin.co.kr/zf_user/jobs/view?rec_idx=55210151&isPrint=yes"
python3 tools/robots_check.py "https://www.saramin.co.kr/zf_user/jobs/relay/view-detail?rec_idx=55210151"
```

Exit 0 (`ALLOWED`) on all three = fine. If any becomes disallowed for `*`, set
`enabled: false` in `SKILL.md` instead of working around it.

### Official API (not used)

`GET https://oapi.saramin.co.kr/job-search` needs an `access-key` issued after
registering an app and passing Saramin's approval. It would fix this CLI's
weakest spot - every result carries `posting-timestamp`, and
`published_min`/`published_max` filter by posting date server-side - but its
response has no description. Notable parameters: `keywords`, `loc_cd`/`loc_mcd`,
`job_type`, `edu_lv`, `start` (0-based), `count` (max 110), `sort` (`pd` default).
Returned URLs carry `utm_*` tracking parameters. If a key becomes available:
replace `search` only, read the key from an environment variable, and keep
`detail` on the pages below.

## Search

```
GET https://www.saramin.co.kr/zf_user/search/recruit?searchword={query}&recruitPage={n}&recruitPageCount=40
```

| Parameter | Meaning | Values |
|-----------|---------|--------|
| `searchword` | Keyword | Free text |
| `recruitPage` | Page | 1-indexed |
| `recruitPageCount` | Page size | 40 default (also 80, 100). The CLI sends 40. |
| `recruitSort` | Sort | `relation` (default), `accuracy`, `reg_dt` (registration date), `edit_dt`, `closing_dt` |
| `exp_cd` | Career | `1` 신입, `2` 경력 (also returns 신입·경력 and 경력무관 postings) |
| `loc_mcd` | Province | e.g. `101000` 서울, `102000` 경기; comma-separated for several |
| `loc_cd` | District | e.g. `101010` 강남구, `102190` 성남시 분당구; comma-separated for several |

There is **no posting-date filter**. Other filters in the page (unused):
`edu_none`, `exp_none`, `job_type[]`, `company_type[]`, `welfare_cd[]`, `sal_cd`,
`ind_cd[]`, `cat_mcls[]`, `exc_keyword`.

### Response structure

Server-rendered HTML (~2.4 MB).

- **Result list**: `<div id="recruit_info_list">`. Only cards inside it are
  results. A zero-result page has no such list - it shows
  `<div class="info_no_result">` and renders "popular postings" cards
  elsewhere, which must not be read as results.
- **Total**: `<span class="cnt_result">총 2,418건</span>`.
- **Card**: `<div class="item_recruit" value="{rec_idx}" data-data_layer="keyword_free|paid_n…">`
  - title: `<h2 class="job_tit"><a title="...">` (the `title` attribute; the
    link text bolds the matched keyword)
  - company: `<strong class="corp_name"><a>...</a></strong>`
  - `<div class="job_condition">`: `<span>`s for location (links to
    `/zf_user/area-recruit/...`), career (`경력 3~15년`, `신입·경력`, `경력무관`),
    education (`대졸↑`, `학력무관`), employment type (`정규직·인턴직`). Spans for
    unset fields are omitted, so they are classified by content.
  - `<div class="job_date"><span class="date">`: `~ 11/18(수)`, `오늘마감`,
    `내일마감`, `채용시` (open until filled)
  - `<div class="job_sector">`: category links, then
    `<span class="job_day">등록일 26/10/19</span>` or `수정일 26/10/07`
    (registration date, or only the last edit date - ~40% of cards).

### Region codes

The search page embeds the code table as JSON:
`"area":{"101000":[{"code":"101000","name":"서울전체","id":"loc_mcd","type":"all"},{"code":"101010","name":"강남구","id":"loc_cd"},...],...}`.
`src/areas.ts` is generated from it (domestic provinces 101000-118000 minus
117000 전국; overseas regions left out). To regenerate: fetch one search page,
brace-match the object after `"area":`, and rewrite `PROVINCES` (province code ->
name without `전체`, 세종특별자치시 -> 세종) and `DISTRICTS` (entries with
`"id":"loc_cd"`).

## Detail

The interactive posting page (`/zf_user/jobs/relay/view`) loads its content
through `POST /zf_user/jobs/relay/view-ajax`, so the CLI reads the server-rendered
print view instead.

```
GET https://www.saramin.co.kr/zf_user/jobs/view?rec_idx={id}&isPrint=yes
```

A nonexistent id redirects to `/zf_user/recruit/not-exist-view`, which answers 404.

- title: `<h1 class="tit_job">`
- company: `<a ... title="{company}" class="company">`
- 핵심 정보: `<div class="jv_cont jv_summary">` with `<dl><dt>label</dt><dd>value</dd></dl>`
  pairs - `경력`, `학력`, `근무형태`, `급여`, `직급/직책`, `근무일수`, `근무지역`. A
  value's `<strong>` text is the value when present; tooltip and map buttons in
  the `<dd>` are noise.
- 접수기간: `<div class="jv_cont jv_howto">` -> `<dl class="info_period">` with
  `<dt>시작일</dt><dd>2026.10.07 00:00</dd>` and `<dt class="end">마감일</dt><dd>2026.10.21 23:59</dd>`
  (Korea time). Status markers: `<p class="copy end">마감되었습니다.</p>` and the
  `sri_btn_expired_apply` button = closed; `<p class="copy once"><strong>채용시 마감</strong>…`
  = open until filled (no 마감일).

## Description

```
GET https://www.saramin.co.kr/zf_user/jobs/relay/view-detail?rec_idx={id}
```

The body is the inner HTML of the first `<div class="user_content">`: text
(headings, `ㆍ`/`•` bullets, `<br>` and block breaks) mixed with `<img>` tags,
whose `src` is protocol-relative (`//www.saraminimage.co.kr/...`) and is
normalized to `https:`. Some postings are images only.
