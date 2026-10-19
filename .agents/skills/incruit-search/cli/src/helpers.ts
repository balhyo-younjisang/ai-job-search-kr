// Incruit public pages. No authentication or runtime dependencies.
export const SEARCH_URL = "https://search.incruit.com/list/search.asp"
export const DETAIL_URL = "https://job.incruit.com/jobdb_info/jobpost.asp"
export const CONTENT_URL = "https://job.incruit.com/s_common/jobpost/jobpostcont.asp"
export const USER_AGENT = "Mozilla/5.0 (compatible; ai-job-search-kr/1.0; incruit-search; +https://github.com/balhyo-younjisang/ai-job-search-kr)"
export class PageShapeError extends Error {}
export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

/** Decode legacy HTML using HTTP charset, then meta charset, then EUC-KR. */
export async function decodeResponse(response: Response): Promise<string> {
  const bytes = new Uint8Array(await response.arrayBuffer())
  const header = response.headers.get("content-type") ?? ""
  const head = new TextDecoder("ascii").decode(bytes.slice(0, 4096))
  const charset = header.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]
    ?? head.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] ?? "euc-kr"
  return new TextDecoder(charset).decode(bytes)
}

/** Fetch only known endpoints, without following redirects to other paths or hosts. */
export async function htmlFetch(url: string): Promise<string> {
  const parsed = new URL(url)
  if (![SEARCH_URL, DETAIL_URL, CONTENT_URL].includes(parsed.origin + parsed.pathname)) {
    throw new Error("Unsupported Incruit endpoint")
  }
  let delay = 500
  for (let attempt = 0; attempt <= 6; attempt++) {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html", "Accept-Language": "ko-KR,ko;q=0.9" },
      redirect: "manual", signal: AbortSignal.timeout(20000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === 6) throw new Error(`Request failed: ${response.status}`)
      await response.body?.cancel()
      await new Promise((resolve) => setTimeout(resolve, delay + Math.floor(Math.random() * 500)))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404 || response.status === 410) return ""
    if (response.status >= 300 && response.status < 400 && parsed.origin + parsed.pathname === DETAIL_URL) {
      const target = new URL(response.headers.get("location") ?? "", url)
      if (target.origin === parsed.origin && target.pathname.toLowerCase() === "/jobdb_list/searchjob.asp" && target.searchParams.get("from") === "jobpostnone") return ""
    }
    if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    return decodeResponse(response)
  }
  throw new Error("Request failed after max retries")
}

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
export interface SearchPage { results: JobCard[]; total: number | null }
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
  description: string | null
  descriptionImages: string[]
  isActive: boolean
}

export function canonicalUrl(id: string): string { return `${DETAIL_URL}?job=${id}` }

/** Relative labels describe either registration or modification, never both. */
export function relativeDate(label: string, now: Date = new Date()): string | null {
  const text = label.replace(/\s+/g, "")
  const m = text.match(/(\d+)(일|시간|분)전/)
  if (m) {
    const ms = Number(m[1]) * (m[2] === "일" ? 86400000 : m[2] === "시간" ? 3600000 : 60000)
    return koreaDate(0, new Date(now.getTime() - ms))
  }
  if (/오늘|방금/.test(text)) return koreaDate(0, now)
  if (/어제/.test(text)) return koreaDate(1, now)
  return null
}

export function parseDeadlineLabel(label: string, now: Date = new Date()): { deadline: string | null; alwaysOpen: boolean } {
  if (/채용시|상시/.test(label)) return { deadline: null, alwaysOpen: true }
  const m = label.match(/~\s*(\d{1,2})[./](\d{1,2})/)
  if (!m) return { deadline: null, alwaysOpen: false }
  const today = koreaDate(0, now)
  const mmdd = `${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`
  // A live search deadline without a year rolls over at New Year.
  let year = Number(today.slice(0, 4))
  if (`${year}-${mmdd}` < today) year++
  return { deadline: `${year}-${mmdd}`, alwaysOpen: false }
}

const spanTexts = (html: string) => [...html.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)].map((m) => clean(m[1]))

