"""
Macadam Kosztorys Router
========================
Semi-automatic above-norm damage report stored in DB, edited by admin,
rendered by /kosztorys/macadam/{deal_id}.

GET  /api/macadam/{deal_id}  — public:
    returns the saved MacadamData if present, else an empty skeleton
    pre-filled from /api/report (vehicle header + hero photo). Always
    includes `available_damages` (full exterior + interior damages
    from inspection, URLs only) so the editor can offer them for
    selection.

PUT  /api/macadam/{deal_id}  — admin:
    UPSERT a MacadamData payload. Each part must have a non-empty
    `czesc`. Cost fields may be null (admin can save partial work).

Costs are never auto-filled. The endpoint never fabricates numbers —
parts start with cost fields = null until an admin enters them.
"""

import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from deps import require_admin
from models.inspector import MacadamReport

router = APIRouter(prefix="/macadam", tags=["Macadam"])
logger = logging.getLogger("routers.macadam")


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
    koszty_naprawy_pln:    Optional[float] = None
    koszt_amortyzacji_pln: Optional[float] = None
    koszt_netto_pln:       Optional[float] = None
    photos:                List[str] = Field(default_factory=list)


class MacadamTotalsIn(BaseModel):
    koszty_naprawy_pln: float = 0
    amortyzacja_pln:    float = 0
    netto_pln:          float = 0


class MacadamDataIn(BaseModel):
    vehicle: MacadamVehicleHeaderIn
    parts:   List[MacadamPartIn] = Field(default_factory=list)
    totals:  Optional[MacadamTotalsIn] = None


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
    }


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
        logger.warning(f"[macadam] /api/report fetch for deal {deal_id} failed: {e}")
    return None


# ─── GET — public renderer + admin editor ─────────────────────────────────────

@router.get("/{deal_id}")
async def get_macadam(
    deal_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    saved: Optional[Dict[str, Any]] = None
    row = db.query(MacadamReport).filter(MacadamReport.deal_id == deal_id).first()
    if row and row.data_json:
        try:
            parsed = json.loads(row.data_json)
            if isinstance(parsed, dict):
                saved = parsed
        except (TypeError, ValueError) as e:
            logger.warning(f"[macadam] deal {deal_id}: stored JSON unparseable ({e})")

    report = await _fetch_report(deal_id, request)
    available_damages = _available_damages_from_report(report) if report else []

    if saved is not None:
        # Always pair saved data with fresh available_damages so the editor
        # can keep adding selections after the first save.
        return {
            "vehicle": saved.get("vehicle") or _empty_skeleton(deal_id)["vehicle"],
            "parts":   saved.get("parts") or [],
            "totals":  saved.get("totals"),
            "available_damages": available_damages,
        }

    skeleton = _empty_skeleton(deal_id)
    if report:
        skeleton["vehicle"] = _vehicle_from_report(report)
    skeleton["available_damages"] = available_damages
    return skeleton


# ─── PUT — admin only ─────────────────────────────────────────────────────────

@router.put("/{deal_id}")
async def put_macadam(
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

    data = payload.model_dump(mode="json")
    serialised = json.dumps(data, ensure_ascii=False)

    row = db.query(MacadamReport).filter(MacadamReport.deal_id == deal_id).first()
    if row is None:
        row = MacadamReport(deal_id=deal_id, data_json=serialised)
        db.add(row)
    else:
        row.data_json = serialised
    db.commit()
    db.refresh(row)

    logger.info(
        f"[macadam] deal {deal_id}: saved by admin ({len(payload.parts)} parts, "
        f"{len(serialised)} bytes)"
    )
    return data
