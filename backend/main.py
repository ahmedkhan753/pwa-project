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

# ─── Global Instances ─────────────────────────────────────────
gateway = BitrixGateway(discovery=discovery)
transformer = FieldTransformer(discovery=discovery)

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
    """
    logger.info("=" * 60)
    logger.info("STARTING Auto-Inspection PWA Backend")
    logger.info("=" * 60)
    
    # Provide gateway/discovery to app state for routers
    app.state.gateway = gateway
    app.state.discovery = discovery
    app.state.bitrix_ready = False

    try:
        # Step 1: Test connectivity
        logger.info("Testing Bitrix24 connection...")
        conn = await gateway.test_connection()
        if not conn["connected"]:
            logger.error("⚠ Bitrix24 connection FAILED — running in degraded mode")
        else:
            logger.info(f"✓ Bitrix24 connected — {conn['field_count']} fields available")

            # Step 2: Initialize field discovery
            logger.info("Running dynamic field discovery...")
            await discovery.initialize(gateway.call)

            app.state.bitrix_ready = True
            logger.info(f"✓ Field discovery complete — {discovery.get_mapped_count()} fields mapped")

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


# ─── Routers ──────────────────────────────────────────────────
from routers import health, deals, inspection, files, metadata

app.include_router(health.router)
app.include_router(deals.router)
app.include_router(inspection.router)
app.include_router(files.router)
app.include_router(metadata.router)


# ─── Mock Data Fallback (Used by Routers if Bitrix Offline) ────
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


# ─── Auth Endpoint (To be moved to router later if needed) ─────
class LoginRequest(BaseModel):
    email: str
    password: str

@app.post("/api/auth/login")
async def login(request_body: LoginRequest):
    """
    Login endpoint (Bitrix24 mock/auth).
    Returns basic user info from Bitrix.
    """
    try:
        bitrix_user = await gateway.get_user_by_email(request_body.email)
        if not bitrix_user:
            # Universal Test Access: Default to ID 1 (Mateusz) if email unknown
            logger.info(f"Email {request_body.email} not found in Bitrix. Using universal test ID: 1")
            user_data = {
                "id": "1",
                "email": request_body.email,
                "name": "Testing (Mateusz) - Real Bitrix Mode",
                "bitrixId": "1",
            }
        else:
            user_data = {
                "id": str(bitrix_user.get("ID")),
                "email": request_body.email,
                "name": f"{bitrix_user.get('NAME', '')} {bitrix_user.get('LAST_NAME', '')}".strip() or "Appraiser",
                "bitrixId": str(bitrix_user.get("ID")),
            }
    except Exception as e:
        logger.error(f"Login error: {e}")
        user_data = {
            "id": "1",
            "email": request_body.email,
            "name": "Testing (Mateusz) - Fallback",
            "bitrixId": "1",
        }

    return {"token": f"token_{int(time.time())}", "user": user_data}


# ─── Legacy Task Endpoint (Backward Compatibility) ────────────
@app.get("/api/tasks")
async def get_tasks(
    responsible_id: Optional[str] = None,
    email: Optional[str] = None,
    date: Optional[str] = None,
):
    """Bridge to new deals router logic if needed, or keep for simple sync."""
    try:
        # Universal Test Access: Default to ID 1 if email not found
        bitrix_user = await gateway.get_user_by_email(email)
        responsible_id = "1"
        if bitrix_user:
            responsible_id = str(bitrix_user.get("ID"))
        else:
            logger.info(f"Dashboard email {email} not found. Defaulting to responsible_id: 1 for real data.")
        
        # Fetch real missions from Bitrix
        deals = await gateway.get_appraiser_deals(int(responsible_id), date)
        if deals:
            return deals
    except Exception as e:
        logger.warning(f"Error fetching Bitrix deals for {email}: {e}")

    # Final logic: if Bitrix has no deals even for ID 1, show mock data so UI isn't empty
    logger.info(f"Using mock data fallback for UI consistency (date: {date})")
    if date:
        return [j for j in MOCK_JOBS if j["deadline"] == date]
    return MOCK_JOBS


@app.get("/")
async def root():
    return {"message": "Auto-Inspection PWA API v2.0", "status": "online"}

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
            file_id = await gateway.upload_file_to_disk(filename, b64)
            if file_id:
                uploaded_file_ids.append(file_id)

    for damage in data.exteriorDamage + data.interiorDamage:
        for j, photo_b64 in enumerate(damage.get("photos", [])):
            if photo_b64:
                filename = f"damage_{data.jobId}_{damage.get('id', '')}_{j}.jpg"
                file_id = await gateway.upload_file(filename, photo_b64)
                if file_id:
                    uploaded_file_ids.append(file_id)

    for k, img_b64 in enumerate(data.images):
        if img_b64:
            filename = f"extra_{data.jobId}_{k}.jpg"
            file_id = await gateway.upload_file_to_disk(filename, img_b64)
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
            file_id = await gateway.upload_file(filename, sig_b64)
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
        # Resolve the photos field dynamically (e.g., photo_front)
        files_field_id = discovery.get_field_id("photo_front")
        if files_field_id:
            deal_fields[files_field_id] = uploaded_file_ids
        else:
            logger.warning("❌ No 'photo_front' field found in Bitrix24 - skipping file attachment")

    result = await gateway.create_deal(deal_fields)

    if result.get("success"):
        logger.info(f"Inspection submitted successfully. Deal ID: {result.get('deal_id')}")
        return {
            "status": "submitted",
            "dealId": result.get("deal_id"),
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
