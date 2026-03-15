"""
Auto-Inspection PWA Backend
============================
FastAPI application with dynamic Bitrix24 integration.
On startup, discovers all CRM Deal fields via the live API
and builds a zero-hardcoded field registry.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from dotenv import load_dotenv
import time
import logging
import json

# Load .env before any service imports
load_dotenv()

from services.bitrix_discovery import discovery
from services.bitrix_gateway import (
    BitrixGateway,
    BitrixError,
    BitrixAuthError,
    BitrixScopeError,
    BitrixNotFoundError,
    BitrixQuotaError,
    BitrixNetworkError,
)
from services.field_transformer import FieldTransformer

# Also keep legacy bitrix_service for backward compat
import bitrix_service

# ─── Logging ──────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("main")


# ─── Lifespan (startup / shutdown) ───────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    On startup:
      1. Test Bitrix24 connectivity
      2. Discover & cache all CRM Deal fields
      3. Log the mapping report
    On shutdown:
      - Close the gateway HTTP client
    """
    logger.info("=" * 60)
    logger.info("STARTING Auto-Inspection PWA Backend")
    logger.info("=" * 60)

    # Create gateway instance
    gateway = BitrixGateway(discovery=discovery)
    app.state.gateway = gateway
    app.state.discovery = discovery
    app.state.bitrix_ready = False

    try:
        # Step 1: Test connectivity
        logger.info("Testing Bitrix24 connection...")
        conn = await gateway.test_connection()
        if not conn["connected"]:
            logger.error(
                "⚠ Bitrix24 connection FAILED — running in degraded mode"
            )
        else:
            logger.info(
                f"✓ Bitrix24 connected — {conn['field_count']} fields available"
            )

            # Step 2: Initialize field discovery
            logger.info("Running dynamic field discovery...")
            await discovery.initialize(gateway.call)

            app.state.bitrix_ready = True
            logger.info(
                f"✓ Field discovery complete — "
                f"{discovery.get_mapped_count()} fields mapped"
            )

    except Exception as e:
        logger.error(f"Startup error: {e} — running in degraded mode")

    logger.info("Backend startup complete")
    logger.info("=" * 60)

    yield

    # Shutdown
    logger.info("Shutting down — closing HTTP client")
    await gateway.close()


app = FastAPI(
    title="Auto-Inspection PWA Backend",
    version="2.0.0",
    lifespan=lifespan,
)


# ─── CORS ─────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Global Exception Handler ─────────────────────────────────
@app.exception_handler(BitrixAuthError)
async def bitrix_auth_handler(request: Request, exc: BitrixAuthError):
    return JSONResponse(
        status_code=401,
        content={
            "error": "bitrix_auth_error",
            "message": str(exc),
            "code": exc.error_code,
        },
    )


@app.exception_handler(BitrixScopeError)
async def bitrix_scope_handler(request: Request, exc: BitrixScopeError):
    return JSONResponse(
        status_code=403,
        content={
            "error": "bitrix_scope_error",
            "message": str(exc),
            "code": exc.error_code,
        },
    )


@app.exception_handler(BitrixNotFoundError)
async def bitrix_notfound_handler(request: Request, exc: BitrixNotFoundError):
    return JSONResponse(
        status_code=404,
        content={
            "error": "bitrix_not_found",
            "message": str(exc),
            "code": exc.error_code,
        },
    )


@app.exception_handler(BitrixQuotaError)
async def bitrix_quota_handler(request: Request, exc: BitrixQuotaError):
    return JSONResponse(
        status_code=429,
        content={
            "error": "bitrix_quota_exceeded",
            "message": str(exc),
            "code": exc.error_code,
        },
    )


@app.exception_handler(BitrixError)
async def bitrix_generic_handler(request: Request, exc: BitrixError):
    return JSONResponse(
        status_code=502,
        content={
            "error": "bitrix_error",
            "message": str(exc),
            "code": exc.error_code,
        },
    )


# ─── Request Logging Middleware ────────────────────────────────
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    elapsed = time.time() - start
    logger.info(
        f"{request.method} {request.url.path} → {response.status_code} "
        f"({elapsed:.3f}s)"
    )
    return response


# ─── Mock Data Fallback ──────────────────────────────────────
MOCK_JOBS = [
    {
        "id": "job_1",
        "bitrixTaskId": "mock_1",
        "clientName": "Jan Kowalski",
        "vin": "WVGZZZ5NZLW123456",
        "plates": "WA 12345",
        "phone": "+48600100200",
        "appointmentTime": "10:00",
        "deadline": time.strftime("%Y-%m-%d"),
        "status": "ready",
        "make": "Volkswagen",
        "model": "Tiguan",
        "city": "Warszawa",
    },
    {
        "id": "job_2",
        "bitrixTaskId": "mock_2",
        "clientName": "Anna Nowak",
        "vin": "TMKDA7NE1L098765",
        "plates": "PO 98765",
        "phone": "+48700800900",
        "appointmentTime": "14:30",
        "deadline": time.strftime("%Y-%m-%d"),
        "status": "ready",
        "make": "Skoda",
        "model": "Octavia",
        "city": "Poznań",
    },
    {
        "id": "job_3",
        "bitrixTaskId": "mock_3",
        "clientName": "Marek Zegar",
        "vin": "JLR123HF847294",
        "plates": "KR 55555",
        "phone": "+48555444333",
        "appointmentTime": "09:15",
        "deadline": time.strftime(
            "%Y-%m-%d", time.localtime(time.time() + 86400)
        ),
        "status": "ready",
        "make": "Jaguar",
        "model": "F-Pace",
        "city": "Kraków",
    },
]


