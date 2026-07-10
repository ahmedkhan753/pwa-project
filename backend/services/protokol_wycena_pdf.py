"""
PDF Generator — Protokół Wycena
================================
Generates a text-only vehicle appraisal (valuation) PDF from the
structured report payload built by ``routers.report.get_report``.

Layout: A4 portrait, Polish, 9 sections + ZR branded header/footer.
Colors match the Condition Report page (navy #1A1A2E, red #B71C1C).

Usage
-----
    from services.protokol_wycena_pdf import build_protokol_wycena_pdf
    pdf_bytes = build_protokol_wycena_pdf(report_payload)
"""

from __future__ import annotations

import io
import logging
from typing import Any, Dict, List, Optional, Tuple

import httpx
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate,
    Paragraph, Spacer, Table, TableStyle, Image, KeepTogether,
)

from services.pdf_generator import _fn, fmt_date

logger = logging.getLogger("services.protokol_wycena_pdf")


# ─── Theme ────────────────────────────────────────────────────
NAVY        = colors.HexColor("#1A1A2E")
NAVY_LIGHT  = colors.HexColor("#262640")
RED         = colors.HexColor("#B71C1C")
RED_DARK    = colors.HexColor("#8B0000")
GRAY_LIGHT  = colors.HexColor("#F5F5F7")
GRAY_BORDER = colors.HexColor("#E8E8ED")
GRAY_MUTED  = colors.HexColor("#86868B")
TEXT_BLACK  = colors.HexColor("#1A1A2E")
GREEN_OK    = colors.HexColor("#0B8043")
YELLOW_WARN = colors.HexColor("#C78500")

PAGE_W, PAGE_H = A4
MARGIN_LR = 15 * mm
MARGIN_T  = 32 * mm   # room for the branded header
MARGIN_B  = 16 * mm   # room for the footer
CONTENT_W = PAGE_W - 2 * MARGIN_LR

LOGO_URL = (
    "https://i.postimg.cc/VsgMRGYH/SPROWADZENIE-SAMOCHODOW-Z-USAPOD-DOM-"
    "(500-x-500-px)-(800-x-500-px)-(700-x-300-px)-2.png"
)
_LOGO_CACHE: Optional[bytes] = None


def _get_logo_bytes() -> bytes:
    global _LOGO_CACHE
    if _LOGO_CACHE is not None:
        return _LOGO_CACHE
    try:
        resp = httpx.get(LOGO_URL, timeout=8.0, follow_redirects=True)
        if resp.status_code == 200 and "image" in resp.headers.get("content-type", ""):
            _LOGO_CACHE = resp.content
            return _LOGO_CACHE
        logger.warning(f"[Wycena] Logo fetch returned {resp.status_code} / {resp.headers.get('content-type')}")
    except Exception as e:
        logger.warning(f"[Wycena] Logo fetch failed: {e}")
    _LOGO_CACHE = b""
    return _LOGO_CACHE


def _logo_image_reader(data: bytes):
    """Wrap raw PNG bytes for canvas.drawImage."""
    from reportlab.lib.utils import ImageReader
    return ImageReader(io.BytesIO(data))


# ─── Style helpers ────────────────────────────────────────────

def _style(name: str, **kw) -> ParagraphStyle:
    fn, fnb = _fn()
    d = dict(fontName=fn, fontSize=9, leading=11, textColor=TEXT_BLACK)
    d.update(kw)
    return ParagraphStyle(name, **d)


def p(t: Any, s: Optional[ParagraphStyle] = None) -> Paragraph:
    if s is None:
        s = _style("_p")
    return Paragraph(str(t) if t is not None else "", s)


def pb(t: Any, color=None, size: int = 9) -> Paragraph:
    fn, fnb = _fn()
    kw: Dict[str, Any] = dict(fontName=fnb, fontSize=size, leading=size + 2)
    if color is not None:
        kw["textColor"] = color
    return Paragraph(str(t) if t is not None else "", _style("_pb", **kw))


def pc(t: Any, bold: bool = False, color=None, size: int = 9) -> Paragraph:
    fn, fnb = _fn()
    kw: Dict[str, Any] = dict(alignment=TA_CENTER, fontName=fnb if bold else fn,
                              fontSize=size, leading=size + 2)
    if color is not None:
        kw["textColor"] = color
    return Paragraph(str(t) if t is not None else "", _style("_pc", **kw))


def sp(h: float = 0.25) -> Spacer:
    return Spacer(1, h * cm)


def _str(v: Any) -> str:
    if v is None:
        return ""
    s = str(v).strip()
    return "" if s in ("None", "null", "false", "False") else s


def _or_dash(v: Any) -> str:
    s = _str(v)
    return s if s else "Brak danych"


def _section_header(title: str, w: float = CONTENT_W) -> Table:
    """Navy bar with a red left accent stripe and white title."""
    fn, fnb = _fn()
    t = Table(
        [[p(title, _style("_sh", fontName=fnb, fontSize=11, leading=13,
                          textColor=colors.white))]],
        colWidths=[w],
    )
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), NAVY),
        ("LINEBEFORE",    (0, 0), (0, -1), 3, RED),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


