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
from fastapi import FastAPI, HTTPException, Request, Depends, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
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

    # Step 0: Create database tables + run column migrations
    logger.info("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    from database import migrate_db
    migrate_db(engine)
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

    # ─── Periodic OAuth token refresh (keeps refresh_token alive) ─────
    import asyncio
    async def _oauth_keep_alive():
        """Refresh OAuth tokens every 12 hours to prevent expiry."""
        while True:
            await asyncio.sleep(12 * 3600)  # 12 hours
            try:
                from services.bitrix_oauth import get_oauth
                oauth = get_oauth()
                if oauth.has_tokens():
                    success = await oauth.refresh_tokens()
                    if success:
                        logger.info("[OAuth KeepAlive] ✅ Tokens refreshed")
                    else:
                        logger.warning("[OAuth KeepAlive] ⚠ Token refresh failed")
            except Exception as e:
                logger.error(f"[OAuth KeepAlive] Error: {e}")

    _keep_alive_task = asyncio.create_task(_oauth_keep_alive())

    yield

    # Shutdown
    _keep_alive_task.cancel()
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

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    logger.error(f"❌ HTTPException {exc.status_code} on {request.method} {request.url.path}: {exc.detail}")
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    try:
        body = await request.body()
        body_str = body.decode("utf-8", errors="replace")[:2000]
    except Exception:
        body_str = "<unreadable>"
    logger.error(f"422 Unprocessable Entity for {request.url.path}")
    logger.error(f"Validation errors: {exc.errors()}")
    logger.error(f"Raw body (first 2000 chars): {body_str}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": body_str},
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    logger.error(f"❌ UNHANDLED ERROR on {request.method} {request.url.path}: {type(exc).__name__}: {exc}")
    logger.error(traceback.format_exc())
    return JSONResponse(status_code=500, content={"detail": str(exc)})


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
from routers import admin_reports as admin_reports_router
from routers import webhook as webhook_router
from routers import report as report_router
from routers import kosztorys as kosztorys_router
from routers import macadam as macadam_router

app.include_router(health.router)
app.include_router(deals.router)
app.include_router(inspection.router)
app.include_router(files.router)
app.include_router(files.binary_router)
app.include_router(metadata.router)
app.include_router(auth_router.router)
app.include_router(admin_router.router)
app.include_router(admin_reports_router.router)
app.include_router(webhook_router.router)
# Public report endpoint — no auth required
app.include_router(report_router.router)
app.include_router(kosztorys_router.router)
app.include_router(macadam_router.router)


# ─── QR Debug Endpoint ────────────────────────────────────────
import logging as _logging
_qr_dbg_log = _logging.getLogger("qr_debug")

class QRDebugPayload(BaseModel):
    raw_length: int
    first_bytes_latin1: list  # first 30 charCodes (latin-1 view)
    first_bytes_utf8: list    # first 30 bytes of TextEncoder output
    path_taken: str           # "aztec_latin1" | "aztec_utf8" | "plain" | "rawtext" | "none"
    vin_found: str
    make_found: str
    raw_preview: str          # first 80 chars of rawValue (as JSON-escaped)

@app.post("/debug/qr")
async def debug_qr(payload: QRDebugPayload):
    _qr_dbg_log.info(
        f"[QR-DBG] len={payload.raw_length} path={payload.path_taken} "
        f"VIN='{payload.vin_found}' make='{payload.make_found}'"
    )
    _qr_dbg_log.info(
        f"[QR-DBG] latin1_bytes={payload.first_bytes_latin1}"
    )
    _qr_dbg_log.info(
        f"[QR-DBG] utf8_bytes={payload.first_bytes_utf8}"
    )
    _qr_dbg_log.info(
        f"[QR-DBG] raw_preview={payload.raw_preview!r}"
    )
    return {"ok": True}


# ─── Server-side barcode decode ───────────────────────────────
import base64 as _base64
import io as _io

# Check zxing-cpp availability at startup
_has_zxingcpp = False
try:
    import zxingcpp as _zxingcpp
    import numpy as _np
    _has_zxingcpp = True
    _qr_dbg_log.info(f"[STARTUP] zxing-cpp loaded OK (version={getattr(_zxingcpp, '__version__', '?')})")
except ImportError as e:
    _qr_dbg_log.warning(f"[STARTUP] zxing-cpp NOT available: {e} — Aztec server-side decoding disabled")
except Exception as e:
    _qr_dbg_log.warning(f"[STARTUP] zxing-cpp load error: {e}")

# Check OpenCV availability at startup
_has_cv2 = False
try:
    import cv2 as _cv2  # type: ignore
    _has_cv2 = True
    _qr_dbg_log.info(f"[STARTUP] OpenCV loaded OK (version={_cv2.__version__}) — advanced preprocessing enabled")
except ImportError:
    _qr_dbg_log.warning("[STARTUP] OpenCV NOT available — adaptive-threshold / bilateral / ROI preprocessing disabled")

_NEAR_MISSES: list = []  # populated per-decode by _zxing_try when return_errors=True

def _zxing_try(img_obj, label: str, track_errors: bool = False, **kwargs):
    """
    Try zxing-cpp.read_barcodes with given kwargs, return first *real* hit or None.

    zxing-cpp occasionally returns a bogus result with format=NONE and 0 bytes
    when is_pure=True is given a non-barcode image — we filter those out so
    they don't short-circuit the rest of the variant loop.

    If track_errors=True, results that have a non-empty .error attribute
    (zxing-cpp detected a barcode but couldn't error-correct it) get pushed
    to _NEAR_MISSES for diagnostic logging.
    """
    try:
        img_array = _np.array(img_obj)
        if track_errors:
            kwargs.setdefault("return_errors", True)
        results = _zxingcpp.read_barcodes(img_array, **kwargs)
        for code in (results or []):
            raw_bytes = bytes(code.bytes)
            code_type = str(code.format).replace("BarcodeFormat.", "")
            err = getattr(code, "error", None)
            if err:
                _NEAR_MISSES.append(f"{label}: {code_type} → {err}")
                continue
            # Reject empty / placeholder results.
            if not raw_bytes or code_type in ("NONE", "None", ""):
                continue
            _qr_dbg_log.info(
                f"[ZXING-CPP:{label}] Found {code_type}: "
                f"{len(raw_bytes)} bytes, first10={list(raw_bytes[:10])}"
            )
            return code, raw_bytes, code_type
    except Exception as e:
        _qr_dbg_log.warning(f"[ZXING-CPP:{label}] Error: {e}")
    return None


def _detect_barcode_roi(gray_arr):
    """
    Try to locate the barcode in a grayscale image via OpenCV morphology.
    Returns a tight (x, y, w, h) bounding box or None.

    Strategy: the barcode is a dense region of high local variance. Compute
    gradient magnitude, close horizontally and vertically, threshold, pick
    the largest square-ish contour.
    """
    if not _has_cv2:
        return None
    try:
        cv2 = _cv2
        h, w = gray_arr.shape[:2]

        # Gradient-based structure detection.
        gradX = cv2.Sobel(gray_arr, ddepth=cv2.CV_32F, dx=1, dy=0, ksize=-1)
        gradY = cv2.Sobel(gray_arr, ddepth=cv2.CV_32F, dx=0, dy=1, ksize=-1)
        grad = cv2.convertScaleAbs(cv2.addWeighted(cv2.absdiff(gradX, 0), 0.5,
                                                     cv2.absdiff(gradY, 0), 0.5, 0))
        blurred = cv2.blur(grad, (9, 9))
        _, thresh = cv2.threshold(blurred, 60, 255, cv2.THRESH_BINARY)

        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (21, 21))
        closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
        closed = cv2.erode(closed, None, iterations=3)
        closed = cv2.dilate(closed, None, iterations=3)

        contours, _hier = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return None

        # Prefer largest, roughly square contour.
        best = None
        best_score = 0
        for c in contours:
            x, y, cw, ch = cv2.boundingRect(c)
            if cw < 80 or ch < 80:
                continue
            area = cw * ch
            if area < (w * h) * 0.02:
                continue
            ratio = min(cw, ch) / max(cw, ch)
            if ratio < 0.5:
                continue
            score = area * ratio
            if score > best_score:
                best_score = score
                best = (x, y, cw, ch)

        if not best:
            return None

        x, y, cw, ch = best
        pad = int(max(cw, ch) * 0.08)
        x0 = max(0, x - pad)
        y0 = max(0, y - pad)
        x1 = min(w, x + cw + pad)
        y1 = min(h, y + ch + pad)
        return (x0, y0, x1 - x0, y1 - y0)
    except Exception as e:
        _qr_dbg_log.debug(f"[roi-detect] failed: {e}")
        return None


