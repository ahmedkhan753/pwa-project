"""
Bitrix24 Gateway Service
========================
Single point of contact with Bitrix24. All API calls go through this class.
Handles retries, typed exceptions, rate limiting, and dynamic field translation.
"""

import os
import asyncio
import time
import logging
from typing import Dict, Optional, Any, List

import httpx
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("bitrix_gateway")


# ---------------------------------------------------------------------------
# Typed Exceptions
# ---------------------------------------------------------------------------

class BitrixError(Exception):
    """Base exception for Bitrix24 API errors."""
    def __init__(self, message: str, error_code: str = "", details: Any = None):
        super().__init__(message)
        self.error_code = error_code
        self.details = details


class BitrixAuthError(BitrixError):
    """Raised on invalid_token or expired_token errors."""
    pass


class BitrixScopeError(BitrixError):
    """Raised on insufficient_scope errors."""
    pass


class BitrixNotFoundError(BitrixError):
    """Raised when a resource is NOT_FOUND."""
    pass


class BitrixQuotaError(BitrixError):
    """Raised when API quota is exceeded."""
    pass


class BitrixNetworkError(BitrixError):
    """Raised on network connectivity failures."""
    pass


# ---------------------------------------------------------------------------
# Gateway Class
# ---------------------------------------------------------------------------

