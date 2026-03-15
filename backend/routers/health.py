"""
Health Router
=============
Gateway status, field registry size, last sync time,
and full PWA → Bitrix field mapping for debugging.
"""

from fastapi import APIRouter, Request
from models.inspection import HealthStatus, FieldMappingResponse

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("", response_model=HealthStatus)
async def health_check(request: Request):
    """
    GET /health
    Returns gateway status, field registry size, last sync time.
    """
    disc = request.app.state.discovery
    bitrix_ready = getattr(request.app.state, "bitrix_ready", False)

    return HealthStatus(
        status="ok",
        bitrix_ready=bitrix_ready,
        field_count=disc.get_total_bitrix_fields() if disc.is_initialized else 0,
        mapped_count=disc.get_mapped_count() if disc.is_initialized else 0,
        last_sync=disc.last_sync_time if disc.is_initialized else None,
        cache_stale=disc.is_cache_stale() if disc.is_initialized else True,
    )


@router.get("/fields", response_model=FieldMappingResponse)
async def health_fields(request: Request):
    """
    GET /health/fields
    Returns full PWA → Bitrix field mapping for debugging.
    """
    disc = request.app.state.discovery
    if not disc.is_initialized:
        return FieldMappingResponse(
            mapping={},
            total_bitrix_fields=0,
            mapped_count=0,
            unmapped_keys=[],
        )

    registry = disc.get_full_registry()
    return FieldMappingResponse(
        mapping=registry,
        total_bitrix_fields=disc.get_total_bitrix_fields(),
        mapped_count=disc.get_mapped_count(),
        unmapped_keys=[
            k for k in disc.get_all_pwa_keys() if k not in registry
        ],
    )
