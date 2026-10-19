// Linkareer's region filter values (activityFilterList, activityTypeID 5),
// captured 2026-10-20. Regions are province-level only; Linkareer has no
// district filter. To refresh, see url-reference.md.

/** Region id -> name. 1 (지역 제한없음) is left out: it is not a place. */
export const REGIONS: Record<string, string> = {
  "2": "서울",
  "3": "부산",
  "4": "대구",
  "5": "인천",
  "6": "광주",
  "7": "대전",
  "8": "울산",
  "9": "경기",
  "10": "강원",
  "11": "충청",
  "25": "전라",
  "26": "경상",
  "27": "제주",
  "28": "세종",
  "29": "해외",
}

// Official and short province names folded into Linkareer's regions
// (충청 covers 충북 and 충남, 전라 covers 전북 and 전남, 경상 covers 경북 and 경남).
const ALIASES: Record<string, string> = {
  서울특별시: "2", 서울시: "2",
  부산광역시: "3", 부산시: "3",
  대구광역시: "4", 대구시: "4",
  인천광역시: "5", 인천시: "5",
  광주광역시: "6",
  대전광역시: "7", 대전시: "7",
  울산광역시: "8", 울산시: "8",
  경기도: "9",
  강원도: "10", 강원특별자치도: "10",
  충북: "11", 충남: "11", 충청북도: "11", 충청남도: "11", 충청도: "11",
  전북: "25", 전남: "25", 전라북도: "25", 전라남도: "25", 전북특별자치도: "25", 전라도: "25",
  경북: "26", 경남: "26", 경상북도: "26", 경상남도: "26", 경상도: "26",
  제주도: "27", 제주특별자치도: "27",
  세종시: "28", 세종특별자치시: "28",
}

/** A --location value Linkareer cannot filter on. */
export class BadLocationError extends Error {}

function regionId(name: string): string | null {
  for (const [id, n] of Object.entries(REGIONS)) if (n === name) return id
  return ALIASES[name] ?? null
}

/**
 * "서울" -> region 2; "서울 강남구" -> region 2 plus a district the caller
 * filters on client-side. A district alone ("강남구") or a place Linkareer
 * has no region for ("판교") is rejected: its keyword search matches titles,
 * so falling back to the keyword would mostly return nothing.
 */
export function resolveRegion(input: string): { regionId: string; region: string; district: string | null } {
  const [first, ...rest] = input.trim().split(/\s+/)
  const id = first ? regionId(first) : null
  if (!id) {
    throw new BadLocationError(
      `Linkareer filters by province only - use one of ${Object.values(REGIONS).join(", ")}, optionally followed by a district (e.g. "서울 강남구"); got "${input.trim()}"`,
    )
  }
  return { regionId: id, region: REGIONS[id], district: rest.length ? rest.join(" ") : null }
}
