"""
Kosztorys Costs Router
======================
Above-norm damage cost layer stored in DB, edited by admin, rendered
inline within the public report at /kosztorys/{deal_id}.

GET  /api/kosztorys-costs/{deal_id}  — public:
    returns the saved cost data if present, else an empty skeleton
    pre-filled from /api/report (vehicle header + hero photo). Always
    includes `available_damages` (full exterior + interior damages
    from inspection, URLs only) so the editor can offer them for
    selection.

PUT  /api/kosztorys-costs/{deal_id}  — admin:
    UPSERT a costs payload. Each part must have a non-empty `czesc`.
    Cost fields may be null (admin can save partial work).

Costs are never auto-filled. The endpoint never fabricates numbers —
parts start with cost fields = null until an admin enters them.

The wire shape stays MacadamData-compatible (types/kosztorysMacadam.ts)
so the existing types + editor logic carry over unchanged.
"""

import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from deps import require_admin
from models.inspector import KosztorysCost

router = APIRouter(prefix="/kosztorys-costs", tags=["Kosztorys Costs"])
logger = logging.getLogger("routers.kosztorys_costs")


# ─── Pydantic models — wire shape for PUT ─────────────────────────────────────

class MacadamVehicleHeaderIn(BaseModel):
    make_model:         str = ""
    variant:            str = ""
    vin:                str = ""
    registration_plate: str = ""
    grupa:              str = ""
    mileage_km:         Optional[int] = None
    first_registration: str = ""
    body_colour:        str = ""
    klient:             str = ""
    inspection_date:    str = ""
    inspection_address: str = ""
    main_photo_url:     Optional[str] = None


class MacadamPartIn(BaseModel):
    id:                    str
    index:                 int
    location:              str  # 'interior' | 'exterior'
    czesc:                 str
    typ:                   str = ""
    tryb_naprawy:          str = ""

    # Cost-engine inputs.
    qualification:         str = ""    # '' | lakierowanie | naprawa | wymiana | akceptowalne
    repair_time_h:         Optional[float] = None
    parts_cost_pln:        Optional[float] = None
    is_manual:             bool = False
    # Per-part depreciation toggle. Default True so older saved parts without
    # the field depreciate exactly as before; False ⇒ this part gets NO depreciation.
    apply_depreciation:    bool = True

    # Computed (recomputed server-side on PUT — client values ignored).
    koszty_naprawy_pln:    Optional[float] = None
    koszt_amortyzacji_pln: Optional[float] = None
    koszt_netto_pln:       Optional[float] = None
    photos:                List[str] = Field(default_factory=list)


class MacadamTotalsIn(BaseModel):
    koszty_naprawy_pln: float = 0
    amortyzacja_pln:    float = 0
    netto_pln:          float = 0
    gross_pln:          float = 0   # netto × 1.23


class MacadamDataIn(BaseModel):
    vehicle: MacadamVehicleHeaderIn
    parts:   List[MacadamPartIn] = Field(default_factory=list)
    totals:  Optional[MacadamTotalsIn] = None

    # Order-level cost-engine parameters.
    labour_rate_pln_per_h: Optional[float] = None
    depreciation_pct:      Optional[float] = None   # 0..100
    # Material + small parts — single manual figure, NOT depreciated.
    koszt_materialu_pln:   Optional[float] = None


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _empty_skeleton(deal_id: int) -> Dict[str, Any]:
    """Bare-minimum MacadamData when /api/report can't be reached."""
    return {
        "vehicle": {
            "make_model":         "",
            "variant":            "",
            "vin":                "",
            "registration_plate": "",
            "grupa":              "",
            "mileage_km":         None,
            "first_registration": "",
            "body_colour":        "",
            "klient":             "",
            "inspection_date":    "",
            "inspection_address": "",
            "main_photo_url":     None,
        },
        "parts": [],
        "totals": None,
        "labour_rate_pln_per_h": None,
        "depreciation_pct":      None,
        "koszt_materialu_pln":   None,
    }


