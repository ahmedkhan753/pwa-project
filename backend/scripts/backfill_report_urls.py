"""
Backfill missing Bitrix URL fields for inspections that completed
DB-side (inspection_records exists) but whose foreground submit died
before _background_submit could write the URLs to Bitrix.

Submit-flow bugs in late April 2026 (iOS keepalive abort, 64KB
keepalive cap, DOM unmount race) caused POST /inspection/submit to
fail on the device for many inspections — _background_submit never
ran, so the report URL (UF_CRM_1775247032324), gallery URL
(UF_CRM_1775683960588), and Wycena PDF (UF_CRM_1776326624394) were
never populated. Issue 5 of the QA report 2026-04-29.

Strategy: walk every InspectionRecord row → for each deal, check if
the Bitrix URL fields are populated → if not, write the URL (cheap
crm.deal.update) and optionally re-build & upload the Wycena PDF.

USAGE (dry-run first):
    python -m backend.scripts.backfill_report_urls --dry-run
    python -m backend.scripts.backfill_report_urls --apply --limit 5
    python -m backend.scripts.backfill_report_urls --apply --include-pdf --limit 5

--apply       perform the crm.deal.update calls (default: dry-run)
--include-pdf also rebuild + upload Protokół Wycena PDF (slower; off
              by default since URL backfill is the main win)
--limit N     cap deals processed per run (default: unlimited)
--deal-id ID  process exactly one deal (overrides --limit)
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import logging
import os
import sys
from types import SimpleNamespace
from typing import List, Optional

_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.dirname(_HERE)
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from database import SessionLocal                                   # type: ignore
from models.inspector import InspectionRecord                        # type: ignore
from services.bitrix_gateway import BitrixGateway                    # type: ignore
from services.bitrix_discovery import BitrixFieldDiscovery           # type: ignore

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("backfill_urls")

REPORT_URL_FIELD = "UF_CRM_1775247032324"
GALLERY_URL_FIELD = "UF_CRM_1775683960588"
WYCENA_PDF_FIELD = "UF_CRM_1776326624394"
PUBLIC_BASE = "https://app.zaufajrzeczoznawcy.pl"


def _candidate_deal_ids(limit: Optional[int], deal_id: Optional[int]) -> List[int]:
    db = SessionLocal()
    try:
        q = db.query(InspectionRecord.deal_id).order_by(InspectionRecord.deal_id.desc())
        if deal_id:
            q = q.filter(InspectionRecord.deal_id == deal_id)
        if limit:
            q = q.limit(limit)
        return [row[0] for row in q.all()]
    finally:
        db.close()


async def _bitrix_field_value(gateway: BitrixGateway, deal_id: int, field: str) -> str:
    """Return current value of one Bitrix field for the deal, '' if missing."""
    try:
        resp = await gateway.call("crm.deal.get", {"ID": deal_id})
        if not isinstance(resp, dict):
            return ""
        v = resp.get(field)
        if v is None:
            return ""
        return str(v).strip()
    except Exception as e:
        logger.warning(f"deal {deal_id}: get failed: {e}")
        return ""


async def _backfill_one(
    gateway: BitrixGateway,
    deal_id: int,
    apply: bool,
    include_pdf: bool,
) -> dict:
    result = {"deal_id": deal_id, "report_url": "skipped", "gallery_url": "skipped", "wycena_pdf": "skipped"}

    # Fetch the deal once and read all relevant fields
    try:
        deal = await gateway.call("crm.deal.get", {"ID": deal_id})
    except Exception as e:
        logger.warning(f"deal {deal_id}: get failed: {e}")
        result["report_url"] = "error: get failed"
        return result
    if not isinstance(deal, dict):
        result["report_url"] = "error: deal not found"
        return result

    have_report = bool(str(deal.get(REPORT_URL_FIELD) or "").strip())
    have_gallery = bool(str(deal.get(GALLERY_URL_FIELD) or "").strip())
    have_wycena = bool(deal.get(WYCENA_PDF_FIELD))  # file fields return non-empty obj/list

    fields_to_set: dict = {}
    if not have_report:
        fields_to_set[REPORT_URL_FIELD] = f"{PUBLIC_BASE}/report/{deal_id}"
        result["report_url"] = "would set" if not apply else "set"
    else:
        result["report_url"] = "already present"

    if not have_gallery:
        fields_to_set[GALLERY_URL_FIELD] = f"{PUBLIC_BASE}/gallery/{deal_id}"
        result["gallery_url"] = "would set" if not apply else "set"
    else:
        result["gallery_url"] = "already present"

    if fields_to_set and apply:
        try:
            await gateway.call("crm.deal.update", {"ID": deal_id, "fields": fields_to_set})
        except Exception as e:
            logger.warning(f"deal {deal_id}: URL update failed: {e}")
            for k in fields_to_set:
                if k == REPORT_URL_FIELD:
                    result["report_url"] = f"error: {e}"
                if k == GALLERY_URL_FIELD:
                    result["gallery_url"] = f"error: {e}"

    if include_pdf and not have_wycena:
        result["wycena_pdf"] = "would build" if not apply else "build"
        if apply:
            try:
                # Lazy import — heavyweight modules
                from routers.report import get_report                  # type: ignore
                from services.protokol_wycena_pdf import build_protokol_wycena_pdf  # type: ignore

                stub_request = SimpleNamespace(
                    app=SimpleNamespace(
                        state=SimpleNamespace(gateway=gateway, bitrix_ready=True)
                    )
                )
                report_payload = await get_report(deal_id, stub_request)
                pdf_bytes = build_protokol_wycena_pdf(report_payload)
                pdf_b64 = base64.b64encode(pdf_bytes).decode("utf-8")
                pdf_filename = f"Protokol_wycena_{deal_id}.pdf"
                await gateway.call("crm.deal.update", {
                    "ID": deal_id,
                    "fields": {WYCENA_PDF_FIELD: {"fileData": [pdf_filename, pdf_b64]}}
                })
                result["wycena_pdf"] = f"uploaded ({len(pdf_bytes)} bytes)"
            except Exception as e:
                logger.warning(f"deal {deal_id}: PDF backfill failed: {e}", exc_info=True)
                result["wycena_pdf"] = f"error: {e}"
    elif have_wycena:
        result["wycena_pdf"] = "already present"

    return result


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply",       action="store_true", help="actually write to Bitrix (default: dry-run)")
    ap.add_argument("--include-pdf", action="store_true", help="also rebuild + upload Protokół Wycena PDF")
    ap.add_argument("--limit",       type=int, default=None, help="cap deals processed")
    ap.add_argument("--deal-id",     type=int, default=None, help="process exactly one deal")
    args = ap.parse_args()

    if not args.apply:
        logger.info("DRY-RUN — no Bitrix writes will be performed (use --apply to actually run)")

    webhook_url = os.getenv("BITRIX_WEBHOOK_URL")
    if not webhook_url:
        logger.error("BITRIX_WEBHOOK_URL env var not set")
        return 2

    gateway = BitrixGateway(webhook_url)
    discovery = BitrixFieldDiscovery(gateway)
    await discovery.bootstrap()  # safety: ensure bitrix is reachable

    deal_ids = _candidate_deal_ids(args.limit, args.deal_id)
    logger.info(f"Found {len(deal_ids)} candidate deals from inspection_records")

    summary = {"set_report": 0, "set_gallery": 0, "uploaded_pdf": 0, "errors": 0, "already_ok": 0}
    for did in deal_ids:
        r = await _backfill_one(gateway, did, args.apply, args.include_pdf)
        logger.info(
            f"deal {r['deal_id']}: report={r['report_url']} gallery={r['gallery_url']} pdf={r['wycena_pdf']}"
        )
        if "error" in r["report_url"] or "error" in r["gallery_url"] or "error" in r["wycena_pdf"]:
            summary["errors"] += 1
        if r["report_url"] in ("set", "would set"):
            summary["set_report"] += 1
        if r["gallery_url"] in ("set", "would set"):
            summary["set_gallery"] += 1
        if "uploaded" in r["wycena_pdf"] or "would build" in r["wycena_pdf"]:
            summary["uploaded_pdf"] += 1
        if r["report_url"] == "already present" and r["gallery_url"] == "already present":
            summary["already_ok"] += 1

    logger.info(f"DONE — {summary}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