def _data_ts(header_rows: int = 1, rows: int = 0) -> TableStyle:
    """Base table style: navy header + thin gray grid + zebra stripes."""
    fn, fnb = _fn()
    ts = TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.25, GRAY_BORDER),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("FONTNAME",      (0, 0), (-1, -1), fn),
        ("FONTSIZE",      (0, 0), (-1, -1), 9),
    ])
    if header_rows > 0:
        ts.add("BACKGROUND", (0, 0), (-1, header_rows - 1), NAVY)
        ts.add("TEXTCOLOR",  (0, 0), (-1, header_rows - 1), colors.white)
        ts.add("FONTNAME",   (0, 0), (-1, header_rows - 1), fnb)
        ts.add("FONTSIZE",   (0, 0), (-1, header_rows - 1), 9.5)
    # Alternating rows
    for i in range(rows):
        if i % 2 == 1:
            r = header_rows + i
            ts.add("BACKGROUND", (0, r), (-1, r), GRAY_LIGHT)
    return ts


# ─── Header & footer ─────────────────────────────────────────

def _draw_page_frame(canv, doc, *, title: str, order_no: str, date: str):
    """Draw header + footer on every page."""
    fn, fnb = _fn()
    canv.saveState()

    # Header
    header_h = 22 * mm
    header_y = PAGE_H - header_h

    canv.setFillColor(NAVY)
    canv.rect(0, header_y, PAGE_W, header_h, fill=1, stroke=0)
    canv.setFillColor(RED)
    canv.rect(0, header_y, PAGE_W, 2, fill=1, stroke=0)

    # Logo (left)
    logo_data = _get_logo_bytes()
    logo_w = 0
    if logo_data:
        try:
            reader = _logo_image_reader(logo_data)
            iw, ih = reader.getSize()
            ratio = min((30 * mm) / iw, (18 * mm) / ih)
            dw = iw * ratio
            dh = ih * ratio
            canv.drawImage(
                reader,
                MARGIN_LR, header_y + (header_h - dh) / 2,
                width=dw, height=dh, mask="auto",
            )
            logo_w = dw
        except Exception as e:
            logger.warning(f"[Wycena] Logo draw failed: {e}")

    # Company + website (next to logo)
    canv.setFillColor(colors.white)
    canv.setFont(fnb, 10)
    canv.drawString(MARGIN_LR + logo_w + 6 * mm, header_y + header_h - 9 * mm,
                    "ZAUFAJ RZECZOZNAWCY Sp. z o.o.")
    canv.setFont(fn, 8)
    canv.setFillColor(colors.HexColor("#CFCFE0"))
    canv.drawString(MARGIN_LR + logo_w + 6 * mm, header_y + header_h - 14 * mm,
                    "www.zaufajrzeczoznawcy.pl")

    # Title (right) + order + date
    canv.setFillColor(colors.white)
    canv.setFont(fnb, 14)
    canv.drawRightString(PAGE_W - MARGIN_LR, header_y + header_h - 9 * mm, title)
    canv.setFont(fn, 8)
    canv.setFillColor(colors.HexColor("#CFCFE0"))
    meta = []
    if order_no:
        meta.append(f"Zlecenie nr {order_no}")
    if date:
        meta.append(f"Data: {date}")
    if meta:
        canv.drawRightString(PAGE_W - MARGIN_LR, header_y + header_h - 14 * mm,
                             "   •   ".join(meta))

    # Footer
    footer_y = 10 * mm
    canv.setStrokeColor(GRAY_BORDER)
    canv.setLineWidth(0.25)
    canv.line(MARGIN_LR, footer_y + 4 * mm, PAGE_W - MARGIN_LR, footer_y + 4 * mm)

    canv.setFont(fn, 7)
    canv.setFillColor(GRAY_MUTED)
    canv.drawString(
        MARGIN_LR, footer_y,
        "Zaufaj Rzeczoznawcy Sp. z o.o. | ul. Smolna 27a/11, 44-200 Rybnik | www.zaufajrzeczoznawcy.pl",
    )
    canv.drawRightString(
        PAGE_W - MARGIN_LR, footer_y,
        f"Strona {doc.page}",
    )

    canv.restoreState()


# ─── Data formatters ─────────────────────────────────────────

def _paint_status_label(val_um: Optional[float]) -> tuple[str, Any]:
    if val_um is None or val_um <= 0:
        return ("Brak pomiaru", GRAY_MUTED)
    if val_um <= 150:
        return ("Norma", GREEN_OK)
    if val_um <= 300:
        return ("Przelakierowany", YELLOW_WARN)
    return ("Lakierowanie naprawcze", RED)


def _tire_status_label(tread: Optional[float]) -> tuple[str, Any]:
    if tread is None:
        return ("-", GRAY_MUTED)
    if tread >= 4.0:
        return ("Dobry", GREEN_OK)
    if tread >= 1.6:
        return ("Zużyty", YELLOW_WARN)
    return ("Do wymiany", RED)


def _yes_no(v: Any) -> tuple[str, Any]:
    if v is None:
        return ("-", GRAY_MUTED)
    s = str(v).strip().upper()
    if s in ("TAK", "TRUE", "1", "YES"):
        return ("Tak", GREEN_OK)
    if s in ("NIE", "FALSE", "0", "NO"):
        return ("Nie", RED)
    if s in ("ND", "N/D", "NIE DOTYCZY"):
        return ("N/D", GRAY_MUTED)
    if s == "ELEKTRONICZNA":
        return ("Elektroniczna", NAVY)
    return (s.title() if s else "-", GRAY_MUTED)


