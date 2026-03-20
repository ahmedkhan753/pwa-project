"""
Admin Router — CRUD for inspectors + order viewing + email notifications.
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
from services.email_service import send_assignment_email

router = APIRouter(tags=["Admin"])
logger = logging.getLogger("routers.admin")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Stage → Status mapping
STAGE_MAP = {
    "NEW": "new",
    "PREPARATION": "assigned",
    "PREPAYMENT_INVOICE": "scheduled",
    "UC_0T9W8E": "completed",
    "EXECUTING": "in_valuation",
    "WON": "closed",
    "LOSE": "lost",
}


# ── Request Models ──────────────────────────────────

class CreateInspectorRequest(BaseModel):
    name: str
    phone: str
    pin: str
    email: Optional[str] = None


class UpdatePinRequest(BaseModel):
    pin: str


class NotifyRequest(BaseModel):
    phone: str
    order_title: str
    order_id: str
    client_name: str = ""
    inspection_address: str = ""
    inspection_date: str = ""
    vehicle_make: str = ""
    vehicle_model: str = ""
    registration_plates: str = ""


# ── Inspector CRUD ──────────────────────────────────

@router.post("/admin/inspectors")
async def create_inspector(
    request: CreateInspectorRequest,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Create a new inspector account."""
    existing = db.query(Inspector).filter(Inspector.phone == request.phone).first()
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


# ── Inspector Orders ────────────────────────────────

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
        # Convert phone → Bitrix list ID using the dynamic mapping
        from routers.deals import get_phone_to_bitrix_id
        phone_map = await get_phone_to_bitrix_id(gateway)
        bitrix_id = phone_map.get(phone)

        if not bitrix_id:
            logger.warning(f"No Bitrix ID found for phone {phone}")
            return []

        logger.info(f"Admin: fetching orders for phone {phone} → Bitrix ID {bitrix_id}")

        deals = await gateway.call("crm.deal.list", {
            "filter": {"UF_CRM_1773970466449": bitrix_id},
            "select": ["ID", "TITLE", "STAGE_ID", "DATE_CREATE",
                       "UF_CRM_1766057964319", "UF_CRM_1766058185504",
                       "UF_CRM_1772108256983"],
            "order": {"DATE_CREATE": "DESC"},
        })

        return [
            {
                **deal,
                "id": str(deal.get("ID", "")),
                "status": STAGE_MAP.get(deal.get("STAGE_ID", ""), "new"),
                "clientName": deal.get("UF_CRM_1766057964319", ""),
                "inspectionAddress": deal.get("UF_CRM_1766058185504", ""),
                "scheduledDate": deal.get("UF_CRM_1772108256983", ""),
            }
            for deal in deals
        ]
    except Exception as e:
        logger.error(f"Error fetching orders for phone {phone}: {e}")
        return []


# ── PIN Reset ───────────────────────────────────────

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


# ── Activate / Deactivate ──────────────────────────

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


@router.delete("/admin/inspectors/{inspector_id}")
async def delete_inspector(
    inspector_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Deactivate via DELETE (backwards compat)."""
    inspector = db.query(Inspector).filter(Inspector.id == inspector_id).first()
    if not inspector:
        raise HTTPException(status_code=404, detail="Inspector not found")

    inspector.is_active = False
    db.commit()
    logger.info(f"✅ Inspector deactivated: {inspector.name}")
    return {"success": True}


# ── Email Notification ──────────────────────────────

@router.post("/admin/inspectors/notify")
async def notify_inspector(
    data: NotifyRequest,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Manually trigger assignment email for an inspector."""
    inspector = db.query(Inspector).filter(Inspector.phone == data.phone).first()

    if not inspector:
        raise HTTPException(status_code=404, detail="Inspector not found")

    if not inspector.email:
        raise HTTPException(status_code=400, detail="Inspector has no email address")

    success = await send_assignment_email(
        inspector_name=inspector.name,
        inspector_email=inspector.email,
        order_title=data.order_title,
        order_id=data.order_id,
        client_name=data.client_name,
        inspection_address=data.inspection_address,
        inspection_date=data.inspection_date,
        vehicle_make=data.vehicle_make,
        vehicle_model=data.vehicle_model,
        registration_plates=data.registration_plates,
    )

    if success:
        return {"success": True, "email_sent_to": inspector.email}
    else:
        raise HTTPException(
            status_code=500,
            detail="Email sending failed — check SMTP configuration"
        )
