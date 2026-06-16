"""
PDF Generator — Kosztorys napraw
=================================
Generates a downloadable repair-cost estimate (kosztorys) PDF from the
admin-saved MacadamData payload (services / routers.kosztorys_costs).

Layout mirrors the on-screen report at /kosztorys/{deal_id}:
  1. Vehicle header
  2. Order parameters (labour rate, depreciation %)
  3. USZKODZENIA PONADNORMATYWNE — non-akceptowalne parts with costs +
     up to 4 photo thumbnails per damage
  4. Koszt materiału i części drobnych (when > 0)
  5. PODSUMOWANIE KOSZTÓW NAPRAW — netto / VAT 23% / brutto
  6. USZKODZENIA AKCEPTOWALNE (bez kosztu) — compact rows
  7. Eurotax detail (deferred — TODO marker; not in v1)

Reuses theme + page frame + style helpers from
services.protokol_wycena_pdf so the kosztorys PDF looks like a sibling
of the existing wycena PDF.

Usage
-----
    from services.kosztorys_pdf import build_kosztorys_pdf
    pdf_bytes = build_kosztorys_pdf(saved_costs_dict)
"""
from __future__ import annotations

import base64
import io
import json
import logging
import re
from typing import Any, Dict, List, Optional

import httpx
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate,
    Paragraph, Spacer, Table, TableStyle, KeepTogether,
)

# Reuse theme + helpers from the wycena PDF so the two reports look like
# siblings (same fonts, palette, header strip, section bars).
from services.protokol_wycena_pdf import (
    NAVY, RED, GRAY_LIGHT, GRAY_BORDER, GRAY_MUTED, TEXT_BLACK, GREEN_OK,
    MARGIN_LR, MARGIN_T, MARGIN_B, CONTENT_W,
    _style, p, pb, pc, sp, _str, _or_dash,
    _section_header, _data_ts, _draw_page_frame,
)
from services.pdf_generator import _fn, load_image, load_image_from_source
from database import SessionLocal
from models.inspector import InspectionPhoto, InspectionRecord

logger = logging.getLogger("services.kosztorys_pdf")


# Short timeout for the rare case a non-gallery photo URL (genuine
# external http/https) is encountered. Our own gallery photos go
# straight through SQLAlchemy — no HTTP — so this timeout doesn't
# affect them.
_EXTERNAL_PHOTO_TIMEOUT = httpx.Timeout(4.0, connect=2.0)


# ─── Money + value formatting ────────────────────────────────────────────────

def _fmt_pln(v: Any) -> str:
    """Polish money format: '1 234,56 PLN'. None / non-numeric → '—'."""
    if v is None or v == "":
        return "—"
    try:
        n = float(v)
    except (TypeError, ValueError):
        return "—"
    # 2 decimals; "," for decimal point, space for thousands.
    raw = f"{n:,.2f}"  # → "1,234.56"
    # First swap , and . via a placeholder so we don't double-replace.
    return raw.replace(",", " ").replace(".", ",").replace(" ", " ") + " PLN"


# ─── Photo loaders — direct DB read, no HTTP ─────────────────────────────────
#
# The httpx-to-localhost approach deadlocks: when build_kosztorys_pdf
# runs inside the same uvicorn worker that's serving the kosztorys
# PDF request, an in-process HTTP call back to /gallery on the same
# server can't be served until the current request returns → request
# times out (504). The gallery handler reads from SQLAlchemy anyway,
# so we mirror its query directly and skip HTTP entirely.
#
# The two saved-URL shapes we recognise (mirroring routers.report):
#   /(api/)?gallery/{deal_id}/damage/{ext|int}/{dmg_idx}/{photo_idx}
#   /(api/)?gallery/{deal_id}/media/{slot_id}
# Anything else (real external http/https, data: URI) falls back to
# load_image_from_source so genuinely-external photos still work.

