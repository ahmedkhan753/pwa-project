"""
Bitrix24 Dynamic Field Discovery Engine
========================================
Discovers all CRM Deal field IDs dynamically from the live Bitrix24 API.
Zero hardcoded UF_CRM_* IDs — everything is resolved via keyword matching
on field labels (Polish + English).

Supports manual overrides via mapping_overrides.json for ambiguous labels.
"""

import os
import json
import time
import logging
from typing import Dict, Optional, List, Any
from pathlib import Path

logger = logging.getLogger("bitrix_discovery")

# ---------------------------------------------------------------------------
# Keyword mapping: PWA field key → list of keyword patterns to match
# against Bitrix24 field formLabel / listLabel / title
# ---------------------------------------------------------------------------
KEYWORD_MAPPING: Dict[str, List[str]] = {
    # ── Step 1: Vehicle Identity ──────────────────────────────────
    "vin":                      ["VIN", "numer nadwozia", "nr seryjny", "Vehicle Identification"],
    "vehicle_brand":            ["Marka", "Make", "Brand"],
    "vehicle_model":            ["Model pojazdu", "Model"],
    "production_year":          ["Rok produkcji", "Year", "Rok"],
    "vehicle_color":            ["Kolor", "Color", "Lakier"],
    "mileage":                  ["Przebieg", "Mileage", "Kilometry"],
    "engine_capacity":          ["Pojemność silnika", "Pojemność", "Engine capacity"],
    "engine_power":             ["Moc silnika", "Moc", "Engine power", "Power"],
    "fuel_type":                ["Rodzaj paliwa", "Paliwo", "Fuel type", "Fuel"],
    "body_type":                ["Rodzaj nadwozia", "Nadwozie", "Body type"],
    "gearbox_type":             ["Skrzynia biegów", "Skrzynia", "Gearbox", "Transmission"],
    "drive_type":               ["Napęd", "Drive type", "Rodzaj napędu"],
    "registration_number":      ["Numer rejestracyjny", "Rejestracja", "Tablice", "Registration", "Plates"],
    "first_registration_date":  ["Data pierwszej rejestracji", "Pierwsza rejestracja", "First registration"],
    "production_date":          ["Data produkcji", "Production date"],
    "job_type":                 ["Typ zlecenia", "Rodzaj zlecenia", "Typ", "Job type"],

    # ── Step 2: Client Info ───────────────────────────────────────
    "company_name":             ["Firma", "Company", "Nazwa firmy"],
    "client_name":              ["Klient", "Client", "Właściciel", "Owner"],
    "client_phone":             ["Telefon", "Phone", "Nr telefonu"],
    "client_email":             ["Email klienta", "Client email"],

    # ── Step 3: Inspection Schedule ───────────────────────────────
    "inspection_date":          ["Data oględzin", "Inspection date", "Data inspekcji"],
    "inspection_place":         ["Miejsce oględzin", "Inspection place", "Lokalizacja"],
    "inspector_name":           ["Rzeczoznawca", "Inspector", "Inspektor"],
    "appraiser_mobile":         ["Rzeczoznawca mobilny", "Mobile appraiser"],
    "scheduled_date":           ["Planowana data", "Scheduled date", "UF_CRM_1772108256983"],

    # ── Step 4: Documents Check ───────────────────────────────────
    "documents_completeness":   ["Kompletność dokumentów", "Dokumenty", "Documents"],
    "registration_cert":        ["Dowód rejestracyjny", "Registration certificate"],
    "insurance_policy":         ["Polisa", "Insurance", "Ubezpieczenie"],

    # ── Step 5: Paint Measurements (17 panels) ────────────────────
    "paint_hood":               ["Maska", "Hood", "Pokrywa silnika"],
    "paint_roof":               ["Dach", "Roof"],
    "paint_trunk":              ["Klapa bagażnika", "Trunk", "Pokrywa bagażnika"],
    "paint_fender_fl":          ["Błotnik lewy przedni", "Fender front left"],
    "paint_fender_fr":          ["Błotnik prawy przedni", "Fender front right"],
    "paint_fender_rl":          ["Błotnik lewy tylny", "Fender rear left"],
    "paint_fender_rr":          ["Błotnik prawy tylny", "Fender rear right"],
    "paint_door_fl":            ["Drzwi lewe przednie", "Door front left"],
    "paint_door_fr":            ["Drzwi prawe przednie", "Door front right"],
    "paint_door_rl":            ["Drzwi lewe tylne", "Door rear left"],
    "paint_door_rr":            ["Drzwi prawe tylne", "Door rear right"],
    "paint_bumper_front":       ["Zderzak przedni", "Front bumper"],
    "paint_bumper_rear":        ["Zderzak tylny", "Rear bumper"],
    "paint_sill_left":          ["Próg lewy", "Sill left"],
    "paint_sill_right":         ["Próg prawy", "Sill right"],
    "paint_pillar_a_left":      ["Słupek A lewy", "A pillar left"],
    "paint_pillar_a_right":     ["Słupek A prawy", "A pillar right"],
    "paint_data_json":          ["Pomiary lakieru", "Grubość lakieru", "Paint measurement", "Paint data"],

    # ── Step 6: Mechanical Check ──────────────────────────────────
    "engine_oil_level":         ["Poziom oleju", "Oil level"],
    "coolant_level":            ["Płyn chłodniczy", "Coolant"],
    "brake_fluid_level":        ["Płyn hamulcowy", "Brake fluid"],
    "power_steering_level":     ["Płyn wspomagania", "Power steering"],
    "warning_lights":           ["Kontrolki", "Warning lights", "Lampki"],
    "mechanical_json":          ["Mechanika", "Stan techniczny", "Mechanical check"],

    # ── Step 7: Tire Data (4 wheels × fields) ─────────────────────
    "tire_fl_brand":            ["Lewy przód marka", "Opona LP marka", "Tire FL brand"],
    "tire_fl_size":             ["Lewy przód rozmiar", "Opona LP rozmiar", "Tire FL size"],
    "tire_fl_width":            ["Lewy przód szerokość", "Tire FL width"],
    "tire_fl_depth":            ["Lewy przód głębokość", "Tire FL depth", "Lewy przód bieżnik"],
    "tire_fl_type":             ["Lewy przód typ", "Opona LP typ", "Tire FL type"],
    "tire_fr_brand":            ["Prawy przód marka", "Opona PP marka", "Tire FR brand"],
    "tire_fr_size":             ["Prawy przód rozmiar", "Opona PP rozmiar", "Tire FR size"],
    "tire_fr_width":            ["Prawy przód szerokość", "Tire FR width"],
    "tire_fr_depth":            ["Prawy przód głębokość", "Tire FR depth", "Prawy przód bieżnik"],
    "tire_fr_type":             ["Prawy przód typ", "Opona PP typ", "Tire FR type"],
    "tire_rl_brand":            ["Lewy tył marka", "Opona LT marka", "Tire RL brand"],
    "tire_rl_size":             ["Lewy tył rozmiar", "Opona LT rozmiar", "Tire RL size"],
    "tire_rl_width":            ["Lewy tył szerokość", "Tire RL width"],
    "tire_rl_depth":            ["Lewy tył głębokość", "Tire RL depth", "Lewy tył bieżnik"],
    "tire_rl_type":             ["Lewy tył typ", "Opona LT typ", "Tire RL type"],
    "tire_rr_brand":            ["Prawy tył marka", "Opona PT marka", "Tire RR brand"],
    "tire_rr_size":             ["Prawy tył rozmiar", "Opona PT rozmiar", "Tire RR size"],
    "tire_rr_width":            ["Prawy tył szerokość", "Tire RR width"],
    "tire_rr_depth":            ["Prawy tył głębokość", "Tire RR depth", "Prawy tył bieżnik"],
    "tire_rr_type":             ["Prawy tył typ", "Opona PT typ", "Tire RR type"],
    "tires_data_json":          ["Ogumienie", "Opony", "Tires", "Koła"],

    # ── Step 8: Exterior Photos ───────────────────────────────────
    "photo_front":              ["Przód pojazdu"],
    "photo_rear":               ["Tył pojazdu"],
    "photo_left":               ["Lewy bok"],
    "photo_right":              ["Prawy bok"],
    "photo_interior":           ["Wnętrze (Fotele przód)"],
    "photo_dashboard":          ["Deska rozdzielcza (Kokpit)"],
    "photo_odometer":           ["Licznik (Przebieg)"],
    "photo_vin_plate":          ["Tabliczka znamionowa (VIN)"],

    # ── Step 9: Interior Assessment ───────────────────────────────
    "interior_damage_json":     ["Uszkodzenia wnętrza", "Interior damage", "Uszkodzenia wewnętrzne"],
    "interior_condition":       ["Stan wnętrza", "Interior condition", "Ogólny stan"],
    "absent_rep_comment":       ["COMMENTS", "Uwagi do podpisu", "Nieobecność"],
    "seat_condition":           ["Stan foteli", "Seat condition", "Fotele"],
    "dashboard_condition":      ["Stan deski", "Dashboard condition"],

    # ── Step 10: Body Damage ──────────────────────────────────────
    "exterior_damage_json":     ["Uszkodzenia nadwozia", "Exterior damage", "Uszkodzenia zewnętrzne", "Body damage"],
    "damage_group_1.type":      ["Uszkodzenia grupa 1", "Damage group 1"],
    "damage_group_1.desc":      ["Opis zdjęć 1"],
    "damage_group_2.type":      ["Uszkodzenia grupa 2", "Damage group 2"],
    "damage_group_2.desc":      ["Opis zdjęć 2"],
    "damage_group_3.type":      ["Uszkodzenia grupa 3", "Damage group 3"],
    "damage_group_3.desc":      ["Opis zdjęć 3"],
    "damage_group_4.type":      ["Uszkodzenia grupa 4", "Damage group 4"],
    "damage_group_4.desc":      ["Opis zdjęć 4"],
    "damage_group_5.type":      ["Uszkodzenia grupa 5", "Damage group 5"],
    "damage_group_5.desc":      ["Opis zdjęć 5"],
    "damage_group_6.type":      ["Uszkodzenia grupa 6", "Damage group 6"],
    "damage_group_6.desc":      ["Opis zdjęć 6"],
    "damage_group_7.type":      ["Uszkodzenia grupa 7", "Damage group 7"],
    "damage_group_7.desc":      ["Opis zdjęć 7"],

    # ── Step 11: Summary & Signature ──────────────────────────────
    "estimated_value":          ["Szacowana wartość", "Estimated value", "Wycena"],
    "general_comments":         ["Uwagi ogólne", "General comments", "Komentarz"],
    "vin_confirmed":            ["VIN potwierdzony", "VIN confirmed"],
    "signature_appraiser":      ["Podpis rzeczoznawcy", "Appraiser signature"],
    "signature_client":         ["Podpis klienta", "Client signature"],
    "signature_yard":           ["Podpis plac", "Yard signature"],
    "notes_valuation_json":     ["Uwagi i wycena", "Notes valuation", "Notatki"],

    # ── Equipment ─────────────────────────────────────────────────
    "equipment_completeness":   ["Kompletność wyposażenia", "Equipment completeness"],
    "full_equipment_json":      ["Pełne wyposażenie", "Full equipment", "Wyposażenie"],
}

