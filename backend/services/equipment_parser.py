"""
Equipment Parser
================
Extracts the *standard equipment* list ("WYPOSAŻENIE STANDARDOWE POJAZDU")
from a Wycena PDF and returns it as a flat list of item strings.

This module is intentionally INDEPENDENT of services/eurotax_parser.py — it
solves a different problem (a two-column bulleted list, not a priced table)
and must not be coupled to that parser's evolving internals.

Layout facts (verified on a real Škoda sample):
  * Page width ≈ 595.44, height ≈ 841.9
  * Two columns; split cleanly at x ≈ 295 (left bullets x≈79, right x≈301)
  * Bullet char is ● (U+25CF) and survives extraction as its own word
  * Items wrap across multiple lines within their column
  * extract_text() interleaves the two columns — useless here; we must work
    from extract_words() x/y coordinates instead.
"""

import io
import re
from typing import Any, Dict, List

import pdfplumber

# ─── Tunables ─────────────────────────────────────────────────────────────────

COLUMN_SPLIT_X = 295          # x0 below this → left column, at/above → right
FOOTER_MARGIN = 60            # words with top > (page.height - this) are footer
SECTION_TITLE = "WYPOSAŻENIE STANDARDOWE"
SECTION_END_TOKENS = ("WYPOSAŻENIE DODATKOWE", "DODATKOWE - DEALERSKIE")
BULLET = "●"                  # U+25CF

# Boilerplate signatures that never occur inside a genuine equipment name.
# Matched against the WHOLE assembled item (not individual words) so short
# Polish words like "z" / "i" / "o" inside real items are never stripped.
_PAGE_NUM_RE = re.compile(r"^\d+\s*/\s*\d+$")
_BOILERPLATE_SUBSTRINGS = (
    "zaufajrzeczoznawcy",
    "rybnik",
    "smolna",
    "sp. z o.o",
)
_TITLE_WORDS = {"WYPOSAŻENIE", "STANDARDOWE", "POJAZDU"}


def _is_boilerplate(text: str) -> bool:
    """True when an assembled item is page chrome rather than equipment.

    Operates on the full item string. Coordinate-based footer/header
    filtering removes most chrome already — this is a secondary safety net
    for anything that slips through.
    """
    t = (text or "").strip()
    if not t:
        return True
    if _PAGE_NUM_RE.match(t):
        return True
    low = t.lower()
    if any(s in low for s in _BOILERPLATE_SUBSTRINGS):
        return True
    # An item consisting solely of section-title words is the header echo.
    if t.upper() in _TITLE_WORDS:
        return True
    if all(tok.upper() in _TITLE_WORDS for tok in t.split()):
        return True
    return False


def _clean_item(text: str) -> str:
    """Normalise one assembled item: collapse spaces, fix known glue runs."""
    t = re.sub(r"\s+", " ", text).strip()
    # Known extraction glue: a digit fused to "cali" (e.g. "10cali" → "10 cali").
    t = re.sub(r"(\d)(cali)", r"\1 \2", t)
    return t


def _column_items(words: List[Dict[str, Any]]) -> List[str]:
    """Group one column's words into items, splitting on the ● bullet.

    Words arrive pre-filtered to a single column. They are sorted into
    reading order (line by line, left to right); a word that begins with ●
    opens a new item, every other word extends the current one — which is
    how multi-line wrapped items get reassembled.
    """
    ordered = sorted(words, key=lambda w: (round(w["top"]), w["x0"]))
    items: List[str] = []
    current: List[str] = []
    for w in ordered:
        txt = (w.get("text") or "").strip()
        if not txt:
            continue
        if txt.startswith(BULLET):
            if current:
                items.append(" ".join(current))
            current = []
            rest = txt[len(BULLET):].strip()
            if rest:
                current.append(rest)
        else:
            current.append(txt)
    if current:
        items.append(" ".join(current))
    return items


def parse_equipment_from_pdf(pdf_bytes: bytes) -> List[str]:
    """Extract standard-equipment items from a Wycena PDF.

    Coordinate-based two-column parsing. Returns the item strings in visual
    reading order (left column top-to-bottom, then right column), across all
    pages the section spans.
    """
    raw_items: List[str] = []

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        # Locate the first page carrying the standard-equipment section.
        start_idx = -1
        for i, page in enumerate(pdf.pages):
            if SECTION_TITLE in (page.extract_text() or ""):
                start_idx = i
                break
        if start_idx < 0:
            return []

        for i in range(start_idx, len(pdf.pages)):
            page = pdf.pages[i]
            page_text = page.extract_text() or ""
            words = page.extract_words(
                use_text_flow=False, keep_blank_chars=False,
                x_tolerance=2, y_tolerance=2,
            )

            # Header floor — on the start page drop everything at/above the
            # "WYPOSAŻENIE STANDARDOWE [POJAZDU]" title line.
            floor_y = -1.0
            if i == start_idx:
                title_bottoms = [
                    w["bottom"] for w in words
                    if (w.get("text") or "").strip().upper() == "STANDARDOWE"
                ]
                if title_bottoms:
                    floor_y = min(title_bottoms)

            # Section end — a page mentioning the additional-equipment header
            # is the last page; drop everything at/below that header line.
            is_end_page = any(tok in page_text for tok in SECTION_END_TOKENS)
            ceiling_y = float("inf")
            if is_end_page:
                end_tops = [
                    w["top"] for w in words
                    if (w.get("text") or "").strip().upper() == "DODATKOWE"
                ]
                if end_tops:
                    ceiling_y = min(end_tops)

            footer_y = page.height - FOOTER_MARGIN

            kept = [
                w for w in words
                if w["top"] > floor_y
                and w["top"] < ceiling_y
                and w["top"] <= footer_y
            ]

            left = [w for w in kept if w["x0"] < COLUMN_SPLIT_X]
            right = [w for w in kept if w["x0"] >= COLUMN_SPLIT_X]

            raw_items.extend(_column_items(left))
            raw_items.extend(_column_items(right))

            if is_end_page:
                break

    # Post-process: normalise, drop empties and residual boilerplate.
    out: List[str] = []
    for item in raw_items:
        cleaned = _clean_item(item)
        if not cleaned or _is_boilerplate(cleaned):
            continue
        out.append(cleaned)
    return out
