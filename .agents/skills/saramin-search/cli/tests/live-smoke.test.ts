import { describe, expect, test } from "bun:test";
import { parseJSON, runCLI } from "./helpers";

// Live smoke tests: one search and one detail against saramin.co.kr. Opt-in
// only - CI must not send requests to live portals (see
// .github/workflows/ci.yml), so these run solely under `bun run test:live`
// (SARAMIN_LIVE=1). Run them by hand after changing a parser.
const live = process.env.SARAMIN_LIVE === "1";

interface SearchResult {
  meta: { count: number; page: number; total: number | null };
  results: Array<{ id: string; title: string; url: string; date: string | null; modifiedDate: string | null }>;
}

describe.skipIf(!live)("live search (SARAMIN_LIVE=1)", () => {
  test("a common keyword returns results with id, title, url, and a date of some kind", async () => {
    const data = parseJSON<SearchResult>(await runCLI(["search", "-q", "백엔드", "--limit", "5"]));
    expect(data.meta.count).toBeGreaterThan(0);
    expect(data.meta.total).toBeGreaterThan(0);
    for (const r of data.results) {
      expect(r.id).toMatch(/^\d+$/);
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.url).toBe(`https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=${r.id}`);
      expect(r.date ?? r.modifiedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test("the first result's detail page parses", async () => {
    const search = parseJSON<SearchResult>(await runCLI(["search", "-q", "백엔드", "--limit", "1"]));
    const id = search.results[0].id;
    const detail = parseJSON<{ id: string; title: string; date: string | null; description: string | null; descriptionImages: string[] }>(
      await runCLI(["detail", id]),
    );
    expect(detail.id).toBe(id);
    expect(detail.title).toBe(search.results[0].title);
    expect(detail.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(detail.description !== null || detail.descriptionImages.length > 0).toBe(true);
  });
});
