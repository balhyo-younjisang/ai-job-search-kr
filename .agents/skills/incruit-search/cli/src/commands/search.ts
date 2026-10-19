import { SEARCH_URL, PageShapeError, fitColumn, htmlFetch, koreaDate, parseSearchPage, writeError, type JobCard } from "../helpers.js"
export interface SearchOpts {
  query: string
  location?: string
  jobage?: number
  sort: "relevance" | "date"
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}
export function buildUrl(opts: SearchOpts): string {
  // Incruit can swallow the next parameter after UTF-8 keywords: keep kw last.
  const params = new URLSearchParams({
    col: "job",
    startno: String((opts.page - 1) * 30), psize: "30",
    SortCd: opts.jobage !== undefined || opts.sort === "date" ? "reg" : "rank",
    kw: opts.location ? `${opts.query} ${opts.location}` : opts.query,
  })
  return `${SEARCH_URL}?${params}`
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
      writeError("Incruit search page not found (404)", "SEARCH_FAILED")
      return 1
    }
    const page = parseSearchPage(html)
    let cards = page.results
    // Incruit has no verified age parameter here; keep only known registration
    // dates within the requested window on this page.
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
            meta: { count: cards.length, page: opts.page, total: page.total },
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