# ─── Cost engine — single source of truth ─────────────────────────────────────

VALID_QUAL = {"", "lakierowanie", "naprawa", "wymiana", "akceptowalne"}


def _r2(n: float) -> float:
    """Round to 2 decimals (groszy)."""
    return round(n + 0.0, 2)


def _compute_part_costs(
    part: Dict[str, Any],
    rate_per_h: Optional[float],
    depr_pct: Optional[float],
) -> Dict[str, float]:
    """Apply the calculation rules:
      labour = repair_time_h × rate
      akceptowalne → all 0
      naprawa / lakierowanie → naprawy=labour, amort=labour×d, netto=labour×(1-d)
      wymiana               → naprawy=labour+parts, amort=labour×d, netto=labour×(1-d)+parts
      is_manual             → fixed = parts_cost_pln, treated like labour for depreciation:
                              naprawy=fixed, amort=fixed×d, netto=fixed×(1-d)
    Missing inputs default to 0 (no fabrication).
    """
    rate = float(rate_per_h or 0.0)
    # Per-part toggle: apply_depreciation False ⇒ no depreciation for this part
    # (mirrors frontend computePartCosts effD). Default/absent ⇒ ON.
    d    = 0.0 if part.get("apply_depreciation") is False else float(depr_pct or 0.0) / 100.0
    time = float(part.get("repair_time_h") or 0.0)
    parts_cost = float(part.get("parts_cost_pln") or 0.0)
    is_manual  = bool(part.get("is_manual"))
    qual       = part.get("qualification") or ""

    if is_manual:
        fixed = parts_cost
        return {
            "koszty_naprawy_pln":    _r2(fixed),
            "koszt_amortyzacji_pln": _r2(fixed * d),
            "koszt_netto_pln":       _r2(fixed * (1 - d)),
        }

    if qual == "akceptowalne":
        return {"koszty_naprawy_pln": 0.0, "koszt_amortyzacji_pln": 0.0, "koszt_netto_pln": 0.0}

    labour = time * rate

    if qual == "wymiana":
        return {
            "koszty_naprawy_pln":    _r2(labour + parts_cost),
            "koszt_amortyzacji_pln": _r2(labour * d),
            "koszt_netto_pln":       _r2(labour * (1 - d) + parts_cost),
        }

    if qual in ("naprawa", "lakierowanie"):
        return {
            "koszty_naprawy_pln":    _r2(labour),
            "koszt_amortyzacji_pln": _r2(labour * d),
            "koszt_netto_pln":       _r2(labour * (1 - d)),
        }

    # Empty qualification → nothing to compute.
    return {"koszty_naprawy_pln": 0.0, "koszt_amortyzacji_pln": 0.0, "koszt_netto_pln": 0.0}


def _recompute(data: Dict[str, Any]) -> Dict[str, Any]:
    """Recompute every part's cost fields + totals from the cost-engine
    inputs. Mutates and returns the dict. Backend is the source of truth
    — any cost numbers the client sent are overwritten here."""
    rate = data.get("labour_rate_pln_per_h")
    depr = data.get("depreciation_pct")
    parts = data.get("parts") or []

    total_k = total_a = total_n = 0.0
    for p in parts:
        c = _compute_part_costs(p, rate, depr)
        p["koszty_naprawy_pln"]    = c["koszty_naprawy_pln"]
        p["koszt_amortyzacji_pln"] = c["koszt_amortyzacji_pln"]
        p["koszt_netto_pln"]       = c["koszt_netto_pln"]
        total_k += c["koszty_naprawy_pln"]
        total_a += c["koszt_amortyzacji_pln"]
        total_n += c["koszt_netto_pln"]

    # Material + small parts — single manual figure added after the
    # per-part sum, with NO depreciation. Flows straight into net (and
    # therefore VAT). Also rolled into koszty_naprawy_pln so the
    # "total cost" headline matches netto + amortyzacja accounting.
    material = float(data.get("koszt_materialu_pln") or 0.0)
    total_n += material
    total_k += material

    data["totals"] = {
        "koszty_naprawy_pln": _r2(total_k),
        "amortyzacja_pln":    _r2(total_a),
        "netto_pln":          _r2(total_n),
        "gross_pln":          _r2(total_n * 1.23),
    }
    return data


