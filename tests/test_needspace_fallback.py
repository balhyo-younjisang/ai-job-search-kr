"""The CV template compiles with or without the needspace package.

Why this test exists: a tailored CV compiled with TinyTeX failed with
"File `needspace.sty' not found", because the guidance said to add
\\usepackage{needspace} and minimal TeX installs do not ship it. The master
template now loads the package when present and otherwise defines an
equivalent \\needspace. These tests pin that guard, that the guidance no longer
tells anyone to load the package by hand, and (when lualatex is installed)
that the fallback really moves content to the next page, the same way the
package does.
"""
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = REPO_ROOT / "cv" / "main_example.tex"
GUIDES = [
    REPO_ROOT / ".claude" / "skills" / "job-application-assistant" / "05-cv-templates.md",
    REPO_ROOT / ".claude" / "commands" / "apply.md",
]


def fallback_block() -> str:
    text = TEMPLATE.read_text(encoding="utf-8")
    match = re.search(r"% BEGIN needspace fallback\n(.*?)% END needspace fallback", text, re.S)
    assert match, "needspace fallback markers missing from cv/main_example.tex"
    return match.group(1)


class TemplateGuard(unittest.TestCase):
    def test_template_loads_needspace_only_through_the_guard(self):
        block = fallback_block()
        self.assertIn(r"\IfFileExists{needspace.sty}{\usepackage{needspace}}", block)
        self.assertIn(r"\let\needspace\cv@needspace", block)
        outside = TEMPLATE.read_text(encoding="utf-8").replace(block, "")
        self.assertNotRegex(outside, r"(?m)^[^%\n]*\\usepackage\{needspace\}")

    def test_guidance_does_not_ask_for_a_bare_usepackage(self):
        for guide in GUIDES:
            with self.subTest(guide=guide.name):
                text = guide.read_text(encoding="utf-8")
                self.assertNotIn("Include `\\usepackage{needspace}` in the preamble", text)
                self.assertNotIn("`\\usepackage{needspace}` in preamble", text)


@unittest.skipUnless(shutil.which("lualatex"), "lualatex not installed")
class FallbackBehaviour(unittest.TestCase):
    """Fill a page to 6 lines from the bottom, then ask for N lines."""

    def page_of_target(self, need_lines: int, force_fallback: bool) -> int:
        block = fallback_block()
        if force_fallback:
            block = block.replace("{needspace.sty}", "{needspace-not-installed.sty}")
        doc = (
            "\\documentclass{article}\n" + block +
            "\\begin{document}\n\\null\n"
            "\\vskip\\dimexpr\\textheight-6\\baselineskip\\relax\n"
            f"\\needspace{{{need_lines}\\baselineskip}}\n"
            "Target\\label{target}\\par\n\\end{document}\n"
        )
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "t.tex").write_text(doc, encoding="utf-8")
            proc = subprocess.run(
                ["lualatex", "-interaction=nonstopmode", "-halt-on-error", "t.tex"],
                cwd=tmp, capture_output=True, text=True, timeout=180,
            )
            self.assertEqual(proc.returncode, 0, proc.stdout[-2000:])
            aux = (Path(tmp) / "t.aux").read_text(encoding="utf-8")
        return int(re.search(r"\\newlabel\{target\}\{\{[^}]*\}\{(\d+)\}", aux).group(1))

    def test_fallback_breaks_only_when_space_is_short(self):
        self.assertEqual(self.page_of_target(10, force_fallback=True), 2)
        self.assertEqual(self.page_of_target(2, force_fallback=True), 1)

    @unittest.skipUnless(shutil.which("kpsewhich"), "kpsewhich not installed")
    def test_fallback_matches_the_package(self):
        try:
            found = subprocess.run(["kpsewhich", "needspace.sty"], capture_output=True, text=True,
                                   timeout=60)
        except subprocess.TimeoutExpired:
            self.skipTest("kpsewhich timed out")
        if not found.stdout.strip():
            self.skipTest("needspace package not installed")
        for lines in (2, 10):
            with self.subTest(lines=lines):
                self.assertEqual(
                    self.page_of_target(lines, force_fallback=True),
                    self.page_of_target(lines, force_fallback=False),
                )


if __name__ == "__main__":
    unittest.main()
