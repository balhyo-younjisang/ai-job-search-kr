import { afterEach, describe, expect, test } from "bun:test";
import { join } from "path";
import { runSearch, type SearchOpts } from "../src/commands/search";
import { runDetail } from "../src/commands/detail";
import { koreaDate } from "../src/helpers";

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
    expect(new URL(urls[0]).searchParams.get("stext")).toBe("백엔드");
    const data = JSON.parse(io.out());
    expect(data.meta).toEqual({ count: 3, page: 1, total: 2377, totalPages: 119 });
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
    expect(JSON.parse(io.out()).results.map((r: { id: string }) => r.id)).toEqual(["50135552"]);
  });

  test("--jobage trims to the exact window by posting date", async () => {
    const page = await fixture("search-page.html");
    stubFetch(() => new Response(page));
    const io = capture();

    // The fixture's postings are dated 2026-10-09, 2026-10-13, 2026-09-17.
    const days = Math.round((Date.parse(koreaDate()) - Date.parse("2026-10-10")) / 86400000);
    expect(await runSearch({ ...baseOpts, jobage: days })).toBe(0);
    expect(JSON.parse(io.out()).results.map((r: { id: string }) => r.id)).toEqual(["50159061"]);
  });

  test("table output lists each posting on one aligned row", async () => {
    const page = await fixture("search-page.html");
    stubFetch(() => new Response(page));
    const io = capture();

    expect(await runSearch({ ...baseOpts, format: "table" })).toBe(0);
    const lines = io.out().trimEnd().split("\n");
    expect(lines[0]).toStartWith("ID");
    expect(lines).toHaveLength(2 + 3);
    expect(lines[3]).toContain("상시"); // the always-open posting
  });

  test("a page without the job list fails as PARSE_FAILED on stderr", async () => {
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
  test("fetches the posting page and its description iframe", async () => {
    const page = await fixture("detail-50007983.html");
    const iframe = await fixture("description-image-50007983.html");
    const urls = stubFetch((url) => new Response(url.includes("GI_Read_Comt_Ifrm") ? iframe : page));
    const io = capture();

    expect(await runDetail({ id: "https://www.jobkorea.co.kr/Recruit/GI_Read/50007983?Oem_Code=C1", format: "json" })).toBe(0);
    expect(urls).toEqual([
      "https://www.jobkorea.co.kr/Recruit/GI_Read/50007983",
      "https://www.jobkorea.co.kr/Recruit/GI_Read_Comt_Ifrm?Gno=50007983",
    ]);
    const job = JSON.parse(io.out());
    expect(job.description).toBeNull();
    expect(job.descriptionImages).toHaveLength(1);
  });

  test("plain output says when the description is image-only", async () => {
    const page = await fixture("detail-50007983.html");
    const iframe = await fixture("description-image-50007983.html");
    stubFetch((url) => new Response(url.includes("GI_Read_Comt_Ifrm") ? iframe : page));
    const io = capture();

    expect(await runDetail({ id: "50007983", format: "plain" })).toBe(0);
    const out = io.out();
    expect(out).toStartWith("AI백엔드 엔지니어 경력 모집\n㈜가상러닝 · 서울 구로구");
    expect(out).toContain("Salary: 회사 내규에 따름 (면접 후 결정)");
    expect(out).toContain("Description is image-only:\nhttps://file2.jobkorea.co.kr/");
    expect(out).not.toMatch(/\n{3,}/);
  });

  test("a missing posting (404) is NOT_FOUND", async () => {
    stubFetch(() => new Response("", { status: 404 }));
    const io = capture();

    expect(await runDetail({ id: "99999999", format: "json" })).toBe(1);
    expect(JSON.parse(io.err()).code).toBe("NOT_FOUND");
  });

  test("a page without JobPosting data is PARSE_FAILED", async () => {
    stubFetch(() => new Response("<html><body>changed</body></html>"));
    const io = capture();

    expect(await runDetail({ id: "50007983", format: "json" })).toBe(1);
    expect(JSON.parse(io.err()).code).toBe("PARSE_FAILED");
  });
});