# Mechanical labels + per-field TAK/NIE translation.
# mode: "fitness"  → TAK=Sprawny, NIE=Niesprawny
#       "fluid"    → TAK=OK,      NIE=Niski
#       "presence" → TAK=Brak,    NIE=Występują
#       "good_bad" → TAK=Dobry,   NIE=Zły
#       "yesno"    → Tak / Nie
MECHANICAL_ROWS: List[tuple[str, str, str]] = [
    ("engineCondition",    "Stan silnika",              "good_bad"),
    ("engineOilLevel",     "Poziom oleju",              "fluid"),
    ("coolantLevel",       "Poziom płynu chłodniczego", "fluid"),
    ("engineNoises",       "Hałasy silnika",            "presence"),
    ("engineSmoke",        "Dymienie silnika",          "presence"),
    ("transmission",       "Skrzynia biegów",           "fitness"),
    ("clutch",             "Sprzęgło",                  "fitness"),
    ("driveShaft",         "Wał napędowy",              "fitness"),
    ("frontSuspension",    "Zawieszenie przednie",      "fitness"),
    ("rearSuspension",     "Zawieszenie tylne",         "fitness"),
    ("shockAbsorbers",     "Amortyzatory",              "fitness"),
    ("frontBrakes",        "Hamulce przednie",          "fitness"),
    ("rearBrakes",         "Hamulce tylne",             "fitness"),
    ("handbrake",          "Hamulec ręczny",            "fitness"),
    ("steeringPlay",       "Luz kierownicy",            "presence"),
    ("steeringPump",       "Wspomaganie kierownicy",    "fitness"),
    ("exhaustSystem",      "Układ wydechowy",           "fitness"),
    ("airConditioning",    "Klimatyzacja",              "fitness"),
    ("heatingSystem",      "Ogrzewanie",                "fitness"),
    ("electricalSystem",   "Instalacja elektryczna",    "fitness"),
    ("batteryCondition",   "Akumulator",                "good_bad"),
    ("lightsAll",          "Oświetlenie",               "fitness"),
    ("wipers",             "Wycieraczki",               "fitness"),
    ("horn",               "Klakson",                   "fitness"),
    ("testDriveConducted", "Jazda próbna",              "yesno"),
]


def _mech_label(v: Any, mode: str) -> tuple[str, Any]:
    if v is None or str(v).strip() == "":
        return ("-", GRAY_MUTED)
    s = str(v).strip().upper()
    is_yes = s in ("TAK", "TRUE", "1", "YES", "OK")
    is_no  = s in ("NIE", "FALSE", "0", "NO")
    is_nd  = s in ("ND", "N/D", "NIE DOTYCZY")
    if is_nd:
        return ("N/D", GRAY_MUTED)

    if mode == "fitness":
        if is_yes: return ("Sprawny", GREEN_OK)
        if is_no:  return ("Niesprawny", RED)
    elif mode == "fluid":
        if is_yes: return ("OK", GREEN_OK)
        if is_no:  return ("Niski", RED)
    elif mode == "presence":
        if is_yes: return ("Brak", GREEN_OK)
        if is_no:  return ("Występują", RED)
    elif mode == "good_bad":
        if is_yes: return ("Dobry", GREEN_OK)
        if is_no:  return ("Zły", RED)
    elif mode == "yesno":
        if is_yes: return ("Przeprowadzona", GREEN_OK)
        if is_no:  return ("Nie przeprowadzona", RED)
    return (str(v), GRAY_MUTED)


# ─── Section builders ────────────────────────────────────────

def _section_vehicle(report: Dict[str, Any]) -> List[Any]:
    v = report.get("vehicle") or {}
    # Two-column (label | value) layout, split across two side-by-side tables
    rows: List[tuple[str, str]] = [
        ("Numer rejestracyjny", _or_dash(v.get("registration_plate"))),
        ("Marka",               _or_dash(v.get("make"))),
        ("Model",               _or_dash(v.get("model"))),
        ("VIN",                 _or_dash(v.get("vin"))),
        ("Rok produkcji",       _or_dash(v.get("year"))),
        ("Data pierwszej rejestracji", _or_dash(v.get("first_registration_date"))),
        ("Przebieg (km)",       _or_dash(v.get("mileage"))),
        ("Kolor",               _or_dash(v.get("color"))),
        ("Rodzaj paliwa",       _or_dash(v.get("fuel_type"))),
        ("Skrzynia biegów",     _or_dash(v.get("transmission"))),
        ("Napęd",               _or_dash(v.get("drive_type"))),
        ("Pojemność silnika (cm³)", _or_dash(v.get("engine_capacity_cc"))),
        ("Moc silnika (KM)",    _or_dash(v.get("engine_power_hp"))),
        ("Moc silnika (kW)",    _or_dash(v.get("engine_power_kw"))),
        ("Masa własna (kg)",    _or_dash(v.get("weight_kg"))),
        ("Liczba miejsc",       _or_dash(v.get("seats"))),
        ("Liczba drzwi",        _or_dash(v.get("doors"))),
        ("Liczba właścicieli",  _or_dash(v.get("owners_count"))),
    ]

    fn, fnb = _fn()
    # Split into two columns (left + right)
    half = (len(rows) + 1) // 2
    left = rows[:half]
    right = rows[half:]
    # Pad shorter column
    while len(right) < len(left):
        right.append(("", ""))

    col_w = (CONTENT_W - 4 * mm) / 2
    table_rows = []
    for (l_label, l_value), (r_label, r_value) in zip(left, right):
        table_rows.append([p(l_label, _style("_lbl", fontName=fnb, textColor=NAVY)),
                           p(l_value),
                           p(r_label, _style("_lbl", fontName=fnb, textColor=NAVY)),
                           p(r_value)])

    t = Table(
        table_rows,
        colWidths=[col_w * 0.45, col_w * 0.55, col_w * 0.45, col_w * 0.55],
    )
    ts = TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.25, GRAY_BORDER),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND",    (0, 0), (0, -1), GRAY_LIGHT),
        ("BACKGROUND",    (2, 0), (2, -1), GRAY_LIGHT),
        ("FONTSIZE",      (0, 0), (-1, -1), 9),
    ])
    t.setStyle(ts)

    return [_section_header("1. Dane pojazdu"), sp(0.15), t, sp(0.5)]


