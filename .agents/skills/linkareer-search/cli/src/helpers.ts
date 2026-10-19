// Data source: Linkareer's public GraphQL API (search) and public posting
// pages (detail). No authentication required.
//
// linkareer.com's robots.txt allows "User-agent: *" everywhere except a few
// /stem/learn/ paths, and api.linkareer.com publishes no robots.txt (404).
// Linkareer has no official or partner API.
//
// - Search sends the same `activities` query the site's own list page runs.
//   Field names come only from the site's Apollo cache; the schema is not
//   introspected (introspection is disabled anyway). A validation error means
//   Linkareer changed the schema, and is reported as PARSE_FAILED.
// - Detail reads the server-rendered posting page: the Apollo cache in
//   __NEXT_DATA__ plus the JobPosting JSON-LD.

import { REGIONS, resolveRegion } from "./regions.js"

export const BASE_URL = "https://linkareer.com"
export const GRAPHQL_URL = "https://api.linkareer.com/graphql"
export const DETAIL_URL = `${BASE_URL}/activity`

// Linkareer activity type for job postings (채용). Interns are included;
// contests (공모전), extracurriculars (대외활동, 1) and education (교육, 6) are not.
export const RECRUIT_TYPE_ID = 5

// Names this project and gives a contact URL, so Linkareer's operators can
// tell who is asking and reach the maintainer. The product token matches no
// named group in Linkareer's robots.txt, so the "User-agent: *" rules apply.
// Never borrow another agent's token or impersonate a browser, and keep words
// like "bot" out: WAFs match them regardless of robots.txt.
export const USER_AGENT =
  "Mozilla/5.0 (compatible; ai-job-search-kr/1.0; linkareer-search; +https://github.com/balhyo-younjisang/ai-job-search-kr)"

/** The response loaded but no longer has the shape the parsers expect. */
export class PageShapeError extends Error {}

/** A posting that exists but is not a job posting (대외활동, 교육, ...). */
export class UnsupportedTypeError extends Error {}

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

async function withBackoff(request: () => Promise<Response>): Promise<Response> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await request()
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    return response
  }
  throw new Error("Request failed after max retries")
}

/**
 * POST a GraphQL query with exponential backoff on 429/5xx. A validation
 * error (HTTP 400, or GRAPHQL_VALIDATION_FAILED in a 200) means the schema
 * moved under the query, so it throws PageShapeError. No Origin or Referer
 * is sent: the API answers without them, and the CLI does not pose as the site.
 */
export async function gqlFetch<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await withBackoff(() =>
    fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15000),
    }),
  )
  const text = await response.text()
  let body: { data?: T; errors?: Array<{ message?: string; extensions?: { code?: string } }> }
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`Request failed: ${response.status} ${response.statusText} (non-JSON response)`)
  }
  const errors = body.errors ?? []
  if (errors.some((e) => e.extensions?.code === "GRAPHQL_VALIDATION_FAILED")) {
    throw new PageShapeError(
      `Linkareer rejected the search query (${errors[0]?.message ?? "validation failed"}) - the API schema may have changed (see url-reference.md)`,
    )
  }
  if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
  if (errors.length > 0 && !body.data) throw new Error(`Linkareer API error: ${errors[0]?.message ?? "unknown"}`)
  if (!body.data) throw new PageShapeError("Linkareer API returned no data (see url-reference.md)")
  return body.data
}

/**
 * Fetch a posting page without following redirects. A missing posting
 * answers 301/302 to the home page, which would otherwise come back as a
 * 200 "success"; any 3xx or 404 returns "".
 */
export async function htmlFetch(url: string): Promise<string> {
  const response = await withBackoff(() =>
    fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    }),
  )
  if (response.status === 404 || (response.status >= 300 && response.status < 400)) return ""
  if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
  return response.text()
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

