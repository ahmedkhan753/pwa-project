"""
Deals Router
============
List and get CRM deal routes for the Calendar View
and inspection resume features.
Filters deals by the logged-in inspector's phone number
using dynamic Bitrix24 list field mapping.
"""

import asyncio
import re
import time
import logging
from typing import Optional
from fastapi import APIRouter, Request, HTTPException, Query, Depends
from sqlalchemy.orm import Session

from deps import get_current_user
from database import get_db
from models.inspector import Inspector, InspectorNotification
from services.bitrix_discovery import discovery

router = APIRouter(prefix="/deals", tags=["Deals"])
logger = logging.getLogger("routers.deals")


# Self-heal: if startup's discovery.initialize failed (DNS/network flake),
# app.state.bitrix_ready stays False forever and /deals returns empty until
# someone restarts the backend. Trying initialize again here whenever
# bitrix_ready is False recovers automatically as soon as Bitrix is reachable.
# _reinit_lock serialises concurrent attempts so a burst of /deals requests
# during recovery only fires one initialize.
_reinit_lock = asyncio.Lock()


async def _ensure_bitrix_ready(request: Request) -> bool:
    """Return True iff the Bitrix integration is usable. If startup left
    bitrix_ready=False, attempt a single lazy discovery.initialize under
    a module-level lock (other concurrent callers wait for the result).
    Returns False only when the lazy reinit also fails — the caller then
    falls back to the existing degraded-mode response."""
    if getattr(request.app.state, "bitrix_ready", False):
        return True
    gateway = getattr(request.app.state, "gateway", None)
    if gateway is None:
        return False
    async with _reinit_lock:
        # Re-check inside the lock — another request may have just initialised.
        if getattr(request.app.state, "bitrix_ready", False):
            return True
        try:
            logger.info("[deals] bitrix_ready=False — attempting lazy discovery re-init")
            await discovery.initialize(gateway.call)
            request.app.state.bitrix_ready = True
            logger.info(
                f"[deals] ✓ Lazy discovery re-init succeeded "
                f"({discovery.get_mapped_count()} fields mapped)"
            )
            return True
        except Exception as e:
            logger.warning(f"[deals] Lazy discovery re-init failed: {e}")
            return False


def _enum_label(field_id: str, value) -> str:
    """
    Convert a raw Bitrix enum ID (e.g. "316") to its human label ("DIESEL") using
    the discovery schema. Passes through plain strings unchanged. Without this the
    frontend dropdown shows the numeric ID as the selected value — the inspector
    sees "316" instead of "DIESEL" in the input form.
    """
    if value in (None, "", 0, "0"):
        return ""
    sval = str(value).strip()
    if not sval or not field_id:
        return sval
    schema = discovery.get_field_schema(field_id) or {}
    items = schema.get("items") or []
    if not items:
        return sval
    for item in items:
        if str(item.get("ID", "")) == sval:
            return str(item.get("VALUE", "")) or sval
    return sval  # already a label or unknown ID — pass through

# ── Stage → Status mapping ──
STAGE_STATUS_MAP = {
    "NEW":                  "new",
    "PREPARATION":          "assigned",
    "PREPAYMENT_INVOICE":   "scheduled",
    "UC_0T9W8E":            "completed",
    "EXECUTING":            "in_valuation",
    "WON":                  "closed",
    "LOSE":                 "lost",
}

# ── Dynamic inspector phone → Bitrix list ID cache ──
_inspector_list_cache: dict = {}
_cache_timestamp: float = 0
CACHE_TTL = 300  # 5 minutes


def invalidate_inspector_cache() -> None:
    """Force next call to get_phone_to_bitrix_id to re-fetch from Bitrix."""
    global _inspector_list_cache, _cache_timestamp
    _inspector_list_cache = {}
    _cache_timestamp = 0


