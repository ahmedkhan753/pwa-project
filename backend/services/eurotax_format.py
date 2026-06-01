"""
Eurotax PDF format detector
============================
Two Eurotax kosztorys PDF formats are supported:

  * "original"  — the long-standing brutto/VAT format handled by
                  services.eurotax_parser.parse_eurotax_pdf (do not
                  modify).
  * "nr34"      — the newer netto/urealnienie format handled by
                  services.eurotax_nr34_parser.parse_eurotax_nr34.

`detect_format(path)` inspects only the first page so it's cheap to
call before downloading the rest of the parse work.
"""
from __future__ import annotations

import logging
from pathlib import Path

import pdfplumber

logger = logging.getLogger("services.eurotax_format")


def detect_format(pdf_path: str | Path) -> str:
    """Return "nr34" when the netto format markers are both present on
    page 1; otherwise "original". Any failure falls back to "original"
    so the existing parser is always reachable."""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            text = (pdf.pages[0].extract_text() or "") if pdf.pages else ""
    except Exception as e:
        logger.warning(f"[eurotax_format] page-1 read failed: {e}")
        return "original"

    has_header     = "KOSZTORYS EUROTAX nr" in text
    has_pozycje    = "POZYCJE KOSZTORYSU"   in text
    if has_header and has_pozycje:
        return "nr34"
    return "original"
