from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from dotenv import load_dotenv
import time
import logging
import base64
import json

# Load .env before importing bitrix_service
load_dotenv()

import bitrix_service

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("main")

app = FastAPI(title="Auto-Inspection PWA Backend")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Mock Data Fallback ──────────────────────────────────────
MOCK_JOBS = [
    {
        "id": "job_1",
        "bitrixTaskId": "mock_1",
        "clientName": "Jan Kowalski",
        "vin": "WVGZZZ5NZLW123456",
        "plates": "WA 12345",
        "phone": "+48600100200",
        "appointmentTime": "2024-03-20 10:00",
        "status": "pending"
    },
    {
        "id": "job_2",
        "bitrixTaskId": "mock_2",
        "clientName": "Anna Nowak",
        "vin": "TMKDA7NE1L098765",
        "plates": "PO 98765",
        "phone": "+48700800900",
        "appointmentTime": "2024-03-20 14:30",
        "status": "pending"
    }
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
    # Compressed images as base64 strings
    images: List[str] = []


# ─── Auth Endpoint ────────────────────────────────────────────
@app.post("/auth/login")
async def login(request: LoginRequest):
    """
    Login endpoint. Attempts to map user email to Bitrix24 RESPONSIBLE_ID.
    Falls back to mock user if Bitrix24 is not configured.
    """
    if "error" in request.email:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Try to look up user in Bitrix24 by email
    bitrix_user = await bitrix_service.get_user_by_email(request.email)

    if bitrix_user:
        user_data = {
            "id": str(bitrix_user.get("ID", "1")),
            "email": request.email,
            "name": f"{bitrix_user.get('NAME', '')} {bitrix_user.get('LAST_NAME', '')}".strip() or "Appraiser",
            "bitrixId": str(bitrix_user.get("ID", "")),
        }
    else:
        # Fallback to mock user
        user_data = {
            "id": "1",
            "email": request.email,
            "name": "Appraiser Marek",
            "bitrixId": "",
        }

    return {
        "token": f"token_{int(time.time())}",
        "user": user_data,
    }


# ─── Task A: Inbound Sync ────────────────────────────────────
@app.get("/api/tasks")
async def get_tasks(responsible_id: Optional[str] = None, email: Optional[str] = None):
    """
    Fetch tasks from Bitrix24 filtered by RESPONSIBLE_ID.
    If email is provided, looks up the user's Bitrix24 ID first.
    Falls back to mock data if Bitrix24 is unreachable.
    """
    # If email is provided, resolve to Bitrix24 user ID
    if email and not responsible_id:
        responsible_id = await bitrix_service.get_responsible_id_for_email(email)
        if not responsible_id:
            logger.warning(f"Could not resolve Bitrix24 ID for email: {email}, using mock data")

    # Try Bitrix24 first
    tasks = await bitrix_service.get_tasks(responsible_id)

    if tasks:
        return tasks

    # Fallback to mock data
    logger.info("Using mock data fallback for tasks")
    return MOCK_JOBS


# Keep the old endpoint for backward compatibility
@app.get("/jobs/appraiser")
async def get_jobs():
    """Legacy endpoint — redirects to /api/tasks internally."""
    return await get_tasks()


# ─── Task B: Outbound Sync ───────────────────────────────────
@app.post("/api/submit-inspection")
async def submit_inspection(data: InspectionSubmission):
    """
    Submit a completed inspection to Bitrix24.
    1. Uploads all images to Bitrix24 disk storage
    2. Maps form fields to Bitrix24 CRM Deal custom fields
    3. Creates a CRM Deal with attached file IDs
    Returns status: 'submitted' or 'retry' (for PWA localStorage queue)
    """
    logger.info(f"Received inspection submission for job: {data.jobId}")

    # Step 1: Upload images to Bitrix24
    uploaded_file_ids = []

    # Upload photo slot images
    for i, photo in enumerate(data.photos):
        b64 = photo.get("base64", "")
        if b64:
            label = photo.get("label", f"photo_{i}")
            filename = f"inspection_{data.jobId}_{label}.jpg"
            file_id = await bitrix_service.upload_file(filename, b64)
            if file_id:
                uploaded_file_ids.append(file_id)

    # Upload damage photos
    for damage in data.exteriorDamage + data.interiorDamage:
        for j, photo_b64 in enumerate(damage.get("photos", [])):
            if photo_b64:
                filename = f"damage_{data.jobId}_{damage.get('id', '')}_{j}.jpg"
                file_id = await bitrix_service.upload_file(filename, photo_b64)
                if file_id:
                    uploaded_file_ids.append(file_id)

    # Upload additional base64 images from the images array
    for k, img_b64 in enumerate(data.images):
        if img_b64:
            filename = f"extra_{data.jobId}_{k}.jpg"
            file_id = await bitrix_service.upload_file(filename, img_b64)
            if file_id:
                uploaded_file_ids.append(file_id)

    # Upload signatures
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

    # Step 2: Map form fields to Bitrix24 Deal fields
    vehicle = data.vehicleData
    basic_info = vehicle.get("basicInfo", {})

    deal_fields = {
        # System fields
        "TITLE": f"Inspekcja: {vehicle.get('make', '')} {vehicle.get('model', '')} - {vehicle.get('registrationPlates', '')}",
        "CATEGORY_ID": 0,

        # Vehicle Data
        "UF_CRM_VIN": vehicle.get("vin", ""),
        "UF_CRM_REG_PLATES": vehicle.get("registrationPlates", ""),
        "UF_CRM_MAKE": vehicle.get("make", ""),
        "UF_CRM_MODEL": vehicle.get("model", ""),
        "UF_CRM_YEAR": vehicle.get("year", ""),
        "UF_CRM_COLOR": vehicle.get("color", ""),
        "UF_CRM_MILEAGE": vehicle.get("mileage", ""),
        "UF_CRM_ENGINE_CAPACITY": vehicle.get("engineCapacity", ""),
        "UF_CRM_ENGINE_POWER": vehicle.get("enginePower", ""),
        "UF_CRM_FUEL_TYPE": vehicle.get("fuelType", ""),
        "UF_CRM_BODY_TYPE": vehicle.get("bodyType", ""),
        "UF_CRM_GEARBOX": vehicle.get("gearboxType", ""),
        "UF_CRM_DRIVE_TYPE": vehicle.get("driveType", ""),
        "UF_CRM_FIRST_REG": vehicle.get("firstRegistration", ""),
        "UF_CRM_PROD_DATE": vehicle.get("productionDate", ""),

        # Basic Info
        "UF_CRM_COMPANY": basic_info.get("companyName", ""),
        "UF_CRM_OWNER": basic_info.get("userOwner", ""),
        "UF_CRM_INSPECT_PLACE": basic_info.get("inspectionPlace", ""),
        "UF_CRM_INSPECT_DATE": basic_info.get("inspectionDate", ""),
        "UF_CRM_INSPECTOR": basic_info.get("inspectorName", ""),

        # Equipment Completeness (JSON)
        "UF_CRM_EQUIP_COMPLETE": json.dumps(data.equipmentCompleteness),

        # Full Equipment (JSON)
        "UF_CRM_FULL_EQUIP": json.dumps(data.fullEquipment),

        # Paint Measurement (JSON)
        "UF_CRM_PAINT_DATA": json.dumps(data.paintMeasurement),

        # Tires (JSON)
        "UF_CRM_TIRES_DATA": json.dumps(data.tires),

        # Damages (JSON)
        "UF_CRM_EXT_DAMAGES": json.dumps([
            {
                "part": d.get("part", ""),
                "type": d.get("type", ""),
                "size": d.get("size", ""),
                "action": d.get("action", ""),
                "description": d.get("description", ""),
                "photo_count": len(d.get("photos", [])),
            }
            for d in data.exteriorDamage
        ]),

        "UF_CRM_INT_DAMAGES": json.dumps([
            {
                "part": d.get("part", ""),
                "type": d.get("type", ""),
                "size": d.get("size", ""),
                "action": d.get("action", ""),
                "description": d.get("description", ""),
                "photo_count": len(d.get("photos", [])),
            }
            for d in data.interiorDamage
        ]),

        # Mechanical Checklist (JSON)
        "UF_CRM_MECHANICAL": json.dumps(data.mechanical),

        # Notes & Valuation (JSON)
        "UF_CRM_NOTES_VALUATION": json.dumps(data.notesValuation),

        # VIN Confirmation
        "UF_CRM_VIN_CONFIRMED": data.finalSummary.get("vinConfirmed", False),

        # Valuation
        "UF_CRM_EST_VALUE": data.notesValuation.get("estimatedValue", ""),
        "UF_CRM_GENERAL_COMMENTS": data.notesValuation.get("generalComments", ""),
    }

    # Attach uploaded file IDs
    if uploaded_file_ids:
        deal_fields["UF_CRM_FILES"] = uploaded_file_ids

    # Step 3: Create the CRM Deal
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
        # Return retry status so PWA keeps data in localStorage
        logger.warning(f"Bitrix24 submission failed: {result.get('error')}")
        return {
            "status": "retry",
            "error": result.get("error", "Unknown error"),
            "message": "Submission failed. Data preserved for retry.",
        }


# ─── Legacy Endpoint ─────────────────────────────────────────
@app.post("/api/inspection")
async def submit_inspection_legacy(data: dict):
    """Legacy endpoint for backward compatibility."""
    logger.info(f"Legacy inspection endpoint called")
    return {"status": "success", "message": "Use /api/submit-inspection for Bitrix24 integration."}


# ─── Health Check ─────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok"}
