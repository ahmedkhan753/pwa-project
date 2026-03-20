"""
Deals Router
============
List and get CRM deal routes for the Calendar View
and inspection resume features.
Filters deals by the logged-in inspector's phone number
using dynamic Bitrix24 list field mapping.
"""

import re
import time
import logging
from typing import Optional
from fastapi import APIRouter, Request, HTTPException, Query, Depends
from sqlalchemy.orm import Session

from deps import get_current_user
from database import get_db
from models.inspector import Inspector, InspectorNotification

router = APIRouter(prefix="/deals", tags=["Deals"])
logger = logging.getLogger("routers.deals")

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
    bitrix_ready = getattr(request.app.state, "bitrix_ready", False)

    if not bitrix_ready:
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
        deals_raw = await gateway.call("crm.deal.list", {
            "filter": filter_params,
            "select": ["ID", "TITLE", "STAGE_ID", "DATE_CREATE", "BEGINDATE",
                       "UF_CRM_*", "ASSIGNED_BY_ID", "OPPORTUNITY"],
            "order": {"DATE_CREATE": "DESC"}
        })

        # Transform each deal
        result = []
        for deal in deals_raw:
            enriched = _inject_status(deal)
            enriched["inspectorPhone"] = deal.get("UF_CRM_1773961369947", "")
            result.append(enriched)

        logger.info(f"Found {len(result)} deals for phone {inspector_phone}")

        # ── Auto-notify for new unnotified deals ──
        if inspector_phone and result:
            import asyncio
            for deal in result:
                stage = deal.get("stageId", deal.get("STAGE_ID", ""))
                deal_id = str(deal.get("ID", ""))

                # Only notify for NEW or PREPARATION (assigned but not yet scheduled)
                if stage in ("NEW", "PREPARATION") and deal_id:
                    existing = db.query(InspectorNotification).filter(
                        InspectorNotification.deal_id == deal_id,
                        InspectorNotification.phone == inspector_phone,
                    ).first()

                    if not existing:
                        # Mark as notified FIRST to prevent race-condition duplicates
                        notif = InspectorNotification(
                            deal_id=deal_id,
                            phone=inspector_phone,
                        )
                        db.add(notif)
                        try:
                            db.commit()
                        except Exception:
                            db.rollback()
                            continue  # Unique constraint caught — another request already inserted

                        # Fire email in background
                        asyncio.create_task(
                            _notify_inspector_new_order(deal, inspector_phone, db)
                        )
                        logger.info(f"📩 Queued notification email for deal {deal_id} → {inspector_phone}")

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
            vehicle_make="",
            vehicle_model="",
            registration_plates="",
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
    bitrix_ready = getattr(request.app.state, "bitrix_ready", False)

    if not bitrix_ready:
        raise HTTPException(
            status_code=503,
            detail="Bitrix24 integration not ready",
        )

    try:
        deal = await gateway.get_deal(deal_id=deal_id)
        # Ensure date fields are explicitly available for the frontend mapping
        date_val = deal.get("UF_CRM_1772108256983", "") or deal.get("inspection_date", "") or deal.get("scheduled_date", "")
        if "inspection_date" not in deal:
            deal["inspection_date"] = date_val
        if "scheduled_date" not in deal:
            deal["scheduled_date"] = date_val
        
        return deal
    except Exception as e:
        logger.error(f"Error fetching deal {deal_id}: {e}")
        raise HTTPException(status_code=502, detail=str(e))


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
