"""
Admin Reports Router — edit Condition Report text/number/enum fields.

Endpoints (all require admin auth):
  GET  /api/admin/reports                  list deals with InspectionRecord rows
  GET  /api/admin/reports/{deal_id}/edit   full editable payload + schema
  PUT  /api/admin/reports/{deal_id}        apply validated changes (DB + Bitrix)

Scope: text / number / enum / structured-JSON only.
Out of scope: photos, videos, signatures, image fields. Any path component
matching those keywords is rejected with 400.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session

from database import get_db
from deps import require_admin
from models.inspector import InspectionEdit, InspectionRecord
from services.equipment_parser import parse_equipment_from_pdf
from routers.report import (
    OVERALL_CONDITION_LABELS,
    PAINT_ENUM_LABELS,
    VEHICLE_FIELDS,
)

router = APIRouter(tags=["Admin Reports"])
logger = logging.getLogger("routers.admin_reports")


# ─── Constants ────────────────────────────────────────────────────────────────

# Enum option lists. Copied verbatim from the inspector wizard
# (src/components/ui/inspection/steps/VehicleDataStep.tsx) so the admin editor
# offers exactly the same choices as the inspector. Update both files in sync.
FUEL_TYPES = ["BENZYNA", "DIESEL", "LPG", "HYBRYDA", "ELEKTRYCZNY",
              "HYBRYDA PLUG-IN", "HYBRYDA DIESEL", "WODÓR", "NIE DOTYCZY"]
BODY_TYPES = ["HATCHBACK", "SEDAN", "KOMBI", "SUV", "COUPE", "CABRIO",
              "VAN/MINIVAN", "PICKUP", "CROSSOVER"]
GEARBOX_TYPES = ["MANUALNA", "AUTOMATYCZNA", "CVT", "DSG/DCT (DWUSPRZĘGŁOWA)"]
DRIVE_TYPES = ["4x2 (FWD)", "4x2 (RWD)", "4x4 (AWD)", "4x4 (4WD)"]

# Paint panel keys — order/IDs mirror report.py::PAINT_PANELS_19.
PAINT_PANEL_KEYS: List[str] = [
    "hood", "leftFrontFender", "rightFrontFender", "leftFrontDoor",
    "rightFrontDoor", "leftRearDoor", "rightRearDoor", "leftRearFender",
    "rightRearFender", "trunk", "roof", "leftAColumn", "rightAColumn",
    "leftBColumn", "rightBColumn", "leftSill", "rightSill",
    "frontBumper", "rearBumper",
]

# Polish display labels for paint panels — schema path (paint.{key}.value)
# stays in English; only the human-facing label is translated.
PAINT_PANEL_LABELS_PL: Dict[str, str] = {
    "hood":             "Pokrywa przednia",
    "leftFrontFender":  "Błotnik przedni lewy",
    "rightFrontFender": "Błotnik przedni prawy",
    "leftFrontDoor":    "Drzwi przednie lewe",
    "rightFrontDoor":   "Drzwi przednie prawe",
    "leftRearDoor":     "Drzwi tylne lewe",
    "rightRearDoor":    "Drzwi tylne prawe",
    "leftRearFender":   "Błotnik tylny lewy",
    "rightRearFender":  "Błotnik tylny prawy",
    "trunk":            "Pokrywa tylna / klapa",
    "roof":             "Dach",
    "leftAColumn":      "Słupek przedni lewy",
    "rightAColumn":     "Słupek przedni prawy",
    "leftBColumn":      "Słupek środkowy lewy",
    "rightBColumn":     "Słupek środkowy prawy",
    "leftSill":         "Próg lewy",
    "rightSill":        "Próg prawy",
    "frontBumper":      "Zderzak przedni",
    "rearBumper":       "Zderzak tylny",
}

# Paint enum options offered to the admin (labels — frontend writes these
# strings, the report reader translates Bitrix IDs back via PAINT_ENUM_LABELS).
PAINT_OPTIONS = [""] + list(PAINT_ENUM_LABELS.values())

# Per-deal Bitrix paint-panel UF_CRM ids (only panels Bitrix has fields for).
PAINT_PANEL_TO_UF: Dict[str, str] = {
    "hood":             "UF_CRM_1772608834",
    "leftFrontFender":  "UF_CRM_1772609211",
    "rightFrontFender": "UF_CRM_1772610496",
    "leftFrontDoor":    "UF_CRM_1772609231",
    "rightFrontDoor":   "UF_CRM_1772610483",
    "leftRearDoor":     "UF_CRM_1772610262",
    "rightRearDoor":    "UF_CRM_1772610362",
    "leftRearFender":   "UF_CRM_1772610277",
    "rightRearFender":  "UF_CRM_1772610341",
    "trunk":            "UF_CRM_1772610306",
    "roof":             "UF_CRM_1772610511",
    "leftAColumn":      "UF_CRM_1772609246",
    "rightAColumn":     "UF_CRM_1772610470",
    "leftSill":         "UF_CRM_1772610293",
    "rightSill":        "UF_CRM_1772610320",
}

# UF_CRM ids for the bitrix_extras.* paths (source: mapping_overrides.json).
BITRIX_EXTRAS_FIELDS: Dict[str, str] = {
    "wyposazenie_standardowe":     "UF_CRM_1778277584327",
    "wyposazenie_dodatkowe":       "UF_CRM_1778277602592",
    "wyposazenie_specjalne":       "UF_CRM_1778277628717",
    "czynniki_obnizajace":         "UF_CRM_1778277647172",
    "komentarz_dane_pojazdu":      "UF_CRM_1778444266312",
    "komentarz_wyposazenie":       "UF_CRM_1778444290027",
    "komentarz_zdjecia":           "UF_CRM_1778444308127",
    "komentarz_opony_lakier":      "UF_CRM_1778444326195",
    "komentarz_uszkodzenia":       "UF_CRM_1778444342847",
    "komentarz_silnik":            "UF_CRM_1778444358921",
    "overall_condition":           "UF_CRM_1766057661321",
}

# Roots that map to InspectionRecord JSON columns.
JSON_COLUMN_BY_ROOT: Dict[str, str] = {
    "vehicle":          "vehicle_json",
    "paint":            "paint_json",
    "equipment":        "equipment_json",
    "full_equipment":   "full_equipment_json",
    "tires":            "tires_json",
    "mechanical":       "mechanical_json",
    "exterior_damages": "exterior_damage_json",
    "interior_damages": "interior_damage_json",
    "notes":            "notes_json",
}

ALLOWED_ROOTS = set(JSON_COLUMN_BY_ROOT) | {"bitrix_extras"}

# Schema → DB-column translation for the vehicle blob. The wizard persists
# vehicle_json with camelCase keys (driveType, bodyType, gearboxType, …),
# while the public-facing schema uses snake_case (drive_type, body_type, …).
# Edits must translate to the camelCase storage key, otherwise we silently
# create a *new* snake_case sibling and the report keeps reading the original
# empty camelCase value. Confirmed root cause for the May 2026 audit log full
# of "successful" drive_type writes that never showed up on the report.
VEHICLE_SCHEMA_TO_DB_KEY: Dict[str, str] = {
    "body_type":               "bodyType",
    "drive_type":              "driveType",
    "transmission":            "gearboxType",
    "fuel_type":               "fuelType",
    "doors":                   "doorsCount",
    "seats":                   "seatsCount",
    "engine_capacity_cc":      "engineCapacity",
    "engine_power_hp":         "enginePower",
    "registration_plate":      "registrationPlates",
    "first_registration_date": "firstRegistration",
    "weight_kg":               "ownWeight",
}
VEHICLE_DB_KEY_TO_SCHEMA: Dict[str, str] = {v: k for k, v in VEHICLE_SCHEMA_TO_DB_KEY.items()}


def _to_storage_parts(parts: List[str]) -> List[str]:
    """Rewrite a vehicle.* path's leaf so reads/writes hit the camelCase DB key."""
    if len(parts) >= 2 and parts[0] == "vehicle" and parts[1] in VEHICLE_SCHEMA_TO_DB_KEY:
        return [parts[0], VEHICLE_SCHEMA_TO_DB_KEY[parts[1]], *parts[2:]]
    return parts


