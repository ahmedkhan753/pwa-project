"""
Admin Router — CRUD for inspectors + order viewing + email notifications.
"""

import warnings
warnings.filterwarnings("ignore", ".*error reading bcrypt version.*")

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from database import get_db
from models.inspector import Inspector
from deps import require_admin
from services.email_service import send_assignment_email

router = APIRouter(tags=["Admin"])
logger = logging.getLogger("routers.admin")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

INSPECTOR_FIELD = "UF_CRM_1773970466449"

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


# ── Bitrix Sync Helper ───────────────────────────────

async def _sync_inspector_to_bitrix(
    gateway,
    action: str,
    name: str,
    phone: str,
    bitrix_list_id: Optional[str] = None,
) -> Optional[str]:
    """
    Sync inspector to/from Bitrix24 inspector dropdown (UF_CRM_1773970466449).
    action: 'add' | 'remove'
    Returns new Bitrix list item ID on 'add', None on 'remove' or error.
    Stores values as "Name - phone" so the phone regex in get_phone_to_bitrix_id
    still extracts the phone number correctly.
    """
    display_value = f"{name} - {phone}"

    try:
        # 1. Get field's internal numeric ID via crm.deal.userfield.list
        field_list = await gateway.call("crm.deal.userfield.list", {
            "filter": {"FIELD_NAME": INSPECTOR_FIELD}
        })
        if not field_list:
            logger.error(f"Bitrix sync: field {INSPECTOR_FIELD} not found")
            return None
        field_id = field_list[0]["ID"]
        logger.info(f"Bitrix sync: field_id={field_id}")

        # 2. Get current items
        fields = await gateway.call("crm.deal.fields", {})
        field_data = fields.get(INSPECTOR_FIELD, {})
        current_items = field_data.get("items", field_data.get("ITEMS", []))
        logger.info(f"Bitrix sync: {len(current_items)} existing items in dropdown")

        # 3. Build updated list
        import re as _re
        import uuid as _uuid

        # Helper: find existing item by digits-only phone match.
        # Handles \xa0 (non-breaking space) and other whitespace variants in Bitrix VALUES.
        def _find_by_phone(items):
            phone_digits = _re.sub(r'\D', '', phone)
            if len(phone_digits) < 7:
                return None
            # Prefer highest ID (most recent entry) so we keep the correct duplicate
            for item in sorted(items, key=lambda x: int(x.get("ID", 0)), reverse=True):
                value_digits = _re.sub(r'\D', '', str(item.get("VALUE", "")))
                if phone_digits in value_digits:
                    return str(item["ID"])
            return None

        # Deduplicate current_items: when the same phone appears multiple times (e.g. due
        # to a previous failed deactivation), keep only the entry with the highest ID.
        # This removes stale duplicates that cause XML_ID collisions on every LIST update.
        seen_phones: dict = {}
        for item in sorted(current_items, key=lambda x: int(x.get("ID", 0))):
            digits = _re.sub(r'\D', '', str(item.get("VALUE", "")))
            seen_phones[digits] = item  # last (highest ID) wins
        deduplicated_items = list(seen_phones.values())
        if len(deduplicated_items) < len(current_items):
            logger.info(
                f"Bitrix sync: deduplicated {len(current_items) - len(deduplicated_items)} "
                f"duplicate item(s) from dropdown"
            )
        current_items = deduplicated_items

        if action == "add":
            # Guard: if inspector already exists in Bitrix (e.g. legacy or failed deactivation),
            # return their existing ID instead of adding a duplicate (causes XML_ID collision).
            existing_id = _find_by_phone(current_items)
            if existing_id:
                logger.info(f"Bitrix sync: {name}/{phone} already exists (ID={existing_id}), skipping add")
                from routers.deals import invalidate_inspector_cache
                invalidate_inspector_cache()
                return existing_id

            new_list = [
                {"ID": str(item["ID"]), "VALUE": str(item.get("VALUE", ""))}
                for item in current_items
            ]
            # Provide an explicit XML_ID so Bitrix doesn't auto-generate one that collides
            # with a previously deleted item at the same list position.
            new_list.append({"VALUE": display_value, "XML_ID": _uuid.uuid4().hex})

        elif action == "remove":
            # Resolve the item to remove: prefer stored bitrix_list_id, fall back to phone match
            effective_id = str(bitrix_list_id) if bitrix_list_id else _find_by_phone(current_items)
            if not effective_id:
                logger.warning(f"Bitrix sync: cannot remove {name}/{phone} — not found in list")
                return None
            new_list = [
                {"ID": str(item["ID"]), "VALUE": str(item.get("VALUE", ""))}
                for item in current_items
                if str(item.get("ID", "")) != effective_id
            ]
            logger.info(f"Bitrix sync: removing item {effective_id}, {len(new_list)} items remain")

        else:
            logger.warning(f"Bitrix sync: invalid action={action!r}")
            return None

        # 4. Update Bitrix field
        await gateway.call("crm.deal.userfield.update", {
            "id": int(field_id),
            "fields": {"LIST": new_list},
        })
        logger.info(f"✅ Bitrix sync: {action} completed for {name} / {phone}")

        # 5. Invalidate cache
        from routers.deals import invalidate_inspector_cache
        invalidate_inspector_cache()

        # 6. On 'add': re-fetch to find the newly assigned item ID
        if action == "add":
            updated_fields = await gateway.call("crm.deal.fields", {})
            updated_items = updated_fields.get(INSPECTOR_FIELD, {}).get("items", [])
            for item in updated_items:
                if str(item.get("VALUE", "")).strip() == display_value:
                    new_id = str(item["ID"])
                    logger.info(f"Bitrix sync: new item ID={new_id} for {name}")
                    return new_id
            logger.warning(f"Bitrix sync: added item not found by VALUE for {name}")

        return None

    except Exception as e:
        logger.error(f"Bitrix sync error ({action} {name}/{phone}): {e}", exc_info=True)
        return None


