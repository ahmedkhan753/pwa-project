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
from database import SessionLocal
from models.inspector import InspectionPhoto

router = APIRouter(prefix="/api", tags=["report"])
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
            if auth_token and "auth=" not in url:
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

    if not bitrix_ready:
        raise HTTPException(status_code=503, detail="Usługa tymczasowo niedostępna")

    try:
        raw = await gateway.call("crm.deal.get", {"ID": deal_id, "select": ["*", "UF_*"]})
    except Exception as e:
        logger.error(f"[Report] Failed to fetch deal {deal_id}: {e}")
        raise HTTPException(status_code=404, detail=f"Zlecenie {deal_id} nie zostało znalezione")

    if not raw:
        raise HTTPException(status_code=404, detail=f"Zlecenie {deal_id} nie zostało znalezione")

    logger.info(f"[Report] Fetched deal {deal_id} — {len(raw)} fields")

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
        "vin":             _f("vin"),
        "make":            _f("make"),
        "model":           _f("model"),
        "year":            _f("year"),
        "color":           _f("color"),
        "engine_capacity": _f("engine_capacity"),
        "engine_power":    _f("engine_power"),
        "fuel_type":       _f("fuel_type"),
        "body_type":       _f("body_type"),
        "transmission":    _f("transmission"),
        "drive_type":      _f("drive_type"),
        "registration_plate": _f("registration_plate"),
        "first_registration": _f("first_registration"),
        "mileage":         _f("mileage"),
        "doors":           _f("doors"),
    }

    # ── Standard photos ───────────────────────────────────────────────────
    # Primary source: photos saved to DB during individual upload (all 34 slots).
    # Fallback: Bitrix file fields (only 8 slots, used for older submissions).
    photos_standard = []
    hero_photo_url = None
    db_photo_data_uris: List[str] = []

    try:
        _db = SessionLocal()
        db_rows = _db.query(InspectionPhoto).filter(
            InspectionPhoto.deal_id == deal_id
        ).order_by(InspectionPhoto.id).all()
        for row in db_rows:
            if row.slot_id.startswith("video_"):
                continue
            try:
                uri = "data:image/jpeg;base64," + _b64.b64encode(row.photo_bytes).decode()
                db_photo_data_uris.append(uri)
                if hero_photo_url is None:
                    hero_photo_url = uri
                photos_standard.append({
                    "label": row.slot_id.replace("_", " ").title(),
                    "url": uri,
                    "position": len(photos_standard) + 1,
                })
            except Exception:
                pass
    except Exception as db_err:
        logger.warning(f"[Report] Could not load photos from DB: {db_err}")
    finally:
        try:
            _db.close()
        except Exception:
            pass

    # Fallback: Bitrix fields (older submissions without DB photos)
    if not photos_standard:
        for key, (label, field_id, pos) in PHOTO_FIELDS.items():
            urls = _extract_file_urls(raw.get(field_id), auth_token, base_domain)
            url = urls[0] if urls else None
            if url and hero_photo_url is None:
                hero_photo_url = url
            photos_standard.append({"label": label, "url": url, "position": pos})

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

    # ── Tires ─────────────────────────────────────────────────────────────
    tires = []
    for code, position, brand_field, size_field, type_field in TIRE_WHEELS:
        brand = _safe_str(raw.get(brand_field))
        size  = _safe_str(raw.get(size_field))
        type_ = _safe_str(raw.get(type_field))
        depth = _safe_float(raw.get(size_field))  # depth stored in same field as size for some

        # Try to parse depth from size string like "205/55R16 6.5mm"
        if size and not depth:
            import re
            m = re.search(r'(\d+(?:[.,]\d+)?)\s*mm', size, re.IGNORECASE)
            if m:
                depth = _safe_float(m.group(1))

        if brand or size or depth:
            tires.append({
                "position": position,
                "code": code,
                "brand": brand,
                "size": size,
                "type": type_,
                "tread_mm": depth,
                "status": _tire_status(depth),
            })

    # ── Damages ───────────────────────────────────────────────────────────
    damages = []

    # Try JSON field first
    ext_json = _safe_str(raw.get("UF_CRM_1772613182502"))
    if ext_json and ext_json.startswith("["):
        try:
            parsed = json.loads(ext_json)
            if isinstance(parsed, list):
                for i, d in enumerate(parsed, 1):
                    t = d.get("type") or d.get("damageType") or d.get("rodzaj", "")
                    loc = d.get("location") or d.get("part") or d.get("miejsce", "")
                    damages.append({
                        "index": i,
                        "type": t,
                        "location": loc,
                        "size": d.get("size") or d.get("rozmiar", ""),
                        "severity": d.get("severity", "cosmetic"),
                        "description": d.get("description") or d.get("opis", ""),
                    })
        except (json.JSONDecodeError, TypeError):
            pass

    # Fall back to individual damage group fields
    if not damages:
        for i, (type_field, desc_field) in enumerate(DAMAGE_GROUPS, 1):
            dmg_type = _safe_str(raw.get(type_field))
            dmg_desc = _safe_str(raw.get(desc_field))
            if dmg_type or dmg_desc:
                damages.append({
                    "index": i,
                    "type": dmg_type,
                    "location": "",
                    "size": "",
                    "severity": "cosmetic",
                    "description": dmg_desc,
                })

    cosmetic_count = sum(1 for d in damages if d.get("severity") in ("cosmetic", ""))
    structural_count = sum(1 for d in damages if d.get("severity") == "structural")

    # ── Equipment ─────────────────────────────────────────────────────────
    equipment = []
    equip_raw = raw.get("UF_CRM_1772535073217")
    if equip_raw:
        if isinstance(equip_raw, str) and (equip_raw.startswith("{") or equip_raw.startswith("[")):
            try:
                equip_data = json.loads(equip_raw)
                if isinstance(equip_data, dict):
                    for key, name in EQUIPMENT_LABEL_MAP.items():
                        val = equip_data.get(key)
                        if val is not None:
                            equipment.append({"name": name, "present": bool(val) and val not in ("0", "false", "Nie")})
                elif isinstance(equip_data, list):
                    for item in equip_data:
                        if isinstance(item, str):
                            equipment.append({"name": item, "present": True})
                        elif isinstance(item, dict):
                            equipment.append({"name": item.get("name", ""), "present": item.get("present", True)})
            except (json.JSONDecodeError, TypeError):
                pass
        elif isinstance(equip_raw, str):
            # Plain comma-separated list
            for item in equip_raw.split(","):
                item = item.strip()
                if item:
                    equipment.append({"name": item, "present": True})

    # ── Documents check ───────────────────────────────────────────────────
    documents_check = []

    reg_cert = _safe_str(raw.get("UF_CRM_1772533732089"))
    if reg_cert:
        ok = reg_cert.lower() not in ("0", "nie", "brak", "no")
        documents_check.append({"name": "Dowód rejestracyjny", "status": "Tak" if ok else "Brak", "status_type": "green" if ok else "red"})

    insurance = _safe_str(raw.get("UF_CRM_1772534289878"))
    if insurance:
        ok = insurance.lower() not in ("0", "nie", "brak", "no")
        documents_check.append({"name": "Polisa ubezpieczenia", "status": "Tak" if ok else "Brak", "status_type": "green" if ok else "red"})

    # ── Mechanical ────────────────────────────────────────────────────────
    mechanical = {}
    mech_raw = raw.get("UF_CRM_1772613597958")
    if mech_raw and isinstance(mech_raw, str) and mech_raw.startswith("{"):
        try:
            mechanical = json.loads(mech_raw)
        except (json.JSONDecodeError, TypeError):
            mechanical = {"notes": mech_raw}
    elif mech_raw and isinstance(mech_raw, dict):
        mechanical = mech_raw

    warning_lights = _safe_str(raw.get("UF_CRM_1772613819989")) or mechanical.get("warningLights", "")
    ac_raw = mechanical.get("acWorking")

    # ── Signatures ────────────────────────────────────────────────────────
    sig_appraiser_urls = _extract_file_urls(raw.get("UF_CRM_1772801573"), auth_token, base_domain)
    sig_client_urls    = _extract_file_urls(raw.get("UF_CRM_1772190199297"), auth_token, base_domain)

    # ── Inspector info ────────────────────────────────────────────────────
    inspector_name  = _safe_str(raw.get("UF_CRM_1771579888"))
    inspector_phone = _safe_str(raw.get("UF_CRM_1773961369947"))

    # Try to resolve inspector_name from DB if it looks like a Bitrix list ID (numeric)
    if inspector_name and inspector_name.isdigit():
        try:
            from database import SessionLocal
            from models.inspector import Inspector as InspectorModel
            db = SessionLocal()
            try:
                # Look up by matching bitrix appraiser field
                inspector_obj = db.query(InspectorModel).filter(
                    InspectorModel.is_active == True
                ).first()
                if inspector_obj:
                    inspector_name = inspector_obj.name
                    if not inspector_phone:
                        inspector_phone = inspector_obj.phone
            finally:
                db.close()
        except Exception:
            pass

    # ── Inspection date & place ────────────────────────────────────────────
    inspection_date = (
        _safe_str(raw.get("UF_CRM_1772108256983")) or
        _safe_str(raw.get("BEGINDATE")) or
        _safe_str(raw.get("DATE_CREATE"))
    )
    inspection_place = _safe_str(raw.get("UF_CRM_1766058185504")) or _safe_str(raw.get("UF_CRM_1766058194337"))

    notes = (
        _safe_str(raw.get("UF_CRM_1772614097532")) or
        _safe_str(raw.get("UF_CRM_1772798881993")) or
        _safe_str(raw.get("COMMENTS"))
    )

    # ── Build & return ────────────────────────────────────────────────────
    return {
        "deal_id": deal_id,
        "report_url": f"https://app.zaufajrzeczoznawcy.pl/report/{deal_id}",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "title": _safe_str(raw.get("TITLE")) or f"Inspekcja #{deal_id}",

        "vehicle": vehicle,
        "hero_photo_url": hero_photo_url,

        "quick_stats": {
            "year":         vehicle["year"],
            "fuel":         vehicle["fuel_type"],
            "power":        f"{vehicle['engine_power']} KM" if vehicle["engine_power"] else "",
            "transmission": vehicle["transmission"],
            "mileage":      f"{vehicle['mileage']} km" if vehicle["mileage"] else "",
        },

        "damage_summary": {
            "cosmetic":   cosmetic_count,
            "structural": structural_count,
            "bodywork":   repaint_count,
        },

        "photos": {
            "standard": photos_standard,
        },

        "paint_measurements": paint_measurements,
        "tires": tires,
        "damages": damages,
        "equipment": equipment,
        "documents_check": documents_check,

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
                "name":          _safe_str(raw.get("UF_CRM_1766057941327")),
                "signature_url": sig_client_urls[0] if sig_client_urls else None,
            },
        },

        "inspector": {
            "name":  inspector_name,
            "phone": inspector_phone,
        },

        "client": {
            "name":    _safe_str(raw.get("UF_CRM_1766057941327")),
            "company": _safe_str(raw.get("UF_CRM_1766057964319")),
            "phone":   _safe_str(raw.get("UF_CRM_1766058053224")),
        },

        "inspection_date":  inspection_date,
        "inspection_place": inspection_place,
    }
