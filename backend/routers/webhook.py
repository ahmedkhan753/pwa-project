"""
Webhook Router — Bitrix24 outgoing webhook handler.
Receives deal update notifications and triggers email to assigned inspector.

Configure in Bitrix24:
  Settings → Integration → Outgoing webhooks
  Events: ONCRMDEALADD, ONCRMDEALUPDATE
  URL: https://YOUR_SERVER/webhook/bitrix
"""

import logging
from fastapi import APIRouter, Request, Depends
from sqlalchemy.orm import Session
from database import get_db
from models.inspector import Inspector, InspectorNotification

router = APIRouter(prefix="/webhook", tags=["Webhook"])
logger = logging.getLogger("routers.webhook")

INSPECTOR_PHONE_FIELD = "UF_CRM_1773970466449"


@router.post("/bitrix")
async def bitrix_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Bitrix24 calls this endpoint when a deal is created or updated.
    We check if inspector was assigned and send email notification.
    """
    gateway = request.app.state.gateway
    bitrix_ready = getattr(request.app.state, "bitrix_ready", False)

    if not bitrix_ready:
        return {"status": "ok", "message": "Bitrix not ready"}

    try:
        # Bitrix sends form-encoded data
        body = await request.form()
        event = body.get("event", "")
        deal_id = body.get("data[FIELDS][ID]")

        logger.info(f"📨 Bitrix webhook received: event={event}, deal_id={deal_id}")

        if not deal_id:
            # Try alternative field name
            deal_id = body.get("data[FIELDS_AFTER][ID]")

        if not deal_id:
            logger.warning("Webhook: no deal_id found in payload")
            return {"status": "ok", "message": "no deal_id"}

        # Fetch full deal from Bitrix
        deal = await gateway.call("crm.deal.get", {"id": int(deal_id)})
        if not deal:
            return {"status": "ok", "message": "deal not found"}

        # Get inspector list ID from deal
        list_id = str(deal.get(INSPECTOR_PHONE_FIELD, "") or "").strip()
        if not list_id:
            logger.info(f"Webhook: no inspector assigned to deal {deal_id}")
            return {"status": "ok", "message": "no inspector assigned"}

        # Reverse map list_id to phone number
        from routers.deals import get_phone_to_bitrix_id
        phone_map = await get_phone_to_bitrix_id(gateway)
        id_to_phone = {v: k for k, v in phone_map.items()}
        phone = id_to_phone.get(list_id, "")

        if not phone:
            logger.warning(f"Webhook: could not resolve phone for list_id {list_id}")
            return {"status": "ok", "message": "phone not resolved"}

        # Find inspector in DB
        inspector = db.query(Inspector).filter(
            Inspector.phone == phone,
            Inspector.is_active == True,
        ).first()

        if not inspector:
            logger.warning(f"Webhook: inspector with phone {phone} not found in DB")
            return {"status": "ok", "message": "inspector not in DB"}

        if not inspector.email:
            logger.warning(f"Webhook: inspector {phone} has no email")
            return {"status": "ok", "message": "no email"}

        # Check if we already sent notification for this deal+phone
        already_notified = db.query(InspectorNotification).filter(
            InspectorNotification.deal_id == str(deal_id),
            InspectorNotification.phone == phone,
        ).first()

        if already_notified:
            logger.info(f"Webhook: already notified {phone} for deal {deal_id}")
            return {"status": "ok", "message": "already notified"}

        # Send email
        from services.email_service import send_assignment_email
        await send_assignment_email(
            inspector_name=inspector.name,
            inspector_email=inspector.email,
            order_title=deal.get("TITLE", f"Zlecenie #{deal_id}"),
            order_id=str(deal_id),
            client_name=deal.get("UF_CRM_1766057964319", ""),
            inspection_address=deal.get("UF_CRM_1766058185504", ""),
            inspection_date=deal.get("UF_CRM_1772108256983", "Nie ustalono"),
            vehicle_make=deal.get("UF_CRM_1766057839684", ""),
            vehicle_model=deal.get("UF_CRM_1766057849818", ""),
            registration_plates=deal.get("UF_CRM_1766057515315", ""),
        )

        # Mark as notified
        notification = InspectorNotification(
            deal_id=str(deal_id),
            phone=phone,
        )
        db.add(notification)
        try:
            db.commit()
        except Exception:
            db.rollback()

        logger.info(f"✅ Webhook email sent to {inspector.email} for deal {deal_id}")
        return {"status": "ok", "email_sent": True}

    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {"status": "error", "message": str(e)}


@router.get("/bitrix")
async def bitrix_webhook_verify(request: Request):
    """Bitrix24 verification endpoint — confirms webhook is active."""
    return {"status": "ok"}
