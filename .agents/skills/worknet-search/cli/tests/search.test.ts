import { describe, expect, test } from "bun:test"

import { buildUrl, type SearchOpts } from "../src/commands/search.js"
import { PageShapeError, parseSearchPage } from "../src/helpers.js"

const baseOpts = (sources: string[]): SearchOpts => ({
  query: "백엔드",
  sources,
  page: 1,
  format: "json",
})

// Synthetic fixture modelled on Work24's server-rendered search table. Keeping
// it inline makes these parser tests deterministic and prevents live requests.
const SEARCH_HTML = `
  <span class="txt_total">1,234</span>
  <table><tbody>
    <tr id="list1">
      <td>
        <div class="box_chk-group"><label><span>한국연구재단<span class="label_box">알리오</span></span></label></div>
        <a href="/wk/a/b/1500/empDetailAuthView.do?wantedAuthNo=ALI0123456789&amp;infoTypeCd=ALI&amp;infoTypeGroup=tb_workinfogubun">
          데이터 &amp; AI 연구원
        </a>
        <ul>
          <li class="member"><span>신입</span><span>대졸</span></li>
          <li class="dollar"><span>연봉 4,000만원</span></li>
          <li class="time"><span>주 5일</span><span>09:00~18:00</span></li>
          <li class="site">서울특별시 중구</li>
        </ul>
        <span>등록일 : 2026-10-19</span>
        <span>마감일 : 2026-10-31</span>
        <script>var wantedYn = 'N'</script>
      </td>
    </tr>
  </tbody></table>
`

describe("search URL provider filters", () => {
  test("the CLI's default WORK provider emits siteClcd=WORK", () => {
    const url = new URL(buildUrl(baseOpts(["WORK"])))

    expect(url.searchParams.get("siteClcd")).toBe("WORK")
  })

  test("selected providers are sent as one comma-separated filter", () => {
    const url = new URL(buildUrl(baseOpts(["GOJ", "ALI", "CJK"])))

    expect(url.searchParams.get("siteClcd")).toBe("GOJ,ALI,CJK")
  })

  test("all providers are represented by an empty source list and omit siteClcd", () => {
    const url = new URL(buildUrl(baseOpts([])))

    expect(url.searchParams.has("siteClcd")).toBeFalse()
  })
})

describe("search result parser", () => {
  test("parses a normal page and preserves provider metadata in its detail URL", () => {
    const page = parseSearchPage(SEARCH_HTML)

    expect(page.total).toBe(1234)
    expect(page.results).toHaveLength(1)
    expect(page.results[0]).toMatchObject({
      id: "ALI0123456789",
      title: "데이터 & AI 연구원",
      company: "한국연구재단",
      source: "알리오",
      date: "2026-10-19",
      deadline: "2026-10-31",
      alwaysOpen: false,
    })

    const detailUrl = new URL(page.results[0].url)
    expect(detailUrl.searchParams.get("wantedAuthNo")).toBe("ALI0123456789")
    expect(detailUrl.searchParams.get("infoTypeCd")).toBe("ALI")
    expect(detailUrl.searchParams.get("infoTypeGroup")).toBe("tb_workinfogubun")
  })

  test("recognizes an explicit zero-result page", () => {
    const html = `<span class="txt_total">0</span><p>검색 결과가 없습니다</p>`

    expect(parseSearchPage(html)).toEqual({ results: [], total: 0 })
  })

  test("fails loudly when the page no longer has results or the zero-result marker", () => {
    expect(() => parseSearchPage("<main><h1>채용정보</h1></main>")).toThrow(PageShapeError)
    expect(() => parseSearchPage("<main><h1>채용정보</h1></main>")).toThrow("page structure may have changed")
  })

  test("fails loudly when result rows exist but every row is unparseable", () => {
    const html = `
      <span class="txt_total">2</span>
      <table><tbody>
        <tr id="list1"><td>상세 링크가 사라진 행</td></tr>
        <tr id="list2"><td><a href="/changed/detail/path">제목만 남은 행</a></td></tr>
      </tbody></table>
    `

    expect(() => parseSearchPage(html)).toThrow(PageShapeError)
  })

  test("keeps the same wantedAuthNo when it comes from different providers", () => {
    const html = `
      <span class="txt_total">2</span>
      <table><tbody>
        <tr id="list1">
          <td>
            <a href="/wk/a/b/1500/empDetailAuthView.do?wantedAuthNo=SHARED12345&amp;infoTypeCd=ALI&amp;infoTypeGroup=tb_workinfogubun">알리오 공고</a>
          </td>
        </tr>
        <tr id="list2">
          <td>
            <a href="/wk/a/b/1500/empDetailAuthView.do?wantedAuthNo=SHARED12345&amp;infoTypeCd=GOJ&amp;infoTypeGroup=tb_workinfogubun">나라일터 공고</a>
          </td>
        </tr>
      </tbody></table>
    `

    const page = parseSearchPage(html)
    expect(page.results).toHaveLength(2)
    expect(page.results.map((result) => result.source)).toEqual(["알리오", "나라일터"])
    expect(page.results.map((result) => new URL(result.url).searchParams.get("infoTypeCd"))).toEqual(["ALI", "GOJ"])
  })
})
