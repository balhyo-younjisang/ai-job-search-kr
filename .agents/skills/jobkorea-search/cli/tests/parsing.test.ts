import { describe, expect, test } from "bun:test";
import { join } from "path";
import {
  careerLabel,
  deadlineOf,
  displayWidth,
  educationLabel,
  extractJsonObject,
  extractRscPayload,
  fitColumn,
  isStillActive,
  koreaDate,
  pageSaysAlwaysOpen,
  parseCardChips,
  parseDescription,
  parseJobList,
  parseJsonLd,
  parseSearchPage,
  parseSummaryTable,
  periodCode,
  PageShapeError,
} from "../src/helpers";
import { buildDetail, normalizeId } from "../src/commands/detail";
import { buildUrl } from "../src/commands/search";

// Offline parser tests against synthetic pages that mirror JobKorea's markup
// (see fixtures/provenance.md).
const fixture = (name: string) => Bun.file(join(import.meta.dir, "fixtures", name)).text();

/** Wrap a flight payload in push() chunks the way a Next.js page streams it. */
function pageWithPayload(payload: string, body = ""): string {
  const mid = Math.floor(payload.length / 2);
  return (
    `<html><body>${body}` +
    [payload.slice(0, mid), payload.slice(mid)]
      .map((part) => `<script>self.__next_f.push([1,${JSON.stringify(part)}])</script>`)
      .join("") +
    "</body></html>"
  );
}

function jobListPayload(content: unknown[], total = content.length): string {
  const query = {
    dehydratedAt: 1,
    state: { data: { pageSize: 20, pageNumber: 0, totalElements: total, totalPages: 1, content } },
    queryKey: ["JOB_LIST", 20, 0],
    queryHash: "x",
  };
  return `13:[["$","$L28",null,{"state":{"mutations":[],"queries":[${JSON.stringify(query)}]}}]]\n`;
}

describe("parseSearchPage (search page fixture)", () => {
  test("returns the organic JOB_LIST results in order, with totals", async () => {
    const page = parseSearchPage(await fixture("search-page.html"));
    expect(page.results.map((r) => r.id)).toEqual(["59100001", "59100002", "59100003"]);
    expect(page.total).toBe(1234);
    expect(page.totalPages).toBe(62);
  });

  test("ignores the premium block and ad cards that sit beside the organic list", async () => {
    const page = parseSearchPage(await fixture("search-page.html"));
    // 59100009 is both the decoy premium-list entry and an sc=808 ad card.
    expect(page.results.some((r) => r.id === "59100009")).toBe(false);
  });

  test("maps one posting's fields, with the location chip from its card", async () => {
    const page = parseSearchPage(await fixture("search-page.html"));
    expect(page.results[2]).toEqual({
      id: "59100003",
      title: "AI백엔드 엔지니어 경력 모집",
      company: "㈜가상러닝",
      location: "서울 구로구",
      areaCodes: ["I070"],
      date: "2026-09-17",
      deadline: "2026-11-16",
      alwaysOpen: false,
      career: "경력 5년↑",
      education: "학력무관",
      jobCategory: "솔루션·SI·CRM·ERP, 백엔드개발자, AI/ML엔지니어",
      url: "https://www.jobkorea.co.kr/Recruit/GI_Read/59100003",
    });
  });

  test("an always-open posting (end 2070-01-01) has no deadline", async () => {
    const page = parseSearchPage(await fixture("search-page.html"));
    const open = page.results.find((r) => r.id === "59100002")!;
    expect(open.deadline).toBeNull();
    expect(open.alwaysOpen).toBe(true);
  });

  test("urls are canonical, without the tracking parameters search links carry", async () => {
    const page = parseSearchPage(await fixture("search-page.html"));
    for (const r of page.results) expect(r.url).toBe(`https://www.jobkorea.co.kr/Recruit/GI_Read/${r.id}`);
  });
});

