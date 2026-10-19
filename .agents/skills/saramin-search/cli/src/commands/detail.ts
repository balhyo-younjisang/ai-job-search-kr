import {
  DESCRIPTION_URL,
  PRINT_VIEW_URL,
  canonicalUrl,
  htmlFetch,
  isBeforeDeadline,
  parseCompany,
  parseDescription,
  parsePeriod,
  parseSummary,
  parseTitle,
  writeError,
  type JobDetail,
} from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const SARAMIN_HOST = /(^|\.)saramin\.co\.kr$/i

/**
 * Accept a raw posting id (rec_idx) or a Saramin posting URL on any
 * saramin.co.kr host, read from its `rec_idx` query parameter. Only the id is
 * taken from the URL - the CLI always fetches its own allowed endpoints, never
 * the URL it was given. Other hosts and look-alikes (saramin.co.kr.evil.io,
 * userinfo tricks) are rejected rather than mined for digits.
 */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d{5,10}$/.test(trimmed)) return trimmed

  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (!hasScheme && !/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) return null
  let parsed: URL
  try {
    parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  if (!SARAMIN_HOST.test(parsed.hostname)) return null
  const recIdx = parsed.searchParams.get("rec_idx")
  return recIdx && /^\d{5,10}$/.test(recIdx) ? recIdx : null
}

function first(summary: Record<string, string>, ...keys: string[]): string | null {
  for (const key of keys) if (summary[key]) return summary[key]
  return null
}

export function buildDetail(id: string, page: string, descriptionPage: string, now: Date = new Date()): JobDetail | null {
  const title = parseTitle(page)
  if (!title) return null
  const summary = parseSummary(page)
  const period = parsePeriod(page)
  const { text, images } = parseDescription(descriptionPage)
  return {
    id,
    title,
    company: parseCompany(page),
    location: first(summary, "근무지역")?.replace(/\s*지도보기.*$/, "") ?? null,
    date: period.start,
    deadline: period.alwaysOpen ? null : period.end,
    alwaysOpen: period.alwaysOpen,
    url: canonicalUrl(id),
    employmentType: first(summary, "근무형태"),
    experience: first(summary, "경력"),
    education: first(summary, "학력"),
    salary: first(summary, "급여"),
    position: first(summary, "직급/직책"),
    description: text,
    descriptionImages: images,
    isActive: !period.closed && (period.alwaysOpen || isBeforeDeadline(period.endTime, now)),
  }
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a Saramin posting id (rec_idx) from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    // A missing posting redirects to a not-exist page that answers 404.
    const page = await htmlFetch(`${PRINT_VIEW_URL}?rec_idx=${id}&isPrint=yes`)
    if (!page) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const descriptionPage = await htmlFetch(`${DESCRIPTION_URL}?rec_idx=${id}`)
    const job = buildDetail(id, page, descriptionPage)
    if (!job) {
      writeError(
        "The posting page has no title - the page structure may have changed (see url-reference.md)",
        "PARSE_FAILED",
      )
      return 1
    }

    if (opts.format === "plain") {
      const facts = [
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        job.experience ? `Experience: ${job.experience}` : "",
        job.education ? `Education: ${job.education}` : "",
        job.salary ? `Salary: ${job.salary}` : "",
        job.position ? `Position: ${job.position}` : "",
        `Posted: ${job.date || "—"} · Deadline: ${job.alwaysOpen ? "open until filled (채용시)" : job.deadline || "—"}`,
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
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
