import {
  DETAIL_URL,
  NotFoundError,
  PageShapeError,
  htmlFetch,
  parseDetail,
  writeError,
} from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const WORK_HOST = /(^|\.)(work24|work)\.go\.kr$/i
const ID = /^[A-Za-z0-9]{5,20}$/

export interface PostingRef {
  id: string
  infoTypeCd: string
  infoTypeGroup: string
}

/**
 * Accept a posting id (wantedAuthNo, e.g. K171112610190045) or a Work24 /
 * Worknet URL carrying wantedAuthNo. A bare id means a Work24 posting; a URL
 * keeps its provider (infoTypeCd / infoTypeGroup), which syndicated postings
 * need. Only the parameters are taken from the URL - the CLI always fetches
 * Work24's own detail page, never work.go.kr (its /empInfo/ pages are
 * disallowed by robots.txt). Other hosts and look-alikes are rejected.
 */
export function normalizeRef(input: string): PostingRef | null {
  const trimmed = input.trim()
  if (ID.test(trimmed)) return { id: trimmed, infoTypeCd: "VALIDATION", infoTypeGroup: "tb_workinfoworknet" }

  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (!hasScheme && !/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) return null
  let parsed: URL
  try {
    parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  if (!WORK_HOST.test(parsed.hostname)) return null
  const id = parsed.searchParams.get("wantedAuthNo")
  if (!id || !ID.test(id)) return null
  const infoTypeCd = parsed.searchParams.get("infoTypeCd") || "VALIDATION"
  const infoTypeGroup =
    parsed.searchParams.get("infoTypeGroup") || (infoTypeCd === "VALIDATION" ? "tb_workinfoworknet" : "tb_workinfogubun")
  if (!/^[A-Z_]{2,20}$/.test(infoTypeCd) || !/^[a-z_]{2,40}$/.test(infoTypeGroup)) return null
  return { id, infoTypeCd, infoTypeGroup }
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const ref = normalizeRef(opts.id)
  if (!ref) {
    writeError(`Could not parse a Work24 posting id (wantedAuthNo) from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const params = new URLSearchParams({ wantedAuthNo: ref.id, infoTypeCd: ref.infoTypeCd, infoTypeGroup: ref.infoTypeGroup })
    const html = await htmlFetch(`${DETAIL_URL}?${params.toString()}`)
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseDetail(html, ref.id, ref.infoTypeCd, ref.infoTypeGroup)

    if (opts.format === "plain") {
      const facts = [
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        job.workSchedule ? `Schedule: ${job.workSchedule}` : "",
        job.experience ? `Experience: ${job.experience}` : "",
        job.education ? `Education: ${job.education}` : "",
        job.salary ? `Salary: ${job.salary}` : "",
        job.source && job.source !== "고용24" ? `Source: ${job.source}` : "",
        `Posted: ${job.date || "—"} · Deadline: ${job.alwaysOpen ? "open until filled (채용시까지)" : job.deadline || "—"}`,
        `Status: ${job.isActive ? "ACTIVE" : "CLOSED / EXPIRED"}`,
      ].filter(Boolean)
      const sections = [
        `${job.title}\n${job.company || "—"} · ${job.location || "—"}`,
        facts.join("\n"),
        job.description || "(no description)",
        job.descriptionUrl ? `Additional description (external frame): ${job.descriptionUrl}` : "",
        `URL: ${job.url}`,
      ].filter(Boolean)
      process.stdout.write(sections.join("\n\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    if (e instanceof NotFoundError) {
      writeError(`Job not found: ${e.message}`, "NOT_FOUND")
      return 1
    }
    writeError(e instanceof Error ? e.message : String(e), e instanceof PageShapeError ? "PARSE_FAILED" : "DETAIL_FAILED")
    return 1
  }
}
