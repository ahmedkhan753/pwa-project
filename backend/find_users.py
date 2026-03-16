import asyncio
import os
from services.bitrix_gateway import BitrixGateway
from services.bitrix_discovery import discovery
from dotenv import load_dotenv

async def check_users():
    load_dotenv()
    webhook_url = os.getenv("BITRIX_WEBHOOK_URL")
    gateway = BitrixGateway(discovery=discovery)
    try:
        # Get current user or list first 1
        result = await gateway.call("user.get", {"ACTIVE": "Y"})
        if result:
            for user in result[:3]:
                print(f"ID: {user.get('ID')} - Name: {user.get('NAME')} - Email: {user.get('EMAIL')}")
        else:
            print("No active users found.")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await gateway.close()

if __name__ == "__main__":
    asyncio.run(check_users())
