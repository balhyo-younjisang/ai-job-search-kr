import { afterEach, describe, expect, test } from "bun:test";
import { join } from "path";
import { runSearch, type SearchOpts } from "../src/commands/search";
import { runDetail } from "../src/commands/detail";

// End-to-end command tests, offline: fetch is stubbed to serve the synthetic
// responses in fixtures/, and stdout/stderr are captured in-process.
const fixture = (name: string) => Bun.file(join(import.meta.dir, "fixtures", name)).text();

const originalFetch = globalThis.fetch;
const originalStdout = process.stdout.write;
const originalStderr = process.stderr.write;

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.stdout.write = originalStdout;
  process.stderr.write = originalStderr;
});

interface Call {
  url: string;
  init?: RequestInit;
}

function stubFetch(route: (url: string) => Response): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return route(url);
  }) as unknown as typeof fetch;
  return calls;
}

function capture(): { out: () => string; err: () => string } {
  let out = "";
  let err = "";
  process.stdout.write = ((chunk: string) => ((out += chunk), true)) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string) => ((err += chunk), true)) as typeof process.stderr.write;
  return { out: () => out, err: () => err };
}

const baseOpts: SearchOpts = { query: "백엔드", page: 1, format: "json" };

describe("runSearch", () => {
  test("posts the activities query and emits the contract JSON shape", async () => {
    const body = await fixture("gql-search-backend-seoul.json");
    const calls = stubFetch(() => new Response(body, { headers: { "Content-Type": "application/json" } }));
    const io = capture();

    expect(await runSearch({ ...baseOpts, location: "서울", career: ["experienced"] })).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.linkareer.com/graphql");
    expect(calls[0].init?.method).toBe("POST");
    const sent = JSON.parse(String(calls[0].init?.body));
    expect(sent.query).toContain("activities(filterBy: $filterBy");
    expect(sent.variables.filterBy).toEqual({
      activityTypeID: "5",
      status: "OPEN",
      q: "백엔드",
      regionIDs: ["2"],
      jobTypes: ["EXPERIENCED"],
    });
    const data = JSON.parse(io.out());
    expect(data.meta).toEqual({ count: 14, page: 1, total: 14 });
    for (const r of data.results) {
      for (const key of ["id", "title", "company", "location", "date", "deadline", "url"]) expect(r).toHaveProperty(key);
    }
    expect(io.err()).toBe("");
  });

  test("a district narrows results client-side", async () => {
    const body = await fixture("gql-search-backend-seoul.json");
    stubFetch(() => new Response(body));
    const io = capture();

    expect(await runSearch({ ...baseOpts, location: "서울 중구" })).toBe(0);
    const results = JSON.parse(io.out()).results as Array<{ location: string }>;
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) expect(r.location).toContain("중구");
  });

  test("--limit caps the emitted results", async () => {
    const body = await fixture("gql-search-backend-seoul.json");
    stubFetch(() => new Response(body));
    const io = capture();

    expect(await runSearch({ ...baseOpts, limit: 2 })).toBe(0);
    expect(JSON.parse(io.out()).results.map((r: { id: string }) => r.id)).toEqual(["911014", "911013"]);
  });

  test("table output shows one row per posting", async () => {
    const body = await fixture("gql-search-backend-seoul.json");
    stubFetch(() => new Response(body));
    const io = capture();

    expect(await runSearch({ ...baseOpts, format: "table" })).toBe(0);
    const lines = io.out().trimEnd().split("\n");
    expect(lines[0]).toStartWith("ID");
    expect(lines).toHaveLength(2 + 14);
    expect(lines[2]).toContain("채용시");
  });

  test("a schema validation error fails as PARSE_FAILED", async () => {
    const body = await fixture("gql-validation-error.json");
    stubFetch(() => new Response(body, { status: 400, statusText: "Bad Request" }));
    const io = capture();

    expect(await runSearch(baseOpts)).toBe(1);
    expect(io.out()).toBe("");
    expect(JSON.parse(io.err()).code).toBe("PARSE_FAILED");
  });

  test("a 403 fails as SEARCH_FAILED without retrying", async () => {
    const calls = stubFetch(() => new Response("forbidden", { status: 403, statusText: "Forbidden" }));
    const io = capture();

    expect(await runSearch(baseOpts)).toBe(1);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(io.err()).code).toBe("SEARCH_FAILED");
  });
});

describe("runDetail", () => {
  test("fetches only the canonical posting page, without following redirects", async () => {
    const html = await fixture("detail-text-image.html");
    const calls = stubFetch(() => new Response(html));
    const io = capture();

    expect(await runDetail({ id: "https://linkareer.com/activity/912001?ref=list", format: "json" })).toBe(0);
    expect(calls.map((c) => c.url)).toEqual(["https://linkareer.com/activity/912001"]);
    expect(calls[0].init?.redirect).toBe("manual");
    const job = JSON.parse(io.out());
    expect(job.title).toBe("[샘플마켓] 디지털 마케팅 체험형 인턴 모집");
    expect(job.deadline).toBe("2026-10-27");
  });

  test("plain output says when the description is image-only", async () => {
    const html = await fixture("detail-closed.html");
    stubFetch(() => new Response(html));
    const io = capture();

    expect(await runDetail({ id: "912002", format: "plain" })).toBe(0);
    const out = io.out();
    expect(out).toStartWith("[가상광고] 퍼포먼스 마케터 신입사원 채용\n(주)가상광고 · 서울 송파구");
    expect(out).toContain("Status: CLOSED / EXPIRED");
    expect(out).toContain("Description is image-only:\nhttps://");
    expect(out).not.toMatch(/\n{3,}/);
  });

  test("a missing posting (redirect to the home page) is NOT_FOUND", async () => {
    stubFetch(() => new Response(null, { status: 302, headers: { Location: "https://linkareer.com/" } }));
    const io = capture();

    expect(await runDetail({ id: "999999999", format: "json" })).toBe(1);
    expect(JSON.parse(io.err()).code).toBe("NOT_FOUND");
  });

  test("a non-job activity is UNSUPPORTED_TYPE", async () => {
    const html = await fixture("detail-type1.html");
    stubFetch(() => new Response(html));
    const io = capture();

    expect(await runDetail({ id: "912001", format: "json" })).toBe(1);
    expect(JSON.parse(io.err()).code).toBe("UNSUPPORTED_TYPE");
  });

  test("a page without activity data is PARSE_FAILED", async () => {
    stubFetch(() => new Response("<html><body>changed</body></html>"));
    const io = capture();

    expect(await runDetail({ id: "357883", format: "json" })).toBe(1);
    expect(JSON.parse(io.err()).code).toBe("PARSE_FAILED");
  });
});