_DAMAGE_PHOTO_RE = re.compile(
    r"^/(?:api/)?gallery/(\d+)/damage/(ext|int)/(\d+)/(\d+)/?$"
)
_MEDIA_PHOTO_RE = re.compile(
    r"^/(?:api/)?gallery/(\d+)/media/([^/?#]+)/?$"
)


def _load_damage_photo_from_db(
    deal_id: int, source: str, dmg_idx: int, photo_idx: int,
) -> bytes:
    """Mirrors routers.report.get_gallery_damage_photo's lookup —
    InspectionRecord.{exterior|interior}_damage_json → damages[i]
    ["photos"][j] (base64 string, optionally prefixed with
    'data:image/...;base64,') → decoded bytes."""
    if source not in ("ext", "int"):
        return b""
    db = SessionLocal()
    try:
        rec = db.query(InspectionRecord).filter(
            InspectionRecord.deal_id == deal_id,
        ).first()
        if rec is None:
            return b""
        raw_json = rec.exterior_damage_json if source == "ext" else rec.interior_damage_json
        if not raw_json:
            return b""
        damages = json.loads(raw_json)
        if dmg_idx >= len(damages) or not isinstance(damages[dmg_idx], dict):
            return b""
        photos = damages[dmg_idx].get("photos") or []
        if photo_idx >= len(photos):
            return b""
        b64_str = photos[photo_idx] or ""
        if "," in b64_str:
            b64_str = b64_str.split(",", 1)[1]
        return base64.b64decode(b64_str)
    except Exception as e:
        logger.warning(
            f"[Kosztorys PDF] DB damage photo deal={deal_id} {source}[{dmg_idx}][{photo_idx}] failed: {e}"
        )
        return b""
    finally:
        try:
            db.close()
        except Exception:
            pass


def _load_media_photo_from_db(deal_id: int, slot_id: str) -> bytes:
    """Mirrors routers.report.get_gallery_media's lookup —
    InspectionPhoto.photo_bytes for (deal_id, slot_id)."""
    db = SessionLocal()
    try:
        row = db.query(InspectionPhoto).filter(
            InspectionPhoto.deal_id == deal_id,
            InspectionPhoto.slot_id == slot_id,
        ).first()
        if row is None or not row.photo_bytes:
            return b""
        return row.photo_bytes
    except Exception as e:
        logger.warning(
            f"[Kosztorys PDF] DB media photo deal={deal_id} slot={slot_id} failed: {e}"
        )
        return b""
    finally:
        try:
            db.close()
        except Exception:
            pass


def _load_photo_bytes(saved_url: str) -> bytes:
    """Resolve a saved photo reference to bytes. Local /gallery URLs go
    straight to SQLAlchemy (no HTTP — avoids the in-process self-call
    deadlock that caused the 504). External http(s) / data: URIs fall
    back to the existing HTTP loader."""
    if not saved_url or not isinstance(saved_url, str):
        return b""

    m = _DAMAGE_PHOTO_RE.match(saved_url)
    if m:
        return _load_damage_photo_from_db(
            int(m.group(1)), m.group(2), int(m.group(3)), int(m.group(4)),
        )

    m = _MEDIA_PHOTO_RE.match(saved_url)
    if m:
        return _load_media_photo_from_db(int(m.group(1)), m.group(2))

    if saved_url.startswith(("http://", "https://", "data:")):
        return load_image_from_source(saved_url, timeout=_EXTERNAL_PHOTO_TIMEOUT) or b""

    return b""


def _prefetch_photos(parts: List[Dict[str, Any]]) -> Dict[str, bytes]:
    """Sequential DB-backed prefetch of every unique above-norm photo
    URL. DB reads are milliseconds each — a ThreadPoolExecutor adds no
    real benefit and complicates session lifetimes.

    Returns {original_saved_url: bytes_or_empty}. Failures are
    non-fatal — missing photos render as the "—" placeholder."""
    urls: List[str] = []
    seen = set()
    for part in parts:
        for u in (part.get("photos") or [])[:4]:
            if isinstance(u, str) and u and u not in seen:
                seen.add(u)
                urls.append(u)

    out: Dict[str, bytes] = {}
    for saved_url in urls:
        out[saved_url] = _load_photo_bytes(saved_url)
    n_ok = sum(1 for b in out.values() if b)
    if urls:
        logger.info(f"[Kosztorys PDF] prefetched {n_ok}/{len(urls)} photos (DB)")
    return out


