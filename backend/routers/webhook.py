"""
Webhook Router — Bitrix24 outgoing webhook handler.
Receives deal update notifications and triggers email to assigned inspector.
Also auto-syncs PDF documents (CEPIK, damage history) from Bitrix file fields.

Configure in Bitrix24:
  Settings → Integration → Outgoing webhooks
  Events: ONCRMDEALADD, ONCRMDEALUPDATE
  URL: https://YOUR_SERVER/webhook/bitrix
"""

import logging
import os
import re
import asyncio
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, Request, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from database import get_db
from models.inspector import Inspector, InspectorNotification

router = APIRouter(prefix="/webhook", tags=["Webhook"])
logger = logging.getLogger("routers.webhook")

INSPECTOR_PHONE_FIELD = "UF_CRM_1773970466449"

# File fields for PDF documents
CEPIK_FIELD = "UF_CRM_1775497237180"
DAMAGE_HISTORY_FIELD = "UF_CRM_1775497290806"

# Local storage for downloaded docs
DOCS_DIR = Path("/app/data/report_docs")
DOCS_DIR.mkdir(parents=True, exist_ok=True)


# ─── Document sync helpers ────────────────────────────────────────────────────

def _doc_path(deal_id: int, doc_type: str) -> Path:
    return DOCS_DIR / f"{deal_id}_{doc_type}.pdf"


async def _try_download_file(url: str, label: str) -> Optional[bytes]:
    """Try downloading a file. Returns bytes if PDF, None if HTML/error."""
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(url)
        ct = resp.headers.get("content-type", "")
        if resp.status_code == 200 and "text/html" not in ct and len(resp.content) > 100:
            logger.info(f"[DocSync] ✅ Downloaded via {label} (content-type={ct}, size={len(resp.content)})")
            return resp.content
        elif resp.status_code == 200 and "text/html" in ct:
            preview = resp.text[:150].lower()
            logger.warning(f"[DocSync] ❌ {label} returned HTML: {preview[:80]}...")
        else:
            logger.warning(f"[DocSync] ❌ {label} returned HTTP {resp.status_code}")
    except Exception as e:
        logger.warning(f"[DocSync] ❌ {label} error: {e}")
    return None


