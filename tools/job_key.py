#!/usr/bin/env python3
"""Canonical dedup key for a job posting, and an audit for existing state.

`/scrape` Step 4 keys every seen_jobs.json entry by company+title. The rule was
prose only ("<url_or_company_title_key>"), so each run slugified in its own way
and the state file accumulated two distinct failures:

  * Keys carrying characters that break things downstream. `/apply` and
    `/outcome` derive an archive folder name from the same company+role pair,
    and documents/README.md's subfolder rule exists because a "/" splits that
    path across directories. Real examples found in a live workspace:
    "deloitte_junior-cybersecurity-analyst-(ot/iot)",
    "neverhack-estonia_penetration-tester-/-red-teamer",
    "ops-consulting,-llc_malware-analyst".

  * The same job stored twice under different keys, because one run truncated
    the title at a different point than the next. "deloitte_cyber-intelligence-
    center-security-analy" and "deloitte_cyber-intelligence-center-security-
    analyst-at" are one posting, one URL, two entries - and dedup is the whole
    point of the file.

Both are fixed by making the key a pure, deterministic function of the posting.
Truncation is length-capped *and* disambiguated by a hash of the full slug, so a
long title always produces the same key and two different long titles never
collide.

A title that slugifies to nothing (a posting written in a non-Latin script) has
no usable key half at all - "securion_" was a real entry, and it would have
collided with every future non-Latin posting from that company. Those fall back
to the portal's numeric id from the URL. A title or company that slugifies to
*less* than it says is the same problem one step on: "Программист 1С" and
"Аналитик 1С" both fold to "1", "Сбер AI" and "Яндекс AI" both fold to "ai",
so whenever the ASCII fold drops letters the surviving fragment is only a
readable prefix and the identity comes from the same fallback.

Usage:
  python3 tools/job_key.py --company "Acme Corp" --title "SOC Analyst (L2)"
  python3 tools/job_key.py --audit job_scraper/seen_jobs.json
  python3 tools/job_key.py --dupes job_scraper/seen_jobs.json [--write]

Exit 0 when a key is produced, or when an audit finds nothing. Exit 1 when an
audit finds violations.
"""

import argparse
import hashlib
import json
import re
import sys
import tempfile
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATE = ROOT / "job_scraper" / "seen_jobs.json"

COMPANY_MAX = 40
TITLE_MAX = 60
HASH_LEN = 6

# Anything outside this set becomes a separator. Deliberately strict: "/" and
# "," are the characters that actually caused damage, and an allowlist cannot
# be surprised by the next punctuation mark a job board invents.
_NON_SLUG = re.compile(r"[^a-z0-9]+")
_JOB_ID = re.compile(r"(\d{6,})")


def slugify(text: str) -> str:
    """Lowercase ASCII slug. Non-Latin scripts legitimately reduce to ''."""
    if not text:
        return ""
    decomposed = unicodedata.normalize("NFKD", str(text))
    ascii_only = decomposed.encode("ascii", "ignore").decode("ascii")
    return _NON_SLUG.sub("-", ascii_only.lower()).strip("-")


def _lost_letters(text: str) -> bool:
    """True when the ASCII fold dropped non-Latin letters, so the slug under-identifies.

    NFKD turns "ü" into "u" plus a combining mark and "ﬁ" into "fi", so most
    Latin text keeps every letter. A Cyrillic, Greek, CJK or Arabic letter has
    no ASCII decomposition and vanishes; a mixed-script name then keeps only
    its Latin or digit fragment, and two different names can share it.

    Latin letters that also lack a decomposition ("ø", "æ", "ß", "ł") are
    deliberately NOT counted: "Ørsted" has keyed as "rsted" since the rule
    existed, and treating it as lossy would re-key every Danish company in a
    live seen_jobs.json for a collision that does not happen in practice.
    """
    if not text:
        return False
    for ch in unicodedata.normalize("NFKD", str(text)):
        if ord(ch) < 128 or not ch.isalpha():
            continue
        if not unicodedata.name(ch, "LATIN").startswith("LATIN"):
            return True
    return False