/** Absolute https URL for an image source: protocol-relative and root-relative forms included. */
export function absoluteUrl(src: string): string {
  const s = decodeHtmlEntities(src.trim())
  if (s.startsWith("//")) return `https:${s}`
  if (s.startsWith("/")) return `${BASE_URL}${s}`
  return s.replace(/^http:\/\//i, "https://")
}

/** The canonical posting URL. */
export function canonicalUrl(id: string): string {
  return `${DETAIL_URL}/${id}`
}

/**
 * A posting body (HTML from the site's editor) as readable text with
 * paragraph and list breaks kept, plus the URLs of any images in it.
 * Postings often carry part or all of the description as images.
 */
export function parseDescription(html: string | null | undefined): { text: string | null; images: string[] } {
  if (!html) return { text: null, images: [] }
  const body = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "").replace(/<!--[\s\S]*?-->/g, "")
  const images: string[] = []
  for (const m of body.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)) {
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

// ---------------------------------------------------------------- dates (KST)

/** Today's date in Korea (UTC+9) as YYYY-MM-DD, shifted back by `daysAgo`. */
export function koreaDate(daysAgo = 0, now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + 9 * 3600 * 1000 - daysAgo * 86400 * 1000)
  return shifted.toISOString().slice(0, 10)
}

/** An epoch-milliseconds timestamp as a Korea-time date, or null. */
export function kstDate(ms: unknown): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null
  return new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

export type RecruitType = "NORMAL" | "ASAP" | "ALWAYS"

/**
 * The application deadline. NORMAL postings close at recruitCloseAt. ASAP
 * (채용시 마감) and ALWAYS (상시채용) postings carry an automatic expiry 90
 * days after opening in recruitCloseAt - not a deadline the employer set, so
 * it is not reported as one.
 */
export function deadlineOf(recruitType: unknown, recruitCloseAt: unknown): { deadline: string | null; alwaysOpen: boolean } {
  if (recruitType === "ASAP" || recruitType === "ALWAYS") return { deadline: null, alwaysOpen: true }
  if (recruitType === "NORMAL") return { deadline: kstDate(recruitCloseAt), alwaysOpen: false }
  return { deadline: null, alwaysOpen: false }
}

export const RECRUIT_TYPE_LABELS: Record<string, string> = {
  ASAP: "채용시 마감",
  ALWAYS: "상시채용",
}

/**
 * Whether the posting is still taking applications. Linkareer keeps
 * `status: "OPEN"` after closing, so the close time is the signal - for ASAP
 * and ALWAYS postings that is the automatic expiry, after which they are gone
 * too. A missing close time counts as active.
 */
export function isStillActive(recruitCloseAt: unknown, now: Date = new Date()): boolean {
  return typeof recruitCloseAt === "number" ? recruitCloseAt >= now.getTime() : true
}

// ---------------------------------------------------------------- labels

export const JOB_TYPES: Record<string, string> = {
  new: "NEW",
  experienced: "EXPERIENCED",
  intern: "INTERN",
  contract: "CONTRACT",
}

const JOB_TYPE_LABELS: Record<string, string> = {
  NEW: "신입",
  EXPERIENCED: "경력",
  INTERN: "인턴",
  CONTRACT: "계약직",
}

export function jobTypeLabels(values: unknown): string[] {
  return Array.isArray(values) ? values.filter((v): v is string => typeof v === "string").map((v) => JOB_TYPE_LABELS[v] ?? v) : []
}

// Only values observed on live postings are labelled; any other enum is
// passed through as-is rather than guessed.
const EDUCATION_LABELS: Record<string, string> = {
  NO_LIMIT: "학력무관",
  COLLEGE_GRADUATE_2_3_YEARS: "초대졸 이상",
  COLLEGE_GRADUATE_4_YEARS: "대졸 이상",
}

export function educationLabel(value: unknown): string | null {
  return typeof value === "string" && value ? EDUCATION_LABELS[value] ?? value : null
}

// ---------------------------------------------------------------- search

export const SEARCH_QUERY = `query SearchRecruit($filterBy: ActivityFilter, $pagination: Pagination, $orderBy: ActivityOrder) {
  activities(filterBy: $filterBy, pagination: $pagination, orderBy: $orderBy) {
    totalCount
    nodes {
      id title organizationName activityTypeID createdAt recruitStartAt recruitCloseAt recruitType jobTypes
      regions { id name }
      regionDistricts { name region { name } }
      addresses { sido sigungu }
      categories { id name }
    }
  }
}`

interface Named {
  name?: unknown
}

