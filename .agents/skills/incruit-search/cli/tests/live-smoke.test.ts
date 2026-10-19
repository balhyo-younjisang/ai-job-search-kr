import { expect, test } from "bun:test"
import { parseJSON, runCLI } from "./helpers.js"

test.skipIf(process.env.INCRUIT_LIVE !== "1")("live search and one detail", async () => {
  const search = parseJSON<{ results: Array<{ id: string; title: string; company: string; url: string }> }>(
    await runCLI(["search", "-q", "백엔드", "--limit", "1"]),
  )
  expect(search.results.length).toBeGreaterThan(0)
  const card = search.results[0]
  expect(card.title).toBeTruthy()
  expect(card.company).toBeTruthy()
  expect(card.url).toStartWith("https://job.incruit.com/")
  const detail = parseJSON<{ id: string; title: string; description: string | null; descriptionImages: string[] }>(
    await runCLI(["detail", card.url]),
  )
  expect(detail.id).toBe(card.id)
  expect(detail.title).toBeTruthy()
  expect(Boolean(detail.description) || detail.descriptionImages.length > 0).toBeTrue()
}, 90000)