def _cap(slug: str, limit: int) -> str:
    """Cap length without making truncation lossy across runs.

    A bare truncation is what produced the duplicate Deloitte entries: two runs
    cut the same title at different points and the file gained a second key for
    one job. Appending a hash of the *full* slug makes the result deterministic
    for a given title and distinct for any other.
    """
    if len(slug) <= limit:
        return slug
    digest = hashlib.sha1(slug.encode("utf-8")).hexdigest()[:HASH_LEN]
    return f"{slug[:limit].rstrip('-')}-{digest}"


def make_key(company: str, title: str, url: str = "") -> str:
    """The canonical seen_jobs.json key for one posting."""
    company_slug = _cap(slugify(company), COMPANY_MAX)
    if not company_slug or _lost_letters(company):
        name = unicodedata.normalize("NFC", str(company or "").strip().casefold())
        # An absent name stays unknown; a non-Latin name still has an identity.
        # A mixed-script name keeps its Latin fragment as a readable prefix, but
        # the identity is the hash: "Сбер AI" and "Яндекс AI" both fold to "ai".
        digest = hashlib.sha1(name.encode("utf-8")).hexdigest()[:HASH_LEN]
        if not name:
            company_slug = "unknown-company"
        else:
            company_slug = f"{company_slug}-{digest}" if company_slug else f"company-{digest}"
    title_slug = _cap(slugify(title), TITLE_MAX)
    if not title_slug or _lost_letters(title):
        # No Latin characters in the title, or not enough of them to identify
        # it: "Программист 1С" and "Аналитик 1С" both fold to "1". The portal's
        # own numeric id is the stable handle; a surviving fragment stays as a
        # readable prefix only. Never emit a bare "company_" prefix.
        fragment = title_slug
        match = _JOB_ID.search(url or "")
        if match:
            title_slug = f"{fragment}-{match.group(1)}" if fragment else match.group(1)
        else:
            basis = slugify(unicodedata.normalize("NFKD", str(title or url or "")))
            # Hash the URL alone when there is one. The URL is the posting's
            # identity; the title is not. Including the title made the key
            # change whenever a portal re-listed the same posting with the
            # title altered, which stores one job twice - the failure this
            # whole helper exists to prevent. Portals whose ids carry no run
            # of six digits never reach the branch above, so for them this
            # hash is the only key half there is: freehire's real slugs look
            # like "inzhener-ooo-chen-hlk3qjfg", and its Cyrillic and Greek
            # titles slugify to nothing. With no URL, the title is all that
            # is left to key on.
            digest_basis = str(url) if url else str(title)
            digest = hashlib.sha1(digest_basis.encode("utf-8")).hexdigest()[:HASH_LEN]
            # A lossy fragment needs the digest to tell two postings apart; an
            # empty title keeps the bare basis (a URL-derived slug, or
            # "untitled-<hash>") exactly as before the fragment rule existed.
            title_slug = f"{fragment}-{digest}" if fragment else (basis or f"untitled-{digest}")
    return f"{company_slug}_{title_slug}"


# A canonical key is "<company-slug>_<title-slug>": lowercase alphanumerics and
# hyphens on either side of exactly one underscore. The underscore is the
# separator, so it is the one character outside the slug alphabet that belongs.
_CANONICAL = re.compile(r"^[a-z0-9][a-z0-9-]*_[a-z0-9][a-z0-9-]*$")


def is_canonical(key: str) -> bool:
    """Structurally safe as a dedup key and as an archive folder name."""
    return bool(key) and bool(_CANONICAL.match(key))


def is_legacy_shape(key: str) -> bool:
    """Old three-part "company_title_location" keys.

    Harmless - they carry no path-breaking character - but they are not what
    make_key produces, so a later run would store the same job under a new key
    and reintroduce a duplicate. Reported apart from real damage so the fix
    stays a decision rather than an automatic rename.
    """
    return bool(key) and key.count("_") > 1 and all(
        re.fullmatch(r"[a-z0-9][a-z0-9-]*", part) for part in key.split("_") if part
    )


