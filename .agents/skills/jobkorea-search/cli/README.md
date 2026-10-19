# jobkorea-cli

CLI for searching job postings on **JobKorea (잡코리아)**, South Korea, across
every sector and career level.

**Data source**: JobKorea's public pages - `/Search/` (results embedded as RSC
JSON) and `/Recruit/GI_Read/<id>` plus its description iframe.
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **Personal use only.** This reads JobKorea's public pages on paths its robots.txt
> permits, with an honest User-Agent. Keep volume low, don't use it commercially,
> for bulk collection, or to republish postings, and run it on your own responsibility.

## Installation

```bash
cd .agents/skills/jobkorea-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job postings (`--query` required) |
| `detail` | Fetch full detail for a single posting |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Experienced backend roles in Pangyo
bun run src/cli.ts search -q "백엔드" -l "판교" --career experienced --format table

# Data analyst roles in Seoul, last 7 days, newest first
bun run src/cli.ts search -q "데이터 분석" -l "서울" --jobage 7 --sort date --format table

# New-graduate roles
bun run src/cli.ts search -q "프론트엔드" --career new --format table

# Full detail for one posting
bun run src/cli.ts detail 50159061 --format plain
```

See `../SKILL.md` for the full flag reference and `../url-reference.md` for the
endpoints, parsing anchors, and the robots.txt / User-Agent maintenance check.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | **Required.** Keywords (title / skill / company). |
| `--location` | `-l` | Place name (`서울`, `판교`, `부산`, `강남구`), matched as a keyword. |
| `--career` | | `new` (신입) \| `experienced` (경력). |
| `--jobage` | | Posted within N days. |
| `--sort` | | `relevance` (default) \| `date`. |
| `--page` | | 1-indexed page (20 results/page). |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |

## Tests

```bash
bun run typecheck
bun run test        # offline: stubbed fetch + trimmed real pages, no requests to JobKorea
bun run test:live   # opt-in live smoke test: one search, one detail
```

`bun run test` is what CI runs, and it never contacts the portal: parsers and
commands are tested against trimmed real pages in `tests/fixtures/` (see
`provenance.md`). `tests/live-smoke.test.ts` is skipped unless
`JOBKOREA_LIVE=1` is set, which `test:live` does - run it by hand after
changing a parser.
