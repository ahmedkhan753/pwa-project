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
    "damage_group_1":           ["Uszkodzenia grupa 1", "Damage group 1"],
    "damage_group_2":           ["Uszkodzenia grupa 2", "Damage group 2"],
    "damage_group_3":           ["Uszkodzenia grupa 3", "Damage group 3"],
    "damage_group_4":           ["Uszkodzenia grupa 4", "Damage group 4"],
    "damage_group_5":           ["Uszkodzenia grupa 5", "Damage group 5"],
    "damage_group_6":           ["Uszkodzenia grupa 6", "Damage group 6"],
    "damage_group_7":           ["Uszkodzenia grupa 7", "Damage group 7"],

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
    # Step 1 — Vehicle Identity
    "registration_number":  "UF_CRM_1766057515315",
    "registrationPlates":   "UF_CRM_1766057515315",
    "vin_number":           "UF_CRM_1766057539531",
    "production_year":      "UF_CRM_1766057572300",
    "year":                 "UF_CRM_1766057572300",
    "object_condition":     "UF_CRM_1766057661321",
    "internal_order_no":    "UF_CRM_1766057686053",
    "object_type":          "UF_CRM_1766057822722",
    "make":                 "UF_CRM_1766057839684",
    "vehicle_brand":        "UF_CRM_1766057839684",
    "model":                "UF_CRM_1766057849818",
    "vehicle_model":        "UF_CRM_1766057849818",
    "object_notes":         "UF_CRM_1766057874704",
    "bodyType":             "UF_CRM_1772796562336",
    "body_type":            "UF_CRM_1772796562336",
    "gearboxType":          "UF_CRM_1772796772039",
    "gearbox_type":         "UF_CRM_1772796772039",
    "fuelType":             "UF_CRM_1772534193",
    "fuel_type":            "UF_CRM_1772534193",
    "driveType":            "UF_CRM_1772534384484",
    "drive_type":           "UF_CRM_1772534384484",
    "color":                "UF_CRM_1772534410706",
    "engineCapacity":       "UF_CRM_1772534081105",
    "engine_capacity":      "UF_CRM_1772534081105",
    "enginePower":          "UF_CRM_1772534094039",
    "engine_power":         "UF_CRM_1772534094039",
    "seatsCount":           "UF_CRM_1772534240887",
    "seats_count":          "UF_CRM_1772534240887",
    "productionDate":       "UF_CRM_1772534258723",
    "production_date":      "UF_CRM_1772534258723",
    "mileage":              "UF_CRM_1772534309693",
    "firstRegistration":    "UF_CRM_1771529218758",
    "first_registration":   "UF_CRM_1771529218758",

    # Step 2 — Client Info
    "first_name":           "UF_CRM_1766057941327",
    "last_name":            "UF_CRM_1766057951060",
    "company_name":         "UF_CRM_1766057964319",
    "vat_payer":            "UF_CRM_1766057986080",
    "tax_id":               "UF_CRM_1766057995404",
    "city":                 "UF_CRM_1766058009838",
    "street":               "UF_CRM_1766058028123",
    "phone":                "UF_CRM_1766058053224",
    "mobile":               "UF_CRM_1766058064293",
    "client_email":         "UF_CRM_1766058088327",
    "contact_person":       "UF_CRM_1766058259960",
    "contact_phone":        "UF_CRM_1766058247125",
    "client_is_owner":      "UF_CRM_1770382017593",
    "user_owner":           "UF_CRM_1772533649132",

    # Step 3 — Scheduling
    "scheduled_date":       "UF_CRM_1772108256983",
    "inspection_date":      "UF_CRM_1772108256983",
    "planned_location":     "UF_CRM_1766058185504",
    "planned_address":      "UF_CRM_1766058194337",
    "expected_date":        "UF_CRM_1766058328433",
    "expected_time":        "UF_CRM_1766058499797",

    # Step 4 — Paint Measurements
    "hood":                 "UF_CRM_1772608834",
    "paint_hood":           "UF_CRM_1772608834",
    "leftFrontFender":      "UF_CRM_1772609211",
    "paint_fender_fl":      "UF_CRM_1772609211",
    "leftFrontDoor":        "UF_CRM_1772609231",
    "paint_door_fl":        "UF_CRM_1772609231",
    "leftAColumn":          "UF_CRM_1772609246",
    "leftBColumn":          "UF_CRM_1772610029",
    "leftRearDoor":         "UF_CRM_1772610262",
    "paint_door_rl":        "UF_CRM_1772610262",
    "leftRearFender":       "UF_CRM_1772610277",
    "paint_fender_rl":      "UF_CRM_1772610277",
    "leftSill":             "UF_CRM_1772610293",
    "trunk":                "UF_CRM_1772610306",
    "paint_trunk":          "UF_CRM_1772610306",
    "rightSill":            "UF_CRM_1772610320",
    "rightRearFender":      "UF_CRM_1772610341",
    "paint_fender_rr":      "UF_CRM_1772610341",
    "rightRearDoor":        "UF_CRM_1772610362",
    "paint_door_rr":        "UF_CRM_1772610362",
    "rightBColumn":         "UF_CRM_1772610375",
    "rightAColumn":         "UF_CRM_1772610470",
    "rightFrontDoor":       "UF_CRM_1772610483",
    "paint_door_fr":        "UF_CRM_1772610483",
    "rightFrontFender":     "UF_CRM_1772610496",
    "paint_fender_fr":      "UF_CRM_1772610496",
    "roof":                 "UF_CRM_1772610511",
    "paint_roof":           "UF_CRM_1772610511",

    # Step 5 — Tires (Front Left)
    "frontLeft.photo":      "UF_CRM_1772610734643",
    "tire_fl_photo":        "UF_CRM_1772610734643",
    "frontLeft.brand":      "UF_CRM_1772610816511",
    "tire_fl_brand":        "UF_CRM_1772610816511",
    "frontLeft.model":      "UF_CRM_1772610837476",
    "frontLeft.width":      "UF_CRM_1772610861879",
    "tire_fl_width":        "UF_CRM_1772610861879",
    "frontLeft.height":     "UF_CRM_1772610884898",
    "frontLeft.diameter":   "UF_CRM_1772610897372",
    "frontLeft.type":       "UF_CRM_1772611049682",
    "tire_fl_type":         "UF_CRM_1772611049682",

    # Step 5 — Tires (Rear Left)
    "rearLeft.photo":       "UF_CRM_1772611130006",
    "rearLeft.brand":       "UF_CRM_1772611145640",
    "tire_rl_brand":        "UF_CRM_1772611145640",
    "rearLeft.width":       "UF_CRM_1772611181014",
    "tire_rl_width":        "UF_CRM_1772611181014",
    "rearLeft.type":        "UF_CRM_1772611308379",

    # Step 5 — Tires (Rear Right)
    "rearRight.photo":      "UF_CRM_1772611337096",
    "rearRight.brand":      "UF_CRM_1772611353212",
    "tire_rr_brand":        "UF_CRM_1772611353212",
    "rearRight.width":      "UF_CRM_1772611383784",
    "tire_rr_width":        "UF_CRM_1772611383784",
    "rearRight.type":       "UF_CRM_1772611486777",

    # Step 5 — Tires (Front Right)
    "frontRight.photo":     "UF_CRM_1772611509263",
    "frontRight.brand":     "UF_CRM_1772611525863",
    "tire_fr_brand":        "UF_CRM_1772611525863",
    "frontRight.width":     "UF_CRM_1772611559270",
    "tire_fr_width":        "UF_CRM_1772611559270",
    "frontRight.type":      "UF_CRM_1772611681119",

    # Step 6 — Exterior Photos
    "photo_diagonal_fl":    "UF_CRM_1772611987832",
    "photo_front":          "UF_CRM_1772612004048",
    "photo_underbody_f":    "UF_CRM_1772612013651",
    "photo_diagonal_fr":    "UF_CRM_1772612024701",
    "photo_right_front":    "UF_CRM_1772612033335",
    "photo_right_rear":     "UF_CRM_1772612050107",
    "photo_diagonal_rr":    "UF_CRM_1772612066491",
    "photo_rear":           "UF_CRM_1772612079009",
    "photo_underbody_r":    "UF_CRM_1772612087523",
    "photo_trunk":          "UF_CRM_1772612097406",
    "photo_spare_wheel":    "UF_CRM_1772612105807",
    "photo_diagonal_rl":    "UF_CRM_1772612115527",
    "photo_left_rear":      "UF_CRM_1772612124809",
    "photo_left_front":     "UF_CRM_1772612134646",
    "photo_engine":         "UF_CRM_1772612144482",
    "photo_vin":            "UF_CRM_1772612153446",
    "photo_vin_plate":      "UF_CRM_1772612153446",
    "photo_nameplate":      "UF_CRM_1772612164113",
    "photo_odometer":       "UF_CRM_1772612173468",
    "photo_service":        "UF_CRM_1772612182601",
    "photo_door_fl_open":   "UF_CRM_1772612194120",
    "photo_door_fr_open":   "UF_CRM_1772798492178",
    "photo_steering_left":  "UF_CRM_1772612202338",
    "photo_door_rl_open":   "UF_CRM_1772612212884",
    "photo_rear_to_dash":   "UF_CRM_1772612221275",
    "photo_console":        "UF_CRM_1772612231675",
    "photo_tunnel":         "UF_CRM_1772612239574",
    "photo_steering_front": "UF_CRM_1772612253674",
    "photo_protocol":       "UF_CRM_1772612269743",

    # Step 9 — Mechanical
    "engine_oil_level":     "UF_CRM_1772534488",
    "brake_fluid_level":    "UF_CRM_1772534549",
    "power_steering_level": "UF_CRM_1772534574",
    "coolant_level":        "UF_CRM_1772534597",
    "engine_noises":        "UF_CRM_1772613615422",
    "clutch_noises":        "UF_CRM_1772613597958",
    "steering_noises":      "UF_CRM_1772613633756",
    "suspension_noises":    "UF_CRM_1772613982870",
    "oil_leaks":            "UF_CRM_1772613674060",
    "gearbox_leaks":        "UF_CRM_1772613689243",
    "coolant_leaks":        "UF_CRM_1772613705229",
    "brake_fluid_leaks":    "UF_CRM_1772613719093",
    "excessive_smoking":    "UF_CRM_1772613886946",
    "check_engine":         "UF_CRM_1772613819989",
    "abs_esp_warning":      "UF_CRM_1772613835346",
    "airbag_warning":       "UF_CRM_1772613852408",
    "service_warning":      "UF_CRM_1772613868261",

    # Step 12 — Signature & Summary
    "absentRepComment":     "COMMENTS",
    "absent_rep_comment":   "COMMENTS",
    "summary":              "UF_CRM_1772798881993",
    "report_type":          "UF_CRM_1772793999330",
    "additional_notes":     "UF_CRM_1772190212427",

    # Rear Left tires (Extended)
    "rearLeft.height":      "UF_CRM_1772611199032",
    "rearLeft.diameter":    "UF_CRM_1772611214450",
    "rearLeft.loadIndex":   "UF_CRM_1772611233034",
    "rearLeft.speedIndex":  "UF_CRM_1772611258151",
    "rearLeft.profile":     "UF_CRM_1772611274637",
    "rearLeft.type":        "UF_CRM_1772611308379",
    "tire_rl_type":         "UF_CRM_1772611308379",

    # Rear Right tires (Extended)
    "rearRight.height":     "UF_CRM_1772611399366",
    "rearRight.diameter":   "UF_CRM_1772611414250",
    "rearRight.loadIndex":  "UF_CRM_1772611429054",
    "rearRight.speedIndex": "UF_CRM_1772611443569",
    "rearRight.profile":    "UF_CRM_1772611458789",
    "rearRight.type":       "UF_CRM_1772611486777",
    "tire_rr_type":         "UF_CRM_1772611486777",

    # Front Right tires (Extended)
    "frontRight.height":    "UF_CRM_1772611574783",
    "frontRight.diameter":  "UF_CRM_1772611590270",
    "frontRight.loadIndex": "UF_CRM_1772611605902",
    "frontRight.speedIndex":"UF_CRM_1772611622692",
    "frontRight.profile":   "UF_CRM_1772611638595",
    "frontRight.type":      "UF_CRM_1772611681119",
    "tire_fr_type":         "UF_CRM_1772611681119",

    # Damage Groups 1-7
    "damage_group_1.type":  "UF_CRM_1772613182502",
    "damage_group_1.photos":"UF_CRM_1772613206871",
    "damage_group_1.far":   "UF_CRM_1772613217059",
    "damage_group_1.close": "UF_CRM_1772613228190",
    "damage_group_1.desc":  "UF_CRM_1772613247890",

    "damage_group_2.type":  "UF_CRM_1772613355353",
    "damage_group_2.photos":"UF_CRM_1772613373460",
    "damage_group_2.far":   "UF_CRM_1772613387457",
    "damage_group_2.close": "UF_CRM_1772613397392",
    "damage_group_2.desc":  "UF_CRM_1772613406127",

    "damage_group_3.type":  "UF_CRM_1772715276778",
    "damage_group_3.photos":"UF_CRM_1772715380001",
    "damage_group_3.far":   "UF_CRM_1772715409356",
    "damage_group_3.close": "UF_CRM_1772715425054",
    "damage_group_3.desc":  "UF_CRM_1772802047750",

    "damage_group_4.type":  "UF_CRM_1772715537916",
    "damage_group_4.photos":"UF_CRM_1772715552367",
    "damage_group_4.far":   "UF_CRM_1772715562835",
    "damage_group_4.close": "UF_CRM_1772715572369",
    "damage_group_4.desc":  "UF_CRM_1772715584270",

    "damage_group_5.type":  "UF_CRM_1772715645276",
    "damage_group_5.photos":"UF_CRM_1772715663777",
    "damage_group_5.far":   "UF_CRM_1772715684930",
    "damage_group_5.close": "UF_CRM_1772715696198",
    "damage_group_5.desc":  "UF_CRM_1772715705935",

    "damage_group_6.type":  "UF_CRM_1772715772023",
    "damage_group_6.photos":"UF_CRM_1772715787774",
    "damage_group_6.far":   "UF_CRM_1772715801292",
    "damage_group_6.close": "UF_CRM_1772715816526",
    "damage_group_6.desc":  "UF_CRM_1772715826394",

    "damage_group_7.type":  "UF_CRM_1772715893467",
    "damage_group_7.photos":"UF_CRM_1772715904885",
    "damage_group_7.far":   "UF_CRM_1772715914852",
    "damage_group_7.close": "UF_CRM_1772715927438",
    "damage_group_7.desc":  "UF_CRM_1772715939756",
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
