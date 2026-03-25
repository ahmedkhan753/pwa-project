"""
Bulk Inspector Import
=====================
Adds all inspectors to PostgreSQL AND to the Bitrix24 enumeration field.

Usage (run inside backend container or with correct DB env):
    cd /app && python scripts/add_inspectors.py

Set env vars:
    DATABASE_URL  — PostgreSQL connection string (auto-read from environment)
    BITRIX_WEBHOOK_URL — full webhook URL (auto-read from environment)
"""

import os
import sys
import json
import urllib.request
import urllib.parse

# ── Inspector list ─────────────────────────────────────────────────────────
# Phone numbers are normalized (no spaces, no dashes)
INSPECTORS = [
    {"name": "Dymitr Klimczuk",      "phone": "505608151",  "email": "dymitr.klimczuk@gmail.com"},
    {"name": "Alex Zhdan",           "phone": "507558387",  "email": "507558387@wp.pl"},
    {"name": "Rafał Jezierski",      "phone": "722555350",  "email": "afaljezierski85@icloud.com"},
    {"name": "Piotr Partyka",        "phone": "600439709",  "email": "piotrdmpartyka@gmail.com"},
    {"name": "Lukasz Krzywicki",     "phone": "535508525",  "email": "krzywicki.luk@gmail.com"},
    {"name": "Garczyński Piotr",     "phone": "603186963",  "email": "expert.lancut@gmail.com"},
    {"name": "Jarosław Szymborski",  "phone": "505518983",  "email": "jaroslaw106@onet.pl"},
    {"name": "Bartosz Płatek",       "phone": "693698178",  "email": "carlos299@interia.pl"},
    {"name": "Krzysztof Trypuć",     "phone": "507194578",  "email": "krzysiektrypuc@interia.pl"},
    {"name": "Brandon Niznik",       "phone": "796960722",  "email": "niznikbrandon1@gmail.com"},
    {"name": "Piotr Marczak",        "phone": "535006549",  "email": "expert80pm@gmail.com"},
    {"name": "Adam Lewandowicz",     "phone": "881537111",  "email": "a.lewandowicz@poczta.fm"},
    {"name": "Daniel Zieba",         "phone": "508598112",  "email": "danielzieba@hotmail.com"},
    {"name": "Konrad Kulesz",        "phone": "782433779",  "email": "konrad.kulesz@icloud.com"},
    {"name": "Paul Kozakiewicz",     "phone": "513763724",  "email": "pkozakiewicz50@gmail.com"},
    {"name": "Dominik Felczak",      "phone": "889552771",  "email": "dominik.felczak@onet.eu"},
    {"name": "David Rosiak",         "phone": "661771032",  "email": "Dawidrosiak@wp.pl"},
    {"name": "Tomasz Hajok",         "phone": "696039566",  "email": "TomaszHajok@interia.pl"},
    {"name": "Damian Felix",         "phone": "570140364",  "email": "damianfeliks98@gmail.com"},
    {"name": "Wojciech Burek",       "phone": "793673631",  "email": "mbwworld.mb@gmail.com"},
    {"name": "Tomasz Pierniak",      "phone": "509374490",  "email": "tomekpierniak@gmail.com"},
    {"name": "Sebastian Wołodkowicz","phone": "783631549",  "email": "seba1992strazak@gmail.com"},
    {"name": "Patryk Gorazdza",      "phone": "453102997",  "email": "gorazdza@gmail.com"},
    {"name": "Adam Suchorab",        "phone": "530589007",  "email": "adam.suchorab87@gmail.com"},
    {"name": "Denis Żogała",         "phone": "511805715",  "email": "denis.zogala@interia.pl"},
    {"name": "Oskar Kania",          "phone": "507775513",  "email": "kanosakan@gmail.com"},
    {"name": "Mariusz Jarosz",       "phone": "660465657",  "email": "mariusz.jarosz1@gmail.com"},
    {"name": "Tomasz Zapotoczny",    "phone": "504580368",  "email": "zapotoczny1@o2.pl"},
    {"name": "Lukasz Soboczynski",   "phone": "514503977",  "email": "lsoboczynski@gmail.com"},
    {"name": "Kuba Roszak",          "phone": "692697084",  "email": "kubaroszak268@gmail.com"},
    {"name": "Artur Rolicz",         "phone": "665004633",  "email": "dyzma221@gmail.com"},
    {"name": "Nicholas Szostek",     "phone": "796507778",  "email": "mikolaj.sz05@gmail.com"},
    {"name": "Adam Szymaniak",       "phone": "889100788",  "email": "a.szymaniak83@gmail.com"},
    {"name": "Mariusz Wieczorek",    "phone": "666687132",  "email": "negro.slask@gmail.com"},
]

