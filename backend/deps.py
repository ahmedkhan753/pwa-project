"""
Dependencies
=============
Shared FastAPI dependencies: database sessions, auth verification.
"""

import os
import logging
from fastapi import Depends, HTTPException, Request
from jose import jwt, JWTError
from database import get_db

logger = logging.getLogger("deps")

SECRET_KEY = os.getenv("SECRET_KEY", "supersecretkey123")
ALGORITHM = "HS256"


def get_current_user(request: Request) -> dict:
    """
    Extract and verify user from JWT Bearer token.
    Accepts token via Authorization header OR ?token= query param
    (query param used for direct PDF links on iOS where fetch headers aren't available).
    """
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    else:
        token = request.query_params.get("token")

    if not token:
        raise HTTPException(status_code=401, detail="Missing or invalid token")

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError as e:
        logger.error(f"JWT decode error: {e}")
        raise HTTPException(status_code=401, detail="Token expired or invalid")


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """
    Dependency that ensures the current user has admin role.
    """
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
