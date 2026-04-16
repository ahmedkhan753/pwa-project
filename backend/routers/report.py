"""
Report Router
=============
Public endpoint: GET /api/report/{deal_id}
Returns structured vehicle inspection report data from Bitrix24.
No authentication required — designed for public sharing.
"""

import base64 as _b64
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
import httpx
from database import SessionLocal
from models.inspector import InspectionPhoto, InspectionRecord

router = APIRouter(tags=["report"])
logger = logging.getLogger("routers.report")


# ─── Bitrix field ID mappings (from mapping_overrides.json) ───────────────────

VEHICLE_FIELDS = {
    "vin":               "UF_CRM_1766057539531",
    "make":              "UF_CRM_1766057839684",
    "model":             "UF_CRM_1766057849818",
    "year":              "UF_CRM_1766057572300",
    "color":             "UF_CRM_1772534410706",
    "engine_capacity":   "UF_CRM_1772534081105",
    "engine_power":      "UF_CRM_1772534094039",
    "fuel_type":         "UF_CRM_1772534193",
    "body_type":         "UF_CRM_1772796562336",
    "transmission":      "UF_CRM_1772796772039",
    "drive_type":        "UF_CRM_1772534384484",
    "registration_plate":"UF_CRM_1766057515315",
    "first_registration":"UF_CRM_1771529218758",
    "mileage":           "UF_CRM_1772534309693",
    "doors":             "UF_CRM_1772536169528",
    "seats":             "UF_CRM_1772536182491",
    "weight":            "UF_CRM_1772536201847",
    "owners_count":      "UF_CRM_1772534418926",
    "overall_condition": "UF_CRM_1766057661321",
    "paint_type":        "UF_CRM_1772534426802",
    "version":           "UF_CRM_1766057961822",
}

# ─── Photo slot label lookup ─────────────────────────────────────────────────

PHOTO_LABELS: dict = {
    "photo_diag_front_left":      "Przekątna przednia lewa",
    "photo_front":                "Przód pojazdu",
    "photo_front_under":          "Podwozie przednie",
    "photo_diag_front_right":     "Przekątna przednia prawa",
    "photo_right_front":          "Prawa strona przód",
    "photo_right_rear":           "Prawa strona tył",
    "photo_diag_rear_right":      "Przekątna tylna prawa",
    "photo_rear":                 "Tył pojazdu",
    "photo_rear_under":           "Podwozie tylne",
    "photo_trunk_open":           "Otwarty bagażnik",
    "photo_spare_tire":           "Koło zapasowe",
    "photo_diag_rear_left":       "Przekątna tylna lewa",
    "photo_left_rear":            "Lewa strona tył",
    "photo_left_front":           "Lewa strona przód",
    "photo_door_left_front_open": "Otwarte lewe drzwi",
    "photo_left_side_door":       "Lewe drzwi boczne",
    "photo_dashboard_rear":       "Deska rozdzielcza (tył)",
    "photo_cockpit_center":       "Centralny kokpit",
    "photo_center_tunnel":        "Tunel centralny",
    "photo_rear_vent":            "Tylny nawiew centralny",
    "photo_steering_wheel":       "Kierownica",
    "photo_multimedia":           "Multimedia / kamera",
    "photo_odometer":             "Licznik przebiegu",
    "photo_navigation":           "Nawigacja",
    "photo_service_display":      "Wyświetlacz serwisowy",
    "photo_hood_open":            "Otwarta maska silnika",
    "photo_vin":                  "Numer VIN",
    "photo_nameplate":            "Tabliczka znamionowa",
    "photo_registration_doc":     "Dowód rejestracyjny + kluczyki",
    "photo_id_card_back":         "Dowód osobisty (tył)",
    "photo_owner_manual":         "Instrukcja obsługi",
    "photo_service_book":         "Książka serwisowa",
    "photo_other_docs":           "Inne dokumenty",
    "video_engine":               "Film z silnikiem",
}

BODY_SLOTS = {
    "photo_diag_front_left", "photo_front", "photo_front_under",
    "photo_diag_front_right", "photo_right_front", "photo_right_rear",
    "photo_diag_rear_right", "photo_rear", "photo_rear_under",
    "photo_trunk_open", "photo_spare_tire", "photo_diag_rear_left",
    "photo_left_rear", "photo_left_front", "photo_door_left_front_open",
    "photo_left_side_door",
}
INTERIOR_SLOTS = {
    "photo_dashboard_rear", "photo_cockpit_center", "photo_center_tunnel",
    "photo_rear_vent", "photo_steering_wheel", "photo_multimedia",
    "photo_odometer", "photo_navigation", "photo_service_display",
}
ENGINE_SLOTS = {"photo_hood_open", "photo_nameplate"}
DOCUMENT_SLOTS = {
    "photo_vin", "photo_registration_doc", "photo_id_card_back",
    "photo_owner_manual", "photo_service_book", "photo_other_docs",
}

# Standard photo fields — each maps to a Bitrix file field
PHOTO_FIELDS = {
    "photo_front":    ("Przód lewy",            "UF_CRM_1772612004048", 1),
    "photo_rear":     ("Tył lewy",               "UF_CRM_1772612079009", 2),
    "photo_left":     ("Bok lewy",               "UF_CRM_1772612134646", 3),
    "photo_right":    ("Bok prawy",              "UF_CRM_1772612050107", 4),
    "photo_interior": ("Wnętrze",               "UF_CRM_1772613474582", 5),
    "photo_dashboard":("Deska rozdzielcza",      "UF_CRM_1772612231675", 6),
    "photo_odometer": ("Licznik przebiegu",      "UF_CRM_1772612173468", 7),
    "photo_vin":      ("Tabliczka VIN / Docs",   "UF_CRM_1772612153446", 8),
}

PAINT_PANELS = [
    ("hood",         "Pokrywa silnika",      "UF_CRM_1772608834"),
    ("roof",         "Dach",                 "UF_CRM_1772610511"),
    ("trunk",        "Klapa tylna",          "UF_CRM_1772610306"),
    ("fender_fl",    "Błotnik przedni L",    "UF_CRM_1772609211"),
    ("fender_fr",    "Błotnik przedni P",    "UF_CRM_1772610496"),
    ("fender_rl",    "Błotnik tylny L",      "UF_CRM_1772610277"),
    ("fender_rr",    "Błotnik tylny P",      "UF_CRM_1772610341"),
    ("door_fl",      "Drzwi przednie L",     "UF_CRM_1772609231"),
    ("door_fr",      "Drzwi przednie P",     "UF_CRM_1772610483"),
    ("door_rl",      "Drzwi tylne L",        "UF_CRM_1772610262"),
    ("door_rr",      "Drzwi tylne P",        "UF_CRM_1772610362"),
    ("bumper_front", "Zderzak przedni",      "UF_CRM_1772608834"),
    ("bumper_rear",  "Zderzak tylny",        "UF_CRM_1772610306"),
    ("sill_left",    "Próg lewy",            "UF_CRM_1772610293"),
    ("sill_right",   "Próg prawy",           "UF_CRM_1772610320"),
]

