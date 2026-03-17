
import asyncio
import os
import sys
from pathlib import Path

# Add backend to path
sys.path.append(os.path.abspath("backend"))

from services.bitrix_discovery import discovery
from services.bitrix_gateway import BitrixGateway

async def main():
    # Load .env manually to ensure it's loaded before creating gateway
    from dotenv import load_dotenv
    load_dotenv(Path("backend/.env"))
    
    gateway = BitrixGateway()
    try:
        await discovery.initialize(gateway.call)
        
        # Get all keys from the KEYWORD_MAPPING
        from services.bitrix_discovery import KEYWORD_MAPPING
        all_keys = list(KEYWORD_MAPPING.keys())
        
        # Get mapped keys
        registry = discovery.get_full_registry()
        mapped_keys = list(registry.keys())
        
        unmapped = [k for k in all_keys if k not in mapped_keys]
        
        print("---UNMAPPED_START---")
        for k in unmapped:
            print(k)
        print("---UNMAPPED_END---")
        
        print(f"Total mapped: {len(mapped_keys)}")
        print(f"Total unmapped: {len(unmapped)}")
        
    finally:
        await gateway.close()

if __name__ == "__main__":
    asyncio.run(main())
