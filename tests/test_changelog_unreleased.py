"""Structural guard for this fork's CHANGELOG.md [Unreleased] section.

Upstream froze its changelog at 1.7.4 and replaced this check with a hash pin
that only runs in the upstream repo (tests/test_changelog_structure.py). This
fork still keeps a hand-edited [Unreleased] section, so the old check lives on
here, in a file upstream does not have, and skips in an upstream checkout.

It catches a second `### Fixed` heading under [Unreleased], entries above any
`###` heading, headings Keep a Changelog does not define, and conflict
markers. Released sections are history and are not inspected.
"""
import unittest
from pathlib import Path

try:
    from tests._upstream import is_upstream_checkout
except ImportError:  # `python -m unittest discover -s tests` imports test modules top-level
    from _upstream import is_upstream_checkout

REPO = Path(__file__).resolve().parent.parent
CHANGELOG = REPO / "CHANGELOG.md"

KNOWN_HEADINGS = {"Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"}
CONFLICT_MARKERS = ("<<<<<<< ", "=======", ">>>>>>> ")


def unreleased_block(text: str) -> str:
    """The lines between `## [Unreleased]` and the next `## [` heading.

    An absent heading (right after a release cut) yields an empty block:
    nothing to check is not a defect."""
    start = text.find("## [Unreleased]")
    if start == -1:
        return ""
    end = text.find("\n## [", start + 1)
    return text[start:] if end == -1 else text[start:end]


def unreleased_problems(text: str) -> list[str]:
    """Return a human-readable problem per structural defect in [Unreleased]."""
    problems: list[str] = []
    seen: list[str] = []
    current: str | None = None
    for lineno, line in enumerate(unreleased_block(text).splitlines(), 1):
        if any(line.startswith(marker) for marker in CONFLICT_MARKERS):
            problems.append(f"conflict marker on [Unreleased] line {lineno}: {line.strip()}")
            continue
        if line.startswith("### "):
            name = line[4:].strip()
            if name not in KNOWN_HEADINGS:
                problems.append(
                    f"unknown heading '### {name}' in [Unreleased]; use one of {sorted(KNOWN_HEADINGS)}"
                )
            if name in seen:
                problems.append(
                    f"'### {name}' appears twice in [Unreleased] - fold the entry into the existing section"
                )
            seen.append(name)
            current = name
        elif line.startswith("- ") and current is None:
            problems.append(f"entry above any '###' heading in [Unreleased]: {line.strip()[:70]}")
    return problems


CLEAN = """# Changelog

## [Unreleased]

### Added

- **A new thing** - described.

### Fixed

- **A fixed thing** - described.

## [1.0.0] - 2026-01-01

### Fixed

- old entry
"""


class UnreleasedProblemsTests(unittest.TestCase):
    def test_clean_section_reports_nothing(self):
        self.assertEqual(unreleased_problems(CLEAN), [])

    def test_duplicate_heading_is_reported(self):
        # The exact #425 shape: a second "### Fixed" inserted directly under
        # [Unreleased], above "### Added", while "### Fixed" already exists below.
        text = CLEAN.replace(
            "## [Unreleased]\n\n### Added",
            "## [Unreleased]\n\n### Fixed\n\n- **Entry in the wrong place** - described.\n\n### Added",
        )
        problems = unreleased_problems(text)
        self.assertTrue(any("Fixed" in p and "twice" in p for p in problems), problems)

    def test_unknown_heading_is_reported(self):
        text = CLEAN.replace("### Fixed", "### Fixes")
        problems = unreleased_problems(text)
        self.assertTrue(any("Fixes" in p for p in problems), problems)

    def test_entry_above_any_heading_is_reported(self):
        text = CLEAN.replace(
            "## [Unreleased]\n\n### Added",
            "## [Unreleased]\n\n- **Orphan entry** - no heading above it.\n\n### Added",
        )
        problems = unreleased_problems(text)
        self.assertTrue(any("Orphan entry" in p for p in problems), problems)

    def test_conflict_markers_are_reported(self):
        text = CLEAN.replace("### Fixed", "<<<<<<< HEAD\n### Fixed")
        problems = unreleased_problems(text)
        self.assertTrue(any("conflict marker" in p for p in problems), problems)

    def test_missing_unreleased_section_is_not_a_defect(self):
        # Right after a release cut there may be no [Unreleased] heading at all
        # (the 1.7.0 cut removed it). Nothing to check is not a failure.
        text = "# Changelog\n\n## [1.7.1] - 2026-09-06\n\n### Fixed\n\n- **A fixed thing** - described.\n"
        self.assertEqual(unreleased_problems(text), [])

    def test_released_sections_are_not_inspected(self):
        # A duplicate heading in an old release is history, not a defect here.
        text = CLEAN + "\n### Fixed\n\n- another old entry\n"
        self.assertEqual(unreleased_problems(text), [])


@unittest.skipIf(is_upstream_checkout(), "upstream froze its changelog; tests/test_changelog_structure.py pins it")
class RealChangelogTests(unittest.TestCase):
    def test_unreleased_section_is_well_formed(self):
        text = CHANGELOG.read_text(encoding="utf-8")
        self.assertEqual(unreleased_problems(text), [])


if __name__ == "__main__":
    unittest.main()
