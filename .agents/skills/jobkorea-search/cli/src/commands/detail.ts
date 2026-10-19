import {
  DESCRIPTION_URL,
  DETAIL_URL,
  canonicalUrl,
  deadlineOf,
  htmlFetch,
  isStillActive,
  isoDate,
  pageSaysAlwaysOpen,
  parseDescription,
  parseJsonLd,
  parseSummaryTable,
  writeError,
  type JobDetail,
} from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const JOBKOREA_HOST = /(^|\.)jobkorea\.co\.kr$/i

/**
 * Accept a raw posting id or a JobKorea posting URL (www or mobile host, with
 * or without scheme). A URL on any other host is rejected rather than mined
 * for digits, so a company's own apply link never fetches an unrelated
 * JobKorea posting. Host and path go through real URL parsing, so look-alike
 * hosts (jobkorea.co.kr.evil.io) and userinfo tricks fall on the reject side.
 */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d{6,10}$/.test(trimmed)) return trimmed

  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (!hasScheme && !/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) return null
  let parsed: URL
  try {
    parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  if (!JOBKOREA_HOST.test(parsed.hostname)) return null
  const path = parsed.pathname.match(/^\/Recruit\/GI_Read\/(\d{6,10})\/?$/i)
  if (path) return path[1]
  // The description iframe URL carries the id as ?Gno=.
  if (/^\/Recruit\/GI_Read_Comt_Ifrm\/?$/i.test(parsed.pathname)) {
    const gno = parsed.searchParams.get("Gno")
    if (gno && /^\d{6,10}$/.test(gno)) return gno
  }
  return null
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function companyOf(ld: Record<string, unknown>): string | null {
  const org = ld.hiringOrganization as { name?: unknown } | undefined
  return text(org?.name)
}

function locationOf(ld: Record<string, unknown>): string | null {
  const place = ld.jobLocation as { address?: { streetAddress?: unknown; addressLocality?: unknown } } | undefined
  return text(place?.address?.streetAddress) ?? text(place?.address?.addressLocality)
}

export function buildDetail(id: string, page: string, iframe: string): JobDetail | null {
  const ld = parseJsonLd(page)
  if (!ld) return null
  const summary = parseSummaryTable(page)
  const { text: description, images } = parseDescription(iframe)
  const ldDeadline = deadlineOf(ld.validThrough)
  const alwaysOpen = ldDeadline.alwaysOpen || pageSaysAlwaysOpen(page)
  const deadline = alwaysOpen ? null : ldDeadline.deadline
  return {
    id,
    title: text(ld.title) ?? "(untitled)",
    company: companyOf(ld),
    location: summary["근무지주소"] ?? locationOf(ld),
    date: isoDate(ld.datePosted),
    deadline,
    alwaysOpen,
    url: canonicalUrl(id),
    // The summary keeps JobKorea's own wording (정규직 (수습 3개월)); JSON-LD
    // only has schema.org enums (FULL_TIME), so it is the fallback.
    employmentType: summary["고용형태"] ?? text(ld.employmentType),
    experience: text(ld.experienceRequirements),
    education: text(ld.educationRequirements),
    salary: summary["급여"] ?? null,
    workHours: summary["근무시간"] ?? null,
    description,
    descriptionImages: images,
    isActive: alwaysOpen || isStillActive(ld.validThrough),
  }
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a JobKorea posting id from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const page = await htmlFetch(`${DETAIL_URL}/${id}`)
    if (!page) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const iframe = await htmlFetch(`${DESCRIPTION_URL}?Gno=${id}`)
    const job = buildDetail(id, page, iframe)
    if (!job) {
      writeError(
        "The posting page has no JobPosting data - the page structure may have changed (see url-reference.md)",
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
        job.workHours ? `Hours: ${job.workHours}` : "",
        `Posted: ${job.date || "—"} · Deadline: ${job.alwaysOpen ? "open until filled (상시채용)" : job.deadline || "—"}`,
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
