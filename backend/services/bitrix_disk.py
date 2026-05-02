"""
Bitrix24 file-download helpers — OAuth-authenticated.

CRM custom file fields (UF_CRM_*) are stored in Bitrix's `b_file` table,
NOT the Disk module, so the Disk REST API (`disk.file.getDownloadUrl`,
`disk.attachedObject.get`) doesn't apply to them. The supported public
download path for `b_file` entries is:

    GET /bitrix/components/bitrix/crm.deal.show/show_file.php
        ?auth={oauth_access_token}
        &ownerId={deal_id}
        &fieldName={UF_CRM_*}
        &fileId={file_id}
        &dynamic=Y

Webhook-key auth tokens DO NOT work with show_file.php — only an OAuth
access token from an installed Local App (services.bitrix_oauth.get_oauth)
will return the binary. Bitrix replies with the HTML login page if the
token is missing or wrong.

This module is the single place that knows that quirk, so the kosztorys
router and any future caller can stay clean.
"""
from __future__ import annotations

import logging
import os
import re
from typing import Any, Optional, Union

import httpx

from services.bitrix_oauth import get_oauth

logger = logging.getLogger("bitrix_disk")


def _base_domain() -> str:
    """Extract https://b24-XXXXXX.bitrix24.pl from BITRIX_WEBHOOK_URL env."""
    webhook_url = os.getenv("BITRIX_WEBHOOK_URL", "")
    m = re.match(r"(https?://[^/]+)", webhook_url)
    return m.group(1) if m else ""


def _extract_file_id(field_value: Any) -> Optional[int]:
    """
    Bitrix file fields appear in several shapes — handle them all:
        - bare int / numeric str:    `8390`
        - dict with id keys:         `{"id": 8390, "showUrl": "...", ...}`
        - list of int / list of dict (multi-file fields)
        - None / empty
    Returns the first numeric file ID we find, or None.
    """
    if field_value is None or field_value == "":
        return None
    if isinstance(field_value, (int, float)):
        return int(field_value)
    if isinstance(field_value, str):
        s = field_value.strip()
        return int(s) if s.isdigit() else None
    if isinstance(field_value, dict):
        for k in ("id", "ID", "fileId", "FILE_ID"):
            v = field_value.get(k)
            if v is None:
                continue
            if isinstance(v, (int, float)):
                return int(v)
            if isinstance(v, str) and v.isdigit():
                return int(v)
        return None
    if isinstance(field_value, list) and field_value:
        return _extract_file_id(field_value[0])
    return None


async def get_deal_file_id(
    gateway,
    deal_id: int,
    field_name: str,
) -> Optional[int]:
    """
    Read a CRM custom file field from a deal and return the file_id.

    Uses the BitrixGateway singleton (webhook-key auth) for crm.deal.get —
    fine because crm.deal.get itself doesn't need OAuth, only the binary
    download via show_file.php does.

    Returns None if the field is empty, the deal doesn't exist, or the
    Bitrix call fails (caller decides how to surface).
    """
    try:
        deal = await gateway.call("crm.deal.get", {"ID": deal_id})
    except Exception as e:
        logger.warning(f"[bitrix_disk] crm.deal.get failed deal={deal_id}: {e}")
        return None
    if not isinstance(deal, dict):
        return None
    return _extract_file_id(deal.get(field_name))


async def download_file_by_id(
    deal_id: int,
    field_name: str,
    file_id: Union[int, str],
) -> bytes:
    """
    Download a single CRM file-field attachment by file_id, OAuth-authed.

    Raises RuntimeError with one of these short codes so the router can
    map to a meaningful HTTP status:
      - "oauth_not_configured"      → 503 (app needs install)
      - "oauth_token_unavailable"   → 503 (refresh failed)
      - "bitrix_base_domain_unset"  → 503 (env misconfig)
      - "http_{N}"                  → 502 (bitrix returned non-200)
      - "bitrix_returned_html_login_page" → 502 (auth rejected)
      - "bitrix_returned_empty_body"      → 502 (truncated)
    On success returns the raw binary file contents.
    """
    oauth = get_oauth()
    if not oauth.has_tokens():
        raise RuntimeError("oauth_not_configured")

    token = await oauth.get_valid_token()
    if not token:
        raise RuntimeError("oauth_token_unavailable")

    base = _base_domain()
    if not base:
        raise RuntimeError("bitrix_base_domain_unset")

    url = (
        f"{base}/bitrix/components/bitrix/crm.deal.show/show_file.php"
        f"?auth={token}&ownerId={deal_id}&fieldName={field_name}"
        f"&fileId={file_id}&dynamic=Y"
    )

    logger.info(
        f"[bitrix_disk] GET show_file deal={deal_id} field={field_name} "
        f"file_id={file_id}"
    )
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(url)

    ct = resp.headers.get("content-type", "")
    if resp.status_code != 200:
        logger.warning(
            f"[bitrix_disk] HTTP {resp.status_code} for deal={deal_id} "
            f"field={field_name} file_id={file_id}"
        )
        raise RuntimeError(f"http_{resp.status_code}")
    if "text/html" in ct.lower():
        # Bitrix returns the login HTML if the token is rejected.
        logger.warning(
            f"[bitrix_disk] HTML body returned for deal={deal_id} — token rejected"
        )
        raise RuntimeError("bitrix_returned_html_login_page")
    if len(resp.content) < 100:
        raise RuntimeError("bitrix_returned_empty_body")

    logger.info(
        f"[bitrix_disk] ✅ downloaded deal={deal_id} field={field_name} "
        f"file_id={file_id} bytes={len(resp.content)} ct={ct}"
    )
    return resp.content