export interface ActivityNode {
  id?: unknown
  title?: unknown
  organizationName?: unknown
  activityTypeID?: unknown
  createdAt?: unknown
  recruitStartAt?: unknown
  recruitCloseAt?: unknown
  recruitType?: unknown
  jobTypes?: unknown
  regions?: Named[] | null
  regionDistricts?: Array<{ name?: unknown; region?: Named | null }> | null
  addresses?: Array<{ sido?: unknown; sigungu?: unknown; address?: unknown }> | null
  categories?: Named[] | null
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  recruitStart: string | null
  deadline: string | null
  alwaysOpen: boolean
  recruitType: string | null
  jobTypes: string[]
  jobCategory: string | null
  url: string
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function names(list: Named[] | null | undefined): string[] {
  return (list ?? []).map((x) => str(x?.name)).filter((x): x is string => x !== null)
}

/** "서울 중구", or "서울 중구 외 2" for several sites; the province alone when no district is set. */
export function locationOf(node: ActivityNode): string | null {
  const sites: string[] = []
  for (const d of node.regionDistricts ?? []) {
    const label = [str(d?.region?.name), str(d?.name)].filter(Boolean).join(" ")
    if (label && !sites.includes(label)) sites.push(label)
  }
  if (sites.length === 0) {
    for (const r of names(node.regions)) if (!sites.includes(r)) sites.push(r)
  }
  if (sites.length === 0) return null
  return sites.length === 1 ? sites[0] : `${sites[0]} 외 ${sites.length - 1}`
}

/** Districts a posting names, for filtering on "서울 강남구"-style locations. */
export function districtsOf(node: ActivityNode): string[] {
  const out = (node.regionDistricts ?? []).map((d) => str(d?.name)).filter((x): x is string => x !== null)
  for (const a of node.addresses ?? []) {
    const s = str(a?.sigungu)
    if (s) out.push(s)
  }
  return out
}

/** One search node as a result card, or null if it lacks an id or title. */
export function toJobCard(node: ActivityNode): JobCard | null {
  const id = typeof node.id === "string" || typeof node.id === "number" ? String(node.id) : ""
  const title = str(node.title)
  if (!/^\d+$/.test(id) || !title) return null
  const { deadline, alwaysOpen } = deadlineOf(node.recruitType, node.recruitCloseAt)
  const categories = names(node.categories)
  return {
    id,
    title,
    company: str(node.organizationName),
    location: locationOf(node),
    date: kstDate(node.createdAt),
    recruitStart: kstDate(node.recruitStartAt),
    deadline,
    alwaysOpen,
    recruitType: str(node.recruitType),
    jobTypes: jobTypeLabels(node.jobTypes),
    jobCategory: categories.length ? categories.join(", ") : null,
    url: canonicalUrl(id),
  }
}

export interface SearchData {
  activities?: { totalCount?: unknown; nodes?: unknown } | null
}

/** The `activities` result as cards (each node parsed independently) plus the raw nodes for district filtering. */
export function parseSearchResponse(data: SearchData): { cards: Array<{ card: JobCard; node: ActivityNode }>; total: number | null } {
  const activities = data.activities
  if (!activities || !Array.isArray(activities.nodes)) {
    throw new PageShapeError("Linkareer API returned no activities list (see url-reference.md)")
  }
  const cards: Array<{ card: JobCard; node: ActivityNode }> = []
  const seen = new Set<string>()
  for (const node of activities.nodes as ActivityNode[]) {
    let card: JobCard | null = null
    try {
      card = node ? toJobCard(node) : null
    } catch {
      card = null
    }
    if (!card || seen.has(card.id)) continue
    seen.add(card.id)
    cards.push({ card, node })
  }
  return { cards, total: typeof activities.totalCount === "number" ? activities.totalCount : null }
}

/**
 * Keep only postings registered within the window. Results are ordered by
 * registration time (RECENT, newest first), so this keeps the leading run of
 * in-window cards.
 */
export function trimToWindow(cards: JobCard[], cutoff: string): JobCard[] {
  return cards.filter((c) => c.date !== null && c.date >= cutoff)
}

export { REGIONS, resolveRegion }

// ---------------------------------------------------------------- detail

type ApolloState = Record<string, Record<string, unknown>>

/** The __NEXT_DATA__ JSON of a server-rendered page, or null. */
export function extractNextData(html: string): { page?: string; props?: { pageProps?: Record<string, unknown> } } | null {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/)
  if (!m) return null
  try {
    return JSON.parse(m[1])
  } catch {
    return null
  }
}

/** Resolve Apollo `{__ref}` links recursively (bounded depth, so cycles cannot loop). */
export function deref(state: ApolloState, value: unknown, depth = 0): unknown {
  if (depth > 6) return value
  if (Array.isArray(value)) return value.map((v) => deref(state, v, depth + 1))
  if (value && typeof value === "object") {
    const ref = (value as { __ref?: unknown }).__ref
    if (typeof ref === "string") return ref in state ? deref(state, state[ref], depth + 1) : null
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = deref(state, v, depth + 1)
    return out
  }
  return value
}

