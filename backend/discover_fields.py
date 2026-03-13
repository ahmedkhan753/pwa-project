import os
import sys
import json
import asyncio
import httpx
from dotenv import load_dotenv

# Load .env
load_dotenv()

BITRIX_WEBHOOK_URL = os.getenv("BITRIX_WEBHOOK_URL")

if not BITRIX_WEBHOOK_URL or "replace_this_later" in BITRIX_WEBHOOK_URL:
    print("Error: Please set a valid BITRIX_WEBHOOK_URL in your .env file.")
    sys.exit(1)

# Keywords to match Polish/English field names and labels
# Mapping from PWA state key to a list of possible keywords
KEYWORD_MAPPING = {
    "vin": ["VIN", "Numer nadwozia"],
    "registrationPlates": ["Rejestracja", "Numer rejestracyjny", "Plates"],
    "make": ["Marka", "Make"],
    "model": ["Model"],
    "year": ["Rok produkcji", "Year", "Rok"],
    "color": ["Kolor", "Color", "Lakier"],
    "mileage": ["Przebieg", "Mileage"],
    "engineCapacity": ["Pojemność", "Engine capacity"],
    "enginePower": ["Moc", "Power"],
    "fuelType": ["Paliwo", "Rodzaj paliwa", "Fuel"],
    "equipmentCompleteness": ["Kompletność", "Equipment completeness", "Dokumenty"],
    "fullEquipment": ["Wyposażenie", "Full equipment"],
    "paintMeasurement": ["Pomiary lakieru", "Grubość lakieru", "Paint"],
    "tires": ["Opony", "Ogumienie", "Tires", "Koła"],
    "exteriorDamage": ["Uszkodzenia zewn", "Exterior damage"],
    "interiorDamage": ["Uszkodzenia wewn", "Interior damage"],
    "mechanical": ["Mechanika", "Stan techniczny", "Mechanical"],
    "notesValuation": ["Uwagi", "Wycena", "Notes", "Valuation", "Szacowana wartość"],
    "signatures": ["Podpis", "Signatures"],
    # Component keys (matching backend Deal mapping)
    "companyName": ["Firma", "Company"],
    "userOwner": ["Właściciel", "Użytkownik", "Owner"],
    "inspectionPlace": ["Miejsce oględzin", "Place"],
    "inspectionDate": ["Data oględzin", "Inspection date"],
    "inspectorName": ["Rzeczoznawca", "Inspector"],
}

async def fetch_fields():
    url = f"{BITRIX_WEBHOOK_URL.rstrip('/')}/crm.deal.fields"
    async with httpx.AsyncClient(timeout=30.0) as client:
        print(f"Fetching fields from {url} ...")
        res = await client.post(url)
        res.raise_for_status()
        data = res.json()
        return data.get("result", {})

async def main():
    try:
        fields = await fetch_fields()
    except Exception as e:
        print(f"Failed to fetch fields: {e}")
        sys.exit(1)
        
    print(f"Discovered {len(fields)} fields in crm.deal.fields.")
    
    manifest = {}
    unmapped = []

    for pwa_key, keywords in KEYWORD_MAPPING.items():
        matched_id = None
        for field_id, field_info in fields.items():
            name = (field_info.get("formLabel") or field_info.get("title") or field_info.get("listLabel") or "").upper()
            if not name:
                continue
            
            # Check if any keyword matches
            if any(kw.upper() in name for kw in keywords):
                matched_id = field_id
                break
                
        if matched_id:
            manifest[pwa_key] = matched_id
        else:
            manifest[pwa_key] = "UNMAPPED"
            unmapped.append(pwa_key)
            
    # Save Manifest
    with open("mapping_manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        
    print("\n--- MAPPING MANIFEST ---")
    for k, v in manifest.items():
        print(f"{k}: {v}")
        
    print(f"\nSaved manifest to mapping_manifest.json (Mapped: {len(manifest) - len(unmapped)}, Unmapped: {len(unmapped)})")

if __name__ == "__main__":
    asyncio.run(main())
