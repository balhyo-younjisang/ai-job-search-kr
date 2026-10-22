# Fixture provenance

**All fixtures here are synthetic.** Linkareer's terms (제16조) forbid copying
the service and using it commercially without consent, so no posting content
from Linkareer is stored here. The files reproduce the structure of Linkareer
responses observed on 2026-10-20 (KST) - the GraphQL response shape, the
JSON-LD blocks, and the `__NEXT_DATA__` Apollo cache the parser reads - but
every company, title, posting ID, address, URL, image path and description is
fictional. Dates, recruit types, job types, regions and categories (Linkareer's
own taxonomy) keep the observed values so the date and status logic is
exercised realistically. Tests that depend on "now" use `2026-10-19T16:30:00Z`.
No test regenerates these files or contacts the portal.

| File | Structure modeled on | What it exercises |
|------|----------------------|-------------------|
| `gql-search-backend-seoul.json` | `POST https://api.linkareer.com/graphql`, the `activities` query in `src/helpers.ts` with `{activityTypeID:"5", status:"OPEN", q:"백엔드", regionIDs:["2"]}`, page 1, `RECENT DESC` | 14 postings (9 ASAP, 4 ALWAYS, 1 NORMAL), IDs 911001-911014, newest first. |
| `gql-validation-error.json` | Same endpoint, the query with `organizationName` misspelled | An HTTP 400 `GRAPHQL_VALIDATION_FAILED` body (no posting content). |
| `detail-text-image.html` | `GET https://linkareer.com/activity/<id>` | `<title>`, the JSON-LD blocks and `__NEXT_DATA__` holding `Activity:912001` with only the fields the parser reads. A NORMAL internship with text and one image. No contact fields or business registration number. |
| `detail-closed.html` | same | `Activity:912002`: a closed posting (no JobPosting JSON-LD) whose description is a single image. |
| `detail-asap.html` | same | `Activity:912003`: an ASAP (채용시 마감) 채용연계형 internship. |
| `detail-type1.html` | same | `detail-text-image.html` with `activityTypeID` set to `1` (대외활동), for the `UNSUPPORTED_TYPE` path. |

When Linkareer changes its API or markup, inspect a handful of live responses
(not a crawl), then update these files' **structure** to match - keep the
content fictional, never paste real postings - and update the expectations in
`parsing.test.ts` and `commands.test.ts` together with `../../../url-reference.md`.
