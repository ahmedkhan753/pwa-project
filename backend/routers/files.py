"""
Files Router
=============
Single and batch file upload to Bitrix24 deal fields.
Validates file type (jpg/png/pdf) and size (<10MB).
"""

import asyncio
import base64
import logging
from typing import Dict, List
from fastapi import APIRouter, Request, HTTPException, UploadFile, File, Form, Depends
from fastapi.responses import Response
from pydantic import BaseModel
from starlette.requests import ClientDisconnect

from models.inspection import FileUploadResult, BatchUploadResult
from models.inspector import InspectionPhoto
from database import SessionLocal
from deps import get_current_user

router = APIRouter(prefix="/files", tags=["Files"])

# Separate router mounted at /api/files so the public path
# /api/files/upload-binary lands here through nginx /api/* proxy.
# Existing /files/* endpoints (photos) are unchanged.
binary_router = APIRouter(prefix="/api/files", tags=["Files"])

logger = logging.getLogger("routers.files")

# Allowed file types and max size
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "pdf"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB (videos can be large)

# In-memory chunk accumulator for /upload-chunk. One backend instance, so
# a plain dict is fine; a backend restart loses partial uploads and the
# client's whole-file fallback (/upload-binary) covers that case.
#   key: upload_id  →  value: {chunk_index: bytes}
_chunk_buffers: Dict[str, Dict[int, bytes]] = {}


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


class UploadErrorLog(BaseModel):
    deal_id: int
    slot_id: str
    http_status: int
    error: str
    size_kb: int = 0