async def sync_deal_documents(deal_id: int, deal: dict):
    """
    Check if file fields have values and download PDFs from Bitrix.
    Tries multiple download methods since Bitrix file access is tricky.
    """
    webhook_url = os.getenv("BITRIX_WEBHOOK_URL", "")
    if not webhook_url:
        return

    # Extract base domain and webhook path
    base_domain = ""
    m = re.match(r"(https?://[^/]+)", webhook_url)
    if m:
        base_domain = m.group(1)

    field_map = {
        "cepik": CEPIK_FIELD,
        "damage_history": DAMAGE_HISTORY_FIELD,
    }

    for doc_type, field_id in field_map.items():
        field_value = deal.get(field_id)
        if not field_value:
            continue

        # Skip if already downloaded
        path = _doc_path(deal_id, doc_type)
        if path.exists():
            logger.info(f"[DocSync] {doc_type} for deal {deal_id} already exists locally, skipping")
            continue

        logger.info(f"[DocSync] Processing {doc_type} for deal {deal_id}, raw field value: {field_value}")

        # Extract file info from field value
        file_id = None
        download_url = None

        if isinstance(field_value, (int, float, str)):
            fv = str(field_value)
            if fv.isdigit():
                file_id = int(fv)
        elif isinstance(field_value, dict):
            file_id = field_value.get("id") or field_value.get("ID") or field_value.get("fileId")
            # Try all URL properties — urlMachine is the REST-compatible one
            download_url = (
                field_value.get("urlMachine") or
                field_value.get("urlDownload") or
                field_value.get("downloadUrl") or
                field_value.get("DOWNLOAD_URL") or
                field_value.get("url") or
                field_value.get("URL")
            )
            if file_id and isinstance(file_id, str) and file_id.isdigit():
                file_id = int(file_id)
        elif isinstance(field_value, list) and field_value:
            item = field_value[0]
            if isinstance(item, (int, float)):
                file_id = int(item)
            elif isinstance(item, dict):
                file_id = item.get("id") or item.get("ID") or item.get("fileId")
                download_url = (
                    item.get("urlMachine") or
                    item.get("urlDownload") or
                    item.get("downloadUrl") or
                    item.get("DOWNLOAD_URL") or
                    item.get("url") or
                    item.get("URL")
                )
                if file_id and isinstance(file_id, str) and file_id.isdigit():
                    file_id = int(file_id)

        logger.info(f"[DocSync] file_id={file_id}, download_url={download_url}")

        if not file_id and not download_url:
            logger.warning(f"[DocSync] Cannot extract file info for {doc_type} in deal {deal_id}")
            continue

        # Build list of download URLs to try
        urls_to_try = []

        # Method 1: If urlMachine or download_url is available (REST-compatible)
        if download_url:
            full_url = download_url if download_url.startswith("http") else f"{base_domain}{download_url}"
            urls_to_try.append((full_url, "urlFromField"))

        # Method 2: show_file.php with webhook key
        if file_id:
            webhook_key = ""
            wm = re.match(r"https?://[^/]+/rest/\d+/([^/]+)", webhook_url)
            if wm:
                webhook_key = wm.group(1)

            urls_to_try.append((
                f"{base_domain}/bitrix/components/bitrix/crm.deal.show/show_file.php"
                f"?auth={webhook_key}&ownerId={deal_id}&fieldName={field_id}&fileId={file_id}&dynamic=Y",
                "show_file+webhook_key"
            ))

        # Method 3: show_file.php without auth (some Bitrix configs allow)
        if file_id:
            urls_to_try.append((
                f"{base_domain}/bitrix/components/bitrix/crm.deal.show/show_file.php"
                f"?ownerId={deal_id}&fieldName={field_id}&fileId={file_id}&dynamic=Y",
                "show_file_noauth"
            ))

        # Method 4: disk.file.getfilecontent (works if file is on Disk module)
        if file_id:
            urls_to_try.append((
                f"{webhook_url}disk.file.getfilecontent?id={file_id}",
                "disk_getfilecontent"
            ))

        # Try each method
        content = None
        for url, label in urls_to_try:
            content = await _try_download_file(url, label)
            if content:
                break

        if content:
            path.write_bytes(content)
            logger.info(f"[DocSync] ✅ Saved {doc_type} for deal {deal_id} ({len(content)} bytes) → {path}")
        else:
            logger.error(f"[DocSync] ❌ All download methods failed for {doc_type} in deal {deal_id}")


# ─── Webhook endpoint ─────────────────────────────────────────────────────────