describe("parseSearchPage (synthetic payloads)", () => {
  test("a zero-result search parses to an empty list, not an error", () => {
    const page = parseSearchPage(pageWithPayload(jobListPayload([], 0)));
    expect(page.results).toEqual([]);
    expect(page.total).toBe(0);
  });

  test("a page without a JOB_LIST entry throws PageShapeError", () => {
    expect(() => parseSearchPage("<html><body>nothing here</body></html>")).toThrow(PageShapeError);
  });

  test("one malformed entry is skipped without losing the rest", () => {
    const page = parseSearchPage(
      pageWithPayload(
        jobListPayload([
          { id: "50000001", title: "정상 공고", createdAt: "2026-10-01T09:00:00+09:00" },
          { id: "not-a-number", title: "잘못된 id" },
          { id: "50000002" },
          null,
          { id: "50000003", title: "두번째 정상 공고", applicationPeriod: null },
        ]),
      ),
    );
    expect(page.results.map((r) => r.id)).toEqual(["50000001", "50000003"]);
    expect(page.results[0].date).toBe("2026-10-01");
    expect(page.results[1].deadline).toBeNull();
  });

  test("missing values are null, never omitted", () => {
    const [r] = parseSearchPage(pageWithPayload(jobListPayload([{ id: "50000001", title: "t" }]))).results;
    for (const key of ["company", "location", "date", "deadline", "career", "education", "jobCategory"]) {
      expect(r).toHaveProperty(key, null);
    }
  });

  test("falls back to jobClassificationOrIndustry when the card is missing", () => {
    const [r] = parseSearchPage(
      pageWithPayload(jobListPayload([{ id: "50000001", title: "t", jobClassificationOrIndustry: ",백엔드개발자,AI/ML엔지니어," }])),
    ).results;
    expect(r.jobCategory).toBe("백엔드개발자, AI/ML엔지니어");
  });
});

describe("RSC helpers", () => {
  test("extractRscPayload joins chunks split mid-record", () => {
    const html = pageWithPayload('1:{"a":"한글 \\"quoted\\""}\n');
    expect(extractRscPayload(html)).toBe('1:{"a":"한글 \\"quoted\\""}\n');
  });

  test("extractJsonObject skips braces inside strings", () => {
    const text = 'x{"a":"}{","b":{"c":1}}tail';
    expect(extractJsonObject(text, 1)).toBe('{"a":"}{","b":{"c":1}}');
    expect(extractJsonObject(text, 0)).toBeNull();
    expect(extractJsonObject('{"open":', 0)).toBeNull();
  });

  test("parseJobList tolerates whitespace in the serialized query", () => {
    const payload = '{ "dehydratedAt" : 1, "state": {"data": {"totalElements": 5, "totalPages": 1, "content": []}}, "queryKey" : [ "JOB_LIST", 20]}';
    expect(parseJobList(payload)).toEqual({ content: [], totalElements: 5, totalPages: 1 });
  });

  test("parseCardChips reads location and job category per card, first card wins", async () => {
    const chips = parseCardChips(await fixture("search-page.html"));
    expect(chips.get("59100002")).toEqual({ location: "경기 성남시", jobCategory: "네트워크·통신서비스, 백엔드개발자" });
    expect(chips.get("59100001")?.location).toBe("서울 서초구 외 1");
  });
});