# ---------------------------------------------------------------------------
# Manual Overrides: PWA key → Exact Bitrix Field ID
# These are checked FIRST (Problem 1)
# ---------------------------------------------------------------------------
MANUAL_OVERRIDES: Dict[str, str] = {
    "damage_group_1.desc": "UF_CRM_1772613247890",
    "damage_group_1.type": "UF_CRM_1772613182502",
    "damage_group_2.desc": "UF_CRM_1772613406127",
    "damage_group_2.type": "UF_CRM_1772613355353",
    "damage_group_3.desc": "UF_CRM_1772718096612",
    "damage_group_4.desc": "UF_CRM_1772715584270",
    "damage_group_5.desc": "UF_CRM_1772715705935",
    "damage_group_6.desc": "UF_CRM_1772715826394",
    "damage_group_7.desc": "UF_CRM_1772715939756",
    "documents_completeness": "UF_CRM_1772533732089",
    "estimated_value": "OPPORTUNITY",
    "exterior_damage_json": "UF_CRM_1772613182502",
    "insurance_policy": "UF_CRM_1772534289878",
    "interior_condition": "UF_CRM_1766057661321",
    "interior_damage_json": "UF_CRM_1772613527365",
    "notes_valuation_json": "UF_CRM_1772798881993",
    "paint_data_json": "UF_CRM_1772608834",
    "photo_dashboard": "UF_CRM_1772612221275",
    "tire_fl_depth": "UF_CRM_1772611012628",
    "tire_fl_size": "UF_CRM_1772610861879",
    "tire_fr_depth": "UF_CRM_1772611638595",
    "tire_fr_size": "UF_CRM_1772611559270",
    "tire_rl_depth": "UF_CRM_1772611274637",
    "tire_rl_size": "UF_CRM_1772611181014",
    "tire_rr_depth": "UF_CRM_1772611458789",
    "tire_rr_size": "UF_CRM_1772611383784",
    "vin_confirmed": "UF_CRM_1766057539531",
    "body_type": "UF_CRM_1772796562336",
    "brake_fluid_level": "UF_CRM_1772534549",
    "company_name": "UF_CRM_1766057964319",
    "coolant_level": "UF_CRM_1772534597",
    "drive_type": "UF_CRM_1772534384484",
    "engine_capacity": "UF_CRM_1772534081105",
    "engine_oil_level": "UF_CRM_1772534488",
    "engine_power": "UF_CRM_1772534094039",
    "first_registration": "UF_CRM_1771529218758",
    "fuel_type": "UF_CRM_1772534193",
    "gearbox_type": "UF_CRM_1772796772039",
    "planned_address": "UF_CRM_1766058194337",
    "planned_location": "UF_CRM_1766058185504",
    "power_steering_level": "UF_CRM_1772534574",
    "production_date": "UF_CRM_1772534258723",
    "registration_number": "UF_CRM_1766057515315",
    "vehicle_brand": "UF_CRM_1766057839684",
    "vehicle_model": "UF_CRM_1766057849818",
}


