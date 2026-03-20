"""
PDF Generator — Protokół zwrotu pojazdu
========================================
Generates a vehicle return protocol matching the Zaufaj Rzeczoznawcy client template.
Uses DejaVu Sans font for full Polish character support (ł, ś, ż, ą, ę, ó, ń, ć, ź).

4-page layout:
  Page 1: Title, order number, Dane Oględzin, Dane Pojazdu, Wyposażenie (start)
  Page 2: Wyposażenie (continued) — auto page break handled by reportlab
  Page 3: Nadwozie, Wnętrze, Opony, Signatures
  Page 4: Dokumentacja Zdjęciowa (only if photos exist)
"""

import io
import os
import re
import base64
import logging
import requests as http_requests
from datetime import datetime
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, Image
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

logger = logging.getLogger("services.pdf_generator")

# ─── Font Registration ───────────────────────────────────────
FONT_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]

_fonts_registered = False

def _register_fonts():
    global _fonts_registered
    if _fonts_registered:
        return
    try:
        pdfmetrics.registerFont(TTFont('DejaVu', FONT_PATHS[0]))
        pdfmetrics.registerFont(TTFont('DejaVu-Bold', FONT_PATHS[1]))
        _fonts_registered = True
        logger.info("✓ DejaVu Sans fonts registered for Polish character support")
    except Exception as e:
        logger.warning(f"DejaVu fonts not found ({e}). Using Helvetica fallback.")

def _fn():
    """Return (regular, bold) font names."""
    _register_fonts()
    if _fonts_registered:
        return 'DejaVu', 'DejaVu-Bold'
    return 'Helvetica', 'Helvetica-Bold'


# ─── Color Palette ────────────────────────────────────────────
BLACK      = colors.black
WHITE      = colors.white
LIGHT_GREY = colors.HexColor("#F5F5F5")
MID_GREY   = colors.HexColor("#CCCCCC")
HEADER_BG  = colors.HexColor("#1A1A1A")

PAGE_W, PAGE_H = A4
MARGIN = 1.5 * cm
CONTENT_W = PAGE_W - 2 * MARGIN


# ─── Style Helpers ────────────────────────────────────────────
def _style(name, **kw):
    fn, fnb = _fn()
    d = dict(fontName=fn, fontSize=8, leading=10, textColor=BLACK)
    d.update(kw)
    return ParagraphStyle(name, **d)


def p(t, s=None):
    """Wrap text in a Paragraph."""
    fn, fnb = _fn()
    if s is None:
        s = _style("_cn")
    return Paragraph(str(t) if t is not None else "", s)


def pb(t):
    """Bold paragraph."""
    fn, fnb = _fn()
    return p(t, _style("_cb", fontName=fnb))


def pc(t, bold=False):
    """Centered paragraph."""
    fn, fnb = _fn()
    return p(t, _style("_xc", fontName=fnb if bold else fn, alignment=TA_CENTER))


def sp(h=0.25):
    return Spacer(1, h * cm)


# ─── Data Extraction Helpers ─────────────────────────────────
def val(d, *keys, default=""):
    """Extract first non-empty value from dict using multiple key attempts."""
    for k in keys:
        v = d.get(k)
        if v is not None and str(v).strip():
            return str(v).strip()
    return default


def fmt_date(raw):
    """Format a date string to DD-MM-YYYY."""
    if not raw:
        return ""
    for f in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%d-%m-%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(str(raw)[:19], f).strftime("%d-%m-%Y")
        except Exception:
            pass
    return str(raw)[:10]


# ─── Base Table Style ─────────────────────────────────────────
def _grid_ts():
    fn, fnb = _fn()
    return TableStyle([
        ("GRID",          (0, 0), (-1, -1), 0.5, MID_GREY),
        ("LEFTPADDING",   (0, 0), (-1, -1), 4),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("FONTNAME",      (0, 0), (-1, -1), fn),
        ("FONTSIZE",      (0, 0), (-1, -1), 7),
    ])


def section_header(title, w):
    """Black background section header with white text."""
    fn, fnb = _fn()
    t = Table(
        [[p(title, _style("_sh", fontName=fnb, fontSize=10, leading=13, textColor=WHITE))]],
        colWidths=[w],
    )
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), HEADER_BG),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


