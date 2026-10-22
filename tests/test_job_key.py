"""Tests for tools/job_key.py - the canonical seen_jobs.json key function.

/scrape's key rule was prose only, so runs slugified inconsistently and the
state file accumulated two failures: keys carrying "/", "," and "&" that break
the archive-folder path `/apply`/`/outcome` derive from company+role, and the
same job stored twice under two different truncations of a long title. These
pin the fix - a pure, deterministic function of company+title(+url) - and the
audit that finds both failure classes in an existing file.
"""
import json
import subprocess
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
from job_key import company_identity, is_canonical, is_legacy_shape, make_key, same_posting, slugify  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
TOOL = REPO / "tools" / "job_key.py"


class Slugify(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(slugify("Acme Corp"), "acme-corp")

    def test_strips_punctuation_that_breaks_paths(self):
        self.assertEqual(slugify("Ops Consulting, LLC"), "ops-consulting-llc")
        self.assertEqual(slugify("Penetration Tester / Red Teamer"), "penetration-tester-red-teamer")
        self.assertEqual(slugify("Junior Cybersecurity Analyst (OT/IoT)"), "junior-cybersecurity-analyst-ot-iot")

    def test_non_latin_script_reduces_to_empty(self):
        self.assertEqual(slugify("시큐리온"), "")
        self.assertEqual(slugify("Код Безопасности"), "")


class MakeKey(unittest.TestCase):
    def test_shape(self):
        key = make_key("Acme Corp", "SOC Analyst (L2)")
        self.assertEqual(key, "acme-corp_soc-analyst-l2")
        self.assertTrue(is_canonical(key))

    def test_deterministic_across_calls(self):
        title = "Cyber Intelligence Center Security Analyst with an unusually long title"
        self.assertEqual(make_key("Deloitte", title), make_key("Deloitte", title))

    def test_long_titles_never_collide_after_truncation(self):
        """The bug that produced two Deloitte entries for one posting: two
        runs truncated the same long title at different points. A hash of the
        full slug makes truncation deterministic instead of lossy."""
        a = make_key("Deloitte", "Cyber Intelligence Center Security Analyst with trailing text A")
        b = make_key("Deloitte", "Cyber Intelligence Center Security Analyst with trailing text B")
        self.assertNotEqual(a, b)

    def test_non_latin_title_falls_back_to_the_portal_job_id(self):
        key = make_key(
            "SecuriON",
            "안드로이드 앱(악성코드) 분석가 채용",
            url="https://kr.linkedin.com/jobs/view/x-4461771225",
        )
        self.assertEqual(key, "securion_4461771225")

    def test_non_latin_title_with_no_url_id_still_produces_a_canonical_key(self):
        key = make_key("SecuriON", "안드로이드 앱 분석가", url="")
        self.assertTrue(is_canonical(key))
        self.assertNotEqual(key, "securion_")

    def test_non_latin_company_falls_back_without_producing_a_bare_prefix(self):
        key = make_key("Код Безопасности", "Malware Analytic", url="")
        self.assertTrue(is_canonical(key))
        self.assertFalse(key.startswith("_"))

    def test_one_url_keeps_one_key_when_a_non_latin_title_is_re_listed(self):
        # freehire is the shipped multi-market portal, and its public API
        # returns Cyrillic and Greek titles. Its real slugs carry no run of six
        # digits, so the numeric-id branch above never fires for them and the
        # hash is the only key half left. Hashing the title alongside the URL
        # made that hash move whenever a portal re-listed the same posting with
        # the title altered - including a mere case change, which this portal
        # really does emit ("Инженер" and "инженер" both appear).
        #
        # URL and slug are real values from freehire's public API, not
        # constructed: https://freehire.me/api/v1/agent/jobs/search?q=инженер
        url = "https://freehire.me/jobs/inzhener-ooo-chen-hlk3qjfg"
        company = "ООО Чен"
        first = make_key(company, "Инженер", url=url)
        recased = make_key(company, "инженер", url=url)
        retitled = make_key(company, "Инженер-механик", url=url)
        self.assertTrue(is_canonical(first))
        self.assertEqual(first, recased)
        self.assertEqual(first, retitled)

    def test_distinct_urls_still_get_distinct_keys(self):
        # The counterpart to the above: collapsing title variants must not
        # collapse two genuinely different postings from one company. Both
        # slugs are real freehire values.
        company = "ООО Чен"
        a = make_key(company, "Инженер", url="https://freehire.me/jobs/inzhener-ooo-chen-hlk3qjfg")
        b = make_key(company, "Инженер", url="https://freehire.me/jobs/inzhener-mup-g-khabarovska-tep")
        self.assertNotEqual(a, b)


class MixedScriptNamesKeepTheirIdentity(unittest.TestCase):
    """A name that folds to a fragment is as lossy as one that folds to nothing.

    #487 and #502 added the hash fallbacks for titles and companies that
    slugify to '', but a mixed-script name keeps its Latin or digit fragment and
    skipped them: "Программист 1С" and "Аналитик 1С" both became "1", "Сбер AI"
    and "Яндекс AI" both became "ai", so two postings shared one key and
    `/scrape` Step 4 dropped the second as already seen. "1С" titles and
    "N категории" grade suffixes are everyday Russian listings on freehire.
    """

    def test_titles_sharing_a_digit_fragment_get_distinct_keys(self):
        company = "Яндекс"
        a = make_key(company, "Программист 1С", url="https://freehire.me/jobs/programmist-1s-aaa")
        b = make_key(company, "Аналитик 1С", url="https://freehire.me/jobs/analitik-1s-bbb")
        self.assertNotEqual(a, b)
        self.assertTrue(is_canonical(a) and is_canonical(b))

    def test_titles_sharing_a_latin_word_get_distinct_keys(self):
        company = "ООО Чен"
        a = make_key(company, "Python-разработчик", url="https://freehire.me/jobs/python-razrabotchik-x1")
        b = make_key(company, "Python-аналитик", url="https://freehire.me/jobs/python-analitik-x2")
        self.assertNotEqual(a, b)
        # The fragment survives as a readable prefix; the URL carries the identity.
        self.assertTrue(a.split("_", 1)[1].startswith("python-"))

    def test_lossy_title_prefers_the_portal_numeric_id(self):
        key = make_key("Acme", "Инженер 1 категории", url="https://kr.linkedin.com/jobs/view/x-4461771225")
        self.assertEqual(key, "acme_1-4461771225")

    def test_companies_sharing_a_latin_word_get_distinct_keys(self):
        a = make_key("Сбер AI", "ML Engineer", url="https://example.com/1")
        b = make_key("Яндекс AI", "ML Engineer", url="https://example.com/2")
        self.assertNotEqual(a, b)
        self.assertTrue(a.startswith("ai-") and b.startswith("ai-"))
        self.assertTrue(is_canonical(a) and is_canonical(b))

    def test_lossy_company_is_stable_across_case_and_urls(self):
        a = make_key("Сбер AI", "ML Engineer", url="https://example.com/1")
        b = make_key("сбер ai", "ML Engineer", url="https://example.com/2")
        self.assertEqual(a.split("_", 1)[0], b.split("_", 1)[0])

    def test_empty_title_with_a_non_numeric_url_keeps_its_pre_fragment_key(self):
        # The fragment rule must not reach past its own case: an empty title
        # with a URL that carries no six-digit run keyed on the URL-derived
        # basis alone before #514, and the first cut of the rule had started
        # appending the digest there too. Unreachable from /scrape, which always
        # passes a title, but the key is a pure function of the posting and
        # should not move for a case the rule was never about.
        self.assertEqual(
            make_key("Acme", "", url="https://example.com/jobs/abc-xyz"),
            "acme_https-example-com-jobs-abc-xyz",
        )
        self.assertTrue(make_key("Acme", "", url="").startswith("acme_untitled-"))

    def test_latin_names_with_accents_and_ligatures_are_not_lossy(self):
        # NFKD folds these without dropping a letter, so existing keys stay put.
        self.assertEqual(make_key("Zürich Versicherung", "Ingénieur ﬁnance"), "zurich-versicherung_ingenieur-finance")

    def test_latin_letters_without_a_decomposition_do_not_re_key(self):
        # "ø" and "æ" have no NFKD decomposition and are dropped by the fold,
        # but they are Latin letters: "Ørsted" has keyed as "rsted" since the
        # rule existed, and a live Danish seen_jobs.json must not re-key.
        self.assertEqual(make_key("Ørsted A/S", "Senior Engineer"), "rsted-a-s_senior-engineer")
        self.assertEqual(make_key("Mærsk", "Søfarende"), "mrsk_sfarende")


class CompanyFallbackCLI(unittest.TestCase):
    def key_for(self, company, url="https://example.com/jobs/123456"):
        proc = subprocess.run(
            [sys.executable, str(TOOL), "--company", company,
             "--title", "Software Engineer", "--url", url],
            capture_output=True, text=True, encoding="utf-8", check=True,
        )
        return proc.stdout.strip()

    def test_distinct_non_latin_companies_have_distinct_keys(self):
        keys = [self.key_for(company) for company in ("腾讯", "阿里巴巴", "")]
        self.assertEqual(len(set(keys)), 3)
        self.assertTrue(all(is_canonical(key) for key in keys))

    def test_company_fallback_is_stable_across_case_normalization_and_urls(self):
        for first, second in (("КОМПАНИЯ", "компания"), ("ガンホー", "カ\u3099ンホー")):
            with self.subTest(first=first, second=second):
                self.assertEqual(
                    self.key_for(first),
                    self.key_for(second, "https://example.com/jobs/654321"),
                )

    def test_missing_company_and_existing_ascii_keys_are_unchanged(self):
        self.assertEqual(self.key_for(""), "unknown-company_software-engineer")
        self.assertEqual(self.key_for("  "), "unknown-company_software-engineer")
        self.assertEqual(self.key_for("Acme Corp"), "acme-corp_software-engineer")


class CanonicalAndLegacyShape(unittest.TestCase):
    def test_canonical_accepts_company_underscore_title(self):
        self.assertTrue(is_canonical("acme-corp_soc-analyst"))

    def test_canonical_rejects_path_breaking_characters(self):
        for bad in ("deloitte_junior-cybersecurity-analyst-(ot/iot)",
                    "neverhack-estonia_penetration-tester-/-red-teamer",
                    "ops-consulting,-llc_malware-analyst",
                    "",
                    "securion_"):
            self.assertFalse(is_canonical(bad), f"{bad!r} should not be canonical")

    def test_legacy_three_part_shape_is_flagged_separately_from_malformed(self):
        self.assertTrue(is_legacy_shape("nviso-security_soc-analyst_athens"))
        self.assertFalse(is_canonical("nviso-security_soc-analyst_athens"))
        # A malformed key (bad characters) is never also reported as legacy shape.
        self.assertFalse(is_legacy_shape("deloitte_junior-cybersecurity-analyst-(ot/iot)"))


class AuditCLI(unittest.TestCase):
    def run_audit(self, seen: dict) -> tuple[dict, int]:
        import tempfile

        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
            json.dump({"seen": seen}, fh)
            path = fh.name
        proc = subprocess.run(
            [sys.executable, str(TOOL), "--audit", path], capture_output=True, text=True, encoding="utf-8"
        )
        return json.loads(proc.stdout), proc.returncode

    def test_clean_state_exits_zero(self):
        report, code = self.run_audit({"acme_soc-analyst": {"company": "Acme", "title": "SOC Analyst"}})
        self.assertEqual(code, 0)
        self.assertEqual(report["malformed_keys"], [])
        self.assertEqual(report["duplicate_urls"], {})

    def test_malformed_key_exits_nonzero(self):
        report, code = self.run_audit(
            {"deloitte_junior-cybersecurity-analyst-(ot/iot)": {"company": "Deloitte", "title": "x"}}
        )
        self.assertEqual(code, 1)
        self.assertIn("deloitte_junior-cybersecurity-analyst-(ot/iot)", report["malformed_keys"])

    def test_duplicate_url_exits_nonzero(self):
        report, code = self.run_audit(
            {
                "a": {"company": "Acme", "title": "x", "url": "https://x/1"},
                "b": {"company": "Acme", "title": "y", "url": "https://x/1"},
            }
        )
        self.assertEqual(code, 1)
        self.assertIn("https://x/1", report["duplicate_urls"])

    def test_legacy_shape_alone_does_not_fail_the_audit(self):
        """Harmless drift, not damage - the sweep-worthy rewrite is a decision
        the maintainer makes, not something the audit enforces."""
        report, code = self.run_audit({"acme_soc-analyst_athens": {"company": "Acme", "title": "x"}})
        self.assertEqual(code, 0)
        self.assertIn("acme_soc-analyst_athens", report["legacy_three_part_keys"])

    def run_audit_raw(self, document) -> subprocess.CompletedProcess:
        import tempfile

        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
            json.dump(document, fh)
            path = fh.name
        return subprocess.run(
            [sys.executable, str(TOOL), "--audit", path], capture_output=True, text=True, encoding="utf-8"
        )

    def test_non_object_state_file_is_reported_not_a_traceback(self):
        proc = self.run_audit_raw([])
        self.assertEqual(proc.returncode, 1)
        self.assertIn("expected an object of job entries", proc.stderr)
        self.assertNotIn("Traceback", proc.stderr)

    def test_non_object_entry_is_reported_not_a_traceback(self):
        proc = self.run_audit_raw({"seen": {"acme_soc-analyst": "oops"}})
        self.assertEqual(proc.returncode, 1)
        self.assertIn("entry is not an object: acme_soc-analyst", proc.stderr)
        self.assertNotIn("Traceback", proc.stderr)

    def test_non_string_url_is_reported_not_a_traceback(self):
        for bad in (123, ["https://example.com/job"], {"href": "x"}):
            with self.subTest(url=bad):
                proc = self.run_audit_raw({"seen": {"acme_soc-analyst": {"company": "Acme", "title": "SOC Analyst", "url": bad}}})
                self.assertEqual(proc.returncode, 1)
                self.assertIn("entry url is not a string: acme_soc-analyst", proc.stderr)
                self.assertNotIn("Traceback", proc.stderr)


class CrossPortalDuplicates(unittest.TestCase):
    """Korean titles key on the portal's own id, so one posting cross-posted to
    two boards gets two keys, and the boards spell the company and title
    differently. The shape of a real pair observed on 2026-10-21, with the
    company name replaced by a fictional one: Linkareer "샘플노트" /
    "[샘플노트] [신입/경력] 백엔드 엔지니어" and Saramin "(주)샘플노트" /
    "[샘플노트] 백엔드 엔지니어 신입/경력 채용" are one posting."""

    def test_company_identity_ignores_korean_corporate_markers(self):
        same = ["샘플노트", "(주)샘플노트", "㈜샘플노트", "주식회사 샘플노트", "샘플노트(주)", " 샘플노트 "]
        self.assertEqual({company_identity(c) for c in same}, {"샘플노트"})
        self.assertEqual(company_identity("㈜KT DS"), company_identity("KT DS"))
        self.assertEqual(company_identity("(유)퍼솔코리아"), company_identity("퍼솔코리아"))

    def test_company_identity_keeps_latin_names_as_they_were(self):
        # No Latin suffix stripping: upstream behaviour for "Acme, Inc." is unchanged.
        self.assertEqual(company_identity("Acme, Inc."), company_identity("ACME_INC"))
        self.assertNotEqual(company_identity("Acme Inc."), company_identity("Acme"))
        self.assertEqual(company_identity(""), "")

    def test_the_observed_cross_posting_is_one_posting(self):
        self.assertTrue(same_posting(
            {"company": "샘플노트", "title": "[샘플노트] [신입/경력] 백엔드 엔지니어"},
            {"company": "(주)샘플노트", "title": "[샘플노트] 백엔드 엔지니어 신입/경력 채용"},
        ))

    def test_spacing_and_noise_words_do_not_split_a_posting(self):
        self.assertTrue(same_posting(
            {"company": "예시테크", "title": "백엔드엔지니어 모집"},
            {"company": "㈜예시테크", "title": "[예시테크] 백엔드 엔지니어 채용"},
        ))

    def test_different_roles_at_one_company_stay_apart(self):
        a = {"company": "예시테크", "title": "백엔드 엔지니어 채용"}
        for other in ("프론트엔드 엔지니어 채용", "시니어 백엔드 엔지니어 채용",
                      "백엔드 엔지니어 인턴 채용", "백엔드 엔지니어 (계약직) 채용"):
            with self.subTest(other=other):
                self.assertFalse(same_posting(a, {"company": "예시테크", "title": other}))

    def test_same_title_at_another_company_is_not_a_duplicate(self):
        self.assertFalse(same_posting(
            {"company": "예시테크", "title": "백엔드 엔지니어"},
            {"company": "샘플소프트", "title": "백엔드 엔지니어"},
        ))

    def test_a_title_that_is_only_noise_never_matches(self):
        # "[예시테크] 채용" leaves nothing to compare; two such postings are not
        # evidence of one posting.
        self.assertFalse(same_posting(
            {"company": "예시테크", "title": "[예시테크] 채용"},
            {"company": "예시테크", "title": "예시테크 모집"},
        ))


class DupesCommand(unittest.TestCase):
    def run_dupes(self, seen, *extra):
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "seen_jobs.json"
            path.write_text(json.dumps({"seen": seen}, ensure_ascii=False), encoding="utf-8")
            proc = subprocess.run(
                [sys.executable, str(TOOL), "--dupes", str(path), *extra],
                capture_output=True, text=True, encoding="utf-8",
            )
            self.assertEqual(proc.returncode, 0, proc.stderr)
            return json.loads(proc.stdout), json.loads(path.read_text(encoding="utf-8"))["seen"]

    SEEN = {
        "company-de4492_356083": {"company": "샘플노트", "title": "[샘플노트] [신입/경력] 백엔드 엔지니어",
                                  "url": "https://linkareer.com/activity/356083", "status": "new",
                                  "portal": "linkareer-search", "first_seen": "2026-10-21"},
        "company-ea1ca7_55400001": {"company": "(주)샘플노트", "title": "[샘플노트] 백엔드 엔지니어 신입/경력 채용",
                                    "url": "https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=55400001",
                                    "status": "new", "portal": "saramin-search", "first_seen": "2026-10-21"},
        "company-111111_50000001": {"company": "샘플노트", "title": "[샘플노트] 프론트엔드 엔지니어",
                                    "url": "https://www.jobkorea.co.kr/Recruit/GI_Read/50000001", "status": "new",
                                    "portal": "jobkorea-search", "first_seen": "2026-10-21"},
    }

    def test_report_only_by_default(self):
        report, after = self.run_dupes(self.SEEN)
        self.assertEqual(report["groups"], [{
            "primary": "company-de4492_356083",
            "duplicates": ["company-ea1ca7_55400001"],
            "portals": ["linkareer-search", "saramin-search"],
        }])
        self.assertFalse(report["written"])
        self.assertEqual(after, self.SEEN)

    def test_write_marks_the_copy_and_keeps_it(self):
        report, after = self.run_dupes(self.SEEN, "--write")
        self.assertTrue(report["written"])
        copy = after["company-ea1ca7_55400001"]
        self.assertEqual(copy["status"], "skipped")
        self.assertEqual(copy["duplicate_of"], "company-de4492_356083")
        self.assertEqual(after["company-de4492_356083"]["status"], "new")
        self.assertEqual(after["company-111111_50000001"]["status"], "new")
        self.assertEqual(len(after), 3)

    def test_an_already_ranked_entry_is_the_primary_and_is_never_rewritten(self):
        seen = json.loads(json.dumps(self.SEEN))
        seen["company-ea1ca7_55400001"]["status"] = "ranked"
        report, after = self.run_dupes(seen, "--write")
        self.assertEqual(report["groups"][0]["primary"], "company-ea1ca7_55400001")
        self.assertEqual(after["company-ea1ca7_55400001"]["status"], "ranked")
        self.assertNotIn("duplicate_of", after["company-ea1ca7_55400001"])
        self.assertEqual(after["company-de4492_356083"]["duplicate_of"], "company-ea1ca7_55400001")

    def test_a_second_run_finds_nothing_new(self):
        _, after = self.run_dupes(self.SEEN, "--write")
        report, again = self.run_dupes(after, "--write")
        self.assertEqual(report["groups"], [])
        self.assertEqual(again, after)


if __name__ == "__main__":
    unittest.main()