def _vehicle_db_to_view(raw: Any) -> Dict[str, Any]:
    """Expose camelCase vehicle keys under their snake_case schema names so
    the edit form pre-fills with the actual stored values."""
    if not isinstance(raw, dict):
        return {}
    out: Dict[str, Any] = {}
    for k, v in raw.items():
        out[VEHICLE_DB_KEY_TO_SCHEMA.get(k, k)] = v
    return out

# Hard-block paths that touch any media/signature surface.
FORBIDDEN_PATH_TOKENS = ("photo", "video", "signature", "image")

# Permissive component pattern (letters, digits, underscore). Array indices
# (digits-only) are valid components — needed for exterior_damages.0.type.
PATH_COMPONENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$|^[0-9]+$")

MAX_TEXT_LEN = 5000


# ─── Validation helpers ───────────────────────────────────────────────────────

def _validate_path(path: str) -> Tuple[str, List[str]]:
    """Returns (root, components). Raises HTTPException on any safety issue."""
    if not path or not isinstance(path, str):
        raise HTTPException(status_code=400, detail=f"Invalid path: {path!r}")
    # No leading/trailing dots, no traversal markers, no slashes.
    if path.startswith(".") or path.endswith(".") or ".." in path:
        raise HTTPException(status_code=400, detail=f"Malformed path: {path!r}")
    if "/" in path or "\\" in path:
        raise HTTPException(status_code=400, detail=f"Illegal path: {path!r}")
    lower = path.lower()
    if any(tok in lower for tok in FORBIDDEN_PATH_TOKENS):
        raise HTTPException(
            status_code=400,
            detail=f"Path '{path}' touches a media/signature surface and is out of scope",
        )
    parts = path.split(".")
    for p in parts:
        if not PATH_COMPONENT_RE.match(p):
            raise HTTPException(
                status_code=400, detail=f"Invalid path component {p!r} in {path!r}"
            )
    root = parts[0]
    if root not in ALLOWED_ROOTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown root '{root}' (allowed: {sorted(ALLOWED_ROOTS)})",
        )
    return root, parts


def _validate_change(path: str, value: Any, schema_entry: Optional[Dict[str, Any]]) -> None:
    """Raise HTTPException if the (path, value) pair violates the schema."""
    # Without a schema entry we still apply broad shape checks below — admins
    # can edit nested damage fields whose exact key set the schema doesn't
    # enumerate.
    if schema_entry is None:
        if isinstance(value, str) and len(value) > MAX_TEXT_LEN:
            raise HTTPException(
                status_code=400,
                detail=f"{path}: text exceeds {MAX_TEXT_LEN} chars",
            )
        return

    t = schema_entry.get("type")

    if t == "number":
        if value in (None, ""):
            return  # explicit clear
        try:
            num = float(value)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"{path}: must be numeric")
        if "min" in schema_entry and num < schema_entry["min"]:
            raise HTTPException(
                status_code=400,
                detail=f"{path}: {num} < min {schema_entry['min']}",
            )
        if "max" in schema_entry and num > schema_entry["max"]:
            raise HTTPException(
                status_code=400,
                detail=f"{path}: {num} > max {schema_entry['max']}",
            )

    elif t == "enum":
        options = schema_entry.get("options") or []
        # Allow None as "" if "" is in options.
        candidate = "" if value is None else str(value)
        if candidate not in options:
            raise HTTPException(
                status_code=400,
                detail=f"{path}: {value!r} not in allowed options",
            )

    elif t == "text":
        if value is None:
            return
        if not isinstance(value, str):
            raise HTTPException(status_code=400, detail=f"{path}: must be string")
        if len(value) > MAX_TEXT_LEN:
            raise HTTPException(
                status_code=400,
                detail=f"{path}: text exceeds {MAX_TEXT_LEN} chars",
            )

    elif t == "structured":
        if not isinstance(value, (list, dict)):
            raise HTTPException(
                status_code=400,
                detail=f"{path}: must be a JSON object or array",
            )

    # Unknown type — fall through (treat permissively).


