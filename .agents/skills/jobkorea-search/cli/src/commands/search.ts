import {
  CAREER_CODES,
  PageShapeError,
  SEARCH_URL,
  fitColumn,
  htmlFetch,
  koreaDate,
  parseSearchPage,
  periodCode,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query: string
  location?: string
  career?: string // "new" | "experienced"
  jobage?: number
  sort: "relevance" | "date"
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

export function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  // JobKorea ignores its own region parameter (`local`) on server-rendered
  // search results, but matches place names in the keyword precisely - so the
  // location rides along in the query text.
  params.set("stext", opts.location ? `${opts.query} ${opts.location}` : opts.query)
  params.set("tabType", "recruit")
  if (opts.career) params.set("careerType", CAREER_CODES[opts.career])
  const period = opts.jobage !== undefined ? periodCode(opts.jobage) : null
  if (period) params.set("period", period)
  if (opts.sort === "date") params.set("ord", "RegDtDesc")
  params.set("Page_No", String(opts.page))
  return `${SEARCH_URL}?${params.toString()}`
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const cols: Array<[string, number, (c: JobCard) => string]> = [
    ["ID", 9, (c) => c.id],
    ["TITLE", 40, (c) => c.title],
    ["COMPANY", 22, (c) => c.company || "—"],
    ["LOCATION", 18, (c) => c.location || "—"],
    ["DATE", 10, (c) => c.date || "—"],
    ["DEADLINE", 10, (c) => (c.alwaysOpen ? "상시" : c.deadline || "—")],
  ]
  const line = (cells: string[]) => cells.map((v, i) => fitColumn(v, cols[i][1])).join(" ").trimEnd()
  const header = line(cols.map(([name]) => name))
  const rows = cards.map((c) => line(cols.map(([, , get]) => get(c))))
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(buildUrl(opts))
    if (!html) {
      writeError("JobKorea search page not found (404)", "SEARCH_FAILED")
      return 1
    }
    const page = parseSearchPage(html)
    let cards = page.results
    // The period buckets are coarse (today / 3 days / week / month), so trim
    // to the exact window: keep postings dated on or after the cutoff.
    if (opts.jobage !== undefined) {
      const cutoff = koreaDate(opts.jobage)
      cards = cards.filter((c) => c.date !== null && c.date >= cutoff)
    }
    if (opts.limit !== undefined) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        (cards.length === 0
          ? "No results."
          : cards
              .map(
                (c) =>
                  `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.career || "—"}\n` +
                  `  posted ${c.date || "—"} · deadline ${c.alwaysOpen ? "open until filled (상시채용)" : c.deadline || "—"}\n` +
                  `  id: ${c.id}\n  ${c.url}`,
              )
              .join("\n\n")) + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          {
            meta: { count: cards.length, page: opts.page, total: page.total, totalPages: page.totalPages },
            results: cards,
          },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), e instanceof PageShapeError ? "PARSE_FAILED" : "SEARCH_FAILED")
    return 1
  }
}