async def get_phone_to_bitrix_id(gateway) -> dict:
    """
    Fetches the Bitrix24 list field UF_CRM_1773970466449 to build
    a mapping of phone numbers → Bitrix list item IDs.
    Cached for 5 minutes.
    
    Bitrix returns enumeration items as:
      {"ID": "968", "VALUE": "790469341"}
    where VALUE = phone number, ID = internal list value for filtering.
    """
    global _inspector_list_cache, _cache_timestamp

    if _inspector_list_cache and (time.time() - _cache_timestamp) < CACHE_TTL:
        return _inspector_list_cache

    try:
        fields = await gateway.call("crm.deal.fields", {})
        field_data = fields.get("UF_CRM_1773970466449", {})

        # Log raw field data to see exact structure
        logger.info(f"Raw inspector field data: {field_data}")

        # Bitrix returns lowercase 'items' for enumeration fields
        items = field_data.get("items", field_data.get("ITEMS", []))

        mapping = {}
        for item in items:
            # VALUE = phone number string, ID = internal Bitrix list value
            value = str(item.get("VALUE", "")).strip()
            item_id = str(item.get("ID", "")).strip()

            if value and item_id:
                # Extract digits (phone number) from the VALUE
                phones = re.findall(r'\d{7,15}', value)
                if phones:
                    mapping[phones[0]] = item_id
                    logger.info(f"Mapped phone {phones[0]} → Bitrix ID {item_id}")

        if mapping:
            _inspector_list_cache = mapping
            _cache_timestamp = time.time()
            logger.info(f"✅ Inspector map: {mapping}")
        else:
            # Fallback — log everything to debug
            logger.warning(f"Empty mapping! Raw items: {items}")
            logger.warning(f"Full field data keys: {list(field_data.keys())}")

        return mapping

    except Exception as e:
        logger.error(f"Failed to fetch inspector list: {e}")
        return _inspector_list_cache


def _inject_status(deal: dict) -> dict:
    """Add status and stageId fields to a deal dict based on STAGE_ID."""
    stage_id = deal.get("STAGE_ID") or deal.get("stage_id") or deal.get("stageId") or "NEW"
    deal["status"] = STAGE_STATUS_MAP.get(stage_id, "new")
    deal["stageId"] = stage_id
    return deal


@router.get("")
async def get_deals(
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
    user_id: Optional[int] = Query(None, description="Bitrix24 user ID"),
    date_from: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    status: Optional[str] = Query(None, description="Deal stage filter"),
):
    """
    GET /deals
    Returns list of inspections filtered by the current inspector's phone.
    Uses dynamic Bitrix list field mapping to resolve phone → list item ID.
    Also sends email notification for newly assigned (unnotified) deals.
    """
    gateway = request.app.state.gateway

    if not await _ensure_bitrix_ready(request):
        logger.warning("Bitrix not ready — returning empty deal list")
        return {"scheduled": [], "unscheduled": [], "total_in_bitrix": 0, "total_returned": 0}

    inspector_phone = current_user.get("phone", "")
    logger.info(f"Fetching deals for inspector phone: {inspector_phone}")

    try:
        # Build Bitrix filter
        filter_params = {
            "STAGE_ID": ["NEW", "PREPARATION", "PREPAYMENT_INVOICE",
                         "UC_0T9W8E", "EXECUTING", "WON", "LOSE"],
        }

        # Resolve phone → Bitrix list item ID for filtering
        if inspector_phone:
            phone_map = await get_phone_to_bitrix_id(gateway)
            bitrix_id = phone_map.get(inspector_phone)

            if bitrix_id:
                filter_params["UF_CRM_1773970466449"] = bitrix_id
                logger.info(f"Filtering by Bitrix list ID: {bitrix_id} (phone: {inspector_phone})")
            else:
                # Fallback: try raw phone filter on UF_CRM_1773961369947
                filter_params["UF_CRM_1773961369947"] = inspector_phone
                logger.warning(f"No Bitrix list ID found for phone {inspector_phone} — using raw phone filter")

        # Direct Bitrix API call with filter
        # NOTE: crm.deal.list does NOT support UF_CRM_* wildcard — must list fields explicitly
        # Field IDs verified from Bitrix24 HTML inspection on 2026-03-23
        deals_raw = await gateway.call("crm.deal.list", {
            "filter": filter_params,
            "select": [
                "ID", "TITLE", "STAGE_ID", "DATE_CREATE", "BEGINDATE",
                "CLOSEDATE", "ASSIGNED_BY_ID", "CATEGORY_ID", "COMMENTS",
                "UF_CRM_1773970466449",   # inspector contact
                "UF_CRM_1766058185504",   # inspection location
                "UF_CRM_1766058194337",   # inspection address
                "UF_CRM_1766058247125",   # contact phone
                "UF_CRM_1766058259960",   # contact person
                "UF_CRM_1766057839684",   # vehicle brand
                "UF_CRM_1766057849818",   # vehicle model
                "UF_CRM_1766057515315",   # plates
                "UF_CRM_1772108256983",   # scheduled inspection date
                "UF_CRM_1766057874704",   # client notes
            ],
            "order": {"DATE_CREATE": "DESC"}
        })

        # Transform each deal
        result = []
        for deal in deals_raw:
            result_deal = {
                "id": str(deal.get("ID", "")), # frontend fallback 
                "ID": deal.get("ID"),
                "TITLE": deal.get("TITLE"),
                "STAGE_ID": deal.get("STAGE_ID"),
                "DATE_CREATE": deal.get("DATE_CREATE"),
                "BEGINDATE": deal.get("BEGINDATE"),
                "status": STAGE_STATUS_MAP.get(deal.get("STAGE_ID"), "new"),
                "stageId": deal.get("STAGE_ID"),
                # CORRECT FIELD NAMES FOR FRONTEND:
                "inspectionAddress": (
                    deal.get("UF_CRM_1766058185504") or
                    deal.get("UF_CRM_1766058194337") or ""
                ),
                "contactPhone": deal.get("UF_CRM_1766058247125") or "",
                "contactPerson": deal.get("UF_CRM_1766058259960") or "",
                "vehicle_brand": deal.get("UF_CRM_1766057839684") or "",
                "vehicle_model": deal.get("UF_CRM_1766057849818") or "",
                "registration_number": deal.get("UF_CRM_1766057515315") or "",
                "scheduled_date": deal.get("UF_CRM_1772108256983") or "",
                "notes": deal.get("UF_CRM_1766057874704") or deal.get("COMMENTS") or "",
                
                # Extras from Bitrix 
                "CLOSEDATE": deal.get("CLOSEDATE"),
                "ASSIGNED_BY_ID": deal.get("ASSIGNED_BY_ID"),
                "CATEGORY_ID": deal.get("CATEGORY_ID"),
            }

            result.append(result_deal)

        logger.info(f"Found {len(result)} deals for phone {inspector_phone}")

        # ── Auto-notify disabled — webhook handles notifications now ──
        # Keeping duplicate-prevention records for the webhook to use.
        # See /webhook/bitrix endpoint in routers/webhook.py

        # Return consistent dict structure
        return {
            "scheduled": result,
            "unscheduled": [],
            "total_in_bitrix": len(result),
            "total_returned": len(result),
        }

    except Exception as e:
        logger.error(f"Error fetching deals: {e}")
        raise HTTPException(status_code=502, detail=str(e))