def _to_int_or_none(v: Any) -> Optional[int]:
    if v is None or v == "":
        return None
    try:
        # mileage may arrive as "24917" or "24 917" or 24917
        if isinstance(v, str):
            return int("".join(c for c in v if c.isdigit()) or "0") or None
        return int(v)
    except (TypeError, ValueError):
        return None


def _vehicle_from_report(report: Dict[str, Any]) -> Dict[str, Any]:
    """Project the /api/report payload into the Macadam vehicle header
    fields. Anything missing stays empty/None — never fabricated."""
    veh = report.get("vehicle") or {}
    make  = str(veh.get("make") or "").strip()
    model = str(veh.get("model") or "").strip()
    make_model = f"{make} {model}".strip()
    return {
        "make_model":         make_model,
        "variant":            "",
        "vin":                str(veh.get("vin") or ""),
        "registration_plate": str(veh.get("registration_plate") or ""),
        "grupa":              "",
        "mileage_km":         _to_int_or_none(veh.get("mileage")),
        "first_registration": str(veh.get("year") or ""),
        "body_colour":        str(veh.get("color") or ""),
        "klient":             str(report.get("client_name") or ""),
        "inspection_date":    str(report.get("inspection_date") or ""),
        "inspection_address": str(report.get("inspection_place") or ""),
        "main_photo_url":     report.get("hero_photo_url"),
    }