/** The JobPosting object from the page's JSON-LD blocks, if any (closed postings have none). */
export function parseJsonLd(html: string): Record<string, unknown> | null {
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const value = JSON.parse(m[1])
      for (const item of Array.isArray(value) ? value : [value]) {
        if (item && typeof item === "object" && item["@type"] === "JobPosting") return item
      }
    } catch {
      // ignore an unparseable block and keep looking
    }
  }
  return null
}

export interface JobDetail {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  recruitStart: string | null
  deadline: string | null
  alwaysOpen: boolean
  recruitType: string | null
  url: string
  jobTypes: string[]
  internTypes: string[]
  jobCategory: string | null
  education: string | null
  salary: string | null
  organizationType: string | null
  applyUrl: string | null
  applyMethod: string | null
  homepage: string | null
  description: string | null
  descriptionImages: string[]
  isActive: boolean
}

function salaryOf(a: Record<string, unknown>): string | null {
  if (a.isSalaryDecidedByCompanyPolicy === true) return "회사내규에 따름"
  if (a.isSalaryDecidedAfterInterview === true) return "면접 후 결정"
  const min = typeof a.minSalary === "number" ? a.minSalary : null
  const max = typeof a.maxSalary === "number" ? a.maxSalary : null
  if (min === null && max === null) return null
  const range = min !== null && max !== null && min !== max ? `${min}~${max}` : String(min ?? max)
  // salaryType is passed through (YEARLY seen live); units are not guessed.
  const type = str(a.salaryType)
  return type ? `${range} (${type})` : range
}

/**
 * Parse a posting page. Throws PageShapeError when the Apollo cache has no
 * entry for the id, and UnsupportedTypeError for an activity that is not a
 * job posting.
 */
export function parseDetailPage(html: string, id: string, now: Date = new Date()): JobDetail {
  const state = extractNextData(html)?.props?.pageProps?.__APOLLO_STATE__ as ApolloState | undefined
  const raw = state?.[`Activity:${id}`]
  if (!state || !raw) {
    throw new PageShapeError("The posting page has no activity data - the page structure may have changed (see url-reference.md)")
  }
  const a = deref(state, raw) as Record<string, unknown>
  if (Number(a.activityTypeID) !== RECRUIT_TYPE_ID) {
    throw new UnsupportedTypeError(
      `Linkareer activity ${id} is not a job posting (activity type ${String(a.activityTypeID)}) - this skill covers 채용 only`,
    )
  }
  const title = str(a.title)
  if (!title) throw new PageShapeError("The posting page has no title (see url-reference.md)")

  const node = a as ActivityNode
  const addresses = (a.addresses as Array<{ address?: unknown }> | null) ?? []
  const fullAddress = addresses.map((x) => str(x?.address)).filter(Boolean)
  const { deadline, alwaysOpen } = deadlineOf(a.recruitType, a.recruitCloseAt)
  const detailText = a.detailText as { text?: unknown } | null
  const { text, images } = parseDescription(typeof detailText?.text === "string" ? detailText.text : null)
  const categories = names(a.categories as Named[] | null)
  const ld = parseJsonLd(html)

  return {
    id,
    title,
    company: str(a.organizationName),
    location: fullAddress.length ? fullAddress.join(" / ") : locationOf(node),
    date: kstDate(a.createdAt) ?? (typeof ld?.datePosted === "string" ? ld.datePosted.slice(0, 10) : null),
    recruitStart: kstDate(a.recruitStartAt),
    deadline,
    alwaysOpen,
    recruitType: str(a.recruitType),
    url: canonicalUrl(id),
    jobTypes: jobTypeLabels(a.jobTypes),
    internTypes: names(a.distinctInternTypes as Named[] | null),
    jobCategory: categories.length ? categories.join(", ") : null,
    education: educationLabel(a.education),
    salary: salaryOf(a),
    organizationType: str(a.organizationType),
    applyUrl: str(a.applyDetail),
    applyMethod: names(a.applyTypes as Named[] | null).join(", ") || null,
    homepage: str(a.homepageURL),
    description: text,
    descriptionImages: images,
    isActive: isStillActive(a.recruitCloseAt, now),
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
