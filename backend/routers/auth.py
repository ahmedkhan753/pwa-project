"""
Auth Router — Phone + PIN authentication for inspectors, admin password login.
"""

import warnings
warnings.filterwarnings("ignore", ".*error reading bcrypt version.*")

import os
import logging
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from passlib.context import CryptContext
from jose import jwt
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from database import get_db
from models.inspector import Inspector
from deps import get_current_user

router = APIRouter(tags=["Auth"])
logger = logging.getLogger("routers.auth")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = os.getenv("SECRET_KEY", "supersecretkey123")
ALGORITHM = "HS256"
TOKEN_EXPIRE_DAYS = 30


class PhoneLoginRequest(BaseModel):
    phone: str
    pin: str


class AdminLoginRequest(BaseModel):
    password: str


def create_token(data: dict) -> str:
    """Create a JWT token with expiry."""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


@router.post("/auth/login")
async def login(request: PhoneLoginRequest, db: Session = Depends(get_db)):
    """Inspector login via phone number + 4-digit PIN."""
    logger.info(f"Login attempt for phone: {request.phone}")

    inspector = db.query(Inspector).filter(
        Inspector.phone == request.phone,
        Inspector.is_active == True
    ).first()

    if not inspector:
        logger.warning(f"Login failed — phone not found: {request.phone}")
        raise HTTPException(status_code=401, detail="Nieprawidłowy numer telefonu lub PIN")

    if not pwd_context.verify(str(request.pin), inspector.pin_hash):
        logger.warning(f"Login failed — wrong PIN for phone: {request.phone}")
        raise HTTPException(status_code=401, detail="Nieprawidłowy numer telefonu lub PIN")

    token = create_token({
        "inspector_id": inspector.id,
        "phone": inspector.phone,
        "name": inspector.name,
        "email": inspector.email or "",
        "role": "inspector",
    })

    logger.info(f"✅ Login successful: {inspector.name} ({inspector.phone})")

    return {
        "access_token": token,
        "inspector": {
            "id": inspector.id,
            "name": inspector.name,
            "phone": inspector.phone,
            "email": inspector.email,
        }
    }


@router.post("/auth/admin/login")
async def admin_login(request: AdminLoginRequest):
    """Admin login via a shared password."""
    admin_password = os.getenv("ADMIN_PASSWORD", "Admin2025!")

    if request.password != admin_password:
        raise HTTPException(status_code=401, detail="Invalid admin password")

    token = create_token({"role": "admin", "name": "Admin"})
    logger.info("✅ Admin login successful")

    return {"access_token": token}


@router.get("/auth/me")
async def get_me(request: Request):
    """Return current user info from JWT."""
    user = get_current_user(request)
    return {
        "id": user.get("inspector_id"),
        "name": user.get("name"),
        "phone": user.get("phone"),
        "email": user.get("email"),
        "role": user.get("role"),
    }
