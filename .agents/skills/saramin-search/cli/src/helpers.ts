// Data source: Saramin's public web pages. No authentication required.
//
// Saramin's official API (oapi.saramin.co.kr) needs an approved access key, so
// this CLI reads the pages a browser does, on paths robots.txt permits for
// "User-agent: *". Paths the CLI must never request (robots.txt Disallow):
// /zf_user/recruit/view/, /recruit/recruit_view.php, /zf_user/jobs/view/etc.
//
// - Search is server-rendered HTML. Result cards sit inside
//   <div id="recruit_info_list">; a zero-result page has no such container
//   but still renders "popular postings" cards elsewhere, which are not results.
// - Detail combines the print view (/zf_user/jobs/view?rec_idx=..&isPrint=yes,
//   server-rendered summary and dates) with the description page
//   (/zf_user/jobs/relay/view-detail), whose body mixes text and images.

import { DISTRICTS, PROVINCES } from "./areas.js"

export const BASE_URL = "https://www.saramin.co.kr"
export const SEARCH_URL = `${BASE_URL}/zf_user/search/recruit`
export const PRINT_VIEW_URL = `${BASE_URL}/zf_user/jobs/view`
export const DESCRIPTION_URL = `${BASE_URL}/zf_user/jobs/relay/view-detail`
export const POSTING_URL = `${BASE_URL}/zf_user/jobs/relay/view`

// Names this project and gives a contact URL, so Saramin's operators can tell
// who is asking and reach the maintainer. The product token matches no named
// group in Saramin's robots.txt, so the "User-agent: *" rules apply. Never
// borrow another agent's token or impersonate a browser, and keep words like
// "bot" out: WAFs match them regardless of robots.txt.
export const USER_AGENT =
  "Mozilla/5.0 (compatible; ai-job-search-kr/1.0; saramin-search; +https://github.com/balhyo-younjisang/ai-job-search-kr)"

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
      signal: AbortSignal.timeout(15000),
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

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  modifiedDate: string | null
  deadline: string | null
  alwaysOpen: boolean
  career: string | null
  education: string | null
  employmentType: string | null
  jobCategory: string | null
  url: string
}

export interface SearchPage {
  results: JobCard[]
  total: number | null
}

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
  experience: string | null
  education: string | null
  salary: string | null
  position: string | null
  description: string | null
  descriptionImages: string[]
  isActive: boolean
}

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

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

export function clean(html: string): string {
  // Decode first, then collapse: &nbsp; becomes a space that must collapse too.
  return decodeHtmlEntities(stripTags(html)).replace(/\s+/g, " ").trim()
}

/** Absolute https URL for a Saramin link: protocol-relative and root-relative forms included. */
export function absoluteUrl(src: string): string {
  const s = decodeHtmlEntities(src.trim())
  if (s.startsWith("//")) return `https:${s}`
  if (s.startsWith("/")) return `${BASE_URL}${s}`
  return s.replace(/^http:\/\//i, "https://")
}

/** The canonical posting URL, without the tracking parameters search links carry. */
export function canonicalUrl(id: string): string {
  return `${POSTING_URL}?rec_idx=${id}`
}

/**
 * The whole <div> element starting at `start` (which must point at "<div"),
 * tracking <div> depth so nested divs do not end the match early. Null if the
 * element never closes.
 */
export function divAt(html: string, start: number): string | null {
  const openEnd = html.indexOf(">", start)
  if (openEnd === -1) return null
  let i = openEnd + 1
  let depth = 1
  while (depth > 0 && i < html.length) {
    const nextOpen = html.indexOf("<div", i)
    const nextClose = html.indexOf("</div>", i)
    if (nextClose === -1) return null
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++
      i = nextOpen + 4
    } else {
      depth--
      i = nextClose + 6
    }
  }
  return html.slice(start, i)
}

/** Inner HTML of the first <div> whose opening tag matches `openTag`. */
export function divContent(html: string, openTag: RegExp): string | null {
  const m = openTag.exec(html)
  if (!m) return null
  const whole = divAt(html, m.index)
  if (!whole) return null
  return whole.slice(whole.indexOf(">") + 1, -"</div>".length)
}

// ---------------------------------------------------------------- dates (KST)

/** Today's date in Korea (UTC+9) as YYYY-MM-DD, shifted back by `daysAgo`. */
export function koreaDate(daysAgo = 0, now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + 9 * 3600 * 1000 - daysAgo * 86400 * 1000)
  return shifted.toISOString().slice(0, 10)
}

