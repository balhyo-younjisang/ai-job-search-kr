// Data source: JobKorea's public web pages. No authentication required.
//
// JobKorea's official job-listing API (JK_GI_XML_List.asp) is issued only to
// public institutions and schools, so this CLI reads the same pages a browser
// does, on paths robots.txt permits for "User-agent: *" (/Search/, /Recruit/).
//
// - Search is a Next.js server-rendered page. The organic result list is
//   embedded as a react-query cache entry (queryKey "JOB_LIST") inside the RSC
//   flight payload, so we parse structured JSON rather than card markup; only
//   the human-readable location chip is read from the card HTML.
// - Detail combines the posting page's JSON-LD JobPosting and summary table
//   with the description iframe, whose body is either text or a single image.

export const BASE_URL = "https://www.jobkorea.co.kr"
export const SEARCH_URL = `${BASE_URL}/Search/`
export const DETAIL_URL = `${BASE_URL}/Recruit/GI_Read`
export const DESCRIPTION_URL = `${BASE_URL}/Recruit/GI_Read_Comt_Ifrm`

// Names this project and gives a contact URL, so JobKorea's operators can tell
// who is asking and reach the maintainer. The product token matches no named
// group in JobKorea's robots.txt, so the "User-agent: *" rules apply. Never
// borrow another agent's token (e.g. Claude-User) or impersonate a browser,
// and keep words like "bot" out: WAFs match them regardless of robots.txt.
export const USER_AGENT =
  "Mozilla/5.0 (compatible; ai-job-search-kr/1.0; jobkorea-search; +https://github.com/balhyo-younjisang/ai-job-search-kr)"

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
  areaCodes: string[]
  date: string | null
  deadline: string | null
  alwaysOpen: boolean
  career: string | null
  education: string | null
  jobCategory: string | null
  url: string
}

export interface SearchPage {
  results: JobCard[]
  total: number | null
  totalPages: number | null
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
  workHours: string | null
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

/** HTML comments, removed whole: a comment can hold tags, which a tag regex would cut in half. */
function stripComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, " ")
}

