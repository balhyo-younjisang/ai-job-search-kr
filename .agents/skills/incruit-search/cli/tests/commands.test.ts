import { afterEach, describe, expect, test } from "bun:test"

import { normalizeId, runDetail } from "../src/commands/detail.js"
import { buildUrl, runSearch, type SearchOpts } from "../src/commands/search.js"

const originalFetch = globalThis.fetch
const originalStdout = process.stdout.write
const originalStderr = process.stderr.write

afterEach(() => {
  globalThis.fetch = originalFetch
  process.stdout.write = originalStdout
  process.stderr.write = originalStderr
})

function stubFetch(route: (url: string) => Response): string[] {
  const urls: string[] = []
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    urls.push(url)
    return route(url)
  }) as unknown as typeof fetch
  return urls
}

function capture(): { out: () => string; err: () => string } {
  let out = ""
  let err = ""
  process.stdout.write = ((chunk: string) => ((out += chunk), true)) as typeof process.stdout.write
  process.stderr.write = ((chunk: string) => ((err += chunk), true)) as typeof process.stderr.write
  return { out: () => out, err: () => err }
}

const utf8 = { headers: { "content-type": "text/html; charset=utf-8" } }

const SEARCH_PAGE = `
  <h2>채용정보 1건</h2>
  <div class="cBbslist_contenst">
    <ul class="c_row" jobno="2610060004924"><li class="c_col">
      <div class="cell_first"><div class="cl_top"><a class="cpname">테스트 회사</a></div></div>
      <div class="cell_mid">
        <div class="cl_top"><a href="https://job.incruit.com/jobdb_info/jobpost.asp?job=2610060004924">백엔드 개발자</a></div>
        <div class="cl_md"><span>서울</span><span>신입</span><span>학력무관</span><span>정규직</span></div>
        <div class="cl_btm"><span>웹개발자</span></div>
      </div>
      <div class="cell_last"><div class="cl_btm"><span>상시</span><span>(오늘 등록)</span></div></div>
    </li></ul>
  </div>`

const DETAIL_PAGE = `
  <script type="application/ld+json">{
    "@type":"JobPosting",
    "title":"백엔드 개발자",
    "description":"경력: 신입<br>학력: 학력무관<br>고용형태: 정규직<br>접수기간: 상시",
    "identifier":{"value":"2610060004924"},
    "hiringOrganization":{"name":"테스트 회사"}
  }</script>`

const DETAIL_IFRAME = '<div id="content_job"><p>서비스 API를 개발합니다.</p></div>'

describe("search URL construction", () => {
  test("encodes the query and fixed job collection", () => {
    const url = new URL(buildUrl({ query: "백엔드 개발자", sort: "relevance", page: 1, format: "json" }))

    expect(url.origin).toBe("https://search.incruit.com")
    expect(url.pathname).toBe("/list/search.asp")
    expect(url.searchParams.get("col")).toBe("job")
    expect(url.searchParams.get("kw")).toBe("백엔드 개발자")
    expect(url.searchParams.get("SortCd")).toBe("rank")
    expect(Array.from(url.searchParams.keys()).at(-1)).toBe("kw")
  })

  test("maps date sorting and optional filters to Incruit parameters", () => {
    const url = new URL(buildUrl({
      query: "데이터",
      location: "서울",
      jobage: 7,
      sort: "date",
      page: 3,
      limit: 40,
      format: "json",
    }))

    expect(url.searchParams.get("SortCd")).toBe("reg")
    expect(url.searchParams.get("startno")).toBe("60")
    expect(url.searchParams.get("psize")).toBe("30")
    expect(url.searchParams.get("kw")).toBe("데이터 서울")
    expect(url.searchParams.has("jobage")).toBeFalse()
    expect(url.searchParams.has("limit")).toBeFalse()
    expect(Array.from(url.searchParams.keys()).at(-1)).toBe("kw")
  })
})

describe("detail reference validation", () => {
  test("accepts a bare 13-digit Incruit posting id", () => {
    expect(normalizeId("2610060004924")).toBe("2610060004924")
  })

  test("accepts canonical desktop and mobile Incruit URLs", () => {
    expect(normalizeId("https://job.incruit.com/jobdb_info/jobpost.asp?job=2610060004924")).toBe("2610060004924")
    expect(normalizeId("https://m.incruit.com/jobdb_info/jobpost.asp?job=2610060004924")).toBe("2610060004924")
  })

  test("rejects malformed ids, foreign URLs, and look-alike hosts", () => {
    const invalid = [
      "123",
      "261006000492x",
      "https://example.com/jobdb_info/jobpost.asp?job=2610060004924",
      "https://job.incruit.com.example.com/jobdb_info/jobpost.asp?job=2610060004924",
      "https://evil-incruit.com/jobdb_info/jobpost.asp?job=2610060004924",
    ]

    for (const input of invalid) expect(normalizeId(input)).toBeNull()
  })
})

describe("offline command behavior", () => {
  const searchOpts: SearchOpts = { query: "백엔드", sort: "relevance", page: 1, format: "json" }

  test("runSearch requests one search page and emits the JSON contract", async () => {
    const urls = stubFetch(() => new Response(SEARCH_PAGE, utf8))
    const io = capture()

    expect(await runSearch(searchOpts)).toBe(0)
    expect(urls).toHaveLength(1)
    expect(new URL(urls[0]).searchParams.get("kw")).toBe("백엔드")
    expect(JSON.parse(io.out())).toMatchObject({
      meta: { count: 1, page: 1, total: 1 },
      results: [{ id: "2610060004924", title: "백엔드 개발자" }],
    })
    expect(io.err()).toBe("")
  })

  test("runDetail validates metadata before fetching its iframe", async () => {
    const urls = stubFetch((url) => new Response(url.includes("jobpostcont.asp") ? DETAIL_IFRAME : DETAIL_PAGE, utf8))
    const io = capture()

    expect(await runDetail({ id: "2610060004924", format: "json" })).toBe(0)
    expect(urls).toEqual([
      "https://job.incruit.com/jobdb_info/jobpost.asp?job=2610060004924",
      "https://job.incruit.com/s_common/jobpost/jobpostcont.asp?job=2610060004924",
    ])
    expect(JSON.parse(io.out())).toMatchObject({
      id: "2610060004924",
      description: "서비스 API를 개발합니다.",
      alwaysOpen: true,
    })
    expect(io.err()).toBe("")
  })

  test("a missing-posting redirect is reported as NOT_FOUND without fetching the iframe", async () => {
    const urls = stubFetch(() => new Response("", {
      status: 302,
      headers: { location: "https://job.incruit.com/jobdb_list/searchjob.asp?from=jobpostnone" },
    }))
    const io = capture()

    expect(await runDetail({ id: "2610060004924", format: "json" })).toBe(1)
    expect(urls).toHaveLength(1)
    expect(JSON.parse(io.err())).toMatchObject({ code: "NOT_FOUND" })
  })
})
