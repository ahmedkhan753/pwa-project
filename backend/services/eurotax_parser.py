"""
Eurotax Kosztorys (Polish vehicle valuation/repair-cost report) PDF parser.

Extracts structured data from text-based Eurotax PDFs into the
KosztorysData JSON shape consumed by the frontend kosztorys page.

Tested against 4 samples (Audi Q3, BMW X3, Skoda Superb, Renault Clio)
covering all combinations of the three optional work sections
(Blacharz, Pr.dodatkowe, Lakiernik).

Strategy
--------
Eurotax PDFs are tabular but pdfplumber's `extract_table()` mis-detects
columns because the underlying PDF has no ruling lines and column
widths vary slightly per row. Instead we:

  1. Pull words with x/y coordinates via `extract_words()`.
  2. Group words into lines by y-coordinate.
  3. Capture column-header x-positions when we hit a section header
     ("Blacharz Rodz. Czasy Potrącenia Robocizna Materiał" or the
     Lakiernik variant).
  4. Bucket each row's numeric values into the matching column by
     x-proximity. This handles rows that print blank columns (e.g.,
     no Potrącenia → only 3 numbers visible), which a simple
     count-the-numbers approach gets wrong.
  5. Description wraps and indented sub-items are folded back into
     their parent operation row using x-indent + value-presence cues.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pdfplumber

# ─── Constants ────────────────────────────────────────────────────────────────

RODZ_TOKENS_BLACH = {"WY", "WZ", "KD"}        # blacharz / pr.dodatkowe
RODZ_LAKIERNIK = "200"                         # lakiernik always has rodz=200

SECTION_HEADERS = ("Blacharz", "Pr.dodatkowe", "Lakiernik")

NUM_RE = re.compile(r"^-?\d+(?:[.,]\d+)?$")
PCT_RE = re.compile(r"^(-?\d+(?:[.,]\d+)?)\s*%?$")

PAGE_FOOTER_RE = re.compile(r"^-\s*\d+\s*-$")

# Header field labels → JSON keys
HEADER_FIELDS = (
    ("Marka/Model/Typ", "make_model_type"),
    ("Kod ETG",          "etg_code"),
    ("Nr rejestracyjny", "registration_plate"),
    ("VIN",              "vin"),
    ("Data",             "date"),
    ("System lakierniczy", "paint_system"),
    ("Logika szkód gradowych", "hail_logic"),
    ("Jednostki czasowe", "time_units"),
    ("Waluta",           "currency"),
    ("Wersja bazy",      "base_version"),
    ("Klient",           "klient"),
)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _is_num(s: str) -> bool:
    return bool(NUM_RE.match(s))


def _to_num(s: str) -> Optional[float]:
    if s is None:
        return None
    try:
        return float(str(s).replace(",", "."))
    except (ValueError, AttributeError):
        return None


def _line_text(words: List[Dict[str, Any]]) -> str:
    return " ".join(w["text"] for w in words).strip()


def _closest_column(x: float, columns: Dict[str, float], tol: float = 35.0) -> Optional[str]:
    """Return the column name whose anchor x is closest to `x`, within tol."""
    best = None
    best_dist = float("inf")
    for name, anchor_x in columns.items():
        d = abs(x - anchor_x)
        if d < best_dist:
            best_dist = d
            best = name
    return best if best_dist <= tol else None


# ─── Line extraction ──────────────────────────────────────────────────────────

_Y_LINE_TOL = 3.0  # px — Eurotax PDFs render codes ~1 px below description text


def _extract_lines(pdf_path: str | Path) -> List[Dict[str, Any]]:
    """
    Pull words from every page, cluster words into visual lines, drop footers.

    Eurotax PDFs render the operation code ~1 px below the description text
    (y=321 for "Szyba przednia atermiczna", y=322 for "64105500"), so a naive
    `int(round(top))` bucket splits them. Cluster by y within `_Y_LINE_TOL`
    pixels instead.
    """
    out: List[Dict[str, Any]] = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for page in pdf.pages:
            words = page.extract_words(
                use_text_flow=False, keep_blank_chars=False,
                x_tolerance=2, y_tolerance=2,
            )
            # Sort by y, then x
            words = sorted(words, key=lambda w: (w["top"], w["x0"]))
            line_buckets: List[List[Dict[str, Any]]] = []
            line_anchors: List[float] = []
            for w in words:
                y = w["top"]
                # Find an existing line within tol
                matched = -1
                for li, anchor in enumerate(line_anchors):
                    if abs(y - anchor) <= _Y_LINE_TOL:
                        matched = li
                        break
                if matched >= 0:
                    line_buckets[matched].append(w)
                else:
                    line_buckets.append([w])
                    line_anchors.append(y)
            # Build line dicts in y-order
            ordered = sorted(zip(line_anchors, line_buckets), key=lambda t: t[0])
            for anchor, ws in ordered:
                ws_sorted = sorted(ws, key=lambda x: x["x0"])
                txt = _line_text(ws_sorted)
                if not txt or PAGE_FOOTER_RE.fullmatch(txt):
                    continue
                out.append({
                    "page":  page.page_number,
                    "y":     anchor,
                    "words": ws_sorted,
                    "text":  txt,
                })
    return out


# ─── Header parsing ───────────────────────────────────────────────────────────

def _parse_header(lines: List[Dict[str, Any]]) -> Tuple[Dict[str, str], int]:
    """
    Read 'Label: value' lines until the first section header.
    Returns (header_dict, index_of_first_section_header_line).
    """
    result = {key: "" for _, key in HEADER_FIELDS}
    section_start = len(lines)
    for i, line in enumerate(lines):
        text = line["text"]
        if any(text.startswith(h) for h in SECTION_HEADERS):
            section_start = i
            break
        for label, key in HEADER_FIELDS:
            prefix = label + ":"
            if text.startswith(prefix):
                result[key] = text[len(prefix):].strip()
                break
    return result, section_start


# ─── Section column anchors ───────────────────────────────────────────────────

def _capture_columns(header_words: List[Dict[str, Any]], section_kind: str) -> Dict[str, float]:
    """
    Capture x-anchor for each value column from the section header line.
    section_kind: 'blach' (blacharz/pr.dodatkowe) or 'lakier'.
    """
    cols: Dict[str, float] = {}
    if section_kind == "blach":
        wanted = {
            "Rodz.": "rodz",
            "Czasy": "czasy",
            "Potrącenia": "potracenia",
            "Robocizna": "robocizna",
            "Materiał": "material",
        }
    else:  # lakier
        wanted = {
            "Rodz.": "rodz",
            "Stopień": "stopien",
            "Czasy": "czasy",
            "Robocizna": "robocizna",
            "Materiał": "material",
        }
    for w in header_words:
        for label, key in wanted.items():
            if w["text"] == label and key not in cols:
                cols[key] = w["x0"]
    return cols


# ─── Row parsing ──────────────────────────────────────────────────────────────

def _split_row_words(words: List[Dict[str, Any]], cols: Dict[str, float],
                     section_kind: str) -> Tuple[Optional[str], List[str], Dict[str, Optional[float]], Optional[str]]:
    """
    Given a row's words and section column anchors, separate into:
      - code (first token if it's a numeric ID or 'NN', only for blacharz/pr.dodatkowe)
      - description tokens (anything before Rodz column)
      - column values dict (czasy, potracenia/None, robocizna, material, stopien/None)
      - rodz_napraw token (or None)
    section_kind: 'blach' or 'lakier'.
    """
    rodz_x = cols.get("rodz", 999)

    # 1. Find the rodz word (first WY/WZ/KD/200 at-or-near rodz_x).
    rodz_idx = None
    rodz_token = None
    rodz_was_suffix = False  # True if rodz was glued to end of a longer word
    for i, w in enumerate(words):
        if section_kind == "blach":
            if w["text"] in RODZ_TOKENS_BLACH and abs(w["x0"] - rodz_x) <= 30:
                rodz_idx = i
                rodz_token = w["text"]
                break
            # Eurotax sometimes prints e.g. "Kpl.montażowy/naprawczy-kpl.doWY"
            # (description + rodz with no separating space). Detect rodz as
            # trailing suffix when the word END would land near rodz_x.
            if abs(w["x0"] + w["width"] - (rodz_x + 12)) <= 30:
                for tok in RODZ_TOKENS_BLACH:
                    if w["text"].endswith(tok) and len(w["text"]) > len(tok):
                        rodz_idx = i
                        rodz_token = tok
                        rodz_was_suffix = True
                        break
                if rodz_token:
                    break
        else:  # lakier
            if w["text"] == RODZ_LAKIERNIK and abs(w["x0"] - rodz_x) <= 30:
                rodz_idx = i
                rodz_token = w["text"]
                break

    # 2. Pre-rodz: code + description
    code = None
    desc_tokens: List[str] = []
    if rodz_idx is None:
        # No rodz on this line — all words go to description (continuation/sub-item)
        pre = words
        post = []
    else:
        pre = words[:rodz_idx]
        post = words[rodz_idx + 1:]
        if rodz_was_suffix:
            # The word AT rodz_idx was "<desc>WY" — strip suffix, keep desc part
            # in pre so it joins the description.
            wsuf = words[rodz_idx]
            stripped = wsuf["text"][: -len(rodz_token)]
            if stripped:
                pre = pre + [{**wsuf, "text": stripped}]

    if section_kind == "blach" and pre:
        first = pre[0]
        # Code is the first token if it's numeric or 'NN' AND in left-most column area
        if first["x0"] < 80 and (first["text"] == "NN" or first["text"].isdigit()):
            code = first["text"]
            desc_tokens = [w["text"] for w in pre[1:]]
        else:
            desc_tokens = [w["text"] for w in pre]
    else:
        desc_tokens = [w["text"] for w in pre]

    # 3. Post-rodz: assign each word to its column by x-proximity
    value_cols = {k: cols[k] for k in ("czasy", "potracenia", "robocizna", "material", "stopien") if k in cols}
    values: Dict[str, Optional[float]] = {k: None for k in value_cols}
    stopien: Optional[str] = None

    for w in post:
        col = _closest_column(w["x0"], value_cols, tol=35)
        if col is None:
            continue
        if col == "stopien":
            # Stopień is alphanumeric, not numeric
            stopien = w["text"]
        else:
            n = _to_num(w["text"])
            if n is not None and values[col] is None:
                values[col] = n
            elif n is not None:
                # Collision (rare). Keep first-seen value.
                pass

    return code, desc_tokens, values, rodz_token, stopien


def _is_section_end(text: str) -> bool:
    """Section ends when we hit 'Robocizna [total]' / 'Materiał [total]' / 'Razem'."""
    return (
        text.startswith("Robocizna ")
        or text.startswith("Materiał ")
        or text.startswith("Razem ")
        or text.startswith("Łącznie")
    )


def _parse_section(
    lines: List[Dict[str, Any]],
    start_idx: int,
    section_label: str,
    section_kind: str,
) -> Tuple[Dict[str, Any], int]:
    """
    Parse one section starting at lines[start_idx] (the header line).
    Returns (section_dict, index_of_first_line_after_section_totals).
    """
    header_line = lines[start_idx]
    cols = _capture_columns(header_line["words"], section_kind)

    rows: List[Dict[str, Any]] = []
    cur: Optional[Dict[str, Any]] = None
    section_totals = {"labor_pln": None, "material_pln": None, "total_pln": None}

    i = start_idx + 1
    # Skip "napraw" continuation header line
    while i < len(lines):
        text = lines[i]["text"].strip()
        if text == "napraw":
            i += 1
            continue
        break

    while i < len(lines):
        line = lines[i]
        text = line["text"]

        # Section totals — collect & exit
        if text.startswith("Robocizna "):
            parts = text.split()
            if len(parts) >= 2:
                section_totals["labor_pln"] = _to_num(parts[-1])
            i += 1
            continue
        if text.startswith("Materiał "):
            parts = text.split()
            if len(parts) >= 2:
                section_totals["material_pln"] = _to_num(parts[-1])
            i += 1
            continue
        if text.startswith("Razem "):
            # "Razem blacharz PLN 4412.08" / "Razem prace pomocnicze PLN 1600.00" / "Razem lakiernik PLN ..."
            parts = text.split()
            if len(parts) >= 2:
                section_totals["total_pln"] = _to_num(parts[-1])
            i += 1
            return {
                "present": True,
                "rows": rows,
                "totals": section_totals,
            }, i

        # Next section starts here? Bail without consuming.
        if any(text.startswith(h) for h in SECTION_HEADERS) or text.startswith("Łącznie"):
            return {"present": True, "rows": rows, "totals": section_totals}, i

        # Notes attached to current row
        if cur is not None and (text.startswith("Czas - uwagi:") or text.startswith("Opcje wyposażenia:")):
            cur.setdefault("notes", []).append(text)
            i += 1
            continue

        # Try to parse as row
        code, desc_tokens, values, rodz_token, stopien = _split_row_words(
            line["words"], cols, section_kind,
        )

        has_values = any(v is not None for v in values.values())
        if rodz_token is not None or has_values:
            # New parent operation row
            cur = _build_row(section_kind, code, desc_tokens, values, rodz_token, stopien)
            rows.append(cur)
        else:
            # No rodz, no values → either description-wrap or sub-item
            if cur is None:
                i += 1
                continue
            # Sub-item heuristic for blacharz/pr.dodatkowe:
            # the line has a code in the left-most column area.
            first_w = line["words"][0] if line["words"] else None
            looks_like_subitem = (
                section_kind == "blach"
                and first_w is not None
                and first_w["x0"] < 80
                and (first_w["text"].isdigit() or first_w["text"] == "NN")
            )
            if looks_like_subitem:
                sub_code = first_w["text"]
                sub_desc = " ".join(w["text"] for w in line["words"][1:]).strip()
                cur.setdefault("sub_items", []).append({
                    "code": sub_code,
                    "description": sub_desc,
                })
            else:
                # Description continuation — append to current row's description
                cont = _line_text(line["words"])
                cur["description"] = (cur.get("description", "") + " " + cont).strip()

        i += 1

    return {"present": True, "rows": rows, "totals": section_totals}, i


def _build_row(section_kind: str, code: Optional[str], desc_tokens: List[str],
               values: Dict[str, Optional[float]], rodz_token: Optional[str],
               stopien: Optional[str]) -> Dict[str, Any]:
    desc = " ".join(desc_tokens).strip()
    if section_kind == "blach":
        return {
            "code":          code,
            "description":   desc,
            "operation_type": rodz_token,
            "hours":         values.get("czasy"),
            "deduction":     values.get("potracenia"),
            "labor_pln":     values.get("robocizna"),
            "material_pln":  values.get("material"),
            "sub_items":     [],
            "notes":         [],
        }
    else:  # lakier
        return {
            "description":   desc,
            "rodz_napraw":   rodz_token,
            "stopien":       stopien,
            "hours":         values.get("czasy"),
            "labor_pln":     values.get("robocizna"),
            "material_pln":  values.get("material"),
        }


# ─── Łącznie summary ──────────────────────────────────────────────────────────

def _parse_summary(lines: List[Dict[str, Any]], start_idx: int) -> Tuple[Dict[str, Any], int]:
    """
    Parse the 'Łącznie' summary table.
    Returns (summary_dict, index_after_summary).
    """
    summary: Dict[str, Any] = {
        "per_section": [],
        "small_materials_pct": None,
        "small_materials_pln": None,
        "total_labor": None,
        "total_labor_hours": None,
        "total_material": None,
        "subtotal_no_vat": None,
        "vat_pct": None,
        "vat_amount": None,
        "total_with_vat_pln": None,
        "total_eur": None,
    }

    i = start_idx
    if i >= len(lines) or not lines[i]["text"].startswith("Łącznie"):
        return summary, start_idx
    i += 1

    section_names_pl = ("Blacharz", "Pr.dodatkowe", "Lakiernik")

    while i < len(lines):
        text = lines[i]["text"]
        # End of summary: parts list header or end of doc
        if text.startswith("Nazwa części") or text.startswith("Skrót") or text.startswith("Opcje wyposażenia") or text.startswith("Indeks"):
            return summary, i

        parts = text.split()

        # Per-section row
        if parts and parts[0] in section_names_pl:
            nums = [_to_num(p) for p in parts[1:] if _is_num(p)]
            section_label = parts[0]
            row = {"section": section_label, "rate": None, "hours": None, "labor": None, "material": None}
            if len(nums) >= 1:
                row["rate"] = nums[0]
            if len(nums) >= 2:
                row["hours"] = nums[1]
            if len(nums) >= 3:
                row["labor"] = nums[2]
            if len(nums) >= 4:
                row["material"] = nums[3]
            summary["per_section"].append(row)
            i += 1
            continue

        if text.startswith("Mat.drobne"):
            # "Mat.drobne i dodatk. (2.00 %) 105.44"
            m_pct = re.search(r"\(([\d.,]+)\s*%?\)", text)
            if m_pct:
                summary["small_materials_pct"] = _to_num(m_pct.group(1))
            nums = [_to_num(p) for p in parts if _is_num(p)]
            if nums:
                summary["small_materials_pln"] = nums[-1]
            i += 1
            continue

        if text.startswith("Razem robocizna"):
            nums = [_to_num(p) for p in parts if _is_num(p)]
            if len(nums) >= 1:
                summary["total_labor_hours"] = nums[0]
            if len(nums) >= 2:
                summary["total_labor"] = nums[1]
            i += 1
            continue

        if text.startswith("Razem materiał"):
            nums = [_to_num(p) for p in parts if _is_num(p)]
            if nums:
                summary["total_material"] = nums[-1]
            i += 1
            continue

        if text.startswith("Koszty naprawy bez VAT"):
            nums = [_to_num(p) for p in parts if _is_num(p)]
            if nums:
                summary["subtotal_no_vat"] = nums[-1]
            i += 1
            continue

        if text.startswith("VAT "):
            m_pct = re.search(r"\(([\d.,]+)\s*%?\)", text)
            if m_pct:
                summary["vat_pct"] = _to_num(m_pct.group(1))
            nums = [_to_num(p) for p in parts if _is_num(p)]
            if nums:
                summary["vat_amount"] = nums[-1]
            i += 1
            continue

        if text.startswith("Koszt naprawy z VAT"):
            nums = [_to_num(p) for p in parts if _is_num(p)]
            if nums:
                summary["total_with_vat_pln"] = nums[-1]
            i += 1
            continue

        # EUR conversion: starts with € symbol
        if text.startswith("€"):
            nums = [_to_num(p) for p in parts if _is_num(p)]
            if nums:
                summary["total_eur"] = nums[-1]
            i += 1
            continue

        # Unknown line in summary block — skip
        i += 1

    return summary, i


# ─── Parts list ───────────────────────────────────────────────────────────────

def _parse_parts(lines: List[Dict[str, Any]], start_idx: int) -> Tuple[List[Dict[str, Any]], Optional[float], int]:
    """
    Parse 'Nazwa części /Miejsce / Numer | Numer części | Poprzedni numer części | Materiał'.
    Stops at 'Razem części PLN <total>'. Returns (parts_list, total_pln, next_idx).
    """
    parts_list: List[Dict[str, Any]] = []
    total_pln: Optional[float] = None
    i = start_idx

    # Find the REAL parts-list header. There are two "Nazwa części" headers
    # in some PDFs:
    #   1. parts list:    "Nazwa części /Miejsce / Numer Numer części Poprzedni numer części Materiał"
    #   2. mappings list: "Nazwa części /Miejsce / Numer Numer pozycji naprawy"
    # The mappings list must be skipped — its columns don't match this parser.
    # Distinguishing token: the parts list header ends with "Materiał".
    while i < len(lines):
        text = lines[i]["text"]
        if text.startswith("Nazwa części") and "Materiał" in text:
            break
        if text.startswith("Skrót") or text.startswith("Rodzaj") or text.startswith("Indeks"):
            # Hit a downstream section before any parts header — no parts in this PDF.
            return parts_list, total_pln, i
        i += 1
    if i >= len(lines):
        return parts_list, total_pln, i

    # Capture header column anchors. The header reads:
    # "Nazwa części /Miejsce / Numer | Numer części | Poprzedni numer części | Materiał"
    # The first "Numer" belongs to the leftmost column label ("/Miejsce / Numer"),
    # so the part_number column anchor is the SECOND "Numer" word.
    hdr_words = lines[i]["words"]
    col_x: Dict[str, float] = {}
    numer_seen = 0
    for w in hdr_words:
        if w["text"] == "Numer":
            numer_seen += 1
            if numer_seen == 2 and "part_number" not in col_x:
                col_x["part_number"] = w["x0"]
        elif w["text"] == "Poprzedni" and "previous" not in col_x:
            col_x["previous"] = w["x0"]
        elif w["text"] == "Materiał" and "material" not in col_x:
            col_x["material"] = w["x0"]
    i += 1

    cur: Optional[Dict[str, Any]] = None
    while i < len(lines):
        text = lines[i]["text"]

        if text.startswith("Razem części"):
            nums = [_to_num(p) for p in text.split() if _is_num(p)]
            if nums:
                total_pln = nums[-1]
            i += 1
            return parts_list, total_pln, i

        # Stop sentinels for safety
        if text.startswith("Uwaga:") or text.startswith("Skrót") or text.startswith("Nazwa części"):
            return parts_list, total_pln, i

        # Parse row: words to the right of part_number anchor are part_number / prev / material;
        # everything before is description.
        words = lines[i]["words"]
        if not words:
            i += 1
            continue

        desc_words = []
        pn_word = None
        prev_word = None
        material_val: Optional[float] = None

        pn_x = col_x.get("part_number", 999)
        prev_x = col_x.get("previous", 999)
        mat_x = col_x.get("material", 999)

        for w in words:
            if w["x0"] < pn_x - 5:
                desc_words.append(w["text"])
            elif w["x0"] < prev_x - 5:
                if pn_word is None:
                    pn_word = w["text"]
                else:
                    pn_word += " " + w["text"]
            elif w["x0"] < mat_x - 5:
                if prev_word is None:
                    prev_word = w["text"]
                else:
                    prev_word += " " + w["text"]
            else:
                # Material value
                v = _to_num(w["text"])
                if v is not None:
                    material_val = v

        desc = " ".join(desc_words).strip()
        if not desc and not pn_word and material_val is None:
            i += 1
            continue

        # Description-continuation line (no part number on this line, and we have a current part)
        if cur is not None and desc and not pn_word and material_val is None:
            cur["description"] = (cur["description"] + " " + desc).strip()
        else:
            cur = {
                "description":           desc,
                "part_number":           pn_word,
                "previous_part_number":  prev_word,
                "price_pln":             material_val,
            }
            parts_list.append(cur)

        i += 1

    return parts_list, total_pln, i


# ─── Skróty + Rodzaj/Stopień + Opcje wyposażenia + Indeks ─────────────────────

def _parse_abbreviations(lines: List[Dict[str, Any]], start_idx: int) -> Tuple[List[Dict[str, str]], int]:
    abbrs: List[Dict[str, str]] = []
    i = start_idx
    while i < len(lines) and lines[i]["text"] != "Skrót Opis":
        i += 1
    if i >= len(lines):
        return abbrs, i
    i += 1
    while i < len(lines):
        text = lines[i]["text"]
        if (text.startswith("Rodzaj") or text.startswith("Opcje wyposażenia")
                or text.startswith("Indeks") or text.startswith("Nazwa części")
                or text.startswith("EUROTAX")):
            return abbrs, i
        # "F Pozycje z ręki" — first word is the short, rest is description
        parts = text.split(None, 1)
        if len(parts) == 2:
            abbrs.append({"short": parts[0], "description": parts[1].strip()})
        elif parts:
            abbrs.append({"short": parts[0], "description": ""})
        i += 1
    return abbrs, i


def _parse_paint_method_legend(lines: List[Dict[str, Any]], start_idx: int) -> Tuple[List[Dict[str, str]], int]:
    """Parse 'Rodzaj Stopień, Postępowanie, Metoda' legend (returned but not surfaced
    in primary JSON shape — stored under abbreviations for now)."""
    items: List[Dict[str, str]] = []
    i = start_idx
    while i < len(lines) and not lines[i]["text"].startswith("Rodzaj"):
        i += 1
    if i >= len(lines):
        return items, i
    i += 1
    while i < len(lines):
        text = lines[i]["text"]
        if (text.startswith("Opcje wyposażenia") or text.startswith("Indeks")
                or text.startswith("EUROTAX") or text.startswith("Nazwa części")):
            return items, i
        parts = text.split(None, 1)
        if len(parts) == 2:
            items.append({"short": parts[0], "description": parts[1].strip()})
        elif parts:
            items.append({"short": parts[0], "description": ""})
        i += 1
    return items, i


def _parse_equipment_options(lines: List[Dict[str, Any]], start_idx: int) -> Tuple[List[str], int]:
    """
    Parse the 'Opcje wyposażenia' section if present. The section is OPTIONAL
    (BMW + Clio omit it). Stop scanning at 'Indeks' so we don't run past the
    end of the doc and starve _parse_indices when the section is absent.
    """
    options: List[str] = []
    i = start_idx
    while i < len(lines):
        text = lines[i]["text"].strip()
        if text == "Opcje wyposażenia":
            break
        # Hit Indeks or EUROTAX → no Opcje section in this PDF, leave i pointed
        # at the sentinel so _parse_indices picks up where we left off.
        if text.startswith("Indeks") or text.startswith("EUROTAX"):
            return options, i
        i += 1
    if i >= len(lines):
        return options, i
    i += 1
    while i < len(lines):
        text = lines[i]["text"].strip()
        if (text.startswith("Indeks") or text.startswith("EUROTAX")
                or text.startswith("Nazwa części")):
            return options, i
        if text:
            options.append(text)
        i += 1
    return options, i


def _parse_indices(lines: List[Dict[str, Any]], start_idx: int) -> Tuple[Dict[str, Optional[float]], int]:
    indices: Dict[str, Optional[float]] = {
        "indeks_mat_lak_pct": None,
        "indeks_czesci_zamiennych_pct": None,
    }
    i = start_idx
    while i < len(lines) and lines[i]["text"].strip() != "Indeks":
        i += 1
    if i >= len(lines):
        return indices, i
    i += 1
    while i < len(lines):
        text = lines[i]["text"]
        if text.startswith("EUROTAX") or text.startswith("Nazwa części"):
            return indices, i
        if text.startswith("Indeks na mat.lak."):
            nums = [_to_num(p) for p in text.split() if _is_num(p)]
            if nums:
                indices["indeks_mat_lak_pct"] = nums[-1]
        elif text.startswith("Indeks części zamiennych"):
            nums = [_to_num(p) for p in text.split() if _is_num(p)]
            if nums:
                indices["indeks_czesci_zamiennych_pct"] = nums[-1]
        i += 1
    return indices, i


# ─── Top-level entry point ────────────────────────────────────────────────────

def parse_eurotax_pdf(pdf_path: str | Path) -> Dict[str, Any]:
    """
    Parse a Eurotax kosztorys PDF into the KosztorysData JSON shape.

    Returns dict with keys: vehicle, sections, summary, parts,
    parts_total_pln, equipment_options, indices, abbreviations.
    Missing sections/fields surface as `present: False` / null / [].
    Never raises on malformed input — returns whatever it could extract.
    """
    lines = _extract_lines(pdf_path)

    header, sec_start = _parse_header(lines)
    vehicle = {
        "make_model_type":     header.get("make_model_type", ""),
        "etg_code":            header.get("etg_code", ""),
        "registration_plate":  header.get("registration_plate", ""),
        "vin":                 header.get("vin", ""),
        "date":                header.get("date", ""),
        "paint_system":        header.get("paint_system", ""),
        "currency":            header.get("currency", ""),
        "base_version":        header.get("base_version", ""),
        "klient":              header.get("klient", ""),
        "hail_logic":          header.get("hail_logic", ""),
        "time_units":          header.get("time_units", ""),
    }

    sections = {
        "blacharz":     {"present": False, "rows": [], "totals": {"labor_pln": None, "material_pln": None, "total_pln": None}},
        "pr_dodatkowe": {"present": False, "rows": [], "totals": {"labor_pln": None, "material_pln": None, "total_pln": None}},
        "lakiernik":    {"present": False, "rows": [], "totals": {"labor_pln": None, "material_pln": None, "total_pln": None}},
    }

    i = sec_start
    while i < len(lines):
        text = lines[i]["text"]
        if text.startswith("Blacharz") and "Rodz." in text:
            sec, i = _parse_section(lines, i, "Blacharz", "blach")
            sections["blacharz"] = sec
            continue
        if text.startswith("Pr.dodatkowe") and "Rodz." in text:
            sec, i = _parse_section(lines, i, "Pr.dodatkowe", "blach")
            sections["pr_dodatkowe"] = sec
            continue
        if text.startswith("Lakiernik") and "Rodz." in text:
            sec, i = _parse_section(lines, i, "Lakiernik", "lakier")
            sections["lakiernik"] = sec
            continue
        if text.startswith("Łącznie"):
            break
        i += 1

    summary, i = _parse_summary(lines, i)
    parts, parts_total_pln, i = _parse_parts(lines, i)
    abbreviations, i = _parse_abbreviations(lines, i)
    paint_method, i = _parse_paint_method_legend(lines, i)
    equipment_options, i = _parse_equipment_options(lines, i)
    indices, _i = _parse_indices(lines, i)

    return {
        "vehicle":            vehicle,
        "sections":           sections,
        "summary":            summary,
        "parts":              parts,
        "parts_total_pln":    parts_total_pln,
        "equipment_options":  equipment_options,
        "indices":            indices,
        "abbreviations":      abbreviations,
        "paint_method_legend": paint_method,
    }