TIRE_WHEELS = [
    ("fl", "Przednie lewe",  "UF_CRM_1772610816511", "UF_CRM_1772611012628", "UF_CRM_1772611049682"),
    ("fr", "Przednie prawe", "UF_CRM_1772611525863", "UF_CRM_1772611638595", "UF_CRM_1772611681119"),
    ("rl", "Tylne lewe",     "UF_CRM_1772611145640", "UF_CRM_1772611274637", "UF_CRM_1772611308379"),
    ("rr", "Tylne prawe",    "UF_CRM_1772611353212", "UF_CRM_1772611458789", "UF_CRM_1772611486777"),
]

# Exterior damage — up to 7 groups
DAMAGE_GROUPS = [
    ("UF_CRM_1772613182502", "UF_CRM_1772613247890"),
    ("UF_CRM_1772613355353", "UF_CRM_1772613406127"),
    ("UF_CRM_1772715276778", "UF_CRM_1772802047750"),
    ("UF_CRM_1772715537916", "UF_CRM_1772715584270"),
    ("UF_CRM_1772715645276", "UF_CRM_1772715705935"),
    ("UF_CRM_1772715772023", "UF_CRM_1772715826394"),
    ("UF_CRM_1772715893467", "UF_CRM_1772715939756"),
]

EQUIPMENT_LABEL_MAP = {
    "klimatyzacja": "Klimatyzacja",
    "klimatyzacja_auto": "Klimatyzacja automatyczna",
    "nawigacja": "Nawigacja GPS",
    "tempomat": "Tempomat",
    "kamera_cofania": "Kamera cofania",
    "czujniki_parkowania": "Czujniki parkowania tył",
    "czujniki_przod": "Czujniki parkowania przód",
    "podgrzewane_fotele": "Podgrzewane fotele",
    "wentylowane_fotele": "Wentylowane fotele",
    "elektr_szyby": "Elektryczne szyby",
    "dach_panoramiczny": "Dach panoramiczny",
    "szyberdach": "Szyberdach",
    "abs": "ABS",
    "esp": "ESP / DSC",
    "poduszki": "Poduszki powietrzne",
    "bluetooth": "Bluetooth",
    "usb": "USB",
    "bezkluczykowy": "Bezkluczykowy dostęp",
    "tapicerka_skora": "Tapicerka skórzana",
    "felgi_alu": "Felgi aluminiowe",
    "swiatla_led": "Światła LED",
    "swiatla_ksenon": "Światła Ksenon/HID",
    "swiatla_bi_xenon": "Bi-Xenon",
    "immobilizer": "Immobilizer",
    "centralny_zamek": "Centralny zamek",
    "lusterka_elektr": "Lusterka elektryczne",
    "podgrzewana_przednia": "Podgrzewana szyba przednia",
    "kolo_zapasowe": "Koło zapasowe",
    "apteczka": "Apteczka",
    "gaśnica": "Gaśnica",
    "kamizelka": "Kamizelka odblaskowa",
    "hak_holowniczy": "Hak holowniczy",
    "multimedialny": "System multimedialny",
    "asystent_pasa": "Asystent pasa ruchu",
    "asystent_parkowania": "Asystent parkowania",
    "head_up": "Head-Up Display",
    "skretne_swiatla": "Skrętne światła",
    "adaptacyjny_tempomat": "Adaptacyjny tempomat",
}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _safe_str(v: Any) -> str:
    if v is None:
        return ""
    s = str(v).strip()
    return "" if s in ("0", "None", "null", "false", "False") else s