# ─── Image Loader ─────────────────────────────────────────────
def load_image(src, max_w, max_h):
    """Load image from URL, base64 data URI, bytes, or file path."""
    try:
        if isinstance(src, str) and src.startswith("http"):
            data = http_requests.get(src, timeout=15).content
        elif isinstance(src, str) and src.startswith("data:"):
            data = base64.b64decode(src.split(",", 1)[1])
        elif isinstance(src, (bytes, bytearray)):
            data = src
        else:
            with open(str(src), "rb") as f:
                data = f.read()
        buf = io.BytesIO(data)
        img = Image(buf)
        ratio = min(max_w / img.imageWidth, max_h / img.imageHeight)
        img.drawWidth = img.imageWidth * ratio
        img.drawHeight = img.imageHeight * ratio
        return img
    except Exception as e:
        logger.debug(f"Image load failed: {e}")
        return None


# ═══════════════════════════════════════════════════════════════
# SECTION BUILDERS
# ═══════════════════════════════════════════════════════════════

def build_dane_ogledzen(d, w):
    """DANE OGLĘDZIN — 2×2 grid: company, location, user, date."""
    fn, fnb = _fn()
    h = w / 2
    rows = [
        [pb("Nazwa firmy"),    p(val(d, "company_name", "nazwa_firmy")),
         pb("Miejsce oględzin"), p(val(d, "inspection_location", "location", "inspection_place"))],
        [pb("Użytkownik"),     p(val(d, "inspector_name", "appraiser_name", "client_name")),
         pb("Data oględzin"),   p(fmt_date(val(d, "inspection_date", "data_ogledzen")))],
    ]
    t = Table(rows, colWidths=[h * 0.28, h * 0.22, h * 0.28, h * 0.22])
    ts = _grid_ts()
    ts.add("BACKGROUND", (0, 0), (0, -1), LIGHT_GREY)
    ts.add("BACKGROUND", (2, 0), (2, -1), LIGHT_GREY)
    ts.add("FONTNAME", (0, 0), (0, -1), fnb)
    ts.add("FONTNAME", (2, 0), (2, -1), fnb)
    t.setStyle(ts)
    return t


def build_dane_pojazdu(d, w):
    """DANE POJAZDU — 4-column vehicle data grid matching client template."""
    fn, fnb = _fn()
    h = w / 2
    lw, vw = h * 0.40, h * 0.60

    V = lambda *k: val(d, *k)

    def r(l1, v1, l2, v2):
        return [pb(l1), p(v1), pb(l2), p(v2)]

    make_model = V("make_model")
    if not make_model:
        make_model = f"{V('make', 'vehicle_brand')} {V('model', 'vehicle_model')}".strip()

    rows = [
        r("Numer rejestracyjny",    V("plates", "registration_plates", "registrationNumber"),
          "Marka, model",           make_model or V("TITLE")),
        r("Rok produkcji",         V("year", "rok_produkcji"),
          "VIN",                   V("vin", "VIN")),
        r("Przebieg (km)",         V("mileage", "przebieg"),
          "Data 1 rej.",           fmt_date(V("first_registration", "firstRegistration"))),
        r("Kolor",                 V("color", "kolor"),
          "Rodzaj paliwa/silnika", V("fuel_type", "fuelType", "rodzaj_paliwa")),
        r("Skrzynia biegów",      V("gearbox", "skrzynia_biegow", "transmission"),
          "Rodzaj lakieru",        V("paint_type", "rodzaj_lakieru")),
        r("Ilość miejsc siedz.",   V("seats", "ilosc_miejsc", "seatsCount"),
          "Napęd",                 V("drive", "naped", "driveType")),
        r("Masa własna (kg)",      V("kerb_weight", "masa_wlasna", "ownWeight"),
          "Liczba drzwi",          V("doors", "liczba_drzwi")),
        r("Rodzaj nadwozia",       V("body_type", "rodzaj_nadwozia"),
          "Moc (kW)",             V("power_kw", "moc", "enginePower")),
        r("Towarzystwo Ubezpieczeniowe", V("insurance_company"),
          "Pojemność",             V("engine_capacity", "pojemnosc", "engineCapacity")),
        r("Numer polisy",          V("policy_number"),
          "Ubezpieczenie OC -\nważne do", V("oc_valid_until")),
        r("Data ważności badania\ntechnicznego", V("technical_inspection_date"),
          "Dowód rejestracyjny",   V("registration_doc", "registrationCertificate")),
        r("Klasa",                 V("vehicle_class", "klasa"),
          "Data ostatniego przeglądu\nolejowego", V("last_oil_service")),
        r("Stan poziomu płynu\nukładu chłodniczego", V("coolant_level", "coolantLevel"),
          "Stan zbiornika paliwa", V("fuel_level")),
        r("Stan poziomu płynu\nhamulcowego", V("brake_fluid"),
          "Stan poziomu oleju",    V("oil_level", "engineOilLevel")),
        r("Karoseria",             V("bodywork_condition", "karoseria"),
          "Stan poziomu płynu\nukładu wspomagania", V("power_steering_fluid")),
        r("Stan paliwa",           V("fuel_status", "stan_paliwa"), "", ""),
    ]
    t = Table(rows, colWidths=[lw, vw, lw, vw])
    ts = _grid_ts()
    ts.add("BACKGROUND", (0, 0), (0, -1), LIGHT_GREY)
    ts.add("BACKGROUND", (2, 0), (2, -1), LIGHT_GREY)
    ts.add("FONTNAME", (0, 0), (0, -1), fnb)
    ts.add("FONTNAME", (2, 0), (2, -1), fnb)
    t.setStyle(ts)
    return t


