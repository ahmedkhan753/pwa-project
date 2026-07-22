"""
Public customer documents endpoints — token-guarded, no login.

    GET /api/documents/{token}              → page JSON
    GET /api/documents/{token}/file/{index} → streams the PDF

The token is the only credential (see services.valuation_documents). Nothing
here returns a Bitrix auth token, file id or internal URL: PDFs are fetched
server-side through services.bitrix_disk (OAuth) and streamed to the client,
so Bitrix credentials never leave the backend.

Unknown token / index always 404s — no information leak about which deals
or documents exist.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from services.valuation_documents import (
    collect_available_documents,
    get_document_field,
    resolve_deal_id_by_token,
)

router = APIRouter(prefix="/documents", tags=["Client Documents"])
logger = logging.getLogger("routers.documents")


async def _load_deal(request: Request, deal_id: int) -> Optional[Dict[str, Any]]:
    """crm.deal.get via the shared gateway. None when unavailable."""
    gateway = getattr(request.app.state, "gateway", None)
    if not gateway or not getattr(request.app.state, "bitrix_ready", False):
        logger.warning("[documents] Bitrix gateway not ready")
        return None
    try:
        deal = await gateway.call("crm.deal.get", {"id": deal_id})
        return deal if isinstance(deal, dict) else None
    except Exception as e:
        logger.warning(f"[documents] crm.deal.get failed deal={deal_id}: {e}")
        return None


async def _resolve_token(request: Request, token: str):
    """(deal_id, deal) for a valid token. 404s on anything unknown."""
    deal_id = resolve_deal_id_by_token(token)
    if deal_id is None:
        # Unknown token — same response as a missing deal, no leak.
        raise HTTPException(status_code=404, detail="Nie znaleziono")
    deal = await _load_deal(request, deal_id)
    if deal is None:
        raise HTTPException(status_code=404, detail="Nie znaleziono")
    return deal_id, deal


@router.get("/{token}")
async def get_client_documents(token: str, request: Request):
    """JSON for the public documents page."""
    deal_id, deal = await _resolve_token(request, token)

    # Vehicle identity + hero photo come from the SAME source as the
    # conditional report, so the car photo matches what the client already
    # sees there. Only the few presentational fields are surfaced — the rest
    # of the report payload is deliberately not exposed.
    vehicle_title = ""
    plate = ""
    hero_image_url = None
    try:
        from routers.report import get_report
        rep = await get_report(deal_id, request)
        if isinstance(rep, dict):
            veh = rep.get("vehicle") or {}
            make = str(veh.get("make") or "").strip()
            model = str(veh.get("model") or "").strip()
            vehicle_title = f"{make} {model}".strip()
            plate = str(veh.get("registration_plate") or "").strip()
            hero_image_url = rep.get("hero_photo_url") or None
    except Exception as e:
        # Presentation only — the documents still render without it.
        logger.warning(f"[documents] deal {deal_id}: report lookup failed: {e}")

    if not vehicle_title:
        vehicle_title = str(deal.get("TITLE") or "").strip()

    contact_name = ""
    contact_id = str(deal.get("CONTACT_ID") or "").strip()
    if contact_id and contact_id != "0":
        try:
            gateway = getattr(request.app.state, "gateway", None)
            contact = await gateway.call("crm.contact.get", {"ID": contact_id})
            if isinstance(contact, dict):
                contact_name = " ".join(
                    p for p in [
                        str(contact.get("NAME") or "").strip(),
                        str(contact.get("LAST_NAME") or "").strip(),
                    ] if p
                ).strip()
        except Exception as e:
            logger.warning(f"[documents] deal {deal_id}: contact lookup failed: {e}")

    documents = []
    for item in collect_available_documents(deal):
        documents.append({
            "label": item["label"],
            "kind": item["kind"],
            # PDFs point at our proxy; links pass through untouched.
            "url": item["url"] if item["kind"] == "link"
                   else f"/api/documents/{token}/file/{item['index']}",
        })

    logger.info(
        f"[documents] deal {deal_id}: served page JSON with "
        f"{len(documents)} document(s)"
    )
    return {
        "deal_id": deal_id,
        "vehicle_title": vehicle_title,
        "plate": plate,
        "hero_image_url": hero_image_url,
        "contact_name": contact_name,
        "documents": documents,
    }


@router.get("/{token}/file/{index}")
async def get_client_document_file(token: str, index: int, request: Request):
    """Stream a valuation PDF, fetched from Bitrix server-side."""
    deal_id, deal = await _resolve_token(request, token)

    entry = get_document_field(index)
    if entry is None:
        raise HTTPException(status_code=404, detail="Nie znaleziono")
    label, field, kind = entry
    if kind != "file":
        # url-kind items are linked directly by the page — nothing to proxy.
        raise HTTPException(status_code=404, detail="Nie znaleziono")

    value = deal.get(field)
    if not value:
        raise HTTPException(status_code=404, detail="Nie znaleziono")

    from services.bitrix_disk import _extract_file_id, download_file_by_id
    file_id = _extract_file_id(value)
    if not file_id:
        logger.warning(
            f"[documents] deal {deal_id}: no file id on {field} ({label})"
        )
        raise HTTPException(status_code=404, detail="Nie znaleziono")

    try:
        pdf_bytes = await download_file_by_id(deal_id, field, file_id)
    except Exception as e:
        # Bitrix-side failure (OAuth missing, token rejected, HTTP error).
        # 502 — the token/index were valid, the upstream fetch failed.
        logger.error(
            f"[documents] deal {deal_id}: download failed for {field} "
            f"({label}) file_id={file_id}: {e}"
        )
        raise HTTPException(status_code=502, detail="Nie udało się pobrać pliku")

    safe_label = "".join(
        c if (c.isalnum() or c in "-_") else "_" for c in label
    ).strip("_") or "dokument"
    filename = f"{safe_label}_{deal_id}.pdf"

    logger.info(
        f"[documents] deal {deal_id}: streamed {field} ({label}) "
        f"{len(pdf_bytes)} bytes"
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )
