import { afterEach, describe, expect, test } from "bun:test"

import { DETAIL_URL, SEARCH_URL, USER_AGENT, htmlFetch } from "../src/helpers.js"

const originalFetch = globalThis.fetch
const originalSetTimeout = globalThis.setTimeout

afterEach(() => {
  globalThis.fetch = originalFetch
  globalThis.setTimeout = originalSetTimeout
})

function headerValue(headers: RequestInit["headers"], name: string): string | null {
  if (headers instanceof Headers) return headers.get(name)
  if (Array.isArray(headers)) {
    const found = headers.find(([key]) => key.toLowerCase() === name.toLowerCase())
    return found ? String(found[1]) : null
  }
  const entry = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name.toLowerCase())
  return entry ? String(entry[1]) : null
}

describe("htmlFetch request contract", () => {
  test("identifies this project, requests Korean HTML, disables redirects, and carries a timeout signal", async () => {
    let init: RequestInit | undefined
    globalThis.fetch = (async (_input: string | URL | Request, requestInit?: RequestInit) => {
      init = requestInit
      return new Response("<html>ok</html>", { headers: { "content-type": "text/html; charset=utf-8" } })
    }) as unknown as typeof fetch

    expect(await htmlFetch(`${SEARCH_URL}?col=job&kw=test`)).toContain("ok")
    expect(headerValue(init?.headers, "User-Agent")).toBe(USER_AGENT)
    expect(USER_AGENT).toContain("ai-job-search-kr/")
    expect(USER_AGENT).toContain("incruit-search")
    expect(USER_AGENT).toMatch(/\+https:\/\/github\.com\/[^/\s;)]+\/ai-job-search-kr/)
    expect(USER_AGENT).not.toMatch(/claude|anthropic|gptbot|scrapy|crawler|chrome|safari/i)
    expect(headerValue(init?.headers, "Accept")).toContain("text/html")
    expect(headerValue(init?.headers, "Accept-Language")).toStartWith("ko")
    expect(init?.redirect).toBe("manual")
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  test("returns an empty result for Incruit's missing-posting redirect without following it", async () => {
    let calls = 0
    let init: RequestInit | undefined
    globalThis.fetch = (async (_input: string | URL | Request, requestInit?: RequestInit) => {
      calls++
      init = requestInit
      return new Response("", {
        status: 302,
        headers: { location: "https://job.incruit.com/jobdb_list/searchjob.asp?from=jobpostnone" },
      })
    }) as unknown as typeof fetch

    expect(await htmlFetch(`${DETAIL_URL}?job=2610060004924`)).toBe("")
    expect(calls).toBe(1)
    expect(init?.redirect).toBe("manual")
  })

  test("fails a 403 immediately without retrying", async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      return new Response("", { status: 403, statusText: "Forbidden" })
    }) as unknown as typeof fetch

    await expect(htmlFetch(`${SEARCH_URL}?col=job&kw=test`)).rejects.toThrow("Request failed: 403 Forbidden")
    expect(calls).toBe(1)
  })

  test("backs off once after 429 and succeeds on the bounded retry", async () => {
    let calls = 0
    const delays: number[] = []
    globalThis.setTimeout = ((callback: () => void, delay?: number) => {
      delays.push(delay ?? 0)
      return originalSetTimeout(callback, 0)
    }) as unknown as typeof setTimeout
    globalThis.fetch = (async () => {
      calls++
      return calls === 1
        ? new Response("", { status: 429 })
        : new Response("<html>recovered</html>", { headers: { "content-type": "text/html; charset=utf-8" } })
    }) as unknown as typeof fetch

    expect(await htmlFetch(`${SEARCH_URL}?col=job&kw=test`)).toContain("recovered")
    expect(calls).toBe(2)
    expect(delays).toHaveLength(1)
    expect(delays[0]).toBeGreaterThanOrEqual(500)
    expect(delays[0]).toBeLessThan(1000)
  })
})