@router.post("/bitrix")
async def bitrix_webhook(request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Bitrix24 calls this endpoint when a deal is created or updated.
    We check if inspector was assigned and send email notification.
    Also syncs PDF documents from file fields in background.
    Returns 500 on processing failures so Bitrix retries.
    """
    # Log raw request for debugging
    content_type = request.headers.get("content-type", "")
    logger.info(f"📨 Bitrix webhook incoming — Content-Type: {content_type}")

    # Parse body — Bitrix may send form-encoded OR JSON
    event = ""
    deal_id = None
    try:
        if "application/json" in content_type:
            body = await request.json()
            logger.info(f"📨 Bitrix webhook body (JSON): {body}")
            event = body.get("event", "")
            fields = body.get("data", {}).get("FIELDS", {})
            deal_id = str(fields.get("ID", "")).strip() or None
        else:
            # Default: form-encoded
            body = await request.form()
            body_dict = dict(body)
            logger.info(f"📨 Bitrix webhook body (form): {body_dict}")
            event = body.get("event", "")
            deal_id = body.get("data[FIELDS][ID]") or body.get("data[FIELDS_AFTER][ID]")
            if deal_id:
                deal_id = str(deal_id).strip()
    except Exception as parse_err:
        logger.error(f"Webhook: failed to parse request body — {parse_err}")
        raise HTTPException(status_code=500, detail=f"Parse error: {parse_err}")

    logger.info(f"📨 Bitrix webhook parsed: event={event!r}, deal_id={deal_id!r}")

    if not deal_id:
        logger.warning("Webhook: no deal_id in payload — ignoring")
        return {"status": "ok", "message": "no deal_id"}

    gateway = request.app.state.gateway
    bitrix_ready = getattr(request.app.state, "bitrix_ready", False)

    if not bitrix_ready:
        logger.error("Webhook: Bitrix gateway not ready — returning 500 so Bitrix retries")
        raise HTTPException(status_code=500, detail="Bitrix gateway not ready")

    try:
        # Fetch full deal from Bitrix
        deal = await gateway.call("crm.deal.get", {"id": int(deal_id)})
        if not deal:
            logger.warning(f"Webhook: deal {deal_id} not found in Bitrix")
            return {"status": "ok", "message": "deal not found"}

        logger.info(f"Webhook: deal {deal_id} fetched, title={deal.get('TITLE')!r}")

        # ─── Background: Sync PDF documents ───────────────────────────
        background_tasks.add_task(sync_deal_documents, int(deal_id), deal)

        # ─── Email notification logic ─────────────────────────────────
        # Get inspector list ID from deal
        list_id = str(deal.get(INSPECTOR_PHONE_FIELD, "") or "").strip()
        if not list_id:
            logger.info(f"Webhook: no inspector assigned to deal {deal_id}")
            return {"status": "ok", "message": "no inspector assigned"}

        logger.info(f"Webhook: inspector list_id={list_id!r} for deal {deal_id}")

        # Reverse map list_id to phone number
        from routers.deals import get_phone_to_bitrix_id
        phone_map = await get_phone_to_bitrix_id(gateway)
        id_to_phone = {v: k for k, v in phone_map.items()}
        phone = id_to_phone.get(list_id, "")

        if not phone:
            logger.warning(f"Webhook: could not resolve phone for list_id={list_id!r}, available ids: {list(id_to_phone.keys())[:10]}")
            return {"status": "ok", "message": "phone not resolved"}

        logger.info(f"Webhook: resolved phone={phone!r} for deal {deal_id}")

        # Find inspector in DB
        inspector = db.query(Inspector).filter(
            Inspector.phone == phone,
            Inspector.is_active == True,
        ).first()

        if not inspector:
            logger.warning(f"Webhook: inspector with phone {phone} not found in DB")
            return {"status": "ok", "message": "inspector not in DB"}

        if not inspector.email:
            logger.warning(f"Webhook: inspector {phone} has no email address")
            return {"status": "ok", "message": "no email"}

        # Check if we already sent notification for this deal+phone
        already_notified = db.query(InspectorNotification).filter(
            InspectorNotification.deal_id == str(deal_id),
            InspectorNotification.phone == phone,
        ).first()

        if already_notified:
            logger.info(f"Webhook: already notified {phone} for deal {deal_id} — skipping")
            return {"status": "ok", "message": "already notified"}

        # Send email
        from services.email_service import send_assignment_email
        logger.info(f"Webhook: sending email to {inspector.email} for deal {deal_id}")
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
        except Exception as db_err:
            db.rollback()
            logger.error(f"Webhook: DB commit failed for notification — {db_err}")

        logger.info(f"✅ Webhook email sent to {inspector.email} for deal {deal_id}")
        return {"status": "ok", "email_sent": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Webhook error processing deal {deal_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/bitrix")
async def bitrix_webhook_verify(request: Request):
    """Bitrix24 verification endpoint — confirms webhook is active."""
    return {"status": "ok"}
