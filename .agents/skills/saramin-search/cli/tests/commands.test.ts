import { afterEach, describe, expect, test } from "bun:test";
import { join } from "path";
import { runSearch, type SearchOpts } from "../src/commands/search";
import { runDetail } from "../src/commands/detail";

// End-to-end command tests, offline: fetch is stubbed to serve the trimmed
// real pages in fixtures/, and stdout/stderr are captured in-process.
const fixture = (name: string) => Bun.file(join(import.meta.dir, "fixtures", name)).text();

const originalFetch = globalThis.fetch;
const originalStdout = process.stdout.write;
const originalStderr = process.stderr.write;

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.stdout.write = originalStdout;
  process.stderr.write = originalStderr;
});

/** Serve responses by URL; record every requested URL. */
function stubFetch(route: (url: string) => Response): string[] {
  const urls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    return route(url);
  }) as unknown as typeof fetch;
  return urls;
}

function capture(): { out: () => string; err: () => string } {
  let out = "";
  let err = "";
  process.stdout.write = ((chunk: string) => ((out += chunk), true)) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string) => ((err += chunk), true)) as typeof process.stderr.write;
  return { out: () => out, err: () => err };
}

const baseOpts: SearchOpts = { query: "백엔드", sort: "relevance", page: 1, format: "json" };

describe("runSearch", () => {
  test("emits the contract JSON shape for a real results page", async () => {
    const page = await fixture("search-page.html");
    const urls = stubFetch(() => new Response(page));
    const io = capture();

    expect(await runSearch(baseOpts)).toBe(0);
    expect(urls).toHaveLength(1);
    expect(new URL(urls[0]).searchParams.get("searchword")).toBe("백엔드");
    const data = JSON.parse(io.out());
    expect(data.meta).toEqual({ count: 4, page: 1, total: 2418 });
    for (const r of data.results) {
      for (const key of ["id", "title", "company", "location", "date", "deadline", "url"]) expect(r).toHaveProperty(key);
    }
    expect(io.err()).toBe("");
  });

  test("--limit caps the emitted results", async () => {
    const page = await fixture("search-page.html");
    stubFetch(() => new Response(page));
    const io = capture();

    expect(await runSearch({ ...baseOpts, limit: 1 })).toBe(0);
    expect(JSON.parse(io.out()).results.map((r: { id: string }) => r.id)).toEqual(["55326336"]);
  });

  test("a zero-result page is an empty result, not an error", async () => {
    const page = await fixture("search-no-result.html");
    stubFetch(() => new Response(page));
    const io = capture();

    expect(await runSearch(baseOpts)).toBe(0);
    expect(JSON.parse(io.out())).toEqual({ meta: { count: 0, page: 1, total: 0 }, results: [] });
  });

  test("table output lists each posting on one row", async () => {
    const page = await fixture("search-page.html");
    stubFetch(() => new Response(page));
    const io = capture();

    expect(await runSearch({ ...baseOpts, format: "table" })).toBe(0);
    const lines = io.out().trimEnd().split("\n");
    expect(lines[0]).toStartWith("ID");
    expect(lines).toHaveLength(2 + 4);
    expect(lines[3]).toContain("~26-10-07"); // modification date only
    expect(lines[4]).toContain("채용시");
  });

  test("a page without the result list fails as PARSE_FAILED on stderr", async () => {
    stubFetch(() => new Response("<html><body>maintenance</body></html>"));
    const io = capture();

    expect(await runSearch(baseOpts)).toBe(1);
    expect(io.out()).toBe("");
    expect(JSON.parse(io.err()).code).toBe("PARSE_FAILED");
  });

  test("a 403 fails as SEARCH_FAILED without retrying", async () => {
    const urls = stubFetch(() => new Response("", { status: 403, statusText: "Forbidden" }));
    const io = capture();

    expect(await runSearch(baseOpts)).toBe(1);
    expect(urls).toHaveLength(1);
    expect(JSON.parse(io.err())).toEqual({ error: "Request failed: 403 Forbidden", code: "SEARCH_FAILED" });
  });
});

describe("runDetail", () => {
  test("fetches the print view and the description page, nothing else", async () => {
    const page = await fixture("detail-active-55210151.html");
    const description = await fixture("description-55210151.html");
    const urls = stubFetch((url) => new Response(url.includes("view-detail") ? description : page));
    const io = capture();

    expect(await runDetail({ id: "https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=55210151&view_type=search", format: "json" })).toBe(0);
    expect(urls).toEqual([
      "https://www.saramin.co.kr/zf_user/jobs/view?rec_idx=55210151&isPrint=yes",
      "https://www.saramin.co.kr/zf_user/jobs/relay/view-detail?rec_idx=55210151",
    ]);
    const job = JSON.parse(io.out());
    expect(job.title).toBe("[샘플그룹] 예시테크 백엔드개발 경력 채용");
    expect(job.date).toBe("2026-10-07");
    expect(job.description).toContain("접수방법 및 기간");
    expect(job.descriptionImages.length).toBeGreaterThan(0);
  });

  test("plain output shows the facts, then the description and its images", async () => {
    const page = await fixture("detail-active-55210151.html");
    const description = await fixture("description-55210151.html");
    stubFetch((url) => new Response(url.includes("view-detail") ? description : page));
    const io = capture();

    expect(await runDetail({ id: "55210151", format: "plain" })).toBe(0);
    const out = io.out();
    expect(out).toStartWith("[샘플그룹] 예시테크 백엔드개발 경력 채용\n(주)예시테크 · 서울 송파구, 서울전체");
    expect(out).toContain("Experience: 경력 3~15년");
    expect(out).toContain("Description images:\nhttps://");
    expect(out).not.toMatch(/\n{3,}/);
  });

  test("a missing posting (404 after redirect) is NOT_FOUND", async () => {
    stubFetch(() => new Response("", { status: 404 }));
    const io = capture();

    expect(await runDetail({ id: "99999999", format: "json" })).toBe(1);
    expect(JSON.parse(io.err()).code).toBe("NOT_FOUND");
  });

  test("a page without a title is PARSE_FAILED", async () => {
    stubFetch(() => new Response("<html><body>changed</body></html>"));
    const io = capture();

    expect(await runDetail({ id: "55210151", format: "json" })).toBe(1);
    expect(JSON.parse(io.err()).code).toBe("PARSE_FAILED");
  });
});