# ---------------------------------------------------------------- cross-portal duplicates
#
# A Korean title keys on the portal's own id (make_key above), so one posting
# cross-posted to two boards gets two keys, and the boards spell it differently:
# Linkareer "샘플노트" / "[샘플노트] [신입/경력] 백엔드 엔지니어" and Saramin
# "(주)샘플노트" / "[샘플노트] 백엔드 엔지니어 신입/경력 채용" are one posting
# (observed 2026-10-21). These helpers compare postings rather than keys. They
# are deliberately conservative: a false match hides a real posting, a missed
# match only shows one twice.

# Korean corporate markers, after NFKC (which turns ㈜ into "(주)").
_CORP_MARKERS = re.compile(
    r"\((?:주|유|사|재)\)|주식회사|유한책임회사|유한회사|합자회사|합명회사|사단법인|재단법인"
)
# Words that say "this is a job ad" and nothing about which job. Korean only, so
# Latin titles compare exactly as before.
_NOISE = frozenset({
    "채용", "모집", "공고", "채용공고", "구인", "모십니다", "구합니다", "채용합니다",
    "모집합니다", "수시채용", "상시채용", "수시", "상시",
})
# Seniority qualifiers. Two postings that differ only here can be different
# openings, so same_posting keeps them; the tracker check drops them, because
# /apply records the role without the qualifier the board added.
_QUALIFIERS = frozenset({"신입", "경력", "경력직", "신입사원", "경력사원", "경력무관", "무관"})


def _fold(text) -> str:
    return unicodedata.normalize("NFKC", str(text or "")).casefold()


def _tokens(text: str) -> list[str]:
    """Runs of letters, digits and combining marks; everything else separates."""
    out, cur = [], []
    for ch in text:
        if ch.isalnum() or unicodedata.category(ch).startswith("M"):
            cur.append(ch)
        elif cur:
            out.append("".join(cur))
            cur = []
    if cur:
        out.append("".join(cur))
    return out


def company_identity(name) -> str:
    """Company name with Korean corporate markers, case and separators ignored."""
    return "".join(_tokens(_CORP_MARKERS.sub(" ", _fold(name))))


def posting_tokens(company, title, *, drop_qualifiers: bool = False) -> list[str]:
    """Title words that identify the job: no corporate markers, no company name,
    no job-ad noise words."""
    own = set(_tokens(_CORP_MARKERS.sub(" ", _fold(company))))
    own.add(company_identity(company))
    drop = _NOISE | (_QUALIFIERS if drop_qualifiers else frozenset())
    return [
        t for t in _tokens(_CORP_MARKERS.sub(" ", _fold(title)))
        if t not in own and t not in drop
    ]


def same_posting(a: dict, b: dict, *, drop_qualifiers: bool = False) -> bool:
    """True when two {company, title} records look like one posting."""
    company = company_identity(a.get("company"))
    if not company or company != company_identity(b.get("company")):
        return False
    ta = posting_tokens(a.get("company"), a.get("title"), drop_qualifiers=drop_qualifiers)
    tb = posting_tokens(b.get("company"), b.get("title"), drop_qualifiers=drop_qualifiers)
    if not ta or not tb:
        return False
    # Same words in any order, or the same letters with different spacing
    # ("백엔드엔지니어" / "백엔드 엔지니어").
    return set(ta) == set(tb) or "".join(ta) == "".join(tb)


def find_duplicates(seen: dict) -> list[dict]:
    """Groups of entries that look like one posting. Only `new` entries are ever
    listed as duplicates; an entry already presented or ranked is the primary."""
    clusters: list[list[str]] = []
    for key, entry in seen.items():
        if not isinstance(entry, dict) or entry.get("duplicate_of"):
            continue
        for cluster in clusters:
            if same_posting(seen[cluster[0]], entry):
                cluster.append(key)
                break
        else:
            clusters.append([key])
    groups = []
    for cluster in clusters:
        if len(cluster) < 2:
            continue
        settled = [k for k in cluster if seen[k].get("status") != "new"]
        primary = settled[0] if settled else cluster[0]
        dupes = [k for k in cluster if k != primary and seen[k].get("status") == "new"]
        if dupes:
            portals = []
            for k in [primary, *dupes]:
                p = seen[k].get("portal")
                if p and p not in portals:
                    portals.append(p)
            groups.append({"primary": primary, "duplicates": dupes, "portals": portals})
    return groups


