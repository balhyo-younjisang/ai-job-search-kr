# Work24 source reference

Checked against public Work24 HTML on 2026-10-20. These are page contracts,
not a versioned API; diagnose `PARSE_FAILED` against the current page.

- [Search form](https://www.work24.go.kr/wk/a/b/1200/retriveDtlEmpSrchList.do):
  `srcKeyword`, `region`, `careerTypes=N|E`, `regDateStdt`, `regDateEndt`
  (`YYYYMMDD`), `currentPageNo`, `resultCnt=30`, `sortField=DATE`, `sortOrderBy=DESC`.
- Information providers: checked `b_siteClcd` values become a comma-separated
  `siteClcd`. `WORK` selects Work24, `WORK,CJK,CSI` adds JobKorea and Saramin;
  omitting the parameter searches all providers. Codes and labels live in
  `cli/src/helpers.ts` (`SOURCES`), matching the form's 23 providers.
- Search markup: `span.txt_total`, `tr#listN`, posting links carrying
  `wantedAuthNo`, `infoTypeCd`, `infoTypeGroup`; provider identity must survive
  detail fetches. `VALIDATION` is the row code for provider `WORK`.
- [Detail endpoint](https://www.work24.go.kr/wk/a/b/1500/empDetailAuthView.do):
  `wantedAuthNo` plus provider parameters; Work24 uses `tb_workinfoworknet`,
  JobKorea/Saramin use `tb_workinfogubun`, 나라일터 uses `tb_workinfonara`.
  Preserve the group returned by search rather than guessing from the ID.
- Detail title: `.emp_sumup_wrp strong.title`; company: `.corp_info strong`;
  Work24 summary uses `em.tit` + `p`. Body starts at `id="tab-panel01"`.
  Stop before recruiter contacts, 참고사항 or 기업정보, whose tab numbers vary
  by provider. Syndicated closing dates may be rendered by `var date` in
  the D-day script. External iframe bodies are reported as `descriptionUrl`.
- [robots.txt](https://www.work24.go.kr/robots.txt): the wildcard group's
  excluded paths at inspection were `/cm/common/`, `/sa/`, `/ei/`, and
  `/cm/f/c/0100/selectUnifySearchPost.do`; the search/detail paths above were
  outside that list (rechecked 2026-10-21). Recheck when changing endpoints.
  The CLI never fetches legacy `work.go.kr/empInfo/` pages.

## Terms of service

개인회원 이용약관, applied from 2026-06-04; checked 2026-10-21. The footer link
posts a form, so open it from the site footer (이용약관) rather than by URL
(`/cm/c/d/0130/retrieveUtzeStpt.do`).

- 제2조: "이용자" means everyone who uses Work24, with or without an account, so
  these terms apply to the CLI.
- 제17조 1항 2호: users may not copy information from the service for purposes
  **other than their own use**, publish or broadcast it, or give it to third
  parties without 한국고용정보원's prior approval. Personal job-search use is
  inside that line.
- 제12조 2항: access can be cut for heavy traffic that disrupts the service (2)
  or commercial use of the information without consent (5).
- 제14조의2 2항: access can be restricted for automated scraping of personal
  data, automated login, excessive traffic, constantly changing IPs, or
  bypassing CAPTCHA. Item 3 (no prior agreement on transfer format and
  security) sits in the context of agents using automated tools to transfer
  personal data under 1항. The CLI does none of these: no login, one request
  per search or detail, and recruiter contacts are left out of the body.
- 저작권정책: content is open under 공공누리 제4유형 (attribution,
  non-commercial, no derivative works). Deep links into sub-pages from other
  websites need prior permission; this applies to publishing links, not to a
  personal tracker.

Work24 also has an official Open API (footer: 오픈API 서비스, checked
2026-10-21). It is limited to business members (기업회원 전용), and keys are
issued after a review. Individual job seekers cannot use it, which is why this
skill reads the public pages. It is the path to use if usage ever goes beyond
personal search.

Offline tests use explicitly synthetic HTML. To reproduce live evidence,
run the bounded examples in `SKILL.md`; do not rely on hard-coded live IDs.