# ─── Section builders ────────────────────────────────────────────────────────

def _section_vehicle(costs: Dict[str, Any]) -> List[Any]:
    """Vehicle header — two-column label/value grid."""
    v = costs.get("vehicle") or {}
    mileage = v.get("mileage_km")
    mileage_s = f"{int(mileage)} km" if isinstance(mileage, (int, float)) else _or_dash(mileage)
    rows = [
        ("Marka i model",            _or_dash(v.get("make_model"))),
        ("Wersja",                   _or_dash(v.get("variant"))),
        ("VIN",                      _or_dash(v.get("vin"))),
        ("Nr rejestracyjny",         _or_dash(v.get("registration_plate"))),
        ("Grupa",                    _or_dash(v.get("grupa"))),
        ("Przebieg",                 mileage_s),
        ("Pierwsza rejestracja",     _or_dash(v.get("first_registration"))),
        ("Kolor nadwozia",           _or_dash(v.get("body_colour"))),
        ("Klient",                   _or_dash(v.get("klient"))),
        ("Data inspekcji",           _or_dash(v.get("inspection_date"))),
    ]
    fn, fnb = _fn()
    # Split into two columns for compactness.
    half = (len(rows) + 1) // 2
    left = rows[:half]
    right = rows[half:]
    while len(right) < len(left):
        right.append(("", ""))

    col_w = (CONTENT_W - 4 * mm) / 2
    table_rows = []
    for (l_label, l_value), (r_label, r_value) in zip(left, right):
        table_rows.append([
            p(l_label, _style("_lbl", fontName=fnb, textColor=NAVY)),
            p(l_value),
            p(r_label, _style("_lbl", fontName=fnb, textColor=NAVY)),
            p(r_value),
        ])

    t = Table(
        table_rows,
        colWidths=[col_w * 0.45, col_w * 0.55, col_w * 0.45, col_w * 0.55],
    )
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.25, GRAY_BORDER),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND",    (0, 0), (0, -1), GRAY_LIGHT),
        ("BACKGROUND",    (2, 0), (2, -1), GRAY_LIGHT),
        ("FONTSIZE",      (0, 0), (-1, -1), 9),
    ]))
    return [_section_header("1. Dane pojazdu"), sp(0.15), t, sp(0.5)]


