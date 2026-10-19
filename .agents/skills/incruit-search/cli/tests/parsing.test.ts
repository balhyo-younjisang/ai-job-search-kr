import { describe, expect, test } from "bun:test"
import { join } from "path"

import {
  decodeResponse,
  parseDetail,
  parseSearchPage,
  relativeDate,
} from "../src/helpers.js"

const NOW = new Date("2026-10-20T00:30:00+09:00")

function card(overrides: {
  id?: string
  company?: string
  title?: string
  facts?: string[]
  categories?: string[]
  deadline?: string
  activity?: string
} = {}): string {
  const id = overrides.id ?? "2610060004924"
  const facts = overrides.facts ?? ["서울 성동구", "경력 5년↑", "학력무관", "정규직"]
  // Incruit places the separator inside each category span except the last.
  const categories = overrides.categories ?? ["웹개발자,", "백엔드개발자"]

  return `
    <ul class="c_row" jobno="${id}">
      <li class="c_col">
        <div class="cell_first"><div class="cl_top">
          <a href="https://www.incruit.com/company/14604991" class="cpname">${overrides.company ?? "(주)아이아이컴바인드"}</a>
        </div></div>
        <div class="cell_mid">
          <div class="cl_top"><a href="https://job.incruit.com/jobdb_info/jobpost.asp?job=${id}&amp;src=etc*search">${overrides.title ?? "[IICOMBINED] <span class=\"highlight\">백엔드</span> 엔지니어"}</a></div>
          <div class="cl_md">${facts.map((fact) => `<span>${fact}</span>`).join("")}</div>
          <div class="cl_btm">${categories.map((category) => `<span>${category}</span>`).join(" ")}</div>
        </div>
        <div class="cell_last"><div class="cl_btm">
          <span>${overrides.deadline ?? "~11.08 (일)"}</span>
          <span>(${overrides.activity ?? "14일전 등록"})</span>
        </div></div>
      </li>
    </ul>`
}

describe("parseSearchPage", () => {
  test("parses the fields exposed by a real Incruit organic result card", () => {
    const { results: [result] } = parseSearchPage(`<div class="cBbslist_contenst">${card()}</div>`, NOW)

    expect(result).toEqual({
      id: "2610060004924",
      title: "[IICOMBINED] 백엔드 엔지니어",
      company: "(주)아이아이컴바인드",
      location: "서울 성동구",
      date: "2026-10-06",
      modifiedDate: null,
      deadline: "2026-11-08",
      alwaysOpen: false,
      career: "경력 5년↑",
      education: "학력무관",
      employmentType: "정규직",
      jobCategory: "웹개발자, 백엔드개발자",
      url: "https://job.incruit.com/jobdb_info/jobpost.asp?job=2610060004924",
    })
  })

  test("preserves organic card order and ignores unrelated job links", () => {
    const html = `
      <a href="/jobdb_info/jobpost.asp?job=9999999999999">추천 광고</a>
      <div class="cBbslist_contenst">
        ${card({ id: "2610060004924" })}
        ${card({ id: "2609210001143", title: "두 번째 공고" })}
      </div>`

    expect(parseSearchPage(html, NOW).results.map((result) => result.id)).toEqual([
      "2610060004924",
      "2609210001143",
    ])
  })

  test("maps an always-open posting to a null deadline", () => {
    const { results: [result] } = parseSearchPage(card({ deadline: "상시" }), NOW)

    expect(result.deadline).toBeNull()
    expect(result.alwaysOpen).toBeTrue()
  })

  test("records a modification separately from the original registration date", () => {
    const { results: [result] } = parseSearchPage(card({ activity: "2일전 수정" }), NOW)

    expect(result.date).toBeNull()
    expect(result.modifiedDate).toBe("2026-10-18")
  })

  test("returns an empty list for a genuine empty result container", () => {
    expect(parseSearchPage('<div class="cBbslist_contenst"><p>검색 결과가 없습니다</p></div>', NOW)).toEqual({ results: [], total: 0 })
  })

  test("skips malformed rows without inventing a posting id", () => {
    const malformed = card({ id: "not-an-incruit-id" })
    expect(parseSearchPage(`<div class="cBbslist_contenst">${malformed}${card()}</div>`, NOW).results).toHaveLength(1)
  })
})

