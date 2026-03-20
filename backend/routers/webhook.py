"""
Webhook Router — Bitrix24 outgoing webhook handler.
Receives deal update notifications and triggers email to assigned inspector.

Configure in Bitrix24:
  Settings → Integration → Outgoing webhooks
  Events: ONCRMDEALADD, ONCRMDEALUPDATE
  URL: https://YOUR_SERVER/webhook/bitrix/deal-updated
"""

import logging
from fastapi import APIRouter, Request, Depends
from database import SessionLocal
from models.inspector import Inspector

router = APIRouter(prefix="/webhook", tags=["Webhook"])
logger = logging.getLogger("routers.webhook")


@router.post("/bitrix/deal-updated")
async def deal_updated_webhook(request: Request):
    """
    Bitrix24 calls this endpoint when a deal is created or updated.
    We check if an inspector was assigned and send an email notification.
    """
    gateway = request.app.state.gateway
    bitrix_ready = getattr(request.app.state, "bitrix_ready", False)

    if not bitrix_ready:
        return {"status": "ok", "message": "Bitrix not ready"}

    try:
        # Bitrix sends form-encoded data with nested keys
        body = await request.form()
        deal_id = body.get("data[FIELDS][ID]")

        if not deal_id:
            # Try JSON body as fallback
            try:
                json_body = await request.json()
                deal_id = json_body.get("deal_id") or json_body.get("data", {}).get("FIELDS", {}).get("ID")
            except Exception:
                pass

        if not deal_id:
            logger.debug("Webhook received but no deal_id found")
            return {"status": "ok"}

        logger.info(f"📩 Webhook received for deal: {deal_id}")

        # Fetch full deal from Bitrix
        deal = await gateway.call("crm.deal.get", {"id": int(deal_id)})

        # Check if inspector is assigned via the list field
        list_id = str(deal.get("UF_CRM_1773970466449", "")).strip()

        if not list_id:
            return {"status": "ok", "message": "No inspector assigned yet"}

        # Reverse-map list_id → phone
        from routers.deals import get_phone_to_bitrix_id
        phone_map = await get_phone_to_bitrix_id(gateway)
        id_to_phone = {v: k for k, v in phone_map.items()}
        inspector_phone = id_to_phone.get(list_id, "")

        if not inspector_phone:
            logger.info(f"Webhook: could not resolve phone from list_id {list_id}")
            return {"status": "ok", "message": "Inspector phone not resolved"}

        # Find inspector in DB
        db = SessionLocal()
        try:
            inspector = db.query(Inspector).filter(
                Inspector.phone == inspector_phone,
                Inspector.is_active == True,
            ).first()

            if not inspector or not inspector.email:
                logger.info(f"Webhook: inspector {inspector_phone} has no email")
                return {"status": "ok", "message": "Inspector has no email"}

            # Send assignment email
            from services.email_service import send_assignment_email
            await send_assignment_email(
                inspector_name=inspector.name,
                inspector_email=inspector.email,
                order_title=deal.get("TITLE", f"Zlecenie #{deal_id}"),
                order_id=str(deal_id),
                client_name=deal.get("UF_CRM_1766057964319", ""),
                inspection_address=deal.get("UF_CRM_1766058185504", ""),
                inspection_date=deal.get("UF_CRM_1772108256983", ""),
                vehicle_make="",
                vehicle_model="",
                registration_plates=deal.get("UF_CRM_PLATES_FIELD", ""),
            )
            logger.info(f"📧 Webhook email sent to {inspector.email} for deal {deal_id}")
            return {"status": "ok", "email_sent": True, "to": inspector.email}
        finally:
            db.close()

    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {"status": "error", "message": str(e)}
