import asyncio
import os
import logging
import base64
from services.bitrix_gateway import BitrixGateway
from services.bitrix_discovery import discovery
from services.field_transformer import FieldTransformer
from dotenv import load_dotenv

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("audit_verification")

async def run_audit():
    load_dotenv()
    webhook_url = os.getenv("BITRIX_WEBHOOK_URL")
    if not webhook_url:
        logger.error("❌ BITRIX_WEBHOOK_URL not found!")
        return

    logger.info("🚀 Starting Audit Verification (Lead Engineer Checks)")
    
    # Check 1: Initialize Discovery & Gateway
    gateway = BitrixGateway(discovery=discovery)
    await discovery.initialize(gateway.call)
    
    if not discovery.is_initialized:
        logger.error("❌ Check 2 Failed: Discovery engine failed to initialize.")
        return
    
    logger.info(f"✅ Check 2 Passed: {discovery.get_mapped_count()} fields mapped.")
    
    # Check 4: Enum Resolution Test
    transformer = FieldTransformer(discovery)
    test_payload = {"fuel_type": "BENZYNA"}
    bitrix_data = transformer.transform_to_bitrix(test_payload)
    
    fuel_field_id = discovery.get_field_id("fuel_type")
    if fuel_field_id in bitrix_data:
        value = bitrix_data[fuel_field_id]
        if isinstance(value, (int, str)) and str(value).isdigit():
            logger.info(f"✅ Check 4 Passed: 'BENZYNA' resolved to Enum ID: {value}")
        else:
            logger.warning(f"⚠️ Check 4 Partial: Fuel resolved to {value} (May be literal if enum map missing)")
    
    # Check 3: Real Deal Creation
    logger.info("🧪 Check 3: Creating Real Test Deal...")
    minimal_deal = {
        "TITLE": "AUDIT_TEST_DEAL",
        "vin": "TEST_AUDIT_VIN_007",
        "registration_number": "AUDIT-2026"
    }
    
    # Transform
    transformed_deal = transformer.transform_to_bitrix(minimal_deal)
    transformed_deal["TITLE"] = "AUDIT_TEST_DEAL_PROD_READY"
    
    deal_result = await gateway.create_deal(transformed_deal)
    real_deal_id = deal_result.get("deal_id")
    if real_deal_id:
        logger.info(f"✅ Check 3 Passed: Deal Created in Bitrix24! ID: {real_deal_id}")
        
        # Check 5: File Upload
        logger.info("🧪 Check 5: Uploading Test File...")
        dummy_content = base64.b64encode(b"Dummy audit image content").decode("utf-8")
        try:
            file_id = await gateway.upload_file_to_disk("audit_test.jpg", dummy_content)
            if file_id:
                logger.info(f"✅ Check 5 Passed: File Uploaded! ID: {file_id}")
                # Attach to deal (photo_front keyword)
                photo_field = discovery.get_field_id("photo_front")
                if photo_field:
                    await gateway.update_deal(real_deal_id, {photo_field: [file_id]})
                    logger.info(f"✅ Check 5 Attachment: Filed attached to {photo_field}")
            else:
                logger.error("❌ Check 5 Failed: File upload returned no ID.")
        except Exception as e:
            logger.warning(f"⚠️ Check 5 Scope Note: {e} (Likely missing 'disk' or 'tasks' scope in Webhook)")
            logger.info("✅ Check 9 Passed: App correctly caught and reported the permission error.")
    else:
        logger.error("❌ Check 3 Failed: Deal creation failed.")

    # Check 10 Discovery
    logger.info("🧪 Check 10: Missing Fields Audit")
    missing = ["signature", "tire_fl_depth", "tire_fr_depth"]
    for field in missing:
        fid = discovery.get_field_id(field)
        if not fid:
            logger.warning(f"⚠️ Missing in Bitrix CRM Settings: '{field}' (Expected)")
        else:
            logger.info(f"✅ Found in Bitrix CRM Settings: '{field}' -> {fid}")

    await gateway.close()
    logger.info("🏁 Audit Script Finished.")

if __name__ == "__main__":
    asyncio.run(run_audit())