def _apply_change_to_json(blob: Any, components: List[str], value: Any) -> Any:
    """Set value at components[1:] inside the root container (blob).

    Components is the full path split (e.g. ['vehicle', 'mileage']). The first
    element is the root which selects the blob, so we descend from index 1.
    Returns the (possibly replaced) top-level container.
    """
    if len(components) == 1:
        # Replacing the whole root container.
        return value

    if blob is None:
        # Decide container type from the second component shape.
        blob = [] if components[1].isdigit() else {}

    cursor = blob
    rest = components[1:]
    for i, key in enumerate(rest[:-1]):
        next_key = rest[i + 1]
        if key.isdigit():
            idx = int(key)
            if not isinstance(cursor, list):
                raise HTTPException(
                    status_code=400,
                    detail=f"Path component {key!r} expects a list",
                )
            while len(cursor) <= idx:
                cursor.append({} if not next_key.isdigit() else [])
            if cursor[idx] is None:
                cursor[idx] = [] if next_key.isdigit() else {}
            cursor = cursor[idx]
        else:
            if not isinstance(cursor, dict):
                raise HTTPException(
                    status_code=400,
                    detail=f"Path component {key!r} expects a dict",
                )
            if key not in cursor or cursor[key] is None:
                cursor[key] = [] if next_key.isdigit() else {}
            cursor = cursor[key]

    leaf = rest[-1]
    if leaf.isdigit():
        idx = int(leaf)
        if not isinstance(cursor, list):
            raise HTTPException(
                status_code=400,
                detail=f"Path component {leaf!r} expects a list",
            )
        while len(cursor) <= idx:
            cursor.append(None)
        cursor[idx] = value
    else:
        if not isinstance(cursor, dict):
            raise HTTPException(
                status_code=400,
                detail=f"Path component {leaf!r} expects a dict",
            )
        cursor[leaf] = value

    return blob


def _read_path(blob: Any, components: List[str]) -> Any:
    """Return value at components[1:] inside the root blob, or None if missing."""
    if blob is None:
        return None
    cur = blob
    for key in components[1:]:
        if key.isdigit():
            idx = int(key)
            if not isinstance(cur, list) or idx >= len(cur):
                return None
            cur = cur[idx]
        else:
            if not isinstance(cur, dict) or key not in cur:
                return None
            cur = cur[key]
    return cur


def _get_bitrix_field_for_path(path: str) -> Optional[str]:
    """Map a dotted path to a Bitrix UF_CRM field id, if one exists."""
    parts = path.split(".")
    if len(parts) < 2:
        return None
    root = parts[0]
    if root == "vehicle":
        return VEHICLE_FIELDS.get(parts[1])
    if root == "paint" and len(parts) >= 3 and parts[2] == "value":
        return PAINT_PANEL_TO_UF.get(parts[1])
    if root == "bitrix_extras":
        return BITRIX_EXTRAS_FIELDS.get(parts[1])
    return None


def _value_to_bitrix(path: str, value: Any) -> Any:
    """Translate a user-facing label back to the Bitrix enum-id format.

    The vehicle.overall_condition and per-panel paint enums round-trip as the
    *label* in the admin UI (e.g. '0-150um', 'Nieuszkodzony') so the inverse
    lookup happens here before writing to Bitrix.
    """
    parts = path.split(".")
    root = parts[0]
    # Bitrix list-type fields don't clear on an empty string — they ignore it
    # and keep the previous enum id. Sending False (→ JSON false) actually
    # clears them. Without this, deleting a paint panel in the admin UI
    # cleared the DB but left the Bitrix enum stale; the report's DB-then-
    # Bitrix fall-through then served the old "0-150um" instead of "Brak
    # danych" (deal 1864 incident).
    if value in (None, "") and root == "paint" and len(parts) >= 3 and parts[2] == "value":
        return False
    if value in (None, ""):
        return ""
    str_v = str(value)
    # Paint: label → enum id.
    if root == "paint" and len(parts) >= 3 and parts[2] == "value":
        for enum_id, label in PAINT_ENUM_LABELS.items():
            if label == str_v:
                return enum_id
        return str_v
    # Overall condition lives under either vehicle.overall_condition or
    # bitrix_extras.overall_condition — both translate the same way.
    if parts[-1] == "overall_condition":
        for enum_id, label in OVERALL_CONDITION_LABELS.items():
            if label == str_v:
                return enum_id
        return str_v
    return value


# ─── Schema constants for structured-JSON sections (Phase 2) ─────────────────
# These are referenced by _build_schema (static sections cached at module
# load) and by _damage_schema(rec) (per-record damage slots, sized to the
# length of existing exterior/interior damage arrays).

_TAK_NIE_ND = ["", "TAK", "NIE", "ND"]