def build_wyposazenie(eq, w):
    """WYPOSAŻENIE — checklist table with TAK/X/NIE/X columns."""
    fn, fnb = _fn()
    col_w = [w * 0.50, w * 0.12, w * 0.076, w * 0.12, w * 0.076]

    ITEMS = [
        ("Dowód rejestracyjny",                    "dowod_rejestracyjny"),
        ("Karta pojazdu",                          "karta_pojazdu"),
        ("Tablice rejestracyjne",                  "tablice_rejestracyjne"),
        ("Kluczyki",                               "kluczyki"),
        ("Kluczyki (ilość)",                       "kluczyki_ilosc"),
        ("Dodatkowy komplet kół",                  "dodatkowy_komplet_kol"),
        ("Gaśnica",                                "gasnica"),
        ("Klimatyzacja sprawna",                   "klimatyzacja_sprawna"),
        ("Klucz do kół",                           "klucz_do_kol"),
        ("Książka serwisowa",                      "ksiazka_serwisowa"),
        ("Nawigacja satelitarna (karta) sprawna",  "nawigacja_satelitarna"),
        ("Podnośnik",                              "podnosnik"),
        ("Przewód ładowania baterii trakcyjnej",   "przewod_ladowania_baterii"),
        ("Stacja ładowania baterii trakcyjnej",    "stacja_ladowania_baterii"),
        ("Trójkąt ostrzegawczy",                   "trojkat_ostrzegawczy"),
        ("Wskaźnik naładowania baterii trakcyjnej", "wskaznik_naladowania_baterii"),
        ("Zestaw naprawczy koła",                  "zestaw_naprawczy_kola"),
    ]

    rows = [[p(""), pc("TAK", True), pc(""), pc("NIE", True), pc("")]]

    for label, key in ITEMS:
        raw = str(eq.get(key, "")).strip().upper()

        if label == "Kluczyki (ilość)":
            # Show count number in the middle column, not X
            rows.append([p(label), p(""), pc(eq.get(key, "")), p(""), p("")])
        elif raw == "ELEKTRONICZNA":
            # Special case: "Książka serwisowa" shows ELEKTRONICZNA
            rows.append([p(label), p(""), pc("ELEKTRO-\nNICZNA"), p(""), p("")])
        elif raw in ("TAK", "YES", "TRUE", "1"):
            rows.append([p(label), pc("TAK"), pc("X"), pc("NIE"), p("")])
        elif raw in ("NIE", "NO", "FALSE", "0"):
            rows.append([p(label), pc("TAK"), p(""), pc("NIE"), pc("X")])
        else:
            rows.append([p(label), pc("TAK"), p(""), pc("NIE"), p("")])

    t = Table(rows, colWidths=col_w)
    ts = _grid_ts()
    ts.add("BACKGROUND", (0, 0), (-1, 0), LIGHT_GREY)
    ts.add("ALIGN", (1, 0), (-1, -1), "CENTER")
    t.setStyle(ts)
    return t


