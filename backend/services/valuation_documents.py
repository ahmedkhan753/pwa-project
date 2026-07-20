"""
Valuation-documents shared layer.

Single source of truth for the 5 client-facing valuation documents:
their Bitrix field ids, how they are resolved off a deal, and the
unguessable per-deal token that fronts the public documents page.

Used by:
  - routers.webhook   → decides whether there is anything to send, and
                        builds the one-link email.
  - routers.documents → serves the public page JSON + proxies the PDFs.

Design rule: nothing in here ever hands a Bitrix auth token, file id or
internal URL to a customer. File-kind documents are served exclusively
through the backend proxy (routers.documents), which downloads them
server-side via services.bitrix_disk.
"""
from __future__ import annotations

import logging
import os
import secrets
from typing import Any, Dict, List, Optional

logger = logging.getLogger("services.valuation_documents")

# Bitrix portal base — used to absolutise relative paths on url-kind fields.
BITRIX_PORTAL_BASE = os.getenv(
    "BITRIX_PORTAL_BASE", "https://b24-05xr3e.bitrix24.pl"
)

# The 5 documents: (Polish label, field id, kind).
# kind "file" → Bitrix file field (dict / list of dicts) → served via proxy.
# kind "url"  → plain string (our own dynamic report/kosztorys link).
# Field ids are env-overridable, mirroring the EUROTAX_PDF_FIELD pattern.
VALUATION_DOCUMENTS = [
    ("Ekspertyza / wycena",
     os.getenv("BITRIX_DOC_EKSPERTYZA_FIELD", "UF_CRM_1781946304743"), "file"),
    ("Ekspertyza / wycena bez wartości i cen",
     os.getenv("BITRIX_DOC_EKSPERTYZA_BEZ_CEN_FIELD", "UF_CRM_1782744503261"), "file"),
    ("PDF na aukcję",
     os.getenv("BITRIX_DOC_PDF_AUKCJA_FIELD", "UF_CRM_1781945784841"), "file"),
    ("Link do raportu dynamicznego na aukcje",
     os.getenv("BITRIX_DOC_RAPORT_LINK_FIELD", "UF_CRM_1782903457811"), "url"),
    ("Kosztorys dynamiczny rozliczeniowy",
     os.getenv("BITRIX_DOC_KOSZTORYS_LINK_FIELD", "UF_CRM_1782903520442"), "url"),
]


def collect_available_documents(deal: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Return the documents actually present on this deal.

    Each item: {"index": int, "label": str, "kind": "pdf"|"link", "url": str|None}
      - index is the position in VALUATION_DOCUMENTS (stable regardless of
        which documents are present) — the proxy addresses files by it.
      - kind "pdf"  → url is None; the caller builds the proxy URL.
        kind "link" → url is the external link, safe to expose.
    Empty / unresolvable fields are omitted so nothing renders broken.
    """
    out: List[Dict[str, Any]] = []
    for idx, (label, field, kind) in enumerate(VALUATION_DOCUMENTS):
        value = deal.get(field)
        if not value:
            continue
        if kind == "url":
            url = str(value).strip()
            if not url:
                continue
            if not url.startswith("http"):
                url = f"{BITRIX_PORTAL_BASE.rstrip('/')}{url}"
            out.append({"index": idx, "label": label, "kind": "link", "url": url})
        else:
            # File fields are never exposed directly — the proxy resolves the
            # file id and streams the bytes server-side.
            out.append({"index": idx, "label": label, "kind": "pdf", "url": None})
    return out


def get_document_field(index: int) -> Optional[tuple]:
    """(label, field, kind) for a config index, or None when out of range."""
    if not isinstance(index, int) or index < 0 or index >= len(VALUATION_DOCUMENTS):
        return None
    return VALUATION_DOCUMENTS[index]


def get_or_create_token(deal_id: int) -> Optional[str]:
    """Return this deal's public documents token, creating it if absent.

    Stable across re-sends: an existing token is always reused so links in
    already-delivered emails keep working. Returns None if the DB is
    unavailable (caller treats that as "cannot build a link").
    """
    from database import SessionLocal
    from models.inspector import ValuationDelivery

    db = None
    try:
        db = SessionLocal()
        row = (
            db.query(ValuationDelivery)
            .filter(ValuationDelivery.deal_id == deal_id)
            .first()
        )
        if row is None:
            row = ValuationDelivery(deal_id=deal_id, status="pending")
            db.add(row)
        if not row.token:
            row.token = secrets.token_urlsafe(32)
        db.commit()
        return row.token
    except Exception as e:
        if db is not None:
            db.rollback()
        logger.warning(
            f"[valuation-delivery] deal {deal_id}: could not mint token: {e}"
        )
        return None
    finally:
        if db is not None:
            db.close()


def resolve_deal_id_by_token(token: str) -> Optional[int]:
    """Reverse the public token to a deal id. None when unknown."""
    if not token or not isinstance(token, str):
        return None
    from database import SessionLocal
    from models.inspector import ValuationDelivery

    db = None
    try:
        db = SessionLocal()
        row = (
            db.query(ValuationDelivery)
            .filter(ValuationDelivery.token == token)
            .first()
        )
        return int(row.deal_id) if row is not None else None
    except Exception as e:
        logger.warning(f"[valuation-delivery] token lookup failed: {e}")
        return None
    finally:
        if db is not None:
            db.close()
