// Data source: Work24 (고용24), the Korean government job portal that absorbed
// Worknet (워크넷). Public pages only; no authentication required.
//
// Worknet's own job pages (work.go.kr/empInfo/) are disallowed for
// "User-agent: *" in its robots.txt, so this CLI never requests work.go.kr.
// Work24's robots.txt disallows only /cm/common/, /sa/, /ei/ and its unified
// search; the job search (/wk/a/b/1200/) and detail (/wk/a/b/1500/) pages are
// allowed and server-rendered.
//
// Work24 also lists postings syndicated from other boards (JobKorea, Saramin,
// Incruit, ...). Search defaults to Work24's own postings (siteClcd=WORK) so
// results do not duplicate the portals this repo already searches directly.

export const BASE_URL = "https://www.work24.go.kr"
export const SEARCH_URL = `${BASE_URL}/wk/a/b/1200/retriveDtlEmpSrchList.do`
export const DETAIL_URL = `${BASE_URL}/wk/a/b/1500/empDetailAuthView.do`

// Names this project and gives a contact URL, so Work24's operators can tell
// who is asking and reach the maintainer. The product token matches no named
// group in Work24's robots.txt, so the "User-agent: *" rules apply. Never
// borrow another agent's token or impersonate a browser, and keep words like
// "bot" out: WAFs match them regardless of robots.txt.
export const USER_AGENT =
  "Mozilla/5.0 (compatible; ai-job-search-kr/1.0; worknet-search; +https://github.com/balhyo-younjisang/ai-job-search-kr)"

/** The page loaded but no longer has the shape the parsers expect. */
export class PageShapeError extends Error {}

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return ""
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

// ---------------------------------------------------------------- text

/**
 * Convert a Unicode code point to a string. Uses `fromCodePoint` (not
 * `fromCharCode`) so supplementary-plane code points (e.g. emoji, U+1F600)
 * decode correctly, and drops out-of-range values instead of throwing.
 */
function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    // Numeric character references: decimal (&#233;) and hexadecimal (&#xE9;).
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

export function clean(html: string): string {
  // Decode first, then collapse: &nbsp; becomes a space that must collapse too.
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
}

/** HTML as text lines, keeping paragraph, list, row and <br> breaks. */
export function textLines(html: string): string {
  const body = html
    .replace(/<(script|style|button)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    // Help tooltips (도움말) explain the form, not the posting.
    .replace(/<div class="box_help-data[^"]*">[\s\S]*?<\/div>/g, "")
  const withBreaks = body
    .replace(/\s+/g, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d|tr|table|strong|caption)>/gi, "\n")
    .replace(/<\/t[hd]>/gi, " ")
  // Clean each rendered line separately: clean() collapses whitespace, so
  // applying it to the whole block would erase these boundaries.
  return withBreaks.split("\n").map(clean).filter(Boolean).join("\n")
}

// ---------------------------------------------------------------- dates (KST)

/** Today's date in Korea (UTC+9) as YYYY-MM-DD, shifted back by `daysAgo`. */
export function koreaDate(daysAgo = 0, now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + 9 * 3600 * 1000 - daysAgo * 86400 * 1000)
  return shifted.toISOString().slice(0, 10)
}