describe("relativeDate", () => {
  test("converts day-relative registration labels in Korea time", () => {
    expect(relativeDate("3일전 등록", NOW)).toBe("2026-10-17")
  })

  test("subtracts hour labels as instants before formatting in Korea time", () => {
    expect(relativeDate("2시간전 등록", NOW)).toBe("2026-10-19")
  })

  test("returns null for labels that carry no relative timestamp", () => {
    expect(relativeDate("상시", NOW)).toBeNull()
    expect(relativeDate("날짜 미상", NOW)).toBeNull()
  })
})

describe("EUC-KR response decoding", () => {
  test("decodes an Incruit-shaped CP949/EUC-KR byte fixture", async () => {
    const bytes = await Bun.file(join(import.meta.dir, "fixtures", "search-euckr.bin")).arrayBuffer()
    const response = new Response(bytes, {
      headers: { "content-type": "text/html; charset=euc-kr" },
    })

    expect(await decodeResponse(response)).toContain("백엔드 엔지니어")
    expect(await decodeResponse(new Response(bytes))).toContain("아이아이컴바인드")
  })
})

const DETAIL_PAGE = `
  <div class="job_info_detail">
    <div class="top-cnt"><em><a>(주)아이아이컴바인드</a></em><h1>[IICOMBINED] 백엔드 엔지니어</h1></div>
  </div>
  <iframe id="ifrmJobCont" src="https://job.incruit.com/s_common/jobpost/jobpostcont.asp?job=2610060004924"></iframe>
  <script type="application/ld+json">
    {
      "@context": "https://schema.org/",
      "@type": "JobPosting",
      "title": "[IICOMBINED] 백엔드 엔지니어",
      "description": "(주)아이아이컴바인드<br><br>경력: 경력 5년↑<br>학력: 학력무관<br>고용형태: 정규직<br>접수기간: 2026.10.06 ~ 2026.12.04",
      "datePosted": "2026-10-06",
      "validThrough": "2026-12-04T23:59:59+09:00",
      "employmentType": ["FULL_TIME"],
      "identifier": {"value": "2610060004924"},
      "educationRequirements": "no requirements",
      "experienceRequirements": {"monthsOfExperience": 60},
      "hiringOrganization": {"name": "아이아이컴바인드"},
      "jobLocation": {"address": {"addressRegion": "서울특별시", "addressLocality": "마포구"}}
    }
  </script>`

const DETAIL_IFRAME = `
  <div id="content_job">
    <h2>주요업무</h2><p>백엔드 API와 데이터 파이프라인을 개발합니다.</p>
    <script>window.noise = "추천 채용정보"</script>
  </div>`

describe("parseDetail", () => {
  test("combines structured metadata with the fetched iframe body", () => {
    const detail = parseDetail(DETAIL_PAGE, DETAIL_IFRAME, "2610060004924", NOW)

    expect(detail).toMatchObject({
      id: "2610060004924",
      title: "[IICOMBINED] 백엔드 엔지니어",
      company: "아이아이컴바인드",
      date: "2026-10-06",
      deadline: "2026-12-04",
      alwaysOpen: false,
      employmentType: "정규직",
      isActive: true,
    })
    expect(detail.description).toContain("백엔드 API와 데이터 파이프라인을 개발합니다.")
    expect(detail.description).not.toContain("추천 채용정보")
  })

  test("marks a detail page inactive after validThrough", () => {
    const detail = parseDetail(
      DETAIL_PAGE,
      DETAIL_IFRAME,
      "2610060004924",
      new Date("2026-12-05T00:00:00+09:00"),
    )

    expect(detail.isActive).toBeFalse()
  })

  test("uses the requested id and canonical Incruit detail URL", () => {
    const detail = parseDetail(DETAIL_PAGE, DETAIL_IFRAME, "2610060004924", NOW)
    expect(detail.url).toBe("https://job.incruit.com/jobdb_info/jobpost.asp?job=2610060004924")
  })

  test("recognizes an expired fallback page that no longer exposes JobPosting JSON-LD", () => {
    const closedPage = `
      <p class="closed-title">마감되었습니다.</p>
      <div class="job_info_detail">
        <div class="top-cnt"><em><a>(주)마감기업</a></em><h1>이미 마감된 백엔드 공고</h1></div>
      </div>`

    expect(parseDetail(closedPage, DETAIL_IFRAME, "2610060004924", NOW)).toMatchObject({
      id: "2610060004924",
      title: "이미 마감된 백엔드 공고",
      company: "(주)마감기업",
      date: null,
      deadline: null,
      alwaysOpen: false,
      isActive: false,
    })
  })
})