def _safe_float(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(str(v).replace(",", ".").strip())
    except (TypeError, ValueError):
        return None


def _extract_file_urls(field_value: Any, auth_token: str, base_domain: str) -> List[str]:
    """
    Extract downloadable file URLs from a Bitrix24 file field value.
    Handles: None, string, dict, list of dicts.
    Appends auth token if needed.
    """
    if not field_value:
        return []

    urls = []
    items = field_value if isinstance(field_value, list) else [field_value]

    for item in items:
        url = ""
        if isinstance(item, dict):
            url = (
                item.get("urlDownload") or
                item.get("downloadUrl") or
                item.get("DOWNLOAD_URL") or
                item.get("url") or
                item.get("URL") or
                ""
            )
            if url and not url.startswith("http"):
                url = f"{base_domain}{url}"
        elif isinstance(item, str) and item.startswith("http"):
            url = item

        if url:
            import re as _re
            if auth_token:
                # Replace empty auth= or append if missing
                if _re.search(r'auth=(&|$)', url):
                    url = _re.sub(r'auth=(&|$)', f'auth={auth_token}\\1', url)
                elif 'auth=' not in url:
                    sep = "&" if "?" in url else "?"
                    url = f"{url}{sep}auth={auth_token}"
            urls.append(url)

    return urls


def _paint_status(value_um: float) -> str:
    if value_um <= 0:
        return "unknown"
    if value_um <= 150:
        return "factory"    # green
    if value_um <= 300:
        return "repainted"  # yellow
    return "repair"         # red


def _tire_status(tread_mm: Optional[float]) -> str:
    if tread_mm is None:
        return "unknown"
    if tread_mm >= 4.0:
        return "good"
    if tread_mm >= 1.6:
        return "warn"
    return "danger"


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@router.get("/report/{deal_id}")
async def get_report(deal_id: int, request: Request):
    """
    GET /api/report/{deal_id}
    Public — no authentication required.
    Fetches Bitrix24 deal and returns structured report JSON.
    """
    gateway = request.app.state.gateway
    bitrix_ready = getattr(request.app.state, "bitrix_ready", False)

    # ── Step 1: Try Bitrix (non-fatal — DB is the fallback) ──────────────
    raw: dict = {}
    if bitrix_ready:
        try:
            _fetched = await gateway.call("crm.deal.get", {"ID": deal_id, "select": ["*", "UF_*"]})
            if _fetched:
                raw = _fetched
                logger.info(f"[Report] Fetched deal {deal_id} from Bitrix — {len(raw)} fields")
        except Exception as e:
            logger.warning(f"[Report] Bitrix unavailable for deal {deal_id}: {e} — trying DB fallback")
    else:
        logger.warning(f"[Report] Bitrix not ready — using DB-only for deal {deal_id}")

    # ── Step 2: Load InspectionRecord early (needed for 404 check + vehicle fallback) ──
    insp_rec_equipment: dict = {}
    insp_rec_full_eq: dict = {}
    insp_rec_ext_damages: list = []
    insp_rec_int_damages: list = []
    insp_rec_notes: dict = {}
    insp_rec_vehicle: dict = {}
    insp_rec_tires: dict = {}
    insp_rec_mechanical: dict = {}
    _rec = None

    try:
        _db_rec = SessionLocal()
        _rec = _db_rec.query(InspectionRecord).filter(InspectionRecord.deal_id == deal_id).first()
        if _rec:
            def _jload(s):
                try:
                    return json.loads(s) if s else {}
                except Exception:
                    return {}
            def _jload_list(s):
                try:
                    v = json.loads(s) if s else []
                    return v if isinstance(v, list) else []
                except Exception:
                    return []
            insp_rec_equipment   = _jload(_rec.equipment_json)
            insp_rec_full_eq     = _jload(_rec.full_equipment_json)
            insp_rec_ext_damages = _jload_list(_rec.exterior_damage_json)
            insp_rec_int_damages = _jload_list(_rec.interior_damage_json)
            insp_rec_notes       = _jload(_rec.notes_json)
            insp_rec_vehicle     = _jload(_rec.vehicle_json)
            insp_rec_tires       = _jload(_rec.tires_json)
            insp_rec_mechanical  = _jload(_rec.mechanical_json)
            logger.info(f"[Report] InspectionRecord found for deal {deal_id}")
        else:
            logger.warning(f"[Report] No InspectionRecord in DB for deal {deal_id}")
    except Exception as rec_err:
        logger.warning(f"[Report] Could not load InspectionRecord: {rec_err}")
    finally:
        try:
            _db_rec.close()
        except Exception:
            pass

    # ── Step 3: If NEITHER Bitrix NOR DB has the deal → genuine 404 ───────
    if not raw and not _rec:
        raise HTTPException(
            status_code=404,
            detail=f"Zlecenie #{deal_id} nie istnieje lub nie jest dostępne",
        )

    # Auth token for Bitrix file URLs
    auth_token = ""
    base_domain = "https://b24-05xr3e.bitrix24.pl"
    try:
        parts = gateway.webhook_url.rstrip("/").split("/")
        auth_token = parts[-1]
        base_domain = gateway.webhook_url.split("/rest/")[0]
    except Exception:
        pass

    def _f(key: str) -> str:
        return _safe_str(raw.get(VEHICLE_FIELDS.get(key, ""), ""))

    # ── Vehicle ───────────────────────────────────────────────────────────
    vehicle = {
        "vin":                   _f("vin"),
        "make":                  _f("make"),
        "model":                 _f("model"),
        "year":                  _f("year"),
        "color":                 _f("color"),
        "engine_capacity_cc":    _f("engine_capacity"),
        "engine_power_hp":       _f("engine_power"),
        "engine_power_kw":       str(round(float(_f("engine_power")) / 1.341)) if _f("engine_power").replace('.','',1).isdigit() else "",
        "fuel_type":             _f("fuel_type"),
        "body_type":             _f("body_type"),
        "transmission":          _f("transmission"),
        "drive_type":            _f("drive_type"),
        "registration_plate":    _f("registration_plate"),
        "first_registration_date": _f("first_registration"),
        "mileage":               _f("mileage"),
        "mileage_unit":          "km",
        "doors":                 _f("doors"),
        "seats":                 _f("seats"),
        "weight_kg":             _f("weight"),
        "owners_count":          _f("owners_count"),
        "overall_condition":     _f("overall_condition"),
        "paint_type":            _f("paint_type"),
        "version":               _f("version"),
    }

    # ── Vehicle field reconciliation with InspectionRecord ──────────────
    #
    # Bitrix returns enum fields (fuel_type, body_type, transmission, drive_type)
    # as numeric item IDs (e.g. "316") rather than human labels. The frontend
    # InspectionRecord stores the original dropdown labels (e.g. "Benzyna"), so
    # for enum fields we PREFER the DB record over Bitrix. For all other fields
    # we fall back to DB only when Bitrix is empty.
    if insp_rec_vehicle:
        iv = insp_rec_vehicle
        bi = iv.get("basicInfo") or {}
        _fallbacks = {
            "vin":                     _safe_str(iv.get("vin")),
            "make":                    _safe_str(iv.get("make")),
            "model":                   _safe_str(iv.get("model")),
            "year":                    _safe_str(iv.get("year")),
            "color":                   _safe_str(iv.get("color")),
            "engine_capacity_cc":      _safe_str(iv.get("engineCapacity")),
            "engine_power_hp":         _safe_str(iv.get("enginePower")),
            "fuel_type":               _safe_str(iv.get("fuelType")),
            "body_type":               _safe_str(iv.get("bodyType")),
            "transmission":            _safe_str(iv.get("gearboxType")),
            "drive_type":              _safe_str(iv.get("driveType")),
            "registration_plate":      _safe_str(iv.get("registrationPlates")),
            "first_registration_date": _safe_str(iv.get("firstRegistration")),
            "mileage":                 _safe_str(iv.get("mileage")),
        }
        # Enum fields where DB record (label) takes priority over Bitrix (numeric ID)
        _prefer_db = {"fuel_type", "body_type", "transmission", "drive_type"}
        for k, v in _fallbacks.items():
            if k in _prefer_db:
                if v:                           # DB has a value → use it
                    vehicle[k] = v
            else:
                if not vehicle.get(k) and v:    # Bitrix empty → fall back to DB
                    vehicle[k] = v
        # Recompute kw if hp was filled from DB
        if vehicle.get("engine_power_hp") and not vehicle.get("engine_power_kw"):
            _hp = str(vehicle["engine_power_hp"])
            if _hp.replace(".", "", 1).isdigit():
                vehicle["engine_power_kw"] = str(round(float(_hp) / 1.341))

    # ── Photos ────────────────────────────────────────────────────────────
    # Primary source: DB (InspectionPhoto) for new-style submissions.
    # Fallback: Bitrix file fields (older 8-slot submissions).
    photos_standard:  List[dict] = []
    photos_body:      List[dict] = []
    photos_interior:  List[dict] = []
    photos_engine:    List[dict] = []
    photos_documents: List[dict] = []
    photos_damages:   List[dict] = []
    hero_photo_url: Optional[str] = None

    try:
        _db = SessionLocal()
        db_rows = _db.query(InspectionPhoto).filter(
            InspectionPhoto.deal_id == deal_id
        ).order_by(InspectionPhoto.id).all()
        pos = 1
        for row in db_rows:
            if row.slot_id.startswith("video_"):
                continue
            try:
                uri = "data:image/jpeg;base64," + _b64.b64encode(row.photo_bytes).decode()
                if hero_photo_url is None and row.slot_id in BODY_SLOTS:
                    hero_photo_url = uri
                label = PHOTO_LABELS.get(row.slot_id, row.slot_id.replace("_", " ").title())
                photo = {"label": label, "url": uri, "position": pos}
                pos += 1

                if row.slot_id in BODY_SLOTS:
                    photos_body.append(photo)
                    photos_standard.append(photo)          # section 03 = exterior overview
                elif row.slot_id in INTERIOR_SLOTS:
                    photos_interior.append(photo)
                elif row.slot_id in ENGINE_SLOTS:
                    photos_engine.append(photo)
                elif row.slot_id in DOCUMENT_SLOTS:
                    photos_documents.append(photo)
                elif row.slot_id.startswith("photo_optional_"):
                    photos_damages.append(photo)
                else:
                    photos_standard.append(photo)          # uncategorized → standard
            except Exception:
                pass
        # If no exterior shots, pick any photo for hero
        if hero_photo_url is None and photos_standard:
            hero_photo_url = photos_standard[0]["url"]
        if hero_photo_url is None and photos_interior:
            hero_photo_url = photos_interior[0]["url"]
    except Exception as db_err:
        logger.warning(f"[Report] Could not load photos from DB: {db_err}")
    finally:
        try:
            _db.close()
        except Exception:
            pass

    # Fallback: Bitrix fields (older submissions without DB photos)
    if not photos_standard and not photos_body:
        for key, (label, field_id, pos_idx) in PHOTO_FIELDS.items():
            urls = _extract_file_urls(raw.get(field_id), auth_token, base_domain)
            url = urls[0] if urls else None
            if url and hero_photo_url is None:
                hero_photo_url = url
            photos_standard.append({"label": label, "url": url, "position": pos_idx})

    # ── Paint measurements ────────────────────────────────────────────────
    paint_measurements = []
    repaint_count = 0

    for idx, (key, label, field_id) in enumerate(PAINT_PANELS, 1):
        val = _safe_float(raw.get(field_id))
        if val and val > 0:
            status = _paint_status(val)
            if status in ("repainted", "repair"):
                repaint_count += 1
            paint_measurements.append({
                "point": idx,
                "key": key,
                "name": label,
                "value_um": val,
                "status": status,
            })

    tires: List[dict] = []   # populated later with InspectionRecord depth enrichment

    # InspectionRecord already loaded above (Steps 2-3) — no second query needed.

    # ── Damages (exterior) — DB record first, then Bitrix ────────────────
    damages = []

    def _parse_damage_list(lst: list) -> list:
        out = []
        for i, d in enumerate(lst, 1):
            if not isinstance(d, dict):
                continue
            t   = _safe_str(d.get("type") or d.get("damageType") or d.get("rodzaj") or "")
            loc = _safe_str(d.get("location") or d.get("part") or d.get("element") or d.get("miejsce") or "")
            out.append({
                "index":       i,
                "type":        t,
                "location":    loc,
                "size":        _safe_str(d.get("size") or d.get("rozmiar") or ""),
                "severity":    _safe_str(d.get("severity") or "cosmetic"),
                "description": _safe_str(d.get("description") or d.get("notes") or d.get("opis") or ""),
            })
        return out

    if insp_rec_ext_damages:
        damages = _parse_damage_list(insp_rec_ext_damages)
    else:
        # Fallback: Bitrix JSON field
        ext_json = _safe_str(raw.get("UF_CRM_1772613182502"))
        if ext_json and ext_json.startswith("["):
            try:
                parsed = json.loads(ext_json)
                if isinstance(parsed, list):
                    damages = _parse_damage_list(parsed)
            except (json.JSONDecodeError, TypeError):
                pass
        # Last resort: individual damage group fields
        if not damages:
            for i, (type_field, desc_field) in enumerate(DAMAGE_GROUPS, 1):
                dmg_type = _safe_str(raw.get(type_field))
                dmg_desc = _safe_str(raw.get(desc_field))
                if dmg_type or dmg_desc:
                    damages.append({
                        "index": i, "type": dmg_type, "location": "",
                        "size": "", "severity": "cosmetic", "description": dmg_desc,
                    })

    # ── Interior damages — DB record only ────────────────────────────────
    interior_damages = _parse_damage_list(insp_rec_int_damages) if insp_rec_int_damages else []

    cosmetic_count   = sum(1 for d in damages if d.get("severity") in ("cosmetic", ""))
    structural_count = sum(1 for d in damages if d.get("severity") == "structural")

    # ── Tires — prefer InspectionRecord tread_depth if available ─────────
    def _tv(v: Any) -> str:
        """Normalise ToggleValue to a human-readable string."""
        if v is None:
            return ""
        s = str(v).strip()
        return s if s not in ("null", "None") else ""

    # Enrich Bitrix tire data with brand/size/depth/type from InspectionRecord
    # The DB record stores per-wheel dicts with: brand, size, treadDepth, type, etc.
    tire_from_rec: dict = {}
    if insp_rec_tires and isinstance(insp_rec_tires, dict):
        for wk, wd in insp_rec_tires.items():
            # wk: frontLeft | frontRight | rearLeft | rearRight
            code = {"frontLeft": "fl", "frontRight": "fr", "rearLeft": "rl", "rearRight": "rr"}.get(wk)
            if code and isinstance(wd, dict):
                tire_from_rec[code] = {
                    "brand":     _safe_str(wd.get("brand") or wd.get("manufacturer")),
                    "size":      _safe_str(wd.get("size") or wd.get("dimension")),
                    "type":      _safe_str(wd.get("type") or wd.get("season")),
                    "tread":     _safe_float(wd.get("treadDepth") or wd.get("tread") or wd.get("depth")),
                }

    for code, position, brand_field, size_field, type_field in TIRE_WHEELS:
        # Bitrix first
        brand = _safe_str(raw.get(brand_field))
        size  = _safe_str(raw.get(size_field))
        type_ = _safe_str(raw.get(type_field))
        depth = _safe_float(raw.get(size_field))

        # Overlay with DB record (DB takes priority for any fields it has)
        rec = tire_from_rec.get(code) or {}
        if rec.get("brand"): brand = rec["brand"]
        if rec.get("size"):  size  = rec["size"]
        if rec.get("type"):  type_ = rec["type"]
        if rec.get("tread"): depth = rec["tread"]

        # Last resort: parse depth from size string ("205/55 R16 4.5mm")
        if size and not depth:
            import re
            m = re.search(r'(\d+(?:[.,]\d+)?)\s*mm', size, re.IGNORECASE)
            if m:
                depth = _safe_float(m.group(1))

        if brand or size or depth:
            tires.append({
                "position": position, "code": code,
                "brand": brand, "size": size, "type": type_,
                "tread_mm": depth, "status": _tire_status(depth),
            })

    # ── Equipment — DB record (fullEquipment) ─────────────────────────────
    FULL_EQ_LABELS = {
        "abs": "ABS", "esp": "ESP / DSC",
        "airbagDriver": "Poduszka kierowcy", "airbagPassenger": "Poduszka pasażera",
        "airbagSide": "Poduszki boczne", "airbagCurtain": "Poduszki kurtynowe",
        "tractionControl": "Kontrola trakcji",
        "airConditioning": "Klimatyzacja", "automaticAC": "Klimatyzacja automatyczna",
        "heatedSeats": "Podgrzewane fotele", "electricWindows": "Elektryczne szyby",
        "electricMirrors": "Lusterka elektryczne", "heatedMirrors": "Podgrzewane lusterka",
        "powerSteering": "Wspomaganie kierownicy", "cruiseControl": "Tempomat",
        "parkingSensors": "Czujniki parkowania", "rearCamera": "Kamera cofania",
        "rainSensors": "Czujniki deszczu", "lightSensors": "Czujniki światła",
        "centralLocking": "Centralny zamek", "keylessEntry": "Bezkluczykowy dostęp",
        "startStop": "System Start/Stop",
        "navigation": "Nawigacja GPS", "bluetooth": "Bluetooth",
        "usb": "USB", "multimediaScreen": "Ekran multimedialny",
        "soundSystem": "System audio", "onboardComputer": "Komputer pokładowy",
        "ledLights": "Światła LED", "xenonLights": "Światła Ksenon",
        "fogLights": "Światła przeciwmgłowe", "roofRails": "Relingi dachowe",
        "sunroof": "Szyberdach", "panoramicRoof": "Dach panoramiczny",
        "towBar": "Hak holowniczy", "alloyWheels": "Felgi aluminiowe",
        "tintedWindows": "Przyciemniane szyby",
    }

    equipment = []
    if insp_rec_full_eq:
        for key, label in FULL_EQ_LABELS.items():
            val = insp_rec_full_eq.get(key)
            if val in ("TAK", "true", True, 1, "1"):
                equipment.append({"name": label, "present": True})
            elif val in ("NIE", "false", False, 0, "0"):
                equipment.append({"name": label, "present": False})
    else:
        # Fallback: Bitrix JSON equipment field
        equip_raw = raw.get("UF_CRM_1772535073217")
        if equip_raw and isinstance(equip_raw, str) and equip_raw.startswith("{"):
            try:
                equip_data = json.loads(equip_raw)
                for key, name in EQUIPMENT_LABEL_MAP.items():
                    val = equip_data.get(key)
                    if val is not None:
                        equipment.append({"name": name, "present": bool(val) and val not in ("0", "false", "Nie")})
            except (json.JSONDecodeError, TypeError):
                pass

    # ── Documents check — DB record (equipmentCompleteness) ──────────────
    DOC_CHECK_LABELS = {
        "registrationDocPresented": "Dowód rejestracyjny",
        "vehicleCardPresented":     "Karta pojazdu",
        "purchaseInvoicePresented": "Faktura zakupu",
        "serviceBookPresented":     "Książka serwisowa",
        "antiTheftSystem":          "System antykradzieżowy",
        "immobilizerWorking":       "Immobilizer sprawny",
        "keysCount":                None,   # numeric — skip as present/absent
        "spareWheel":               "Koło zapasowe",
        "jackAndTools":             "Podnośnik i narzędzia",
        "triangular":               "Trójkąt ostrzegawczy",
        "firstAidKit":              "Apteczka",
        "fireExtinguisher":         "Gaśnica",
        "repairKit":                "Zestaw naprawczy",
        "ownerManual":              "Instrukcja obsługi",
        "registrationPlates":       "Tablice rejestracyjne",
        "keys":                     "Kluczyki",
        "airConditioningWorking":   "Klimatyzacja sprawna",
        "wheelWrench":              "Klucz do kół",
        "navigationCardWorking":    "Nawigacja (karta) sprawna",
        "vinMatchesDocs":           "VIN zgodny z dokumentami",
        "chargingCables":           "Kable do ładowania",
        "tractionBatteryChargingCable": "Przewód ładowania baterii",
        "tractionBatteryChargingStation": "Stacja ładowania baterii",
    }

    documents_check = []
    if insp_rec_equipment:
        for key, label in DOC_CHECK_LABELS.items():
            if label is None:
                continue
            val = insp_rec_equipment.get(key)
            if val is None:
                continue
            s = str(val).strip().upper()
            if s in ("TAK", "TRUE", "1"):
                documents_check.append({"name": label, "status": "Tak", "status_type": "green"})
            elif s in ("NIE", "FALSE", "0"):
                documents_check.append({"name": label, "status": "Nie", "status_type": "red"})
            elif s == "ELEKTRONICZNA":
                documents_check.append({"name": label, "status": "Elektroniczna", "status_type": "blue"})
    else:
        # Fallback: Bitrix individual fields
        reg_cert = _safe_str(raw.get("UF_CRM_1772533732089"))
        if reg_cert:
            ok = reg_cert.lower() not in ("0", "nie", "brak", "no")
            documents_check.append({"name": "Dowód rejestracyjny", "status": "Tak" if ok else "Brak", "status_type": "green" if ok else "red"})
        insurance = _safe_str(raw.get("UF_CRM_1772534289878"))
        if insurance:
            ok = insurance.lower() not in ("0", "nie", "brak", "no")
            documents_check.append({"name": "Polisa ubezpieczenia", "status": "Tak" if ok else "Brak", "status_type": "green" if ok else "red"})

    # ── Mechanical — DB record first ──────────────────────────────────────
    mechanical: dict = insp_rec_mechanical if insp_rec_mechanical else {}
    if not mechanical:
        mech_raw = raw.get("UF_CRM_1772613597958")
        if mech_raw and isinstance(mech_raw, str) and mech_raw.startswith("{"):
            try:
                mechanical = json.loads(mech_raw)
            except (json.JSONDecodeError, TypeError):
                mechanical = {}
        elif isinstance(mech_raw, dict):
            mechanical = mech_raw

    warning_lights = _safe_str(raw.get("UF_CRM_1772613819989")) or _safe_str(mechanical.get("warningLights"))
    ac_raw = mechanical.get("acWorking")

    # ── Notes — DB record first ───────────────────────────────────────────
    notes_from_rec = ""
    if insp_rec_notes:
        notes_from_rec = (
            _safe_str(insp_rec_notes.get("generalComments")) or
            _safe_str(insp_rec_notes.get("valuationNotes")) or
            _safe_str(insp_rec_notes.get("marketComparison")) or ""
        )
    notes = (
        notes_from_rec or
        _safe_str(raw.get("UF_CRM_1772614097532")) or
        _safe_str(raw.get("UF_CRM_1772798881993")) or
        _safe_str(raw.get("COMMENTS"))
    )

    # ── Signatures ────────────────────────────────────────────────────────
    sig_appraiser_urls = _extract_file_urls(raw.get("UF_CRM_1772801573"), auth_token, base_domain)
    sig_client_urls    = _extract_file_urls(raw.get("UF_CRM_1772190199297"), auth_token, base_domain)

    # ── Attached PDF reports (CEPIK + damage history) ─────────────────────
    cepik_urls   = _extract_file_urls(raw.get("UF_CRM_1775497237180"), auth_token, base_domain)
    damage_urls  = _extract_file_urls(raw.get("UF_CRM_1775497290806"), auth_token, base_domain)

    # ── Inspector info ────────────────────────────────────────────────────
    inspector_name  = _safe_str(raw.get("UF_CRM_1771579888"))
    inspector_phone = _safe_str(raw.get("UF_CRM_1773961369947"))

    # DB fallback: use inspector name from InspectionRecord if Bitrix is empty
    if not inspector_name and insp_rec_vehicle:
        inspector_name = _safe_str((insp_rec_vehicle.get("basicInfo") or {}).get("inspectorName"))

    if inspector_name and inspector_name.isdigit():
        try:
            from models.inspector import Inspector as InspectorModel
            _db3 = SessionLocal()
            try:
                inspector_obj = _db3.query(InspectorModel).filter(InspectorModel.is_active == True).first()
                if inspector_obj:
                    inspector_name = inspector_obj.name
                    if not inspector_phone:
                        inspector_phone = inspector_obj.phone
            finally:
                _db3.close()
        except Exception:
            pass

    # ── Inspection date, place, company ───────────────────────────────────
    _bi = (insp_rec_vehicle.get("basicInfo") or {}) if insp_rec_vehicle else {}
    inspection_date  = (_safe_str(raw.get("UF_CRM_1772108256983")) or
                        _safe_str(raw.get("BEGINDATE")) or
                        _safe_str(raw.get("DATE_CREATE")) or
                        _safe_str(_bi.get("inspectionDate")))
    inspection_place = (_safe_str(raw.get("UF_CRM_1766058185504")) or
                        _safe_str(raw.get("UF_CRM_1766058194337")) or
                        _safe_str(_bi.get("inspectionPlace")))
    company_name     = _safe_str(raw.get("UF_CRM_1766057964319")) or _safe_str(_bi.get("companyName"))
    client_name      = _safe_str(raw.get("UF_CRM_1766057941327")) or _safe_str(_bi.get("userOwner"))
    order_title      = _safe_str(raw.get("TITLE")) or f"Inspekcja #{deal_id}"

    # ── Build & return ────────────────────────────────────────────────────
    return {
        "deal_id":         deal_id,
        "report_url":      f"https://app.zaufajrzeczoznawcy.pl/report/{deal_id}",
        "generated_at":    datetime.now(timezone.utc).isoformat(),
        "title":           order_title,
        "company_name":    company_name,
        "client_name":     client_name,
        "inspection_date": inspection_date,
        "inspection_place":inspection_place,
        "inspector_name":  inspector_name,

        "vehicle":        vehicle,
        "hero_photo_url": hero_photo_url,

        "quick_stats": {
            "year":         vehicle["year"],
            "fuel":         vehicle["fuel_type"],
            "power":        f"{vehicle['engine_power_hp']} KM" if vehicle["engine_power_hp"] else "",
            "transmission": vehicle["transmission"],
            "mileage":      f"{vehicle['mileage']} km" if vehicle["mileage"] else "",
        },

        "damage_summary": {
            "cosmetic":   cosmetic_count,
            "structural": structural_count,
            "bodywork":   repaint_count,
        },

        "photos": {
            "standard":  photos_standard,
            "body":      photos_body,
            "interior":  photos_interior,
            "engine":    photos_engine,
            "documents": photos_documents,
            "damages":   photos_damages,
        },

        "paint_measurements": paint_measurements,
        "tires":              tires,
        "damages":            damages,
        "interior_damages":   interior_damages,
        "equipment":          equipment,
        "documents_check":    documents_check,

        "mechanical": {
            "warning_lights": warning_lights,
            "ac_working":     ac_raw,
            **(
                {k: v for k, v in mechanical.items()
                 if isinstance(v, (str, bool, int, float)) and k not in ("warningLights", "acWorking")}
            ),
        },

        "notes": notes,

        "signatures": {
            "inspector": {
                "name":          inspector_name,
                "signature_url": sig_appraiser_urls[0] if sig_appraiser_urls else None,
            },
            "client": {
                "name":          client_name,
                "signature_url": sig_client_urls[0] if sig_client_urls else None,
            },
        },

        "inspector": {"name": inspector_name, "phone": inspector_phone},
        "client":    {"name": client_name, "company": company_name,
                      "phone": _safe_str(raw.get("UF_CRM_1766058053224"))},

        "attached_reports": {
            "cepik_url":          cepik_urls[0] if cepik_urls else None,
            "damage_history_url": damage_urls[0] if damage_urls else None,
            "has_cepik":          bool(cepik_urls),
            "has_damage_history": bool(damage_urls),
        },
    }


# ─── Protokół Wycena (appraisal) PDF ──────────────────────────────────────────

@router.get("/protokol/{deal_id}/pdf")
async def get_protokol_wycena_pdf(deal_id: int, request: Request):
    """
    GET /api/protokol/{deal_id}/pdf
    Public — no authentication required.
    Returns the Protokół Wycena (text-only appraisal) PDF for the given deal.

    Data comes from the same pipeline as the public Condition Report
    (get_report above): Bitrix24 with a DB fallback via InspectionRecord.
    """
    from io import BytesIO
    from services.protokol_wycena_pdf import build_protokol_wycena_pdf

    report_payload = await get_report(deal_id, request)
    pdf_bytes = build_protokol_wycena_pdf(report_payload)

    filename = f"protokol_wycena_{deal_id}.pdf"
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(pdf_bytes)),
            "Cache-Control": "no-store",
        },
    )