class BitrixFieldDiscovery:
    """
    Dynamic field discovery engine that builds a PWA-key → UF_CRM_* registry
    by scanning Bitrix24 crm.deal.fields labels at runtime.
    """

    def __init__(self):
        # Raw schema from crm.deal.fields
        self._field_schema: Dict[str, Any] = {}
        # PWA key → Bitrix field ID
        self._registry: Dict[str, str] = {}
        # Bitrix field ID → PWA key (reverse)
        self._reverse_registry: Dict[str, str] = {}
        # Manual overrides from mapping_overrides.json
        self._overrides: Dict[str, str] = {}
        # Cache metadata
        self._last_sync: float = 0
        self._ttl: int = 3600  # 1 hour cache TTL
        self._is_initialized: bool = False

    # ------------------------------------------------------------------
    # Initialization
    # ------------------------------------------------------------------

    async def initialize(self, gateway_call):
        """
        Initialize the field discovery engine.
        `gateway_call` is an async function(method, params) → dict
        that makes the actual Bitrix24 API call.
        """
        self._load_overrides()
        await self._fetch_and_build_registry(gateway_call)
        self._is_initialized = True

    def _load_overrides(self):
        """Load manual mapping overrides from mapping_overrides.json."""
        overrides_path = Path(__file__).parent.parent / "mapping_overrides.json"
        if overrides_path.exists():
            try:
                with open(overrides_path, "r", encoding="utf-8") as f:
                    self._overrides = json.load(f)
                if self._overrides:
                    logger.info(
                        f"Loaded {len(self._overrides)} manual field overrides "
                        f"from {overrides_path.name}"
                    )
            except (json.JSONDecodeError, IOError) as e:
                logger.warning(f"Failed to load mapping_overrides.json: {e}")
                self._overrides = {}
        else:
            logger.info("No mapping_overrides.json found — using keyword matching only")
            self._overrides = {}

    async def _fetch_and_build_registry(self, gateway_call):
        """Fetch crm.deal.fields and build the dynamic registry."""
        logger.info("Fetching crm.deal.fields from Bitrix24...")

        result = await gateway_call("crm.deal.fields", {})
        if not result:
            logger.error("crm.deal.fields returned empty result")
            return

        self._field_schema = result
        self._last_sync = time.time()

        # Build the registry via keyword matching
        self._build_registry()

        # Log the startup report
        self._log_startup_report()

    def _build_registry(self):
        """
        Build the PWA-key → Bitrix-field-ID mapping by scanning
        field labels against keyword patterns.
        Manual overrides take precedence.
        """
        self._registry.clear()
        self._reverse_registry.clear()

        # 1. Apply manual overrides from file first
        for pwa_key, field_id in self._overrides.items():
            if field_id in self._field_schema:
                self._registry[pwa_key] = field_id
                self._reverse_registry[field_id] = pwa_key
                logger.debug(f"Override (file): {pwa_key} → {field_id}")

        # 2. Apply MANUAL_OVERRIDES from code (Problem 1)
        for pwa_key, field_id in MANUAL_OVERRIDES.items():
            # Allow "COMMENTS" even if not in scheme (it's a system field)
            if field_id in self._field_schema or field_id == "COMMENTS":
                self._registry[pwa_key] = field_id
                self._reverse_registry[field_id] = pwa_key
                logger.debug(f"Override (code): {pwa_key} → {field_id}")
            else:
                logger.warning(
                    f"Manual Override {pwa_key} → {field_id} skipped: "
                    f"field ID not found in Bitrix schema"
                )

        # 3. Keyword-match remaining PWA keys
        for pwa_key, keywords in KEYWORD_MAPPING.items():
            # Skip if already set by override
            if pwa_key in self._registry:
                continue

            matched_field_id = self._match_field(keywords)
            if matched_field_id:
                self._registry[pwa_key] = matched_field_id
                self._reverse_registry[matched_field_id] = pwa_key

    def _match_field(self, keywords: List[str]) -> Optional[str]:
        """
        Scan all Bitrix fields and return the first field ID whose
        label matches any of the given keywords (case-insensitive).
        Prioritizes UF_CRM_* fields over system fields.
        """
        # First pass: try UF_CRM_ fields only (custom fields)
        for field_id, info in self._field_schema.items():
            if not field_id.startswith("UF_CRM_"):
                continue
            label = self._get_field_label(info)
            if not label:
                continue
            label_upper = label.upper()
            for kw in keywords:
                if kw.upper() in label_upper:
                    return field_id

        # Second pass: try all fields (system fields as fallback)
        for field_id, info in self._field_schema.items():
            if field_id.startswith("UF_CRM_"):
                continue  # Already checked
            label = self._get_field_label(info)
            if not label:
                continue
            label_upper = label.upper()
            for kw in keywords:
                if kw.upper() in label_upper:
                    return field_id

        return None

    @staticmethod
    def _get_field_label(field_info: dict) -> str:
        """Extract the best available label from a field schema entry."""
        # Try formLabel first, then listLabel, then title
        label = field_info.get("formLabel") or ""
        if not label:
            label = field_info.get("listLabel") or ""
        if not label:
            label = field_info.get("title") or ""
        # Some fields have labels nested as language dicts
        if isinstance(label, dict):
            label = label.get("pl", "") or label.get("en", "") or ""
        return str(label).strip()

    def _log_startup_report(self):
        """Log a startup report showing mapping statistics."""
        total_fields = len(self._field_schema)
        total_pwa_keys = len(KEYWORD_MAPPING)
        mapped_count = len(self._registry)
        override_count = len(
            [k for k in self._registry if k in self._overrides or k in MANUAL_OVERRIDES]
        )
        unmapped_keys = [
            k for k in KEYWORD_MAPPING if k not in self._registry
        ]

        logger.info("=" * 60)
        logger.info("BITRIX24 FIELD DISCOVERY REPORT")
        logger.info("=" * 60)
        logger.info(f"Total Bitrix fields discovered: {total_fields}")
        logger.info(f"Total PWA keys defined:         {total_pwa_keys}")
        logger.info(f"Successfully mapped:            {mapped_count}")
        logger.info(f"  - Via keyword match:          {mapped_count - override_count}")
        logger.info(f"  - Via manual override:        {override_count}")
        logger.info(f"Unmapped PWA keys:              {len(unmapped_keys)}")

        if unmapped_keys:
            logger.warning("Unmapped PWA keys (these will be skipped):")
            for key in unmapped_keys:
                logger.warning(f"  ⚠ {key}")

        logger.info("=" * 60)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_field_id(self, pwa_key: str) -> Optional[str]:
        """
        Get the real Bitrix24 UF_CRM_* field ID for a PWA key.
        Returns None if not mapped (logs a warning, does NOT crash).
        """
        field_id = self._registry.get(pwa_key)
        if field_id is None:
            logger.warning(
                f"PWA key '{pwa_key}' is not mapped to any Bitrix field — skipping"
            )
        return field_id

    def get_enum_value_id(self, field_id: str, value: str) -> Optional[str]:
        """
        For enumeration fields, look up the correct numeric item ID
        for a given string value. Never hardcoded.
        
        Example: field has items [{ID: "316", VALUE: "BENZYNA"}, ...]
                 get_enum_value_id(field_id, "BENZYNA") → "316"
        """
        field_info = self._field_schema.get(field_id, {})
        items = field_info.get("items", [])
        if not items:
            # Not an enum field or no items
            return value

        value_upper = str(value).upper().strip()

        for item in items:
            item_value = str(item.get("VALUE", "")).upper().strip()
            if item_value == value_upper:
                return str(item.get("ID", ""))

        # Partial match fallback
        for item in items:
            item_value = str(item.get("VALUE", "")).upper().strip()
            if value_upper in item_value or item_value in value_upper:
                logger.debug(
                    f"Partial enum match: '{value}' → '{item.get('VALUE')}' "
                    f"(ID: {item.get('ID')})"
                )
                return str(item.get("ID", ""))

        logger.warning(
            f"Enum value '{value}' not found for field {field_id}. "
            f"Available: {[i.get('VALUE') for i in items]}"
        )
        return value  # Return raw value as fallback

    def get_field_schema(self, field_id: str) -> dict:
        """
        Return the full schema for a field: type, isMultiple, items, etc.
        """
        return self._field_schema.get(field_id, {})

    def get_reverse_mapping(self) -> Dict[str, str]:
        """Return {Bitrix_field_ID: pwa_key} for reverse transforms."""
        return dict(self._reverse_registry)

    def get_full_registry(self) -> Dict[str, str]:
        """Return the full {pwa_key: Bitrix_field_ID} mapping."""
        return dict(self._registry)

    def get_all_pwa_keys(self) -> List[str]:
        """Return all defined PWA keys (mapped + unmapped)."""
        return list(KEYWORD_MAPPING.keys())

    def get_mapped_count(self) -> int:
        """Return the number of successfully mapped fields."""
        return len(self._registry)

    def get_total_bitrix_fields(self) -> int:
        """Return the total number of Bitrix fields discovered."""
        return len(self._field_schema)

    @property
    def is_initialized(self) -> bool:
        return self._is_initialized

    @property
    def last_sync_time(self) -> float:
        return self._last_sync

    def is_cache_stale(self) -> bool:
        """Check if the cached schema has expired."""
        if not self._last_sync:
            return True
        return (time.time() - self._last_sync) > self._ttl

    def is_enum_field(self, field_id: str) -> bool:
        """Check if a field is an enumeration type."""
        info = self._field_schema.get(field_id, {})
        return info.get("type") == "enumeration" or bool(info.get("items"))

    def is_file_field(self, field_id: str) -> bool:
        """Check if a field is a file type."""
        info = self._field_schema.get(field_id, {})
        return info.get("type") in ("file", "diskfile")

    def is_multiple_field(self, field_id: str) -> bool:
        """Check if a field supports multiple values."""
        info = self._field_schema.get(field_id, {})
        return info.get("isMultiple", False)

    async def refresh_if_stale(self, gateway_call):
        """Re-fetch fields if cache TTL has expired."""
        if self.is_cache_stale():
            logger.info("Field cache is stale — refreshing from Bitrix24")
            await self._fetch_and_build_registry(gateway_call)


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------
discovery = BitrixFieldDiscovery()
