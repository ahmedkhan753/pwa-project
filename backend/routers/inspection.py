"""
Inspection Router
=================
Submit full inspections and save individual wizard steps.
"""

import logging
import json
from typing import Dict, Any, Optional
from fastapi import APIRouter, Request, HTTPException, Depends
from pydantic import BaseModel, field_validator, ConfigDict
from fastapi.responses import StreamingResponse, Response
import io

from models.inspection import (
    InspectionPayload,
    StepPartialData,
    SubmitResult,
    StepSaveResult,
)
from services.field_transformer import FieldTransformer
from deps import get_current_user

router = APIRouter(prefix="/inspection", tags=["Inspection"])
logger = logging.getLogger("routers.inspection")


@router.get("/{deal_id}/report")
async def get_inspection_report(
    deal_id: int,
    request: Request,
    current_user=Depends(get_current_user)
):
    """Stream PDF report — serves already-uploaded Bitrix PDF first, falls back to generation."""
    gateway = request.app.state.gateway
    # Extract Bitrix auth token from webhook URL (format: .../rest/USER_ID/TOKEN/)
    bitrix_auth_token = ""
    try:
        webhook_parts = gateway.webhook_url.rstrip("/").split("/")
        bitrix_auth_token = webhook_parts[-1] if webhook_parts else ""
    except Exception:
        pass

    try:
        deal = await gateway.call("crm.deal.get", {"id": deal_id})
        if not deal:
            raise HTTPException(status_code=404, detail="Deal not found")

        # Try to serve already-uploaded PDF from Bitrix first
        pdf_field = deal.get("UF_CRM_1772801617")
        if pdf_field:
            logger.info(f"PDF field content for deal {deal_id}: {pdf_field}")
            try:
                file_info = pdf_field[0] if isinstance(pdf_field, list) else pdf_field
                if isinstance(file_info, dict):
                    download_url = (
                        file_info.get("downloadUrl") or
                        file_info.get("DOWNLOAD_URL") or
                        file_info.get("urlDownload") or
                        file_info.get("url") or
                        file_info.get("URL") or
                        ""
                    )
                    # Ensure URL has protocol (Bitrix sometimes returns relative paths)
                    if download_url and not download_url.startswith("http"):
                        download_url = f"https://b24-05xr3e.bitrix24.pl{download_url}"
                    if download_url:
                        import httpx as httpx_client
                        # Pass Bitrix auth token so internal download URLs work
                        headers = {}
                        if bitrix_auth_token:
                            headers["Authorization"] = f"Bearer {bitrix_auth_token}"
                        async with httpx_client.AsyncClient(timeout=30) as client:
                            resp = await client.get(download_url, headers=headers)
                            if resp.status_code == 200:
                                logger.info(f"✅ Serving uploaded PDF for deal {deal_id}")
                                return Response(
                                    content=resp.content,
                                    media_type="application/pdf",
                                    headers={"Content-Disposition": f"inline; filename=report_{deal_id}.pdf"}
                                )
                            else:
                                logger.warning(f"Bitrix PDF download returned {resp.status_code} — falling back to generation")
            except Exception as e:
                logger.warning(f"Could not fetch uploaded PDF: {e}, falling back to generation")

        # Fallback: generate fresh PDF with deal data
        logger.info(f"Generating report for deal {deal_id}")
        deal_info = {
            "title": deal.get("TITLE", f"Zlecenie #{deal_id}"),
            "order_number": f"Zlecenie nr. {deal_id} - {deal.get('TITLE', '')}",
            "company_name": deal.get("UF_CRM_1766057964319", ""),
            "client_name": deal.get("UF_CRM_1766057941327", ""),
            "inspection_place": deal.get("UF_CRM_1766058185504", ""),
            "inspection_date": deal.get("UF_CRM_1772108256983", ""),
            "inspector_name": current_user.get("name", ""),
            "plates": deal.get("UF_CRM_1766057515315", ""),
            "make": deal.get("UF_CRM_1766057839684", ""),
            "model": deal.get("UF_CRM_1766057849818", ""),
            "vin": deal.get("UF_CRM_1766057539531", ""),
            "year": deal.get("UF_CRM_1766057572300", ""),
        }

        from services.pdf_generator import generate_inspection_pdf
        pdf_bytes = generate_inspection_pdf(deal_info, deal_info)

        logger.info(f"✅ Report generated for deal {deal_id} ({len(pdf_bytes)} bytes)")

        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"inline; filename=inspection_report_{deal_id}.pdf",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Report generation failed for deal {deal_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")

# ─── Paint Panel Flattening (Step 4) ──────────────────────────
PAINT_PANEL_MAP = {
    'hood': 'paint_hood',
    'roof': 'paint_roof',
    'trunk': 'paint_trunk',
    'leftFrontFender': 'paint_fender_fl',
    'leftRearFender': 'paint_fender_rl',
    'rightFrontFender': 'paint_fender_fr',
    'rightRearFender': 'paint_fender_rr',
    'leftFrontDoor': 'paint_door_fl',
    'leftRearDoor': 'paint_door_rl',
    'rightFrontDoor': 'paint_door_fr',
    'rightRearDoor': 'paint_door_rr',
    'leftSill': 'paint_sill_left',
    'rightSill': 'paint_sill_right',
    'leftAColumn': 'paint_pillar_a_left',
    'rightAColumn': 'paint_pillar_a_right',
    'leftBColumn': 'paint_pillar_a_left',
    'rightBColumn': 'paint_pillar_a_right',
    'leftCColumn': 'paint_pillar_a_left',
    'rightCColumn': 'paint_pillar_a_right',
    'frontBumper': 'paint_bumper_front',
    'rearBumper': 'paint_bumper_rear',
}

def flatten_paint_data(data: dict) -> dict:
    """Flatten nested paint panels: {hood: {value: "120", status: "factory"}} → {paint_hood: "120"}"""
    flat = {}
    for panel_key, pwa_key in PAINT_PANEL_MAP.items():
        if panel_key in data and isinstance(data[panel_key], dict):
            flat[pwa_key] = data[panel_key].get('value', '')
    return flat

# ─── Tire Wheel Flattening (Step 5) ──────────────────────────
TIRE_WHEEL_MAP = {
    'frontLeft': 'fl',
    'frontRight': 'fr',
    'rearLeft': 'rl',
    'rearRight': 'rr',
}
TIRE_FIELD_MAP = {
    'brand': 'tire_{}_brand',
    'size': 'tire_{}_size',
    'dot': 'tire_{}_size',
    'treadDepth': 'tire_{}_depth',
    'type': 'tire_{}_type',
}

def flatten_tire_data(data: dict) -> dict:
    """Flatten nested tire data: {frontLeft: {brand: "X", size: "Y"}} → {tire_fl_brand: "X", tire_fl_size: "Y"}"""
    flat = {}
    for wheel_key, wheel_code in TIRE_WHEEL_MAP.items():
        if wheel_key in data and isinstance(data[wheel_key], dict):
            wheel_data = data[wheel_key]
            for field_key, pwa_pattern in TIRE_FIELD_MAP.items():
                if field_key in wheel_data and wheel_data[field_key]:
                    pwa_key = pwa_pattern.format(wheel_code)
                    flat[pwa_key] = wheel_data[field_key]
    return flat

# ─── Step 12 camelCase → snake_case mapping ───────────────────
SUMMARY_KEY_MAP = {
    'signatureAppraiser': 'signature_appraiser',
    'signatureClient': 'signature_client',
    'signatureYard': 'signature_yard',
    'vinConfirmed': 'vin_confirmed',
    'isAbsentRep': 'is_absent_rep',
    'absentRepComment': 'absent_rep_comment',
    'submittedAt': 'submitted_at',
    'submissionStatus': 'submission_status',
}

NOTES_KEY_MAP = {
    'estimatedValue': 'estimated_value',
    'valuationNotes': 'valuation_notes',
    'generalComments': 'general_comments',
    'vinVerification': 'vin_verification',
    'registrationDocPresented': 'registration_doc_presented',
    'vehicleCardPresented': 'vehicle_card_presented',
    'purchaseInvoicePresented': 'purchase_invoice_presented',
    'serviceBookPresented': 'service_book_presented',
    'antiTheftSecurityPresented': 'anti_theft_security_presented',
    'immobilizerWorking': 'immobilizer_working',
    'testDrivePossible': 'test_drive_possible',
    'testDriveImpossibleReason': 'test_drive_impossible_reason',
    'testDriveImpossibleText': 'test_drive_impossible_text',
    'marketComparison': 'market_comparison',
}

def remap_keys(data: dict, key_map: dict) -> dict:
    """Remap camelCase keys to snake_case using a provided map."""
    remapped = {}
    for k, v in data.items():
        new_key = key_map.get(k, k)
        remapped[new_key] = v
    return remapped

# Step number → step model field name mapping
STEP_FIELD_MAP = {
    1: "vehicle",
    2: "documents",  # equipmentCompleteness
    3: "full_equipment",
    4: "paint",
    5: "tires",
    6: "photos",
    7: "body_damage", # exteriorDamage
    8: "interior",     # interiorDamage
    9: "mechanical",
    10: "notes_valuation",
    11: "vehicle",    # Validation (fallback)
    12: "summary",
}


class SubmitRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    deal_id: int
    job_id: Optional[int] = None
    photos: Dict[str, Any] = {}

    @field_validator('deal_id', 'job_id', mode='before')
    @classmethod
    def parse_ids(cls, v):
        if v is None:
            return v
        try:
            return int(v)
        except (TypeError, ValueError):
            return v

@router.post("/submit")
async def submit_inspection(request: Request, data: SubmitRequest):
    """
    POST /inspection/submit
    Finalizes the inspection — sets Bitrix deal stage to "Inspection Completed".
    Individual step data has already been saved via PATCH /step/{n} calls.
    Accepts SubmitRequest JSON body (allows extra fields for full state).
    """
    gateway = request.app.state.gateway
    bitrix_ready = getattr(request.app.state, "bitrix_ready", False)

    if not bitrix_ready:
        raise HTTPException(
            status_code=503,
            detail="Bitrix24 integration not ready — try again later",
        )

    # Use the validated data model and get full body from model_dump()
    deal_id = data.deal_id
    body = data.model_dump()

    # Extract signatures from submit body (extra fields via ConfigDict extra="allow")
    summary_from_body = body.get("finalSummary", {})
    if summary_from_body and isinstance(summary_from_body, dict):
        logger.info(f"✅ Signatures received: {[k for k, v in summary_from_body.items() if v]}")
    else:
        logger.warning("⚠️ No signatures in submit body")

    logger.info(f"🚀 Submit received — deal_id: {data.deal_id}, photos: {len(data.photos)}")

    warnings = []

    try:
        # Step 1: Set stage to "Oględziny zakończone" (Inspection Completed)
        await gateway.call("crm.deal.update", {
            "ID": deal_id,
            "fields": {"STAGE_ID": "UC_0T9W8E"}
        })
        logger.info(f"✅ Deal {deal_id} stage set to UC_0T9W8E (Inspection Completed)")

        # Step 2: Generate PDF report
        try:
            from services.pdf_generator import generate_inspection_pdf
            import base64 as b64_module

            # Fetch deal info from Bitrix for PDF header
            deal_result = await gateway.call("crm.deal.get", {"ID": deal_id})
            deal_info = {
                "title": deal_result.get("TITLE", f"Zlecenie nr. {deal_id}"),
                "order_number": f"Zlecenie nr. {deal_id} - {deal_result.get('TITLE', '')}",
                "company_name": deal_result.get("UF_CRM_1766057964319", ""),
                "client_name": deal_result.get("UF_CRM_1766057941327", ""),
                "inspection_place": deal_result.get("UF_CRM_1766058185504", ""),
                "inspection_date": deal_result.get("UF_CRM_1772108256983", ""),
                "inspector_name": deal_result.get("UF_CRM_1771579888", "Mateusz Chłodek"),
            }

            # Use inspection data from the request body
            inspection_data = body

            # Extract auth token from webhook URL so show_file.php URLs work
            # Webhook format: https://domain/rest/USER_ID/TOKEN/
            bitrix_auth_token = ""
            try:
                bitrix_auth_token = gateway.webhook_url.rstrip("/").split("/")[-1]
            except Exception:
                pass

            # PDF field key — exclude from photo collection to avoid including the PDF itself
            PDF_FIELD_KEY = "UF_CRM_1772801617"

            def _fix_bitrix_url(url: str) -> str:
                """Add full domain + auth token to Bitrix file URLs."""
                if not url.startswith("http"):
                    url = f"https://b24-05xr3e.bitrix24.pl{url}"
                if bitrix_auth_token and "auth=" in url:
                    import re as _re
                    url = _re.sub(r'auth=[^&]*', f'auth={bitrix_auth_token}', url)
                return url

            # ── Source 1: photos already uploaded to Bitrix file fields ──
            photo_urls = []
            for key, value in deal_result.items():
                if not key.startswith("UF_CRM_"):
                    continue
                if key == PDF_FIELD_KEY:  # skip — this is the PDF field, not a photo
                    continue
                if isinstance(value, dict):
                    url = value.get("downloadUrl") or value.get("url") or value.get("showUrl")
                    if url and isinstance(url, str):
                        photo_urls.append(_fix_bitrix_url(url))
                elif isinstance(value, list):
                    for item in value:
                        if isinstance(item, dict):
                            url = item.get("downloadUrl") or item.get("url") or item.get("showUrl")
                            if url and isinstance(url, str):
                                photo_urls.append(_fix_bitrix_url(url))
            logger.info(f"📷 Bitrix file photos: {len(photo_urls)}")

            # ── Source 2: compressed base64 photos from submit body ──
            body_photos = body.get("photos", {})
            body_count = 0
            if isinstance(body_photos, dict):
                for k, v in body_photos.items():
                    if v and isinstance(v, str) and (v.startswith("data:image") or v.startswith("http")):
                        photo_urls.append(v)
                        body_count += 1
            elif isinstance(body_photos, list):
                for item in body_photos:
                    if isinstance(item, str) and (item.startswith("data:image") or item.startswith("http")):
                        photo_urls.append(item)
                        body_count += 1
                    elif isinstance(item, dict):
                        url = item.get("base64") or item.get("url") or item.get("src")
                        if url:
                            photo_urls.append(url)
                            body_count += 1
            logger.info(f"📷 Body photos: {body_count} — total for PDF: {len(photo_urls)}")

            if photo_urls:
                inspection_data["photos"] = photo_urls

            # Generate PDF bytes
            pdf_bytes = generate_inspection_pdf(deal_info, inspection_data)
            logger.info(f"📄 PDF generated for deal {deal_id} — {len(pdf_bytes)} bytes")

            # Upload PDF directly to deal's file field (no disk scope needed)
            pdf_b64 = b64_module.b64encode(pdf_bytes).decode('utf-8')
            pdf_filename = f"Protokol_zwrotu_pojazdu_{deal_id}.pdf"

            await gateway.call("crm.deal.update", {
                "ID": deal_id,
                "fields": {
                    # "Raport z oględzin pojazdu" file field
                    "UF_CRM_1772801617": {
                        "fileData": [pdf_filename, pdf_b64]
                    }
                }
            })
            logger.info(f"📎 PDF '{pdf_filename}' uploaded to deal {deal_id} field UF_CRM_1772801617")

        except Exception as pdf_err:
            # PDF failure should NOT block the submission
            logger.error(f"PDF generation/upload failed for deal {deal_id}: {pdf_err}")
            warnings.append(f"PDF report failed: {pdf_err}")

        base_domain = gateway.webhook_url.split("/rest/")[0]
        bitrix_url = f"{base_domain}/crm/deal/details/{deal_id}/"

        return SubmitResult(
            deal_id=deal_id,
            bitrix_url=bitrix_url,
            status="success",
            warnings=warnings,
            message="Inspection submitted to Bitrix24 successfully.",
        )

    except Exception as e:
        logger.error(f"Inspection submit failed: {e}")
        return SubmitResult(
            deal_id=deal_id,
            bitrix_url=None,
            status="failed",
            warnings=[str(e)],
            message="Submission failed. Data preserved for retry.",
        )


@router.post("/{deal_id}/complete")
async def complete_inspection(deal_id: int, request: Request):
    """
    POST /inspection/{deal_id}/complete
    Fallback endpoint — just changes the Bitrix stage to Inspection Completed.
    """
    gateway = request.app.state.gateway
    bitrix_ready = getattr(request.app.state, "bitrix_ready", False)

    if not bitrix_ready:
        raise HTTPException(status_code=503, detail="Bitrix24 integration not ready")

    try:
        await gateway.call("crm.deal.update", {
            "ID": deal_id,
            "fields": {"STAGE_ID": "UC_0T9W8E"}
        })
        logger.info(f"✅ Deal {deal_id} marked as completed — stage UC_0T9W8E")
        return {"success": True, "deal_id": deal_id, "stage": "UC_0T9W8E"}
    except Exception as e:
        logger.error(f"Failed to complete deal {deal_id}: {e}")
        raise HTTPException(status_code=502, detail=str(e))


@router.patch("/{deal_id}/step/{step_number}", response_model=StepSaveResult)
async def save_step(
    deal_id: int,
    step_number: int,
    request: Request,
):
    try:
        body = await request.json()
    except Exception as e:
        logger.error(f"Cannot parse JSON in step endpoint: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON")

    try:
        step_data = StepPartialData(**body)
    except Exception as e:
        logger.error(f"Step {step_number} validation error details: {body}\nException: {e}")
        raise HTTPException(status_code=422, detail=str(e))

    """
    PATCH /inspection/{deal_id}/step/{step_number}
    Saves progress of a single wizard step.
    Updates the deal with only that step's fields.
    Enables "Anti-Oops" auto-save from Zustand.
    """
    gateway = request.app.state.gateway
    disc = request.app.state.discovery
    bitrix_ready = getattr(request.app.state, "bitrix_ready", False)

    if not bitrix_ready:
        raise HTTPException(
            status_code=503,
            detail="Bitrix24 integration not ready",
        )

    if step_number < 1 or step_number > 12:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid step number: {step_number}. Must be 1-12.",
        )

    warnings = []

    try:
        # The step_data.data contains PWA key-value pairs for this step
        step_fields = step_data.data if isinstance(step_data.data, dict) else {}

        # Log raw body for debugging
        logger.info(f"🚨 STEP {step_number} RAW BODY keys: {list(step_fields.keys()) if isinstance(step_fields, dict) else type(step_fields)}")

        # VIN debug logging for Step 1
        if step_number == 1 and isinstance(step_fields, dict):
            vin_value = step_fields.get('vin', 'NOT_FOUND')
            logger.info(f"🔍 VIN received: '{vin_value}' type={type(vin_value).__name__}")
            try:
                import os
                overrides_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "mapping_overrides.json")
                with open(overrides_path) as f:
                    field_map = json.load(f)
                logger.info(f"VIN mapped to Bitrix field: {field_map.get('vin')}")
            except Exception as e:
                logger.warning(f"Could not load mapping overrides for VIN debug: {e}")

        # ── Step-specific flattening ──
        if step_number == 4 and isinstance(step_fields, dict):
            # Paint: flatten nested panels
            flat_paint = flatten_paint_data(step_fields)
            logger.info(f"Step 4 paint flattened: {len(flat_paint)} fields from {len(step_fields)} panels")
            step_fields = flat_paint

        elif step_number == 5 and isinstance(step_fields, dict):
            # Tires: flatten nested wheels
            flat_tires = flatten_tire_data(step_fields)
            logger.info(f"Step 5 tires flattened: {len(flat_tires)} fields from {len(step_fields)} wheels")
            step_fields = flat_tires

        elif step_number == 6:
            # Photos: skip Bitrix update — photos need the file upload endpoint
            logger.info(f"Step 6 (photos): skipping Bitrix field update — photos handled via file upload")
            return StepSaveResult(
                deal_id=deal_id,
                step_number=step_number,
                status="saved",
                warnings=["Photos skipped — use file upload endpoint"],
            )

        elif step_number == 10 and isinstance(step_fields, dict):
            # Notes/Valuation: remap camelCase to snake_case
            step_fields = remap_keys(step_fields, NOTES_KEY_MAP)
            logger.info(f"Step 10 notes remapped: {len(step_fields)} fields")

        elif step_number == 12 and isinstance(step_fields, dict):
            # Final Summary: remap camelCase to snake_case
            step_fields = remap_keys(step_fields, SUMMARY_KEY_MAP)
            logger.info(f"Step 12 summary remapped: {len(step_fields)} fields")

        logger.info(
            f"Saving step {step_number} for deal {deal_id} "
            f"({len(step_fields)} fields)"
        )

        # Filter out basicInfo (read-only, not for Bitrix)
        filtered_fields = {k: v for k, v in step_fields.items() if k != 'basicInfo'}

        result = await gateway.update_deal(
            deal_id=deal_id,
            inspection_data=filtered_fields,
        )

        return StepSaveResult(
            deal_id=deal_id,
            step_number=step_number,
            status="saved",
            warnings=warnings,
        )

    except Exception as e:
        logger.error(f"Step save failed (deal={deal_id}, step={step_number}): {e}")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to save step {step_number}: {e}",
        )