describe("code labels", () => {
  test("careerLabel mirrors JobKorea's wording", () => {
    expect(careerLabel("1", 0)).toBe("신입");
    expect(careerLabel("2", 5)).toBe("경력 5년↑");
    expect(careerLabel("2", 0)).toBe("경력");
    expect(careerLabel("2", 100)).toBe("경력");
    expect(careerLabel("3", 0)).toBe("신입·경력");
    expect(careerLabel("4", 0)).toBe("경력무관");
    expect(careerLabel(undefined, 0)).toBeNull();
  });

  test("educationLabel maps 3-7, treats other codes as 학력무관, missing as null", () => {
    expect(educationLabel("5")).toBe("대졸↑");
    expect(educationLabel("7")).toBe("박사↑");
    expect(educationLabel("0")).toBe("학력무관");
    expect(educationLabel("255")).toBe("학력무관");
    expect(educationLabel(undefined)).toBeNull();
    expect(educationLabel(null)).toBeNull();
  });

  test("deadlineOf flags far-future end dates as always open", () => {
    expect(deadlineOf("2070-01-01T00:00:00+09:00")).toEqual({ deadline: null, alwaysOpen: true });
    expect(deadlineOf("2026-11-16T23:00:00+09:00")).toEqual({ deadline: "2026-11-16", alwaysOpen: false });
    expect(deadlineOf(undefined)).toEqual({ deadline: null, alwaysOpen: false });
  });

  test("periodCode picks the smallest JobKorea bucket covering the window", () => {
    expect(periodCode(1)).toBe("2");
    expect(periodCode(2)).toBe("3");
    expect(periodCode(3)).toBe("3");
    expect(periodCode(7)).toBe("4");
    expect(periodCode(14)).toBe("5");
    expect(periodCode(31)).toBe("5");
    expect(periodCode(90)).toBeNull();
  });

  test("koreaDate uses UTC+9", () => {
    // 2026-10-19 16:30 UTC is already 2026-10-20 in Korea.
    const now = new Date("2026-10-19T16:30:00Z");
    expect(koreaDate(0, now)).toBe("2026-10-20");
    expect(koreaDate(3, now)).toBe("2026-10-17");
  });
});

describe("buildUrl", () => {
  const base = { query: "백엔드", sort: "relevance" as const, page: 1, format: "json" as const };

  test("sends the keyword and page, nothing else by default", () => {
    const url = new URL(buildUrl(base));
    expect(url.origin + url.pathname).toBe("https://www.jobkorea.co.kr/Search/");
    expect(url.searchParams.get("stext")).toBe("백엔드");
    expect(url.searchParams.get("tabType")).toBe("recruit");
    expect(url.searchParams.get("Page_No")).toBe("1");
    for (const p of ["careerType", "period", "ord", "local"]) expect(url.searchParams.has(p)).toBe(false);
  });

  test("location rides in the keyword; filters map to JobKorea parameters", () => {
    const url = new URL(buildUrl({ ...base, location: "판교", career: "experienced", jobage: 7, sort: "date", page: 3 }));
    expect(url.searchParams.get("stext")).toBe("백엔드 판교");
    expect(url.searchParams.get("careerType")).toBe("2");
    expect(url.searchParams.get("period")).toBe("4");
    expect(url.searchParams.get("ord")).toBe("RegDtDesc");
    expect(url.searchParams.get("Page_No")).toBe("3");
  });
});

