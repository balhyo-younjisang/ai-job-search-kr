import {
  PageShapeError,
  SEARCH_URL,
  fitColumn,
  htmlFetch,
  parseSearchPage,
  resolveLocation,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query: string
  location?: string
  career?: string // "new" | "experienced"
  sort: "relevance" | "date"
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

export const PAGE_SIZE = 40

/** Career filter values Saramin's search accepts as `exp_cd`. */
export const CAREER_CODES: Record<string, string> = {
  new: "1",
  experienced: "2",
}

export function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  let keyword = opts.query
  if (opts.location) {
    const loc = resolveLocation(opts.location)
    if (loc.kind === "filter") params.set(loc.param, loc.code)
    // A place Saramin has no region code for (판교) still narrows as a keyword.
    else keyword = `${opts.query} ${opts.location}`
  }
  params.set("searchword", keyword)
  if (opts.career) params.set("exp_cd", CAREER_CODES[opts.career])
  if (opts.sort === "date") params.set("recruitSort", "reg_dt")
  params.set("recruitPage", String(opts.page))
  params.set("recruitPageCount", String(PAGE_SIZE))
  return `${SEARCH_URL}?${params.toString()}`
}

function deadlineText(c: JobCard): string {
  return c.alwaysOpen ? "채용시" : c.deadline || "—"
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const cols: Array<[string, number, (c: JobCard) => string]> = [
    ["ID", 9, (c) => c.id],
    ["TITLE", 40, (c) => c.title],
    ["COMPANY", 22, (c) => c.company || "—"],
    ["LOCATION", 18, (c) => c.location || "—"],
    ["DATE", 10, (c) => c.date || (c.modifiedDate ? `~${c.modifiedDate.slice(2)}` : "—")],
    ["DEADLINE", 10, deadlineText],
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
      writeError("Saramin search page not found (404)", "SEARCH_FAILED")
      return 1
    }
    const page = parseSearchPage(html)
    let cards = page.results
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
                  `  ${c.date ? `posted ${c.date}` : c.modifiedDate ? `updated ${c.modifiedDate}` : "posted —"}` +
                  ` · deadline ${c.alwaysOpen ? "open until filled (채용시)" : c.deadline || "—"}\n` +
                  `  id: ${c.id}\n  ${c.url}`,
              )
              .join("\n\n")) + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify({ meta: { count: cards.length, page: opts.page, total: page.total }, results: cards }, null, 2) +
          "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), e instanceof PageShapeError ? "PARSE_FAILED" : "SEARCH_FAILED")
    return 1
  }
}