# ─── Pydantic Models ─────────────────────────────────────────
class LoginRequest(BaseModel):
    email: str
    password: str


class InspectionSubmission(BaseModel):
    """Full inspection data from the Zustand store + base64 images."""

    jobId: str
    vehicleData: Dict[str, Any]
    equipmentCompleteness: Dict[str, Any]
    fullEquipment: Dict[str, Any]
    paintMeasurement: Dict[str, Any]
    tires: Dict[str, Any]
    photos: List[Dict[str, Any]]
    exteriorDamage: List[Dict[str, Any]]
    interiorDamage: List[Dict[str, Any]]
    mechanical: Dict[str, Any]
    notesValuation: Dict[str, Any]
    finalSummary: Dict[str, Any]
    images: List[str] = []


# ─── Health Endpoints ─────────────────────────────────────────
@app.get("/health")
async def health(request: Request):
    """Gateway status, field registry size, last sync time."""
    disc = request.app.state.discovery
    gw = request.app.state.gateway
    bitrix_ready = request.app.state.bitrix_ready

    return {
        "status": "ok",
        "bitrix_ready": bitrix_ready,
        "field_count": disc.get_total_bitrix_fields() if disc.is_initialized else 0,
        "mapped_count": disc.get_mapped_count() if disc.is_initialized else 0,
        "last_sync": disc.last_sync_time if disc.is_initialized else None,
        "cache_stale": disc.is_cache_stale() if disc.is_initialized else True,
    }


@app.get("/health/fields")
async def health_fields(request: Request):
    """Full PWA → Bitrix field mapping for debugging."""
    disc = request.app.state.discovery
    if not disc.is_initialized:
        return {"error": "Discovery engine not initialized", "mapping": {}}

    return {
        "mapping": disc.get_full_registry(),
        "total_bitrix_fields": disc.get_total_bitrix_fields(),
        "mapped_count": disc.get_mapped_count(),
        "unmapped_keys": [
            k for k in disc.get_all_pwa_keys()
            if k not in disc.get_full_registry()
        ],
    }


# ─── Auth Endpoint ────────────────────────────────────────────
@app.post("/auth/login")
async def login(request_body: LoginRequest):
    """Login endpoint — maps email to Bitrix24 user."""
    if "error" in request_body.email:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    bitrix_user = await bitrix_service.get_user_by_email(request_body.email)

    if bitrix_user:
        user_data = {
            "id": str(bitrix_user.get("ID", "1")),
            "email": request_body.email,
            "name": f"{bitrix_user.get('NAME', '')} {bitrix_user.get('LAST_NAME', '')}".strip()
            or "Appraiser",
            "bitrixId": str(bitrix_user.get("ID", "")),
        }
    else:
        user_data = {
            "id": "1",
            "email": request_body.email,
            "name": "Appraiser Marek",
            "bitrixId": "",
        }

    return {"token": f"token_{int(time.time())}", "user": user_data}


# ─── Task A: Inbound Sync ────────────────────────────────────
@app.get("/api/tasks")
async def get_tasks(
    responsible_id: Optional[str] = None,
    email: Optional[str] = None,
    date: Optional[str] = None,
):
    """Fetch tasks from Bitrix24 filtered by RESPONSIBLE_ID and DEADLINE."""
    if email and not responsible_id:
        responsible_id = await bitrix_service.get_responsible_id_for_email(email)
        if not responsible_id:
            logger.warning(
                f"Could not resolve Bitrix24 ID for email: {email}, using mock data"
            )

    tasks = await bitrix_service.get_tasks(responsible_id, date)
    if tasks:
        return tasks

    logger.info(f"Using mock data fallback for tasks (date: {date})")
    if date:
        return [j for j in MOCK_JOBS if j["deadline"] == date]
    return MOCK_JOBS


@app.get("/jobs/appraiser")
async def get_jobs():
    """Legacy endpoint — redirects to /api/tasks internally."""
    return await get_tasks()