@router.post("/{deal_id}/schedule")
async def schedule_inspection(
    deal_id: int,
    request: Request,
):
    """
    POST /inspection/{deal_id}/schedule
    Updates the planned inspection date and transitions deal stage.
    Email is sent in the background — response returns immediately.
    """
    gateway = request.app.state.gateway
    body = await request.json()
    scheduled_date = body.get("scheduled_date")

    if not scheduled_date:
        raise HTTPException(status_code=400, detail="Missing scheduled_date")

    try:
        # Step 1: Update Bitrix deal (the only blocking call)
        result = await gateway.schedule_inspection(deal_id, scheduled_date)
        logger.info(f"✅ Deal {deal_id} scheduled for {scheduled_date}")

        # Step 2: Fire email in background — don't block response
        import asyncio
        asyncio.create_task(
            _send_schedule_email_background(gateway, deal_id, scheduled_date)
        )

        return result
    except Exception as e:
        logger.error(f"Scheduling failed: {e}")
        raise HTTPException(status_code=502, detail=str(e))


async def _send_schedule_email_background(gateway, deal_id: int, scheduled_date: str):
    """Background task: resolve inspector from Bitrix list ID and send email."""
    try:
        from services.email_service import send_assignment_email
        from routers.deals import get_phone_to_bitrix_id
        from database import SessionLocal
        from models.inspector import Inspector as InspectorModel

        # Fetch deal details
        deal = await gateway.call("crm.deal.get", {"id": deal_id})
        logger.info(f"[BG Email] Deal {deal_id} fields: {dict(list(deal.items())[:15])}")

        # Reverse-map list ID → phone
        list_id = str(deal.get("UF_CRM_1773970466449", "")).strip()
        logger.info(f"[BG Email] Inspector list_id: {list_id}")

        if not list_id:
            logger.warning(f"[BG Email] No inspector list_id on deal {deal_id}")
            return

        phone_map = await get_phone_to_bitrix_id(gateway)
        id_to_phone = {v: k for k, v in phone_map.items()}
        inspector_phone = id_to_phone.get(list_id, "")
        logger.info(f"[BG Email] Resolved phone: {inspector_phone} from list_id: {list_id}")

        if not inspector_phone:
            logger.warning(f"[BG Email] Could not resolve phone from list_id: {list_id}")
            return

        db = SessionLocal()
        try:
            inspector = db.query(InspectorModel).filter(
                InspectorModel.phone == inspector_phone,
                InspectorModel.is_active == True
            ).first()

            if not inspector or not inspector.email:
                logger.warning(f"[BG Email] Inspector {inspector_phone} has no email or not found")
                return

            await send_assignment_email(
                inspector_name=inspector.name,
                inspector_email=inspector.email,
                order_title=deal.get("TITLE", f"Zlecenie #{deal_id}"),
                order_id=str(deal_id),
                client_name=deal.get("UF_CRM_1766057964319", ""),
                inspection_address=deal.get("UF_CRM_1766058185504", ""),
                inspection_date=scheduled_date,
                vehicle_make=deal.get("UF_CRM_MAKE_FIELD", ""),
                vehicle_model=deal.get("UF_CRM_MODEL_FIELD", ""),
                registration_plates=deal.get("UF_CRM_PLATES_FIELD", ""),
            )
            logger.info(f"📧 Background email sent to {inspector.email} for deal {deal_id}")
        finally:
            db.close()

    except Exception as e:
        logger.error(f"[BG Email] Failed for deal {deal_id}: {e}")
