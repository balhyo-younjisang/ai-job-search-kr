import { describe, expect, test } from "bun:test"

import { normalizeRef } from "../src/commands/detail.js"
import { parseDetail } from "../src/helpers.js"

// Synthetic public-sector fixture based on Work24's provider-backed detail
// page. Public-sector deadlines are exposed in script rather than the standard
// "접수 마감일" summary used by Work24-native postings.
const PUBLIC_SECTOR_DETAIL_HTML = `
  <div class="emp_sumup_wrp">
    <strong class="title">공공 데이터 연구원</strong>
    <p class="corp_info"><strong>한국연구재단</strong></p>
  </div>
  <script>var date = '2026-11-06';</script>
  <section id="tab-panel01"><h2>본문</h2><p>공공 데이터 분석과 모델 개발</p></section>
  <section id="tab-panel02"><h2>전형일정</h2><p>서류 및 면접 전형</p></section>
  <!-- 참고사항 -->
  <section id="tab-panel03"><h2>참고사항</h2><p>내부 관리용 참고 문구</p></section>
  <footer>고용24 공통 푸터</footer>
`

describe("detail posting reference validation", () => {
  test("accepts a bare Work24 posting id", () => {
    expect(normalizeRef("K171112610190045")).toEqual({
      id: "K171112610190045",
      infoTypeCd: "VALIDATION",
      infoTypeGroup: "tb_workinfoworknet",
    })
  })

  test("accepts Work24 and legacy Worknet URLs and preserves provider parameters", () => {
    expect(
      normalizeRef(
        "https://www.work24.go.kr/wk/a/b/1500/empDetailAuthView.do?wantedAuthNo=ALI0123456789&infoTypeCd=ALI&infoTypeGroup=tb_workinfogubun",
      ),
    ).toEqual({ id: "ALI0123456789", infoTypeCd: "ALI", infoTypeGroup: "tb_workinfogubun" })

    expect(normalizeRef("work.go.kr/example?wantedAuthNo=K171112610190045")).toEqual({
      id: "K171112610190045",
      infoTypeCd: "VALIDATION",
      infoTypeGroup: "tb_workinfoworknet",
    })
  })

  test("rejects malformed ids, foreign hosts, look-alike hosts, and invalid provider parameters", () => {
    const invalid = [
      "abc",
      "https://example.com/?wantedAuthNo=K171112610190045",
      "https://work24.go.kr.example.com/?wantedAuthNo=K171112610190045",
      "https://work24.go.kr/?wantedAuthNo=bad!id",
      "https://work24.go.kr/?wantedAuthNo=ALI0123456789&infoTypeCd=ali",
      "https://work24.go.kr/?wantedAuthNo=ALI0123456789&infoTypeCd=ALI&infoTypeGroup=INVALID-GROUP",
    ]

    for (const input of invalid) expect(normalizeRef(input)).toBeNull()
  })
})

describe("public-sector detail parser", () => {
  test("handles compact and displayed syndicated deadlines and until-filled sentinels", () => {
    const parse = (extra: string) => parseDetail(
      PUBLIC_SECTOR_DETAIL_HTML.replace("<script>var date = '2026-11-06';</script>", extra),
      "51759138", "CJK", "tb_workinfogubun",
    )
    expect(parse("<script>var date = '20261211';</script>").deadline).toBe("2026-12-11")
    expect(parse('<span id="rcptClostDtDisplay"><br>~ 2026.12.11 (금)</span>').deadline).toBe("2026-12-11")
    const open = parse("<script>var date = '17000101';</script><span>채용시까지</span>")
    expect(open.alwaysOpen).toBeTrue()
    expect(open.deadline).toBeNull()
  })

  test("uses the script deadline, expires it, and excludes reference/footer content", () => {
    const detail = parseDetail(
      PUBLIC_SECTOR_DETAIL_HTML,
      "ALI0123456789",
      "ALI",
      "tb_workinfogubun",
      new Date("2026-11-07T00:00:00+09:00"),
    )

    expect(detail.deadline).toBe("2026-11-06")
    expect(detail.isActive).toBeFalse()
    expect(detail.description).toContain("공공 데이터 분석과 모델 개발")
    expect(detail.description).toContain("서류 및 면접 전형")
    expect(detail.description).not.toContain("내부 관리용 참고 문구")
    expect(detail.description).not.toContain("고용24 공통 푸터")
  })

  test("exposes an HTTP iframe source when the posting body is hosted externally", () => {
    const html = `
      <div class="emp_sumup_wrp"><strong class="title">외부 상세 공고</strong></div>
      <script>var date = '2026-11-30';</script>
      <section id="tab-panel01">
        <iframe title="채용공고 상세" src="https://job.alio.go.kr/recruitview.do?idx=1234"></iframe>
      </section>
      <!-- 참고사항 -->
      <footer>고용24 공통 푸터</footer>
    `

    const detail = parseDetail(html, "ALI0123456789", "ALI", "tb_workinfogubun")

    expect(detail.descriptionUrl).toBe("https://job.alio.go.kr/recruitview.do?idx=1234")
  })
})
