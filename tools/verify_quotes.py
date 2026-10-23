#!/usr/bin/env python3
"""Check that quoted company text really appears on a fetched page.

A company claim reaches the cover letter only after its quote is found here.
Neither the reviewer's research nor a WebFetch answer is proof: WebFetch
returns a small model's reading of the page, which can miss a section or
reword it, so it can neither confirm nor refute a quote. This script compares
against the page body that `tools/fetch_page.py` saved.

Offline by design: it reads saved files and opens no connection, so fetching
stays behind fetch_page.py's robots.txt gate. It reads only files under the
system temp directory (where fetch_page.py saves by default) or /tmp (where
session scratchpads live), so it cannot be pointed at ~/.ssh or a .env file
to test guesses about their contents.

Matching is forgiving about layout and strict about words:
  * A quote must sit inside one block (heading, paragraph, list item, cell).
    Inline markup inside the block (<br>, <span>, <a>, <strong>) is ignored,
    so a heading split over two lines still matches; text from two separate
    blocks never joins into one match.
  * Spacing differences are ignored except between two Latin-script letters
    or digits: "멀티 에이전트" matches "멀티에이전트" and "KT · KTDS" matches
    "KT·KTDS", but "now here" never matches "nowhere". A quote that starts or
    ends with such a letter must also start or end on a word boundary.
  * Unicode is NFKC-folded, zero-width characters are dropped, and middle
    dots, quotes and dashes are unified. Letters and digits must match
    exactly, case included.
  * The page is read with an HTML parser: script, style, noscript, svg and
    template bodies, comments and attribute values never count.
Quotes shorter than MIN_CHARS after normalisation prove nothing and are
refused.

Usage:
  python3 tools/verify_quotes.py --page PAGE.html [--page ...] --quote TEXT [--quote ...]

Prints one `FOUND <page>` or `NOT FOUND` line per quote, plus a `note:` line
when a page has too little text to judge.
Exit codes: 0 every quote found; 1 at least one not found; 2 usage error.
"""

import argparse
import re
import sys
import tempfile
import unicodedata
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from page_decode import decode_page  # noqa: E402

MIN_CHARS = 8
# Below this much text the page is probably rendered client-side, so a miss
# says little about the site itself.
THIN_PAGE_CHARS = 200

BLOCK_TAGS = frozenset("""
    address article aside blockquote body button caption dd details dialog div dl dt
    fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hr html label
    legend li main nav ol option p pre section select summary table tbody td tfoot th
    thead title tr ul
""".split())
SKIP_TAGS = frozenset({"script", "style", "noscript", "svg", "template"})
_SEP = "\x00"

_FOLD = str.maketrans({
    "\u2027": "·", "\u2219": "·", "\u22c5": "·", "\u30fb": "·", "\uff65": "·", "\u318d": "·",
    "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"',
    "\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2013": "-", "\u2014": "-", "\u2212": "-",
    "\u200b": None, "\u200c": None, "\u200d": None, "\u2060": None, "\ufeff": None, "\u00ad": None,
})

# Latin, Greek and Cyrillic letters and digits: scripts that separate words
# with spaces, so a space between two of them is part of the text.
WORD = "0-9A-Za-z\u00c0-\u024f\u0370-\u03ff\u0400-\u04ff"
_DROP_SPACE = re.compile(rf"(?<![{WORD}]) | (?![{WORD}])")
_WORD_CHAR = re.compile(rf"[{WORD}]")


def normalise(text: str) -> str:
    # Fold before NFKC too: NFKC turns ㆍ (U+318D) into a conjoining jamo.
    text = unicodedata.normalize("NFKC", text.translate(_FOLD)).translate(_FOLD)
    text = re.sub(r"\s+", " ", text).strip()
    return _DROP_SPACE.sub("", text)


def quote_pattern(norm: str) -> re.Pattern:
    pattern = re.escape(norm)
    if _WORD_CHAR.match(norm[0]):
        pattern = rf"(?<![{WORD}])" + pattern
    if _WORD_CHAR.match(norm[-1]):
        pattern += rf"(?![{WORD}])"
    return re.compile(pattern)


class _BlockText(HTMLParser):
    """Page text only: a separator at block boundaries, nothing from attributes."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in SKIP_TAGS:
            self.skip += 1
        elif tag in BLOCK_TAGS:
            self.parts.append(_SEP)
        elif tag == "br":
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in SKIP_TAGS:
            self.skip = max(0, self.skip - 1)
        elif tag in BLOCK_TAGS:
            self.parts.append(_SEP)

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def page_blocks(markup: str) -> list[str]:
    """Normalised text of each block, inline markup removed inside blocks."""
    parser = _BlockText()
    parser.feed(markup)
    parser.close()
    blocks = (normalise(part) for part in "".join(parser.parts).split(_SEP))
    return [b for b in blocks if b]


def allowed_roots() -> list[Path]:
    roots = [Path(tempfile.gettempdir()).resolve()]
    tmp = Path("/tmp")
    if tmp.is_dir():
        roots.append(tmp.resolve())
    return roots


def main(argv=None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Check quotes against saved pages (offline).")
    parser.add_argument("--page", action="append", required=True, type=Path,
                        help="a body saved by tools/fetch_page.py (repeatable; under the temp dir or /tmp)")
    parser.add_argument("--quote", action="append", required=True,
                        help="verbatim text the claim relies on (repeatable)")
    args = parser.parse_args(argv)

    roots = allowed_roots()
    pages = {}
    for path in args.page:
        resolved = path.expanduser().resolve()
        if not any(resolved.is_relative_to(root) for root in roots):
            where = " or ".join(str(r) for r in roots)
            print(f"error: --page must be a file fetch_page.py saved under {where}: {path}",
                  file=sys.stderr)
            return 2
        if not resolved.is_file():
            print(f"error: no such page file: {path}", file=sys.stderr)
            return 2
        pages[path] = page_blocks(decode_page(resolved.read_bytes()))

    quotes = [(q, normalise(q)) for q in args.quote]
    for quote, norm in quotes:
        if len(norm.replace(" ", "")) < MIN_CHARS:
            print(f"error: quote too short to prove anything (<{MIN_CHARS} chars): {quote!r}",
                  file=sys.stderr)
            return 2

    missing = 0
    for quote, norm in quotes:
        pattern = quote_pattern(norm)
        hit = next((p for p, blocks in pages.items() if any(pattern.search(b) for b in blocks)), None)
        if hit:
            print(f"FOUND {hit}: {quote}")
        else:
            missing += 1
            print(f"NOT FOUND: {quote}")
    if missing:
        for path, blocks in pages.items():
            if sum(map(len, blocks)) < THIN_PAGE_CHARS:
                print(f"note: very little text in {path}; the page may be rendered client-side, "
                      "so this miss is unverifiable, not a verdict on the site")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