def _preprocess_variants(img):
    """
    Yield (label, PIL_image) variants that give the decoder a fighting chance
    on noisy, rotated, low-contrast phone shots of an Aztec code.

    Order matters — faster/more likely variants first, so we bail on the
    first hit. Order:
      1. Original + grayscale + simple centre crops (fast, cheap)
      2. PIL sharpen / autocontrast (cheap)
      3. OpenCV bilateral-filtered (kills screen moiré — critical)
      4. OpenCV adaptive threshold + Otsu
      5. ROI-detected crop (if OpenCV finds the barcode)
      6. Upscale / downscale fallbacks
    """
    from PIL import ImageOps, ImageEnhance, ImageFilter, Image as _PILImage

    yield "original", img
    gray = img.convert("L")
    yield "grayscale", gray

    w, h = img.size

    # Center crops — the scan-guide always centres the code.
    for frac, tag in [(0.80, "center80"), (0.65, "center65"), (0.50, "center50"), (0.35, "center35")]:
        cw, ch = int(w * frac), int(h * frac)
        x0, y0 = (w - cw) // 2, (h - ch) // 2
        try:
            crop = gray.crop((x0, y0, x0 + cw, y0 + ch))
            yield tag, crop
            yield f"{tag}+autocontrast", ImageOps.autocontrast(crop, cutoff=2)
        except Exception:
            pass

    try:
        yield "autocontrast", ImageOps.autocontrast(gray, cutoff=2)
    except Exception:
        pass

    try:
        yield "contrast+2x", ImageEnhance.Contrast(gray).enhance(2.0)
    except Exception:
        pass

    try:
        yield "sharpen", gray.filter(ImageFilter.SHARPEN)
    except Exception:
        pass

    try:
        yield "unsharp-mask", gray.filter(ImageFilter.UnsharpMask(radius=2, percent=200, threshold=3))
    except Exception:
        pass

    try:
        yield "inverted", ImageOps.invert(gray)
    except Exception:
        pass

    # Lanczos upscale variants — 29 near-misses on screen-recapture Aztec
    # suggested each Aztec module has too few pixels for accurate read.
    # Lanczos interpolation + morphological close recovers module integrity
    # better than bilinear.
    if _has_cv2:
        try:
            cv2 = _cv2
            arr_up = _np.array(gray)
            # 3x upscale with Lanczos.
            up3 = cv2.resize(arr_up, (w * 3, h * 3), interpolation=cv2.INTER_LANCZOS4)
            yield f"lanczos3x-{w*3}x{h*3}", _PILImage.fromarray(up3)

            # 3x upscale + Otsu threshold + morphological close to heal
            # broken-by-screen-moire modules.
            _, up3_otsu = cv2.threshold(up3, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
            closed = cv2.morphologyEx(up3_otsu, cv2.MORPH_CLOSE, kernel, iterations=1)
            yield "lanczos3x+otsu+close", _PILImage.fromarray(closed)

            # Same pipeline on the centre 70% crop (smaller, faster).
            cw, ch = int(w * 0.70), int(h * 0.70)
            x0, y0 = (w - cw) // 2, (h - ch) // 2
            cc = arr_up[y0:y0 + ch, x0:x0 + cw]
            cc3 = cv2.resize(cc, (cw * 3, ch * 3), interpolation=cv2.INTER_LANCZOS4)
            yield f"center70+lanczos3x", _PILImage.fromarray(cc3)
            cc3_bil = cv2.bilateralFilter(cc3, d=7, sigmaColor=50, sigmaSpace=50)
            _, cc3_otsu = cv2.threshold(cc3_bil, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            cc3_closed = cv2.morphologyEx(cc3_otsu, cv2.MORPH_CLOSE, kernel, iterations=1)
            yield "center70+lanczos3x+bilateral+otsu+close", _PILImage.fromarray(cc3_closed)
        except Exception as e:
            _qr_dbg_log.debug(f"[preprocess] lanczos/morph error: {e}")

    # OpenCV pipeline — the real workhorses for laptop-screen moiré.
    if _has_cv2:
        cv2 = _cv2
        arr_full = _np.array(gray)

        # Bilateral filter — preserves barcode edges while smoothing the
        # moiré pattern from a computer screen. This is the best single
        # trick against screen-recapture artifacts.
        try:
            bil = cv2.bilateralFilter(arr_full, d=9, sigmaColor=75, sigmaSpace=75)
            yield "bilateral", _PILImage.fromarray(bil)
            # Bilateral + Otsu — often where Aztec shows up.
            _, bil_otsu = cv2.threshold(bil, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            yield "bilateral+otsu", _PILImage.fromarray(bil_otsu)
        except Exception as e:
            _qr_dbg_log.debug(f"[preprocess] bilateral error: {e}")

        # Center crop adaptive + Otsu
        try:
            cw, ch = int(w * 0.70), int(h * 0.70)
            x0, y0 = (w - cw) // 2, (h - ch) // 2
            cc = arr_full[y0:y0 + ch, x0:x0 + cw]

            # Bilateral on the centre crop — best shot for most frames.
            bil_c = cv2.bilateralFilter(cc, d=9, sigmaColor=75, sigmaSpace=75)
            yield "center70+bilateral", _PILImage.fromarray(bil_c)
            _, bil_c_otsu = cv2.threshold(bil_c, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            yield "center70+bilateral+otsu", _PILImage.fromarray(bil_c_otsu)

            at = cv2.adaptiveThreshold(
                cc, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 7
            )
            yield "center70+adaptive", _PILImage.fromarray(at)

            at2 = cv2.adaptiveThreshold(
                arr_full, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 51, 9
            )
            yield "full+adaptiveMean", _PILImage.fromarray(at2)

            _, otsu = cv2.threshold(cc, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            yield "center70+otsu", _PILImage.fromarray(otsu)
        except Exception as e:
            _qr_dbg_log.debug(f"[preprocess] center-crop opencv error: {e}")

        # ROI detection — auto-find the barcode region and crop tight.
        roi = _detect_barcode_roi(arr_full)
        if roi:
            rx, ry, rw, rh = roi
            _qr_dbg_log.info(f"[preprocess] ROI detected at {rx},{ry} {rw}x{rh}")
            try:
                roi_crop = arr_full[ry:ry + rh, rx:rx + rw]
                yield f"roi-{rw}x{rh}", _PILImage.fromarray(roi_crop)
                # Upscale ROI 2x if small.
                if max(rw, rh) < 500:
                    up = cv2.resize(roi_crop, (rw * 2, rh * 2), interpolation=cv2.INTER_CUBIC)
                    yield f"roi-upscaled-{rw*2}x{rh*2}", _PILImage.fromarray(up)
                # ROI + bilateral + otsu
                roi_bil = cv2.bilateralFilter(roi_crop, d=9, sigmaColor=75, sigmaSpace=75)
                _, roi_otsu = cv2.threshold(roi_bil, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
                yield f"roi+bilateral+otsu", _PILImage.fromarray(roi_otsu)
            except Exception as e:
                _qr_dbg_log.debug(f"[preprocess] roi-crop error: {e}")

    # Upscale for small codes.
    if max(w, h) < 1400:
        try:
            yield f"upscaled-{w*2}x{h*2}", gray.resize((w * 2, h * 2))
        except Exception:
            pass

    # Downscale big images.
    if max(w, h) > 1400:
        scale = 1200 / max(w, h)
        new_size = (int(w * scale), int(h * scale))
        try:
            yield f"resized-{new_size[0]}x{new_size[1]}", img.resize(new_size)
        except Exception:
            pass


@app.post("/decode-barcode")
async def decode_barcode_server(file: UploadFile):
    """
    Decode a barcode/QR/Aztec from an uploaded image.
    Tries zxing-cpp first (supports Aztec), falls back to pyzbar.
    Returns raw bytes as base64 for the frontend decoder.
    """
    from PIL import Image

    content = await file.read()
    _qr_dbg_log.info(f"[DECODE] Received {file.filename} ({len(content)//1024} KB)")
    try:
        img = Image.open(_io.BytesIO(content))
        img = img.convert("RGB")
        _qr_dbg_log.info(f"[DECODE] Image opened: {img.size[0]}x{img.size[1]}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot open image: {e}")

    # Try zxing-cpp with a matrix of (image variant) × (binarizer) combinations.
    # The defaults often miss Aztec on phone shots — iterating through
    # binarizers + preprocessing dramatically improves hit rate.
    if _has_zxingcpp:
        try:
            aztec_formats = (
                _zxingcpp.BarcodeFormat.Aztec
                | _zxingcpp.BarcodeFormat.QRCode
                | _zxingcpp.BarcodeFormat.DataMatrix
                | _zxingcpp.BarcodeFormat.PDF417
            )
            binarizers = [
                ("LocalAverage", _zxingcpp.Binarizer.LocalAverage),
                ("GlobalHistogram", _zxingcpp.Binarizer.GlobalHistogram),
                ("FixedThreshold", _zxingcpp.Binarizer.FixedThreshold),
            ]

            _NEAR_MISSES.clear()
            variants_tried = 0
            for variant_label, variant in _preprocess_variants(img):
                for bin_label, binarizer in binarizers:
                    variants_tried += 1
                    label = f"{variant_label}/{bin_label}"
                    hit = _zxing_try(
                        variant,
                        label,
                        track_errors=True,
                        formats=aztec_formats,
                        try_rotate=True,
                        try_downscale=True,
                        binarizer=binarizer,
                        text_mode=_zxingcpp.TextMode.Plain,
                    )
                    if hit:
                        _code, raw_bytes, code_type = hit
                        raw_b64 = _base64.b64encode(raw_bytes).decode("ascii")
                        return {
                            "found": True,
                            "type": code_type,
                            "variant": label,
                            "raw_bytes_b64": raw_b64,
                            "raw_string": raw_bytes.decode("latin-1", errors="replace"),
                        }

                    # For ROI variants only, also try is_pure=True — it tells
                    # zxing-cpp to assume the image IS just the barcode.
                    # Don't apply to centre crops: the crop may contain non-code
                    # content, and is_pure=True will then return a bogus
                    # format=NONE result that short-circuits later variants.
                    if variant_label.startswith("roi"):
                        hit_pure = _zxing_try(
                            variant,
                            f"{label}+pure",
                            formats=aztec_formats,
                            try_rotate=True,
                            try_downscale=False,
                            binarizer=binarizer,
                            text_mode=_zxingcpp.TextMode.Plain,
                            is_pure=True,
                        )
                        if hit_pure:
                            _code, raw_bytes, code_type = hit_pure
                            raw_b64 = _base64.b64encode(raw_bytes).decode("ascii")
                            return {
                                "found": True,
                                "type": code_type,
                                "variant": f"{label}+pure",
                                "raw_bytes_b64": raw_b64,
                                "raw_string": raw_bytes.decode("latin-1", errors="replace"),
                            }
            if _NEAR_MISSES:
                # We detected an Aztec but error-correction failed — log the
                # first few so we can tell "image too degraded" from "no code".
                preview = _NEAR_MISSES[:5]
                _qr_dbg_log.info(
                    f"[ZXING-CPP] {len(_NEAR_MISSES)} near-misses (detected but error-correction failed): {preview}"
                )
            _qr_dbg_log.info(f"[ZXING-CPP] All {variants_tried} variants failed for {file.filename}")
        except Exception as e:
            _qr_dbg_log.warning(f"[ZXING-CPP] Outer error: {e}")
    else:
        _qr_dbg_log.info("[DECODE] Skipping zxing-cpp (not available)")

    # Fall back to pyzbar (QR, EAN, Code128 — no Aztec)
    try:
        from pyzbar.pyzbar import decode as pyzbar_decode
        codes = pyzbar_decode(img)
        if codes:
            code = codes[0]
            raw_bytes = code.data
            raw_b64 = _base64.b64encode(raw_bytes).decode("ascii")
            _qr_dbg_log.info(
                f"[PYZBAR] Found {code.type}: "
                f"{len(raw_bytes)} bytes, first10={list(raw_bytes[:10])}"
            )
            return {
                "found": True,
                "type": code.type,
                "raw_bytes_b64": raw_b64,
                "raw_string": raw_bytes.decode("latin-1", errors="replace"),
            }
        else:
            _qr_dbg_log.info(f"[PYZBAR] No barcode found in {file.filename}")
    except Exception as e:
        _qr_dbg_log.warning(f"[PYZBAR] Error: {e}")

    _qr_dbg_log.info(f"[DECODE] ALL decoders failed for {file.filename}")
    return {"found": False}


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