function stripTags(html: string): string {
  return stripComments(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

export function clean(html: string): string {
  // Decode first, then collapse: &nbsp; becomes a space that must collapse too.
  return decodeHtmlEntities(stripTags(html)).replace(/\s+/g, " ").trim()
}

/** Absolute https URL for a JobKorea link: protocol-relative and root-relative forms included. */
export function absoluteUrl(src: string): string {
  const s = decodeHtmlEntities(src.trim())
  if (s.startsWith("//")) return `https:${s}`
  if (s.startsWith("/")) return `${BASE_URL}${s}`
  return s.replace(/^http:\/\//i, "https://")
}

/** The canonical posting URL, without the tracking parameters search links carry. */
export function canonicalUrl(id: string): string {
  return `${DETAIL_URL}/${id}`
}

/**
 * Concatenate the RSC flight chunks a Next.js page streams through
 * `self.__next_f.push([1,"..."])`. Each chunk is a JSON string literal, and a
 * logical record may be split across chunks, so decode and join them all
 * before looking for anything. An undecodable chunk is skipped rather than
 * failing the page.
 */
export function extractRscPayload(html: string): string {
  const parts: string[] = []
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try {
      parts.push(JSON.parse(m[1]) as string)
    } catch {
      // skip a malformed chunk
    }
  }
  return parts.join("")
}

/**
 * Return the JSON object text that starts at `start` (which must be a "{"),
 * matching braces while skipping over string contents. Null if unbalanced.
 */
export function extractJsonObject(text: string, start: number): string | null {
  if (text[start] !== "{") return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (c === "\\") escaped = true
      else if (c === '"') inString = false
    } else if (c === '"') {
      inString = true
    } else if (c === "{") {
      depth++
    } else if (c === "}") {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

interface RawJob {
  id?: unknown
  title?: unknown
  createdAt?: unknown
  companyName?: unknown
  postingCompanyName?: unknown
  applicationPeriod?: { start?: unknown; end?: unknown } | null
  careerType?: unknown
  careerRange?: unknown
  educationCode?: unknown
  areaCodeList?: unknown
  jobClassificationOrIndustry?: unknown
}

interface RawJobList {
  content: RawJob[]
  totalElements: number | null
  totalPages: number | null
}

/**
 * Find the organic result list in the RSC payload: the dehydrated react-query
 * entry whose queryKey starts with "JOB_LIST". The page carries other lists
 * too (a 3-item premium block, company results), which this deliberately
 * ignores. Returns null when no JOB_LIST entry exists - a zero-result search
 * still has one with empty content, so null means the page changed shape.
 */
export function parseJobList(payload: string): RawJobList | null {
  const key = /"queryKey"\s*:\s*\[\s*"JOB_LIST"/.exec(payload)
  if (!key) return null
  // The query object opens with its dehydratedAt field; take the last one
  // before the key, i.e. the object that key belongs to.
  let start = -1
  const open = /\{\s*"dehydratedAt"\s*:/g
  let m: RegExpExecArray | null
  while ((m = open.exec(payload)) !== null && m.index < key.index) start = m.index
  if (start === -1) return null
  const text = extractJsonObject(payload, start)
  if (!text) return null
  let query: { state?: { data?: Record<string, unknown> } }
  try {
    query = JSON.parse(text)
  } catch {
    return null
  }
  const data = query.state?.data
  if (!data || !Array.isArray(data.content)) return null
  return {
    content: data.content as RawJob[],
    totalElements: typeof data.totalElements === "number" ? data.totalElements : null,
    totalPages: typeof data.totalPages === "number" ? data.totalPages : null,
  }
}

interface CardInfo {
  location: string | null
  jobCategory: string | null
}

/**
 * Read each result card's gray chips (location first, job category second),
 * keyed by posting id. Cards are split on their component marker and parsed
 * independently, so one malformed card cannot break the rest. When an id
 * appears twice (an ad slot repeating an organic result) the first wins.
 */
export function parseCardChips(html: string): Map<string, CardInfo> {
  const out = new Map<string, CardInfo>()
  for (const chunk of html.split('data-sentry-component="CardJob"').slice(1)) {
    const id = chunk.match(/\/Recruit\/GI_Read\/(\d+)/)?.[1]
    if (!id || out.has(id)) continue
    const chips: string[] = []
    const re = /data-sentry-component="GrayChip"[\s\S]*?<span class="truncate[^"]*">([\s\S]*?)<\/span>/g
    let m: RegExpExecArray | null
    while ((m = re.exec(chunk)) !== null) chips.push(clean(m[1]))
    out.set(id, { location: chips[0] || null, jobCategory: chips[1] || null })
  }
  return out
}

/** Career label, matching the wording JobKorea's own frontend renders. */
export function careerLabel(type: unknown, range: unknown): string | null {
  switch (String(type ?? "")) {
    case "1":
      return "신입"
    case "2": {
      const years = typeof range === "number" ? range : Number(range)
      return Number.isInteger(years) && years > 0 && years !== 100 ? `경력 ${years}년↑` : "경력"
    }
    case "3":
      return "신입·경력"
    case "4":
      return "경력무관"
    default:
      return null
  }
}

/**
 * Minimum-education label, mirroring JobKorea's frontend: codes 3-7 name a
 * minimum, and every other code (0, and 255 as seen live) renders as
 * 학력무관. A missing code stays null.
 */
export function educationLabel(code: unknown): string | null {
  if (code === null || code === undefined || String(code).trim() === "") return null
  const labels: Record<string, string> = {
    "3": "고졸↑",
    "4": "초대졸↑",
    "5": "대졸↑",
    "6": "석사↑",
    "7": "박사↑",
  }
  return labels[String(code).trim()] ?? "학력무관"
}

/** YYYY-MM-DD from an ISO-ish timestamp, or null. */
export function isoDate(value: unknown): string | null {
  if (typeof value !== "string") return null
  const m = value.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

// JobKorea stores "open until filled" (상시채용) as a far-future end date
// (observed: 2070-01-01). Anything this far out is not a real deadline.
const ALWAYS_OPEN_YEAR = 2069

/** Split an application end date into a deadline and the always-open flag. */
export function deadlineOf(end: unknown): { deadline: string | null; alwaysOpen: boolean } {
  const date = isoDate(end)
  if (!date) return { deadline: null, alwaysOpen: false }
  if (Number(date.slice(0, 4)) >= ALWAYS_OPEN_YEAR) return { deadline: null, alwaysOpen: true }
  return { deadline: date, alwaysOpen: false }
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

/** Turn one raw JOB_LIST entry into a result, or null if it lacks an id/title. */
export function toJobCard(raw: RawJob, chips: CardInfo | undefined): JobCard | null {
  const id = typeof raw.id === "string" || typeof raw.id === "number" ? String(raw.id) : ""
  const title = str(raw.title)
  if (!/^\d+$/.test(id) || !title) return null
  const { deadline, alwaysOpen } = deadlineOf(raw.applicationPeriod?.end)
  const classification = str(raw.jobClassificationOrIndustry)
  return {
    id,
    title,
    company: str(raw.companyName) ?? str(raw.postingCompanyName),
    location: chips?.location ?? null,
    areaCodes: Array.isArray(raw.areaCodeList) ? raw.areaCodeList.filter((c): c is string => typeof c === "string") : [],
    date: isoDate(raw.createdAt),
    deadline,
    alwaysOpen,
    career: careerLabel(raw.careerType, raw.careerRange),
    education: educationLabel(raw.educationCode),
    jobCategory:
      chips?.jobCategory ??
      (classification ? classification.split(",").map((s) => s.trim()).filter(Boolean).join(", ") || null : null),
    url: canonicalUrl(id),
  }
}

/** Parse a search results page. Throws if the organic list cannot be found. */
export function parseSearchPage(html: string): SearchPage {
  const list = parseJobList(extractRscPayload(html))
  if (!list) {
    throw new PageShapeError(
      "Could not find the job list in the JobKorea search page - the page structure may have changed (see url-reference.md)",
    )
  }
  const chips = parseCardChips(html)
  const results: JobCard[] = []
  const seen = new Set<string>()
  for (const raw of list.content) {
    // Parse each entry independently: one odd record must not sink the page.
    let card: JobCard | null = null
    try {
      card = toJobCard(raw, chips.get(String(raw?.id ?? "")))
    } catch {
      card = null
    }
    if (!card || seen.has(card.id)) continue
    seen.add(card.id)
    results.push(card)
  }
  return { results, total: list.totalElements, totalPages: list.totalPages }
}

/**
 * Inner HTML of the <div> carrying the given id attribute, tracking <div>
 * depth so nested divs do not end the match early.
 */
export function extractDivById(html: string, id: string): string | null {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const open = new RegExp(`<div[^>]*\\bid="${escaped}"[^>]*>`, "i").exec(html)
  if (!open) return null
  let i = open.index + open[0].length
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
  return html.slice(open.index + open[0].length, i - 6)
}

/** The JobPosting object from the page's JSON-LD blocks, if any. */
export function parseJsonLd(html: string): Record<string, unknown> | null {
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try {
      const value = JSON.parse(m[1])
      const items = Array.isArray(value) ? value : [value]
      for (const item of items) {
        if (item && typeof item === "object" && item["@type"] === "JobPosting") return item
      }
    } catch {
      // ignore an unparseable block and keep looking
    }
  }
  return null
}

/**
 * The posting page's 모집요강 summary as label -> value (e.g. 고용형태, 급여,
 * 근무시간, 근무지주소). Each RecruitmentItem row is read up to the next
 * component marker; the "지도보기" map link is dropped from values.
 */
export function parseSummaryTable(html: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of html.split('data-sentry-component="RecruitmentItem"').slice(1)) {
    // The marker is an attribute, so the next component's opening tag starts
    // before it - including the next RecruitmentItem, whose tag the split
    // leaves dangling at the end of this part. Cut at that tag's "<" and drop
    // any unterminated tag, or its class list leaks into the value.
    const marker = part.indexOf("data-sentry-component=")
    const end = marker === -1 ? -1 : part.lastIndexOf("<", marker)
    const row = (end === -1 ? part : part.slice(0, end)).replace(/<[^>]*$/, "")
    const label = row.match(/<span class="min-w-\[80px\]">([\s\S]*?)<\/span>/)
    if (!label) continue
    const key = clean(label[1])
    const value = clean(row.slice((label.index ?? 0) + label[0].length).replace(/<!-- -->/g, ""))
      .replace(/\s*지도보기\s*$/, "")
      .trim()
    if (key && value && !(key in out)) out[key] = value
  }
  return out
}

/**
 * The description iframe body: readable text (paragraph and list breaks kept)
 * plus the URLs of any images in it. Many postings are a single image with no
 * text at all, in which case `text` is null and `images` carries the posting.
 */
export function parseDescription(html: string): { text: string | null; images: string[] } {
  // Drop comments before finding the block: agency templates leave commented-out
  // markup (`<!-- <p ...> / 이메일 ... -->`, `<!-- <div> ... -->`) that would leak
  // into the text and throw off the <div> depth count.
  const block = extractDivById(stripComments(html), "detail-content")
  if (block === null) return { text: null, images: [] }
  const body = block
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "")
    // The template's 입사 지원하기 buttons are page chrome, not posting text.
    .replace(/<a\b[^>]*\bclass="[^"]*\bdetBtn\b[^"]*"[^>]*>[\s\S]*?<\/a>/gi, " ")

  const images: string[] = []
  const imgRe = /<img\b[^>]*\bsrc="([^"]+)"/gi
  let m: RegExpExecArray | null
  while ((m = imgRe.exec(body)) !== null) {
    const url = absoluteUrl(m[1])
    if (!images.includes(url)) images.push(url)
  }

  const withBreaks = body
    .replace(/\s+/g, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d|tr|table)>/gi, "\n")
  // Clean each rendered line separately: clean() collapses whitespace, so
  // applying it to the whole description would erase these boundaries.
  const text = withBreaks.split("\n").map(clean).filter(Boolean).join("\n").trim()
  return { text: text || null, images }
}

