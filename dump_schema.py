
import asyncio
import os
import sys
import json
from pathlib import Path

# Add backend to path
sys.path.append(os.path.abspath("backend"))

from services.bitrix_discovery import discovery
from services.bitrix_gateway import BitrixGateway

async def main():
    gateway = BitrixGateway()
    try:
        await discovery.initialize(gateway.call)
        
        # Get raw schema
        schema = discovery._field_schema
        
        # Simplify schema for easy reading
        clean_schema = {}
        for fid, info in schema.items():
            clean_schema[fid] = {
                "label": discovery._get_field_label(info),
                "type": info.get("type"),
                "isMultiple": info.get("isMultiple", False),
                "items": info.get("items", [])
            }
            
        with open("bitrix_schema_dump.json", "w", encoding="utf-8") as f:
            json.dump(clean_schema, f, indent=2, ensure_ascii=False)
            
        print(f"Dumped {len(clean_schema)} fields to bitrix_schema_dump.json")
        
    finally:
        await gateway.close()

if __name__ == "__main__":
    asyncio.run(main())