# ─── Document upload / download endpoints ─────────────────────────────────────
# Bitrix24 CRM file fields cannot be downloaded via webhooks (requires OAuth).
# Instead, we store PDFs on our server and serve them directly.

import os
from pathlib import Path
from fastapi import UploadFile, File

DOCS_DIR = Path("/app/data/report_docs")
DOCS_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_DOC_TYPES = {"cepik", "damage_history"}


def _doc_path(deal_id: int, doc_type: str) -> Path:
    return DOCS_DIR / f"{deal_id}_{doc_type}.pdf"


@router.post("/report/{deal_id}/document/{doc_type}")
async def upload_document(deal_id: int, doc_type: str, file: UploadFile = File(...)):
    """
    Upload a PDF document for a deal.
    doc_type: 'cepik' or 'damage_history'
    """
    if doc_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(404, "Unknown document type")

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are allowed")

    content = await file.read()
    if len(content) > 20 * 1024 * 1024:  # 20MB limit
        raise HTTPException(400, "File too large (max 20MB)")

    path = _doc_path(deal_id, doc_type)
    path.write_bytes(content)
    logger.info(f"[DocUpload] Saved {doc_type} for deal {deal_id} ({len(content)} bytes)")

    return {"status": "ok", "deal_id": deal_id, "doc_type": doc_type, "size": len(content)}


