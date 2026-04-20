"""
Bulk-regenerate Protokół Wycena PDFs for deals in given stages.

USAGE (dry-run first, ALWAYS):
    python -m backend.scripts.bulk_regen_protokol --dry-run
    python -m backend.scripts.bulk_regen_protokol --stages UC_0T9W8E,EXECUTING --limit 5
    python -m backend.scripts.bulk_regen_protokol --upload --limit 5     # real run

Safety: --upload is OFF by default. Without it the script builds the PDF in
memory and discards it — useful to prove the pipeline works for a deal set
without touching Bitrix. Fouzan must authorize --upload runs explicitly.

Stages (per backend/routers/deals.py STAGE_STATUS_MAP):
  UC_0T9W8E  = "oględziny zakończone" (completed)
  EXECUTING  = "gotowe / w wycenie"   (in_valuation)
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import logging
import os
import sys
from types import SimpleNamespace
from typing import List

# Allow `python backend/scripts/bulk_regen_protokol.py` without -m
_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.dirname(_HERE)
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from services.bitrix_gateway import BitrixGateway                  # type: ignore
from services.bitrix_discovery import BitrixFieldDiscovery          # type: ignore
from services.protokol_wycena_pdf import build_protokol_wycena_pdf  # type: ignore
from routers.report import get_report                               # type: ignore

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("bulk_regen")

DEFAULT_STAGES = ["UC_0T9W8E", "EXECUTING"]
WYCENA_FIELD_ID = "UF_CRM_1776326624394"


async def _fetch_candidate_deal_ids(gateway: BitrixGateway, stages: List[str], limit: int) -> List[int]:
    out: List[int] = []
    start = 0
    page_size = 50
    while len(out) < limit:
        params = {
            "filter": {"STAGE_ID": stages},
            "select": ["ID", "STAGE_ID"],
            "order":  {"ID": "DESC"},
            "start":  start,
        }
        resp = await gateway.call("crm.deal.list", params) or []
        if not resp:
            break
        for d in resp:
            try:
                out.append(int(d.get("ID")))
            except (TypeError, ValueError):
                continue
            if len(out) >= limit:
                break
        if len(resp) < page_size:
            break
        start += page_size
    return out


async def _process_one(gateway: BitrixGateway, deal_id: int, upload: bool) -> dict:
    stub = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(
        gateway=gateway, bitrix_ready=True, discovery=None,
    )))
    report_payload = await get_report(deal_id, stub)
    pdf_bytes = build_protokol_wycena_pdf(report_payload)
    result = {"deal_id": deal_id, "bytes": len(pdf_bytes), "uploaded": False}
    if upload:
        b64 = base64.b64encode(pdf_bytes).decode("utf-8")
        await gateway.call("crm.deal.update", {
            "ID": deal_id,
            "fields": {WYCENA_FIELD_ID: {"fileData": [f"Protokol_wycena_{deal_id}.pdf", b64]}},
        })
        result["uploaded"] = True
    return result


async def main_async(args: argparse.Namespace) -> int:
    gateway = BitrixGateway(webhook_url=os.environ["BITRIX_WEBHOOK_URL"])
    discovery = BitrixFieldDiscovery(gateway)
    try:
        await discovery.initialize()
    except Exception as e:
        logger.warning(f"Discovery init failed (non-fatal): {e}")

    stages = [s.strip() for s in args.stages.split(",") if s.strip()]
    ids = await _fetch_candidate_deal_ids(gateway, stages, args.limit)
    logger.info(f"Found {len(ids)} candidate deals in stages {stages} (limit={args.limit})")

    if args.dry_run:
        for i in ids:
            logger.info(f"[DRY] would regen deal {i}")
        return 0

    if args.upload and not args.i_have_fouzan_authorization:
        logger.error("Refusing to --upload without --i-have-fouzan-authorization flag.")
        return 2

    ok = 0
    fail = 0
    for deal_id in ids:
        try:
            r = await _process_one(gateway, deal_id, upload=args.upload)
            logger.info(f"OK deal {deal_id}: {r['bytes']} bytes, uploaded={r['uploaded']}")
            ok += 1
        except Exception as e:
            logger.error(f"FAIL deal {deal_id}: {e}", exc_info=True)
            fail += 1
    logger.info(f"Done. ok={ok} fail={fail} total={len(ids)}")
    return 0 if fail == 0 else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stages", default=",".join(DEFAULT_STAGES),
                    help="Comma-separated Bitrix STAGE_IDs to regen (default: %(default)s)")
    ap.add_argument("--limit", type=int, default=5,
                    help="Max deals to process (default: 5 — raise only after test batch).")
    ap.add_argument("--dry-run", action="store_true",
                    help="List deal IDs only, do not build or upload.")
    ap.add_argument("--upload", action="store_true",
                    help="Upload generated PDFs to Bitrix (overwrites existing).")
    ap.add_argument("--i-have-fouzan-authorization", action="store_true",
                    help="Required together with --upload. Prevents accidental prod writes.")
    args = ap.parse_args()
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    sys.exit(main())
