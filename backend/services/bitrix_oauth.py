"""
Bitrix24 OAuth Token Manager
=============================
Handles storage, retrieval, and auto-refresh of OAuth tokens
for the local Bitrix24 app. Tokens are persisted to disk so
they survive container restarts.

Usage:
    oauth = BitrixOAuth()
    token = await oauth.get_valid_token()
    # Use token with show_file.php?auth={token}
"""

import os
import json
import time
import logging
from pathlib import Path
from typing import Optional

import httpx

logger = logging.getLogger("bitrix_oauth")

TOKEN_FILE = Path("/app/data/bitrix_oauth_tokens.json")
OAUTH_TOKEN_URL = "https://oauth.bitrix.info/oauth/token/"


class BitrixOAuth:
    """Manages Bitrix24 OAuth tokens with auto-refresh."""

    def __init__(self):
        self.client_id = os.getenv("BITRIX_APP_ID", "")
        self.client_secret = os.getenv("BITRIX_APP_SECRET", "")
        self._tokens: dict = {}
        self._load_tokens()

    def _load_tokens(self):
        """Load tokens from disk."""
        if TOKEN_FILE.exists():
            try:
                self._tokens = json.loads(TOKEN_FILE.read_text())
                logger.info(f"[OAuth] Loaded tokens from {TOKEN_FILE}")
            except Exception as e:
                logger.error(f"[OAuth] Failed to load tokens: {e}")
                self._tokens = {}

    def _save_tokens(self):
        """Persist tokens to disk."""
        TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
        TOKEN_FILE.write_text(json.dumps(self._tokens, indent=2))
        logger.info(f"[OAuth] Tokens saved to {TOKEN_FILE}")

    def store_tokens(self, access_token: str, refresh_token: str, 
                     expires_in: int = 3600, domain: str = "", member_id: str = ""):
        """Store new tokens (called after install or refresh)."""
        self._tokens = {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_at": time.time() + expires_in - 60,  # 60s buffer
            "domain": domain,
            "member_id": member_id,
            "updated_at": time.time(),
        }
        self._save_tokens()
        logger.info(f"[OAuth] Tokens stored (expires in {expires_in}s)")

    def has_tokens(self) -> bool:
        """Check if we have any stored tokens."""
        return bool(self._tokens.get("access_token"))

    def is_expired(self) -> bool:
        """Check if the access token is expired."""
        expires_at = self._tokens.get("expires_at", 0)
        return time.time() >= expires_at

    async def refresh_tokens(self) -> bool:
        """Refresh the access token using the refresh token."""
        refresh_token = self._tokens.get("refresh_token")
        if not refresh_token:
            logger.error("[OAuth] No refresh token available")
            return False

        if not self.client_id or not self.client_secret:
            logger.error("[OAuth] Missing BITRIX_APP_ID or BITRIX_APP_SECRET")
            return False

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(OAUTH_TOKEN_URL, params={
                    "grant_type": "refresh_token",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "refresh_token": refresh_token,
                })
                
                if resp.status_code != 200:
                    logger.error(f"[OAuth] Refresh failed: HTTP {resp.status_code} — {resp.text[:200]}")
                    return False

                data = resp.json()
                if "error" in data:
                    logger.error(f"[OAuth] Refresh error: {data}")
                    return False

                self.store_tokens(
                    access_token=data["access_token"],
                    refresh_token=data["refresh_token"],
                    expires_in=int(data.get("expires_in", 3600)),
                    domain=data.get("domain", self._tokens.get("domain", "")),
                    member_id=data.get("member_id", self._tokens.get("member_id", "")),
                )
                logger.info("[OAuth] ✅ Tokens refreshed successfully")
                return True

        except Exception as e:
            logger.error(f"[OAuth] Refresh exception: {e}")
            return False

    async def get_valid_token(self) -> Optional[str]:
        """Get a valid access token, refreshing if needed."""
        if not self.has_tokens():
            logger.warning("[OAuth] No tokens stored — app needs to be installed first")
            return None

        if self.is_expired():
            logger.info("[OAuth] Token expired, refreshing...")
            success = await self.refresh_tokens()
            if not success:
                return None

        return self._tokens.get("access_token")

    def get_status(self) -> dict:
        """Return current OAuth status for debugging."""
        return {
            "has_tokens": self.has_tokens(),
            "is_expired": self.is_expired() if self.has_tokens() else None,
            "domain": self._tokens.get("domain", ""),
            "updated_at": self._tokens.get("updated_at"),
            "has_client_id": bool(self.client_id),
            "has_client_secret": bool(self.client_secret),
        }


# Singleton instance
_oauth_instance: Optional[BitrixOAuth] = None


def get_oauth() -> BitrixOAuth:
    """Get or create the singleton OAuth manager."""
    global _oauth_instance
    if _oauth_instance is None:
        _oauth_instance = BitrixOAuth()
    return _oauth_instance