def dupes(path: Path, write: bool) -> int:
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"cannot read {path}: {exc}", file=sys.stderr)
        return 1
    seen = doc.get("seen") if isinstance(doc, dict) else None
    if not isinstance(seen, dict):
        print(f"{path}: expected {{\"seen\": {{...}}}}", file=sys.stderr)
        return 1
    groups = find_duplicates(seen)
    if write and groups:
        for group in groups:
            for key in group["duplicates"]:
                seen[key]["status"] = "skipped"
                seen[key]["duplicate_of"] = group["primary"]
        # Atomic replace: a half-written seen_jobs.json loses the scrape history.
        fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".seen_jobs.", suffix=".tmp")
        try:
            with open(fd, "w", encoding="utf-8") as fh:
                json.dump(doc, fh, indent=2, ensure_ascii=False)
                fh.write("\n")
            Path(tmp).replace(path)
        finally:
            Path(tmp).unlink(missing_ok=True)
    print(json.dumps({"groups": groups, "written": bool(write and groups)}, indent=2, ensure_ascii=False))
    return 0


def audit(path: Path) -> int:
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"cannot read {path}: {exc}", file=sys.stderr)
        return 1
    seen = doc.get("seen", doc) if isinstance(doc, dict) else doc
    if not isinstance(seen, dict):
        print(f"{path}: expected an object of job entries", file=sys.stderr)
        return 1
    not_objects = [k for k, v in seen.items() if not isinstance(v, dict)]
    if not_objects:
        print(f"{path}: entry is not an object: {not_objects[0]}", file=sys.stderr)
        return 1
    bad_url = [k for k, v in seen.items() if v.get("url") is not None and not isinstance(v["url"], str)]
    if bad_url:
        print(f"{path}: entry url is not a string: {bad_url[0]}", file=sys.stderr)
        return 1

    malformed = [k for k in seen if not is_canonical(k) and not is_legacy_shape(k)]
    legacy = [k for k in seen if is_legacy_shape(k)]
    by_url: dict[str, list[str]] = {}
    for key, entry in seen.items():
        url = (entry.get("url") or "").rstrip("/")
        if url:
            by_url.setdefault(url, []).append(key)
    duplicates = {u: ks for u, ks in by_url.items() if len(ks) > 1}
    # A key that does not match what make_key would produce today is drift, not
    # damage: reported separately so a rename is a choice, never automatic.
    drift = [
        k for k, v in seen.items()
        if is_canonical(k) and k != make_key(v.get("company", ""), v.get("title", ""), v.get("url", ""))
    ]

    print(json.dumps({
        "entries": len(seen),
        "malformed_keys": malformed,
        "legacy_three_part_keys": legacy,
        "duplicate_urls": duplicates,
        "keys_not_matching_current_rule": len(drift),
    }, indent=2, ensure_ascii=False))
    return 1 if (malformed or duplicates) else 0


def _force_utf8_output() -> None:
    """Write UTF-8 whatever the host's default encoding is.

    A piped stdout on Windows defaults to the ANSI code page (cp1252 on most
    Western installs), so printing a company, title or file name outside it
    raised UnicodeEncodeError before the workflow saw any output.
    """
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)  # absent on a StringIO under test
        if reconfigure:
            reconfigure(encoding="utf-8")


def main() -> int:
    _force_utf8_output()
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--company")
    ap.add_argument("--title")
    ap.add_argument("--url", default="")
    ap.add_argument("--audit", nargs="?", const=str(STATE), metavar="STATE_JSON")
    ap.add_argument("--dupes", nargs="?", const=str(STATE), metavar="STATE_JSON",
                    help="list entries that look like one posting cross-posted to several boards")
    ap.add_argument("--write", action="store_true",
                    help="with --dupes: mark each new copy status=skipped, duplicate_of=<primary key>")
    args = ap.parse_args()

    if args.dupes:
        return dupes(Path(args.dupes), args.write)
    if args.write:
        ap.error("--write only goes with --dupes")
    if args.audit:
        return audit(Path(args.audit))
    if args.company is None or args.title is None:
        ap.error("give --company and --title, or --audit")
    print(make_key(args.company, args.title, args.url))
    return 0


if __name__ == "__main__":
    sys.exit(main())
