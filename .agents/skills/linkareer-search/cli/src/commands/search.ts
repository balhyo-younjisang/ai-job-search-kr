import {
  JOB_TYPES,
  PageShapeError,
  RECRUIT_TYPE_ID,
  RECRUIT_TYPE_LABELS,
  SEARCH_QUERY,
  districtsOf,
  fitColumn,
  gqlFetch,
  koreaDate,
  parseSearchResponse,
  resolveRegion,
  trimToWindow,
  writeError,
  type JobCard,
  type SearchData,
} from "../helpers.js"

export interface SearchOpts {
  query: string
  location?: string
  career?: string[] // keys of JOB_TYPES
  jobage?: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

export const PAGE_SIZE = 20

/** The GraphQL variables for a search: job postings only, open, newest first. */
export function buildVariables(opts: SearchOpts): Record<string, unknown> {
  const filterBy: Record<string, unknown> = {
    activityTypeID: String(RECRUIT_TYPE_ID),
    status: "OPEN",
    q: opts.query,
  }
  if (opts.location) filterBy.regionIDs = [resolveRegion(opts.location).regionId]
  if (opts.career?.length) filterBy.jobTypes = opts.career.map((c) => JOB_TYPES[c])
  return {
    filterBy,
    pagination: { page: opts.page, pageSize: PAGE_SIZE },
    orderBy: { field: "RECENT", direction: "DESC" },
  }
}

function deadlineText(c: JobCard): string {
  if (c.alwaysOpen) return c.recruitType === "ALWAYS" ? "상시" : "채용시"
  return c.deadline || "—"
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const cols: Array<[string, number, (c: JobCard) => string]> = [
    ["ID", 7, (c) => c.id],
    ["TITLE", 40, (c) => c.title],
    ["COMPANY", 20, (c) => c.company || "—"],
    ["LOCATION", 16, (c) => c.location || "—"],
    ["TYPE", 10, (c) => c.jobTypes.join("·") || "—"],
    ["DATE", 10, (c) => c.date || "—"],
    ["DEADLINE", 10, deadlineText],
  ]
  const line = (cells: string[]) => cells.map((v, i) => fitColumn(v, cols[i][1])).join(" ").trimEnd()
  const header = line(cols.map(([name]) => name))
  const rows = cards.map((c) => line(cols.map(([, , get]) => get(c))))
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const district = opts.location ? resolveRegion(opts.location).district : null
    const data = await gqlFetch<SearchData>(SEARCH_QUERY, buildVariables(opts))
    const page = parseSearchResponse(data)
    let entries = page.cards
    // Linkareer filters by province only; a district is matched client-side.
    if (district) entries = entries.filter(({ node }) => districtsOf(node).some((d) => d === district || d.endsWith(` ${district}`)))
    let cards = entries.map(({ card }) => card)
    if (opts.jobage !== undefined) cards = trimToWindow(cards, koreaDate(opts.jobage))
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
                  `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.jobTypes.join("·") || "—"}\n` +
                  `  posted ${c.date || "—"} · deadline ${c.alwaysOpen ? RECRUIT_TYPE_LABELS[c.recruitType ?? ""] ?? "open" : c.deadline || "—"}\n` +
                  `  id: ${c.id}\n  ${c.url}`,
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