export function parseSearchPage(html: string, now: Date = new Date()): SearchPage {
  const starts = [...html.matchAll(/<ul\b[^>]*\bclass="c_row"[^>]*\bjobno="(\d{13})"[^>]*>/g)]
  const totalText = html.match(/채용정보\s*(?:<[^>]+>\s*)*([\d,]+)\s*건/)
  const total = totalText ? Number(totalText[1].replace(/,/g, "")) : null
  if (!starts.length) {
    if (/검색\s*결과가?\s*없|검색된\s*(?:채용정보|결과)가?\s*없/.test(clean(html))) return { results: [], total: 0 }
    throw new PageShapeError("Incruit result cards not found (see url-reference.md)")
  }
  const results: JobCard[] = []
  const seen = new Set<string>()
  for (let i = 0; i < starts.length; i++) {
    const id = starts[i][1]
    const row = html.slice(starts[i].index!, starts[i + 1]?.index ?? html.indexOf('</ul>', starts[i].index!) + 5)
    const titleLink = row.match(/<a\b[^>]*href=["'][^"']*jobpost\.asp\?job=\d{13}[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)
    const title = titleLink ? clean(titleLink[1]) : ""
    if (!title || seen.has(id)) continue
    const company = row.match(/<a\b[^>]*class="cpname"[^>]*>([\s\S]*?)<\/a>/)
    const facts = spanTexts(divContent(row, /<div class="cl_md">/) ?? "")
    const last = divContent(row, /<div class="cell_last">/) ?? ""
    const labels = spanTexts(last)
    const timing = labels.find((v) => /등록|수정/.test(v)) ?? ""
    const deadline = parseDeadlineLabel(labels.find((v) => /~|채용시|상시/.test(v)) ?? "", now)
    const category = divContent(divContent(row, /<div class="cell_mid">/) ?? "", /<div class="cl_btm">/)
    seen.add(id)
    results.push({
      id, title, company: company ? clean(company[1]) || null : null,
      location: facts[0] || null, career: facts[1] || null, education: facts[2] || null,
      employmentType: facts[3] || null, jobCategory: category ? clean(category) || null : null,
      date: /등록/.test(timing) ? relativeDate(timing, now) : null,
      modifiedDate: /수정/.test(timing) ? relativeDate(timing, now) : null,
      ...deadline, url: canonicalUrl(id),
    })
  }
  if (!results.length) throw new PageShapeError("Incruit result rows could not be parsed (see url-reference.md)")
  return { results, total }
}

export function parseJsonLd(html: string): Record<string, unknown> | null {
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(m[1])
      const values = Array.isArray(parsed) ? parsed : [parsed, ...(parsed["@graph"] ?? [])]
      const job = values.find((v) => v?.["@type"] === "JobPosting")
      if (job) return job
    } catch { /* Other JSON-LD blocks need not contain posting data. */ }
  }
  return null
}

export function parseDescription(html: string): { text: string | null; images: string[] } {
  if (!html) return { text: null, images: [] }
  const body = divContent(html, /<div\b[^>]*id=["']content_job["'][^>]*>/i)
  if (body === null) throw new PageShapeError("Incruit description content_job container is missing")
  const content = body.replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, "").replace(/<!--[\s\S]*?-->/g, "")
  const images: string[] = []
  for (const m of content.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
    try {
      const url = new URL(decodeHtmlEntities(m[1]), CONTENT_URL)
      if (["http:", "https:"].includes(url.protocol) && !images.includes(url.href)) images.push(url.href)
    } catch { /* Ignore malformed image URLs. */ }
  }
  return { text: textLines(content) || null, images }
}

export function parseDetail(page: string, iframe: string, id: string, now: Date = new Date()): JobDetail {
  const closed = /<p\b[^>]*class="closed-title"[^>]*>\s*마감되었습니다\./.test(page)
  const ld = parseJsonLd(page) ?? (closed ? {
    title: page.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1],
    hiringOrganization: { name: clean(page.match(/<div class="top-cnt">\s*<em>\s*<a\b[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? "") },
  } : null)
  if (!ld) throw new PageShapeError("Incruit posting has no JobPosting data (see url-reference.md)")
  const identifier = ld.identifier as { value?: unknown } | undefined
  if (identifier?.value !== undefined && String(identifier.value) !== id) throw new PageShapeError("Incruit returned a different posting")
  const title = typeof ld.title === "string" ? clean(ld.title) : ""
  if (!title) throw new PageShapeError("Incruit posting title is missing")
  const summary = textLines(typeof ld.description === "string" ? ld.description : "")
  const fact = (label: string) => summary.split("\n").find((v) => v.startsWith(label + ":"))?.slice(label.length + 1).trim() || null
  const period = fact("접수기간") ?? ""
  const alwaysOpen = /상시|채용시/.test(period)
  const end = period.match(/~\s*(\d{4}[.-]\d{2}[.-]\d{2})/)
  const deadline = alwaysOpen ? null : isoDate(typeof ld.validThrough === "string" ? ld.validThrough : end?.[1])
  const organization = ld.hiringOrganization as { name?: string } | undefined
  const place = (Array.isArray(ld.jobLocation) ? ld.jobLocation[0] : ld.jobLocation) as { address?: { streetAddress?: string; addressRegion?: string; addressLocality?: string } } | undefined
  const address = place?.address
  const description = parseDescription(iframe)
  return {
    id, title, company: organization?.name ? clean(organization.name) : null,
    location: address?.streetAddress ?? ([address?.addressRegion, address?.addressLocality].filter(Boolean).join(" ") || null),
    date: isoDate(typeof ld.datePosted === "string" ? ld.datePosted : null), deadline, alwaysOpen,
    url: canonicalUrl(id), employmentType: fact("고용형태"), experience: fact("경력"), education: fact("학력"), salary: fact("급여"),
    description: description.text, descriptionImages: description.images,
    isActive: !closed && (deadline === null || deadline >= koreaDate(0, now)),
  }
}
