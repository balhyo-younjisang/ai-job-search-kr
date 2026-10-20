"""Every local image referenced by either README must exist in the repo.

A broken header image on the repo landing page is a silent, high-visibility
failure; this guard turns it into a red CI run instead.
"""
import re
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
READMES = (REPO / "README.md", REPO / "README-en.md")

IMG_SRC = re.compile(r'<img[^>]+src="([^"]+)"')
MD_IMG = re.compile(r"!\[[^\]]*\]\(([^)\s]+)")


class ReadmeImageReferences(unittest.TestCase):
    def _local_refs(self, readme):
        text = readme.read_text(encoding="utf-8")
        refs = IMG_SRC.findall(text) + MD_IMG.findall(text)
        return [r for r in refs if not r.startswith(("http://", "https://"))]

    def test_readme_exists_and_references_at_least_one_local_image(self):
        for readme in READMES:
            with self.subTest(readme=readme.name):
                refs = self._local_refs(readme)
                self.assertGreaterEqual(len(refs), 1, "README lost its mascot header image")

    def test_all_local_image_references_resolve(self):
        for readme in READMES:
            for ref in self._local_refs(readme):
                with self.subTest(readme=readme.name, ref=ref):
                    self.assertTrue((REPO / ref).is_file(), f"{readme.name} references missing file: {ref}")


if __name__ == "__main__":
    unittest.main()