MECHANICAL_FIELDS = [
    ("engineCondition",      "Stan silnika"),
    ("engineOilLevel",       "Poziom oleju"),
    ("coolantLevel",         "Poziom płynu chłodniczego"),
    ("engineNoises",         "Odgłosy silnika"),
    ("engineSmoke",          "Dymienie silnika"),
    ("transmission",         "Skrzynia biegów"),
    ("clutch",               "Sprzęgło"),
    ("driveShaft",           "Wał napędowy"),
    ("frontSuspension",      "Zawieszenie przednie"),
    ("rearSuspension",       "Zawieszenie tylne"),
    ("shockAbsorbers",       "Amortyzatory"),
    ("frontBrakes",          "Hamulce przednie"),
    ("rearBrakes",           "Hamulce tylne"),
    ("handbrake",            "Hamulec ręczny"),
    ("steeringPlay",         "Luz układu kier."),
    ("steeringPump",         "Wspomaganie kier."),
    ("exhaustSystem",        "Układ wydechowy"),
    ("airConditioning",      "Klimatyzacja"),
    ("heatingSystem",        "Ogrzewanie"),
    ("electricalSystem",     "Instalacja elektryczna"),
    ("batteryCondition",     "Akumulator"),
    ("lightsAll",            "Oświetlenie"),
    ("wipers",               "Wycieraczki"),
    ("horn",                 "Klakson"),
    ("testDriveConducted",   "Jazda próbna przeprowadzona"),
]

TIRE_POSITIONS = [
    ("frontLeft",  "Przód lewy"),
    ("frontRight", "Przód prawy"),
    ("rearLeft",   "Tył lewy"),
    ("rearRight",  "Tył prawy"),
]
# 'type' enum reflects values actually stored in tires_json
# (verified from DB: 'summer' / 'winter' / 'all-season').
# 'treadDepth' is text — wizard stores it with a Polish comma decimal
# ('6,3'), which an HTML number input would reject.
# 'condition' is text — DB has no values populated; not actively used.
TIRE_TYPE_OPTIONS = ["", "summer", "winter", "all-season"]

# Exterior + interior damage locations — kept in lockstep with
# DamageMap.tsx EXTERIOR_COORDS / INTERIOR_COORDS so the marker plots.
DAMAGE_LOC_EXT = [
    "",
    "Maska / Pokrywa silnika", "Zderzak przedni", "Zderzak tylny",
    "Błotnik przedni lewy", "Błotnik przedni prawy",
    "Błotnik tylny lewy", "Błotnik tylny prawy",
    "Drzwi przednie lewe", "Drzwi przednie prawe",
    "Drzwi tylne lewe", "Drzwi tylne prawe",
    "Dach", "Klapa / Pokrywa bagażnika",
    "Próg lewy", "Próg prawy",
    "Lusterko lewe", "Lusterko prawe",
    "Szyba przednia", "Szyba tylna",
    "Szyba boczna lewa", "Szyba boczna prawa",
    "Reflektor przedni lewy", "Reflektor przedni prawy",
    "Lampa tylna lewa", "Lampa tylna prawa",
    "Felga przednia lewa", "Felga przednia prawa",
    "Felga tylna lewa", "Felga tylna prawa",
    "Inne",
]
DAMAGE_LOC_INT = [
    "",
    "Fotel kierowcy", "Fotel pasażera", "Kanapa tylna", "Zagłówki",
    "Deska rozdzielcza", "Konsola środkowa", "Kierownica",
    "Dźwignia zmiany biegów", "Podsufitka", "Wykładzina podłogowa",
    "Panel drzwi przednich lewych", "Panel drzwi przednich prawych",
    "Panel drzwi tylnych lewych", "Panel drzwi tylnych prawych",
    "Podłokietnik", "Schowek", "Lusterko wsteczne",
    "Osłony przeciwsłoneczne",
    "Pas bezpieczeństwa przód", "Pas bezpieczeństwa tył",
    "Bagażnik — wykładzina", "Bagażnik — ścianki",
    "Pedały", "Dywaniki", "Inne",
]
DAMAGE_TYPE_OPTIONS = [
    "",
    "Zarysowanie", "Wgniecenie", "Pęknięcie", "Odprysk",
    "Korozja / Rdza", "Uszkodzenie mechaniczne", "Zabrudzenie",
    "Brak elementu", "Odbarwienie", "Inne",
]
DAMAGE_ACTION_OPTIONS = [
    "",
    "Naprawa", "Wymiana", "Bez działania",
    "Polerowanie", "Lakierowanie", "Czyszczenie",
]

# Document-presence flags live inside notes_json. report.py reads them
# (registrationDocPresented, vehicleCardPresented, purchaseInvoicePresented,
# serviceBookPresented) to compute documents_check.
DOC_FIELDS = [
    ("registrationDocPresented", "Dowód rejestracyjny"),
    ("vehicleCardPresented",     "Karta pojazdu"),
    ("purchaseInvoicePresented", "Faktura zakupu"),
    ("serviceBookPresented",     "Książka serwisowa"),
]

EQUIP_FIELDS = [
    ("spareWheel",         "Koło zapasowe"),
    ("jackAndTools",       "Podnośnik i narzędzia"),
    ("triangular",         "Trójkąt ostrzegawczy"),
    ("firstAidKit",        "Apteczka"),
    ("fireExtinguisher",   "Gaśnica"),
    ("repairKit",          "Zestaw naprawczy"),
    ("ownerManual",        "Instrukcja obsługi"),
    ("registrationPlates", "Tablice rejestracyjne"),
    ("keys",               "Kluczyki"),
    ("wheelWrench",        "Klucz do kół"),
]


# ─── Schema builder ───────────────────────────────────────────────────────────