def _section_tires(report: Dict[str, Any]) -> List[Any]:
    tires = report.get("tires") or []
    by_code = {t.get("code"): t for t in tires if isinstance(t, dict)}
    order = [("fl", "Przednie lewe"), ("fr", "Przednie prawe"),
             ("rl", "Tylne lewe"),   ("rr", "Tylne prawe")]

    # Two rows per wheel — row 1: identification; row 2: specs. Keeps all
    # 8 inspector-captured fields visible within A4 width.
    def _tire_season_pl(v: Any) -> str:
        s = str(v or "").strip().lower()
        return {"summer": "Letnie", "winter": "Zimowe",
                "all-season": "Wielosezonowe"}.get(s, s.title() or "-")

    # NB: header cells must pass color=white because pc() wraps text in a
    # Paragraph whose own text color overrides the table's TEXTCOLOR style.
    header = [pc("Pozycja", True, color=colors.white), pc("Marka", True, color=colors.white),
              pc("Model", True, color=colors.white), pc("Rozmiar", True, color=colors.white),
              pc("DOT", True, color=colors.white), pc("LI/SI", True, color=colors.white),
              pc("Bieżnik (mm)", True, color=colors.white), pc("Sezon", True, color=colors.white),
              pc("Status", True, color=colors.white)]
    rows = [header]
    for code, pos in order:
        d = by_code.get(code) or {}
        tread = d.get("tread_mm")
        status_txt, status_color = _tire_status_label(tread)
        tread_str = f"{tread:.1f}" if isinstance(tread, (int, float)) else "-"
        li = d.get("load_index") or ""
        si = d.get("speed_index") or ""
        li_si = f"{li}{si}" if (li or si) else "-"
        rows.append([
            p(pos),
            p(_or_dash(d.get("brand"))),
            p(_or_dash(d.get("model"))),
            p(_or_dash(d.get("size"))),
            pc(_or_dash(d.get("dot"))),
            pc(li_si),
            pc(tread_str),
            p(_tire_season_pl(d.get("type"))),
            pc(status_txt, color=status_color),
        ])

    col_w = CONTENT_W
    t = Table(
        rows,
        colWidths=[col_w * 0.12, col_w * 0.12, col_w * 0.14, col_w * 0.12,
                   col_w * 0.08, col_w * 0.08, col_w * 0.10, col_w * 0.12,
                   col_w * 0.12],
    )
    t.setStyle(_data_ts(header_rows=1, rows=len(rows) - 1))
    return [_section_header("2. Opony"), sp(0.15), t, sp(0.5)]


def _section_paint(report: Dict[str, Any]) -> List[Any]:
    measurements = report.get("paint_measurements") or []
    rows = [[
        pc("Nr", True, color=colors.white), pc("Element", True, color=colors.white),
        pc("Grubość (μm)", True, color=colors.white), pc("Ocena", True, color=colors.white),
    ]]
    if not measurements:
        rows.append([p(""), p("Brak pomiarów lakieru"),
                     pc("-"), pc("-", color=GRAY_MUTED)])
    else:
        for m in measurements:
            val = m.get("value_um")
            range_label = m.get("range_label")
            if isinstance(val, (int, float)) and val > 0:
                label_txt, label_color = _paint_status_label(val)
                # Prefer inspector-selected range (e.g. "200-300 µm") over
                # the bare upper-bound number — the valuer needs to see the
                # actual span the inspector measured, not a single digit.
                val_str = range_label if range_label else f"{val:.0f}"
            else:
                label_txt, label_color = "Brak danych", GRAY_MUTED
                val_str = "-"
            rows.append([
                pc(str(m.get("point", "")), bold=True),
                p(_or_dash(m.get("name"))),
                pc(val_str),
                pc(label_txt, color=label_color, bold=True),
            ])

    col_w = CONTENT_W
    t = Table(rows, colWidths=[col_w * 0.08, col_w * 0.44,
                               col_w * 0.24, col_w * 0.24])
    t.setStyle(_data_ts(header_rows=1, rows=len(rows) - 1))
    return [_section_header("3. Pomiary lakieru"), sp(0.15), t, sp(0.5)]