def _section_order_params(costs: Dict[str, Any]) -> List[Any]:
    """Order-level inputs — labour rate, depreciation %, material cost."""
    rate     = costs.get("labour_rate_pln_per_h")
    depr_pct = costs.get("depreciation_pct")
    material = costs.get("koszt_materialu_pln")

    fn, fnb = _fn()
    rate_s     = _fmt_pln(rate).replace(" PLN", " PLN/h") if rate not in (None, "") else "—"
    depr_s     = f"{float(depr_pct):.0f}%" if depr_pct not in (None, "") else "—"
    material_s = _fmt_pln(material) if material not in (None, "") else "—"

    rows = [[
        p("Stawka roboczogodzinowa", _style("_lbl", fontName=fnb, textColor=NAVY)),
        p(rate_s),
        p("Amortyzacja",             _style("_lbl", fontName=fnb, textColor=NAVY)),
        p(depr_s),
        p("Koszt materiału",         _style("_lbl", fontName=fnb, textColor=NAVY)),
        p(material_s),
    ]]
    col = CONTENT_W / 6
    t = Table(rows, colWidths=[col, col, col, col, col, col])
    t.setStyle(TableStyle([
        ("GRID",          (0, 0), (-1, -1), 0.25, GRAY_BORDER),
        ("BACKGROUND",    (0, 0), (0, -1), GRAY_LIGHT),
        ("BACKGROUND",    (2, 0), (2, -1), GRAY_LIGHT),
        ("BACKGROUND",    (4, 0), (4, -1), GRAY_LIGHT),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return [_section_header("2. Parametry zlecenia"), sp(0.15), t, sp(0.5)]


# Damage-card layout — STACKED vertical, single-column.
#
# Earlier the card was a 2-col Table [photos | text] but the photo
# grid kept overflowing onto the text column. Switching to a vertical
# stack (title → info table → photo strip below) makes overlap
# structurally impossible: there is no second column for photos to
# escape into.
#
# A4 portrait, CONTENT_W ≈ 180mm = ~510pt.
#   _CARD_PAD_LR  outer card L/R padding (pt)
#   _CARD_INNER   width inside the BOX border = CONTENT_W − 2·pad
#   info_tbl colWidths sum = _CARD_INNER (label 40% / value 60%)
#   photo strip cell width = _CARD_INNER / 4; up to 4 thumbnails
#     across (extra slots simply aren't rendered when fewer photos).
_CARD_PAD_LR    = 10                             # outer card L/R padding (pt)
_CARD_INNER     = CONTENT_W - 2 * _CARD_PAD_LR   # content width inside the BOX
_STRIP_CELLS    = 4
_STRIP_CELL_W   = _CARD_INNER / _STRIP_CELLS
_STRIP_THUMB_W  = 38 * mm                        # thumbnail max width (≈108pt)
_STRIP_THUMB_H  = 30 * mm                        # thumbnail max height


def _damage_card(
    part: Dict[str, Any],
    idx: int,
    photo_cache: Dict[str, bytes],
) -> KeepTogether:
    """One above-norm damage rendered as a VERTICAL stack:
        1. title row ({idx} | {czesc})
        2. info table (Typ / Tryb / Kwalifikacja / costs / KOSZT NETTO)
        3. photo strip (up to 4 thumbnails across, BELOW the text)
    KeepTogether so the card stays atomic across page breaks. The
    photo strip can't overlap the text any more — there's no second
    column for it to bleed into."""
    fn, fnb = _fn()

    # ── Row 1: title — full-width navy heading.
    czesc = _or_dash(part.get("czesc"))
    title = p(
        f"{idx} &nbsp;|&nbsp; {czesc}",
        _style("_dh", fontName=fnb, fontSize=11, leading=13, textColor=NAVY),
    )

    # ── Row 2: info table — label/value rows, value column right-
    # aligned. Same content + green KOSZT NETTO as before; only the
    # width changes (full _CARD_INNER, 40/60 split).
    typ            = _or_dash(part.get("typ"))
    tryb           = _or_dash(part.get("tryb_naprawy"))
    qualification  = _or_dash(part.get("qualification"))
    naprawy        = _fmt_pln(part.get("koszty_naprawy_pln"))
    amortyzacja    = _fmt_pln(part.get("koszt_amortyzacji_pln"))
    netto          = _fmt_pln(part.get("koszt_netto_pln"))

    lbl_style    = _style("_drl",  fontName=fn,  textColor=GRAY_MUTED, fontSize=9,  leading=12)
    val_style    = _style("_drv",  fontName=fn,                       fontSize=9.5, leading=12)
    money_style  = _style("_drm",  fontName=fn,                       fontSize=9.5, leading=12)
    netto_style  = _style("_drn",  fontName=fnb, textColor=GREEN_OK,  fontSize=11,  leading=13)
    netto_lbl_st = _style("_drnl", fontName=fnb, textColor=NAVY,      fontSize=10,  leading=13)

    info_rows = [
        [p("Typ uszkodzenia",       lbl_style),    p(typ,           val_style)],
        [p("Tryb naprawy",          lbl_style),    p(tryb,          val_style)],
        [p("Kwalifikacja",          lbl_style),    p(qualification, val_style)],
        [p("Koszty naprawy",        lbl_style),    p(naprawy,       money_style)],
        [p("Koszt amortyzacji",     lbl_style),    p(amortyzacja,   money_style)],
        [p("KOSZT NETTO (bez VAT)", netto_lbl_st), p(netto,         netto_style)],
    ]
    info_tbl = Table(
        info_rows,
        colWidths=[_CARD_INNER * 0.40, _CARD_INNER * 0.60],
    )
    info_tbl.setStyle(TableStyle([
        ("LINEBELOW",     (0, 0), (-1, -2), 0.25, GRAY_BORDER),
        ("LEFTPADDING",   (0, 0), (-1, -1), 4),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN",         (1, 0), (1, -1), "RIGHT"),
    ]))

    # ── Row 3: photo strip — up to 4 thumbnails across, beneath the
    # text. When fewer than 4 photos are present we only emit that
    # many cells (no padding cells, per spec).
    photos = part.get("photos") or []
    photo_strip: Any = None
    if photos:
        cells: List[Any] = []
        for src in photos[:_STRIP_CELLS]:
            data = photo_cache.get(src) if isinstance(src, str) else None
            img = load_image(data, _STRIP_THUMB_W, _STRIP_THUMB_H) if data else None
            cells.append(
                img if img is not None
                else p("—", _style("_ph_miss", fontSize=8, textColor=GRAY_MUTED))
            )
        photo_strip = Table([cells], colWidths=[_STRIP_CELL_W] * len(cells))
        photo_strip.setStyle(TableStyle([
            ("LEFTPADDING",   (0, 0), (-1, -1), 3),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 3),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN",         (0, 0), (-1, -1), "LEFT"),
        ]))

    # ── Wrap title + info + (optional) photo strip in ONE outer Table
    # so the BOX border and KeepTogether apply to the whole card. The
    # outer cell width is CONTENT_W; inner content width after the
    # _CARD_PAD_LR padding = _CARD_INNER, matching every child above.
    card_rows: List[List[Any]] = [[title], [info_tbl]]
    if photo_strip is not None:
        card_rows.append([photo_strip])
    card = Table(card_rows, colWidths=[CONTENT_W])
    card.setStyle(TableStyle([
        ("BOX",           (0, 0), (-1, -1), 0.5, GRAY_BORDER),
        ("LEFTPADDING",   (0, 0), (-1, -1), _CARD_PAD_LR),
        ("RIGHTPADDING",  (0, 0), (-1, -1), _CARD_PAD_LR),
        ("TOPPADDING",    (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ]))
    return KeepTogether([card, sp(0.2)])


def _section_above_norm(
    parts: List[Dict[str, Any]],
    photo_cache: Dict[str, bytes],
) -> List[Any]:
    """USZKODZENIA PONADNORMATYWNE — full damage cards. Empty group is
    skipped entirely (no header, no placeholder)."""
    if not parts:
        return []
    out: List[Any] = [
        _section_header("3. Uszkodzenia ponadnormatywne"),
        sp(0.15),
    ]
    for i, part in enumerate(parts, 1):
        # Use saved index when present, else our running counter.
        idx = part.get("index") or i
        out.append(_damage_card(part, int(idx), photo_cache))
    out.append(sp(0.2))
    return out


def _section_material_row(material: float) -> List[Any]:
    """Standalone "Koszt materiału i części drobnych" row above the
    summary card. Only emitted when material > 0."""
    if not material or material <= 0:
        return []
    fn, fnb = _fn()
    row = Table(
        [[
            p("Koszt materiału i części drobnych",
              _style("_matl", fontName=fnb, fontSize=10, textColor=TEXT_BLACK)),
            p(_fmt_pln(material),
              _style("_matv", fontName=fnb, fontSize=10, textColor=TEXT_BLACK, alignment=2)),
        ]],
        colWidths=[CONTENT_W * 0.65, CONTENT_W * 0.35],
    )
    row.setStyle(TableStyle([
        ("BOX",           (0, 0), (-1, -1), 0.5, GRAY_BORDER),
        ("BACKGROUND",    (0, 0), (-1, -1), colors.white),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return [row, sp(0.15)]


def _section_summary(netto: float, vat: float, gross: float) -> List[Any]:
    """PODSUMOWANIE KOSZTÓW NAPRAW — netto / VAT 23% / brutto card."""
    fn, fnb = _fn()
    title_row = [[p("PODSUMOWANIE KOSZTÓW NAPRAW",
                    _style("_sumh", fontName=fnb, fontSize=9, textColor=GRAY_MUTED))]]
    rows = [[
        p("Suma netto",   _style("_sl", fontName=fn,  fontSize=10, textColor=GRAY_MUTED)),
        p(_fmt_pln(netto), _style("_sv", fontName=fnb, fontSize=10, alignment=2)),
    ], [
        p("VAT 23%",      _style("_sl", fontName=fn,  fontSize=10, textColor=GRAY_MUTED)),
        p(_fmt_pln(vat),   _style("_sv", fontName=fnb, fontSize=10, alignment=2)),
    ], [
        p("Suma brutto",  _style("_sl2", fontName=fnb, fontSize=11, textColor=TEXT_BLACK)),
        p(_fmt_pln(gross), _style("_sv2", fontName=fnb, fontSize=13, textColor=GREEN_OK, alignment=2)),
    ]]
    inner = Table(rows, colWidths=[CONTENT_W * 0.60, CONTENT_W * 0.40])
    inner.setStyle(TableStyle([
        ("LINEBELOW",     (0, 0), (-1, -2), 0.25, GRAY_BORDER),
        ("LEFTPADDING",   (0, 0), (-1, -1), 12),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 12),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ]))
    header = Table(title_row, colWidths=[CONTENT_W])
    header.setStyle(TableStyle([
        ("LEFTPADDING",   (0, 0), (-1, -1), 12),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 12),
        ("TOPPADDING",    (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))

    box = Table([[header], [inner]], colWidths=[CONTENT_W])
    box.setStyle(TableStyle([
        ("BOX",           (0, 0), (-1, -1), 0.6, GRAY_BORDER),
        ("BACKGROUND",    (0, 0), (-1, -1), GRAY_LIGHT),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return [box, sp(0.5)]


def _section_acceptable(parts: List[Dict[str, Any]]) -> List[Any]:
    """USZKODZENIA AKCEPTOWALNE — compact one-row-per-damage table."""
    if not parts:
        return []
    fn, fnb = _fn()
    header = [
        pc("#",                True, color=colors.white),
        pc("Część",             True, color=colors.white),
        pc("Typ uszkodzenia",   True, color=colors.white),
        pc("Status",            True, color=colors.white),
    ]
    rows: List[List[Any]] = [header]
    for i, part in enumerate(parts, 1):
        idx = part.get("index") or i
        rows.append([
            pc(str(idx)),
            p(_or_dash(part.get("czesc"))),
            p(_or_dash(part.get("typ"))),
            pc("Bez kosztu", color=GRAY_MUTED),
        ])
    col = CONTENT_W
    t = Table(
        rows,
        colWidths=[col * 0.08, col * 0.32, col * 0.45, col * 0.15],
    )
    t.setStyle(_data_ts(header_rows=1, rows=len(rows) - 1))
    return [
        _section_header("Uszkodzenia akceptowalne (bez kosztu)"),
        sp(0.15),
        t,
        sp(0.5),
    ]


# ─── Orchestrator ────────────────────────────────────────────────────────────

def build_kosztorys_pdf(costs: Dict[str, Any], eurotax: Optional[Dict[str, Any]] = None) -> bytes:
    """
    Build the Kosztorys napraw PDF from the saved KosztorysCost JSON
    (MacadamData shape). The optional `eurotax` argument is reserved for
    a future Phase that embeds the raw Eurotax detail section — not used
    in v1 (TODO).

    Never raises on legacy/incomplete saved data — missing fields render
    as "—"; empty groups skip their headings.
    """
    if eurotax is not None:
        # Reserved for a future phase — Blacharz / Lakiernik tables.
        logger.info("[Kosztorys PDF] eurotax payload ignored in v1")

    buf = io.BytesIO()
    deal_id = costs.get("deal_id")
    order_no = str(deal_id) if deal_id is not None else ""
    date = _str((costs.get("vehicle") or {}).get("inspection_date"))

    # Split parts into the two groups the on-screen report uses.
    all_parts = costs.get("parts") or []
    above_norm = [p for p in all_parts if (p.get("qualification") or "") != "akceptowalne"]
    acceptable = [p for p in all_parts if (p.get("qualification") or "") == "akceptowalne"]

    # Totals — trust stored totals when present; fall back to inline sum.
    totals = costs.get("totals") or {}
    material = float(costs.get("koszt_materialu_pln") or 0.0)
    netto = totals.get("netto_pln")
    if netto is None:
        netto = sum(float(p.get("koszt_netto_pln") or 0.0) for p in above_norm) + material
    gross = totals.get("gross_pln")
    if gross is None:
        gross = float(netto or 0.0) * 1.23
    netto = float(netto or 0.0)
    gross = float(gross or 0.0)
    vat = gross - netto

    # Shared header/footer (same renderer as wycena PDF, different title).
    def _on_page(canv, doc):
        _draw_page_frame(canv, doc,
                         title="Kosztorys napraw",
                         order_no=order_no,
                         date=date)

    doc = BaseDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=MARGIN_LR, rightMargin=MARGIN_LR,
        topMargin=MARGIN_T, bottomMargin=MARGIN_B,
        title=f"Kosztorys napraw — {order_no or 'pojazd'}",
        author="Zaufaj Rzeczoznawcy Sp. z o.o.",
    )
    frame = Frame(
        doc.leftMargin, doc.bottomMargin,
        doc.width, doc.height,
        leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
        id="content",
    )
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=_on_page)])

    story: List[Any] = []

    # ── Title strip (red underline; mirrors wycena's title block).
    fn, fnb = _fn()
    title_cell = Table(
        [[p("Kosztorys napraw",
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

    # ── Order summary strip (deal, klient, vehicle, date).
    veh = costs.get("vehicle") or {}
    klient = _or_dash(veh.get("klient"))
    make_model = _or_dash(veh.get("make_model"))
    plate = _or_dash(veh.get("registration_plate"))
    summary_rows = [
        [pb("Numer zlecenia", color=NAVY), p(order_no or "Brak"),
         pb("Klient",          color=NAVY), p(klient)],
        [pb("Pojazd",          color=NAVY), p(make_model),
         pb("Rejestracja",     color=NAVY), p(plate)],
        [pb("Data inspekcji",  color=NAVY), p(date or "Brak danych"),
         pb("VIN",             color=NAVY), p(_or_dash(veh.get("vin")))],
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

    # ── Pre-fetch every photo in parallel via the internal localhost
    # base BEFORE assembling the story. Sequential per-card fetches
    # against the public URL previously stacked to 2+ minutes (504).
    photo_cache = _prefetch_photos(above_norm)

    # ── Sections.
    story.extend(_section_vehicle(costs))
    story.extend(_section_order_params(costs))
    story.extend(_section_above_norm(above_norm, photo_cache))
    story.extend(_section_material_row(material))
    story.extend(_section_summary(netto, vat, gross))
    story.extend(_section_acceptable(acceptable))

    # ── (TODO Phase D) Embed Eurotax detail — Blacharz / Pr.dodatkowe /
    # Lakiernik tables + Podsumowanie. Skipped in v1: wiring the eurotax
    # parser output into the PDF needs an additional GET against
    # /api/kosztorys/{id} from the router; the manager's priority for
    # this build was the damage view + summary, which is delivered above.

    doc.build(story)
    return buf.getvalue()
