import { describe, expect, test } from "bun:test"

import { parseJSON, runCLI } from "./helpers.js"

interface CLIError {
  error: string
  code: string
}

describe("CLI argument validation", () => {
  test("rejects unknown flags without making a request", async () => {
    const result = await runCLI(["search", "--query", "개발자", "--bogus"])

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toBe("")
    expect(JSON.parse(result.stderr)).toMatchObject({ code: "UNKNOWN_FLAG" })
  })

  test("rejects conflicting source selections", async () => {
    const result = await runCLI(["search", "--query", "개발자", "--source", "nara", "--all-sources"])

    expect(result.exitCode).toBe(1)
    expect(JSON.parse(result.stderr)).toMatchObject({ code: "CONFLICTING_FLAGS" })
  })

  test("rejects invalid provider, format, and numeric options", async () => {
    const cases: string[][] = [
      ["search", "--query", "개발자", "--source", "unknown-board"],
      ["search", "--query", "개발자", "--format", "csv"],
      ["search", "--query", "개발자", "--page", "0"],
      ["search", "--query", "개발자", "--limit", "1.5"],
      ["detail", "K171112610190045", "--format", "table"],
    ]

    for (const args of cases) {
      const result = await runCLI(args)
      expect(result.exitCode).toBe(1)
      expect(JSON.parse(result.stderr)).toMatchObject({ code: "BAD_ARG" })
    }
  })

  test("requires search query and detail id", async () => {
    const noQuery = await runCLI(["search"])
    const noId = await runCLI(["detail"])

    expect(JSON.parse(noQuery.stderr)).toMatchObject({ code: "NO_QUERY" })
    expect(JSON.parse(noId.stderr)).toMatchObject({ code: "NO_ID" })
  })

  test("the shared parseJSON helper reports a failed CLI result", () => {
    const failed = { stdout: "", stderr: JSON.stringify({ error: "bad", code: "BAD_ARG" } satisfies CLIError), exitCode: 1 }

    expect(() => parseJSON(failed)).toThrow("CLI exited with code 1")
  })
})
