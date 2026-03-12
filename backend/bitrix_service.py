"""
Bitrix24 REST API Service Layer
Wraps all Bitrix24 API calls using httpx.
Reads BITRIX_WEBHOOK_URL from environment.
"""

import os
import httpx
import base64
import logging
from typing import Optional

logger = logging.getLogger("bitrix_service")

BITRIX_WEBHOOK_URL = os.getenv("BITRIX_WEBHOOK_URL", "https://replace_this_later")
BITRIX_STORAGE_ID = os.getenv("BITRIX_STORAGE_ID", "1")

# Timeout for Bitrix24 API calls (seconds)
BITRIX_TIMEOUT = 30.0


def _build_url(method: str) -> str:
    """Build the full Bitrix24 REST API URL for a given method."""
    base = BITRIX_WEBHOOK_URL.rstrip("/")
    return f"{base}/{method}"


async def get_user_by_email(email: str) -> Optional[dict]:
    """
    Look up a Bitrix24 user by email to get their ID.
    Returns the user dict or None if not found.
    """
    url = _build_url("user.search")
    params = {"EMAIL": email}

    try:
        async with httpx.AsyncClient(timeout=BITRIX_TIMEOUT) as client:
            response = await client.post(url, json=params)
            response.raise_for_status()
            data = response.json()

            if data.get("result") and len(data["result"]) > 0:
                user = data["result"][0]
                logger.info(f"Found Bitrix24 user for {email}: ID={user.get('ID')}")
                return user
            else:
                logger.warning(f"No Bitrix24 user found for email: {email}")
                return None
    except Exception as e:
        logger.error(f"Error looking up Bitrix24 user by email: {e}")
        return None


async def get_tasks(responsible_id: Optional[str] = None) -> list:
    """
    Fetch tasks from Bitrix24 using tasks.task.list.
    Optionally filter by RESPONSIBLE_ID.
    Returns a list of task dicts with: id, clientName, vin, plates.
    """
    url = _build_url("tasks.task.list")

    params: dict = {
        "select": ["ID", "TITLE", "DESCRIPTION", "RESPONSIBLE_ID", "UF_CRM_TASK"],
    }

    if responsible_id:
        params["filter"] = {"RESPONSIBLE_ID": responsible_id}

    try:
        async with httpx.AsyncClient(timeout=BITRIX_TIMEOUT) as client:
            response = await client.post(url, json=params)
            response.raise_for_status()
            data = response.json()

            tasks = data.get("result", {}).get("tasks", [])

            # Map Bitrix24 tasks to our InspectionJob format
            jobs = []
            for task in tasks:
                job = {
                    "id": str(task.get("id", "")),
                    "bitrixTaskId": str(task.get("id", "")),
                    "clientName": task.get("title", "Unknown Client"),
                    "vin": _extract_field(task, "vin", ""),
                    "plates": _extract_field(task, "plates", ""),
                    "phone": _extract_field(task, "phone", ""),
                    "appointmentTime": task.get("deadline", ""),
                    "status": "pending",
                }
                jobs.append(job)

            logger.info(f"Fetched {len(jobs)} tasks from Bitrix24")
            return jobs

    except Exception as e:
        logger.error(f"Error fetching tasks from Bitrix24: {e}")
        return []


def _extract_field(task: dict, field_name: str, default: str = "") -> str:
    """
    Extract a custom field from a Bitrix24 task.
    Tries the description field for structured data like:
    VIN: WVGZZZ5NZLW123456
    PLATES: WA 12345
    """
    description = task.get("description", "")
    for line in description.split("\n"):
        line = line.strip()
        prefix = f"{field_name.upper()}:"
        if line.upper().startswith(prefix):
            return line[len(prefix):].strip()
    return default


async def create_deal(fields: dict) -> dict:
    """
    Create a CRM deal in Bitrix24 using crm.deal.add.
    Returns the response dict with the new deal ID.
    """
    url = _build_url("crm.deal.add")
    payload = {"fields": fields}

    try:
        async with httpx.AsyncClient(timeout=BITRIX_TIMEOUT) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()

            deal_id = data.get("result")
            logger.info(f"Created Bitrix24 deal: ID={deal_id}")
            return {"status": "success", "dealId": str(deal_id)}

    except httpx.HTTPStatusError as e:
        logger.error(f"Bitrix24 HTTP error creating deal: {e.response.status_code} - {e.response.text}")
        return {"status": "error", "error": f"Bitrix24 HTTP {e.response.status_code}"}
    except Exception as e:
        logger.error(f"Error creating Bitrix24 deal: {e}")
        return {"status": "error", "error": str(e)}


async def upload_file(filename: str, file_content_b64: str) -> Optional[str]:
    """
    Upload a file to Bitrix24 disk storage using disk.storage.uploadfile.
    Takes a base64-encoded file content string.
    Returns the uploaded file ID, or None on failure.
    """
    url = _build_url("disk.storage.uploadfile")

    try:
        # Decode base64 content
        # Handle data URI format (data:image/jpeg;base64,...)
        if "," in file_content_b64:
            file_content_b64 = file_content_b64.split(",", 1)[1]

        file_bytes = base64.b64decode(file_content_b64)

        # Bitrix24 expects multipart upload
        payload = {
            "id": BITRIX_STORAGE_ID,
            "data": {"NAME": filename},
            "fileContent": [filename, base64.b64encode(file_bytes).decode("utf-8")],
        }

        async with httpx.AsyncClient(timeout=BITRIX_TIMEOUT * 2) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()

            file_id = data.get("result", {}).get("ID")
            if file_id:
                logger.info(f"Uploaded file '{filename}' to Bitrix24: ID={file_id}")
                return str(file_id)
            else:
                logger.warning(f"File upload response missing ID: {data}")
                return None

    except Exception as e:
        logger.error(f"Error uploading file to Bitrix24: {e}")
        return None


async def get_responsible_id_for_email(email: str) -> Optional[str]:
    """
    Simple mapping: look up a Bitrix24 user by email and return their ID.
    This is used to set RESPONSIBLE_ID when fetching tasks.
    """
    user = await get_user_by_email(email)
    if user:
        return str(user.get("ID"))
    return None