def build_nadwozie(damages, w):
    """NADWOZIE — exterior damage table with 4 damage type columns."""
    fn, fnb = _fn()
    col_w = [w * 0.38, w * 0.155, w * 0.155, w * 0.155, w * 0.155]
    header = [
        p(""), pc("Rysa/Odprysk", True), pc("Wniec./Odksz.", True),
        pc("Pękn./Rozerw.", True), pc("Rozmiar", True),
    ]
    rows = [header]
    notes = []

    for dmg in (damages or []):
        dtype = str(dmg.get("damage_type", dmg.get("type", ""))).lower()
        size  = str(dmg.get("size", ""))
        note  = dmg.get("notes", dmg.get("description", ""))
        loc   = dmg.get("location", dmg.get("panel", dmg.get("element", dmg.get("part", ""))))

        rows.append([
            p(loc),
            pc("X") if any(x in dtype for x in ("rysa", "odprysk", "scratch")) else pc(""),
            pc("X") if any(x in dtype for x in ("wgn", "wgniecenie", "odkszt", "odkształcenie", "dent")) else pc(""),
            pc("X") if any(x in dtype for x in ("pękni", "pęknięcie", "rozerwanie", "crack")) else pc(""),
            pc(size),
        ])
        if note:
            notes.append(note)

    if len(rows) == 1:
        rows.append([p("Brak uszkodzeń"), p(""), p(""), p(""), p("")])

    t = Table(rows, colWidths=col_w)
    ts = _grid_ts()
    ts.add("BACKGROUND", (0, 0), (-1, 0), LIGHT_GREY)
    ts.add("ALIGN", (1, 0), (-1, -1), "CENTER")
    t.setStyle(ts)

    result = [t]
    if notes:
        fn_r, _ = _fn()
        result.append(p("*" + ", ".join(notes),
                        _style("_fn", fontName=fn_r, fontSize=6, leading=8)))
    return result


def build_wnetrze(damages, w):
    """WNĘTRZE — interior damage table. Special row for 'Pranie / czyszczenie'."""
    fn, fnb = _fn()
    col_w = [w * 0.38, w * 0.155, w * 0.155, w * 0.155, w * 0.155]
    header = [
        p(""), pc("Rysa/Odprysk", True), pc("Wniec./Odksz.", True),
        pc("Pękn./Rozerw.", True), p(""),
    ]
    rows = [header]

    for dmg in (damages or []):
        loc   = str(dmg.get("location", dmg.get("element", dmg.get("part", ""))))
        dtype = str(dmg.get("damage_type", dmg.get("type", ""))).lower()
        size  = str(dmg.get("size", ""))

        if "pranie" in loc.lower() or "czyszcz" in loc.lower():
            rows.append([p("Pranie / czyszczenie"), p(""), p(""), p(""), pc("TAK")])
        else:
            rows.append([
                p(loc),
                pc("X") if any(x in dtype for x in ("rysa", "odprysk", "scratch")) else pc(""),
                pc("X") if any(x in dtype for x in ("wgn", "odkszt", "dent")) else pc(""),
                pc("X") if any(x in dtype for x in ("pękni", "rozerwanie", "crack")) else pc(""),
                pc(size),
            ])

    if len(rows) == 1:
        rows.append([p("Brak uszkodzeń"), p(""), p(""), p(""), p("")])

    t = Table(rows, colWidths=col_w)
    ts = _grid_ts()
    ts.add("BACKGROUND", (0, 0), (-1, 0), LIGHT_GREY)
    ts.add("ALIGN", (1, 0), (-1, -1), "CENTER")
    t.setStyle(ts)
    return t