DEFAULT_PIN = "1234"


# ── Step 1: Add to PostgreSQL ──────────────────────────────────────────────
def add_to_postgres():
    try:
        import sqlalchemy
        from sqlalchemy import create_engine, text
        from passlib.context import CryptContext
    except ImportError:
        print("⚠ SQLAlchemy/passlib not available — skipping PostgreSQL step")
        return

    db_url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@db:5432/inspections")
    engine = create_engine(db_url)
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    pin_hash = pwd_context.hash(DEFAULT_PIN)

    added = 0
    skipped = 0
    with engine.connect() as conn:
        for insp in INSPECTORS:
            # Check if already exists
            existing = conn.execute(
                text("SELECT id FROM inspectors WHERE phone = :phone"),
                {"phone": insp["phone"]}
            ).fetchone()
            if existing:
                print(f"  SKIP  {insp['name']} ({insp['phone']}) — already exists")
                skipped += 1
                continue

            conn.execute(
                text("""
                    INSERT INTO inspectors (name, phone, pin_hash, email, is_active)
                    VALUES (:name, :phone, :pin_hash, :email, true)
                """),
                {
                    "name": insp["name"],
                    "phone": insp["phone"],
                    "pin_hash": pin_hash,
                    "email": insp["email"],
                }
            )
            print(f"  ✅ Added {insp['name']} ({insp['phone']})")
            added += 1
        conn.commit()

    print(f"\nPostgreSQL: {added} added, {skipped} skipped")


# ── Step 2: Add to Bitrix enumeration field ────────────────────────────────
def bitrix_call(webhook_url: str, method: str, params: dict) -> dict:
    url = webhook_url.rstrip("/") + f"/{method}"
    data = json.dumps(params).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def add_to_bitrix(webhook_url: str):
    INSPECTOR_FIELD = "UF_CRM_1773970466449"

    print("\n── Bitrix: finding enumeration field ID ──")
    result = bitrix_call(webhook_url, "crm.deal.userfield.list", {
        "filter": {"FIELD_NAME": INSPECTOR_FIELD}
    })
    fields = result.get("result", [])
    if not fields:
        print(f"❌ Could not find field {INSPECTOR_FIELD} — skipping Bitrix step")
        return

    field = fields[0]
    field_id = field["ID"]
    existing_items = field.get("LIST", [])
    print(f"  Field ID: {field_id}, existing items: {len(existing_items)}")

    existing_phones = {item["VALUE"] for item in existing_items}
    new_items = [{"VALUE": insp["phone"]} for insp in INSPECTORS if insp["phone"] not in existing_phones]

    if not new_items:
        print("  All phones already in Bitrix enumeration — nothing to add")
        return

    print(f"  Adding {len(new_items)} new phone numbers to enumeration...")

    # Must include all existing items + new ones
    all_items = existing_items + new_items
    update_result = bitrix_call(webhook_url, "crm.deal.userfield.update", {
        "id": field_id,
        "fields": {"LIST": all_items}
    })

    if update_result.get("result"):
        print(f"  ✅ Bitrix enumeration updated — {len(new_items)} phones added")
    else:
        print(f"  ❌ Bitrix update failed: {update_result}")


# ── Main ────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"Adding {len(INSPECTORS)} inspectors...\n")

    print("── Step 1: PostgreSQL ──")
    add_to_postgres()

    webhook_url = os.getenv(
        "BITRIX_WEBHOOK_URL",
        "https://b24-05xr3e.bitrix24.pl/rest/10/k7nt85mhxjh1pd9k/"
    )
    print(f"\n── Step 2: Bitrix ({webhook_url[:50]}...) ──")
    try:
        add_to_bitrix(webhook_url)
    except Exception as e:
        print(f"❌ Bitrix step failed: {e}")

    print("\nDone. Default PIN for all new inspectors: 1234")
    print("Inspectors can change their PIN via the admin panel.")
