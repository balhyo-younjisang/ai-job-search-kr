# Incruit HTML contracts

OMC planning evidence: `~/.claude/plans/enumerated-toasting-gem.md` and its
2026-10-20 scratchpad search/detail HTML. Rechecked against live official
pages on 2026-10-20. These are HTML contracts, not a stable public API.

## Requests

| Endpoint | Parameters |
| --- | --- |
| `https://search.incruit.com/list/search.asp` | `col=job`, `startno=(page-1)*30`, `psize=30`, `SortCd=rank` or `reg`, `kw` |
| `https://job.incruit.com/jobdb_info/jobpost.asp` | `job=<13-digit ID>` |
| `https://job.incruit.com/s_common/jobpost/jobpostcont.asp` | `job=<same ID>` |

The response charset is EUC-KR. `decodeResponse` checks the HTTP charset, then
HTML meta, and defaults to EUC-KR; UTF-8 is also accepted when declared.

**Keep UTF-8 `kw` last in the query string.** Live testing showed that putting
another parameter after UTF-8 `kw` can consume that parameter into the keyword
and silently drop its filter. With `kw` last, page sizes, offsets, and sort
worked and result IDs matched an EUC-KR encoded request. The site's input field
can still display mojibake even while the result query is correct.

`--location` is appended to `kw`. No dedicated region/career filter was
verified on this search form. `--jobage` is local and forces `SortCd=reg`.
Other form sort values include `mod`, `invite`, `viewcnt`, and `applycnt`;
the CLI exposes only relevance and registration date.

## Parsing anchors

- Search cards: `ul.c_row[jobno]`, `a.cpname`, `div.cell_mid` posting link,
  `div.cl_md` spans (location, career, education, employment type), and
  `div.cell_last` spans (deadline and relative registration/modification).
- Explicit zero-result text: `입력하신 키워드에 맞는 검색결과가 없습니다.`
  Do not interpret a page missing cards and this marker as empty.
- Detail: `script[type="application/ld+json"]` with `@type: JobPosting`.
  Identity comes from `identifier.value`; registration from `datePosted`;
  Korean facts and full reception dates also appear in `description`.
- Full text/images: `div#content_job` on the separate canonical iframe page.
  Do not include page scripts, navigation, recruiter sections or recommendations.
- Closed: `p.closed-title` with `마감되었습니다.`. Such pages can lack JSON-LD;
  use `h1` and the company link in `.top-cnt` for the remaining summary.
  The generic phrase `마감된 채용정보` appears in the report menu on open
  postings, so it is not a closed marker.
- Missing: detail redirects to same-host `/jobdb_list/searchjob.asp` with
  `from=jobpostnone`. Return `NOT_FOUND` without following that redirect.
  Other redirects fail visibly rather than following to another endpoint.

## Access boundaries

Read [search robots](https://search.incruit.com/robots.txt) and
[job robots](https://job.incruit.com/robots.txt) before changing endpoints.
At inspection, wildcard search excludes `/Company`, `/Web`, `/G_Common`,
`/Who`, `/Jobarba`, `/L_Common` (also lowercase variants); wildcard job
excludes `/jobdb_info/jobpostcontpartner.asp`. The three paths above are
outside those exclusions. Named crawler groups have additional restrictions,
including full exclusion for GPTBot/ClaudeBot and `/s_common/` exclusions for
OAI-SearchBot/Claude-SearchBot. The honest project User-Agent matches wildcard.

The main `www.incruit.com` host excludes all wildcard paths, and
`m.incruit.com`'s robots.txt disallows its root page for Claude-User. The CLI
never requests either host, including company links or favicon assets. The public posting's notice says that redistribution requires
consent and employer/recruiter data is for job seeking.

Robots rules above rechecked with `tools/robots_check.py` on 2026-10-21: the
three CLI paths are still allowed.

## Terms of service

`https://help.incruit.com/docs/terms_mobile.asp` (개인회원 이용약관, applied from
2026-04-30; checked 2026-10-21). `help.incruit.com`'s robots.txt allows the page.

- 제19조 ④: members may not copy, reproduce, translate, publish, broadcast, or
  otherwise use information obtained through the service, or give it to third
  parties, without Incruit's prior consent.
- 제19조 ⑤: the service may be used only for job seeking. Banned acts include
  disrupting stable operation and profit-making use of the site's information.
- No clause addresses automated access or crawling. These are member terms,
  and the CLI does not log in.

The skill still ships `enabled: false` because the hosts' robots rules fully
exclude GPTBot/ClaudeBot (see `SKILL.md`).

## Test provenance

Offline HTML is synthetic or abbreviated from these observed structures.
`cli/tests/fixtures/search-euckr.bin` is a small synthetic EUC-KR card for
testing real byte decoding. It contains no recruiter contacts. Live checks
are opt-in; hard-coded example IDs can expire, so use fresh search results.
