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
  * Whitespace is removed on both sides, Unicode is NFKC-folded, zero-width
    characters are dropped, and middle dots, quotes and dashes are unified.
    Letters and digits must match exactly, case included.
  * Script, style, noscript and svg bodies and attribute values never count.
Quotes shorter than MIN_CHARS after normalisation prove nothing and are
refused.

Usage:
  python3 tools/verify_quotes.py --page PAGE.html [--page ...] --quote TEXT [--quote ...]

Prints one `FOUND <page>` or `NOT FOUND` line per quote, plus a `note:` line
when a page has too little text to judge.
Exit codes: 0 every quote found; 1 at least one not found; 2 usage error.
"""

import argparse
import html
import re
import sys
import tempfile
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from page_decode import decode_page  # noqa: E402

MIN_CHARS = 8
# Below this much text the page is probably rendered client-side, so a miss
# says little about the site itself.
THIN_PAGE_CHARS = 200

BLOCK_TAGS = (
    "address|article|aside|blockquote|body|button|caption|dd|details|dialog|div|dl|dt|"
    "fieldset|figcaption|figure|footer|form|h[1-6]|head|header|hr|html|label|legend|li|"
    "main|nav|ol|option|p|pre|section|select|summary|table|tbody|td|tfoot|th|thead|"
    "title|tr|ul"
)
_BLOCK = re.compile(rf"(?is)</?(?:{BLOCK_TAGS})\b[^>]*>")
_SEP = "\x00"

_FOLD = str.maketrans({
    "‧": "·", "∙": "·", "⋅": "·", "・": "·", "･": "·", "ㆍ": "·",
    "‘": "'", "’": "'", "“": '"', "”": '"',
    "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "−": "-",
    "​": None, "‌": None, "‍": None, "⁠": None, "﻿": None, "­": None,
})


def normalise(text: str) -> str:
    # Fold before NFKC too: NFKC turns ㆍ (U+318D) into a conjoining jamo.
    text = unicodedata.normalize("NFKC", text.translate(_FOLD)).translate(_FOLD)
    return re.sub(r"\s+", "", text)


def page_blocks(markup: str) -> list[str]:
    """Normalised text of each block, inline markup removed inside blocks."""
    text = re.sub(r"(?is)<(script|style|noscript|svg|template)[^>]*>.*?</\1>", _SEP, markup)
    text = re.sub(r"(?s)<!--.*?-->", _SEP, text)
    text = _BLOCK.sub(_SEP, text)
    text = re.sub(r"(?s)<[^>]*>", "", text)
    blocks = (normalise(html.unescape(part)) for part in text.split(_SEP))
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
        if len(norm) < MIN_CHARS:
            print(f"error: quote too short to prove anything (<{MIN_CHARS} chars): {quote!r}",
                  file=sys.stderr)
            return 2

    missing = 0
    for quote, norm in quotes:
        hit = next((p for p, blocks in pages.items() if any(norm in b for b in blocks)), None)
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