class BitrixGateway:
    """
    Production-ready Bitrix24 API gateway with:
    - Dynamic field discovery via injected BitrixFieldDiscovery
    - Retry with exponential backoff on 5xx errors
    - Typed exceptions for all error codes
    - Request logging with timing
    """

    def __init__(self, discovery=None):
        """
        Args:
            discovery: BitrixFieldDiscovery instance (injected)
        """
        self.webhook_url = os.getenv("BITRIX_WEBHOOK_URL", "").rstrip("/")
        if not self.webhook_url:
            raise ValueError("BITRIX_WEBHOOK_URL not set in environment")

        self.discovery = discovery
        self._client: Optional[httpx.AsyncClient] = None

        # Retry config
        self._max_retries = 3
        self._backoff_base = 1  # seconds

    async def _get_client(self) -> httpx.AsyncClient:
        """Lazy-init the httpx async client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(30.0, connect=10.0),
                limits=httpx.Limits(
                    max_connections=20,
                    max_keepalive_connections=10,
                ),
            )
        return self._client

    async def close(self):
        """Close the HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    # ------------------------------------------------------------------
    # Core API caller with retries
    # ------------------------------------------------------------------

    async def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """Look up a Bitrix24 user by email."""
        result = await self.call("user.search", {"EMAIL": email})
        if result and len(result) > 0:
            return result[0]
        return None

    async def upload_file_to_disk(self, filename: str, content_b64: str) -> Optional[str]:
        """
        Uploads a file to Bitrix24 disk.
        Returns the file ID if successful.
        """
        # Strip data URI prefix if present
        if "," in content_b64:
            content_b64 = content_b64.split(",", 1)[1]
        
        # We'll use the disk.storage.uploadfile method
        # This requires the storage ID (default 1 for common storage)
        storage_id = os.getenv("BITRIX_STORAGE_ID", "1")
        
        params = {
            "id": storage_id,
            "data": {"NAME": filename},
            "fileContent": [filename, content_b64]
        }
        
        result = await self.call("disk.storage.uploadfile", params)
        if result and "ID" in result:
            return str(result["ID"])
        return None

    async def call(self, method: str, params: Optional[Dict[str, Any]] = None) -> Any:
        """
        Make a POST request to {webhook_url}/{method}.
        Handles retries on 5xx, raises typed exceptions on 4xx.
        Returns the 'result' portion of the Bitrix response.
        """
        url = f"{self.webhook_url}/{method}"
        params = params or {}
        client = await self._get_client()

        last_error = None
        for attempt in range(1, self._max_retries + 1):
            start_time = time.time()
            try:
                response = await client.post(url, json=params)
                elapsed = time.time() - start_time
                logger.info(
                    f"Bitrix24 {method} — {response.status_code} — "
                    f"{elapsed:.2f}s (attempt {attempt})"
                )

                # Parse response
                data = response.json()

                # Bitrix24 returns errors inside the JSON body
                if "error" in data:
                    error_code = data.get("error", "")
                    error_desc = data.get("error_description", str(data))
                    self._raise_typed_error(error_code, error_desc, data)

                # HTTP-level errors
                if response.status_code >= 500:
                    raise BitrixNetworkError(
                        f"Server error {response.status_code}",
                        error_code=str(response.status_code),
                    )
                if response.status_code >= 400:
                    response.raise_for_status()

                return data.get("result")

            except (BitrixAuthError, BitrixScopeError, BitrixNotFoundError):
                # Do NOT retry on auth/scope/notfound errors
                raise

            except BitrixQuotaError:
                # Retry on quota errors with longer backoff
                wait = self._backoff_base * (2 ** attempt)
                logger.warning(
                    f"Quota exceeded on {method}, waiting {wait}s "
                    f"(attempt {attempt}/{self._max_retries})"
                )
                last_error = BitrixQuotaError(f"Quota exceeded for {method}")
                await asyncio.sleep(wait)

            except (httpx.HTTPStatusError, BitrixNetworkError) as e:
                wait = self._backoff_base * (2 ** (attempt - 1))
                logger.warning(
                    f"Retryable error on {method}: {e} — "
                    f"waiting {wait}s (attempt {attempt}/{self._max_retries})"
                )
                last_error = e
                if attempt < self._max_retries:
                    await asyncio.sleep(wait)

            except httpx.RequestError as e:
                wait = self._backoff_base * (2 ** (attempt - 1))
                logger.warning(
                    f"Network error on {method}: {e} — "
                    f"waiting {wait}s (attempt {attempt}/{self._max_retries})"
                )
                last_error = BitrixNetworkError(str(e))
                if attempt < self._max_retries:
                    await asyncio.sleep(wait)

        # All retries exhausted
        raise BitrixNetworkError(
            f"Failed after {self._max_retries} retries: {last_error}",
            error_code="MAX_RETRIES",
        )

    @staticmethod
    def _raise_typed_error(error_code: str, error_desc: str, data: dict):
        """Map Bitrix error codes to typed exceptions."""
        code_upper = str(error_code).upper()

        if code_upper in ("INVALID_TOKEN", "EXPIRED_TOKEN", "invalid_token"):
            raise BitrixAuthError(error_desc, error_code=error_code, details=data)

        if code_upper in ("INSUFFICIENT_SCOPE", "insufficient_scope"):
            raise BitrixScopeError(error_desc, error_code=error_code, details=data)

        if code_upper in ("NOT_FOUND", "ERROR_NOT_FOUND"):
            raise BitrixNotFoundError(error_desc, error_code=error_code, details=data)

        if code_upper in (
            "QUERY_LIMIT_EXCEEDED",
            "OPERATION_TIME_LIMIT",
            "query_limit_exceeded",
        ):
            raise BitrixQuotaError(error_desc, error_code=error_code, details=data)

        # Generic Bitrix error
        raise BitrixError(error_desc, error_code=error_code, details=data)

    # ------------------------------------------------------------------
    # Deal operations
    # ------------------------------------------------------------------

    async def get_deal(self, deal_id: int) -> dict:
        """
        Fetch a single CRM deal with all its fields.
        Returns a dict with translated PWA field names.
        """
        result = await self.call("crm.deal.get", {"ID": deal_id})
        if not result:
            raise BitrixNotFoundError(f"Deal {deal_id} not found")

        # Import here to avoid circular imports
        from services.field_transformer import FieldTransformer
        transformer = FieldTransformer(self.discovery)
        return transformer.transform_from_bitrix(result)

    async def create_deal(self, inspection_data: dict) -> dict:
        """
        Create a CRM deal from PWA inspection data.
        Transforms all fields dynamically using the discovery engine.
        
        Returns: { "deal_id": int, "bitrix_url": str, "success": bool }
        """
        from services.field_transformer import FieldTransformer
        transformer = FieldTransformer(self.discovery)

        bitrix_fields = transformer.transform_to_bitrix(inspection_data)

        # Add a descriptive title
        brand = inspection_data.get("vehicle_brand", "")
        model = inspection_data.get("vehicle_model", "")
        plates = inspection_data.get("registration_number", "")
        title = f"Inspekcja: {brand} {model} - {plates}".strip(" -")
        bitrix_fields["TITLE"] = title or "Nowa inspekcja"
        bitrix_fields["CATEGORY_ID"] = 0

        result = await self.call("crm.deal.add", {"fields": bitrix_fields})

        deal_id = result if isinstance(result, int) else int(result)
        # Construct the Bitrix24 deal URL
        base_domain = self.webhook_url.split("/rest/")[0]
        bitrix_url = f"{base_domain}/crm/deal/details/{deal_id}/"

        return {
            "deal_id": deal_id,
            "bitrix_url": bitrix_url,
            "success": True,
        }

    async def update_deal(self, deal_id: int, inspection_data: dict) -> dict:
        """
        Update an existing CRM deal with new inspection data.
        """
        from services.field_transformer import FieldTransformer
        transformer = FieldTransformer(self.discovery)

        bitrix_fields = transformer.transform_to_bitrix(inspection_data)

        await self.call(
            "crm.deal.update",
            {"ID": deal_id, "fields": bitrix_fields},
        )

        base_domain = self.webhook_url.split("/rest/")[0]
        bitrix_url = f"{base_domain}/crm/deal/details/{deal_id}/"

        return {
            "deal_id": deal_id,
            "bitrix_url": bitrix_url,
            "success": True,
        }

    async def schedule_inspection(self, deal_id: int, scheduled_date: str) -> dict:
        """Schedule an inspection with conflict checking and stage transition. (Problem 3)"""
        # Improved Conflict Detection: Check for overlapping windows (assuming 60 min duration)
        day_only = scheduled_date.split('T')[0]
        filters = {
            ">=BEGINDATE": f"{day_only} 00:00:00",
            "<=BEGINDATE": f"{day_only} 23:59:59"
        }
        day_deals = await self.get_deal_list(filters)
        has_conflict = False
        
        # Hardcoded date field
        DATE_FIELD = "UF_CRM_1772108256983"
        
        try:
            from datetime import datetime, timedelta
            new_dt = datetime.fromisoformat(scheduled_date.replace('Z', ''))
            new_start = new_dt
            new_end = new_dt + timedelta(minutes=59) # Window of 1 hour
            
            for d in day_deals:
                if int(d.get("ID")) == deal_id: continue
                
                other_val = d.get(DATE_FIELD)
                if not other_val: continue
                
                try:
                    # Bitrix might return YYYY-MM-DDTHH:MM:SS+02:00 or similar
                    clean_val = other_val.replace('Z', '')
                    if '+' in clean_val:
                        clean_val = clean_val.split('+')[0]
                    
                    other_dt = datetime.fromisoformat(clean_val)
                    other_start = other_dt
                    other_end = other_dt + timedelta(minutes=59)
                    
                    # Intersecting windows check: (StartA < EndB) and (EndA > StartB)
                    if (new_start < other_end) and (new_end > other_start):
                        has_conflict = True
                        logger.warning(f"Conflict detected between deal {deal_id} and {d.get('ID')} at {other_val}")
                        break
                except (ValueError, TypeError):
                    continue
        except Exception as e:
            logger.error(f"Conflict check error: {e}")
        
        stage_id = await self.get_status_id_by_label("ustalone")
        if not stage_id:
            stage_id = "C1:USTALONE"
            
        payload = {
            "STAGE_ID": stage_id,
            DATE_FIELD: scheduled_date
        }
        
        logger.info(f"Updating deal {deal_id} for scheduling: {payload}")
        await self.call("crm.deal.update", {"ID": deal_id, "fields": payload})
        
        return {
            "success": True, 
            "conflict": has_conflict, 
            "message": "Termin zapisany" + (" (Wykryto kolizję!)" if has_conflict else "")
        }

    async def get_status_id_by_label(self, label: str) -> Optional[str]:
        """
        Look up a STAGE_ID by display name across ALL categories. (Problem 3.3)
        """
        try:
            label_lower = label.lower()
            
            # 1. Query all categories
            categories = await self.call("crm.dealcategory.list", {}) or [{"ID": "0", "NAME": "General"}]
            
            for cat in categories:
                cat_id = cat.get("ID", "0")
                # 2. For each category call crm.dealcategory.stage.list
                stages = await self.call("crm.dealcategory.stage.list", {"id": cat_id})
                if not stages:
                    continue
                
                # 3. Search for a stage whose NAME contains label
                for s in stages:
                    stage_name = str(s.get("NAME", "")).lower()
                    if label_lower in stage_name:
                        stage_id = s.get("STATUS_ID")
                        logger.info(f"Found stage for '{label}': {stage_id} ('{s.get('NAME')}') in category {cat_id}")
                        return stage_id
                        
        except Exception as e:
            logger.error(f"Failed to fetch statuses: {e}")
        return None

    async def get_appraiser_deals(
        self,
        user_id: int,
        date_from: str,
        date_to: str = None,
    ) -> list:
        """
        Fetch deals assigned to a specific appraiser from a given date.
        Uses the dynamically discovered "appraiser_mobile" field ID.
        """
        # Resolve the appraiser field dynamically
        appraiser_field = None
        if self.discovery:
            appraiser_field = self.discovery.get_field_id("appraiser_mobile")

        filters = {}
        if appraiser_field:
            filters[appraiser_field] = user_id
        filters[">=BEGINDATE"] = date_from
        if date_to:
            filters["<=BEGINDATE"] = date_to

        deals = await self.get_deal_list(filters)

        # Return simplified list with key fields only
        from services.field_transformer import FieldTransformer
        transformer = FieldTransformer(self.discovery)

        results = []
        for deal in deals:
            translated = transformer.transform_from_bitrix(deal)
            results.append(translated)
        return results

    async def get_deal_list(self, filters: dict = None) -> list:
        """
        Generic deal list fetcher with dynamic filters.
        Supports full pagination (iterates all pages).
        """
        all_deals = []
        start = 0
        batch_size = 50

        while True:
            params = {
                "filter": filters or {},
                "select": ["*", "UF_*"],
                "start": start,
            }

            result = await self.call("crm.deal.list", params)

            if isinstance(result, list):
                all_deals.extend(result)
                # Bitrix returns max 50 items per page
                if len(result) < batch_size:
                    break
                start += batch_size
            else:
                # Some Bitrix versions return dict with 'result' key
                break

            # Safety: cap at 1000 deals to avoid infinite loops
            if start >= 1000:
                logger.warning("Deal list pagination capped at 1000 items")
                break

        return all_deals

    async def upload_file_to_deal(
        self,
        deal_id: int,
        field_pwa_key: str,
        file_bytes: bytes,
        filename: str,
    ) -> dict:
        """
        Upload a file to a deal's file field.
        Resolves field_pwa_key to real Bitrix field ID dynamically.
        Handles isMultiple fields (appends, doesn't overwrite).
        """
        import base64

        # Resolve the field ID
        field_id = None
        if self.discovery:
            field_id = self.discovery.get_field_id(field_pwa_key)

        if not field_id:
            logger.warning(f"Cannot resolve field for file upload: {field_pwa_key}")
            return {"file_id": None, "url": None, "success": False}

        # Encode file as base64 for Bitrix API
        file_b64 = base64.b64encode(file_bytes).decode("utf-8")

        # Check if the field supports multiple files
        is_multiple = False
        if self.discovery:
            is_multiple = self.discovery.is_multiple_field(field_id)

        if is_multiple:
            # Fetch current values first, then append
            current_deal = await self.call("crm.deal.get", {"ID": deal_id})
            current_files = current_deal.get(field_id, []) if current_deal else []
            if not isinstance(current_files, list):
                current_files = [current_files] if current_files else []

            current_files.append({
                "fileData": [filename, file_b64]
            })
            update_fields = {field_id: current_files}
        else:
            update_fields = {
                field_id: {"fileData": [filename, file_b64]}
            }

        await self.call(
            "crm.deal.update",
            {"ID": deal_id, "fields": update_fields},
        )

        return {
            "file_id": filename,
            "url": None,  # Bitrix doesn't return URL on upload
            "success": True,
        }

    # ------------------------------------------------------------------
    # Health & diagnostics
    # ------------------------------------------------------------------

    async def test_connection(self) -> dict:
        """
        Lightweight connectivity check.
        Calls crm.deal.fields and returns status.
        """
        try:
            result = await self.call("crm.deal.fields", {})
            return {
                "connected": True,
                "scope_ok": True,
                "field_count": len(result) if result else 0,
            }
        except BitrixScopeError:
            return {"connected": True, "scope_ok": False, "field_count": 0}
        except BitrixAuthError:
            return {"connected": False, "scope_ok": False, "field_count": 0}
        except Exception as e:
            logger.error(f"Connection test failed: {e}")
            return {"connected": False, "scope_ok": False, "field_count": 0}