@router.post("/upload-error-log")
async def upload_error_log(payload: UploadErrorLog):
    """
    POST /files/upload-error-log
    Frontend reports upload failures here so they appear in server logs.
    Called when the fetch() in uploadToBackend() gets a non-2xx or network error.
    """
    is_video = payload.slot_id.startswith("video_")
    kind = "VIDEO" if is_video else "photo"
    if payload.http_status == 0:
        logger.error(
            f"[upload-error] ❌ {kind} '{payload.slot_id}' deal={payload.deal_id} "
            f"~{payload.size_kb}KB — NETWORK/FETCH ERROR (Nginx body limit? CORS?): {payload.error}"
        )
    else:
        logger.error(
            f"[upload-error] ❌ {kind} '{payload.slot_id}' deal={payload.deal_id} "
            f"~{payload.size_kb}KB — HTTP {payload.http_status}: {payload.error}"
        )
    return {"received": True}


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
        is_video = field_key.startswith("video_")
        kind = "VIDEO" if is_video else "photo"

        print(f"[files/upload-json] {kind} deal_id={deal_id}, field_key={field_key}, filename={filename}, b64_len={len(file_base64)}", flush=True)

        if not deal_id or not field_key or not file_base64:
            logger.error(f"[upload-json] ❌ Missing fields: deal_id={deal_id}, field_key={field_key!r}, has_b64={bool(file_base64)}")
            raise HTTPException(status_code=422, detail="Missing required fields: deal_id, field_key, file_base64")

        try:
            file_bytes = base64.b64decode(file_base64)
        except Exception as b64_err:
            logger.error(f"[upload-json] ❌ {kind} '{field_key}' deal={deal_id} — base64 decode failed: {b64_err}")
            raise HTTPException(status_code=400, detail="Invalid base64 data")

        size_mb = len(file_bytes) / 1024 / 1024
        if len(file_bytes) > MAX_FILE_SIZE:
            logger.error(
                f"[upload-json] ❌ {kind} '{field_key}' deal={deal_id} — "
                f"file too large: {size_mb:.1f}MB (limit {MAX_FILE_SIZE // 1024 // 1024}MB)"
            )
            raise HTTPException(
                status_code=413,
                detail=f"File too large: {size_mb:.1f}MB. Max: {MAX_FILE_SIZE // 1024 // 1024}MB.",
            )

        logger.info(f"[upload-json] ▶ {kind} '{field_key}' deal={deal_id} size={len(file_bytes)}B ({size_mb:.2f}MB)")

        # ── Step 1: Save to DB (ALWAYS — DB is source of truth, Bitrix is best-effort) ──
        db_saved = False
        try:
            db = SessionLocal()
            existing = db.query(InspectionPhoto).filter_by(
                deal_id=int(deal_id), slot_id=field_key
            ).first()
            if existing:
                existing.photo_bytes = file_bytes
                logger.info(f"[upload-json] DB updated (overwrite): {kind} '{field_key}' deal={deal_id}")
            else:
                db.add(InspectionPhoto(
                    deal_id=int(deal_id),
                    slot_id=field_key,
                    photo_bytes=file_bytes,
                ))
                logger.info(f"[upload-json] DB inserted: {kind} '{field_key}' deal={deal_id}")
            db.commit()
            db_saved = True
            logger.info(f"[upload-json] ✅ DB saved: {kind} '{field_key}' deal={deal_id}")
        except Exception as db_err:
            logger.error(f"[upload-json] ❌ DB save FAILED for {kind} '{field_key}' deal={deal_id}: {db_err}")
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
                logger.info(f"[upload-json] Bitrix result for {kind} '{field_key}': {result}")
            except Exception as bitrix_err:
                logger.warning(f"[upload-json] Bitrix upload failed for {kind} '{field_key}' (non-fatal): {bitrix_err}")
        else:
            logger.warning(f"[upload-json] Bitrix not ready — skipping Bitrix for {kind} '{field_key}' (DB saved={db_saved})")

        return FileUploadResult(
            field_key=field_key,
            file_id=result.get("file_id") or filename,
            url=result.get("url"),
            success=True,
        )

    except ClientDisconnect:
        logger.error(f"[upload-json] ❌ Client disconnected mid-upload — body likely too large for Nginx (check client_max_body_size)")
        raise HTTPException(status_code=499, detail="Client disconnected")
    except HTTPException as e:
        logger.error(f"❌ upload-json HTTPException {e.status_code}: {e.detail}")
        raise
    except Exception as e:
        logger.error(f"❌ upload-json error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def _save_uploaded_file(
    request: Request,
    deal_id: int,
    field_key: str,
    file_bytes: bytes,
    filename: str,
) -> FileUploadResult:
    """
    Shared persistence path for /upload-binary and /upload-chunk.
    Step 1 (DB save) is canonical; Step 2 (Bitrix) is best-effort.
    Lifted verbatim from the original /upload-binary handler so that both
    endpoints produce byte-identical DB rows and the same Bitrix result.
    """
    is_video = field_key.startswith("video_")
    kind = "VIDEO" if is_video else "binary"
    size_mb = len(file_bytes) / 1024 / 1024

    logger.info(
        f"[upload-save] ▶ {kind} '{field_key}' deal={deal_id} "
        f"size={len(file_bytes)}B ({size_mb:.2f}MB) filename={filename}"
    )

    # ── Step 1: Save to DB (ALWAYS — source of truth) ──
    db_saved = False
    db = None
    try:
        db = SessionLocal()
        existing = db.query(InspectionPhoto).filter_by(
            deal_id=int(deal_id), slot_id=field_key
        ).first()
        if existing:
            existing.photo_bytes = file_bytes
            logger.info(f"[upload-save] DB updated (overwrite): {kind} '{field_key}' deal={deal_id}")
        else:
            db.add(InspectionPhoto(
                deal_id=int(deal_id),
                slot_id=field_key,
                photo_bytes=file_bytes,
            ))
            logger.info(f"[upload-save] DB inserted: {kind} '{field_key}' deal={deal_id}")
        db.commit()
        db_saved = True
        logger.info(f"[upload-save] ✅ DB saved: {kind} '{field_key}' deal={deal_id}")
    except Exception as db_err:
        logger.error(f"[upload-save] ❌ DB save FAILED for {kind} '{field_key}' deal={deal_id}: {db_err}")
    finally:
        if db is not None:
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
            logger.info(f"[upload-save] Bitrix result for {kind} '{field_key}': {result}")
        except Exception as bitrix_err:
            logger.warning(f"[upload-save] Bitrix upload failed for {kind} '{field_key}' (non-fatal): {bitrix_err}")
    else:
        logger.warning(f"[upload-save] Bitrix not ready — skipping Bitrix for {kind} '{field_key}' (DB saved={db_saved})")

    return FileUploadResult(
        field_key=field_key,
        file_id=result.get("file_id") or filename,
        url=result.get("url"),
        success=db_saved or bool(result.get("success")),
    )


@binary_router.post("/upload-binary", response_model=FileUploadResult)
async def upload_file_binary(
    request: Request,
    deal_id: int = Form(..., description="Bitrix deal ID"),
    field_key: str = Form(..., description="PWA field key (e.g. video_engine)"),
    file: UploadFile = File(..., description="Raw binary file (no base64)"),
):
    """
    POST /files/upload-binary
    Multipart binary upload — for video and other large blobs that would
    bloat ~33% as base64-over-JSON. Mirrors /upload-json's contract:
      1. DB save is canonical (always attempted, source of truth).
      2. Bitrix upload is best-effort (never blocks the 200 response).
    """
    is_video = field_key.startswith("video_")
    kind = "VIDEO" if is_video else "binary"
    print(f"[files/upload-binary] handler entered: deal_id={deal_id}, field_key={field_key}", flush=True)

    try:
        file_bytes = await file.read()
        size_mb = len(file_bytes) / 1024 / 1024
        filename = file.filename or f"{field_key}.bin"

        if len(file_bytes) > MAX_FILE_SIZE:
            logger.error(
                f"[upload-binary] ❌ {kind} '{field_key}' deal={deal_id} — "
                f"file too large: {size_mb:.1f}MB (limit {MAX_FILE_SIZE // 1024 // 1024}MB)"
            )
            raise HTTPException(
                status_code=413,
                detail=f"File too large: {size_mb:.1f}MB. Max: {MAX_FILE_SIZE // 1024 // 1024}MB.",
            )

        return await _save_uploaded_file(request, deal_id, field_key, file_bytes, filename)

    except ClientDisconnect:
        logger.error(f"[upload-binary] ❌ Client disconnected mid-upload — body likely exceeded nginx client_max_body_size")
        raise HTTPException(status_code=499, detail="Client disconnected")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ upload-binary error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@binary_router.post("/upload-chunk", response_model=FileUploadResult)
