import { describe, expect, test } from "bun:test";
import { join } from "path";
import {
  deadlineOf,
  deref,
  displayWidth,
  fitColumn,
  isStillActive,
  kstDate,
  koreaDate,
  locationOf,
  PageShapeError,
  parseDescription,
  parseDetailPage,
  parseJsonLd,
  parseSearchResponse,
  trimToWindow,
  UnsupportedTypeError,
  type JobCard,
  type SearchData,
} from "../src/helpers";
import { BadLocationError, resolveRegion } from "../src/regions";
import { normalizeId } from "../src/commands/detail";
import { buildVariables } from "../src/commands/search";

// Offline parser tests against real Linkareer responses captured 2026-10-20
// KST (see fixtures/provenance.md).
const fixture = (name: string) => Bun.file(join(import.meta.dir, "fixtures", name));
const CAPTURED = new Date("2026-10-19T16:30:00Z"); // 2026-10-20 01:30 KST

async function searchData(): Promise<SearchData> {
  return (await fixture("gql-search-backend-seoul.json").json()).data;
}

describe("parseSearchResponse (real GraphQL response)", () => {
  test("returns every node as a card, with the total", async () => {
    const { cards, total } = parseSearchResponse(await searchData());
    expect(total).toBe(14);
    expect(cards).toHaveLength(14);
  });

  test("maps an ASAP posting: registration date, no deadline", async () => {
    const [first] = parseSearchResponse(await searchData()).cards;
    expect(first.card).toEqual({
      id: "356881",
      title: "(산업기능요원) 백엔드 엔지니어",
      company: "예시러닝",
      location: "서울 중구",
      date: "2026-10-14",
      recruitStart: "2026-10-14",
      deadline: null,
      alwaysOpen: true,
      recruitType: "ASAP",
      jobTypes: ["경력"],
      jobCategory: "백엔드/서버개발",
      url: "https://linkareer.com/activity/356881",
    });
  });

  test("maps a NORMAL posting's close time to a deadline", async () => {
    const intern = parseSearchResponse(await searchData()).cards.find(({ card }) => card.id === "352865")!.card;
    expect(intern).toMatchObject({ deadline: "2026-11-22", alwaysOpen: false, recruitType: "NORMAL", jobTypes: ["인턴"] });
  });

  test("results are newest first, so dates never increase", async () => {
    const dates = parseSearchResponse(await searchData()).cards.map(({ card }) => card.date!);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  test("one malformed node is skipped without losing the rest", () => {
    const { cards } = parseSearchResponse({
      activities: { totalCount: 3, nodes: [{ id: "1", title: "정상" }, { id: "x", title: "bad id" }, null, { id: "2" }, { id: "3", title: "둘째" }] },
    });
    expect(cards.map(({ card }) => card.id)).toEqual(["1", "3"]);
    for (const key of ["company", "location", "date", "deadline", "jobCategory"]) expect(cards[0].card).toHaveProperty(key, null);
  });

  test("a response without an activities list throws PageShapeError", () => {
    expect(() => parseSearchResponse({})).toThrow(PageShapeError);
  });
});

describe("dates and deadlines", () => {
  test("epoch milliseconds read as Korea-time dates", () => {
    expect(kstDate(1791961279000)).toBe("2026-10-14");
    expect(kstDate(1793113199999)).toBe("2026-10-27"); // 23:59:59.999 KST
    expect(kstDate(null)).toBeNull();
  });

  test("ASAP and ALWAYS expiries are not deadlines", () => {
    expect(deadlineOf("ASAP", 1799765999999)).toEqual({ deadline: null, alwaysOpen: true });
    expect(deadlineOf("ALWAYS", 1799765999999)).toEqual({ deadline: null, alwaysOpen: true });
    expect(deadlineOf("NORMAL", 1793113199999)).toEqual({ deadline: "2026-10-27", alwaysOpen: false });
    expect(deadlineOf("SOMETHING_NEW", 1793113199999)).toEqual({ deadline: null, alwaysOpen: false });
  });

  test("activity is judged by the close time, not the always-OPEN status", () => {
    expect(isStillActive(1793113199999, CAPTURED)).toBe(true);
    expect(isStillActive(1785682799999, CAPTURED)).toBe(false);
    expect(isStillActive(null, CAPTURED)).toBe(true);
  });

  test("koreaDate uses UTC+9", () => {
    expect(koreaDate(0, CAPTURED)).toBe("2026-10-20");
    expect(koreaDate(7, CAPTURED)).toBe("2026-10-13");
  });

  test("trimToWindow keeps postings registered on or after the cutoff", async () => {
    const cards = parseSearchResponse(await searchData()).cards.map(({ card }) => card);
    const kept = trimToWindow(cards, "2026-10-12");
    expect(kept.map((c) => c.id)).toEqual(["356881", "356879", "356083"]);
    expect(trimToWindow([{ date: null } as JobCard], "2026-10-12")).toEqual([]);
  });
});

describe("locations", () => {
  test("district labels, with a count for several sites", () => {
    expect(locationOf({ regionDistricts: [{ name: "중구", region: { name: "서울" } }] })).toBe("서울 중구");
    expect(
      locationOf({
        regionDistricts: [
          { name: "중구", region: { name: "서울" } },
          { name: "분당구", region: { name: "경기" } },
          { name: "중구", region: { name: "서울" } },
        ],
      }),
    ).toBe("서울 중구 외 1");
    expect(locationOf({ regionDistricts: [], regions: [{ name: "서울" }] })).toBe("서울");
    expect(locationOf({})).toBeNull();
  });

  test("resolveRegion takes provinces, official names, and an optional district", () => {
    expect(resolveRegion("서울")).toEqual({ regionId: "2", region: "서울", district: null });
    expect(resolveRegion("경기도")).toMatchObject({ regionId: "9" });
    expect(resolveRegion("충청남도")).toMatchObject({ regionId: "11", region: "충청" });
    expect(resolveRegion("전북특별자치도")).toMatchObject({ regionId: "25" });
    expect(resolveRegion("서울 강남구")).toEqual({ regionId: "2", region: "서울", district: "강남구" });
    expect(resolveRegion("경기 성남시 분당구")).toMatchObject({ regionId: "9", district: "성남시 분당구" });
  });

  test("a district alone or an unknown place is rejected", () => {
    expect(() => resolveRegion("강남구")).toThrow(BadLocationError);
    expect(() => resolveRegion("판교")).toThrow(BadLocationError);
  });
});

describe("buildVariables", () => {
  const base = { query: "백엔드", page: 1, format: "json" as const };

  test("always asks for open job postings, newest first", () => {
    expect(buildVariables(base)).toEqual({
      filterBy: { activityTypeID: "5", status: "OPEN", q: "백엔드" },
      pagination: { page: 1, pageSize: 20 },
      orderBy: { field: "RECENT", direction: "DESC" },
    });
  });

  test("maps location and career types", () => {
    const vars = buildVariables({ ...base, location: "서울 강남구", career: ["new", "intern"], page: 3 }) as {
      filterBy: Record<string, unknown>;
      pagination: Record<string, unknown>;
    };
    expect(vars.filterBy.regionIDs).toEqual(["2"]);
    expect(vars.filterBy.jobTypes).toEqual(["NEW", "INTERN"]);
    expect(vars.pagination.page).toBe(3);
  });
});

describe("parseDetailPage (real posting pages)", () => {
  test("a posting with text and an image", async () => {
    const job = parseDetailPage(await fixture("detail-text-image-357883.html").text(), "357883", CAPTURED);
    expect(job).toMatchObject({
      id: "357883",
      title: "[샘플마켓] 디지털 마케팅 체험형 인턴 모집",
      company: "샘플마켓",
      location: "경기 성남시 분당구 예시로 123",
      date: "2026-10-19",
      deadline: "2026-10-27",
      alwaysOpen: false,
      jobTypes: ["인턴"],
      internTypes: ["체험형 인턴"],
      education: "학력무관",
      salary: "회사내규에 따름",
      organizationType: "대기업",
      applyMethod: "접수페이지",
      isActive: true,
    });
    expect(job.description!.split("\n").slice(0, 2)).toEqual(["[샘플마켓] 디지털 마케팅 체험형 인턴 모집", "[담당 업무]"]);
    expect(job.description).not.toMatch(/&nbsp;|<[a-z]/i);
    expect(job.descriptionImages).toHaveLength(1);
  });

  test("a closed, image-only posting (no JobPosting JSON-LD) is inactive", async () => {
    const html = await fixture("detail-closed-337318.html").text();
    expect(parseJsonLd(html)).toBeNull();
    const job = parseDetailPage(html, "337318", CAPTURED);
    expect(job).toMatchObject({ deadline: "2026-08-02", isActive: false, description: null, salary: "50000000 (YEARLY)" });
    expect(job.descriptionImages[0]).toStartWith("https://");
  });

  test("an ASAP posting has no deadline but stays active until its expiry", async () => {
    const job = parseDetailPage(await fixture("detail-asap-358010.html").text(), "358010", CAPTURED);
    expect(job).toMatchObject({ deadline: null, alwaysOpen: true, recruitType: "ASAP", internTypes: ["채용연계형 인턴"], isActive: true });
  });

  test("an activity that is not a job posting throws UnsupportedTypeError", async () => {
    // Synthetic: the 357883 page with activityTypeID set to 1 (대외활동).
    const html = await fixture("detail-synthetic-type1.html").text();
    expect(() => parseDetailPage(html, "357883", CAPTURED)).toThrow(UnsupportedTypeError);
  });

  test("a page without the activity in its Apollo cache throws PageShapeError", async () => {
    const html = await fixture("detail-text-image-357883.html").text();
    expect(() => parseDetailPage(html, "111111", CAPTURED)).toThrow(PageShapeError);
    expect(() => parseDetailPage("<html></html>", "357883", CAPTURED)).toThrow(PageShapeError);
  });

  test("deref resolves references and survives cycles", () => {
    const state = { "A:1": { name: "a", next: { __ref: "A:2" } }, "A:2": { name: "b", next: { __ref: "A:1" } } };
    const out = deref(state, { __ref: "A:1" }) as { name: string; next: { name: string } };
    expect(out.name).toBe("a");
    expect(out.next.name).toBe("b");
    expect(deref(state, { __ref: "missing" })).toBeNull();
  });

  test("parseDescription returns null for empty bodies", () => {
    expect(parseDescription(null)).toEqual({ text: null, images: [] });
    expect(parseDescription('<p><img src="//media-cdn.example/x.png"></p>')).toEqual({
      text: null,
      images: ["https://media-cdn.example/x.png"],
    });
  });
});

describe("normalizeId", () => {
  test("accepts ids and Linkareer posting URLs", () => {
    expect(normalizeId("357883")).toBe("357883");
    expect(normalizeId("https://linkareer.com/activity/357883")).toBe("357883");
    expect(normalizeId("linkareer.com/activity/357883/")).toBe("357883");
    expect(normalizeId("https://www.linkareer.com/activity/357883?tab=detail")).toBe("357883");
  });

  test("rejects other hosts, look-alikes, and other paths", () => {
    expect(normalizeId("https://boards.greenhouse.io/acme/jobs/357883")).toBeNull();
    expect(normalizeId("https://linkareer.com.evil.io/activity/357883")).toBeNull();
    expect(normalizeId("https://linkareer.com@evil.io/activity/357883")).toBeNull();
    expect(normalizeId("https://linkareer.com/list/recruit")).toBeNull();
    expect(normalizeId("abc")).toBeNull();
  });
});

describe("table layout helpers", () => {
  test("Hangul counts as two columns", () => {
    expect(displayWidth("링커리어")).toBe(8);
    expect(fitColumn("백엔드 개발자", 7)).toBe("백엔드 ");
    expect(fitColumn("가나다", 5)).toBe("가나 ");
  });
});
