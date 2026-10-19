import { afterEach, describe, expect, test } from "bun:test";
import { htmlFetch, USER_AGENT } from "../src/helpers";

// Bun's fetch injects an anonymous default User-Agent when code sets none.
// This CLI must say who is asking and how to reach the maintainer, and must
// not borrow another agent's identity: JobKorea's robots.txt sorts AI agents
// by token (ClaudeBot is fully blocked, Claude-User is not), and a crawler
// that hid its identity is what JobKorea won its scraping lawsuit against.
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function headerValue(headers: RequestInit["headers"], name: string): string | null {
  if (headers instanceof Headers) return headers.get(name);
  if (Array.isArray(headers)) {
    const found = headers.find(([k]) => k === name);
    return found ? String(found[1]) : null;
  }
  const value = headers?.[name];
  return typeof value === "string" ? value : null;
}

describe("User-Agent", () => {
  test("htmlFetch sends the shared User-Agent and asks for Korean HTML", async () => {
    let init: RequestInit | undefined;
    globalThis.fetch = (async (_url: string | URL | Request, i?: RequestInit) => {
      init = i;
      return new Response("<html></html>", { status: 200 });
    }) as unknown as typeof fetch;

    await htmlFetch("https://www.jobkorea.co.kr/Search/?stext=x");
    expect(headerValue(init?.headers, "User-Agent")).toBe(USER_AGENT);
    expect(headerValue(init?.headers, "Accept")).toContain("text/html");
    expect(headerValue(init?.headers, "Accept-Language")).toStartWith("ko");
  });

  test("names this project and a contact URL", () => {
    expect(USER_AGENT).toContain("ai-job-search-kr/");
    expect(USER_AGENT).toContain("jobkorea-search");
    expect(USER_AGENT).toMatch(/\+https:\/\/github\.com\/[^/\s;)]+\/ai-job-search-kr/);
  });

  test("does not impersonate another agent or the portal", () => {
    expect(USER_AGENT).not.toMatch(/claude|anthropic|gptbot|bot\b|scrapy|crawler|chrome|safari|jobkorea-cli/i);
  });
});
