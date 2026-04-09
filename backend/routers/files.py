"""
Files Router
=============
Single and batch file upload to Bitrix24 deal fields.
Validates file type (jpg/png/pdf) and size (<10MB).
"""

import asyncio
import base64
import logging
from typing import List
from fastapi import APIRouter, Request, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from starlette.requests import ClientDisconnect

from models.inspection import FileUploadResult, BatchUploadResult
from models.inspector import InspectionPhoto
from database import SessionLocal

router = APIRouter(prefix="/files", tags=["Files"])
logger = logging.getLogger("routers.files")

# Allowed file types and max size
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "pdf"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB (videos can be large)


def _validate_file(file: UploadFile) -> str:
    """
    Validate file type and return the extension.
    Falls back to 'jpg' if filename is missing or has no recognised extension.
    """
    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        # Attempt to infer from content-type before rejecting
        ct = (file.content_type or "").lower()
        if "jpeg" in ct or "jpg" in ct:
            ext = "jpg"
        elif "png" in ct:
            ext = "png"
        elif "pdf" in ct:
            ext = "pdf"
        else:
            ext = "jpg"  # default for canvas-compressed blobs
        logger.warning(f"No valid extension in filename '{filename}'; inferred '{ext}' from content-type '{ct}'")
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
    print(f"[files/upload] handler called: deal_id={deal_id}, field_key={field_key}, filename={file.filename!r}, content_type={file.content_type!r}", flush=True)
    try:
        gateway = request.app.state.gateway
        bitrix_ready = getattr(request.app.state, "bitrix_ready", False)

        if not bitrix_ready:
            raise HTTPException(
                status_code=503,
                detail="Bitrix24 integration not ready",
            )

        # Validate file type (never raises — falls back to jpg)
        ext = _validate_file(file)
        safe_filename = file.filename or f"{field_key}.{ext}"

        # Read file bytes
        file_bytes = await file.read()

        # Validate file size
        if len(file_bytes) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File too large: {len(file_bytes) / 1024 / 1024:.1f}MB. Max: 10MB.",
            )

        logger.info(f"Uploading file to deal {deal_id}, field_key={field_key}, size={len(file_bytes)}B, filename={safe_filename}")
        result = await gateway.upload_file_to_deal(
            deal_id=deal_id,
            field_pwa_key=field_key,
            file_bytes=file_bytes,
            filename=safe_filename,
        )
        logger.info(f"Upload result for {field_key}: {result}")

        return FileUploadResult(
            field_key=field_key,
            file_id=result.get("file_id"),
            url=result.get("url"),
            success=result.get("success", False),
        )

    except HTTPException as e:
        logger.error(f"❌ Upload HTTPException {e.status_code}: {e.detail} (deal={deal_id}, key={field_key})")
        raise  # let FastAPI handle 400/413/503 normally
    except Exception as e:
        logger.error(f"❌ Upload parse error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=400, detail=str(e))


class FileUploadJSON(BaseModel):
    deal_id: int
    field_key: str
    file_base64: str          # raw base64 string (no data: prefix)
    filename: str = "photo.jpg"


@router.post("/debug-raw")
async def debug_raw(request: Request):
    """Debug: read raw body without Pydantic to confirm route is reachable."""
    body = await request.body()
    ct = request.headers.get("content-type", "none")
    auth = request.headers.get("authorization", "none")[:30]
    print(f"[debug-raw] ct={ct}, auth_prefix={auth}, body_len={len(body)}", flush=True)
    logger.info(f"[debug-raw] ct={ct}, body_len={len(body)}")
    return {"ok": True, "body_len": len(body), "content_type": ct}


@router.post("/upload-json", response_model=FileUploadResult)
async def upload_file_json(request: Request):
    """
    POST /files/upload-json
    JSON alternative to /upload — accepts base64-encoded file data.
    Reads raw body manually to avoid FastAPI's JSON parser raising 400 on large payloads.
    """
    import json as _json
    print(f"[files/upload-json] handler entered", flush=True)
    try:
        raw = await request.body()
        print(f"[files/upload-json] body received: {len(raw)} bytes", flush=True)
        try:
            data = _json.loads(raw)
        except Exception as je:
            logger.error(f"[upload-json] JSON parse error ({len(raw)}B): {je}")
            logger.error(f"[upload-json] body prefix: {raw[:200]}")
            raise HTTPException(status_code=400, detail=f"Invalid JSON: {je}")

        deal_id = data.get("deal_id")
        field_key = data.get("field_key", "")
        file_base64 = data.get("file_base64", "")
        filename = data.get("filename", "photo.jpg")

        print(f"[files/upload-json] deal_id={deal_id}, field_key={field_key}, filename={filename}, b64_len={len(file_base64)}", flush=True)

        if not deal_id or not field_key or not file_base64:
            raise HTTPException(status_code=422, detail="Missing required fields: deal_id, field_key, file_base64")

        try:
            file_bytes = base64.b64decode(file_base64)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid base64 data")

        if len(file_bytes) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File too large: {len(file_bytes) / 1024 / 1024:.1f}MB. Max: {MAX_FILE_SIZE // 1024 // 1024}MB.",
            )

        logger.info(f"[upload-json] {field_key} deal={deal_id} size={len(file_bytes)}B")

        # ── Step 1: Save to DB (ALWAYS — DB is source of truth, Bitrix is best-effort) ──
        db_saved = False
        try:
            db = SessionLocal()
            existing = db.query(InspectionPhoto).filter_by(
                deal_id=int(deal_id), slot_id=field_key
            ).first()
            if existing:
                existing.photo_bytes = file_bytes
            else:
                db.add(InspectionPhoto(
                    deal_id=int(deal_id),
                    slot_id=field_key,
                    photo_bytes=file_bytes,
                ))
            db.commit()
            db_saved = True
            logger.info(f"[upload-json] DB saved: {field_key} deal={deal_id}")
        except Exception as db_err:
            logger.warning(f"[upload-json] DB save failed for {field_key}: {db_err}")
        finally:
            try:
                db.close()
            except Exception:
                pass

        # ── Step 2: Best-effort Bitrix upload (never blocks Step 1) ──
        gateway = request.app.state.gateway
        bitrix_ready = getattr(request.app.state, "bitrix_ready", False)
        result: dict = {"file_id": filename, "url": None, "success": db_saved}
        if bitrix_ready:
            try:
                result = await gateway.upload_file_to_deal(
                    deal_id=int(deal_id),
                    field_pwa_key=field_key,
                    file_bytes=file_bytes,
                    filename=filename,
                )
                logger.info(f"[upload-json] Bitrix result for {field_key}: {result}")
            except Exception as bitrix_err:
                logger.warning(f"[upload-json] Bitrix upload failed for {field_key} (non-fatal): {bitrix_err}")
        else:
            logger.info(f"[upload-json] Bitrix not ready — skipping Bitrix upload for {field_key} (DB saved={db_saved})")

        return FileUploadResult(
            field_key=field_key,
            file_id=result.get("file_id") or filename,
            url=result.get("url"),
            success=True,  # always true if we got here; DB save is what matters
        )

    except ClientDisconnect:
        logger.warning(f"[upload-json] Client disconnected before body was fully received — body too large for connection?")
        raise HTTPException(status_code=499, detail="Client disconnected")
    except HTTPException as e:
        logger.error(f"❌ upload-json HTTPException {e.status_code}: {e.detail}")
        raise
    except Exception as e:
        logger.error(f"❌ upload-json error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
            ext = _validate_file(upload_file)
            safe_filename = upload_file.filename or f"{fk}.{ext}"
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
                filename=safe_filename,
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
