"""
Auto-Inspection PWA Backend
============================
FastAPI application with dynamic Bitrix24 integration.
On startup, discovers all CRM Deal fields via the live API
and builds a zero-hardcoded field registry.

Authentication: Phone + PIN for inspectors, password for admin.
"""

import warnings
warnings.filterwarnings("ignore", ".*error reading bcrypt version.*")
warnings.filterwarnings("ignore", ".*trapped error reading bcrypt version.*")

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from dotenv import load_dotenv
import time
import logging
import json

# Load .env before any service imports
import os
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

# ─── Database & Models ────────────────────────────────────────
from database import engine, Base, SessionLocal, get_db
from models.inspector import Inspector
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ─── Global Instances ─────────────────────────────────────────
gateway = BitrixGateway(discovery=discovery)
transformer = FieldTransformer(discovery=discovery)

# ─── Logging ──────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("main")


def seed_test_inspectors():
    """Seed default test inspector accounts on startup."""
    db = SessionLocal()
    try:
        test_inspectors = [
            {
                "name": "Mateusz Chłodek",
                "phone": "790469341",
                "pin": "1234",
                "email": "chlodekmateusz@gmail.com",
            },
            {
                "name": "Test Inspektor",
                "phone": "572572744",
                "pin": "1234",
                "email": "test@zaufajrzeczoznawcy.pl",
            },
            {
                "name": "Ahmed khan",
                "phone": "03341229637",
                "pin": "1234",
                "email": "ahmedk32410@gmail.com",
            },
        ]
        for data in test_inspectors:
            existing = db.query(Inspector).filter(
                Inspector.phone == data["phone"]
            ).first()
            if not existing:
                inspector = Inspector(
                    name=data["name"],
                    phone=data["phone"],
                    pin_hash=pwd_context.hash(str(data["pin"])),
                    email=data["email"],
                    is_active=True,
                )
                db.add(inspector)
                logger.info(f"  → Seeded inspector: {data['name']} ({data['phone']})")
        db.commit()
        logger.info("✅ Test inspectors seeded")
    except Exception as e:
        logger.error(f"Error seeding inspectors: {e}")
        db.rollback()
    finally:
        db.close()


# ─── Lifespan (startup / shutdown) ───────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    On startup:
      1. Create database tables
      2. Seed test inspectors
      3. Test Bitrix24 connectivity
      4. Discover & cache all CRM Deal fields
    """
    logger.info("=" * 60)
    logger.info("STARTING Auto-Inspection PWA Backend")
    logger.info("=" * 60)

    # Step 0: Create database tables
    logger.info("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    logger.info("✓ Database tables ready")

    # Step 1: Seed test inspectors
    logger.info("Seeding test inspectors...")
    seed_test_inspectors()

    # Provide gateway/discovery to app state for routers
    app.state.gateway = gateway
    app.state.discovery = discovery
    app.state.bitrix_ready = False

    try:
        # Step 2: Test connectivity
        logger.info("Testing Bitrix24 connection...")
        conn = await gateway.test_connection()
        if not conn["connected"]:
            logger.error("⚠ Bitrix24 connection FAILED — running in degraded mode")
        else:
            logger.info(f"✓ Bitrix24 connected — {conn['field_count']} fields available")

            # Step 3: Initialize field discovery
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
    version="3.0.0",
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


# ─── Global Exception Handlers ────────────────────────────────
@app.exception_handler(BitrixAuthError)
async def bitrix_auth_handler(request: Request, exc: BitrixAuthError):
    return JSONResponse(
        status_code=401,
        content={"error": "bitrix_auth_error", "message": str(exc), "code": exc.error_code},
    )

@app.exception_handler(BitrixScopeError)
async def bitrix_scope_handler(request: Request, exc: BitrixScopeError):
    return JSONResponse(
        status_code=403,
        content={"error": "bitrix_scope_error", "message": str(exc), "code": exc.error_code},
    )

@app.exception_handler(BitrixNotFoundError)
async def bitrix_notfound_handler(request: Request, exc: BitrixNotFoundError):
    return JSONResponse(
        status_code=404,
        content={"error": "bitrix_not_found", "message": str(exc), "code": exc.error_code},
    )

@app.exception_handler(BitrixQuotaError)
async def bitrix_quota_handler(request: Request, exc: BitrixQuotaError):
    return JSONResponse(
        status_code=429,
        content={"error": "bitrix_quota_exceeded", "message": str(exc), "code": exc.error_code},
    )

@app.exception_handler(BitrixError)
async def bitrix_generic_handler(request: Request, exc: BitrixError):
    return JSONResponse(
        status_code=502,
        content={"error": "bitrix_error", "message": str(exc), "code": exc.error_code},
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    body = await request.body()
    logger.error(f"422 Unprocessable Entity for {request.url.path}")
    logger.error(f"Validation errors: {exc.errors()}")
    logger.error(f"Raw body: {body.decode()}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": body.decode()},
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
from routers import auth as auth_router
from routers import admin as admin_router
from routers import webhook as webhook_router

app.include_router(health.router)
app.include_router(deals.router)
app.include_router(inspection.router)
app.include_router(files.router)
app.include_router(metadata.router)
app.include_router(auth_router.router)
app.include_router(admin_router.router)
app.include_router(webhook_router.router)


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


# ─── Legacy Auth Compatibility ────────────────────────────────
# Keep get_current_user accessible for deals.py import
from deps import get_current_user


# ─── Legacy Task Endpoint (Backward Compatibility) ────────────
@app.get("/api/tasks")
async def get_tasks(
    responsible_id: Optional[str] = None,
    email: Optional[str] = None,
    date: Optional[str] = None,
):
    """Bridge to new deals router logic if needed, or keep for simple sync."""
    try:
        bitrix_user = await gateway.get_user_by_email(email)
        responsible_id = "1"
        if bitrix_user:
            responsible_id = str(bitrix_user.get("ID"))
        else:
            logger.info(f"Dashboard email {email} not found. Defaulting to responsible_id: 1 for real data.")

        deals = await gateway.get_appraiser_deals(int(responsible_id), date)
        if deals:
            return deals
    except Exception as e:
        logger.warning(f"Error fetching Bitrix deals for {email}: {e}")

    return []


@app.get("/")
async def root():
    return {"message": "Auto-Inspection PWA API v3.0 — Phone+PIN Auth", "status": "online"}


# ─── Task B: Outbound Sync ───────────────────────────────────
@app.post("/api/submit-inspection")
async def submit_inspection(data: InspectionSubmission):
    """
    Submit a completed inspection to Bitrix24.
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

    # Build deal fields
    vehicle = data.vehicleData
    basic_info = vehicle.get("basicInfo", {})

    deal_fields = {
        "TITLE": f"Inspekcja: {vehicle.get('make', '')} {vehicle.get('model', '')} - {vehicle.get('registrationPlates', '')}",
        "CATEGORY_ID": 0,
    }

    if discovery.is_initialized:
        transformer = FieldTransformer(discovery)
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

        dynamic_fields = transformer.transform_to_bitrix(flat_data)
        dynamic_fields["STAGE_ID"] = "UC_0T9W8E"
        deal_fields.update(dynamic_fields)
    else:
        logger.warning("Discovery not ready — using direct field names (may fail)")

    if uploaded_file_ids:
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
