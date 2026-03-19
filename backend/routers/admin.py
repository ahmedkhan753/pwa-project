"""
Admin Router — CRUD operations for managing inspectors + order viewing (admin auth required).
"""

import warnings
warnings.filterwarnings("ignore", ".*error reading bcrypt version.*")

import logging
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import Optional
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from database import get_db
from models.inspector import Inspector
from deps import require_admin

router = APIRouter(tags=["Admin"])
logger = logging.getLogger("routers.admin")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Stage → Status mapping (shared with deals router)
STAGE_MAP = {
    "NEW": "new",
    "PREPARATION": "assigned",
    "PREPAYMENT_INVOICE": "scheduled",
    "UC_0T9W8E": "completed",
    "EXECUTING": "in_valuation",
    "WON": "closed",
    "LOSE": "lost",
}


class CreateInspectorRequest(BaseModel):
    name: str
    phone: str
    pin: str
    email: Optional[str] = None


class UpdatePinRequest(BaseModel):
    pin: str


@router.post("/admin/inspectors")
async def create_inspector(
    request: CreateInspectorRequest,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Create a new inspector account."""
    existing = db.query(Inspector).filter(
        Inspector.phone == request.phone
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Phone number already registered")

    inspector = Inspector(
        name=request.name,
        phone=request.phone,
        pin_hash=pwd_context.hash(str(request.pin)),
        email=request.email,
    )
    db.add(inspector)
    db.commit()
    db.refresh(inspector)

    logger.info(f"✅ Inspector created: {inspector.name} ({inspector.phone})")
    return {"success": True, "id": inspector.id}


@router.get("/admin/inspectors")
async def list_inspectors(
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """List all inspectors."""
    inspectors = db.query(Inspector).order_by(Inspector.id).all()
    return [
        {
            "id": i.id,
            "name": i.name,
            "phone": i.phone,
            "email": i.email,
            "is_active": i.is_active,
        }
        for i in inspectors
    ]


@router.get("/admin/inspectors/{phone}/orders")
async def get_inspector_orders(
    phone: str,
    request: Request,
    _=Depends(require_admin),
):
    """Fetch all Bitrix24 orders assigned to this inspector phone."""
    gateway = request.app.state.gateway
    bitrix_ready = getattr(request.app.state, "bitrix_ready", False)

    if not bitrix_ready:
        return []

    try:
        deals = await gateway.call("crm.deal.list", {
            "filter": {
                "UF_CRM_1773961369947": phone,
            },
            "select": ["ID", "TITLE", "STAGE_ID", "DATE_CREATE"],
            "order": {"DATE_CREATE": "DESC"},
        })

        return [
            {
                **deal,
                "status": STAGE_MAP.get(deal.get("STAGE_ID", ""), "new"),
            }
            for deal in deals
        ]
    except Exception as e:
        logger.error(f"Error fetching orders for phone {phone}: {e}")
        return []


@router.put("/admin/inspectors/{inspector_id}/pin")
async def reset_pin(
    inspector_id: int,
    request: UpdatePinRequest,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Reset an inspector's PIN."""
    inspector = db.query(Inspector).filter(Inspector.id == inspector_id).first()
    if not inspector:
        raise HTTPException(status_code=404, detail="Inspector not found")

    inspector.pin_hash = pwd_context.hash(str(request.pin))
    db.commit()

    logger.info(f"✅ PIN reset for inspector: {inspector.name}")
    return {"success": True}


@router.delete("/admin/inspectors/{inspector_id}")
async def deactivate_inspector(
    inspector_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Deactivate an inspector (soft delete)."""
    inspector = db.query(Inspector).filter(Inspector.id == inspector_id).first()
    if not inspector:
        raise HTTPException(status_code=404, detail="Inspector not found")

    inspector.is_active = False
    db.commit()

    logger.info(f"✅ Inspector deactivated: {inspector.name}")
    return {"success": True}


@router.put("/admin/inspectors/{inspector_id}/activate")
async def activate_inspector(
    inspector_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Activate a deactivated inspector."""
    inspector = db.query(Inspector).filter(Inspector.id == inspector_id).first()
    if not inspector:
        raise HTTPException(status_code=404, detail="Inspector not found")

    inspector.is_active = True
    db.commit()

    logger.info(f"✅ Inspector activated: {inspector.name}")
    return {"success": True}


@router.put("/admin/inspectors/{inspector_id}/deactivate")
async def deactivate_inspector_put(
    inspector_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Deactivate an inspector (PUT version for frontend toggle)."""
    inspector = db.query(Inspector).filter(Inspector.id == inspector_id).first()
    if not inspector:
        raise HTTPException(status_code=404, detail="Inspector not found")

    inspector.is_active = False
    db.commit()

    logger.info(f"✅ Inspector deactivated: {inspector.name}")
    return {"success": True}
