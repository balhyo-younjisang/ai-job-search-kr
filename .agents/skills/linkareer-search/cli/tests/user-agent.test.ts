import { afterEach, describe, expect, test } from "bun:test";
import { gqlFetch, htmlFetch, USER_AGENT } from "../src/helpers";

// Bun's fetch injects an anonymous default User-Agent when code sets none.
// This CLI must say who is asking and how to reach the maintainer, must not
// borrow another agent's identity or pose as a browser, and must not pose as
// the site itself to its API (no Origin or Referer).
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function headerValue(headers: RequestInit["headers"], name: string): string | null {
  if (headers instanceof Headers) return headers.get(name);
  if (Array.isArray(headers)) {
    const found = headers.find(([k]) => k.toLowerCase() === name.toLowerCase());
    return found ? String(found[1]) : null;
  }
  const entry = Object.entries(headers ?? {}).find(([k]) => k.toLowerCase() === name.toLowerCase());
  return entry ? String(entry[1]) : null;
}

function captureInit(body: string): { init?: RequestInit } {
  const seen: { init?: RequestInit } = {};
  globalThis.fetch = (async (_url: string | URL | Request, i?: RequestInit) => {
    seen.init = i;
    return new Response(body, { status: 200 });
  }) as unknown as typeof fetch;
  return seen;
}

describe("User-Agent", () => {
  test("htmlFetch sends the shared User-Agent and asks for Korean HTML", async () => {
    const seen = captureInit("<html></html>");
    await htmlFetch("https://linkareer.com/activity/1");
    expect(headerValue(seen.init?.headers, "User-Agent")).toBe(USER_AGENT);
    expect(headerValue(seen.init?.headers, "Accept")).toContain("text/html");
    expect(headerValue(seen.init?.headers, "Accept-Language")).toStartWith("ko");
  });

  test("gqlFetch sends the shared User-Agent and no Origin or Referer", async () => {
    const seen = captureInit(JSON.stringify({ data: {} }));
    await gqlFetch("{ ok }", {});
    expect(headerValue(seen.init?.headers, "User-Agent")).toBe(USER_AGENT);
    expect(headerValue(seen.init?.headers, "Content-Type")).toBe("application/json");
    expect(headerValue(seen.init?.headers, "Origin")).toBeNull();
    expect(headerValue(seen.init?.headers, "Referer")).toBeNull();
  });

  test("names this project and a contact URL", () => {
    expect(USER_AGENT).toContain("ai-job-search-kr/");
    expect(USER_AGENT).toContain("linkareer-search");
    expect(USER_AGENT).toMatch(/\+https:\/\/github\.com\/[^/\s;)]+\/ai-job-search-kr/);
  });

  test("does not impersonate another agent or the portal", () => {
    expect(USER_AGENT).not.toMatch(/claude|anthropic|gptbot|bot\b|scrapy|crawler|chrome|safari|linkareer-cli/i);
  });
});
