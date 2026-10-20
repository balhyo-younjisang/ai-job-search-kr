# Fixture provenance

**All fixtures here are synthetic.** Saramin's terms forbid copying,
republishing, or passing on what the service shows without its prior consent,
so no posting content from Saramin is stored here. The files reproduce the
markup structure of Saramin pages observed on 2026-10-20 (KST) - element
names, classes, and the attribute layout the parsers anchor on - but every
company, title, region pairing, ID, image URL, and description text is
fictional.

Relative deadline labels in the search fixture (`내일마감`) are interpreted
against a pinned time, so tests parse it with `now = 2026-10-19T15:37:00Z`
(2026-10-20 00:37 KST). No test regenerates these files or contacts the portal.

| File | Structure modeled on | What it exercises |
|------|----------------------|-------------------|
| `search-page.html` | `GET /zf_user/search/recruit?searchword=백엔드&recruitPage=1` | The `cnt_result` total and four `item_recruit` cards inside `#recruit_info_list`: 59000001 (등록일, dated deadline), 59000002 (수정일 only, 내일마감), 59000003 (채용시), 59000004 (등록일). Plus one recommendation card (59000099) in a `not_related` block outside the list, which must not be parsed. |
| `search-no-result.html` | `GET /zf_user/search/recruit?searchword=zzqxjvkwplmn` | The `info_no_result` block and the same recommendation card. |
| `detail-active.html` | `GET /zf_user/jobs/view?rec_idx=<id>&isPrint=yes` | `<title>`, the `a.company` link, `h1.tit_job`, the `jv_summary` block (including a tooltip and a map button inside `<dd>`), and a `jv_howto` block with start and end dates. |
| `detail-always-open.html` | same | A 채용시 마감 posting (`p.copy.once`, start date only). |
| `detail-closed.html` | same | A closed posting (`p.copy.end` and `sri_btn_expired_apply`). |
| `description-mixed.html` | `GET /zf_user/jobs/relay/view-detail?rec_idx=<id>` | A `user_content` body of nested tables mixing text and protocol-relative images, with `&nbsp;`. |
| `description-text.html` | same | A text-only `user_content` body with HTML comments (one holding a link) that must be stripped. |

When Saramin changes its markup, inspect a handful of live pages (not a
crawl), then update these files' **structure** to match - keep the content
fictional, never paste real postings - and update the expectations in
`parsing.test.ts` together with `../../../url-reference.md`.