def _build_schema() -> Dict[str, Dict[str, Any]]:
    """Field schema consumed by the frontend editor."""
    schema: Dict[str, Dict[str, Any]] = {}

    # Vehicle — text + number + enum.
    schema["vehicle.vin"]                 = {"type": "text",   "label": "VIN"}
    schema["vehicle.make"]                = {"type": "text",   "label": "Marka"}
    schema["vehicle.model"]               = {"type": "text",   "label": "Model"}
    schema["vehicle.year"]                = {"type": "number", "label": "Rok produkcji", "min": 1900, "max": 2100}
    schema["vehicle.color"]               = {"type": "text",   "label": "Kolor"}
    schema["vehicle.engine_capacity_cc"]  = {"type": "number", "label": "Pojemność (cm³)", "min": 0}
    schema["vehicle.engine_power_hp"]     = {"type": "number", "label": "Moc (kW)", "min": 0}
    schema["vehicle.fuel_type"]           = {"type": "enum",   "label": "Rodzaj paliwa", "options": FUEL_TYPES}
    schema["vehicle.body_type"]           = {"type": "enum",   "label": "Rodzaj nadwozia", "options": BODY_TYPES}
    schema["vehicle.transmission"]        = {"type": "enum",   "label": "Skrzynia biegów", "options": GEARBOX_TYPES}
    schema["vehicle.drive_type"]          = {"type": "enum",   "label": "Napęd", "options": DRIVE_TYPES}
    schema["vehicle.registration_plate"]  = {"type": "text",   "label": "Numer rejestracyjny"}
    schema["vehicle.first_registration_date"] = {"type": "text", "label": "Data pierwszej rejestracji"}
    schema["vehicle.mileage"]             = {"type": "number", "label": "Przebieg", "min": 0}
    schema["vehicle.doors"]               = {"type": "number", "label": "Liczba drzwi", "min": 0, "max": 10}
    schema["vehicle.seats"]               = {"type": "number", "label": "Liczba miejsc", "min": 0, "max": 50}
    schema["vehicle.weight_kg"]           = {"type": "number", "label": "Masa własna (kg)", "min": 0}
    # Removed (no DB-side equivalent — writes were silently dropped):
    # vehicle.engine_power_kw, vehicle.owners_count, vehicle.paint_type,
    # vehicle.version, vehicle.overall_condition. The overall_condition value
    # is still editable via bitrix_extras.overall_condition below.

    # Paint — per-panel value enum. Schema path key stays English (paint.hood.value),
    # only the display label is Polish (matches inspector wizard naming).
    for panel in PAINT_PANEL_KEYS:
        schema[f"paint.{panel}.value"] = {
            "type": "enum",
            "label": PAINT_PANEL_LABELS_PL.get(panel, panel),
            "options": PAINT_OPTIONS,
        }

    # Bitrix extras (no DB column).
    for key in (
        "wyposazenie_standardowe", "wyposazenie_dodatkowe",
        "wyposazenie_specjalne", "czynniki_obnizajace",
        "komentarz_dane_pojazdu", "komentarz_wyposazenie",
        "komentarz_zdjecia", "komentarz_opony_lakier",
        "komentarz_uszkodzenia", "komentarz_silnik",
    ):
        schema[f"bitrix_extras.{key}"] = {"type": "text", "label": key}
    schema["bitrix_extras.overall_condition"] = {
        "type": "enum",
        "label": "Stan ogólny (Bitrix)",
        "options": [""] + list(OVERALL_CONDITION_LABELS.values()),
    }

    # Mechanical (mechanical_json) — TAK/NIE/ND enums + 2 free-text fields.
    for key, label in MECHANICAL_FIELDS:
        schema[f"mechanical.{key}"] = {"type": "enum", "label": label, "options": _TAK_NIE_ND}
    schema["mechanical.testDriveComment"]        = {"type": "text", "label": "Komentarz - jazda próbna"}
    schema["mechanical.testDriveImpossibleText"] = {"type": "text", "label": "Powód braku jazdy próbnej"}

    # Tires (tires_json — dict keyed by position: frontLeft/frontRight/
    # rearLeft/rearRight). 4 positions × 9 fields = 36 entries.
    for pos_key, pos_label in TIRE_POSITIONS:
        schema[f"tires.{pos_key}.brand"]       = {"type": "text", "label": f"{pos_label} — Marka"}
        schema[f"tires.{pos_key}.model"]       = {"type": "text", "label": f"{pos_label} — Model"}
        schema[f"tires.{pos_key}.size"]        = {"type": "text", "label": f"{pos_label} — Rozmiar"}
        schema[f"tires.{pos_key}.type"]        = {"type": "enum", "label": f"{pos_label} — Sezon", "options": TIRE_TYPE_OPTIONS}
        schema[f"tires.{pos_key}.treadDepth"]  = {"type": "text", "label": f"{pos_label} — Głębokość bieżnika (mm)"}
        schema[f"tires.{pos_key}.dot"]         = {"type": "text", "label": f"{pos_label} — DOT"}
        schema[f"tires.{pos_key}.loadIndex"]   = {"type": "text", "label": f"{pos_label} — Indeks nośności"}
        schema[f"tires.{pos_key}.speedIndex"]  = {"type": "text", "label": f"{pos_label} — Indeks prędkości"}
        schema[f"tires.{pos_key}.condition"]   = {"type": "text", "label": f"{pos_label} — Stan"}

    # Documents — flags stored in notes_json; consumed by report.py
    # documents_check (line 1072+). Edit via notes.{key}.
    for key, label in DOC_FIELDS:
        schema[f"notes.{key}"] = {"type": "enum", "label": f"Dokument — {label}", "options": _TAK_NIE_ND}

    # Equipment completeness (equipment_json).
    for key, label in EQUIP_FIELDS:
        schema[f"equipment.{key}"] = {"type": "enum", "label": f"Wyposażenie - {label}", "options": _TAK_NIE_ND}
    schema["equipment.keysCount"] = {"type": "number", "label": "Liczba kluczyków", "min": 1}

    # Notes free-text (notes_json).
    schema["notes.generalComments"] = {"type": "text", "label": "Uwagi ogólne"}
    schema["notes.valuationNotes"]  = {"type": "text", "label": "Uwagi do wyceny"}

    # Damage slots (exterior_damages / interior_damages arrays) are added
    # per-record by _damage_schema(rec) — slot count tracks len of the
    # existing damage arrays so the editor only renders rows that exist.
    # full_equipment_json (122 keys, photos) is deferred to a later phase.

    return schema


