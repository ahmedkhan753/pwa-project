import sys
import os

# Add the current directory to sys.path to allow importing services and models
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from models.inspection import InspectionPayload, VehicleIdentity, FuelType
from services.bitrix_discovery import KEYWORD_MAPPING

def test_model_flattening():
    print("Testing Model Flattening...")
    
    payload = InspectionPayload(
        vehicle=VehicleIdentity(
            vin="WVGZZZ5NZLW123456",
            vehicle_brand="Volkswagen",
            fuel_type=FuelType.BENZYNA
        ),
        job_id="test_job_123"
    )
    
    flat_data = payload.flatten()
    print(f"Flat Data: {flat_data}")
    
    # Check if keys match KEYWORD_MAPPING
    missing_keys = []
    for key in flat_data:
        if key != "job_id" and key not in KEYWORD_MAPPING:
            missing_keys.append(key)
            
    if missing_keys:
        print(f"Warning: The following keys in the Pydantic models are NOT in KEYWORD_MAPPING: {missing_keys}")
    else:
        print("Success: All Pydantic model keys matched with Discovery Engine keys.")

    # Check for keys in KEYWORD_MAPPING that are NOT in models (optional but good to know)
    # This might happen if models are partial or discovery is more broad
    pass

if __name__ == "__main__":
    test_model_flattening()
