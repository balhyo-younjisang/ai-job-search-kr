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
  outside that list. Recheck when changing endpoints. The CLI never fetches
  legacy `work.go.kr/empInfo/` pages.

Offline tests use explicitly synthetic HTML. To reproduce live evidence,
run the bounded examples in `SKILL.md`; do not rely on hard-coded live IDs.