# Full 108-item catalogue, grouped and ordered identically to the PWA's
# FullEquipmentStep. Each group lists (fullEquipment-key, Polish label).
FULL_EQUIPMENT_GROUPS: List[Tuple[str, List[Tuple[str, str]]]] = [
    ("Bezpieczeństwo / Asystenci", [
        ("abs", "ABS"),
        ("esp", "ESP"),
        ("asr", "ASR"),
        ("alarm", "Alarm"),
        ("airbagPassenger", "Airbag pasażera"),
        ("airbagSideFront", "Airbag boczny przód"),
        ("airbagSideRear", "Airbag boczny tył"),
        ("airbagKnee", "Airbag nóg"),
        ("airbagCurtain", "Kurtyny powietrzne"),
        ("activeParkingSystem", "Aktywny system parkowania"),
        ("nightVisionAssist", "Asystent jazdy nocnej"),
        ("blindSpotAssist", "Asystent martwego punktu"),
        ("vehicleAssist", "Asystent pojazdu"),
        ("laneChangeAssist", "Asystent zmiany pasa ruchu"),
        ("tirePressureSensor", "Czujnik ciśnienia w oponach"),
        ("rainSensors", "Czujnik deszczu"),
        ("lightSensors", "Czujnik zmierzchu"),
        ("trafficSignRecognition", "System rozpoznawania znaków"),
    ]),
    ("Komfort — Fotele / Kierownica", [
        ("manualAC", "Klimatyzacja manualna"),
        ("automaticAC", "Klimatyzacja automatyczna"),
        ("electricFrontSeats", "Fotele przednie ust. elektrycznie"),
        ("massageFrontSeats", "Fotele przednie z masażem"),
        ("adjustableRearSeats", "Fotele tylne regulowane"),
        ("massageRearSeats", "Siedzenia tylne z masażem"),
        ("sportSeats", "Siedzenia sportowe"),
        ("thirdRowSeats", "Trzeci rząd siedzeń"),
        ("heatedSeats", "Ogrzewanie przednich foteli"),
        ("heatedRearSeats", "Ogrzewanie tylnych siedzeń"),
        ("ventilatedFrontSeats", "Wentylacja foteli przód"),
        ("ventilatedRearSeats", "Wentylacja foteli tył"),
        ("driverSeatMemory", "Pamięć ust. fotela kierowcy"),
        ("passengerSeatMemory", "Pamięć ust. fotela pasażera"),
        ("armrestFront", "Podłokietnik przód"),
        ("armrestRear", "Podłokietnik tył"),
        ("leatherSteeringWheel", "Kierownica skórzana"),
        ("multifunctionSteeringWheel", "Kierownica wielofunkcyjna"),
        ("heatedSteeringWheel", "Podgrzewana kierownica"),
        ("paddleShifters", "Kierownica z funkcją zmiany biegów"),
        ("electricSteeringColumn", "Kolumna kierownicy regul. elek."),
        ("powerSteering", "Wspomaganie kierownicy"),
        ("cruiseControl", "Tempomat"),
        ("activeCruiseControl", "Tempomat aktywny"),
        ("comfortAccess", "Dostęp komfortowy"),
        ("keylessEntry", "Zestaw bezkluczykowy"),
        ("centralLocking", "Zamek centralny"),
        ("headUpDisplay", "Head Up Display"),
        ("virtualCockpit", "Wirtualny kokpit"),
        ("onboardComputer", "Komputer pokładowy"),
    ]),
    ("Parkowanie i kamery", [
        ("parkingSensorsFrontRear", "Czujnik parkowania przód + tył"),
        ("parkingSensorsRear", "Czujnik parkowania tył"),
        ("parkingCamera", "Kamera parkowania"),
        ("camera360", "Kamera 360"),
    ]),
    ("Multimedia / Elektronika", [
        ("radio", "Radioodbiornik"),
        ("radioUsb", "Radioodbiornik USB"),
        ("radioSd", "Radioodbiornik SD"),
        ("navigation", "Nawigacja"),
        ("dvdPlayerWithMonitor", "Odtwarzacz DVD z monitorem"),
        ("headrestMonitors", "Zestaw monitorów w zagłówkach"),
        ("tvTuner", "TV Tuner"),
    ]),
    ("Oświetlenie", [
        ("daytimeRunningLights", "Światła do jazdy dziennej"),
        ("daytimeRunningLightsLed", "Światła do jazdy dziennej LED"),
        ("ledLights", "Reflektory LED"),
        ("fullLedLights", "Reflektory Full LED"),
        ("xenonLights", "Reflektory ksenonowe"),
        ("laserLights", "Reflektory laserowe"),
        ("fogLights", "Światła przeciwmgielne"),
        ("corneringLights", "Reflektory skrętne"),
        ("bendLighting", "Reflektory z doświetlaniem zakrętów"),
        ("headlightWashers", "Spryskiwacze reflektorów"),
    ]),
    ("Nadwozie / Dach / Szyby / Lusterka", [
        ("electricOpeningRoof", "Dach otwierany el."),
        ("solarOpeningRoof", "Dach otwierany z baterią słoneczną"),
        ("panoramicRoof", "Dach panoramiczny"),
        ("roofRails", "Relingi dachowe"),
        ("metallicPaint", "Lakier metalik"),
        ("heatedFrontWindshield", "Szyba przednia ogrzewana"),
        ("electricWindowsFront", "Szyby pod. el. przód"),
        ("electricWindowsRear", "Szyby pod. el. tył"),
        ("sunBlindRear", "Roleta p. słoneczna tylna"),
        ("sunBlindSide", "Roleta p. słoneczna boczne"),
        ("heatedMirrors", "Lusterka ogrzewane"),
        ("autoDimmingExtMirrors", "Lusterka zew. przyciemniające się"),
        ("electricMirrors", "Lusterka reg. elektrycznie"),
        ("foldingElectricMirrors", "Lusterka składane elektr."),
        ("autoDimmingIntMirror", "Lusterko wst. przyciemniające się"),
        ("electricClosingDoors", "Drzwi domykane elektryczne"),
        ("electricTailgate", "Pokrywa tylna otw./zam. elekt."),
        ("towBar", "Hak"),
        ("alloyWheels", "Felgi aluminiowe"),
        ("structuralWheels", "Felgi strukturalne"),
        ("alloySpareWheel", "Koło zapasowe alu."),
        ("compactSpareWheel", "Koło dojazdowe"),
    ]),
    ("Tapicerka / Wnętrze", [
        ("leatherUpholstery", "Tapicerka skórzana"),
        ("alcantaraUpholstery", "Tapicerka alkantara"),
        ("fabricLeatherUpholstery", "Tapicerka materiał-skórzana"),
        ("velourUpholstery", "Tapicerka welurowa"),
        ("blackHeadliner", "Podsufitka czarna"),
        ("interiorTrimAluminum", "Wykończenie wnętrza aluminium"),
        ("interiorTrimWood", "Wykończenie wnętrza drewno"),
        ("interiorTrimCarbon", "Wykończenie wnętrza karbon"),
    ]),
    ("Pozostałe / Dodatkowe", [
        ("fridge", "Lodówka"),
        ("foldingTables", "Składane stoliki"),
        ("powerSocket230vTrunk", "Gniazdo 230V w bagażniku"),
        ("airSuspension", "Zawieszenie pneumatyczne"),
        ("ceramicBrakes", "Hamulce ceramiczne"),
        ("lpgSystem", "Instalacja gazowa"),
        ("webasto", "Webasto"),
        ("tachograph", "Tachograf"),
        ("winch", "Wyciągarka"),
    ]),
]