def build_opony(tires, w):
    """OPONY — tire table with 4 positions, size split into sub-columns."""
    fn, fnb = _fn()
    # Columns: Position | Producent | Typ | 4 size subcols | Profil | Rodzaj opon
    col_w = [w * 0.18, w * 0.11, w * 0.09, w * 0.09, w * 0.06, w * 0.06, w * 0.06, w * 0.12, w * 0.13]
    header = [
        p(""), pc("Producent", True), pc("Typ", True),
        pc("Oznaczenie\nopon", True), pc("", True), pc("", True), pc("", True),
        pc("Profil", True), pc("Rodzaj\nopon", True),
    ]

    POSITIONS = [
        ("Opona Prawa Przód", "front_right", "frontRight", "przod_prawy"),
        ("Opona Prawa Tył",   "rear_right",  "rearRight",  "tyl_prawy"),
        ("Opona Lewa Tył",    "rear_left",   "rearLeft",   "tyl_lewy"),
        ("Opona Lewa Przód",  "front_left",  "frontLeft",  "przod_lewy"),
    ]

    rows = [header]
    for label, *keys in POSITIONS:
        td = None
        for k in keys:
            td = tires.get(k)
            if td and isinstance(td, dict):
                break
        if not td or not isinstance(td, dict):
            td = {}

        size_str = val(td, "size", "oznaczenie", "rozmiar", default="")
        # Split "225/55 17 96 V" into parts
        parts = re.split(r'[\s/]+', size_str) if size_str else []

        rows.append([
            p(label),
            pc(val(td, "brand", "producent", "marka")),
            pc(val(td, "type", "typ")),
            pc(parts[0] if len(parts) > 0 else ""),
            pc(parts[1] if len(parts) > 1 else ""),
            pc(parts[2] if len(parts) > 2 else ""),
            pc(parts[3] if len(parts) > 3 else ""),
            pc(val(td, "profile", "profil", "treadDepth")),
            pc(val(td, "tire_type", "rodzaj_opon", "season")),
        ])

    t = Table(rows, colWidths=col_w)
    ts = _grid_ts()
    ts.add("BACKGROUND", (0, 0), (-1, 0), LIGHT_GREY)
    ts.add("ALIGN", (0, 0), (-1, -1), "CENTER")
    t.setStyle(ts)
    return t


