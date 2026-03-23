"""
Files Router
=============
Single and batch file upload to Bitrix24 deal fields.
Validates file type (jpg/png/pdf) and size (<10MB).
"""

import asyncio
import logging
from typing import List
from fastapi import APIRouter, Request, HTTPException, UploadFile, File, Form

from models.inspection import FileUploadResult, BatchUploadResult

router = APIRouter(prefix="/files", tags=["Files"])
logger = logging.getLogger("routers.files")

# Allowed file types and max size
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "pdf"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


def _validate_file(file: UploadFile) -> str:
    """
    Validate file type and return the extension.
    Raises HTTPException on invalid files.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="File has no filename")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: .{ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )
    return ext


@router.post("/upload", response_model=FileUploadResult)
async def upload_file(
    request: Request,
    deal_id: int = Form(..., description="Bitrix deal ID"),
    field_key: str = Form(..., description="PWA field key (e.g. photo_front)"),
    file: UploadFile = File(..., description="File to upload"),
):
    """
    POST /files/upload
    Upload a single file to a specific deal field.
    Validates file type (jpg/png/pdf) and size (<10MB).
    """
    gateway = request.app.state.gateway
    bitrix_ready = getattr(request.app.state, "bitrix_ready", False)

    if not bitrix_ready:
        raise HTTPException(
            status_code=503,
            detail="Bitrix24 integration not ready",
        )

    # Validate file type
    _validate_file(file)

    # Read file bytes
    file_bytes = await file.read()

    # Validate file size
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large: {len(file_bytes) / 1024 / 1024:.1f}MB. Max: 10MB.",
        )

    try:
        result = await gateway.upload_file(
            deal_id=deal_id,
            field_pwa_key=field_key,
            file_bytes=file_bytes,
            filename=file.filename,
        )

        return FileUploadResult(
            field_key=field_key,
            file_id=result.get("file_id"),
            url=result.get("url"),
            success=result.get("success", False),
        )

    except Exception as e:
        logger.error(f"File upload failed (deal={deal_id}, key={field_key}): {e}")
        return FileUploadResult(
            field_key=field_key,
            file_id=None,
            url=None,
            success=False,
            error=str(e),
        )


@router.post("/upload-batch", response_model=BatchUploadResult)
async def upload_batch(
    request: Request,
    deal_id: int = Form(..., description="Bitrix deal ID"),
    files: List[UploadFile] = File(..., description="Files to upload"),
    field_keys: str = Form(
        "",
        description="Comma-separated PWA field keys, one per file",
    ),
):
    """
    POST /files/upload-batch
    Upload multiple files concurrently (asyncio.gather).
    Returns array of results with any failures noted.
    """
    gateway = request.app.state.gateway
    bitrix_ready = getattr(request.app.state, "bitrix_ready", False)

    if not bitrix_ready:
        raise HTTPException(
            status_code=503,
            detail="Bitrix24 integration not ready",
        )

    # Parse field keys
    keys = [k.strip() for k in field_keys.split(",") if k.strip()] if field_keys else []

    async def _upload_single(idx: int, upload_file: UploadFile) -> FileUploadResult:
        """Upload a single file, returning result (never raises)."""
        fk = keys[idx] if idx < len(keys) else f"file_{idx}"

        try:
            _validate_file(upload_file)
            file_bytes = await upload_file.read()

            if len(file_bytes) > MAX_FILE_SIZE:
                return FileUploadResult(
                    field_key=fk,
                    success=False,
                    error=f"File too large: {len(file_bytes) / 1024 / 1024:.1f}MB",
                )

            result = await gateway.upload_file_to_deal(
                deal_id=deal_id,
                field_pwa_key=fk,
                file_bytes=file_bytes,
                filename=upload_file.filename or f"file_{idx}",
            )

            return FileUploadResult(
                field_key=fk,
                file_id=result.get("file_id"),
                url=result.get("url"),
                success=result.get("success", False),
            )

        except HTTPException as e:
            return FileUploadResult(
                field_key=fk,
                success=False,
                error=e.detail,
            )
        except Exception as e:
            logger.error(f"Batch upload failed for file {idx}: {e}")
            return FileUploadResult(
                field_key=fk,
                success=False,
                error=str(e),
            )

    # Upload all files concurrently
    tasks = [_upload_single(i, f) for i, f in enumerate(files)]
    results = await asyncio.gather(*tasks)

    successful = sum(1 for r in results if r.success)
    failed = sum(1 for r in results if not r.success)

    return BatchUploadResult(
        total=len(results),
        successful=successful,
        failed=failed,
        results=list(results),
    )