describe("detail parsing", () => {
  test("parseJsonLd finds the JobPosting block", async () => {
    const ld = parseJsonLd(await fixture("detail.html"));
    expect(ld?.title).toBe("AI백엔드 엔지니어 경력 모집");
    expect(ld?.validThrough).toBe("2026-11-16T23:59");
  });

  test("parseSummaryTable reads clean label/value pairs", async () => {
    const summary = parseSummaryTable(await fixture("detail.html"));
    expect(summary["고용형태"]).toBe("정규직 (수습 3개월)");
    expect(summary["급여"]).toBe("회사 내규에 따름 (면접 후 결정)");
    expect(summary["근무시간"]).toBe("주5일(월~금) 09:00 ~ 18:00");
    expect(summary["근무지주소"]).toBe("서울 구로구 예시로 123 (구로동, 샘플타워) 601호");
    for (const value of Object.values(summary)) expect(value).not.toMatch(/[<>]/);
  });

  test("a text description keeps its line structure", async () => {
    const { text, images } = parseDescription(await fixture("description-text.html"));
    expect(images).toEqual([]);
    const lines = text!.split("\n");
    expect(lines.slice(0, 3)).toEqual(["샘플커머스(주)", "파트너 플랫폼 백엔드 개발자 모집", "포지션 및 자격요건"]);
    expect(lines).toContain("담당업무");
    expect(lines).toContain("우대사항");
    expect(text).not.toMatch(/&nbsp;|<[a-z]/i);
  });

  test("an image-only description returns null text and the image URL", async () => {
    expect(parseDescription(await fixture("description-image.html"))).toEqual({
      text: null,
      images: ["https://file2.jobkorea.co.kr/Net/Mng/DownImage/CorpEditor?file_No=1000001"],
    });
  });

  test("buildDetail combines JSON-LD, summary, and the image-only description", async () => {
    const job = buildDetail("59100003", await fixture("detail.html"), await fixture("description-image.html"));
    expect(job).toMatchObject({
      id: "59100003",
      title: "AI백엔드 엔지니어 경력 모집",
      company: "㈜가상러닝",
      location: "서울 구로구 예시로 123 (구로동, 샘플타워) 601호",
      date: "2026-09-17",
      deadline: "2026-11-16",
      alwaysOpen: false,
      employmentType: "정규직 (수습 3개월)",
      experience: "경력",
      education: "학력무관",
      salary: "회사 내규에 따름 (면접 후 결정)",
      description: null,
      descriptionImages: ["https://file2.jobkorea.co.kr/Net/Mng/DownImage/CorpEditor?file_No=1000001"],
    });
  });

  test("buildDetail returns null when the page has no JobPosting", () => {
    expect(buildDetail("59100003", "<html></html>", "")).toBeNull();
  });

  test("pageSaysAlwaysOpen reads the rendered 마감일 label", () => {
    expect(pageSaysAlwaysOpen('<span>마감일</span><span class="x">상시채용</span>')).toBe(true);
    expect(pageSaysAlwaysOpen("<span>마감일</span><span>2026.11.16(월)</span>")).toBe(false);
  });

  test("isStillActive reads validThrough as Korea time", () => {
    const now = new Date("2026-11-16T14:00:00Z"); // 23:00 KST
    expect(isStillActive("2026-11-16T23:59", now)).toBe(true);
    expect(isStillActive("2026-11-16T22:59", now)).toBe(false);
    expect(isStillActive("2026-11-15", now)).toBe(false);
    expect(isStillActive(undefined, now)).toBe(true);
    expect(isStillActive("garbage", now)).toBe(true);
  });
});

describe("normalizeId", () => {
  test("accepts ids and JobKorea posting URLs", () => {
    expect(normalizeId("59100002")).toBe("59100002");
    expect(normalizeId(" 59100002 ")).toBe("59100002");
    expect(normalizeId("https://www.jobkorea.co.kr/Recruit/GI_Read/59100002?Oem_Code=C1&logpath=1")).toBe("59100002");
    expect(normalizeId("www.jobkorea.co.kr/Recruit/GI_Read/59100002")).toBe("59100002");
    expect(normalizeId("https://m.jobkorea.co.kr/Recruit/GI_Read/59100002")).toBe("59100002");
    expect(normalizeId("https://www.jobkorea.co.kr/Recruit/GI_Read_Comt_Ifrm?Gno=59100002")).toBe("59100002");
  });

  test("rejects other hosts and look-alikes instead of mining digits", () => {
    expect(normalizeId("https://boards.greenhouse.io/acme/jobs/59100002")).toBeNull();
    expect(normalizeId("https://www.jobkorea.co.kr.evil.io/Recruit/GI_Read/59100002")).toBeNull();
    expect(normalizeId("https://www.jobkorea.co.kr@evil.io/Recruit/GI_Read/59100002")).toBeNull();
    expect(normalizeId("https://www.jobkorea.co.kr/Recruit/Co_Read/C/example")).toBeNull();
    expect(normalizeId("abc")).toBeNull();
    expect(normalizeId("123")).toBeNull();
  });
});

describe("table layout helpers", () => {
  test("Hangul counts as two columns", () => {
    expect(displayWidth("abc")).toBe(3);
    expect(displayWidth("백엔드")).toBe(6);
    expect(displayWidth("AI백엔드")).toBe(8);
  });

  test("fitColumn truncates and pads to an exact display width", () => {
    expect(fitColumn("백엔드 개발자", 7)).toBe("백엔드 ");
    expect(displayWidth(fitColumn("백엔드 개발자", 7))).toBe(7);
    expect(fitColumn("ab", 4)).toBe("ab  ");
    // A wide glyph that would straddle the edge is dropped, then padded.
    expect(fitColumn("가나다", 5)).toBe("가나 ");
  });
});
