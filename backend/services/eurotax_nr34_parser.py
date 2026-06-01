"""
Eurotax "nr34" (netto / urealnienie) PDF parser
================================================
Parses the newer single-page-ish Eurotax format identified by the
header line "KOSZTORYS EUROTAX nr <N>" + the "POZYCJE KOSZTORYSU"
block. Output mirrors the KosztorysData shape produced by
services.eurotax_parser.parse_eurotax_pdf (do NOT modify the original
parser — this one is dispatched by services.eurotax_format only when
its markers are present).

Key differences vs the original format:
  * Netto-based — there is no VAT line. `subtotal_no_vat ==
    total_with_vat_pln == grand total`; vat_pct / vat_amount stay None.
  * One row per text line (no col mis-extraction).
  * Sections are: operations (mapped to `blacharz`), Lakierowanie
    (mapped to `lakiernik`). `pr_dodatkowe` is left present=False.
  * Per-row labor split does NOT exist (only Czas + Cena/Materiał).
    Per-row labor_pln stays None; labor is filled at the section
    totals + summary level.
  * `Urealnienie - materiał lakierniczy <pct>% <amount>` becomes its
    own per_section entry so the renderer shows the adjustment without
    breaking the existing layout.
"""
from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pdfplumber

logger = logging.getLogger("services.eurotax_nr34_parser")


# ─── Number / line helpers ────────────────────────────────────────────────────

# A Polish-locale number: optional minus, optional space/NBSP thousands,
# comma OR dot decimal. Examples: "1,70", "1 216,05", "-608,02", "315,00".
_NUM_RE = r"-?\d+(?:[\s ]\d{3})*[,.]\d+"