SCHEMA_CACHE = _build_schema()


def _strip_photos_recursive(obj: Any) -> Any:
    """Drop dict keys named exactly 'photos'/'photo' and string values
    longer than 1000 chars (inline base64 image payloads). Used to scrub
    the admin GET response so editable text/enum/number values come
    through while photo bytes stay out of the response."""
    if isinstance(obj, dict):
        return {
            k: _strip_photos_recursive(v)
            for k, v in obj.items()
            if k not in ("photos", "photo")
            and not (isinstance(v, str) and len(v) > 1000)
        }
    if isinstance(obj, list):
        return [_strip_photos_recursive(item) for item in obj]
    return obj


def _normalize_damage_entry(entry: Any) -> Any:
    """Strip photos, then surface legacy 'part' as 'location' if the entry
    doesn't already have a location set. READ-ONLY normalization for the
    GET response so the admin form's location dropdown pre-fills for older
    deals (where the wizard wrote 'part'). The DB blob is not modified;
    when the admin saves, _apply_change_to_json writes the 'location' key
    and report.py reads location first, so the new value wins everywhere."""
    entry = _strip_photos_recursive(entry)
    if isinstance(entry, dict):
        if not entry.get("location") and entry.get("part"):
            entry["location"] = entry["part"]
    return entry


def _damage_schema(rec: InspectionRecord) -> Dict[str, Dict[str, Any]]:
    """Per-record damage-slot schema entries; sized to len of existing
    exterior_damage_json / interior_damage_json arrays so the editor only
    surfaces rows that actually exist on the record."""
    out: Dict[str, Dict[str, Any]] = {}
    try:
        _ext = json.loads(rec.exterior_damage_json) if rec.exterior_damage_json else []
    except Exception:
        _ext = []
    try:
        _int = json.loads(rec.interior_damage_json) if rec.interior_damage_json else []
    except Exception:
        _int = []

    if isinstance(_ext, list):
        for i in range(len(_ext)):
            out[f"exterior_damages.{i}.location"]    = {"type": "enum", "label": f"E{i+1} — Lokalizacja", "options": DAMAGE_LOC_EXT}
            out[f"exterior_damages.{i}.type"]        = {"type": "enum", "label": f"E{i+1} — Typ",         "options": DAMAGE_TYPE_OPTIONS}
            out[f"exterior_damages.{i}.size"]        = {"type": "text", "label": f"E{i+1} — Rozmiar"}
            out[f"exterior_damages.{i}.description"] = {"type": "text", "label": f"E{i+1} — Opis"}
            out[f"exterior_damages.{i}.action"]      = {"type": "enum", "label": f"E{i+1} — Działanie",   "options": DAMAGE_ACTION_OPTIONS}
    if isinstance(_int, list):
        for i in range(len(_int)):
            out[f"interior_damages.{i}.location"]    = {"type": "enum", "label": f"I{i+1} — Lokalizacja", "options": DAMAGE_LOC_INT}
            out[f"interior_damages.{i}.type"]        = {"type": "enum", "label": f"I{i+1} — Typ",         "options": DAMAGE_TYPE_OPTIONS}
            out[f"interior_damages.{i}.size"]        = {"type": "text", "label": f"I{i+1} — Rozmiar"}
            out[f"interior_damages.{i}.description"] = {"type": "text", "label": f"I{i+1} — Opis"}
            out[f"interior_damages.{i}.action"]      = {"type": "enum", "label": f"I{i+1} — Działanie",   "options": DAMAGE_ACTION_OPTIONS}
    return out


def _schema_for_rec(rec: InspectionRecord) -> Dict[str, Dict[str, Any]]:
    """Static SCHEMA_CACHE merged with per-record damage slots."""
    return {**SCHEMA_CACHE, **_damage_schema(rec)}


# ─── Pydantic request models ──────────────────────────────────────────────────

class ChangeItem(BaseModel):
    path: str
    value: Any


class ChangeBatch(BaseModel):
    changes: List[ChangeItem]


# ─── Endpoint 1: list reports ─────────────────────────────────────────────────