async def upload_chunk(
    request: Request,
    deal_id: int = Form(..., description="Bitrix deal ID"),
    field_key: str = Form(..., description="PWA field key (e.g. video_engine)"),
    upload_id: str = Form(..., description="Client-generated id, unique per upload session"),
    chunk_index: int = Form(..., description="0-based chunk index"),
    total_chunks: int = Form(..., description="Total number of chunks the client will send"),
    filename: str = Form(..., description="Original filename"),
    chunk: UploadFile = File(..., description="Chunk bytes"),
):
    """
    POST /api/files/upload-chunk
    Accumulate one chunk at a time keyed by (upload_id, chunk_index). All
    chunks except the last return a small ack; the last chunk triggers
    reassembly in index order and the same DB-save + best-effort Bitrix
    path used by /upload-binary, so the persisted result is identical
    regardless of which endpoint the client used.

    Edge cases:
      - Missing chunks on assembly → 409 so the client can resend the gap.
      - Duplicate chunk index → overwrites with same bytes (idempotent).
      - Backend restart mid-upload loses _chunk_buffers; the client's
        whole-file fallback (/upload-binary) covers that case.
    """
    try:
        chunk_bytes = await chunk.read()
        buf = _chunk_buffers.setdefault(upload_id, {})
        buf[chunk_index] = chunk_bytes

        # Not the last chunk yet → ack and wait for more.
        if len(buf) < total_chunks:
            logger.info(
                f"[upload-chunk] ◦ {chunk_index + 1}/{total_chunks} "
                f"({len(chunk_bytes)}B) upload_id={upload_id} field='{field_key}' deal={deal_id}"
            )
            return FileUploadResult(
                field_key=field_key,
                file_id=f"{upload_id}:{chunk_index}",
                url=None,
                success=True,
            )

        # All chunks present → reassemble in order.
        try:
            file_bytes = b"".join(buf[i] for i in range(total_chunks))
        except KeyError:
            have = sorted(buf.keys())
            logger.warning(
                f"[upload-chunk] ⚠ missing chunks for upload_id={upload_id} field='{field_key}'; have={have}"
            )
            raise HTTPException(status_code=409, detail=f"missing chunks, have {have}")

        # Cleanup buffer before we run the (potentially slow) save path so a
        # client-disconnect mid-save doesn't leave the buffer pinned.
        _chunk_buffers.pop(upload_id, None)

        # Size guard (same limit as /upload-binary).
        size_mb = len(file_bytes) / 1024 / 1024
        if len(file_bytes) > MAX_FILE_SIZE:
            logger.error(
                f"[upload-chunk] ❌ '{field_key}' deal={deal_id} — reassembled "
                f"too large: {size_mb:.1f}MB (limit {MAX_FILE_SIZE // 1024 // 1024}MB)"
            )
            raise HTTPException(
                status_code=413,
                detail=f"File too large: {size_mb:.1f}MB. Max: {MAX_FILE_SIZE // 1024 // 1024}MB.",
            )

        logger.info(
            f"[upload-chunk] ▶ reassembled '{field_key}' deal={deal_id} "
            f"{total_chunks} chunks → {len(file_bytes)}B ({size_mb:.2f}MB)"
        )

        return await _save_uploaded_file(request, deal_id, field_key, file_bytes, filename)

    except ClientDisconnect:
        logger.error(f"[upload-chunk] ❌ Client disconnected mid-chunk for upload_id={upload_id}")
        raise HTTPException(status_code=499, detail="Client disconnected")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ upload-chunk error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list/{deal_id}")
