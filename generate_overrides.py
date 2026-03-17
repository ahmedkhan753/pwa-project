
import json

UNMAPPED_KEYS = [
    "documents_completeness", "insurance_policy", "paint_bumper_front",
    "paint_bumper_rear", "paint_pillar_a_left", "paint_pillar_a_right",
    "paint_data_json", "warning_lights", "mechanical_json", "tire_fl_size",
    "tire_fl_depth", "tire_fr_size", "tire_fr_depth", "tire_rl_size",
    "tire_rl_depth", "tire_rr_size", "tire_rr_depth", "photo_left",
    "photo_right", "photo_interior", "photo_dashboard", "interior_damage_json",
    "interior_condition", "dashboard_condition", "exterior_damage_json",
    "damage_group_1", "damage_group_2", "damage_group_3", "damage_group_4",
    "damage_group_5", "damage_group_6", "damage_group_7", "estimated_value",
    "vin_confirmed", "signature_appraiser", "signature_client", "signature_yard",
    "notes_valuation_json", "equipment_completeness", "full_equipment_json"
]

RULES = {
    "documents_completeness": "Kompletność dokumentów",
    "insurance_policy": "Polisa",
    "paint_bumper_front": "Zderzak przedni",
    "paint_bumper_rear": "Zderzak tylny",
    "paint_pillar_a_left": "Słupek A lewy",
    "paint_pillar_a_right": "Słupek A prawy",
    "paint_data_json": "Pomiary lakieru",
    "warning_lights": "Kontrolki",
    "mechanical_json": "Mechanika",
    "tire_fl_size": "Lewy przód rozmiar",
    "tire_fl_depth": "Lewy przód bieżnik",
    "tire_fr_size": "Prawy przód rozmiar",
    "tire_fr_depth": "Prawy przód głębokość",
    "tire_rl_size": "Lewy tył rozmiar",
    "tire_rl_depth": "Lewy tył głębokość",
    "tire_rr_size": "Prawy tył rozmiar",
    "tire_rr_depth": "Prawy tył głębokość",
    "photo_left": "Lewy bok",
    "photo_right": "Prawy bok",
    "photo_interior": "Wnętrze",
    "photo_dashboard": "Deska",
    "interior_damage_json": "Uszkodzenia wnętrza",
    "interior_condition": "Stan wnętrza",
    "dashboard_condition": "Stan deski",
    "exterior_damage_json": "Uszkodzenia nadwozia",
    "damage_group_1": "Uszkodzenia grupa 1",
    "damage_group_2": "Uszkodzenia grupa 2",
    "damage_group_3": "Uszkodzenia grupa 3",
    "damage_group_4": "Uszkodzenia grupa 4",
    "damage_group_5": "Uszkodzenia grupa 5",
    "damage_group_6": "Uszkodzenia grupa 6",
    "damage_group_7": "Uszkodzenia grupa 7",
    "estimated_value": "Szacowana wartość",
    "vin_confirmed": "VIN potwierdzony",
    "signature_appraiser": "Podpis rzeczoznawcy",
    "signature_client": "Podpis klienta",
    "signature_yard": "Podpis plac",
    "notes_valuation_json": "Uwagi i wycena",
    "equipment_completeness": "Kompletność wyposażenia",
    "full_equipment_json": "Pełne wyposażenie"
}

with open("bitrix_schema_dump.json", "r", encoding="utf-8") as f:
    schema = json.load(f)

mappings = {}
for key in UNMAPPED_KEYS:
    target = RULES.get(key, key).upper()
    found = False
    for fid, info in schema.items():
        label = info['label'].upper()
        if target in label:
            mappings[key] = fid
            found = True
            break
    if not found:
        for fid, info in schema.items():
            label = info['label'].upper()
            words = target.split()
            if all(w in label for w in words):
                 mappings[key] = fid
                 found = True
                 break

print(json.dumps(mappings, indent=2))
