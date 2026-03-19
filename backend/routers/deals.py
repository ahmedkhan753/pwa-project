"""
Deals Router
============
List and get CRM deal routes for the Calendar View
and inspection resume features.
Filters deals by the logged-in inspector's phone number.
"""

import logging
from typing import Optional
from fastapi import APIRouter, Request, HTTPException, Query, Depends

from deps import get_current_user

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
    user_id: Optional[int] = Query(None, description="Bitrix24 user ID"),
    date_from: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    status: Optional[str] = Query(None, description="Deal stage filter"),
):
    """
    GET /deals
    Returns list of inspections filtered by the current inspector's phone.
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

        # Filter by inspector phone if available
        if inspector_phone:
            filter_params["UF_CRM_1773961369947"] = inspector_phone

        # Direct Bitrix API call with phone filter
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
