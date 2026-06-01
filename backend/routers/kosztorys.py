"""
Kosztorys (Eurotax appraisal) router.

Public endpoints (matches /api/protokol/{id}/pdf pattern — no auth):
  GET  /api/kosztorys/{deal_id}            → parsed JSON for the deal
  POST /api/kosztorys/parse-test           → parse an uploaded PDF (dev/test)

Bitrix file field is read from env BITRIX_EUROTAX_FIELD (default
UF_CRM_1775497355115). Files live in `b_file` storage so download
must go through services.bitrix_disk (OAuth-authed show_file.php).
"""
from __future__ import annotations

import logging
import os
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, Tuple

from fastapi import APIRouter, File, HTTPException, Request, UploadFile

from services.eurotax_parser import parse_eurotax_pdf
from services.eurotax_nr34_parser import parse_eurotax_nr34
from services.eurotax_format import detect_format
from services.bitrix_disk import get_deal_file_id, download_file_by_id
from services.bitrix_oauth import get_oauth

router = APIRouter(prefix="/kosztorys", tags=["Kosztorys"])
logger = logging.getLogger("routers.kosztorys")


def _parse_kosztorys_pdf(pdf_path: str) -> Dict[str, Any]:
    """Dispatch to the right parser based on the PDF's format markers.
    Falls through to the original parser whenever the nr34 markers
    aren't both present (see services.eurotax_format)."""
    fmt = detect_format(pdf_path)
    if fmt == "nr34":
        logger.info("[Kosztorys] dispatching to nr34 (netto) parser")
        return parse_eurotax_nr34(pdf_path)
    return parse_eurotax_pdf(pdf_path)

EUROTAX_PDF_FIELD = os.getenv("BITRIX_EUROTAX_FIELD", "UF_CRM_1775497355115")

# In-memory parsed-PDF cache.
# Key:   (deal_id, file_id) — different file_id means a re-uploaded PDF.
# Value: (timestamp, parsed_payload).
# Re-parse if file_id changes or after _CACHE_TTL seconds.
_CACHE: Dict[Tuple[int, int], Tuple[float, Dict[str, Any]]] = {}
_CACHE_TTL = 300  # 5 min


@router.get("/{deal_id}")
async def get_kosztorys(deal_id: int, request: Request):
    """
    Resolve the Eurotax PDF for a deal, parse, return JSON.

    Pipeline:
      1. crm.deal.get → read UF_CRM_1775497355115 file_id
      2. show_file.php?auth={oauth_token} → bytes
      3. eurotax_parser.parse_eurotax_pdf → KosztorysData
    """
    gateway = getattr(request.app.state, "gateway", None)
    bitrix_ready = getattr(request.app.state, "bitrix_ready", False)
    if not bitrix_ready or gateway is None:
        logger.warning(f"[Kosztorys] deal={deal_id}: gateway not ready")
        raise HTTPException(status_code=503, detail="Bitrix gateway not ready")

    oauth = get_oauth()
    if not oauth.has_tokens():
        logger.warning(f"[Kosztorys] deal={deal_id}: OAuth not configured")
        raise HTTPException(
            status_code=503,
            detail="OAuth not configured. Reinstall the Bitrix Local App.",
        )

    # Step 1 — resolve file_id from the deal
    logger.info(f"[Kosztorys] deal={deal_id}: looking up {EUROTAX_PDF_FIELD}")
    try:
        file_id = await get_deal_file_id(gateway, deal_id, EUROTAX_PDF_FIELD)
    except Exception as e:
        logger.warning(f"[Kosztorys] deal={deal_id}: deal lookup failed: {e}")
        raise HTTPException(status_code=502, detail=f"Bitrix deal lookup failed: {e}")

    if not file_id:
        logger.info(f"[Kosztorys] deal={deal_id}: no Eurotax PDF attached")
        raise HTTPException(
            status_code=404,
            detail={
                "error":   "no_eurotax_pdf",
                "message": "Eurotax PDF jeszcze nie został przesłany dla tego zlecenia",
            },
        )

    # Cache hit? Same deal + same file_id within TTL.
    now = time.time()
    key = (deal_id, int(file_id))
    cached = _CACHE.get(key)
    if cached and (now - cached[0]) < _CACHE_TTL:
        logger.info(f"[Kosztorys] deal={deal_id}: cache hit (file_id={file_id})")
        return cached[1]

    # Step 2 — download bytes via OAuth-authed show_file.php
    logger.info(f"[Kosztorys] deal={deal_id}: downloading file_id={file_id}")
    try:
        pdf_bytes = await download_file_by_id(deal_id, EUROTAX_PDF_FIELD, file_id)
    except RuntimeError as e:
        code = str(e)
        if code in ("oauth_not_configured", "oauth_token_unavailable"):
            logger.warning(f"[Kosztorys] deal={deal_id}: oauth issue '{code}'")
            raise HTTPException(status_code=503, detail=f"OAuth issue: {code}")
        if code == "bitrix_base_domain_unset":
            raise HTTPException(status_code=503, detail="BITRIX_WEBHOOK_URL env not set")
        logger.warning(f"[Kosztorys] deal={deal_id}: download failed: {code}")
        raise HTTPException(status_code=502, detail=f"Bitrix file download failed: {code}")

    # Step 3 — parse PDF (write to a temp file because pdfplumber wants a path)
    logger.info(f"[Kosztorys] deal={deal_id}: parsing {len(pdf_bytes)} bytes")
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    try:
        tmp.write(pdf_bytes)
        tmp.flush()
        tmp.close()
        try:
            data = _parse_kosztorys_pdf(tmp.name)
        except Exception as e:
            logger.error(
                f"[Kosztorys] deal={deal_id}: parser raised: {e}", exc_info=True
            )
            raise HTTPException(status_code=500, detail=f"Parser failed: {e}")
    finally:
        try:
            Path(tmp.name).unlink(missing_ok=True)
        except Exception:
            pass

    payload: Dict[str, Any] = {
        "deal_id": deal_id,
        "file_id": int(file_id),
        **data,
    }

    # Update cache. Drop any stale entries for this deal_id whose file_id
    # differs (re-upload invalidation).
    _CACHE[key] = (now, payload)
    for k in list(_CACHE.keys()):
        if k[0] == deal_id and k != key:
            del _CACHE[k]

    logger.info(f"[Kosztorys] deal={deal_id}: ✅ returned parsed JSON")
    return payload


@router.post("/parse-test")
async def parse_test(file: UploadFile = File(...)):
    """
    Dev endpoint — accepts an uploaded Eurotax PDF and returns parsed JSON.
    Useful for end-to-end testing without round-tripping through Bitrix.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted")

    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 20 MB)")

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    try:
        tmp.write(content)
        tmp.flush()
        tmp.close()
        data = _parse_kosztorys_pdf(tmp.name)
        return {"deal_id": None, "filename": file.filename, **data}
    finally:
        try:
            Path(tmp.name).unlink(missing_ok=True)
        except Exception:
            pass