async def _notify_inspector_new_order(deal: dict, inspector_phone: str, db):
    """Background task: send email for newly assigned deal."""
    try:
        from services.email_service import send_assignment_email

        inspector = db.query(Inspector).filter(
            Inspector.phone == inspector_phone,
            Inspector.is_active == True,
        ).first()

        if not inspector or not inspector.email:
            logger.warning(f"[Notify] No email for {inspector_phone}")
            return

        await send_assignment_email(
            inspector_name=inspector.name,
            inspector_email=inspector.email,
            order_title=deal.get("TITLE", ""),
            order_id=str(deal.get("ID", "")),
            client_name=deal.get("UF_CRM_1766057964319", ""),
            inspection_address=deal.get("UF_CRM_1766058185504", ""),
            inspection_date=deal.get("UF_CRM_1772108256983", "Nie ustalono"),
            vehicle_make=deal.get("UF_CRM_1766057839684") or deal.get("vehicle_brand") or "",
            vehicle_model=deal.get("UF_CRM_1766057849818") or deal.get("vehicle_model") or "",
            registration_plates=deal.get("UF_CRM_1766057515315") or deal.get("registration_number") or "",
        )
        logger.info(f"📧 New order email sent to {inspector.email} for deal {deal.get('ID')}")

    except Exception as e:
        logger.error(f"[Notify] Email failed for deal {deal.get('ID')}: {e}")


@router.get("/{deal_id}")
async def get_deal(request: Request, deal_id: int):
    """
    GET /deals/{deal_id}
    Returns single deal with all fields translated back to PWA keys.
    """
    gateway = request.app.state.gateway

    if not await _ensure_bitrix_ready(request):
        raise HTTPException(
            status_code=503,
            detail="Bitrix24 integration not ready",
        )

    try:
        deal = await gateway.get_deal(deal_id=deal_id)

        # Inject status from stage_id (system fields are lowercased by transform_from_bitrix)
        stage_id = deal.get("stage_id") or deal.get("STAGE_ID") or "NEW"
        deal["status"] = STAGE_STATUS_MAP.get(stage_id.upper() if stage_id else "NEW", "new")

        # Add uppercase aliases so both old and new page code works
        deal.setdefault("TITLE", deal.get("title", ""))
        deal.setdefault("DATE_CREATE", deal.get("date_create", ""))

        # Normalize address/contact fields — read directly from UF_CRM IDs
        # (transformer maps UF_CRM_1766058194337 → planned_address; contact fields have no mapping)
        try:
            raw_crm = await gateway.call("crm.deal.get", {
                "ID": deal_id,
                "select": [
                    "UF_CRM_1766058194337",  # address
                    "UF_CRM_1766058259960",  # contact person
                    "UF_CRM_1766058247125",  # contact phone
                    "UF_CRM_1766057539531",  # VIN
                    "UF_CRM_1766057515315",  # registration plates
                    "UF_CRM_1766057839684",  # vehicle brand
                    "UF_CRM_1766057849818",  # vehicle model
                    "UF_CRM_1766057572300",  # production year
                    "UF_CRM_1772534309693",  # mileage
                    "UF_CRM_1772534410706",  # vehicle color
                    "UF_CRM_1772534081105",  # engine capacity
                    "UF_CRM_1772534094039",  # engine power
                    "UF_CRM_1772534193",     # fuel type
                    "UF_CRM_1772796562336",  # body type
                    "UF_CRM_1772796772039",  # gearbox type
                    "UF_CRM_1772534384484",  # drive type
                    "UF_CRM_1766057874704",  # client notes
                ]
            })
            deal["inspectionAddress"] = (raw_crm.get("UF_CRM_1766058194337")
                                          or deal.get("planned_address")
                                          or deal.get("inspection_place") or "")
            deal["contactPerson"] = raw_crm.get("UF_CRM_1766058259960") or deal.get("contact_person") or ""
            deal["contactPhone"] = raw_crm.get("UF_CRM_1766058247125") or deal.get("contact_phone") or ""
            # VIN and plates — direct read bypasses reverse mapping collision
            vin_raw = raw_crm.get("UF_CRM_1766057539531") or ""
            if str(vin_raw).strip() not in ("0", "None", ""):
                deal["vin"] = str(vin_raw).strip()
            deal.setdefault("vin", "")
            deal["registration_number"] = raw_crm.get("UF_CRM_1766057515315") or deal.get("registration_number") or ""
            # Vehicle fields — direct mapping to avoid reverse-map collision
            deal["vehicle_brand"] = raw_crm.get("UF_CRM_1766057839684") or deal.get("vehicle_brand") or deal.get("make") or ""
            deal["vehicle_model"] = raw_crm.get("UF_CRM_1766057849818") or deal.get("vehicle_model") or deal.get("model") or ""
            deal["production_year"] = raw_crm.get("UF_CRM_1766057572300") or deal.get("production_year") or deal.get("year") or ""
            deal["mileage"] = raw_crm.get("UF_CRM_1772534309693") or deal.get("mileage") or ""
            deal["vehicle_color"] = raw_crm.get("UF_CRM_1772534410706") or deal.get("vehicle_color") or deal.get("color") or ""
            deal["engine_capacity"] = raw_crm.get("UF_CRM_1772534081105") or deal.get("engine_capacity") or deal.get("engineCapacity") or ""
            deal["engine_power"] = raw_crm.get("UF_CRM_1772534094039") or deal.get("engine_power") or deal.get("enginePower") or ""
            deal["fuel_type"]    = _enum_label("UF_CRM_1772534193",    raw_crm.get("UF_CRM_1772534193"))    or deal.get("fuel_type") or ""
            deal["body_type"]    = _enum_label("UF_CRM_1772796562336", raw_crm.get("UF_CRM_1772796562336")) or deal.get("body_type") or ""
            deal["gearbox_type"] = _enum_label("UF_CRM_1772796772039", raw_crm.get("UF_CRM_1772796772039")) or deal.get("gearbox_type") or ""
            deal["drive_type"]   = _enum_label("UF_CRM_1772534384484", raw_crm.get("UF_CRM_1772534384484")) or deal.get("drive_type") or ""
            deal["notes"] = raw_crm.get("UF_CRM_1766057874704") or deal.get("COMMENTS") or ""
        except Exception:
            deal.setdefault("inspectionAddress", deal.get("planned_address") or deal.get("inspection_place") or "")
            deal.setdefault("contactPerson", deal.get("contact_person") or "")
            deal.setdefault("contactPhone", deal.get("contact_phone") or "")
            deal.setdefault("vin", "")
            deal.setdefault("registration_number", "")
            deal.setdefault("vehicle_brand", deal.get("make") or "")
            deal.setdefault("vehicle_model", deal.get("model") or "")
            deal.setdefault("production_year", deal.get("year") or "")
            deal.setdefault("mileage", "")
            deal.setdefault("vehicle_color", deal.get("color") or "")
            deal.setdefault("engine_capacity", deal.get("engineCapacity") or "")
            deal.setdefault("engine_power", deal.get("enginePower") or "")

        # Ensure inspection date fields are present
        date_val = deal.get("inspection_date", "") or deal.get("scheduled_date", "")
        deal.setdefault("inspection_date", date_val)
        deal.setdefault("scheduled_date", date_val)

        return deal
    except Exception as e:
        logger.error(f"Error fetching deal {deal_id}: {e}")
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/debug/{deal_id}")
async def debug_deal(request: Request, deal_id: int):
    """
    GET /deals/debug/{deal_id}
    Returns raw Bitrix deal fields for debugging — no auth required.
    """
    gateway = request.app.state.gateway
    try:
        raw = await gateway.call("crm.deal.get", {"ID": deal_id, "select": ["*", "UF_*"]})
        # Extract the fields we care about — verified from Bitrix HTML
        address_fields = {
            "UF_CRM_1766058185504 (Planned inspection site)": raw.get("UF_CRM_1766058185504"),
            "UF_CRM_1766058194337 (Planned viewing address)": raw.get("UF_CRM_1766058194337"),
            "UF_CRM_1766058009838 (Town)": raw.get("UF_CRM_1766058009838"),
            "UF_CRM_1766058028123 (Street)": raw.get("UF_CRM_1766058028123"),
        }
        contact_fields = {
            "UF_CRM_1766058247125 (Contact person phone)": raw.get("UF_CRM_1766058247125"),
            "UF_CRM_1766058259960 (Contact person name)": raw.get("UF_CRM_1766058259960"),
            "UF_CRM_1766058053224 (Client phone)": raw.get("UF_CRM_1766058053224"),
            "UF_CRM_1766057941327 (Client first name)": raw.get("UF_CRM_1766057941327"),
            "UF_CRM_1766057951060 (Client last name)": raw.get("UF_CRM_1766057951060"),
        }
        vehicle_fields = {
            "UF_CRM_1766057839684 (Brand)": raw.get("UF_CRM_1766057839684"),
            "UF_CRM_1766057849818 (Model)": raw.get("UF_CRM_1766057849818"),
            "UF_CRM_1766057515315 (Plates)": raw.get("UF_CRM_1766057515315"),
        }
        return {
            "deal_id": deal_id,
            "title": raw.get("TITLE"),
            "stage": raw.get("STAGE_ID"),
            "address_fields": address_fields,
            "contact_fields": contact_fields,
            "vehicle_fields": vehicle_fields,
            "all_UF_keys": sorted([k for k in raw.keys() if k.startswith("UF_")]),
        }
    except Exception as e:
        return {"error": str(e)}


@router.patch("/{deal_id}/schedule")
async def schedule_deal(
    deal_id: int,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    PATCH /deals/{deal_id}/schedule
    Updates the planned inspection date and transitions deal stage.
    """
    gateway = request.app.state.gateway

    body = await request.json()
    scheduled_datetime = body.get("scheduled_datetime")

    logger.info(f"Schedule called — deal_id: {deal_id}")
    logger.info(f"current_user: {current_user}")

    schedule_payload = {
        "id": deal_id,
        "fields": {
            "UF_CRM_1772108256983": scheduled_datetime,  # inspection date
            "STAGE_ID": "PREPAYMENT_INVOICE",             # confirmed correct stage
            "UF_CRM_1771579888": 1,                       # Mateusz Chłodek user ID
        }
    }
    logger.info(f"Updating deal {deal_id} for scheduling: {schedule_payload['fields']}")
    try:
        result = await gateway.call("crm.deal.update", schedule_payload)
        logger.info(f"Bitrix update result: {result}")
        return {"success": True, "result": result}
    except Exception as e:
        logger.error(f"Scheduling failed for deal {deal_id}: {e}")
        raise HTTPException(status_code=502, detail=str(e))