@router.get("/admin/reports")
async def list_reports(
    request: Request,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _user: dict = Depends(require_admin),
):
    """List deals that have an InspectionRecord, newest first."""
    q = db.query(InspectionRecord)

    if search:
        s = search.strip()
        if s.isdigit():
            q = q.filter(InspectionRecord.deal_id == int(s))
        # else: title filtering happens after Bitrix enrichment below.

    total = q.count()
    rows = (
        q.order_by(desc(InspectionRecord.updated_at))
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    # Enrich with Bitrix titles (best-effort).
    deal_ids = [r.deal_id for r in rows]
    titles: Dict[int, str] = {}
    gateway = getattr(request.app.state, "gateway", None)
    if gateway and getattr(request.app.state, "bitrix_ready", False) and deal_ids:
        try:
            deals = await gateway.call("crm.deal.list", {
                "filter": {"ID": deal_ids},
                "select": ["ID", "TITLE"],
            })
            for d in deals or []:
                try:
                    titles[int(d.get("ID"))] = str(d.get("TITLE") or "")
                except (TypeError, ValueError):
                    continue
        except Exception as e:
            logger.warning(f"[admin_reports] Bitrix title fetch failed: {e}")

    def _has(v: Optional[str]) -> bool:
        return bool(v and v.strip() and v.strip() not in ("{}", "null"))

    items = []
    for r in rows:
        item = {
            "deal_id": r.deal_id,
            "title": titles.get(r.deal_id, ""),
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            "has_data": {
                "vehicle": _has(r.vehicle_json),
                "paint": _has(r.paint_json),
                "equipment": _has(r.equipment_json),
                "full_equipment": _has(r.full_equipment_json),
                "tires": _has(r.tires_json),
                "mechanical": _has(r.mechanical_json),
                "exterior_damages": _has(r.exterior_damage_json),
                "interior_damages": _has(r.interior_damage_json),
                "notes": _has(r.notes_json),
            },
        }
        # Post-enrichment title search.
        if search and not search.strip().isdigit():
            if search.lower() not in (item["title"] or "").lower():
                continue
        items.append(item)

    return {
        "items": items,
        "page": page,
        "limit": limit,
        "total": total,  # NB: when title search filters items, total still
                         # reflects DB count, not filtered count.
    }


# ─── Endpoint 2: edit-schema ──────────────────────────────────────────────────

def _load_json(raw: Optional[str], default: Any) -> Any:
    if not raw:
        return default
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.warning(f"[admin_reports] JSON decode failed for column blob (len={len(raw)})")
        return default


@router.get("/admin/reports/{deal_id}/edit")
async def get_report_edit(
    deal_id: int,
    request: Request,
    db: Session = Depends(get_db),
    _user: dict = Depends(require_admin),
):
    rec = db.query(InspectionRecord).filter(InspectionRecord.deal_id == deal_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail=f"No InspectionRecord for deal {deal_id}")

    # Bitrix extras — best-effort.
    title = ""
    bitrix_extras: Dict[str, Any] = {k: "" for k in BITRIX_EXTRAS_FIELDS}
    gateway = getattr(request.app.state, "gateway", None)
    if gateway and getattr(request.app.state, "bitrix_ready", False):
        try:
            deal = await gateway.call("crm.deal.get", {"id": deal_id})
            if isinstance(deal, dict):
                title = str(deal.get("TITLE") or "")
                for key, uf in BITRIX_EXTRAS_FIELDS.items():
                    v = deal.get(uf)
                    if v is None or isinstance(v, bool):
                        bitrix_extras[key] = ""
                    else:
                        bitrix_extras[key] = str(v)
        except Exception as e:
            logger.warning(f"[admin_reports] Bitrix fetch failed for deal {deal_id}: {e}")

    # Return vehicle / paint / bitrix_extras plus the structured-JSON
    # columns (mechanical / tires / damages / notes / equipment) for
    # pre-fill. Each blob is passed through _strip_photos_recursive to
    # drop 'photos' / 'photo' keys and any string value >1000 chars
    # (inline base64), so the response stays compact even for records
    # with full inspection photo payloads. Damage arrays additionally
    # go through _normalize_damage_entry so legacy rows that stored the
    # location as 'part' surface a 'location' key for form pre-fill.
    # full_equipment_json (122 keys plus photos) is deferred.
    _ext_raw = _load_json(rec.exterior_damage_json, [])
    _int_raw = _load_json(rec.interior_damage_json, [])
    return {
        "deal_id": deal_id,
        "title": title,
        # vehicle_json is stored with camelCase keys; expose them under the
        # snake_case schema paths so the form pre-fills correctly.
        "vehicle":          _vehicle_db_to_view(_load_json(rec.vehicle_json, {})),
        "paint":            _load_json(rec.paint_json, {}),
        "bitrix_extras":    bitrix_extras,
        "mechanical":       _strip_photos_recursive(_load_json(rec.mechanical_json, {})),
        "tires":            _strip_photos_recursive(_load_json(rec.tires_json, {})),
        "exterior_damages": [_normalize_damage_entry(x) for x in _ext_raw] if isinstance(_ext_raw, list) else [],
        "interior_damages": [_normalize_damage_entry(x) for x in _int_raw] if isinstance(_int_raw, list) else [],
        "notes":            _strip_photos_recursive(_load_json(rec.notes_json, {})),
        "equipment":        _strip_photos_recursive(_load_json(rec.equipment_json, {})),
        "schema":           _schema_for_rec(rec),
    }


# ─── Endpoint 3: apply changes ────────────────────────────────────────────────

@router.put("/admin/reports/{deal_id}")
async def update_report(
    deal_id: int,
    body: ChangeBatch,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    if not body.changes:
        raise HTTPException(status_code=400, detail="No changes supplied")

    rec = db.query(InspectionRecord).filter(InspectionRecord.deal_id == deal_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail=f"No InspectionRecord for deal {deal_id}")

    # 1) Validate every change first — reject the batch atomically on failure.
    # api_parts keeps the snake_case schema path (used for audit + Bitrix
    # mapping lookups); storage_parts is the camelCase-translated path used
    # for the JSON-column read/write. Schema is per-record (damage slots
    # size to the existing array length on this record).
    schema_for_rec = _schema_for_rec(rec)
    parsed: List[Tuple[str, List[str], List[str], Any]] = []
    for ch in body.changes:
        root, parts = _validate_path(ch.path)
        _validate_change(ch.path, ch.value, schema_for_rec.get(ch.path))
        parsed.append((root, parts, _to_storage_parts(parts), ch.value))

    # 2) Build per-column working copies of the affected JSON blobs.
    column_blobs: Dict[str, Any] = {}
    column_defaults: Dict[str, Any] = {}
    bitrix_payload: Dict[str, Any] = {}
    audit_rows: List[InspectionEdit] = []
    admin_name = str(current_user.get("name") or current_user.get("sub") or "Admin")

    for root, api_parts, storage_parts, value in parsed:
        api_path = ".".join(api_parts)
        # bitrix_extras paths skip DB entirely and only feed the Bitrix payload.
        if root == "bitrix_extras":
            uf = _get_bitrix_field_for_path(api_path)
            if not uf:
                raise HTTPException(
                    status_code=400,
                    detail=f"bitrix_extras key '{api_parts[1] if len(api_parts) > 1 else ''}' has no Bitrix mapping",
                )
            bitrix_payload[uf] = _value_to_bitrix(api_path, value)
            audit_rows.append(InspectionEdit(
                deal_id=deal_id,
                admin_username=admin_name,
                field_path=api_path,
                old_value=None,  # not fetched — Bitrix is the source of truth.
                new_value=json.dumps(value, ensure_ascii=False, default=str),
            ))
            continue

        column = JSON_COLUMN_BY_ROOT[root]
        if column not in column_blobs:
            raw = getattr(rec, column, None)
            default_container: Any = [] if root.endswith("_damages") else {}
            column_blobs[column] = _load_json(raw, default_container)
            column_defaults[column] = default_container

        # Read/write hit storage_parts (camelCase for vehicle.*, unchanged elsewhere).
        old_value = (
            _read_path(column_blobs[column], storage_parts)
            if len(storage_parts) > 1 else column_blobs[column]
        )
        column_blobs[column] = _apply_change_to_json(column_blobs[column], storage_parts, value)

        audit_rows.append(InspectionEdit(
            deal_id=deal_id,
            admin_username=admin_name,
            field_path=api_path,
            old_value=json.dumps(old_value, ensure_ascii=False, default=str),
            new_value=json.dumps(value, ensure_ascii=False, default=str),
        ))

        # Dual-write candidates — Bitrix field map keys off the snake_case API path.
        uf = _get_bitrix_field_for_path(api_path)
        if uf:
            bitrix_payload[uf] = _value_to_bitrix(api_path, value)

    # 3) Persist DB + audit in a single transaction.
    try:
        for column, blob in column_blobs.items():
            setattr(rec, column, json.dumps(blob, ensure_ascii=False))
        for row in audit_rows:
            db.add(row)
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"[admin_reports] DB write failed for deal {deal_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"DB write failed: {e}")

    # 4) Bitrix dual-write (best-effort — DB is authoritative).
    warnings: List[str] = []
    if bitrix_payload:
        gateway = getattr(request.app.state, "gateway", None)
        if gateway and getattr(request.app.state, "bitrix_ready", False):
            try:
                await gateway.call("crm.deal.update", {
                    "ID": deal_id,
                    "fields": bitrix_payload,
                })
            except Exception as e:
                msg = f"Bitrix update failed (DB write succeeded): {e}"
                logger.warning(f"[admin_reports] {msg}")
                warnings.append(msg)
        else:
            warnings.append("Bitrix not ready — DB updated, Bitrix not synced")

    return {
        "success": True,
        "deal_id": deal_id,
        "applied": len(parsed),
        "audit_rows": len(audit_rows),
        "bitrix_fields_synced": list(bitrix_payload.keys()),
        "warnings": warnings,
    }


# ─── Endpoint 4: parse standard equipment from a Wycena PDF ────────────────────

@router.post("/admin/reports/{deal_id}/parse-equipment")
async def parse_equipment(
    deal_id: int,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Extract the standard-equipment list from an uploaded Wycena PDF and
    write it to the Bitrix wyposazenie_standardowe field."""
    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="Empty file upload")

    try:
        items = parse_equipment_from_pdf(pdf_bytes)
    except Exception as e:
        logger.error(f"[admin_reports] equipment parse failed for deal {deal_id}: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"PDF parse failed: {e}")

    if not items:
        raise HTTPException(
            status_code=422,
            detail="No standard-equipment section found in the PDF",
        )

    warnings: List[str] = []

    # Write to Bitrix (multi-value string field — a list is the safe shape).
    uf = BITRIX_EXTRAS_FIELDS["wyposazenie_standardowe"]
    gateway = getattr(request.app.state, "gateway", None)
    if gateway and getattr(request.app.state, "bitrix_ready", False):
        try:
            await gateway.call("crm.deal.update", {
                "ID": deal_id,
                "fields": {uf: items},
            })
        except Exception as e:
            msg = f"Bitrix update failed (items parsed OK): {e}"
            logger.warning(f"[admin_reports] {msg}")
            warnings.append(msg)
    else:
        warnings.append("Bitrix not ready — items parsed but not written")

    # Audit log (best-effort — never block the response on a logging failure).
    admin_name = str(current_user.get("name") or current_user.get("sub") or "Admin")
    try:
        db.add(InspectionEdit(
            deal_id=deal_id,
            admin_username=admin_name,
            field_path="wyposazenie_standardowe.pdf_parse",
            old_value=None,
            new_value=json.dumps({"item_count": len(items)}, ensure_ascii=False),
        ))
        db.commit()
    except Exception as e:
        db.rollback()
        logger.warning(f"[admin_reports] equipment audit log failed for deal {deal_id}: {e}")
        warnings.append(f"Audit log failed: {e}")

    return {
        "success": True,
        "deal_id": deal_id,
        "count": len(items),
        "items": items,
        "preview": items[:10],
        "warnings": warnings,
    }
