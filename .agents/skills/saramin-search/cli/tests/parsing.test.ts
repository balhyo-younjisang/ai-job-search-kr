import { describe, expect, test } from "bun:test";
import { join } from "path";
import {
  AmbiguousLocationError,
  displayWidth,
  dottedDate,
  fitColumn,
  isBeforeDeadline,
  koreaDate,
  PageShapeError,
  parseCompany,
  parseDeadlineLabel,
  parseDescription,
  parsePeriod,
  parseSearchPage,
  parseSummary,
  parseTitle,
  resolveLocation,
  shortDate,
  type JobCard,
} from "../src/helpers";
import { buildDetail, normalizeId } from "../src/commands/detail";
import { buildUrl } from "../src/commands/search";

// Offline parser tests against synthetic pages that mirror Saramin's markup
// (see fixtures/provenance.md). The search fixture is pinned to
// 2026-10-20 00:37 KST, which relative deadline labels ("내일마감") need.
const fixture = (name: string) => Bun.file(join(import.meta.dir, "fixtures", name)).text();
const CAPTURED = new Date("2026-10-19T15:37:00Z");

describe("parseSearchPage (search page fixture)", () => {
  test("returns the cards inside the result list, with the total", async () => {
    const page = parseSearchPage(await fixture("search-page.html"), CAPTURED);
    expect(page.results.map((r) => r.id)).toEqual(["59000001", "59000002", "59000003", "59000004"]);
    expect(page.total).toBe(1234);
  });

  test("ignores recommendation cards outside the result list", async () => {
    const html = await fixture("search-page.html");
    const outside = html.match(/class="not_related"[\s\S]*?value="(\d+)"/)![1];
    const page = parseSearchPage(html, CAPTURED);
    expect(page.results.some((r) => r.id === outside)).toBe(false);
  });

  test("maps a card with a registration date and a dated deadline", async () => {
    const [first] = parseSearchPage(await fixture("search-page.html"), CAPTURED).results;
    expect(first).toEqual({
      id: "59000001",
      title: "[플랫폼개발팀] 백엔드 웹개발자 정규직 채용",
      company: "(주)예시테크",
      location: "부산 강서구",
      date: "2026-10-19",
      modifiedDate: null,
      deadline: "2026-11-18",
      alwaysOpen: false,
      career: "경력무관",
      education: "대졸↑",
      employmentType: "정규직",
      jobCategory: "백엔드/서버개발, 웹개발, AI(인공지능), 앱개발, 게임개발",
      url: "https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=59000001",
    });
  });

  test("a card showing only a modification date has no posting date", async () => {
    const card = parseSearchPage(await fixture("search-page.html"), CAPTURED).results[1];
    expect(card.date).toBeNull();
    expect(card.modifiedDate).toBe("2026-10-07");
    expect(card.deadline).toBe("2026-10-21"); // 내일마감, relative to capture time
  });

  test("a 채용시 card is open until filled", async () => {
    const card = parseSearchPage(await fixture("search-page.html"), CAPTURED).results[2];
    expect(card.deadline).toBeNull();
    expect(card.alwaysOpen).toBe(true);
  });

  test("a genuine zero-result page parses to an empty list", async () => {
    expect(parseSearchPage(await fixture("search-no-result.html"), CAPTURED)).toEqual({ results: [], total: 0 });
  });

  test("a page with neither a result list nor a no-result notice throws PageShapeError", () => {
    expect(() => parseSearchPage("<html><body>maintenance</body></html>")).toThrow(PageShapeError);
  });

  test("one malformed card is skipped without losing the rest", () => {
    const html =
      '<div id="recruit_info_list"><div class="content">' +
      '<div class="item_recruit" value="11111111"><h2 class="job_tit"><a title="정상 공고">x</a></h2></div>' +
      '<div class="item_recruit" value="22222222"><h2 class="job_tit"></h2></div>' +
      '<div class="item_recruit" value="33333333"><h2 class="job_tit"><a title="두번째 공고">y</a></h2></div>' +
      "</div></div>";
    const { results } = parseSearchPage(html, CAPTURED);
    expect(results.map((r) => r.id)).toEqual(["11111111", "33333333"]);
    for (const key of ["company", "location", "date", "deadline", "career", "jobCategory"]) {
      expect(results[0]).toHaveProperty(key, null);
    }
  });
});

