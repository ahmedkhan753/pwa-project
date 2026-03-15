import pytest
from fastapi.testclient import TestClient
from main import app
from services.bitrix_discovery import discovery
from services.bitrix_gateway import BitrixGateway
import json

client = TestClient(app)

@pytest.mark.asyncio
async def test_health_check_integration():
    """Test that the health endpoint reports Bitrix status correctly."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "bitrix_ready" in data
    assert "discovery_stats" in data

@pytest.mark.asyncio
async def test_field_mapping_endpoint():
    """Test that the field mapping debug endpoint returns our register."""
    response = client.get("/health/fields")
    assert response.status_code == 200
    data = response.json()
    assert "registry" in data
    assert len(data["registry"]) > 0
    # Check for a known PWA key
    assert "vin" in data["registry"]

@pytest.mark.asyncio
async def test_pydantic_validation_failure():
    """Test that submitting malformed data returns a 422 error."""
    response = client.post("/inspection/submit", json={"bad_field": "error"})
    assert response.status_code == 422

def test_discovery_registry_consistency():
    """Verify that every key in KEYWORD_MAPPING has been attempted to be mapped."""
    from services.bitrix_discovery import KEYWORD_MAPPING
    all_keys = list(KEYWORD_MAPPING.keys())
    for key in all_keys:
        # This just checks that the key is recognized by discovery
        # It doesn't mean it's successfully mapped to a Bitrix ID (which depends on live API)
        assert key in discovery.get_all_pwa_keys()

if __name__ == "__main__":
    # If run directly, just execute some checks
    print("Testing Bitrix Integration Gateway...")
    print(f"Mapped fields: {discovery.get_mapped_count()}")
    print(f"Bitrix Ready: {discovery.is_initialized}")
