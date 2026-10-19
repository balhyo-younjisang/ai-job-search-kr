import {
  CAREER_CODES,
  PageShapeError,
  SEARCH_URL,
  SOURCES,
  fitColumn,
  htmlFetch,
  koreaDate,
  parseSearchPage,
  regionCode,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query: string
  location?: string
  career?: string // "new" | "experienced"
  jobage?: number
  sources: string[] // siteClcd codes; empty = every provider
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

export const PAGE_SIZE = 30

const compact = (date: string) => date.replace(/-/g, "")

export function buildUrl(opts: SearchOpts, now: Date = new Date()): string {
  const params = new URLSearchParams()
  let keyword = opts.query
  if (opts.location) {
    const code = regionCode(opts.location)
    if (code) params.set("region", code)
    // Districts and neighbourhoods have no region code; they narrow as keywords.
    else keyword = `${opts.query} ${opts.location}`
  }
  params.set("srcKeyword", keyword)
  if (opts.sources.length) params.set("siteClcd", opts.sources.join(","))
  if (opts.career) params.set("careerTypes", CAREER_CODES[opts.career])
  // Work24 filters by registration date server-side, so --jobage is exact.
  if (opts.jobage !== undefined) {
    params.set("regDateStdt", compact(koreaDate(opts.jobage, now)))
    params.set("regDateEndt", compact(koreaDate(0, now)))
  }
  params.set("sortField", "DATE")
  params.set("sortOrderBy", "DESC")
  params.set("resultCnt", String(PAGE_SIZE))
  params.set("currentPageNo", String(opts.page))
  return `${SEARCH_URL}?${params.toString()}`
}

function renderTable(cards: JobCard[], showSource: boolean): string {
  if (cards.length === 0) return "No results."
  const cols: Array<[string, number, (c: JobCard) => string]> = [
    ["ID", 16, (c) => c.id],
    ["TITLE", 36, (c) => c.title],
    ["COMPANY", 20, (c) => c.company || "—"],
    ["LOCATION", 16, (c) => c.location || "—"],
    ["DATE", 10, (c) => c.date || "—"],
    ["DEADLINE", 10, (c) => (c.alwaysOpen ? "채용시" : c.deadline || "—")],
  ]
  if (showSource) cols.push(["SOURCE", 10, (c) => c.source || "—"])
  const line = (cells: string[]) => cells.map((v, i) => fitColumn(v, cols[i][1])).join(" ").trimEnd()
  const header = line(cols.map(([name]) => name))
  const rows = cards.map((c) => line(cols.map(([, , get]) => get(c))))
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(buildUrl(opts))
    if (!html) {
      writeError("Work24 search page not found (404)", "SEARCH_FAILED")
      return 1
    }
    const page = parseSearchPage(html)
    let cards = page.results
    if (opts.limit !== undefined) cards = cards.slice(0, opts.limit)
    const showSource = opts.sources.length !== 1 || opts.sources[0] !== SOURCES.work.code

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards, showSource) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        (cards.length === 0
          ? "No results."
          : cards
              .map(
                (c) =>
                  `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.career || "—"} · ${c.salary || "—"}\n` +
                  `  posted ${c.date || "—"} · deadline ${c.alwaysOpen ? "open until filled (채용시까지)" : c.deadline || "—"}` +
                  `${showSource ? ` · via ${c.source || "—"}` : ""}\n  id: ${c.id}\n  ${c.url}`,
              )
              .join("\n\n")) + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify({ meta: { count: cards.length, page: opts.page, total: page.total }, results: cards }, null, 2) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), e instanceof PageShapeError ? "PARSE_FAILED" : "SEARCH_FAILED")
    return 1
  }
}