def build_signatures(d, w):
    """3 signature boxes side-by-side with labels and signature images."""
    fn, fnb = _fn()
    sw = (w - 1.0 * cm) / 3

    labels = [
        "Potwierdzam zwrot pojazdu\nw stanie opisanym powyżej.\n\nPodpis Rzeczoznawcy/\nEksperta mobilnego\nZaufaj Rzeczoznawcy",
        "Potwierdzam przyjęcie pojazdu\nw stanie opisanym powyżej.\n\nPodpis strony przyjmującej\nna plac",
        "Potwierdzam zwrot pojazdu\nw stanie opisanym powyżej.\n\nPodpis dysponenta pojazdu\nw chwili oględzin",
    ]

    # Try multiple key patterns for signatures
    sig_keys = [
        ("signature_appraiser", "signatureAppraiser", "podpis_rzeczoznawcy"),
        ("signature_client", "signatureClient", "podpis_przyjmujacego"),
        ("signature_owner", "signatureYard", "signatureOwner", "podpis_dysponenta"),
    ]

    cells = []
    for i in range(3):
        sig_data = None
        for k in sig_keys[i]:
            sig_data = d.get(k)
            if sig_data:
                break

        # Check in finalSummary sub-dict too
        if not sig_data:
            summary = d.get("finalSummary", {})
            for k in sig_keys[i]:
                sig_data = summary.get(k)
                if sig_data:
                    break

        sig_img = load_image(sig_data, sw - 0.8 * cm, 2.0 * cm) if sig_data else None

        label_style = _style(f"_sl{i}", fontSize=6, leading=8, alignment=TA_CENTER)
        cell_content = [p(labels[i], label_style), sp(0.15)]
        cell_content.append(sig_img if sig_img else sp(2.0))
        cells.append(cell_content)

    t = Table([cells], colWidths=[sw, sw, sw])
    t.setStyle(TableStyle([
        ("BOX",           (0, 0), (-1, -1), 0.5, MID_GREY),
        ("INNERGRID",     (0, 0), (-1, -1), 0.5, MID_GREY),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


def build_photos(photos, w):
    """DOKUMENTACJA ZDJĘCIOWA — 3-column photo grid."""
    if not photos:
        return []

    cw = (w - 0.6 * cm) / 3
    ch = cw * 0.72
    rows = []
    row = []

    for photo in photos:
        img = load_image(photo, cw - 0.4 * cm, ch - 0.4 * cm)
        row.append(img if img else p(""))
        if len(row) == 3:
            rows.append(row)
            row = []

    if row:
        while len(row) < 3:
            row.append(p(""))
        rows.append(row)

    if not rows:
        return []

    t = Table(rows, colWidths=[cw, cw, cw], rowHeights=[ch] * len(rows))
    t.setStyle(TableStyle([
        ("GRID",          (0, 0), (-1, -1), 0.5, MID_GREY),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 3),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 3),
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return [t]


# ═══════════════════════════════════════════════════════════════
# MAIN GENERATOR — matches old signature for backwards compat
# ═══════════════════════════════════════════════════════════════

def generate_inspection_pdf(deal_info: dict, inspection_data: dict, logo_path: str = None) -> bytes:
    """
    Generate the Protokół zwrotu pojazdu PDF.

    Accepts the SAME arguments as the old generator for backwards compatibility:
      - deal_info: dict with title, order_number, company_name, etc.
      - inspection_data: dict with vehicleData, equipment, damages, etc.

    Also supports flat dict format where all keys are at top level.
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN, bottomMargin=MARGIN,
        title="Protokół zwrotu pojazdu",
    )

    fn, fnb = _fn()
    w = CONTENT_W

    # ── Merge deal_info into inspection_data for unified access ──
    # Support both old camelCase keys AND new snake_case keys
    d = {}
    d.update(inspection_data)
    d.update(deal_info)

    # Extract nested data (old format has camelCase sub-dicts)
    vehicle = inspection_data.get("vehicleData", {})
    basic = vehicle.get("basicInfo", {})
    eq_comp = inspection_data.get("equipmentCompleteness", {})
    full_eq = inspection_data.get("fullEquipment", {})
    mech = inspection_data.get("mechanical", {})
    summary = inspection_data.get("finalSummary", {})

    # Build flat dict with all possible keys for maximum compatibility
    flat = {}
    flat.update(d)

    # Map old camelCase vehicle fields to snake_case
    if vehicle:
        flat.setdefault("vin", vehicle.get("vin", ""))
        flat.setdefault("make", vehicle.get("make", ""))
        flat.setdefault("model", vehicle.get("model", ""))
        flat.setdefault("year", vehicle.get("year", ""))
        flat.setdefault("mileage", vehicle.get("mileage", ""))
        flat.setdefault("color", vehicle.get("color", ""))
        flat.setdefault("fuel_type", vehicle.get("fuelType", ""))
        flat.setdefault("seats", vehicle.get("seatsCount", ""))
        flat.setdefault("drive", vehicle.get("driveType", ""))
        flat.setdefault("kerb_weight", vehicle.get("ownWeight", ""))
        flat.setdefault("engine_capacity", vehicle.get("engineCapacity", ""))
        flat.setdefault("power_kw", vehicle.get("enginePower", ""))
        flat.setdefault("first_registration", vehicle.get("firstRegistration", ""))
        flat.setdefault("registration_doc", vehicle.get("registrationCertificate", ""))
        flat.setdefault("plates", vehicle.get("registrationNumber", ""))
        flat.setdefault("gearbox", vehicle.get("gearboxType", ""))
    if basic:
        flat.setdefault("company_name", basic.get("companyName", ""))
        flat.setdefault("inspection_location", basic.get("inspectionPlace", ""))
        flat.setdefault("inspector_name", basic.get("userOwner", ""))
        flat.setdefault("inspection_date", basic.get("inspectionDate", ""))
        flat.setdefault("client_name", basic.get("clientName", ""))
    if mech:
        flat.setdefault("coolant_level", mech.get("coolantLevel", ""))
        flat.setdefault("oil_level", mech.get("engineOilLevel", ""))
        flat.setdefault("brake_fluid", mech.get("brakeFluidLevel", ""))
    if summary:
        flat.setdefault("signature_appraiser", summary.get("signatureAppraiser", ""))
        flat.setdefault("signature_client", summary.get("signatureClient", ""))
        flat.setdefault("signature_owner", summary.get("signatureYard", ""))

    # Order number
    order_number = val(flat, "order_number", "nr_zlecenia", "deal_number", "title", default="ZR/2025/XXXXX")

    # Equipment — try new flat keys first, then old nested format
    equipment = inspection_data.get("equipment", {}) or {}
    if not equipment and eq_comp:
        # Map old equipmentCompleteness to new format
        equipment = {
            "dowod_rejestracyjny": "TAK",
            "karta_pojazdu": "",
            "tablice_rejestracyjne": "TAK",
            "kluczyki": "TAK" if eq_comp.get("keysCount") else "",
            "kluczyki_ilosc": str(eq_comp.get("keysCount", "")),
            "gasnica": "TAK" if eq_comp.get("fireExtinguisher") else "NIE",
            "trojkat_ostrzegawczy": "TAK" if eq_comp.get("triangular") else "NIE",
            "klucz_do_kol": "TAK" if eq_comp.get("jackAndTools") else "NIE",
            "podnosnik": "TAK" if eq_comp.get("jackAndTools") else "NIE",
            "zestaw_naprawczy_kola": "TAK" if eq_comp.get("repairKit") else "NIE",
            "ksiazka_serwisowa": "TAK" if eq_comp.get("serviceBookPresented") else "NIE",
            "nawigacja_satelitarna": "TAK" if full_eq.get("navigation") else "NIE",
            "klimatyzacja_sprawna": "TAK" if full_eq.get("airConditioning") else "NIE",
            "dodatkowy_komplet_kol": "NIE",
        }

    # Damages
    ext_damages = inspection_data.get("exterior_damages", []) or inspection_data.get("exteriorDamage", []) or []
    int_damages = inspection_data.get("interior_damages", []) or inspection_data.get("interiorDamage", []) or []

    # Tires
    tires = inspection_data.get("tires", {}) or {}

    # Photos
    photos = inspection_data.get("photos", []) or []

    # Location and date for bottom of page 3
    insp_date = fmt_date(val(flat, "inspection_date", "data_ogledzen"))
    insp_location = val(flat, "inspection_location", "location", "inspection_place")

    # Title styles
    title_style = _style("_title", fontName=fnb, fontSize=16, leading=20, alignment=TA_CENTER)
    order_style = _style("_order", fontName=fnb, fontSize=11, leading=14, alignment=TA_CENTER)
    photo_style = _style("_photo", fontName=fnb, fontSize=12, leading=15, alignment=TA_CENTER)
    small_style = _style("_small", fontSize=7, leading=9)
    gdpr_style  = _style("_gdpr",  fontSize=6, leading=8)

    # ═══ PAGE 1 ═══════════════════════════════════════════════
    story = []
    story.append(Paragraph("Protokół zwrotu pojazdu", title_style))
    story.append(sp(0.5))
    story.append(Paragraph(f"NR ZLECENIA : {order_number}", order_style))
    story.append(sp(0.5))

    story.append(section_header("DANE OGLĘDZIN", w))
    story.append(sp(0.1))
    story.append(build_dane_ogledzen(flat, w))
    story.append(sp(0.4))

    story.append(section_header("DANE POJAZDU", w))
    story.append(sp(0.1))
    story.append(build_dane_pojazdu(flat, w))
    story.append(sp(0.4))

    story.append(section_header("WYPOSAŻENIE", w))
    story.append(sp(0.1))
    story.append(build_wyposazenie(equipment, w))

    # ═══ PAGE 3 (auto page break from Page 1/2) ══════════════
    story.append(PageBreak())
    story.append(Paragraph("Protokół zwrotu pojazdu", title_style))
    story.append(sp(0.4))

    story.append(section_header("NADWOZIE", w))
    story.append(sp(0.1))
    story.extend(build_nadwozie(ext_damages, w))
    story.append(sp(0.3))

    # Footnote
    story.append(p("*Korozja, zabrudzenie, przepalenie", gdpr_style))
    story.append(sp(0.2))

    story.append(section_header("WNĘTRZE", w))
    story.append(sp(0.1))
    story.append(build_wnetrze(int_damages, w))
    story.append(sp(0.3))

    story.append(section_header("OPONY", w))
    story.append(sp(0.1))
    story.append(build_opony(tires, w))
    story.append(sp(0.5))

    # Location + Date row
    loc_row = Table(
        [[pb("Miejsce oględzin"), p(insp_location), pb("Data oględzin"), p(insp_date)]],
        colWidths=[w * 0.22, w * 0.38, w * 0.22, w * 0.18],
    )
    loc_row.setStyle(TableStyle([
        ("LEFTPADDING",  (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("VALIGN",       (0, 0), (-1, -1), "BOTTOM"),
    ]))
    story.append(loc_row)
    story.append(sp(0.3))

    # GDPR line
    story.append(p(
        "Zapoznałem/am się z klauzulą informacyjną dotyczącą przetwarzania moich danych osobowych.",
        gdpr_style,
    ))
    story.append(sp(0.3))

    # Signatures
    story.append(build_signatures(flat, w))

    # ═══ PAGE 4 — PHOTOS (only if exist) ══════════════════════
    if photos:
        story.append(PageBreak())
        story.append(Paragraph("DOKUMENTACJA ZDJĘCIOWA", photo_style))
        story.append(sp(0.5))
        story.extend(build_photos(photos, w))

    # Build
    doc.build(story)
    buf.seek(0)
    return buf.read()
