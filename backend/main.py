from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import time

app = FastAPI(title="Auto-Inspection PWA Backend")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mock Data Storage
MOCK_JOBS = [
    {
        "id": "job_1",
        "clientName": "Jan Kowalski",
        "vin": "WVGZZZ5NZLW123456",
        "plates": "WA 12345",
        "phone": "+48600100200",
        "appointmentTime": "2024-03-20 10:00",
        "status": "pending"
    },
    {
        "id": "job_2",
        "clientName": "Anna Nowak",
        "vin": "TMKDA7NE1L098765",
        "plates": "PO 98765",
        "phone": "+48700800900",
        "appointmentTime": "2024-03-20 14:30",
        "status": "pending"
    }
]

class LoginRequest(BaseModel):
    email: str
    password: str

class InspectionData(BaseModel):
    id: str
    vehicleData: dict
    damages: list
    photos: list
    signature: Optional[str]

@app.post("/auth/login")
async def login(request: LoginRequest):
    # In a real app, verify against Bitrix24 or DB
    if "error" in request.email:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    return {
        "token": f"token_{int(time.time())}",
        "user": {
            "id": "1",
            "email": request.email,
            "name": "Appraiser Marek"
        }
    }

@app.get("/jobs/appraiser")
async def get_jobs():
    return MOCK_JOBS

@app.post("/api/inspection")
async def submit_inspection(data: InspectionData):
    print(f"Received inspection for job: {data.id}")
    # Logic to push to Bitrix24 would go here
    return {"status": "success", "message": "Inspection submitted to Bitrix24"}

@app.get("/health")
async def health():
    return {"status": "ok"}