# ── Inspector CRUD ──────────────────────────────────

@router.post("/admin/inspectors")
async def create_inspector(
    data: CreateInspectorRequest,
    req: Request,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Create a new inspector account and sync to Bitrix24 dropdown."""
    existing = db.query(Inspector).filter(Inspector.phone == data.phone).first()
    if existing:
        raise HTTPException(status_code=400, detail="Phone number already registered")

    inspector = Inspector(
        name=data.name,
        phone=data.phone,
        pin_hash=pwd_context.hash(str(data.pin)),
        email=data.email,
    )
    db.add(inspector)
    db.commit()
    db.refresh(inspector)
    logger.info(f"✅ Inspector created in DB: {inspector.name} ({inspector.phone})")

    # Sync to Bitrix (best-effort — DB record is always created)
    bitrix_synced = False
    gateway = req.app.state.gateway
    bitrix_ready = getattr(req.app.state, "bitrix_ready", False)

    if bitrix_ready:
        new_list_id = await _sync_inspector_to_bitrix(gateway, "add", data.name, data.phone)
        if new_list_id:
            inspector.bitrix_list_id = new_list_id
            db.commit()
            bitrix_synced = True
    else:
        logger.warning(f"Bitrix not ready — {data.name} not synced to Bitrix dropdown")

    return {"success": True, "id": inspector.id, "bitrix_synced": bitrix_synced}


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
            "bitrix_synced": bool(i.bitrix_list_id),
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
    req: Request,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Activate a deactivated inspector and re-sync to Bitrix."""
    inspector = db.query(Inspector).filter(Inspector.id == inspector_id).first()
    if not inspector:
        raise HTTPException(status_code=404, detail="Inspector not found")

    inspector.is_active = True
    db.commit()
    logger.info(f"✅ Inspector activated: {inspector.name}")

    # Re-sync to Bitrix if not already present
    bitrix_synced = bool(inspector.bitrix_list_id)
    if not inspector.bitrix_list_id:
        gateway = req.app.state.gateway
        bitrix_ready = getattr(req.app.state, "bitrix_ready", False)
        if bitrix_ready:
            new_list_id = await _sync_inspector_to_bitrix(gateway, "add", inspector.name, inspector.phone)
            if new_list_id:
                inspector.bitrix_list_id = new_list_id
                db.commit()
                bitrix_synced = True

    return {"success": True, "bitrix_synced": bitrix_synced}


@router.put("/admin/inspectors/{inspector_id}/deactivate")
async def deactivate_inspector(
    inspector_id: int,
    req: Request,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Deactivate an inspector and remove from Bitrix dropdown."""
    inspector = db.query(Inspector).filter(Inspector.id == inspector_id).first()
    if not inspector:
        raise HTTPException(status_code=404, detail="Inspector not found")

    saved_list_id = inspector.bitrix_list_id
    inspector.is_active = False
    inspector.bitrix_list_id = None
    db.commit()
    logger.info(f"✅ Inspector deactivated: {inspector.name}")

    # Remove from Bitrix dropdown (best-effort)
    bitrix_synced = False
    if saved_list_id:
        gateway = req.app.state.gateway
        bitrix_ready = getattr(req.app.state, "bitrix_ready", False)
        if bitrix_ready:
            await _sync_inspector_to_bitrix(
                gateway, "remove", inspector.name, inspector.phone, saved_list_id
            )
            bitrix_synced = True

    return {"success": True, "bitrix_synced": bitrix_synced}


@router.delete("/admin/inspectors/{inspector_id}")
async def delete_inspector(
    inspector_id: int,
    req: Request,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Deactivate via DELETE (backwards compat)."""
    inspector = db.query(Inspector).filter(Inspector.id == inspector_id).first()
    if not inspector:
        raise HTTPException(status_code=404, detail="Inspector not found")

    saved_list_id = inspector.bitrix_list_id
    inspector.is_active = False
    inspector.bitrix_list_id = None
    db.commit()
    logger.info(f"✅ Inspector deactivated: {inspector.name}")

    if saved_list_id:
        gateway = req.app.state.gateway
        bitrix_ready = getattr(req.app.state, "bitrix_ready", False)
        if bitrix_ready:
            await _sync_inspector_to_bitrix(
                gateway, "remove", inspector.name, inspector.phone, saved_list_id
            )

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
