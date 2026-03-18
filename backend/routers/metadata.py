from fastapi import APIRouter, Depends
from typing import Dict, Any, List
from services.bitrix_discovery import discovery

router = APIRouter(prefix="/api/metadata", tags=["metadata"])

@router.get("/options")
async def get_field_options():
    """
    Returns available options for all enumeration fields mapped in the PWA.
    Used for dynamic dropdowns in Step 1.
    """
    options = {}
    
    # Target fields for dropdowns in Step 1
    target_keys = [
        "vehicle_brand",
        "vehicle_model",
        "fuel_type",
        "body_type",
        "gearbox_type",
        "drive_type"
    ]
    
    # Hardcoded brands for fallback
    hardcoded_brands = [
        "Abarth", "Alfa Romeo", "Audi", "BMW", "Chevrolet",
        "Citroën", "Dacia", "Fiat", "Ford", "Honda",
        "Hyundai", "Kia", "Lexus", "Mazda", "Mercedes-Benz",
        "Mitsubishi", "Nissan", "Opel", "Peugeot", "Renault",
        "SEAT", "Škoda", "Subaru", "Suzuki", "Tesla",
        "Toyota", "Volkswagen", "Volvo"
    ]
    
    for key in target_keys:
        field_id = discovery.get_field_id(key)
        if field_id:
            schema = discovery.get_field_schema(field_id)
            items = schema.get("items", [])
            if items:
                # Format for the frontend: { label, value }
                options[key] = [
                    {"label": item.get("VALUE"), "value": item.get("VALUE")} 
                    for item in items
                ]
            else:
                options[key] = []
        else:
            options[key] = []

    # Apply fallback for brands if empty
    if not options.get("vehicle_brand"):
        options["vehicle_brand"] = [{"label": b, "value": b} for b in hardcoded_brands]
            
    return options
