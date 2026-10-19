import {
  DETAIL_URL,
  PageShapeError,
  RECRUIT_TYPE_LABELS,
  UnsupportedTypeError,
  htmlFetch,
  parseDetailPage,
  writeError,
} from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const LINKAREER_HOST = /(^|\.)linkareer\.com$/i

/**
 * Accept a raw posting id or a Linkareer posting URL (/activity/{id}, any
 * linkareer.com host). Only the id is taken from the URL; the CLI fetches its
 * own canonical page. Other hosts and look-alikes (linkareer.com.evil.io,
 * userinfo tricks) are rejected rather than mined for digits.
 */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d{1,9}$/.test(trimmed)) return trimmed

  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (!hasScheme && !/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) return null
  let parsed: URL
  try {
    parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  if (!LINKAREER_HOST.test(parsed.hostname)) return null
  return parsed.pathname.match(/^\/activity\/(\d{1,9})\/?$/)?.[1] ?? null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a Linkareer posting id from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    // A missing posting redirects to the home page; htmlFetch returns "" for any 3xx.
    const html = await htmlFetch(`${DETAIL_URL}/${id}`)
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseDetailPage(html, id)

    if (opts.format === "plain") {
      const deadline = job.alwaysOpen ? RECRUIT_TYPE_LABELS[job.recruitType ?? ""] ?? "open" : job.deadline || "—"
      const facts = [
        job.jobTypes.length ? `Type: ${job.jobTypes.join(", ")}${job.internTypes.length ? ` (${job.internTypes.join(", ")})` : ""}` : "",
        job.jobCategory ? `Category: ${job.jobCategory}` : "",
        job.education ? `Education: ${job.education}` : "",
        job.salary ? `Salary: ${job.salary}` : "",
        job.organizationType ? `Organization: ${job.organizationType}` : "",
        `Posted: ${job.date || "—"} · Applications open: ${job.recruitStart || "—"} · Deadline: ${deadline}`,
        job.applyUrl ? `Apply: ${job.applyUrl}${job.applyMethod ? ` (${job.applyMethod})` : ""}` : "",
        `Status: ${job.isActive ? "ACTIVE" : "CLOSED / EXPIRED"}`,
      ].filter(Boolean)
      const sections = [
        `${job.title}\n${job.company || "—"} · ${job.location || "—"}`,
        facts.join("\n"),
        job.description || "(no text description)",
        job.descriptionImages.length > 0
          ? [job.description ? "Description images:" : "Description is image-only:", ...job.descriptionImages].join("\n")
          : "",
        `URL: ${job.url}`,
      ].filter(Boolean)
      process.stdout.write(sections.join("\n\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    const code = e instanceof UnsupportedTypeError ? "UNSUPPORTED_TYPE" : e instanceof PageShapeError ? "PARSE_FAILED" : "DETAIL_FAILED"
    writeError(e instanceof Error ? e.message : String(e), code)
    return 1
  }
}
