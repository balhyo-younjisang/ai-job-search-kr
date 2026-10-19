# saramin-cli

CLI for searching job postings on **Saramin (사람인)**, South Korea, across every
sector and career level.

**Data source**: Saramin's public pages - `/zf_user/search/recruit` (server-rendered
results), the print view `/zf_user/jobs/view?rec_idx=<id>&isPrint=yes`, and
`/zf_user/jobs/relay/view-detail` for the description.
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **Personal use only.** Saramin's terms forbid copying or passing on what the
> service shows and using it for anything but job seeking. Use this for your own
> job search, keep volume low, don't republish postings, and run it on your own
> responsibility.

## Installation

```bash
cd .agents/skills/saramin-search/cli
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
# Experienced backend roles in Bundang
bun run src/cli.ts search -q "백엔드" -l "성남시 분당구" --career experienced --format table

# New-graduate data roles in Seoul, registered in the last 7 days
bun run src/cli.ts search -q "데이터 분석" -l "서울" --career new --jobage 7 --format table

# Full detail for one posting
bun run src/cli.ts detail 55210151 --format plain
```

See `../SKILL.md` for the full flag reference and `../url-reference.md` for the
endpoints, parsing anchors, region codes, and the robots.txt maintenance check.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | **Required.** Keywords (title / skill / company). |
| `--location` | `-l` | Province (`서울`, `경기도`) or district (`강남구`, `성남시 분당구`, `부산 중구`); uncoded places (`판교`) join the keyword. |
| `--career` | | `new` (신입) \| `experienced` (경력). |
| `--jobage` | | Registered within N days (sorts by registration date). |
| `--sort` | | `relevance` (default) \| `date`. |
| `--page` | | 1-indexed page (40 results/page). |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |

## Tests

```bash
bun run typecheck
bun run test        # offline: stubbed fetch + trimmed real pages, no requests to Saramin
bun run test:live   # opt-in live smoke test: one search, one detail
```

`bun run test` is what CI runs, and it never contacts the portal: parsers and
commands are tested against trimmed real pages in `tests/fixtures/` (see
`provenance.md`). `tests/live-smoke.test.ts` is skipped unless
`SARAMIN_LIVE=1` is set, which `test:live` does - run it by hand after changing
a parser.