@router.get("/report/{deal_id}/document/{doc_type}")
async def download_document(deal_id: int, doc_type: str):
    """
    Download a stored PDF document for a deal.
    doc_type: 'cepik' or 'damage_history'
    """
    if doc_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(404, "Unknown document type")

    path = _doc_path(deal_id, doc_type)
    if not path.exists():
        raise HTTPException(404, f"No {doc_type} document found for deal #{deal_id}")

    filename_map = {
        "cepik": f"CEPIK_Raport_{deal_id}.pdf",
        "damage_history": f"Historia_Szkodowosci_{deal_id}.pdf",
    }
    filename = filename_map.get(doc_type, f"document_{deal_id}.pdf")

    return StreamingResponse(
        iter([path.read_bytes()]),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "public, max-age=3600",
        },
    )


@router.get("/report/{deal_id}/documents/status")
async def document_status(deal_id: int):
    """Check which documents are available for a deal."""
    return {
        "has_cepik": _doc_path(deal_id, "cepik").exists(),
        "has_damage_history": _doc_path(deal_id, "damage_history").exists(),
    }


# ─── Gallery endpoint ──────────────────────────────────────────────────────────

VIDEO_SLOTS = {"video_engine"}

CATEGORY_SLOTS: dict = {
    "exterior":  BODY_SLOTS,
    "interior":  INTERIOR_SLOTS,
    "engine":    ENGINE_SLOTS,
    "documents": DOCUMENT_SLOTS,
}


