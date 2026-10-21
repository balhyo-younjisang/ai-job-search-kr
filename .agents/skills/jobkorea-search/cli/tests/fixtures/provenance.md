# Fixture provenance

**All fixtures here are synthetic.** They reproduce the markup structure of
JobKorea pages observed on 2026-10-19/20 (KST) - element names, attributes,
component markers, and the RSC flight-payload layout the parsers anchor on -
but every company, title, address, ID, image URL, and description text is
fictional. No posting content from JobKorea is redistributed here.

They pin the parsers offline; no test regenerates them or contacts the portal.

| File | Structure modeled on | What it exercises |
|------|----------------------|-------------------|
| `search-page.html` | `GET /Search/?stext=백엔드&tabType=recruit&Page_No=1` | Three organic `CardJob` cards (59100001, 59100002, 59100003) plus one ad card (`sc=808`, 59100009); the `JOB_LIST` react-query entry holding those three postings; one decoy `PREMIUM_LIST` query holding the ad id. The flight payload is split across two `self.__next_f.push` chunks mid-record, as real pages are. 59100002 is always open (end date 2070-01-01). |
| `detail.html` | `GET /Recruit/GI_Read/<id>` | A BreadcrumbList and a JobPosting JSON-LD block, and the 모집요강 section (`RecruitmentField` through `Qualification`) with `RecruitmentItem` rows. |
| `description-text.html` | `GET /Recruit/GI_Read_Comt_Ifrm?Gno=<id>` | A text-type description in JobKorea's `dev-template-v2` layout, with `&nbsp;` entities. |
| `description-image.html` | `GET /Recruit/GI_Read_Comt_Ifrm?Gno=<id>` | An image-only description (a single protocol-relative `<img>`). |
| `description-image-template.html` | same (agency image template, observed 2026-10-21) | An image-only body with comments that hold tags, the same image in `p.web` and `p.mobile`, image-map links, and 입사 지원하기 buttons (`a.detBtn`). Text must be `null` and the image listed once. |

When JobKorea changes its markup, inspect a handful of live pages (not a
crawl), then update these files' **structure** to match - keep the content
fictional, never paste real postings - and update the expectations in
`parsing.test.ts` together with `../../../url-reference.md`.