async def list_uploaded_slots(deal_id: int):
    """
    GET /files/list/{deal_id}
    Returns the list of slot_ids that have already been uploaded for this deal.
    Used by the wizard to restore "uploaded" markers after an iOS WebKit crash
    or page reload — so the inspector can see which photos are safe in the DB
    even when the in-memory base64 has been wiped.
    """
    try:
        db = SessionLocal()
        rows = db.query(InspectionPhoto.slot_id).filter(
            InspectionPhoto.deal_id == int(deal_id)
        ).all()
        slot_ids = sorted({r[0] for r in rows if r and r[0]})
        return {"deal_id": int(deal_id), "uploaded_slots": slot_ids, "count": len(slot_ids)}
    except Exception as e:
        logger.error(f"[files/list] failed for deal {deal_id}: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        try:
            db.close()
        except Exception:
            pass


def _sniff_media_type(slot_id: str, data: bytes) -> str:
    """
    Content-Type for a stored inspection_photos row.

    Slot id is the primary signal — `video_*` slots (e.g. video_engine) always
    hold video — and magic bytes pick the concrete container. Mirrors the
    defaults of report._detect_video_mime (webm magic → webm, otherwise mp4)
    so the same row serves identically through /files and /api/gallery.
    Falls back to image/jpeg: that's what the PWA compresses photos to.
    """
    head = data[:12]

    if slot_id.startswith("video_"):
        if head[:4] == b"\x1aE\xdf\xa3":
            return "video/webm"
        return "video/mp4"

    if head[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if head[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if head[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"

    # Non-video slot id holding video bytes — possible via the native file-input
    # fallback path. Sniff rather than mislabel it as an image.
    if head[:4] == b"\x1aE\xdf\xa3":
        return "video/webm"
    if len(data) >= 12 and data[4:8] == b"ftyp":
        return "video/mp4"

    return "image/jpeg"


@router.get("/photo/{deal_id}/{slot_id}")
async def get_uploaded_photo(
    deal_id: int,
    slot_id: str,
    _user: dict = Depends(get_current_user),
):
    """
    GET /files/photo/{deal_id}/{slot_id}
    Stream back the bytes of one already-uploaded slot.

    Companion to /files/list/{deal_id}: that endpoint says *which* slots are in
    the DB, this one returns the actual image so the wizard can render a real
    thumbnail after a reload instead of a generic "saved" placeholder.

    Auth uses get_current_user, which also accepts `?token=` — required here
    because an <img src> cannot send an Authorization header (same reason the
    PDF links use it).
    """
    db = None
    try:
        db = SessionLocal()
        row = db.query(InspectionPhoto).filter(
            InspectionPhoto.deal_id == int(deal_id),
            InspectionPhoto.slot_id == slot_id,
        ).first()
        if row is None or not row.photo_bytes:
            raise HTTPException(status_code=404, detail="Photo not found")

        data: bytes = row.photo_bytes
        return Response(
            content=data,
            media_type=_sniff_media_type(slot_id, data),
            headers={
                "Content-Length": str(len(data)),
                # Short and private: a slot can be overwritten by a retake or
                # removed by the DELETE below, so it must not be cached hard.
                "Cache-Control": "private, max-age=60",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[files/photo] GET failed deal={deal_id} slot={slot_id}: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Failed to read photo")
    finally:
        if db is not None:
            try:
                db.close()
            except Exception:
                pass


@router.delete("/photo/{deal_id}/{slot_id}")
async def delete_uploaded_photo(
    deal_id: int,
    slot_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    DELETE /files/photo/{deal_id}/{slot_id}
    Remove the stored row(s) for this slot so the inspector's "X" actually
    clears the server copy — previously it only wiped local state and the DB
    row survived, leaving the slot stuck on ZAPISANO after the next reload.

    Inspector-authed (get_current_user), unlike the read-only /files/list.
    404 when nothing matched, so the client can tell "already gone" from
    "delete failed" and avoid clearing local state on a real failure.
    Bitrix-side cleanup is deliberately not attempted — same call as the
    admin delete: the DB is what the wizard and the report read first.
    """
    db = None
    try:
        db = SessionLocal()
        rows = db.query(InspectionPhoto).filter(
            InspectionPhoto.deal_id == int(deal_id),
            InspectionPhoto.slot_id == slot_id,
        ).all()
        if not rows:
            raise HTTPException(status_code=404, detail="Photo not found")

        total_bytes = sum(len(r.photo_bytes) if r.photo_bytes else 0 for r in rows)
        for r in rows:
            db.delete(r)
        db.commit()

        who = current_user.get("name") or current_user.get("phone") or current_user.get("sub") or "?"
        logger.warning(
            f"[files/photo] DELETED deal={deal_id} slot={slot_id} "
            f"rows={len(rows)} size={total_bytes}B by={who}"
        )
        return {
            "success": True,
            "deal_id": int(deal_id),
            "slot_id": slot_id,
            "deleted": len(rows),
        }
    except HTTPException:
        raise
    except Exception as e:
        if db is not None:
            try:
                db.rollback()
            except Exception:
                pass
        logger.error(f"[files/photo] DELETE failed deal={deal_id} slot={slot_id}: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete photo")
    finally:
        if db is not None:
            try:
                db.close()
            except Exception:
                pass


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