def _detect_video_mime(data: bytes) -> str:
    """Detect video MIME type from magic bytes; defaults to video/mp4."""
    if not data:
        return "video/mp4"
    if len(data) >= 4 and data[:4] == b'\x1aE\xdf\xa3':
        return "video/webm"
    if len(data) >= 12 and data[4:8] == b'ftyp':
        return "video/mp4"
    return "video/mp4"


@router.get("/gallery/{deal_id}/media/{slot_id}")
async def get_gallery_media(deal_id: int, slot_id: str, request: Request):
    """
    GET /api/gallery/{deal_id}/media/{slot_id}
    Stream a single photo or video binary.
    Supports HTTP Range requests so browsers can seek inside videos.
    """
    import re as _re
    from fastapi.responses import Response as _Resp

    _db = None
    try:
        _db = SessionLocal()
        row = _db.query(InspectionPhoto).filter(
            InspectionPhoto.deal_id == deal_id,
            InspectionPhoto.slot_id == slot_id,
        ).first()
        if not row or not row.photo_bytes:
            raise HTTPException(status_code=404, detail="Media not found")

        data: bytes = row.photo_bytes
        is_video = slot_id.startswith("video_")
        mime = _detect_video_mime(data[:12]) if is_video else "image/jpeg"
        total = len(data)

        range_header = request.headers.get("range")
        if range_header:
            m = _re.match(r"bytes=(\d*)-(\d*)", range_header)
            if m:
                start = int(m.group(1)) if m.group(1) else 0
                end   = int(m.group(2)) if m.group(2) else total - 1
                end   = min(end, total - 1)
                chunk = data[start : end + 1]
                return _Resp(
                    content=chunk,
                    status_code=206,
                    media_type=mime,
                    headers={
                        "Content-Range":  f"bytes {start}-{end}/{total}",
                        "Accept-Ranges":  "bytes",
                        "Content-Length": str(len(chunk)),
                        "Cache-Control":  "public, max-age=3600",
                    },
                )

        return _Resp(
            content=data,
            media_type=mime,
            headers={
                "Content-Length": str(total),
                "Accept-Ranges":  "bytes",
                "Cache-Control":  "public, max-age=3600",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"[Gallery] Error streaming {slot_id} for deal {deal_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to stream media")
    finally:
        if _db:
            try:
                _db.close()
            except Exception:
                pass


@router.get("/gallery/{deal_id}/damage/{source}/{dmg_idx}/{photo_idx}")
async def get_gallery_damage_photo(deal_id: int, source: str, dmg_idx: int, photo_idx: int):
    """
    GET /api/gallery/{deal_id}/damage/{source}/{dmg_idx}/{photo_idx}
    Public — serves a single damage photo stored as base64 inside InspectionRecord JSON.
    source: "ext" (exterior) or "int" (interior)
    """
    import base64 as _b64m
    from fastapi.responses import Response as _Resp

    if source not in ("ext", "int"):
        raise HTTPException(status_code=404, detail="Invalid damage source")

    _db2 = SessionLocal()
    try:
        rec2 = _db2.query(InspectionRecord).filter(InspectionRecord.deal_id == deal_id).first()
        if not rec2:
            raise HTTPException(status_code=404, detail="Inspection not found")

        raw_json = rec2.exterior_damage_json if source == "ext" else rec2.interior_damage_json
        if not raw_json:
            raise HTTPException(status_code=404, detail="No damage data")

        damages = json.loads(raw_json)
        if dmg_idx >= len(damages) or not isinstance(damages[dmg_idx], dict):
            raise HTTPException(status_code=404, detail="Damage index out of range")

        photos = damages[dmg_idx].get("photos") or []
        if photo_idx >= len(photos):
            raise HTTPException(status_code=404, detail="Photo index out of range")

        b64_str = photos[photo_idx] or ""
        if "," in b64_str:
            b64_str = b64_str.split(",", 1)[1]

        img_bytes = _b64m.b64decode(b64_str)
        return _Resp(content=img_bytes, media_type="image/jpeg",
                     headers={"Cache-Control": "public, max-age=3600"})
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"[Gallery] Damage photo error deal={deal_id} {source}[{dmg_idx}][{photo_idx}]: {e}")
        raise HTTPException(status_code=404, detail="Photo not found")
    finally:
        try:
            _db2.close()
        except Exception:
            pass


