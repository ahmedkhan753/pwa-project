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

# Eurotax kosztorys: input PDF field + output public-URL field.
EUROTAX_PDF_FIELD = os.getenv("BITRIX_EUROTAX_FIELD", "UF_CRM_1775497355115")
KOSZTORYS_URL_FIELD = "UF_CRM_1777661533952"
PUBLIC_APP_BASE = os.getenv("PUBLIC_APP_BASE", "https://app.zaufajrzeczoznawcy.pl")

# Equipment auto-parse: input Wycena PDF field + output standard-equipment field.
WYCENA_PDF_FIELD = os.getenv("BITRIX_WYCENA_FIELD", "UF_CRM_1779285905944")
WYPOSAZENIE_STD_FIELD = "UF_CRM_1778277584327"

# Local storage for downloaded docs
DOCS_DIR = Path("/app/data/report_docs")
DOCS_DIR.mkdir(parents=True, exist_ok=True)


# ─── Document sync helpers ────────────────────────────────────────────────────

def _doc_path(deal_id: int, doc_type: str) -> Path:
    return DOCS_DIR / f"{deal_id}_{doc_type}.pdf"


def _doc_fileid_path(deal_id: int, doc_type: str) -> Path:
    return DOCS_DIR / f"{deal_id}_{doc_type}.fileid"


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

        logger.info(f"[DocSync] Processing {doc_type} for deal {deal_id}, raw field value: {field_value}")

        # Extract file info from field value (BEFORE skip check so we can
        # compare Bitrix fileId against the stored sidecar — BUG-203 fix).
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

        # Re-download if the Bitrix fileId changed (client replaced the file).
        # Files saved before this fix have no sidecar → triggers a one-time
        # re-download that self-heals + creates the sidecar.
        path = _doc_path(deal_id, doc_type)
        fileid_path = _doc_fileid_path(deal_id, doc_type)
        if path.exists() and file_id is not None:
            stored_fileid = None
            try:
                stored_fileid = fileid_path.read_text().strip()
            except Exception:
                stored_fileid = None
            if stored_fileid == str(file_id):
                logger.info(f"[DocSync] {doc_type} deal {deal_id} unchanged (fileId={file_id}), skipping")
                continue
            else:
                logger.info(f"[DocSync] {doc_type} deal {deal_id} fileId changed ({stored_fileid} → {file_id}), re-downloading")
        elif path.exists() and file_id is None:
            # Can't determine fileId — keep existing file (don't lose it), skip.
            logger.info(f"[DocSync] {doc_type} deal {deal_id} exists, no fileId to compare, skipping")
            continue

        if not file_id and not download_url:
            logger.warning(f"[DocSync] Cannot extract file info for {doc_type} in deal {deal_id}")
            continue

        # Build list of download URLs to try
        urls_to_try = []

        # Method 0 (PRIMARY): show_file.php with OAuth access token
        from services.bitrix_oauth import get_oauth
        oauth = get_oauth()
        oauth_token = await oauth.get_valid_token()
        if oauth_token and file_id:
            show_url = field_value.get("showUrl", "") if isinstance(field_value, dict) else ""
            if show_url:
                full_show = show_url if show_url.startswith("http") else f"{base_domain}{show_url}"
                sep = "&" if "?" in full_show else "?"
                urls_to_try.append((f"{full_show}{sep}auth={oauth_token}", "oauth+showUrl"))
            urls_to_try.append((
                f"{base_domain}/bitrix/components/bitrix/crm.deal.show/show_file.php"
                f"?auth={oauth_token}&ownerId={deal_id}&fieldName={field_id}&fileId={file_id}&dynamic=Y",
                "oauth+show_file"
            ))
        elif not oauth_token:
            logger.warning("[DocSync] No OAuth token available — install the Bitrix app first")

        # Method 1: downloadUrl from field with OAuth token injected
        if download_url and oauth_token:
            full_url = download_url if download_url.startswith("http") else f"{base_domain}{download_url}"
            # Replace empty auth= with OAuth token
            import re as _re
            if "auth=" in full_url:
                full_url = _re.sub(r'auth=(&|$)', f'auth={oauth_token}\\1', full_url)
            else:
                sep = "&" if "?" in full_url else "?"
                full_url = f"{full_url}{sep}auth={oauth_token}"
            urls_to_try.append((full_url, "oauth+downloadUrl"))

        # Method 2: show_file.php with webhook key (fallback)
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

        # Try each method
        content = None
        for url, label in urls_to_try:
            content = await _try_download_file(url, label)
            if content:
                break

        if content:
            path.write_bytes(content)
            try:
                if file_id is not None:
                    fileid_path.write_text(str(file_id))
            except Exception as e:
                logger.warning(f"[DocSync] could not write fileid sidecar: {e}")
            logger.info(f"[DocSync] ✅ Saved {doc_type} for deal {deal_id} ({len(content)} bytes) → {path}")
        else:
            logger.error(f"[DocSync] ❌ All download methods failed for {doc_type} in deal {deal_id}")


