"""tools/verify_quotes.py checks company quotes against a saved page.

Why this test exists: in an /apply run the reviewer quoted a company page
correctly, but the orchestrator "verified" the quote with WebFetch, whose
model-written summary covered only the hero section, and wrongly concluded the
quote was fabricated. The fix is a mechanical check against the page body.
These tests pin that markup splits (<br/>, <span>) and dot/space variants still
match, that a reworded or invented sentence does not, that script text never
counts, that text from separate blocks never joins into one match, that only
files under the temp directory are read, and that the tool stays offline.
"""
import ast
import contextlib
import io
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "tools"))
import verify_quotes  # noqa: E402

PAGE = """<!doctype html><html><head><title>예시회사</title>
<script>window.__DATA__ = {"slogan": "스크립트에만 있는 문장입니다"}</script></head>
<body>
<h1 class="hero">기술적 <span class="accent">항해</span>로,<br/>기업의 <span>미래</span>를 이끕니다.</h1>
<h2>생성형 AI와 멀티 에이전트로<br/><span class="accent">기업의 디지털 전환</span>을 이끕니다</h2>
<p>예시회사는 KT · KTDS와 함께 엔터프라이즈 AICC부터 자사 솔루션까지 제공합니다.</p>
<ul><li>문서 파싱 솔루션</li><li>코드 보안 플랫폼</li></ul>
<p>우리는 고객 신&#8203;뢰를 가장 중요하게 생각합니다.</p>
</body></html>"""


class VerifyQuotes(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.page = Path(self.tmp.name) / "page.html"
        self.page.write_text(PAGE, encoding="utf-8")

    def tearDown(self):
        self.tmp.cleanup()

    def run_tool(self, *quotes, pages=None):
        argv = []
        for p in pages or [self.page]:
            argv += ["--page", str(p)]
        for q in quotes:
            argv += ["--quote", q]
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = verify_quotes.main(argv)
        return code, out.getvalue(), err.getvalue()

    def test_heading_split_by_markup_is_found(self):
        code, out, _ = self.run_tool(
            "생성형 AI와 멀티 에이전트로 기업의 디지털 전환을 이끕니다",
            "기술적 항해로, 기업의 미래를 이끕니다.",
        )
        self.assertEqual(code, 0, out)
        self.assertEqual(out.count("FOUND"), 2)

    def test_dot_and_spacing_variants_match(self):
        # The page writes "KT · KTDS"; the reviewer may write "KT·KTDS" or "KTㆍKTDS".
        for quote in ("KT·KTDS와 함께 엔터프라이즈 AICC부터", "KTㆍKTDS와 함께 엔터프라이즈 AICC부터"):
            with self.subTest(quote=quote):
                self.assertEqual(self.run_tool(quote)[0], 0)

    def test_reworded_or_invented_text_is_not_found(self):
        code, out, _ = self.run_tool(
            "생성형 AI와 멀티 에이전트로 기업의 디지털 전환을 이끕니다",
            "생성형 AI로 기업의 디지털 혁신을 이끕니다",
        )
        self.assertEqual(code, 1)
        self.assertIn("NOT FOUND: 생성형 AI로 기업의 디지털 혁신을 이끕니다", out)

    def test_script_payload_does_not_count(self):
        self.assertEqual(self.run_tool("스크립트에만 있는 문장입니다")[0], 1)

    def test_any_of_several_pages_is_enough(self):
        other = Path(self.tmp.name) / "about.html"
        other.write_text("<p>회사 소개 페이지에만 있는 비전 문장입니다.</p>", encoding="utf-8")
        code, out, _ = self.run_tool("회사 소개 페이지에만 있는 비전 문장", pages=[self.page, other])
        self.assertEqual(code, 0)
        self.assertIn(str(other), out)

    def test_short_quote_is_refused(self):
        code, _, err = self.run_tool("AICC")
        self.assertEqual(code, 2)
        self.assertIn("too short", err)

    def test_missing_page_is_a_usage_error(self):
        code, _, err = self.run_tool("충분히 긴 인용문입니다", pages=[Path(self.tmp.name) / "nope.html"])
        self.assertEqual(code, 2)
        self.assertIn("no such page file", err)

    def test_thin_page_gets_a_client_render_note(self):
        thin = Path(self.tmp.name) / "spa.html"
        thin.write_text('<div id="root"></div><script src="app.js"></script>', encoding="utf-8")
        code, out, _ = self.run_tool("어떤 회사 문장이든 상관없음", pages=[thin])
        self.assertEqual(code, 1)
        self.assertIn("client-side", out)

    def test_separate_blocks_never_join(self):
        # Two list items, or a heading and the paragraph after it, are not one sentence.
        self.assertEqual(self.run_tool("문서 파싱 솔루션 코드 보안 플랫폼")[0], 1)
        self.assertEqual(self.run_tool("디지털 전환을 이끕니다 예시회사는 KT")[0], 1)

    def test_zero_width_characters_are_ignored(self):
        self.assertEqual(self.run_tool("고객 신뢰를 가장 중요하게")[0], 0)

    def test_pages_outside_the_temp_dir_are_refused(self):
        # Keeps the tool from being an oracle on ~/.ssh, .env and other local files.
        code, _, err = self.run_tool("충분히 긴 인용문입니다", pages=[REPO_ROOT / "README.md"])
        self.assertEqual(code, 2)
        self.assertIn("must be a file fetch_page.py saved", err)

    def test_tool_imports_no_network_or_process_modules(self):
        tree = ast.parse((REPO_ROOT / "tools" / "verify_quotes.py").read_text(encoding="utf-8"))
        imported = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imported |= {a.name.split(".")[0] for a in node.names}
            elif isinstance(node, ast.ImportFrom):
                imported.add((node.module or "").split(".")[0])
        for banned in ("urllib", "http", "socket", "subprocess", "requests", "fetch_page", "ssl"):
            self.assertNotIn(banned, imported)


if __name__ == "__main__":
    unittest.main()