@router.get("/gallery/{deal_id}")
async def get_gallery(deal_id: int, request: Request):
    """
    GET /api/gallery/{deal_id}
    Public — no authentication required.
    Returns gallery metadata with URL paths (no base64 blobs).
    Each media item points to /api/gallery/{deal_id}/media/{slot_id}
    which streams the binary with proper Content-Type and Range support.
    """
    gateway = request.app.state.gateway
    bitrix_ready = getattr(request.app.state, "bitrix_ready", False)

    # ── Vehicle identity from InspectionRecord (primary) ──────────────────
    vehicle_name = f"Pojazd #{deal_id}"
    inspection_date = ""
    _rec = None
    _ext_damage_json = None
    _int_damage_json = None

    try:
        _db_rec = SessionLocal()
        _rec = _db_rec.query(InspectionRecord).filter(InspectionRecord.deal_id == deal_id).first()
        if _rec:
            _ext_damage_json = _rec.exterior_damage_json
            _int_damage_json = _rec.interior_damage_json
            if _rec.vehicle_json:
                try:
                    iv = json.loads(_rec.vehicle_json)
                    bi = iv.get("basicInfo") or {}
                    make  = _safe_str(iv.get("make")  or bi.get("make") or "")
                    model = _safe_str(iv.get("model") or bi.get("model") or "")
                    year  = _safe_str(iv.get("year")  or bi.get("year") or "")
                    name  = " ".join(p for p in [make, model, year] if p)
                    if name.strip():
                        vehicle_name = name
                    inspection_date = (
                        _safe_str(bi.get("inspectionDate")) or
                        _safe_str(iv.get("inspectionDate")) or ""
                    )
                except Exception:
                    pass
    except Exception:
        pass
    finally:
        try:
            _db_rec.close()
        except Exception:
            pass

    # ── Bitrix fallback for vehicle name ──────────────────────────────────
    if vehicle_name == f"Pojazd #{deal_id}" and bitrix_ready:
        try:
            raw_b = await gateway.call("crm.deal.get", {"ID": deal_id, "select": ["*", "UF_*"]})
            if raw_b:
                make  = _safe_str(raw_b.get(VEHICLE_FIELDS["make"]))
                model = _safe_str(raw_b.get(VEHICLE_FIELDS["model"]))
                year  = _safe_str(raw_b.get(VEHICLE_FIELDS["year"]))
                name  = " ".join(p for p in [make, model, year] if p)
                if name.strip():
                    vehicle_name = name
                if not inspection_date:
                    inspection_date = (
                        _safe_str(raw_b.get("UF_CRM_1772108256983")) or
                        _safe_str(raw_b.get("BEGINDATE")) or ""
                    )
        except Exception:
            pass

    # ── Load all media from DB ────────────────────────────────────────────
    media_items: List[dict] = []

    try:
        _db = SessionLocal()
        db_rows = _db.query(InspectionPhoto).filter(
            InspectionPhoto.deal_id == deal_id
        ).order_by(InspectionPhoto.id).all()

        if not db_rows and _rec is None:
            raise HTTPException(status_code=404, detail=f"No media found for deal {deal_id}")

        for row in db_rows:
            try:
                is_video = row.slot_id.startswith("video_")
                label = PHOTO_LABELS.get(row.slot_id, row.slot_id.replace("_", " ").title())

                # Determine category
                if is_video:
                    category = "videos"
                elif row.slot_id in BODY_SLOTS:
                    category = "exterior"
                elif row.slot_id in INTERIOR_SLOTS:
                    category = "interior"
                elif row.slot_id in ENGINE_SLOTS:
                    category = "engine"
                elif row.slot_id in DOCUMENT_SLOTS:
                    category = "documents"
                elif row.slot_id.startswith("photo_optional_"):
                    category = "damages"
                else:
                    category = "other"

                # Return a URL path — browser fetches binary lazily, no base64 bloat
                media_url = f"/api/gallery/{deal_id}/media/{row.slot_id}"

                media_items.append({
                    "slot_id":    row.slot_id,
                    "label":      label,
                    "category":   category,
                    "is_video":   is_video,
                    "url":        media_url,
                    "size_bytes": len(row.photo_bytes) if row.photo_bytes else 0,
                })
            except Exception:
                pass
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"[Gallery] Error loading media for deal {deal_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to load gallery media")
    finally:
        try:
            _db.close()
        except Exception:
            pass

    # ── Damage photos from InspectionRecord JSON ─────────────────────────
    # These are photos taken during ExteriorDamageStep / InteriorDamageStep
    # and stored as base64 inside the damage JSON (not in InspectionPhoto table).
    for _source, _damage_json_str in [("ext", _ext_damage_json), ("int", _int_damage_json)]:
        if not _damage_json_str:
            continue
        try:
            _damages = json.loads(_damage_json_str)
            for _dmg_idx, _dmg in enumerate(_damages):
                if not isinstance(_dmg, dict):
                    continue
                _photos = _dmg.get("photos") or []
                if not _photos:
                    continue
                _part = str(_dmg.get("part") or "").strip()
                _desc = str(_dmg.get("description") or "").strip()
                _label = _part or "Uszkodzenie"
                if _desc:
                    _label = f"{_label}: {_desc}"
                for _photo_idx in range(len(_photos)):
                    _slot_id = f"dmg_{_source}_{_dmg_idx}_photo_{_photo_idx}"
                    _url = f"/api/gallery/{deal_id}/damage/{_source}/{_dmg_idx}/{_photo_idx}"
                    media_items.append({
                        "slot_id":    _slot_id,
                        "label":      _label,
                        "category":   "damages",
                        "is_video":   False,
                        "url":        _url,
                        "size_bytes": 0,
                    })
        except Exception as _dmg_err:
            logger.warning(f"[Gallery] Error loading damage photos for deal {deal_id} source={_source}: {_dmg_err}")

    if not media_items:
        raise HTTPException(status_code=404, detail=f"No media found for deal {deal_id}")

    return {
        "deal_id":        deal_id,
        "vehicle_name":   vehicle_name,
        "inspection_date": inspection_date,
        "total_photos":   sum(1 for m in media_items if not m["is_video"]),
        "total_videos":   sum(1 for m in media_items if m["is_video"]),
        "media":          media_items,
    }