/** "2026-10-19", "2026.10.19 13:41:48" -> "2026-10-19"; anything else -> null. */
export function isoDate(value: string | null | undefined): string | null {
  const m = (value ?? "").match(/(\d{4})[.-](\d{2})[.-](\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

// ---------------------------------------------------------------- codes

/**
 * Work24's information providers (정보제공처, `siteClcd`), from the search
 * page's filter. WORK is Work24's own postings; the rest are syndicated.
 * A result row names its provider in `infoTypeCd`, where Work24's own
 * postings read VALIDATION instead of WORK.
 */
export const SOURCES: Record<string, { code: string; label: string }> = {
  work: { code: "WORK", label: "고용24" },
  nara: { code: "GOJ", label: "나라일터" },
  alio: { code: "ALI", label: "알리오" },
  wih: { code: "WIH", label: "여성기업일자리허브" },
  cleaneye: { code: "CLE", label: "클린아이" },
  mma: { code: "MMA", label: "병역일터" },
  jobkorea: { code: "CJK", label: "잡코리아" },
  saramin: { code: "CSI", label: "사람인" },
  incruit: { code: "CIN", label: "인크루트" },
  career: { code: "CCN", label: "커리어" },
  mediajob: { code: "CMJ", label: "미디어잡" },
  gongchae: { code: "OEW", label: "공채속보" },
  medijob: { code: "CMD", label: "메디잡" },
  midasin: { code: "MIT", label: "마이다스인" },
  pharm: { code: "CPR", label: "팜리크루트" },
  ssis: { code: "WFC", label: "한국사회보장정보원" },
  ibk: { code: "IBK", label: "i-ONE JOB" },
  rndjob: { code: "PRD", label: "알앤디잡" },
  kosmes: { code: "KOS", label: "중소벤처기업진흥공단" },
  catch: { code: "CAT", label: "캐치" },
  wanted: { code: "CWT", label: "원티드" },
  demand: { code: "CDM", label: "디맨드" },
  conworker: { code: "CWK", label: "건설워커" },
}

/** A provider name or code ("nara", "GOJ") -> its siteClcd code, or null. */
export function sourceCode(value: string): string | null {
  const v = value.trim()
  if (SOURCES[v.toLowerCase()]) return SOURCES[v.toLowerCase()].code
  const byCode = Object.values(SOURCES).find((s) => s.code === v.toUpperCase())
  return byCode ? byCode.code : null
}

/** The provider label for a row's infoTypeCd (VALIDATION = Work24 itself). */
export function sourceLabel(infoTypeCd: string | null): string | null {
  if (!infoTypeCd) return null
  if (infoTypeCd === "VALIDATION") return SOURCES.work.label
  return Object.values(SOURCES).find((s) => s.code === infoTypeCd)?.label ?? infoTypeCd
}

/** Province codes from the search page's region filter. */
export const REGIONS: Record<string, string> = {
  서울: "11000",
  부산: "26000",
  대구: "27000",
  인천: "28000",
  대전: "30000",
  울산: "31000",
  세종: "36110",
  경기: "41000",
  충북: "43000",
  충남: "44000",
  전남광주: "12000",
  전북: "52000",
  경북: "47000",
  경남: "48000",
  제주: "50000",
  강원: "51000",
}

const REGION_ALIASES: Record<string, string> = {
  광주: "전남광주",
  전남: "전남광주",
  전라남: "전남광주",
  전라북: "전북",
  충청북: "충북",
  충청남: "충남",
  경상북: "경북",
  경상남: "경남",
}

/**
 * A province name ("서울", "서울특별시", "경기도", "충청남도") -> its region
 * code, or null for anything else - districts and neighbourhoods have no code
 * in this table and go into the keyword instead.
 */
export function regionCode(name: string): string | null {
  const bare = name.trim().replace(/(특별자치시|특별자치도|특별시|광역시|도)$/, "")
  const key = REGION_ALIASES[bare] ?? bare
  return REGIONS[key] ?? null
}

/** Career filter values (careerTypes): N = 신입, E = 경력. */
export const CAREER_CODES: Record<string, string> = { new: "N", experienced: "E" }

// ---------------------------------------------------------------- search

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  deadline: string | null
  alwaysOpen: boolean
  career: string | null
  education: string | null
  salary: string | null
  workHours: string | null
  source: string | null
  url: string
}

export interface SearchPage {
  results: JobCard[]
  total: number | null
}

/** The detail URL for a posting; Work24's own postings need no provider params. */
export function canonicalUrl(id: string, infoTypeCd = "VALIDATION", infoTypeGroup = "tb_workinfoworknet"): string {
  const params = new URLSearchParams({ wantedAuthNo: id, infoTypeCd, infoTypeGroup })
  return `${DETAIL_URL}?${params.toString()}`
}

function spans(html: string): string[] {
  return [...html.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/g)].map((m) => clean(m[1])).filter(Boolean)
}

/** One result row (<tr id="list{n}">), or null if it lacks an id or title. */
export function parseRow(row: string): JobCard | null {
  const link = row.match(/href="\/wk\/a\/b\/1500\/empDetailAuthView\.do\?([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
  if (!link) return null
  const params = new URLSearchParams(decodeHtmlEntities(link[1]))
  const id = params.get("wantedAuthNo")
  const title = clean(link[2])
  if (!id || !title) return null
  const infoTypeCd = params.get("infoTypeCd")
  const infoTypeGroup = params.get("infoTypeGroup")

  // Work24's own rows link the company name (cp_name); syndicated public-sector
  // rows (나라일터, 알리오) carry it as plain text in the same label.
  const company =
    row.match(/class="cp_name[^"]*"[^>]*>([\s\S]*?)<\/a>/) ??
    row.match(/<div class="box_chk-group">\s*<label>\s*<span>([\s\S]*?)<span class="label_box/)
  const salary = spans(row.match(/<li class="dollar">([\s\S]*?)<\/li>/)?.[1] ?? "")
  const member = spans(row.match(/<li class="member">([\s\S]*?)<\/li>/)?.[1] ?? "")
  const time = spans(row.match(/<li class="time">([\s\S]*?)<\/li>/)?.[1] ?? "")
  const site = row.match(/<li class="site">([\s\S]*?)<\/li>/)

  // The deadline cell is filled by script: wantedYn 'Y' (or a 2099 date)
  // means 채용시까지 - open until filled, with the listed date only a system
  // expiry - otherwise the 마감일 line is the deadline.
  const wantedYn = row.match(/var wantedYn = '([YN]?)'/)?.[1]
  const closeDate = isoDate(row.match(/마감일\s*:\s*([\d-]+)/)?.[1])
  const alwaysOpen = wantedYn === "Y" || (closeDate?.startsWith("2099") ?? false)

  return {
    id,
    title,
    company: company ? clean(company[1]) || null : null,
    location: site ? clean(site[1]) || null : null,
    date: isoDate(row.match(/등록일\s*:\s*([\d-]+)/)?.[1]),
    deadline: alwaysOpen ? null : closeDate,
    alwaysOpen,
    career: member[0] ?? null,
    education: member[1] ?? null,
    salary: salary.length ? salary.join(" ") : null,
    workHours: time.length ? time.join(", ") : null,
    source: sourceLabel(infoTypeCd),
    url: canonicalUrl(id, infoTypeCd ?? undefined, infoTypeGroup ?? undefined),
  }
}

/**
 * Parse a search results page. A zero-result page says so in the table
 * ("…에 대한 검색 결과가 없습니다"); a page with neither rows nor that notice
 * changed shape and throws.
 */
export function parseSearchPage(html: string): SearchPage {
  const starts = [...html.matchAll(/<tr id="list\d+">/g)].map((m) => m.index!)
  const total = html.match(/<span class="txt_total">\s*([\d,]+)\s*<\/span>/)
  const totalCount = total ? Number(total[1].replace(/,/g, "")) : null
  if (starts.length === 0) {
    if (/검색 결과가 없습니다/.test(html) && totalCount !== null) return { results: [], total: 0 }
    throw new PageShapeError(
      "Could not find the result table in the Work24 search page - the page structure may have changed (see url-reference.md)",
    )
  }
  const results: JobCard[] = []
  const seen = new Set<string>()
  starts.forEach((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] : html.indexOf("</tbody>", start)
    // Parse each row independently: one odd row must not sink the page.
    let card: JobCard | null = null
    try {
      card = parseRow(html.slice(start, end === -1 ? undefined : end))
    } catch {
      card = null
    }
    if (!card || seen.has(card.url)) return
    seen.add(card.url)
    results.push(card)
  })
  if (results.length === 0) throw new PageShapeError("Work24 result rows could not be parsed (see url-reference.md)")
  return { results, total: totalCount }
}

// ---------------------------------------------------------------- detail

export interface JobDetail {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  deadline: string | null
  alwaysOpen: boolean
  url: string
  employmentType: string | null
  workSchedule: string | null
  experience: string | null
  education: string | null
  salary: string | null
  source: string | null
  description: string | null
  descriptionUrl: string | null
  isActive: boolean
}

/** A posting Work24 has no record of (its "상세 내역이 없습니다" alert page). */
export class NotFoundError extends Error {}

/** `<em class="tit">label</em><p>value</p>` pairs from the posting summary. */
export function parseSummary(html: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of html.matchAll(/<em class="tit">([\s\S]*?)<\/em>\s*<p>([\s\S]*?)<\/p>/g)) {
    const key = clean(m[1])
    const value = clean(m[2])
    if (key && value && !(key in out)) out[key] = value
  }
  return out
}

/**
 * The description: the 모집요강, 근무조건, 우대사항, 복리후생 and 전형방법 tabs,
 * stopping at the recruiter-contact block (marked `<!-- 채용 담당자 -->`). The
 * contact details, the certifying office's phone and the company-info tab are
 * left out.
 */
export function parseDescription(html: string): string | null {
  const start = html.indexOf('id="tab-panel01"')
  if (start === -1) return null
  const companyPanel = /<strong\b[^>]*id="tab-panel\d+"[^>]*>\s*기업정보\s*<\/strong>/.exec(html.slice(start))
  const contact = /<strong\b[^>]*>\s*채용 담당자\s*<\/strong>/.exec(html.slice(start))
  const ends = [html.indexOf('id="tab-panel06"', start), html.indexOf("<!-- 채용 담당자 -->", start), html.indexOf("<!-- 참고사항 -->", start), companyPanel ? start + companyPanel.index : -1, contact ? start + contact.index : -1].filter((i) => i !== -1)
  const end = ends.length ? Math.min(...ends) : -1
  const block = html.slice(html.lastIndexOf("<", start), end === -1 ? undefined : html.lastIndexOf("<", end))
  const text = textLines(block)
    // Table captions are accessibility text ("...을(를) 제공하는 표"), not content.
    .split("\n")
    .filter((line) => !/을\(를\) 제공하는 표$/.test(line))
    .join("\n")
  return text || null
}

/** Parse a posting page. Throws NotFoundError for Work24's no-record alert page. */
export function parseDetail(html: string, id: string, infoTypeCd: string, infoTypeGroup: string, now: Date = new Date()): JobDetail {
  const header = html.match(/<div class="emp_sumup_wrp">[\s\S]*?<strong class="title">([\s\S]*?)<\/strong>/)
  if (!header) {
    const notice = html.match(/var msgStr = '([^']*)'/)
    if (notice) throw new NotFoundError(notice[1] || "Job not found")
    throw new PageShapeError("The Work24 posting page has no title - the page structure may have changed (see url-reference.md)")
  }
  const title = clean(header[1])
  const company = html.match(/<p class="corp_info">\s*<strong>([\s\S]*?)<\/strong>/)
  const summary = parseSummary(html)
  const registered = html.match(/<th scope="row">\s*채용공고 등록일시\s*<\/th>\s*<td>([\s\S]*?)<\/td>/)
  const closeText = clean(html.match(/접수 마감일<\/strong>\s*<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "")
  // Syndicated templates render the closing date through their D-day script.
  const displayClose = html.match(/<span\b[^>]*id="rcptClostDtDisplay"[^>]*>([\s\S]*?)<\/span>/)?.[1]
  const scriptClose = html.match(/var date\s*=\s*'([^']*)'/)?.[1]?.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3")
  const closeDate = isoDate(closeText) ?? isoDate(displayClose) ?? (scriptClose?.startsWith("1700") ? null : isoDate(scriptClose))
  const alwaysOpen = /채용시까지/.test(closeText) || /<span\b[^>]*>\s*채용시까지\s*<\/span>/.test(html) || (closeDate?.startsWith("2099") ?? false)
  const deadline = alwaysOpen ? null : closeDate
  const description = parseDescription(html)
  const frame = html.slice(html.indexOf('id="tab-panel01"')).match(/<iframe\b[^>]*\bsrc=["']([^"']+)["']/i)
  let descriptionUrl: string | null = null
  if (frame) {
    try {
      const url = new URL(decodeHtmlEntities(frame[1]), BASE_URL)
      if (["https:", "http:"].includes(url.protocol)) descriptionUrl = url.href
    } catch { /* Keep malformed iframe URLs out of the output. */ }
  }

  return {
    id,
    title,
    company: company ? clean(company[1]) || null : null,
    location: summary["지역"] ?? null,
    date: isoDate(registered ? clean(registered[1]) : null),
    deadline,
    alwaysOpen,
    url: canonicalUrl(id, infoTypeCd, infoTypeGroup),
    employmentType: summary["고용형태"] ?? null,
    workSchedule: summary["근무형태"] ?? null,
    experience: summary["경력"] ?? null,
    education: summary["학력"] ?? null,
    salary: summary["임금"] ?? null,
    source: sourceLabel(infoTypeCd),
    description,
    descriptionUrl,
    isActive: alwaysOpen || deadline === null || deadline >= koreaDate(0, now),
  }
}

// ---------------------------------------------------------------- table layout

/** Display width in a terminal: Hangul and other East Asian wide glyphs take two columns. */
export function displayWidth(s: string): number {
  let w = 0
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0
    w +=
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe4f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6)
        ? 2
        : 1
  }
  return w
}

/** Truncate to `width` display columns, then pad with spaces to exactly `width`. */
export function fitColumn(s: string, width: number): string {
  let out = ""
  let w = 0
  for (const ch of s) {
    const cw = displayWidth(ch)
    if (w + cw > width) break
    out += ch
    w += cw
  }
  return out + " ".repeat(width - w)
}
