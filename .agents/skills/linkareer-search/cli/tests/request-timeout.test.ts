import { afterEach, describe, expect, test } from "bun:test";
import { gqlFetch, htmlFetch } from "../src/helpers";

// A stalled upstream connection (accepted socket, no response) would otherwise
// hang the CLI forever - fetch has no default timeout. Assert both request
// wrappers carry an AbortSignal timeout.
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function captureInit(body: string): { init?: RequestInit } {
  const seen: { init?: RequestInit } = {};
  globalThis.fetch = (async (_url: string | URL | Request, i?: RequestInit) => {
    seen.init = i;
    return new Response(body, { status: 200 });
  }) as unknown as typeof fetch;
  return seen;
}

describe("request timeouts", () => {
  test("htmlFetch passes an AbortSignal timeout to fetch", async () => {
    const seen = captureInit("<html></html>");
    await htmlFetch("https://linkareer.com/activity/1");
    expect(seen.init?.signal).toBeInstanceOf(AbortSignal);
  });

  test("gqlFetch passes an AbortSignal timeout to fetch", async () => {
    const seen = captureInit(JSON.stringify({ data: {} }));
    await gqlFetch("{ ok }", {});
    expect(seen.init?.signal).toBeInstanceOf(AbortSignal);
  });
});
