import asyncio
import json
from services.bitrix_discovery import discovery
from services.field_transformer import FieldTransformer
from models.inspection import InspectionPayload, VehicleIdentity

async def test_full_gateway_simulation():
    print("🚀 Starting Full Gateway Simulation...")
    
    # 0. Load Environment and Initialize Gateway
    from dotenv import load_dotenv
    from services.bitrix_gateway import BitrixGateway
    load_dotenv()
    
    gateway = BitrixGateway()
    
    # 1. Initialize Discovery (fetches fields from live API)
    print("--- Initializing Discovery Engine ---")
    await discovery.initialize(gateway.call)
    if not discovery.is_initialized:
        print("❌ Discovery initialization failed!")
        return

    # 2. Mock PWA Store Data (Match our StepData structure)
    print("--- Mocking Store Data ---")
    mock_store_data = {
        "vehicle": {
            "vin": "WVGZZZ5NZLW123456",
            "registration_number": "WA 123456",
            "vehicle_brand": "Volkswagen",
            "vehicle_model": "Tiguan",
            "fuel_type": "BENZYNA"
        },
        "client": {
            "company_name": "Antigravity Corp",
            "client_name": "Test User"
        },
        "paint": {
            "paint_roof": 120.5,
            "paint_hood": 115.0
        },
        "summary": {
            "general_comments": "Test inspection simulation",
            "vin_confirmed": True
        }
    }
    
    # 3. Validate with Pydantic Model
    print("--- Validating with Pydantic Model ---")
    try:
        payload = InspectionPayload(**mock_store_data)
        flat_data = payload.flatten()
        print(f"✅ Pydantic validation passed. Flattened fields: {list(flat_data.keys())}")
    except Exception as e:
        print(f"❌ Pydantic validation failed: {e}")
        return

    # 4. Transform to Bitrix Fields
    print("--- Transforming to Bitrix Fields ---")
    transformer = FieldTransformer(discovery)
    bitrix_fields = transformer.transform_to_bitrix(flat_data)
    
    print("✅ Transformation results:")
    for b_id, b_val in bitrix_fields.items():
        # Get labels for easier reading
        pwa_key = discovery.get_reverse_mapping().get(b_id, "unknown")
        print(f"  {b_id} ({pwa_key}): {b_val}")

    print("\n--- Summary ---")
    print(f"Total Bitrix fields mapped: {len(bitrix_fields)}")
    
    if len(bitrix_fields) > 0:
        print("✅ SUCCESS: Simulation completed successfully.")
    else:
        print("❌ FAILURE: No fields were mapped.")

if __name__ == "__main__":
    asyncio.run(test_full_gateway_simulation())