# ─── Task B: Outbound Sync ───────────────────────────────────
@app.post("/api/submit-inspection")
async def submit_inspection(data: InspectionSubmission):
    """
    Submit a completed inspection to Bitrix24.
    Uses the legacy bitrix_service for backward compatibility.
    """
    logger.info(f"Received inspection submission for job: {data.jobId}")

    # Upload images
    uploaded_file_ids = []
    for i, photo in enumerate(data.photos):
        b64 = photo.get("base64", "")
        if b64:
            label = photo.get("label", f"photo_{i}")
            filename = f"inspection_{data.jobId}_{label}.jpg"
            file_id = await bitrix_service.upload_file(filename, b64)
            if file_id:
                uploaded_file_ids.append(file_id)

    for damage in data.exteriorDamage + data.interiorDamage:
        for j, photo_b64 in enumerate(damage.get("photos", [])):
            if photo_b64:
                filename = f"damage_{data.jobId}_{damage.get('id', '')}_{j}.jpg"
                file_id = await bitrix_service.upload_file(filename, photo_b64)
                if file_id:
                    uploaded_file_ids.append(file_id)

    for k, img_b64 in enumerate(data.images):
        if img_b64:
            filename = f"extra_{data.jobId}_{k}.jpg"
            file_id = await bitrix_service.upload_file(filename, img_b64)
            if file_id:
                uploaded_file_ids.append(file_id)

    signatures = {
        "sig_appraiser": data.finalSummary.get("signatureAppraiser", ""),
        "sig_client": data.finalSummary.get("signatureClient", ""),
        "sig_yard": data.finalSummary.get("signatureYard", ""),
    }
    for sig_name, sig_b64 in signatures.items():
        if sig_b64:
            filename = f"{sig_name}_{data.jobId}.png"
            file_id = await bitrix_service.upload_file(filename, sig_b64)
            if file_id:
                uploaded_file_ids.append(file_id)

    logger.info(f"Uploaded {len(uploaded_file_ids)} files to Bitrix24")

    # Build deal fields using the legacy mapper
    vehicle = data.vehicleData
    basic_info = vehicle.get("basicInfo", {})

    deal_fields = {
        "TITLE": f"Inspekcja: {vehicle.get('make', '')} {vehicle.get('model', '')} - {vehicle.get('registrationPlates', '')}",
        "CATEGORY_ID": 0,
    }

    # If discovery is ready, use dynamic field mapping
    if discovery.is_initialized:
        transformer = FieldTransformer(discovery)
        # Flatten vehicle data for the transformer
        flat_data = {}
        flat_data["vin_number"] = vehicle.get("vin", "")
        flat_data["registration_number"] = vehicle.get("registrationPlates", "")
        flat_data["vehicle_brand"] = vehicle.get("make", "")
        flat_data["vehicle_model"] = vehicle.get("model", "")
        flat_data["production_year"] = vehicle.get("year", "")
        flat_data["vehicle_color"] = vehicle.get("color", "")
        flat_data["mileage"] = vehicle.get("mileage", "")
        flat_data["engine_capacity"] = vehicle.get("engineCapacity", "")
        flat_data["engine_power"] = vehicle.get("enginePower", "")
        flat_data["fuel_type"] = vehicle.get("fuelType", "")
        flat_data["body_type"] = vehicle.get("bodyType", "")
        flat_data["gearbox_type"] = vehicle.get("gearboxType", "")
        flat_data["drive_type"] = vehicle.get("driveType", "")
        flat_data["first_registration_date"] = vehicle.get("firstRegistration", "")
        flat_data["production_date"] = vehicle.get("productionDate", "")
        flat_data["company_name"] = basic_info.get("companyName", "")
        flat_data["client_name"] = basic_info.get("userOwner", "")
        flat_data["inspection_place"] = basic_info.get("inspectionPlace", "")
        flat_data["inspection_date"] = basic_info.get("inspectionDate", "")
        flat_data["inspector_name"] = basic_info.get("inspectorName", "")
        flat_data["equipment_completeness"] = data.equipmentCompleteness
        flat_data["full_equipment_json"] = data.fullEquipment
        flat_data["paint_data_json"] = data.paintMeasurement
        flat_data["tires_data_json"] = data.tires
        flat_data["mechanical_json"] = data.mechanical
        flat_data["notes_valuation_json"] = data.notesValuation
        flat_data["vin_confirmed"] = data.finalSummary.get("vinConfirmed", False)
        flat_data["estimated_value"] = data.notesValuation.get("estimatedValue", "")
        flat_data["general_comments"] = data.notesValuation.get("generalComments", "")

        dynamic_fields = transformer.transform_to_bitrix(flat_data)
        deal_fields.update(dynamic_fields)
    else:
        logger.warning("Discovery not ready — using direct field names (may fail)")

    if uploaded_file_ids:
        deal_fields["UF_CRM_FILES"] = uploaded_file_ids

    result = await bitrix_service.create_deal(deal_fields)

    if result.get("status") == "success":
        logger.info(f"Inspection submitted successfully. Deal ID: {result.get('dealId')}")
        return {
            "status": "submitted",
            "dealId": result.get("dealId"),
            "filesUploaded": len(uploaded_file_ids),
            "message": "Inspection submitted to Bitrix24 successfully.",
        }
    else:
        logger.warning(f"Submission failed: {result.get('error')}")
        return {
            "status": "retry",
            "error": result.get("error", "Unknown error"),
            "message": "Submission failed. Data preserved for retry.",
        }


# ─── Legacy Endpoint ─────────────────────────────────────────
@app.post("/api/inspection")
async def submit_inspection_legacy(data: dict):
    """Legacy endpoint for backward compatibility."""
    return {
        "status": "success",
        "message": "Use /api/submit-inspection for Bitrix24 integration.",
    }