/** "26/10/19" (YY/MM/DD, as on search cards) -> "2026-10-19". */
export function shortDate(value: string): string | null {
  const m = value.match(/(\d{2})\/(\d{2})\/(\d{2})/)
  return m ? `20${m[1]}-${m[2]}-${m[3]}` : null
}

/** "2026.10.21 23:59" (detail page) -> "2026-10-21". */
export function dottedDate(value: string): string | null {
  const m = value.match(/(\d{4})\.(\d{2})\.(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/**
 * A search card's deadline label as a date. Saramin prints "~ 11/18(수)"
 * without a year, "오늘마감" / "내일마감" relative to today, and "채용시" or
 * "상시채용" for postings open until filled. A listed posting has not closed,
 * so a month/day already behind today belongs to next year.
 */
export function parseDeadlineLabel(
  label: string,
  now: Date = new Date(),
): { deadline: string | null; alwaysOpen: boolean } {
  const text = label.replace(/\s+/g, "")
  if (/채용시|상시/.test(text)) return { deadline: null, alwaysOpen: true }
  if (text.includes("오늘마감")) return { deadline: koreaDate(0, now), alwaysOpen: false }
  if (text.includes("내일마감")) return { deadline: koreaDate(-1, now), alwaysOpen: false }
  const m = text.match(/(\d{1,2})\/(\d{1,2})/)
  if (!m) return { deadline: null, alwaysOpen: false }
  const today = koreaDate(0, now)
  const mmdd = `${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`
  let year = Number(today.slice(0, 4))
  if (`${year}-${mmdd}` < today) year++
  return { deadline: `${year}-${mmdd}`, alwaysOpen: false }
}

// ---------------------------------------------------------------- search

const CAREER = /신입|경력/
const EDUCATION = /학력무관|졸|석사|박사/

/**
 * Parse one result card. Fields are read from fixed anchors; the condition
 * spans (location, career, education, employment type) are classified by
 * content because Saramin omits the ones a posting leaves blank.
 */
export function parseCard(card: string, now: Date = new Date()): JobCard | null {
  const id = card.match(/class="item_recruit[^"]*"\s+value="(\d+)"/)?.[1]
  if (!id) return null
  const titleTag = card.match(/<h2 class="job_tit">[\s\S]*?<a\b[^>]*\btitle="([^"]*)"/)
  const titleText = card.match(/<h2 class="job_tit">([\s\S]*?)<\/h2>/)
  const title = titleTag ? clean(titleTag[1]) : titleText ? clean(titleText[1]) : ""
  if (!title) return null

  const company = card.match(/<strong class="corp_name">([\s\S]*?)<\/strong>/)
  const conditionBlock = card.match(/<div class="job_condition">([\s\S]*?)<\/div>/)?.[1] ?? ""
  const spans = [...conditionBlock.matchAll(/<span>([\s\S]*?)<\/span>/g)]
    .map((m) => clean(m[1]).replace(/\s+,/g, ","))
    .filter(Boolean)
  let location: string | null = null
  let career: string | null = null
  let education: string | null = null
  let employmentType: string | null = null
  spans.forEach((text, i) => {
    if (i === 0 && conditionBlock.includes("area-recruit")) location = text
    else if (!career && CAREER.test(text)) career = text
    else if (!education && EDUCATION.test(text)) education = text
    else if (!employmentType) employmentType = text
  })

  const sectorBlock = card.match(/<div class="job_sector">([\s\S]*?)<\/div>/)?.[1] ?? ""
  const categories = [...sectorBlock.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].map((m) => clean(m[1])).filter(Boolean)
  const day = clean(sectorBlock.match(/<span class="job_day">([\s\S]*?)<\/span>/)?.[1] ?? "")
  const deadlineLabel = clean(card.match(/<div class="job_date">\s*<span class="date">([\s\S]*?)<\/span>/)?.[1] ?? "")
  const { deadline, alwaysOpen } = parseDeadlineLabel(deadlineLabel, now)

  return {
    id,
    title,
    company: company ? clean(company[1]) || null : null,
    location,
    date: day.startsWith("등록일") ? shortDate(day) : null,
    modifiedDate: day.startsWith("수정일") ? shortDate(day) : null,
    deadline,
    alwaysOpen,
    career,
    education,
    employmentType,
    jobCategory: categories.length ? categories.join(", ") : null,
    url: canonicalUrl(id),
  }
}

/**
 * Parse a search results page. Only cards inside #recruit_info_list are
 * results. A page without that list is either a genuine zero-result page
 * (it says so in .info_no_result) or a page whose shape changed (throws).
 */
export function parseSearchPage(html: string, now: Date = new Date()): SearchPage {
  const listAt = html.search(/<div id="recruit_info_list"/)
  if (listAt === -1) {
    if (html.includes('class="info_no_result"')) return { results: [], total: 0 }
    throw new PageShapeError(
      "Could not find the result list in the Saramin search page - the page structure may have changed (see url-reference.md)",
    )
  }
  const list = divAt(html, listAt) ?? html.slice(listAt)
  const results: JobCard[] = []
  const seen = new Set<string>()
  const starts = [...list.matchAll(/<div class="item_recruit[^"]*"\s+value="\d+"/g)].map((m) => m.index!)
  for (const start of starts) {
    // Parse each card independently: one odd card must not sink the page.
    let card: JobCard | null = null
    try {
      const chunk = divAt(list, start)
      card = chunk ? parseCard(chunk, now) : null
    } catch {
      card = null
    }
    if (!card || seen.has(card.id)) continue
    seen.add(card.id)
    results.push(card)
  }
  const total = html.match(/<span class="cnt_result">\s*총\s*([\d,]+)\s*건/)
  return { results, total: total ? Number(total[1].replace(/,/g, "")) : null }
}

// ---------------------------------------------------------------- location

export type LocationFilter =
  | { kind: "filter"; param: "loc_mcd" | "loc_cd"; code: string; label: string }
  | { kind: "keyword" }

/** A place name that matches districts in several provinces (e.g. 중구). */
export class AmbiguousLocationError extends Error {}

// Full province names minus their suffix (충청남도 -> 충청남) and Saramin's
// merged 전남광주 group.
const PROVINCE_ALIASES: Record<string, string> = {
  광주: "전남광주",
  전남: "전남광주",
  전라남: "전남광주",
  전라북: "전북",
  충청남: "충남",
  충청북: "충북",
  경상남: "경남",
  경상북: "경북",
}

function provinceCode(name: string): string | null {
  const bare = name.replace(/(특별자치시|특별자치도|특별시|광역시|도)$/, "")
  const target = PROVINCE_ALIASES[bare] ?? bare
  return PROVINCES.find(([, n]) => n === target)?.[0] ?? null
}

function provinceName(code: string): string {
  return PROVINCES.find(([c]) => c === code)?.[1] ?? code
}

function districtMatches(name: string, within?: string): Array<{ province: string; code: string; name: string }> {
  const out: Array<{ province: string; code: string; name: string }> = []
  for (const [province, districts] of Object.entries(DISTRICTS)) {
    if (within && province !== within) continue
    for (const [code, n] of districts) {
      // "성남" finds 성남시, "분당구" finds 성남시 분당구.
      if (n === name || n === `${name}시` || n === `${name}군` || n === `${name}구` || n.endsWith(` ${name}`)) {
        out.push({ province, code, name: n })
      }
    }
  }
  // An exact name beats suffix matches (성남시 over 성남시 분당구 etc.).
  const exact = out.filter((d) => d.name === name || d.name === `${name}시` || d.name === `${name}군` || d.name === `${name}구`)
  return exact.length ? exact : out
}

/**
 * Map a place name to Saramin's region filter: a province (서울, 경기도,
 * 부산광역시) -> loc_mcd; a district (강남구, 성남시 분당구, "부산 중구") ->
 * loc_cd. Names Saramin has no code for (판교, 테헤란로) fall back to the
 * keyword. A district name shared by several provinces throws so the user can
 * add the province rather than get a silently wrong region.
 */
export function resolveLocation(input: string): LocationFilter {
  const name = input.trim().replace(/\s+/g, " ")
  const province = provinceCode(name)
  if (province) return { kind: "filter", param: "loc_mcd", code: province, label: provinceName(province) }

  const [first, ...rest] = name.split(" ")
  const scoped = rest.length ? provinceCode(first) : null
  const candidates = scoped ? districtMatches(rest.join(" "), scoped) : districtMatches(name)
  if (candidates.length === 1) {
    const d = candidates[0]
    return { kind: "filter", param: "loc_cd", code: d.code, label: `${provinceName(d.province)} ${d.name}` }
  }
  if (candidates.length > 1) {
    const options = candidates.map((d) => `"${provinceName(d.province)} ${d.name}"`).join(", ")
    throw new AmbiguousLocationError(`"${name}" matches several regions - pick one: ${options}`)
  }
  return { kind: "keyword" }
}

// ---------------------------------------------------------------- detail

/**
 * The print view's 핵심 정보 block as label -> value (경력, 학력, 근무형태,
 * 급여, 직급/직책, 근무지역). A value's <strong> text wins when present; the
 * tooltip and map buttons inside a <dd> are dropped.
 */
export function parseSummary(html: string): Record<string, string> {
  const block = divContent(html, /<div class="jv_cont jv_summary">/)
  const out: Record<string, string> = {}
  if (!block) return out
  for (const m of block.matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)) {
    const key = clean(m[1])
    let dd = m[2]
    const strong = dd.match(/<strong>([\s\S]*?)<\/strong>/)
    if (strong) dd = strong[1]
    else dd = dd.replace(/<button\b[\s\S]*?<\/button>/g, "").replace(/<div class="toolTip[\s\S]*$/, "")
    const value = clean(dd)
    if (key && value && !(key in out)) out[key] = value
  }
  return out
}

/** The 접수기간 block: start/end dates and whether the posting is closed or open until filled. */
export function parsePeriod(html: string): {
  start: string | null
  end: string | null
  endTime: string | null
  closed: boolean
  alwaysOpen: boolean
} {
  const block = divContent(html, /<div class="jv_cont jv_howto">/) ?? ""
  const period: Record<string, string> = {}
  for (const m of block.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)) {
    period[clean(m[1])] = clean(m[2])
  }
  const endRaw = period["마감일"] ?? null
  return {
    start: period["시작일"] ? dottedDate(period["시작일"]) : null,
    end: endRaw ? dottedDate(endRaw) : null,
    endTime: endRaw,
    closed: /<p class="copy end">/.test(block) || /sri_btn_expired_apply/.test(html),
    alwaysOpen: /<p class="copy once">/.test(block),
  }
}

/** Company name from the header's company link (its title attribute, else its text). */
export function parseCompany(html: string): string | null {
  const tag = html.match(/<a\b[^>]*\bclass="company"[^>]*>([\s\S]*?)<\/a>/)
  if (!tag) return null
  const title = tag[0].match(/\btitle="([^"]*)"/)
  return clean(title ? title[1] : tag[1]) || null
}

/** The posting title from the header. */
export function parseTitle(html: string): string | null {
  const m = html.match(/<h1 class="tit_job">([\s\S]*?)<\/h1>/)
  return m ? clean(m[1]) || null : null
}

/**
 * The description page body: readable text (paragraph and list breaks kept)
 * plus the URLs of any images in it. Postings often carry part or all of the
 * description as images, so both are returned.
 */
export function parseDescription(html: string): { text: string | null; images: string[] } {
  const block = divContent(html, /<div class="user_content">/)
  if (block === null) return { text: null, images: [] }
  const body = block.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "").replace(/<!--[\s\S]*?-->/g, "")

  const images: string[] = []
  for (const m of body.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)) {
    const url = absoluteUrl(m[1])
    if (!images.includes(url)) images.push(url)
  }

  const withBreaks = body
    .replace(/\s+/g, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d|tr|table|dt|dd)>/gi, "\n")
  // Clean each rendered line separately: clean() collapses whitespace, so
  // applying it to the whole description would erase these boundaries.
  const text = withBreaks.split("\n").map(clean).filter(Boolean).join("\n").trim()
  return { text: text || null, images }
}

/**
 * Whether the deadline ("2026.10.21 23:59", Korea time) is still ahead.
 * A missing or unparseable value counts as active.
 */
export function isBeforeDeadline(endTime: string | null, now: Date = new Date()): boolean {
  if (!endTime) return true
  const m = endTime.match(/(\d{4})\.(\d{2})\.(\d{2})(?:\s+(\d{2}):(\d{2}))?/)
  if (!m) return true
  const end = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4] ?? "23"}:${m[5] ?? "59"}:59+09:00`)
  return Number.isNaN(end.getTime()) ? true : end.getTime() >= now.getTime()
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