# ─── Kosztorys URL auto-write ─────────────────────────────────────────────────

async def sync_deal_kosztorys_url(gateway, deal_id: int, deal: dict) -> None:
    """
    When a deal has a Eurotax PDF in UF_CRM_1775497355115, ensure the
    public kosztorys URL field UF_CRM_1777661533952 holds:
        https://app.zaufajrzeczoznawcy.pl/kosztorys/{deal_id}

    Idempotent — only writes when the existing value differs from
    expected, so re-firing webhooks doesn't cause crm.deal.update storms.
    Failures are logged but never propagate (called via BackgroundTasks
    alongside other webhook handlers — must not derail siblings).
    """
    try:
        pdf_field = deal.get(EUROTAX_PDF_FIELD)
        if not pdf_field:
            return  # no Eurotax PDF attached → nothing to do

        expected_url = f"{PUBLIC_APP_BASE.rstrip('/')}/kosztorys/{deal_id}"
        current = deal.get(KOSZTORYS_URL_FIELD)
        current_str = str(current).strip() if current else ""
        if current_str == expected_url:
            return  # already correct, no-op

        await gateway.call("crm.deal.update", {
            "ID": deal_id,
            "fields": {KOSZTORYS_URL_FIELD: expected_url},
        })
        logger.info(f"[Kosztorys URL] Wrote {expected_url} to deal {deal_id}")
    except Exception as e:
        logger.warning(f"[Kosztorys URL] Failed for deal {deal_id}: {e}")


# ─── Equipment auto-parse ─────────────────────────────────────────────────────

async def sync_deal_equipment(gateway, deal_id: int, deal: dict) -> None:
    """
    When a Wycena PDF is attached to WYCENA_PDF_FIELD, parse the standard
    equipment list and write it to WYPOSAZENIE_STD_FIELD.

    Idempotent — only parses when the equipment field is currently empty, so
    re-firing webhooks on every deal update doesn't re-download and re-parse
    the PDF. Failures are logged but never propagate (called via
    BackgroundTasks alongside other webhook handlers — must not derail
    siblings).
    """
    try:
        # 1. Is a Wycena PDF attached?
        pdf_field = deal.get(WYCENA_PDF_FIELD)
        if not pdf_field:
            return  # no PDF → nothing to do

        # 2. Idempotency: skip if equipment already populated.
        existing = deal.get(WYPOSAZENIE_STD_FIELD)
        if existing and isinstance(existing, list) and any(
            str(x).strip() for x in existing
        ):
            logger.info(f"[Equipment] deal={deal_id}: equipment already "
                        f"populated, skipping parse")
            return

        # 3. Resolve file ID + download bytes.
        from services.bitrix_disk import get_deal_file_id, download_file_by_id
        file_id = await get_deal_file_id(gateway, deal_id, WYCENA_PDF_FIELD)
        if not file_id:
            logger.info(f"[Equipment] deal={deal_id}: no file_id resolved")
            return
        pdf_bytes = await download_file_by_id(deal_id, WYCENA_PDF_FIELD, file_id)

        # 4. Parse.
        from services.equipment_parser import parse_equipment_from_pdf
        items = parse_equipment_from_pdf(pdf_bytes)
        if not items:
            logger.warning(f"[Equipment] deal={deal_id}: parser returned "
                           f"0 items, not writing")
            return

        # 5. Write the equipment list to Bitrix.
        await gateway.call("crm.deal.update", {
            "ID": deal_id,
            "fields": {WYPOSAZENIE_STD_FIELD: items},
        })
        logger.info(f"[Equipment] deal={deal_id}: wrote {len(items)} "
                    f"equipment items from Wycena PDF")
    except Exception as e:
        logger.warning(f"[Equipment] deal={deal_id}: failed (non-fatal): {e}")