def _to_num(s: Optional[str]) -> Optional[float]:
    if s is None:
        return None
    cleaned = s.strip().replace(" ", "").replace(" ", "").replace(",", ".")
    if not cleaned or cleaned in ("-", "."):
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _extract_lines(pdf_path: str | Path) -> List[str]:
    """Concatenate text from every page, return non-empty stripped lines."""
    out: List[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            for raw in text.split("\n"):
                stripped = raw.strip()
                if stripped:
                    out.append(stripped)
    return out


def _find_idx(lines: List[str], predicate, start: int = 0) -> int:
    for i in range(start, len(lines)):
        if predicate(lines[i]):
            return i
    return -1


# ─── Vehicle / header ─────────────────────────────────────────────────────────

# Labels appearing in the "DANE POJAZDU" block. Order matters when peeling
# the second label off a 2-column merged line.
_VEHICLE_LABELS = [
    "Marka",
    "Model",
    "Typ",
    "Kod EC",
    "Nr rejestracyjny",
    "Nr nadwozia",
    "Data 1. rejestracji",
    "Rok produkcji",
    "Przebieg",
    "Lakier",
    "Klient",
]

# Match "<Label> <value>" at the start of a line, value runs to end of line.
_VEHICLE_LINE_RE = re.compile(
    r"^(" + "|".join(re.escape(lbl) for lbl in _VEHICLE_LABELS) + r")\s+(.+?)\s*$"
)

# If a value contains another known label as a whole token, treat that
# as a column-merge artifact and split before it.
_SECOND_LABEL_RE = re.compile(
    r"\s+(?=(?:" + "|".join(re.escape(lbl) for lbl in _VEHICLE_LABELS) + r")\b)"
)


def _parse_vehicle(lines: List[str]) -> Dict[str, str]:
    values: Dict[str, str] = {}
    for line in lines:
        m = _VEHICLE_LINE_RE.match(line)
        if not m:
            continue
        label, val = m.group(1), m.group(2)
        # Peel a merged second column off, if present.
        parts = _SECOND_LABEL_RE.split(val, maxsplit=1)
        val = parts[0].strip()
        if not values.get(label):
            values[label] = val
        # If a second label was present in the same line, capture that
        # too — it would otherwise be lost.
        if len(parts) == 2:
            tail = parts[1].strip()
            mm = _VEHICLE_LINE_RE.match(tail)
            if mm and not values.get(mm.group(1)):
                values[mm.group(1)] = mm.group(2).strip()

    pieces = [values.get(k, "") for k in ("Marka", "Model", "Typ")]
    make_model_type = " / ".join(p for p in pieces if p)

    return {
        "make_model_type":    make_model_type,
        "etg_code":           values.get("Kod EC", ""),
        "registration_plate": values.get("Nr rejestracyjny", ""),
        "vin":                values.get("Nr nadwozia", ""),
        "date":               values.get("Data 1. rejestracji", ""),
        "paint_system":       values.get("Lakier", ""),
        "klient":             values.get("Klient", ""),
    }


# ─── Operations section (→ blacharz) ──────────────────────────────────────────

# "<description> [<location L|R|LR|k L|k R>] <WZ|KD> <hours> <price>"
_OP_ROW_RE = re.compile(
    rf"^(.+?)\s+(WZ|KD)\s+(\d+[,.]\d+)\s+({_NUM_RE})\s*$"
)
_LOCATION_TOKENS = {"L", "R", "LR", "P", "T"}  # P=przód, T=tył in some prints


def _extract_location(desc: str) -> Tuple[str, str]:
    """Strip trailing single-letter location token off a description.
    Returns (clean_desc, location). If no location, returns (desc, '')."""
    parts = desc.rsplit(" ", 2)
    if len(parts) >= 2 and parts[-1] in _LOCATION_TOKENS:
        return " ".join(parts[:-1]).strip(), parts[-1]
    # "k L" style (paint prefix + location) — uncommon for ops rows.
    if len(parts) >= 3 and parts[-2] == "k" and parts[-1] in _LOCATION_TOKENS:
        return " ".join(parts[:-2]).strip(), parts[-2] + " " + parts[-1]
    return desc.strip(), ""


def _parse_operations_section(
    lines: List[str],
) -> Tuple[List[Dict[str, Any]], Dict[str, Optional[float]]]:
    """Lines between 'POZYCJE KOSZTORYSU'/'Opis czynności' and the section's
    closing 'Łącznie X,XX X,XX'. Non-matching lines after a parsed row are
    attached as notes to that row."""
    rows: List[Dict[str, Any]] = []
    totals = {"labor_pln": None, "material_pln": None, "total_pln": None}

    # Locate the start of the operations table.
    start = _find_idx(
        lines,
        lambda l: l.startswith("Opis czynności") and "Czas" in l,
    )
    if start < 0:
        start = _find_idx(lines, lambda l: l.startswith("POZYCJE KOSZTORYSU"))
    if start < 0:
        return rows, totals

    # Walk until we hit the section's "Łącznie".
    section_material_sum = 0.0
    for i in range(start + 1, len(lines)):
        line = lines[i]
        if line.startswith("Łącznie"):
            # Capture this section's running totals: "Łącznie <hours> <price>"
            mtot = re.match(
                rf"^Łącznie\s+(\d+[,.]\d+)\s+({_NUM_RE})\s*$",
                line,
            )
            if mtot:
                totals["material_pln"] = section_material_sum or _to_num(mtot.group(2))
            break
        if line.startswith("Lakierowanie"):
            break  # safety — operations section can't extend past this
        m = _OP_ROW_RE.match(line)
        if m:
            desc_raw, op_type, hours_s, price_s = m.groups()
            desc, location = _extract_location(desc_raw)
            material = _to_num(price_s)
            if material is not None:
                section_material_sum += material
            row: Dict[str, Any] = {
                "code":           None,
                "description":    desc,
                "operation_type": op_type,
                "hours":          _to_num(hours_s),
                "deduction":      None,
                "labor_pln":      None,
                "material_pln":   material,
                "sub_items":      [],
                "notes":          [f"Miejsce: {location}"] if location else [],
            }
            rows.append(row)
        else:
            # Non-row, non-terminator — attach to last row as a note.
            if rows and not line.startswith(("Opis czynności", "Miejsce", "Rodzaj")):
                rows[-1]["notes"].append(line)
    return rows, totals


# ─── Lakierowanie section (→ lakiernik) ───────────────────────────────────────

# "<description> [<location>] <rodz_napraw=3 digits> <stopien> <hours> <material>"
# Examples: "Zderzak przedni, część boczna k L 200 K2 0,50 122,70"
_LAKIER_ROW_RE = re.compile(
    rf"^(.+?)\s+(\d{{3}})\s+([A-Za-z][A-Za-z0-9]{{0,3}})\s+(\d+[,.]\d+)\s+({_NUM_RE})\s*$"
)


def _parse_lakier_section(
    lines: List[str],
) -> Tuple[List[Dict[str, Any]], Dict[str, Optional[float]]]:
    rows: List[Dict[str, Any]] = []
    totals = {"labor_pln": None, "material_pln": None, "total_pln": None}

    start = _find_idx(
        lines,
        lambda l: l.startswith("Lakierowanie") and "Stopień" in l,
    )
    if start < 0:
        start = _find_idx(lines, lambda l: l.startswith("Lakierowanie"))
    if start < 0:
        return rows, totals

    material_sum = 0.0
    for i in range(start + 1, len(lines)):
        line = lines[i]
        if line.startswith("Łącznie"):
            mtot = re.match(
                rf"^Łącznie\s+(\d+[,.]\d+)\s+({_NUM_RE})\s*$",
                line,
            )
            if mtot:
                totals["material_pln"] = _to_num(mtot.group(2)) or material_sum
            break
        if line.startswith("Podsumowanie") or line.startswith("Koszty naprawy"):
            break
        m = _LAKIER_ROW_RE.match(line)
        if m:
            desc_raw, rodz, stopien, hours_s, material_s = m.groups()
            desc, _location = _extract_location(desc_raw)
            material = _to_num(material_s)
            if material is not None:
                material_sum += material
            rows.append({
                "description":  desc,
                "rodz_napraw":  rodz,
                "stopien":      stopien,
                "hours":        _to_num(hours_s),
                "labor_pln":    None,
                "material_pln": material,
            })
    return rows, totals


# ─── Podsumowanie + grand total ───────────────────────────────────────────────

# "Blacharz <hours> <rate> <labor>" and "Lakiernik <hours> <rate> <labor>"
_PODSUM_LABOR_RE = re.compile(
    rf"^(Blacharz|Lakiernik)\s+(\d+[,.]\d+)\s+({_NUM_RE})\s+({_NUM_RE})\s*$"
)
# "Materiał lakierniczy 100% 1 216,05"
_PODSUM_MAT_RE = re.compile(
    rf"^Materiał lakierniczy\s+(\d+)\s*%\s+({_NUM_RE})\s*$"
)
# "Urealnienie - materiał lakierniczy 50% -608,02"
_UREAL_RE = re.compile(
    rf"^Urealnienie\s*-\s*materiał lakierniczy\s+(\d+)\s*%\s+(-?{_NUM_RE})\s*$"
)
# "Koszty naprawy łącznie (netto) 1 643,03"
_GRAND_TOTAL_RE = re.compile(
    rf"^Koszty naprawy łącznie\s*\(\s*netto\s*\)\s+({_NUM_RE})\s*$"
)


def _parse_summary(
    lines: List[str],
    blach_totals: Dict[str, Optional[float]],
    lakier_totals: Dict[str, Optional[float]],
) -> Tuple[Dict[str, Any], Dict[str, Optional[float]], Dict[str, Optional[float]]]:
    """Walk the Podsumowanie + grand-total lines. Returns
    (summary_dict, blach_totals_filled, lakier_totals_filled)."""
    per_section: List[Dict[str, Any]] = []
    blach_labor:  Optional[float] = None
    blach_rate:   Optional[float] = None
    blach_hours:  Optional[float] = None
    lakier_labor: Optional[float] = None
    lakier_rate:  Optional[float] = None
    lakier_hours: Optional[float] = None
    lakier_material_summary: Optional[float] = None
    urealnienie_pct: Optional[float] = None
    urealnienie_amount: Optional[float] = None
    grand_netto: Optional[float] = None

    for line in lines:
        m = _PODSUM_LABOR_RE.match(line)
        if m:
            section, hours_s, rate_s, labor_s = m.groups()
            hours = _to_num(hours_s)
            rate  = _to_num(rate_s)
            labor = _to_num(labor_s)
            if section == "Blacharz":
                blach_hours, blach_rate, blach_labor = hours, rate, labor
                per_section.append({
                    "section":  "Blacharz",
                    "rate":     rate,
                    "hours":    hours,
                    "labor":    labor,
                    "material": blach_totals.get("material_pln") or 0.0,
                })
            elif section == "Lakiernik":
                lakier_hours, lakier_rate, lakier_labor = hours, rate, labor
            continue

        m = _PODSUM_MAT_RE.match(line)
        if m:
            lakier_material_summary = _to_num(m.group(2))
            continue

        m = _UREAL_RE.match(line)
        if m:
            urealnienie_pct = _to_num(m.group(1))
            urealnienie_amount = _to_num(m.group(2))
            continue

        m = _GRAND_TOTAL_RE.match(line)
        if m:
            grand_netto = _to_num(m.group(1))
            continue

    # Always emit the lakier per_section row if we saw its labor line.
    if lakier_labor is not None or lakier_hours is not None:
        per_section.append({
            "section":  "Lakiernik",
            "rate":     lakier_rate,
            "hours":    lakier_hours,
            "labor":    lakier_labor,
            "material": lakier_material_summary if lakier_material_summary is not None else lakier_totals.get("material_pln"),
        })

    # Urealnienie surfaces as its own row so the renderer shows the
    # adjustment without us extending KosztorysData.
    if urealnienie_amount is not None:
        label = "Urealnienie — materiał lakierniczy"
        if urealnienie_pct is not None:
            # urealnienie_pct comes as e.g. 50 (already in %)
            label += f" {int(urealnienie_pct)}%"
        per_section.append({
            "section":  label,
            "rate":     None,
            "hours":    None,
            "labor":    None,
            "material": urealnienie_amount,
        })

    # Fill section totals with their labor + total_pln derived from
    # podsumowanie now that we have it.
    if blach_labor is not None:
        blach_totals["labor_pln"] = blach_labor
        mat = blach_totals.get("material_pln") or 0.0
        blach_totals["total_pln"] = blach_labor + mat
    if lakier_labor is not None:
        lakier_totals["labor_pln"] = lakier_labor
        if lakier_material_summary is not None:
            lakier_totals["material_pln"] = lakier_material_summary
        mat = lakier_totals.get("material_pln") or 0.0
        # Total includes urealnienie adjustment so the per-section total
        # matches what the inspector pays.
        total = lakier_labor + mat + (urealnienie_amount or 0.0)
        lakier_totals["total_pln"] = total

    total_labor_hours = (blach_hours or 0.0) + (lakier_hours or 0.0)
    total_labor       = (blach_labor or 0.0) + (lakier_labor or 0.0)
    total_material    = (blach_totals.get("material_pln") or 0.0) \
                      + (lakier_material_summary if lakier_material_summary is not None
                         else (lakier_totals.get("material_pln") or 0.0)) \
                      + (urealnienie_amount or 0.0)

    summary = {
        "per_section":         per_section,
        "small_materials_pct": None,
        "small_materials_pln": None,
        "total_labor":         total_labor or None,
        "total_labor_hours":   total_labor_hours or None,
        "total_material":      total_material or None,
        # Netto format — there's no VAT line in the PDF. Surface the netto
        # grand total as both subtotal AND total_with_vat_pln so the
        # renderer's existing copy reads correctly.
        "subtotal_no_vat":     grand_netto,
        "vat_pct":             None,
        "vat_amount":          None,
        "total_with_vat_pln":  grand_netto,
        "total_eur":           None,
    }
    return summary, blach_totals, lakier_totals


# ─── Top-level ────────────────────────────────────────────────────────────────

def _empty_section() -> Dict[str, Any]:
    return {
        "present": False,
        "rows":    [],
        "totals":  {"labor_pln": None, "material_pln": None, "total_pln": None},
    }


def parse_eurotax_nr34(pdf_path: str | Path) -> Dict[str, Any]:
    """Parse a netto-format Eurotax PDF into the KosztorysData shape.
    Never raises on malformed input — returns whatever could be extracted.
    """
    try:
        lines = _extract_lines(pdf_path)
    except Exception as e:
        logger.error(f"[nr34] PDF read failed: {e}", exc_info=True)
        lines = []

    veh = _parse_vehicle(lines)
    blach_rows, blach_totals = _parse_operations_section(lines)
    lakier_rows, lakier_totals = _parse_lakier_section(lines)
    summary, blach_totals, lakier_totals = _parse_summary(
        lines, blach_totals, lakier_totals
    )

    return {
        "vehicle": {
            "make_model_type":    veh.get("make_model_type", ""),
            "etg_code":           veh.get("etg_code", ""),
            "registration_plate": veh.get("registration_plate", ""),
            "vin":                veh.get("vin", ""),
            "date":               veh.get("date", ""),
            "paint_system":       veh.get("paint_system", ""),
            "currency":           "PLN",
            "base_version":       "",
            "klient":             veh.get("klient", ""),
            "hail_logic":         "",
            "time_units":         "",
        },
        "sections": {
            "blacharz":     {"present": len(blach_rows) > 0,  "rows": blach_rows,  "totals": blach_totals},
            "pr_dodatkowe": _empty_section(),
            "lakiernik":    {"present": len(lakier_rows) > 0, "rows": lakier_rows, "totals": lakier_totals},
        },
        "summary":             summary,
        "parts":               [],
        "parts_total_pln":     None,
        "equipment_options":   [],
        "indices":             {"indeks_mat_lak_pct": None, "indeks_czesci_zamiennych_pct": None},
        "abbreviations":       [],
        "paint_method_legend": [],
    }
