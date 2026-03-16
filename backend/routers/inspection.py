"""
Inspection Router
=================
Submit full inspections and save individual wizard steps.
"""

import logging
import json
from typing import Dict, Any
from fastapi import APIRouter, Request, HTTPException

from models.inspection import (
    InspectionPayload,
    StepPartialData,
    SubmitResult,
    StepSaveResult,
)
from services.field_transformer import FieldTransformer

router = APIRouter(prefix="/inspection", tags=["Inspection"])
logger = logging.getLogger("routers.inspection")

# Step number → step model field name mapping
STEP_FIELD_MAP = {
    1: "vehicle",
    2: "documents",  # equipmentCompleteness
    3: "full_equipment",
    4: "paint",
    5: "tires",
    6: "photos",
    7: "body_damage", # exteriorDamage
    8: "interior",     # interiorDamage
    9: "mechanical",
    10: "notes_valuation",
    11: "vehicle",    # Validation (fallback)
    12: "summary",
}


@router.post("/submit", response_model=SubmitResult)
async def submit_inspection(payload: InspectionPayload, request: Request):
    """
    POST /inspection/submit
    Creates or updates a Bitrix deal from the full 12-step inspection payload.
    Validates with Pydantic, transforms dynamically, triggers file uploads.
    Returns: { deal_id, bitrix_url, status, warnings[] }
    """
    gateway = request.app.state.gateway
    disc = request.app.state.discovery
    bitrix_ready = getattr(request.app.state, "bitrix_ready", False)

    if not bitrix_ready:
        raise HTTPException(
            status_code=503,
            detail="Bitrix24 integration not ready — try again later",
        )

    warnings = []

    try:
        # Flatten all 11 steps into a single dict of PWA keys
        flat_data = payload.flatten()
        logger.info(
            f"Submitting inspection with {len(flat_data)} fields "
            f"(deal_id={payload.deal_id})"
        )

        if payload.deal_id:
            # Update existing deal
            result = await gateway.update_deal(
                deal_id=int(payload.deal_id),
                inspection_data=flat_data,
            )
        else:
            # Create new deal
            result = await gateway.create_deal(inspection_data=flat_data)

        return SubmitResult(
            deal_id=result["deal_id"],
            bitrix_url=result.get("bitrix_url"),
            status="success",
            warnings=warnings,
            message="Inspection submitted to Bitrix24 successfully.",
        )

    except Exception as e:
        logger.error(f"Inspection submit failed: {e}")
        # Partial submit: return what we can
        return SubmitResult(
            deal_id=None,
            bitrix_url=None,
            status="failed",
            warnings=[str(e)],
            message="Submission failed. Data preserved for retry.",
        )


@router.patch("/{deal_id}/step/{step_number}", response_model=StepSaveResult)
async def save_step(
    deal_id: int,
    step_number: int,
    step_data: StepPartialData,
    request: Request,
):
    """
    PATCH /inspection/{deal_id}/step/{step_number}
    Saves progress of a single wizard step.
    Updates the deal with only that step's fields.
    Enables "Anti-Oops" auto-save from Zustand.
    """
    gateway = request.app.state.gateway
    disc = request.app.state.discovery
    bitrix_ready = getattr(request.app.state, "bitrix_ready", False)

    if not bitrix_ready:
        raise HTTPException(
            status_code=503,
            detail="Bitrix24 integration not ready",
        )

    if step_number < 1 or step_number > 12:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid step number: {step_number}. Must be 1-12.",
        )

    warnings = []

    try:
        # The step_data.data contains PWA key-value pairs for this step
        step_fields = step_data.data

        # Problem 2: Log actual request body for steps 6, 7, 8
        if step_number in (6, 7, 8):
            logger.info("=" * 40)
            logger.info(f"🚨 DEBUG PLAYLOAD - STEP {step_number}")
            logger.info(json.dumps(step_fields, indent=2, ensure_ascii=False))
            logger.info("=" * 40)

        logger.info(
            f"Saving step {step_number} for deal {deal_id} "
            f"({len(step_fields)} fields)"
        )

        result = await gateway.update_deal(
            deal_id=deal_id,
            inspection_data=step_fields,
        )

        return StepSaveResult(
            deal_id=deal_id,
            step_number=step_number,
            status="saved",
            warnings=warnings,
        )

    except Exception as e:
        logger.error(f"Step save failed (deal={deal_id}, step={step_number}): {e}")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to save step {step_number}: {e}",
        )
@router.post("/{deal_id}/schedule")
async def schedule_inspection(
    deal_id: int,
    request: Request,
):
    """
    POST /inspection/{deal_id}/schedule
    Updates the planned inspection date and transitions deal stage.
    """
    gateway = request.app.state.gateway
    body = await request.json()
    scheduled_date = body.get("scheduled_date")
    
    if not scheduled_date:
        raise HTTPException(status_code=400, detail="Missing scheduled_date")

    try:
        result = await gateway.schedule_inspection(deal_id, scheduled_date)
        return result
    except Exception as e:
        logger.error(f"Scheduling failed: {e}")
        raise HTTPException(status_code=502, detail=str(e))
