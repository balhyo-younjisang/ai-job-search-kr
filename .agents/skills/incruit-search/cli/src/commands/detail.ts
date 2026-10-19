import { CONTENT_URL, DETAIL_URL, PageShapeError, htmlFetch, parseDetail, writeError } from "../helpers.js"

export interface DetailOpts { id: string; format: "json" | "plain" }

/** Normalize input to a canonical request; no user-supplied host is ever fetched. */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d{13}$/.test(trimmed)) return trimmed
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
    if (!/(^|\.)incruit\.com$/i.test(url.hostname) || url.username || url.password) return null
    if (!/\/jobpost(?:mobile)?\.asp$/i.test(url.pathname)) return null
    const id = url.searchParams.get("job")
    return id && /^\d{13}$/.test(id) ? id : null
  } catch { return null }
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) { writeError("Expected an Incruit 13-digit posting id or posting URL", "BAD_ID"); return 1 }
  try {
    const page = await htmlFetch(`${DETAIL_URL}?job=${id}`)
    if (!page) { writeError("Job not found", "NOT_FOUND"); return 1 }
    // Validate posting identity before requesting its description.
    parseDetail(page, "", id)
    const iframe = await htmlFetch(`${CONTENT_URL}?job=${id}`)
    if (!iframe) throw new PageShapeError("Incruit description page not found")
    const job = parseDetail(page, iframe, id)
    if (opts.format === "json") process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    else process.stdout.write([
      `${job.title}\n${job.company || "—"} · ${job.location || "—"}`,
      [job.employmentType, job.experience, job.education, job.salary].filter(Boolean).join(" · "),
      `Posted: ${job.date || "—"} · Deadline: ${job.alwaysOpen ? "채용시 / 상시" : job.deadline || "—"}`,
      `Status: ${job.isActive ? "ACTIVE" : "CLOSED / EXPIRED"}`,
      job.description || "(no text description)",
      job.descriptionImages.length ? ["Description images:", ...job.descriptionImages].join("\n") : "",
      `URL: ${job.url}`,
    ].filter(Boolean).join("\n\n") + "\n")
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), e instanceof PageShapeError ? "PARSE_FAILED" : "DETAIL_FAILED")
    return 1
  }
}