def _is_equipped(v: Any) -> Optional[bool]:
    """TAK/true/1 → True, NIE/false/0 → False, anything else (ND, '', None) → None."""
    if v is None:
        return None
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return bool(v)
    s = str(v).strip().upper()
    if s in ("TAK", "TRUE", "1", "YES", "Y"):
        return True
    if s in ("NIE", "FALSE", "0", "NO", "N"):
        return False
    return None


def _section_equipment(report: Dict[str, Any]) -> List[Any]:
    full_eq = report.get("full_equipment") or {}

    # Fallback: old flat list payload — render it as a single ungrouped block.
    if not full_eq:
        legacy = report.get("equipment") or []
        if not legacy:
            return [
                _section_header("4. Wyposażenie"), sp(0.15),
                p("Brak danych o wyposażeniu pojazdu.",
                  _style("_x", textColor=GRAY_MUTED)),
                sp(0.5),
            ]
        full_eq = {
            (item.get("name") or ""): ("TAK" if item.get("present") else "NIE")
            for item in legacy if item.get("name")
        }

    GREEN_HEX = "#0B8043"
    GRAY_HEX  = "#86868B"

    def _cell(key: str, label: str) -> Paragraph:
        present = _is_equipped(full_eq.get(key))
        if present is True:
            mark, color = "☑", GREEN_HEX
        elif present is False:
            mark, color = "☐", GRAY_HEX
        else:
            mark, color = "—", GRAY_HEX
        safe = label.replace("&", "&amp;").replace("<", "&lt;")
        return p(
            f"<font color='{color}'><b>{mark}</b></font> {safe}",
            _style("_eq", fontSize=8.5, leading=11),
        )

    story: List[Any] = [_section_header("4. Wyposażenie"), sp(0.15)]

    cols = 3
    col_w = CONTENT_W / cols

    _fn_reg, _fn_bold = _fn()
    for group_title, items in FULL_EQUIPMENT_GROUPS:
        # Group sub-header
        story.append(sp(0.10))
        story.append(p(
            group_title,
            _style("_eqh", fontSize=10, leading=12,
                   textColor=NAVY, fontName=_fn_bold),
        ))
        story.append(sp(0.05))

        rows_out: List[List[Paragraph]] = []
        current: List[Paragraph] = []
        for key, label in items:
            current.append(_cell(key, label))
            if len(current) == cols:
                rows_out.append(current)
                current = []
        if current:
            while len(current) < cols:
                current.append(p(""))
            rows_out.append(current)

        t = Table(rows_out, colWidths=[col_w] * cols)
        t.setStyle(TableStyle([
            ("LEFTPADDING",   (0, 0), (-1, -1), 4),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
            ("TOPPADDING",    (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ]))
        story.append(t)

    story.append(sp(0.5))
    return story


def _section_documents(report: Dict[str, Any]) -> List[Any]:
    docs = report.get("documents_check") or []
    rows = [[pc("Dokument / wyposażenie", True, color=colors.white), pc("Stan", True, color=colors.white)]]
    if not docs:
        rows.append([p("Brak zarejestrowanych pozycji"),
                     pc("-", color=GRAY_MUTED)])
    else:
        for d in docs:
            s = _str(d.get("status"))
            stype = _str(d.get("status_type"))
            if stype == "green" or s.lower() == "tak":
                color = GREEN_OK
            elif stype == "red" or s.lower() in ("nie", "brak"):
                color = RED
            elif stype == "blue" or s.lower() == "elektroniczna":
                color = NAVY
            else:
                color = GRAY_MUTED
            rows.append([p(_or_dash(d.get("name"))), pc(s or "-", color=color, bold=True)])

    col_w = CONTENT_W
    t = Table(rows, colWidths=[col_w * 0.70, col_w * 0.30])
    t.setStyle(_data_ts(header_rows=1, rows=len(rows) - 1))
    return [
        _section_header("5. Dokumentacja i wyposażenie dodatkowe"),
        sp(0.15), t, sp(0.5),
    ]


def _section_mechanical(report: Dict[str, Any]) -> List[Any]:
    mech = report.get("mechanical") or {}
    rows = [[pc("Element", True, color=colors.white), pc("Stan", True, color=colors.white)]]
    any_row = False
    for key, label, mode in MECHANICAL_ROWS:
        v = mech.get(key)
        if v is None or str(v).strip() == "":
            continue
        any_row = True
        txt, color = _mech_label(v, mode)
        rows.append([p(label), pc(txt, color=color, bold=True)])

    # Optional extras at the bottom
    extra_comment = _str(mech.get("testDriveComment"))
    if extra_comment:
        any_row = True
        rows.append([p("Uwagi z jazdy próbnej"),
                     p(extra_comment, _style("_tdc", fontSize=8))])

    warning_lights = _str(mech.get("warning_lights") or mech.get("warningLights"))
    if warning_lights:
        any_row = True
        rows.append([p("Kontrolki ostrzegawcze"),
                     p(warning_lights, _style("_wl", fontSize=8, textColor=RED))])

    if not any_row:
        rows.append([p("Brak danych o stanie mechanicznym"),
                     pc("-", color=GRAY_MUTED)])

    col_w = CONTENT_W
    t = Table(rows, colWidths=[col_w * 0.60, col_w * 0.40])
    t.setStyle(_data_ts(header_rows=1, rows=len(rows) - 1))
    return [_section_header("6. Stan mechaniczny"), sp(0.15), t, sp(0.5)]


def _section_damages(report: Dict[str, Any]) -> List[Any]:
    ext = report.get("damages") or []
    intr = report.get("interior_damages") or []
    out: List[Any] = [_section_header("7. Uszkodzenia"), sp(0.15)]

    def _tbl(title: str, damages: List[dict]) -> Any:
        fn, fnb = _fn()
        header = [pc("Nr", True, color=colors.white), pc("Lokalizacja", True, color=colors.white),
                  pc("Typ", True, color=colors.white), pc("Rozmiar", True, color=colors.white),
                  pc("Opis", True, color=colors.white)]
        rows = [header]
        if not damages:
            rows.append([pc("-"), p("Brak uszkodzeń"),
                         p("-"), p("-"), p("-")])
        else:
            for i, d in enumerate(damages, 1):
                rows.append([
                    pc(str(d.get("index") or i), bold=True),
                    p(_or_dash(d.get("location"))),
                    p(_or_dash(d.get("type"))),
                    p(_or_dash(d.get("size"))),
                    p(_str(d.get("description")) or "-"),
                ])
        col_w = CONTENT_W
        t = Table(rows, colWidths=[col_w * 0.07, col_w * 0.22,
                                   col_w * 0.18, col_w * 0.13,
                                   col_w * 0.40])
        t.setStyle(_data_ts(header_rows=1, rows=len(rows) - 1))
        return KeepTogether([
            p(title, _style("_subh", fontName=fnb, fontSize=9.5,
                            textColor=NAVY, leading=12)),
            sp(0.08), t, sp(0.25),
        ])

    out.append(_tbl("Uszkodzenia zewnętrzne", ext))
    out.append(_tbl("Uszkodzenia wnętrza", intr))
    out.append(sp(0.25))
    return out


def _section_notes(report: Dict[str, Any]) -> List[Any]:
    notes_text = _str(report.get("notes"))
    v = report.get("vehicle") or {}
    extras = []

    # "vehicle" payload doesn't carry valuation figures — the notes string
    # bundles general comments + valuation notes + market comparison. The
    # structured figures (estimatedValue etc.) live in notes_json which
    # isn't surfaced through get_report today; if the backend starts
    # exposing them, add them here.

    if not notes_text:
        notes_text = "Brak uwag."

    body = p(notes_text, _style("_nt", fontSize=9, leading=13))
    t = Table([[body]], colWidths=[CONTENT_W])
    t.setStyle(TableStyle([
        ("BOX",        (0, 0), (-1, -1), 0.25, GRAY_BORDER),
        ("LINEBEFORE", (0, 0), (0, -1), 3, RED),
        ("BACKGROUND", (0, 0), (-1, -1), GRAY_LIGHT),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
        ("TOPPADDING",    (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return [_section_header("8. Uwagi"), sp(0.15), t, *extras, sp(0.5)]


def _section_signatures(report: Dict[str, Any]) -> List[Any]:
    fn, fnb = _fn()
    insp = (report.get("signatures") or {}).get("inspector") or {}
    cli  = (report.get("signatures") or {}).get("client") or {}
    date = fmt_date(_str(report.get("inspection_date")))

    def _cell(label: str, name: str) -> List[Any]:
        name_txt = _or_dash(name)
        return [
            p(" ", _style("_gap", fontSize=6)),
            p(" ", _style("_line", fontSize=6)),
            Table(
                [[p("")]],
                colWidths=[60 * mm],
                rowHeights=[14 * mm],
                style=TableStyle([
                    ("LINEBELOW", (0, 0), (-1, -1), 0.5, NAVY),
                ]),
            ),
            p(label, _style("_sig_lbl", fontName=fnb, fontSize=9,
                            textColor=NAVY, leading=11)),
            p(name_txt, _style("_sig_name", fontSize=8,
                               textColor=GRAY_MUTED, leading=10)),
        ]

    left  = _cell("Podpis rzeczoznawcy", insp.get("name") or "")
    right = _cell("Podpis klienta",       cli.get("name") or "")

    # Two signature columns side by side
    grid = Table(
        [[left, right]],
        colWidths=[CONTENT_W / 2, CONTENT_W / 2],
    )
    grid.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))

    date_line = p(f"Data oględzin: <b>{date or 'Brak danych'}</b>",
                  _style("_dt", fontSize=9, leading=12))
    return [_section_header("9. Podpisy"), sp(0.2), grid, sp(0.3), date_line]


# ─── Orchestrator ────────────────────────────────────────────

def build_protokol_wycena_pdf(report: Dict[str, Any]) -> bytes:
    """
    Build the Protokół Wycena PDF as bytes from the structured report payload
    produced by ``routers.report.get_report``.
    """
    buf = io.BytesIO()

    deal_id = report.get("deal_id")
    order_no = str(deal_id) if deal_id is not None else ""
    date = fmt_date(_str(report.get("inspection_date")))

    # Shared header/footer
    def _on_page(canv, doc):
        _draw_page_frame(canv, doc,
                         title="Protokół Wycena",
                         order_no=order_no,
                         date=date)

    doc = BaseDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=MARGIN_LR, rightMargin=MARGIN_LR,
        topMargin=MARGIN_T, bottomMargin=MARGIN_B,
        title=f"Protokół Wycena — {order_no or 'pojazd'}",
        author="Zaufaj Rzeczoznawcy Sp. z o.o.",
    )
    frame = Frame(
        doc.leftMargin, doc.bottomMargin,
        doc.width, doc.height,
        leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
        id="content",
    )
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame],
                                       onPage=_on_page)])

    story: List[Any] = []

    # Title strip — red accent + "Protokół Wycena" under the header
    fn, fnb = _fn()
    title_cell = Table(
        [[p("Protokół Wycena",
            _style("_tt", fontName=fnb, fontSize=18, leading=22, textColor=RED))]],
        colWidths=[CONTENT_W],
    )
    title_cell.setStyle(TableStyle([
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW",     (0, 0), (-1, -1), 1, RED),
    ]))
    story.append(title_cell)

    # Order / date / inspector / company summary strip
    inspector_name = _or_dash(report.get("inspector_name"))
    client_name    = _or_dash(report.get("client_name"))
    company_name   = _or_dash(report.get("company_name"))
    place          = _or_dash(report.get("inspection_place"))

    summary_rows = [
        [pb("Numer zlecenia", color=NAVY), p(order_no or "Brak"),
         pb("Data oględzin", color=NAVY),  p(date or "Brak danych")],
        [pb("Rzeczoznawca",   color=NAVY), p(inspector_name),
         pb("Miejsce",        color=NAVY), p(place)],
        [pb("Klient",         color=NAVY), p(client_name),
         pb("Firma",          color=NAVY), p(company_name)],
    ]
    summary_tbl = Table(summary_rows,
                        colWidths=[CONTENT_W * 0.17, CONTENT_W * 0.33,
                                   CONTENT_W * 0.15, CONTENT_W * 0.35])
    summary_tbl.setStyle(TableStyle([
        ("GRID",          (0, 0), (-1, -1), 0.25, GRAY_BORDER),
        ("BACKGROUND",    (0, 0), (0, -1), GRAY_LIGHT),
        ("BACKGROUND",    (2, 0), (2, -1), GRAY_LIGHT),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(sp(0.15))
    story.append(summary_tbl)
    story.append(sp(0.5))

    # 9 sections
    story.extend(_section_vehicle(report))
    story.extend(_section_tires(report))
    story.extend(_section_paint(report))
    story.extend(_section_equipment(report))
    story.extend(_section_documents(report))
    story.extend(_section_mechanical(report))
    story.extend(_section_damages(report))
    story.extend(_section_notes(report))
    story.extend(_section_signatures(report))

    doc.build(story)
    return buf.getvalue()