/**
 * Whether the posting page lists its deadline (마감일) as 상시채용 - open until
 * filled. JSON-LD cannot say this (it gives such postings a validThrough a
 * year out), so the rendered label is the authority.
 */
export function pageSaysAlwaysOpen(html: string): boolean {
  const text = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "").replace(/<[^>]+>/g, " ")
  return /마감일\s+상시채용/.test(text.replace(/\s+/g, " "))
}

/**
 * Whether a posting is still accepting applications, judged by its JSON-LD
 * validThrough. JobKorea writes it without an offset (e.g. "2026-11-16T23:59"),
 * which is Korea time. A missing or unparseable value counts as active: absent
 * evidence of closing is not proof of closing.
 */
export function isStillActive(validThrough: unknown, now: Date = new Date()): boolean {
  if (typeof validThrough !== "string" || !validThrough.trim()) return true
  let value = validThrough.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) value += "T23:59:59"
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(value)) value += "+09:00"
  const end = new Date(value)
  return Number.isNaN(end.getTime()) ? true : end.getTime() >= now.getTime()
}

/** Today's date in Korea (UTC+9) as YYYY-MM-DD, shifted back by `daysAgo`. */
export function koreaDate(daysAgo = 0, now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + 9 * 3600 * 1000 - daysAgo * 86400 * 1000)
  return shifted.toISOString().slice(0, 10)
}

/**
 * JobKorea's posting-date filter (`period`) offers fixed buckets: 2 = today,
 * 3 = last 3 days, 4 = last week, 5 = last month. Pick the smallest bucket that
 * covers `days`; the caller trims the remainder client-side. Null = no filter.
 */
export function periodCode(days: number): string | null {
  if (days <= 1) return "2"
  if (days <= 3) return "3"
  if (days <= 7) return "4"
  if (days <= 31) return "5"
  return null
}

/** Career filter values JobKorea's search accepts as `careerType`. */
export const CAREER_CODES: Record<string, string> = {
  new: "1",
  experienced: "2",
}

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
