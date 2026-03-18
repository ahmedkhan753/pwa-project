import asyncio
import logging
import sys

from services.bitrix_gateway import BitrixGateway

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

async def test_schedule():
    gateway = BitrixGateway()
    result = await gateway.schedule_inspection(234, "2026-06-01T10:00:00")
    print(f"Bypass Schedule Result: {result}")

if __name__ == "__main__":
    asyncio.run(test_schedule())