describe("dates", () => {
  test("card and detail date formats", () => {
    expect(shortDate("등록일 26/10/19")).toBe("2026-10-19");
    expect(dottedDate("2026.10.21 23:59")).toBe("2026-10-21");
    expect(shortDate("없음")).toBeNull();
  });

  test("deadline labels resolve against Korea time, rolling the year forward", () => {
    const now = new Date("2026-12-30T16:00:00Z"); // 2026-12-31 01:00 KST
    expect(parseDeadlineLabel("~ 01/05(화)", now)).toEqual({ deadline: "2027-01-05", alwaysOpen: false });
    expect(parseDeadlineLabel("~ 12/31(목)", now)).toEqual({ deadline: "2026-12-31", alwaysOpen: false });
    expect(parseDeadlineLabel("오늘마감", now)).toEqual({ deadline: "2026-12-31", alwaysOpen: false });
    expect(parseDeadlineLabel("내일마감", now)).toEqual({ deadline: "2027-01-01", alwaysOpen: false });
    expect(parseDeadlineLabel("채용시", now)).toEqual({ deadline: null, alwaysOpen: true });
    expect(parseDeadlineLabel("상시채용", now)).toEqual({ deadline: null, alwaysOpen: true });
    expect(parseDeadlineLabel("", now)).toEqual({ deadline: null, alwaysOpen: false });
  });

  test("koreaDate uses UTC+9", () => {
    expect(koreaDate(0, CAPTURED)).toBe("2026-10-20");
    expect(koreaDate(3, CAPTURED)).toBe("2026-10-17");
  });

  test("isBeforeDeadline reads the end time as Korea time", () => {
    const now = new Date("2026-10-21T14:00:00Z"); // 23:00 KST
    expect(isBeforeDeadline("2026.10.21 23:59", now)).toBe(true);
    expect(isBeforeDeadline("2026.10.21 22:59", now)).toBe(false);
    expect(isBeforeDeadline(null, now)).toBe(true);
  });
});

describe("resolveLocation", () => {
  test("provinces map to loc_mcd, full names included", () => {
    expect(resolveLocation("서울")).toMatchObject({ param: "loc_mcd", code: "101000" });
    expect(resolveLocation("경기도")).toMatchObject({ param: "loc_mcd", code: "102000" });
    expect(resolveLocation("충청남도")).toMatchObject({ param: "loc_mcd", code: "115000" });
    expect(resolveLocation("세종특별자치시")).toMatchObject({ param: "loc_mcd", code: "118000" });
    expect(resolveLocation("광주")).toMatchObject({ param: "loc_mcd", code: "112000" });
  });

  test("districts map to loc_cd, with or without their city or province", () => {
    expect(resolveLocation("강남구")).toMatchObject({ param: "loc_cd", code: "101010" });
    expect(resolveLocation("분당구")).toMatchObject({ param: "loc_cd", code: "102190" });
    expect(resolveLocation("성남시 분당구")).toMatchObject({ param: "loc_cd", code: "102190" });
    expect(resolveLocation("성남")).toMatchObject({ param: "loc_cd", code: "102180" });
    expect(resolveLocation("광주시")).toMatchObject({ param: "loc_cd", code: "102080" });
    expect(resolveLocation("부산 중구")).toMatchObject({ param: "loc_cd", code: "106150" });
  });

  test("a district name shared by several provinces throws, listing the choices", () => {
    expect(() => resolveLocation("중구")).toThrow(AmbiguousLocationError);
    expect(() => resolveLocation("중구")).toThrow(/부산 중구/);
  });

  test("a place without a region code falls back to the keyword", () => {
    expect(resolveLocation("판교")).toEqual({ kind: "keyword" });
  });
});

describe("buildUrl", () => {
  const base = { query: "백엔드", sort: "relevance" as const, page: 1, format: "json" as const };

  test("sends the keyword, page, and page size by default", () => {
    const url = new URL(buildUrl(base));
    expect(url.origin + url.pathname).toBe("https://www.saramin.co.kr/zf_user/search/recruit");
    expect(url.searchParams.get("searchword")).toBe("백엔드");
    expect(url.searchParams.get("recruitPage")).toBe("1");
    expect(url.searchParams.get("recruitPageCount")).toBe("40");
    for (const p of ["exp_cd", "loc_mcd", "loc_cd", "recruitSort"]) expect(url.searchParams.has(p)).toBe(false);
  });

  test("maps filters to Saramin parameters", () => {
    const url = new URL(buildUrl({ ...base, location: "강남구", career: "new", sort: "date", page: 2 }));
    expect(url.searchParams.get("loc_cd")).toBe("101010");
    expect(url.searchParams.get("exp_cd")).toBe("1");
    expect(url.searchParams.get("recruitSort")).toBe("reg_dt");
    expect(url.searchParams.get("recruitPage")).toBe("2");
    expect(url.searchParams.get("searchword")).toBe("백엔드");
  });

  test("relevance stays the default sort; an uncoded place joins the keyword", () => {
    const url = new URL(buildUrl({ ...base, location: "판교" }));
    expect(url.searchParams.has("recruitSort")).toBe(false);
    expect(url.searchParams.get("searchword")).toBe("백엔드 판교");
    expect(url.searchParams.has("loc_cd")).toBe(false);
  });
});

