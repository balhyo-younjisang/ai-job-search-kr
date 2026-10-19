#!/usr/bin/env bun
// Self-contained CLI for searching job postings on Work24 (고용24), the South
// Korean government job portal that absorbed Worknet (워크넷). No external CLI
// framework, so it runs anywhere `bun` is available with zero install beyond
// the repo clone.
//
// Personal use only. This reads Work24's public pages on paths its robots.txt
// permits, identifying itself honestly in the User-Agent. A public service is
// still a shared one: use it for your own job search, keep volume low, and do
// not republish postings.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { CAREER_CODES, SOURCES, sourceCode } from "./helpers.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      // A negative number is a value ("--page -1"), so it reaches validation
      // and fails as BAD_ARG rather than as an unknown flag named "--1".
      if (next === undefined || (next.startsWith("-") && !/^-\d/.test(next))) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `worknet-cli — search job postings on Work24 (고용24, formerly Worknet 워크넷; South Korea)

USAGE
  bun run src/cli.ts search --query "<keywords>" [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords (job title, skill, company). REQUIRED. e.g. "백엔드", "데이터 분석".
  --location, -l <text>   Province, e.g. "서울", "경기도", "충청남도" (Work24's region filter).
                          Other place names ("판교", "강남구") are added to the keyword.
  --career <level>        new (신입) | experienced (경력).
  --jobage <days>         Registered within N days (filtered by Work24).
  --source <names>        Providers to include, comma-separated. Default: work (Work24's own
                          postings). Public-sector: nara (나라일터), alio (알리오), mma (병역일터),
                          ... Syndicated: jobkorea, saramin, incruit, wanted, ... (see SKILL.md).
  --all-sources           Every provider Work24 lists. Conflicts with --source.
  --page <n>              1-indexed page (30 results/page, newest first). Default 1.
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "개발자" -l "서울" --format table
  bun run src/cli.ts search -q "사무" -l "경기" --career new --jobage 7 --format table
  bun run src/cli.ts search -q "행정" --source nara,alio --format table
  bun run src/cli.ts detail K171112610190045 --format plain

Personal use only — reads Work24's public pages for your own job search; keep volume low.
`

// Long-form flag names each command accepts (parseFlags resolves the short
// aliases q/l/n to these before validation). "help"/"h" pass so `search --help`
// still prints usage.
const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "location", "career", "jobage", "source", "all-sources", "page", "limit", "format", "help", "h"]),
  detail: new Set(["format", "help", "h"]),
}

function fail(error: string, code: string): number {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
  return 1
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  // Reject unknown flags instead of silently discarding them: a discarded
  // filter changes what the search returns with no error. add-portal.md's
  // contract requires a bogus flag to exit 1 with a JSON error on stderr.
  const knownFlags = KNOWN_FLAGS[cmd]
  if (knownFlags) {
    for (const key of Object.keys(flags)) {
      if (key === "_" || knownFlags.has(key)) continue
      return fail(
        `unknown flag --${key} for '${cmd}' - flags are never silently ignored, because a discarded filter changes what the search returns; see --help for the supported flags`,
        "UNKNOWN_FLAG",
      )
    }
  }

  if (cmd === "search") {
    const query = typeof flags.query === "string" ? flags.query.trim() : ""
    if (!query) {
      return fail('the --query/-q flag is required (e.g. -q "백엔드" or -q "데이터 분석")', "NO_QUERY")
    }
    if (flags.location !== undefined && (typeof flags.location !== "string" || !flags.location.trim())) {
      return fail('--location needs a place name, e.g. -l "서울"', "BAD_ARG")
    }
    const fmt = flags.format !== undefined ? String(flags.format) : "json"
    if (!["json", "table", "plain"].includes(fmt)) {
      return fail(`--format must be one of json|table|plain, got "${fmt}"`, "BAD_ARG")
    }
    if (flags.source !== undefined && flags["all-sources"] !== undefined) {
      return fail("--source and --all-sources both choose providers; pass only one", "CONFLICTING_FLAGS")
    }
    if (flags["all-sources"] !== undefined && flags["all-sources"] !== true) {
      return fail("--all-sources takes no value", "BAD_ARG")
    }
    let sources = [SOURCES.work.code]
    if (flags["all-sources"] === true) sources = []
    if (flags.source !== undefined) {
      const names = typeof flags.source === "string" ? flags.source.split(",").map((s) => s.trim()).filter(Boolean) : []
      const codes = names.map(sourceCode)
      const bad = names.find((_, i) => codes[i] === null)
      if (names.length === 0 || bad !== undefined) {
        return fail(`--source takes ${Object.keys(SOURCES).join("|")} (comma-separated), got "${bad ?? flags.source}"`, "BAD_ARG")
      }
      sources = [...new Set(codes as string[])]
    }
    const career = flags.career !== undefined ? String(flags.career) : undefined
    if (career !== undefined && !(career in CAREER_CODES)) {
      return fail(`--career must be one of ${Object.keys(CAREER_CODES).join("|")}, got "${career}"`, "BAD_ARG")
    }

    // Number(), not parseInt(): parseInt truncates, so "--jobage 0.5" would
    // become 0 and silently drop the filter. Whole numbers >= 1 only.
    const ints: Record<string, number> = {}
    for (const name of ["jobage", "page", "limit"]) {
      const raw = flags[name]
      if (raw === undefined) continue
      const val = typeof raw === "string" ? Number(raw.trim()) : NaN
      if (!Number.isInteger(val) || val < 1) {
        return fail(`--${name} must be a whole number of at least 1, got "${raw}"`, "BAD_ARG")
      }
      ints[name] = val
    }

    const opts: SearchOpts = {
      query,
      location: typeof flags.location === "string" ? flags.location.trim() : undefined,
      career,
      jobage: ints.jobage,
      sources,
      page: ints.page ?? 1,
      limit: ints.limit,
      format: fmt as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) return fail("detail requires an <id|url>", "NO_ID")
    const fmt = flags.format !== undefined ? String(flags.format) : "json"
    if (!["json", "plain"].includes(fmt)) {
      return fail(`--format must be one of json|plain, got "${fmt}"`, "BAD_ARG")
    }
    const opts: DetailOpts = { id, format: fmt as DetailOpts["format"] }
    return runDetail(opts)
  }

  return fail(`Unknown command "${cmd}"`, "BAD_CMD")
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({
        error: e instanceof Error ? e.message : String(e),
        code: "INTERNAL_ERROR",
      }) + "\n",
    )
    process.exit(1)
  })