def _available_damages_from_report(report: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Combine exterior + interior damages from /api/report into a single
    list, tagged with source so the editor can default the part's
    location toggle correctly."""
    out: List[Dict[str, Any]] = []
    for source_label, key in (("ext", "damages"), ("int", "interior_damages")):
        for d in report.get(key) or []:
            if not isinstance(d, dict):
                continue
            out.append({
                "source":      source_label,
                "index":       d.get("index"),
                "location":    d.get("location") or "",
                "type":        d.get("type") or "",
                "size":        d.get("size") or "",
                "description": d.get("description") or "",
                "photo_urls":  list(d.get("photo_urls") or []),
            })
    return out


async def _fetch_report(deal_id: int, request: Request) -> Optional[Dict[str, Any]]:
    """Call the conditional report endpoint in-process to source the
    skeleton vehicle header + available damages. Returns None on any
    failure — caller falls back to a fully-empty skeleton."""
    try:
        from routers.report import get_report  # lazy import to avoid cycle
        result = await get_report(deal_id, request)
        if isinstance(result, dict):
            return result
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"[kosztorys-costs] /api/report fetch for deal {deal_id} failed: {e}")
    return None


# ─── GET — public renderer + admin editor ─────────────────────────────────────

@router.get("/{deal_id}")
async def get_costs(
    deal_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    saved: Optional[Dict[str, Any]] = None
    row = db.query(KosztorysCost).filter(KosztorysCost.deal_id == deal_id).first()
    if row and row.data_json:
        try:
            parsed = json.loads(row.data_json)
            if isinstance(parsed, dict):
                saved = parsed
        except (TypeError, ValueError) as e:
            logger.warning(f"[kosztorys-costs] deal {deal_id}: stored JSON unparseable ({e})")

    report = await _fetch_report(deal_id, request)
    available_damages = _available_damages_from_report(report) if report else []

    if saved is not None:
        # Always pair saved data with fresh available_damages so the editor
        # can keep adding selections after the first save.
        return {
            "vehicle": saved.get("vehicle") or _empty_skeleton(deal_id)["vehicle"],
            "parts":   saved.get("parts") or [],
            "totals":  saved.get("totals"),
            "labour_rate_pln_per_h": saved.get("labour_rate_pln_per_h"),
            "depreciation_pct":     saved.get("depreciation_pct"),
            "koszt_materialu_pln":  saved.get("koszt_materialu_pln"),
            "available_damages":    available_damages,
        }

    skeleton = _empty_skeleton(deal_id)
    if report:
        skeleton["vehicle"] = _vehicle_from_report(report)
    skeleton["available_damages"] = available_damages
    return skeleton


# ─── PUT — admin only ─────────────────────────────────────────────────────────

@router.put("/{deal_id}")
async def put_costs(
    deal_id: int,
    payload: MacadamDataIn,
    db: Session = Depends(get_db),
    _user: dict = Depends(require_admin),
):
    # Per-part validation — czesc is mandatory; costs may be null.
    for i, part in enumerate(payload.parts):
        if not (part.czesc and part.czesc.strip()):
            raise HTTPException(
                status_code=422,
                detail=f"Part {i} ({part.id}): 'czesc' must be a non-empty string",
            )
        if part.location not in ("interior", "exterior"):
            raise HTTPException(
                status_code=422,
                detail=f"Part {i} ({part.id}): 'location' must be 'interior' or 'exterior'",
            )
        if part.qualification not in VALID_QUAL:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Part {i} ({part.id}): 'qualification' must be one of "
                    f"{sorted(VALID_QUAL)} (got {part.qualification!r})"
                ),
            )

    data = payload.model_dump(mode="json")
    # Backend is source of truth for computed values — recompute every
    # part's cost fields + totals from rate/depr%/qualification/time/parts
    # before persisting. Client-sent cost numbers are overwritten.
    data = _recompute(data)
    serialised = json.dumps(data, ensure_ascii=False)

    row = db.query(KosztorysCost).filter(KosztorysCost.deal_id == deal_id).first()
    if row is None:
        row = KosztorysCost(deal_id=deal_id, data_json=serialised)
        db.add(row)
    else:
        row.data_json = serialised
    db.commit()
    db.refresh(row)

    logger.info(
        f"[kosztorys-costs] deal {deal_id}: saved by admin ({len(payload.parts)} parts, "
        f"{len(serialised)} bytes)"
    )
    return data


# ─── PDF download — public (no auth) ──────────────────────────────────────────

@router.get("/{deal_id}/pdf")
async def get_costs_pdf(deal_id: int, db: Session = Depends(get_db)):
    """Render the saved KosztorysCost row as a downloadable A4 PDF.
    404 if no costs have been saved for this deal yet."""
    row = db.query(KosztorysCost).filter(KosztorysCost.deal_id == deal_id).first()
    if row is None or not row.data_json:
        raise HTTPException(status_code=404, detail="Brak zapisanego kosztorysu")
    try:
        saved = json.loads(row.data_json)
    except (TypeError, ValueError) as e:
        logger.error(f"[kosztorys-costs] deal {deal_id}: stored JSON unparseable ({e})")
        raise HTTPException(status_code=500, detail="Stored kosztorys JSON unparseable")
    if not isinstance(saved, dict):
        raise HTTPException(status_code=500, detail="Stored kosztorys is not an object")

    # Inject deal_id so the PDF header / filename can use it.
    saved["deal_id"] = deal_id

    # Lazy import — avoids pulling reportlab into module-load cost when
    # the PDF endpoint isn't hit.
    from services.kosztorys_pdf import build_kosztorys_pdf
    try:
        pdf_bytes = build_kosztorys_pdf(saved)
    except Exception as e:
        logger.error(f"[kosztorys-costs] deal {deal_id}: PDF build failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"PDF build failed: {e}")

    logger.info(
        f"[kosztorys-costs] deal {deal_id}: served PDF ({len(pdf_bytes)} bytes)"
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="kosztorys_{deal_id}.pdf"',
            "Cache-Control": "no-cache, must-revalidate",
        },
    )