describe("detail parsing", () => {
  test("header and summary of an active posting", async () => {
    const html = await fixture("detail-active.html");
    expect(parseTitle(html)).toBe("[샘플그룹] 결제 플랫폼 백엔드 경력 채용");
    expect(parseCompany(html)).toBe("(주)샘플소프트");
    expect(parseSummary(html)).toMatchObject({
      경력: "경력 3~15년",
      학력: "대졸(4년제) 이상",
      근무형태: "정규직, 인턴직",
      급여: "면접 후 결정",
      "직급/직책": "면접 후 결정",
      근무지역: "서울 송파구, 서울전체",
    });
    expect(parsePeriod(html)).toEqual({
      start: "2026-10-07", end: "2026-10-21", endTime: "2026.10.21 23:59", closed: false, alwaysOpen: false,
    });
  });

  test("an open-until-filled posting has a start date and no end", async () => {
    expect(parsePeriod(await fixture("detail-always-open.html"))).toMatchObject({
      start: "2026-09-29", end: null, closed: false, alwaysOpen: true,
    });
  });

  test("a closed posting is marked closed", async () => {
    expect(parsePeriod(await fixture("detail-closed.html"))).toMatchObject({
      start: "2025-02-13", end: "2025-02-28", closed: true,
    });
  });

  test("a description with text and images returns both", async () => {
    const { text, images } = parseDescription(await fixture("description-mixed.html"));
    expect(text!.split("\n").slice(0, 2)).toEqual(["접수방법 및 기간", "ㆍ접수방법 : 사람인 온라인 입사지원"]);
    expect(text).not.toMatch(/&nbsp;|<[a-z]/i);
    expect(images.length).toBeGreaterThan(1);
    for (const url of images) expect(url).toStartWith("https://");
  });

  test("a text-only description has no images", async () => {
    const { text, images } = parseDescription(await fixture("description-text.html"));
    expect(text).toStartWith("[직무내용] 예시식품은");
    expect(images).toEqual([]);
  });

  test("buildDetail combines summary, period and description", async () => {
    const now = new Date("2026-10-20T00:00:00Z");
    const job = buildDetail("59000003", await fixture("detail-always-open.html"), "", now);
    expect(job).toMatchObject({
      id: "59000003",
      title: "예약 서비스 백엔드 개발자 [Spring]",
      company: "가상헬스",
      location: "서울 종로구",
      date: "2026-09-29",
      deadline: null,
      alwaysOpen: true,
      employmentType: "파견직",
      experience: "경력무관(신입포함)",
      education: "학력무관",
      salary: "면접 후 결정",
      position: null,
      description: null,
      descriptionImages: [],
      isActive: true,
    });
    const closed = buildDetail("59000005", await fixture("detail-closed.html"), "", now);
    expect(closed).toMatchObject({ deadline: "2025-02-28", salary: "연봉 2,800 만원", isActive: false });
  });

  test("buildDetail returns null when the page has no title", () => {
    expect(buildDetail("59000002", "<html></html>", "")).toBeNull();
  });
});

describe("normalizeId", () => {
  test("accepts ids and Saramin URLs carrying rec_idx", () => {
    expect(normalizeId("59000002")).toBe("59000002");
    expect(normalizeId("https://www.saramin.co.kr/zf_user/jobs/relay/view?view_type=search&rec_idx=59000002&location=ts")).toBe("59000002");
    expect(normalizeId("www.saramin.co.kr/zf_user/jobs/view?rec_idx=59000002")).toBe("59000002");
    expect(normalizeId("https://m.saramin.co.kr/job-search/view?rec_idx=59000002")).toBe("59000002");
  });

  test("rejects other hosts, look-alikes, and URLs without rec_idx", () => {
    expect(normalizeId("https://boards.greenhouse.io/acme/jobs/59000002?rec_idx=59000002")).toBeNull();
    expect(normalizeId("https://www.saramin.co.kr.evil.io/zf_user/jobs/view?rec_idx=59000002")).toBeNull();
    expect(normalizeId("https://www.saramin.co.kr@evil.io/zf_user/jobs/view?rec_idx=59000002")).toBeNull();
    expect(normalizeId("https://www.saramin.co.kr/zf_user/company-info/view?csn=abc")).toBeNull();
    expect(normalizeId("123")).toBeNull();
  });
});

describe("table layout helpers", () => {
  test("Hangul counts as two columns", () => {
    expect(displayWidth("사람인")).toBe(6);
    expect(displayWidth("AI백엔드")).toBe(8);
  });

  test("fitColumn truncates and pads to an exact display width", () => {
    expect(fitColumn("백엔드 개발자", 7)).toBe("백엔드 ");
    expect(fitColumn("가나다", 5)).toBe("가나 ");
    expect(fitColumn("ab", 4)).toBe("ab  ");
  });
});
