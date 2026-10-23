"""The Korean CV switch in cv/main_example.tex.

Why this test exists: Korean CVs used the banking layout with Hangul in Nanum
Gothic and Latin text in moderncv's own font, which looked mismatched. One
line, `\\koreancvtrue`, now switches on the classic layout, Nanum Gothic for
Hangul and Lato for Latin text. Setting Latin text in Nanum Gothic as well was
tried and rejected: pypdf then read "Spring Boot" as "SpringBoot", which breaks
ATS keyword matching. These tests pin that the switch is off by default (other
languages keep banking), that it controls every Korean setting, and, when
lualatex and pypdf are installed, that the compiled Korean CV keeps its word
spaces in the text layer.
"""
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = REPO_ROOT / "cv" / "main_example.tex"


def template() -> str:
    return TEMPLATE.read_text(encoding="utf-8")


def korean_block(text: str) -> str:
    match = re.search(r"^\\ifkoreancv\n(.*?)^\\fi$", text, re.S | re.M)
    assert match, "Korean block (\\ifkoreancv ... \\fi) missing"
    return match.group(1)


class SwitchWiring(unittest.TestCase):
    def test_switch_is_declared_and_off_by_default(self):
        text = template()
        self.assertIn("\\newif\\ifkoreancv", text)
        self.assertRegex(text, r"(?m)^% \\koreancvtrue$")
        self.assertNotRegex(text, r"(?m)^\\koreancvtrue")
        self.assertLess(text.index("\\newif\\ifkoreancv"), text.index("\\documentclass"))

    def test_style_follows_the_switch(self):
        self.assertIn(
            "\\ifkoreancv\\moderncvstyle{classic}\\else\\moderncvstyle{banking}\\fi", template()
        )

    def test_block_sets_hangul_and_latin_fonts(self):
        block = korean_block(template())
        self.assertIn("\\usepackage{luatexko}", block)
        self.assertIn("\\setmainhangulfont", block)
        self.assertIn("\\setsanshangulfont", block)
        for command in ("\\setmainfont", "\\setsansfont"):
            line = next(l for l in block.splitlines() if l.strip().startswith(command))
            self.assertIn("{Lato}", line, f"{command} must use Lato, not Nanum Gothic")

    def test_no_korean_setting_lives_outside_the_switch(self):
        outside = template().replace(korean_block(template()), "")
        self.assertNotRegex(outside, r"(?m)^\s*\\usepackage\{luatexko\}")
        self.assertNotRegex(outside, r"(?m)^\s*\\set(main|sans)hangulfont")

    def test_bundled_fonts_exist(self):
        fonts = REPO_ROOT / "cover_letters" / "OpenFonts" / "fonts"
        for name in ("nanumgothic/NanumGothic-Regular.ttf", "nanumgothic/NanumGothic-Bold.ttf",
                     "lato/Lato-Reg.ttf", "lato/Lato-Bol.ttf", "lato/Lato-RegIta.ttf",
                     "lato/Lato-BolIta.ttf"):
            self.assertTrue((fonts / name).is_file(), name)


def _have_pypdf() -> bool:
    try:
        import pypdf  # noqa: F401
    except ImportError:
        return False
    return True


@unittest.skipUnless(shutil.which("lualatex") and _have_pypdf(), "needs lualatex and pypdf")
class CompiledKoreanCv(unittest.TestCase):
    def test_word_spaces_survive_in_the_text_layer(self):
        import pypdf

        text = template().replace("% \\koreancvtrue", "\\koreancvtrue", 1)
        text = text.replace(
            "\\section{Education}",
            "\\section{학력}\n\\cvitem{요약}{Java 17과 Spring Boot로 결제 API를 개발했습니다.}",
            1,
        )
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            shutil.copytree(REPO_ROOT / "cover_letters" / "OpenFonts", root / "cover_letters" / "OpenFonts")
            (root / "cv").mkdir()
            (root / "cv" / "ko.tex").write_text(text, encoding="utf-8")
            proc = subprocess.run(
                ["lualatex", "-interaction=nonstopmode", "-halt-on-error", "ko.tex"],
                cwd=root / "cv", capture_output=True, text=True, timeout=300,
            )
            self.assertEqual(proc.returncode, 0, proc.stdout[-2000:])
            log = (root / "cv" / "ko.log").read_text(encoding="utf-8", errors="replace")
            self.assertNotIn("Missing character", log)
            self.assertIn("moderncvstyleclassic.sty", log)
            extracted = "".join(p.extract_text() for p in pypdf.PdfReader(root / "cv" / "ko.pdf").pages)
        self.assertIn("Spring Boot", extracted)
        self.assertIn("결제 API", extracted)


if __name__ == "__main__":
    unittest.main()
