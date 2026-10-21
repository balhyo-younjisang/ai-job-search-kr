import { describe, expect, test } from "bun:test";
import { runCLI } from "./helpers";

// Every case here is rejected before any request is made, so the suite runs
// offline. The contract (add-portal.md): exit 1, a JSON error on stderr,
// nothing on stdout.
function expectJsonError(result: { stdout: string; stderr: string; exitCode: number }, code: string) {
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  const err = JSON.parse(result.stderr);
  expect(err.code).toBe(code);
  expect(typeof err.error).toBe("string");
}

describe("search flag validation", () => {
  test("an unknown flag is rejected, never silently dropped", async () => {
    expectJsonError(await runCLI(["search", "-q", "백엔드", "--locaton", "서울"]), "UNKNOWN_FLAG");
  });

  test("--query is required", async () => {
    expectJsonError(await runCLI(["search", "-l", "서울"]), "NO_QUERY");
    expectJsonError(await runCLI(["search", "-q", "   "]), "NO_QUERY");
  });

  test("--location needs a value", async () => {
    expectJsonError(await runCLI(["search", "-q", "백엔드", "-l"]), "BAD_ARG");
  });

  test("an ambiguous district is rejected with the choices", async () => {
    const result = await runCLI(["search", "-q", "백엔드", "-l", "중구"]);
    expectJsonError(result, "BAD_ARG");
    expect(JSON.parse(result.stderr).error).toContain("서울 중구");
  });

  test.each([
    ["--page", "0"],
    ["--page", "-1"],
    ["--limit", "abc"],
    ["--page", "0.5"],
  ])("%s %s is rejected", async (flag, value) => {
    expectJsonError(await runCLI(["search", "-q", "백엔드", flag, value]), "BAD_ARG");
  });

  test("--jobage is not a search flag (Saramin has no posting-date filter)", async () => {
    expectJsonError(await runCLI(["search", "-q", "백엔드", "--jobage", "7"]), "UNKNOWN_FLAG");
  });

  test("--format, --sort and --career only take their documented values", async () => {
    expectJsonError(await runCLI(["search", "-q", "백엔드", "--format", "xml"]), "BAD_ARG");
    expectJsonError(await runCLI(["search", "-q", "백엔드", "--sort", "newest"]), "BAD_ARG");
    expectJsonError(await runCLI(["search", "-q", "백엔드", "--career", "senior"]), "BAD_ARG");
  });
});

describe("detail argument validation", () => {
  test("an id is required", async () => {
    expectJsonError(await runCLI(["detail"]), "NO_ID");
  });

  test("a non-Saramin URL is rejected before any request", async () => {
    expectJsonError(await runCLI(["detail", "https://boards.greenhouse.io/acme/jobs/55210151"]), "BAD_ID");
  });

  test("detail has no table format", async () => {
    expectJsonError(await runCLI(["detail", "55210151", "--format", "table"]), "BAD_ARG");
  });

  test("detail rejects search-only flags", async () => {
    expectJsonError(await runCLI(["detail", "55210151", "--career", "new"]), "UNKNOWN_FLAG");
  });
});

describe("commands", () => {
  test("an unknown command is rejected", async () => {
    expectJsonError(await runCLI(["serch", "-q", "x"]), "BAD_CMD");
  });

  test("--help prints usage and exits 0", async () => {
    const result = await runCLI(["search", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("saramin-cli");
  });
});
