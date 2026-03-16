"""
Field Transformer
=================
Bidirectional translation layer between PWA inspection data
and Bitrix24 CRM Deal fields.

- transform_to_bitrix(): PWA keys → UF_CRM_* IDs, enum/boolean/date conversion
- transform_from_bitrix(): UF_CRM_* IDs → PWA keys, reverse conversions
"""

import logging
from datetime import datetime, date
from typing import Dict, Any, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from services.bitrix_discovery import BitrixFieldDiscovery

logger = logging.getLogger("field_transformer")

# PWA keys whose values are JSON blobs (not individual Bitrix fields)
JSON_BLOB_KEYS = {
    "paint_data_json",
    "mechanical_json",
    "tires_data_json",
    "interior_damage_json",
    "exterior_damage_json",
    "full_equipment_json",
    "notes_valuation_json",
}

# PWA keys that represent file/photo fields (handled separately)
FILE_FIELD_KEYS = {
    "photo_front",
    "photo_rear",
    "photo_left",
    "photo_right",
    "photo_interior",
    "photo_dashboard",
    "photo_odometer",
    "photo_vin_plate",
    "signature_appraiser",
    "signature_client",
    "signature_yard",
}


class FieldTransformer:
    """Translates between PWA field keys and Bitrix24 field format."""

    def __init__(self, discovery: "BitrixFieldDiscovery"):
        self.discovery = discovery

    # ------------------------------------------------------------------
    # PWA → Bitrix
    # ------------------------------------------------------------------

    def transform_to_bitrix(self, payload: dict) -> Dict[str, Any]:
        """
        Transform a PWA inspection payload into Bitrix24 deal fields.
        """
        if not self.discovery:
            logger.error("Discovery engine not available — cannot transform")
            return {}

        # 1. Recursive Flattening
        # { tires: { frontLeft: { brand: "X" } } } -> { "tires.frontLeft.brand": "X" }
        flat_payload = self._flatten_payload(payload)
        
        bitrix_fields: Dict[str, Any] = {}
        warnings = []

        for pwa_key, value in flat_payload.items():
            # Skip None values
            if value is None:
                continue

            # Skip file fields (handled by upload service)
            if pwa_key in FILE_FIELD_KEYS:
                continue

            # Resolve to Bitrix field ID
            field_id = self.discovery.get_field_id(pwa_key)
            if not field_id:
                # Also try camelCase vs snake_case if one fails?
                # For now just log warnings
                warnings.append(pwa_key)
                continue

            # Convert the value based on field type
            converted = self._convert_value_to_bitrix(field_id, value, pwa_key)
            if converted is not None:
                bitrix_fields[field_id] = converted

        if warnings:
            logger.info(
                f"Skipped {len(warnings)} unmapped fields during transform: "
                f"{warnings[:10]}{'...' if len(warnings) > 10 else ''}"
            )

        return bitrix_fields

    def _flatten_payload(self, d: dict, parent_key: str = '', sep: str = '.') -> dict:
        """Helper to flatten nested dictionaries."""
        items = []
        for k, v in d.items():
            new_key = f"{parent_key}{sep}{k}" if parent_key else k
            if isinstance(v, dict) and k not in JSON_BLOB_KEYS:
                items.extend(self._flatten_payload(v, new_key, sep=sep).items())
            else:
                items.append((new_key, v))
        return dict(items)

    def _convert_value_to_bitrix(
        self, field_id: str, value: Any, pwa_key: str
    ) -> Any:
        """Convert a single value to Bitrix format based on field type."""

        # Boolean → "1" / "0"
        if isinstance(value, bool):
            return "1" if value else "0"

        # Date/datetime objects
        if isinstance(value, datetime):
            return value.strftime("%Y-%m-%dT%H:%M:%S")
        if isinstance(value, date):
            return value.strftime("%Y-%m-%d")

        # String date detection (YYYY-MM-DD or DD.MM.YYYY)
        if isinstance(value, str) and len(value) == 10:
            if self._looks_like_date(value):
                return self._normalize_date(value)

        # Enum fields — resolve string value to numeric ID
        if self.discovery.is_enum_field(field_id):
            if isinstance(value, str):
                return self.discovery.get_enum_value_id(field_id, value)
            return value

        # Dict/list values → keep as-is (Bitrix handles JSON for some fields)
        if isinstance(value, (dict, list)):
            import json
            return json.dumps(value, ensure_ascii=False)

        # Numeric values
        if isinstance(value, (int, float)):
            return str(value)

        # String passthrough
        return value

    @staticmethod
    def _looks_like_date(value: str) -> bool:
        """Check if a string looks like a date."""
        # YYYY-MM-DD
        if len(value) == 10 and value[4] == "-" and value[7] == "-":
            return True
        # DD.MM.YYYY
        if len(value) == 10 and value[2] == "." and value[5] == ".":
            return True
        return False

    @staticmethod
    def _normalize_date(value: str) -> str:
        """Normalize date strings to YYYY-MM-DD format."""
        # DD.MM.YYYY → YYYY-MM-DD
        if len(value) == 10 and value[2] == "." and value[5] == ".":
            try:
                dt = datetime.strptime(value, "%d.%m.%Y")
                return dt.strftime("%Y-%m-%d")
            except ValueError:
                pass
        return value

    # ------------------------------------------------------------------
    # Bitrix → PWA
    # ------------------------------------------------------------------

    def transform_from_bitrix(self, deal_fields: dict) -> Dict[str, Any]:
        """
        Transform Bitrix24 deal fields back to PWA field names.

        - Converts UF_CRM_* keys to PWA keys
        - Converts enum IDs back to string values
        - Converts "1"/"0" back to booleans
        - Returns dict matching InspectionPayload shape
        """
        if not self.discovery:
            logger.error("Discovery engine not available — returning raw fields")
            return deal_fields

        reverse_map = self.discovery.get_reverse_mapping()
        pwa_data: Dict[str, Any] = {}

        for field_id, value in deal_fields.items():
            if value is None:
                continue

            pwa_key = reverse_map.get(field_id)

            # Include system fields too
            if pwa_key is None:
                # Keep common system fields
                if field_id in ("ID", "TITLE", "STAGE_ID", "CATEGORY_ID",
                                "DATE_CREATE", "DATE_MODIFY", "BEGINDATE",
                                "CLOSEDATE", "ASSIGNED_BY_ID"):
                    pwa_data[field_id.lower()] = value
                continue

            # Convert value back from Bitrix format
            converted = self._convert_value_from_bitrix(field_id, value)
            pwa_data[pwa_key] = converted

        return pwa_data

    def _convert_value_from_bitrix(self, field_id: str, value: Any) -> Any:
        """Convert a single Bitrix value back to PWA format."""

        # Boolean fields: "1"/"0" → True/False
        field_info = self.discovery.get_field_schema(field_id)
        field_type = field_info.get("type", "")

        if field_type == "char" and value in ("Y", "N"):
            return value == "Y"
        if value in ("1", "0") and field_type in ("char", "boolean"):
            return value == "1"

        # Enum fields: numeric ID → string value
        if self.discovery.is_enum_field(field_id):
            return self._resolve_enum_label(field_id, value)

        # JSON strings → parsed objects
        if isinstance(value, str) and value.startswith(("{", "[")):
            try:
                import json
                return json.loads(value)
            except (json.JSONDecodeError, ValueError):
                pass

        return value

    def _resolve_enum_label(self, field_id: str, value: Any) -> Any:
        """Convert an enum numeric ID back to its string label."""
        field_info = self.discovery.get_field_schema(field_id)
        items = field_info.get("items", [])

        if isinstance(value, list):
            # Multiple enum values
            return [self._resolve_single_enum(items, v) for v in value]

        return self._resolve_single_enum(items, value)

    @staticmethod
    def _resolve_single_enum(items: list, value: Any) -> Any:
        """Resolve a single enum ID to its label."""
        value_str = str(value)
        for item in items:
            if str(item.get("ID", "")) == value_str:
                return item.get("VALUE", value)
        return value
