import { describe, expect, test } from "bun:test"

import { parseJSON, runCLI } from "./helpers.js"

describe("CLI argument validation", () => {
  test("rejects unknown flags before making a request", async () => {
    const result = await runCLI(["search", "--query", "개발자", "--bogus"])

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toBe("")
    expect(JSON.parse(result.stderr)).toMatchObject({ code: "UNKNOWN_FLAG" })
  })

  test("rejects invalid formats and numeric options", async () => {
    const cases = [
      ["search", "--query", "개발자", "--format", "csv"],
      ["search", "--query", "개발자", "--page", "0"],
      ["search", "--query", "개발자", "--page", "1.5"],
      ["search", "--query", "개발자", "--limit", "0"],
      ["search", "--query", "개발자", "--limit", "many"],
      ["detail", "2610060004924", "--format", "table"],
    ]

    for (const args of cases) {
      const result = await runCLI(args)
      expect(result.exitCode).toBe(1)
      expect(JSON.parse(result.stderr)).toMatchObject({ code: "BAD_ARG" })
    }
  })

  test("requires the search query and detail id", async () => {
    const noQuery = await runCLI(["search"])
    const noId = await runCLI(["detail"])

    expect(JSON.parse(noQuery.stderr)).toMatchObject({ code: "NO_QUERY" })
    expect(JSON.parse(noId.stderr)).toMatchObject({ code: "NO_ID" })
  })

  test("reports an unknown command", async () => {
    const result = await runCLI(["frobnicate"])
    expect(result.exitCode).toBe(1)
    expect(JSON.parse(result.stderr)).toMatchObject({ code: "BAD_CMD" })
  })

  test("the shared JSON helper includes stderr for a failed command", () => {
    expect(() => parseJSON({ stdout: "", stderr: '{"code":"BAD_ARG"}', exitCode: 1 })).toThrow(
      "CLI exited with code 1",
    )
  })
})