# ─── OAuth install / callback endpoints ───────────────────────────────────────

@router.post("/bitrix/oauth/install")
async def bitrix_oauth_install(request: Request):
    """
    Called by Bitrix24 when the local app is installed.
    Captures the initial access_token and refresh_token.
    """
    content_type = request.headers.get("content-type", "")
    try:
        if "application/json" in content_type:
            body = await request.json()
        else:
            form = await request.form()
            body = dict(form)
    except Exception as e:
        logger.error(f"[OAuth Install] Parse error: {e}")
        return {"status": "error", "detail": str(e)}

    logger.info(f"[OAuth Install] Received: {body}")

    # Extract tokens from install payload
    auth_id = body.get("AUTH_ID", "") or body.get("auth[access_token]", "")
    refresh_id = body.get("REFRESH_ID", "") or body.get("auth[refresh_token]", "")
    expires_in = int(body.get("AUTH_EXPIRES", 3600) or 3600)
    domain = body.get("DOMAIN", "") or body.get("auth[domain]", "")
    member_id = body.get("member_id", "") or body.get("auth[member_id]", "")

    if auth_id and refresh_id:
        from services.bitrix_oauth import get_oauth
        oauth = get_oauth()
        oauth.store_tokens(
            access_token=auth_id,
            refresh_token=refresh_id,
            expires_in=expires_in,
            domain=domain,
            member_id=member_id,
        )
        logger.info(f"[OAuth Install] ✅ Tokens stored from app install (domain={domain})")
        return {"status": "ok", "message": "OAuth tokens stored successfully"}
    else:
        logger.warning(f"[OAuth Install] No tokens in payload, keys: {list(body.keys())}")
        return {"status": "warning", "message": "No tokens found in install payload"}


@router.get("/bitrix/oauth/callback")
async def bitrix_oauth_callback(request: Request):
    """OAuth callback — exchanges authorization code for tokens."""
    code = request.query_params.get("code", "")
    domain = request.query_params.get("domain", "")
    member_id = request.query_params.get("member_id", "")

    if not code:
        return {"status": "error", "message": "No authorization code provided"}

    client_id = os.getenv("BITRIX_APP_ID", "")
    client_secret = os.getenv("BITRIX_APP_SECRET", "")

    if not client_id or not client_secret:
        return {"status": "error", "message": "BITRIX_APP_ID or BITRIX_APP_SECRET not configured"}

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get("https://oauth.bitrix.info/oauth/token/", params={
                "grant_type": "authorization_code",
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
            })

            data = resp.json()
            logger.info(f"[OAuth Callback] Token response: {resp.status_code}")

            if "error" in data:
                logger.error(f"[OAuth Callback] Error: {data}")
                return {"status": "error", "detail": data}

            from services.bitrix_oauth import get_oauth
            oauth = get_oauth()
            oauth.store_tokens(
                access_token=data["access_token"],
                refresh_token=data["refresh_token"],
                expires_in=int(data.get("expires_in", 3600)),
                domain=data.get("domain", domain),
                member_id=data.get("member_id", member_id),
            )

            return {"status": "ok", "message": "✅ OAuth authorized! PDF sync is now active."}

    except Exception as e:
        logger.error(f"[OAuth Callback] Exception: {e}")
        return {"status": "error", "detail": str(e)}


@router.get("/bitrix/oauth/status")
async def bitrix_oauth_status():
    """Check OAuth token status."""
    from services.bitrix_oauth import get_oauth
    return get_oauth().get_status()


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

        # ─── Background: Auto-write public kosztorys URL when Eurotax
        # PDF is attached to UF_CRM_1775497355115. Idempotent. Runs
        # alongside doc sync — independent failure domain.
        background_tasks.add_task(sync_deal_kosztorys_url, gateway, int(deal_id), deal)

        # ─── Background: Auto-parse standard equipment when a Wycena PDF
        # is attached to UF_CRM_1779285905944. Idempotent (skips when the
        # equipment field is already populated). Independent failure domain.
        background_tasks.add_task(sync_deal_equipment, gateway, int(deal_id), deal)

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
