"""
Deals Router
============
List and get CRM deal routes for the Calendar View
and inspection resume features.
"""

import logging
from typing import Optional
from fastapi import APIRouter, Request, HTTPException, Query

router = APIRouter(prefix="/deals", tags=["Deals"])
logger = logging.getLogger("routers.deals")


@router.get("")
async def get_deals(
    request: Request,
    user_id: Optional[int] = Query(None, description="Bitrix24 user ID"),
    date_from: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    status: Optional[str] = Query(None, description="Deal stage filter"),
):
    """
    GET /deals
    Returns list of inspections for Calendar View.
    Filters by user_id, date range, and status.
    """
    gateway = request.app.state.gateway
    bitrix_ready = getattr(request.app.state, "bitrix_ready", False)

    if not bitrix_ready:
        logger.warning("Bitrix not ready — returning empty deal list")
        return []

    try:
        if user_id and date_from:
            # get_appraiser_deals now returns {scheduled, unscheduled, total_in_bitrix, total_returned}
            return await gateway.get_appraiser_deals(
                user_id=user_id,
                date_from=date_from,
                date_to=date_to,
            )
        else:
            # Build generic filters
            filters = {}
            if date_from:
                filters[">=BEGINDATE"] = date_from
            if date_to:
                filters["<=BEGINDATE"] = date_to
            if status:
                filters["STAGE_ID"] = status

            deals_list = await gateway.get_deal_list(filters)

            # Transform each deal using the field transformer
            from services.field_transformer import FieldTransformer
            disc = request.app.state.discovery
            transformer = FieldTransformer(disc)
            deals = [transformer.transform_from_bitrix(d) for d in deals_list]

            # Return consistent dict structure
            return {
                "scheduled": deals,
                "unscheduled": [],
                "total_in_bitrix": len(deals),
                "total_returned": len(deals)
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
        deal = await gateway.get_deal(deal_id)
        return deal
    except Exception as e:
        logger.error(f"Error fetching deal {deal_id}: {e}")
        raise HTTPException(status_code=502, detail=str(e))
