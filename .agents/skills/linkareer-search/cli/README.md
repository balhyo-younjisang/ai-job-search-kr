# linkareer-cli

CLI for searching job postings (채용, internships included) on **Linkareer
(링커리어)**, South Korea - a career platform for students and new graduates.

**Data source**: Linkareer's public GraphQL API (`api.linkareer.com/graphql`,
the `activities` query the site's own list page runs) for search, and the
server-rendered posting page `linkareer.com/activity/<id>` for detail.
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **Personal use only.** Linkareer's terms forbid automated access that loads
> its servers, reverse-engineering the service, and commercial use without
> consent. Use this for your own job search, one request per search or posting,
> don't republish postings, and run it on your own responsibility.

## Installation

```bash
cd .agents/skills/linkareer-search/cli
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
# Marketing internships in Seoul
bun run src/cli.ts search -q "마케팅" --career intern -l "서울" --format table

# New-grad or intern backend roles registered in the last 14 days
bun run src/cli.ts search -q "백엔드" --career new,intern --jobage 14 --format table

# Full detail for one posting
bun run src/cli.ts detail 357883 --format plain
```

See `../SKILL.md` for the full flag reference and `../url-reference.md` for the
query, fields, region ids, and the robots.txt maintenance check.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | **Required.** Keywords (matches titles mostly). |
| `--location` | `-l` | Province (`서울`, `경기도`, `충청`, ...), optionally with a district: `서울 강남구`. |
| `--career` | | `new` \| `experienced` \| `intern` \| `contract`, comma-separated for several. |
| `--jobage` | | Registered within N days. |
| `--page` | | 1-indexed page (20 results/page, newest first). |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |

## Tests

```bash
bun run typecheck
bun run test        # offline: stubbed fetch + synthetic responses, no requests to Linkareer
bun run test:live   # opt-in live smoke test: one search, one detail
```

`bun run test` is what CI runs, and it never contacts the portal: parsers and
commands are tested against synthetic responses in `tests/fixtures/` (see
`provenance.md`). `tests/live-smoke.test.ts` is skipped unless
`LINKAREER_LIVE=1` is set, which `test:live` does - run it by hand after
changing a parser.
