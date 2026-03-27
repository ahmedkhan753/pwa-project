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
    {"name": "Mateusz Chłodek", "phone": "790469341", "email": "chlodekmateusz@gmail.com"},
    {"name": "Test Inspektor", "phone": "572572744", "email": "test@zaufajrzeczoznawcy.pl"},
    {"name": "Ahmed khan", "phone": "03341229637", "email": "ahmedk32410@gmail.com"},
    {"name": "Dymitr Klimczuk", "phone": "505608151", "email": "dymitr.klimczuk@gmail.com"},
    {"name": "Alex Zhdan", "phone": "507558387", "email": "507558387@wp.pl"},
    {"name": "Rafał Jezierski", "phone": "722555350", "email": "afaljezierski85@icloud.com"},
    {"name": "Piotr Partyka", "phone": "600439709", "email": "piotrdmpartyka@gmail.com"},
    {"name": "Lukasz Krzywicki", "phone": "535508525", "email": "krzywicki.luk@gmail.com"},
    {"name": "Garczyński Piotr", "phone": "603186963", "email": "expert.lancut@gmail.com"},
    {"name": "Jarosław Szymborski", "phone": "505518983", "email": "jaroslaw106@onet.pl"},
    {"name": "Bartosz Płatek", "phone": "693698178", "email": "carlos299@interia.pl"},
    {"name": "Krzysztof Trypuć", "phone": "507194578", "email": "krzysiektrypuc@interia.pl"},
    {"name": "Brandon Niznik", "phone": "796960722", "email": "niznikbrandon1@gmail.com"},
    {"name": "Piotr Marczak", "phone": "535006549", "email": "expert80pm@gmail.com"},
    {"name": "Adam Lewandowicz", "phone": "881537111", "email": "a.lewandowicz@poczta.fm"},
    {"name": "Daniel Zieba", "phone": "508598112", "email": "danielzieba@hotmail.com"},
    {"name": "Konrad Kulesz", "phone": "782433779", "email": "konrad.kulesz@icloud.com"},
    {"name": "Paul Kozakiewicz", "phone": "513763724", "email": "pkozakiewicz50@gmail.com"},
    {"name": "Dominik Felczak", "phone": "889552771", "email": "dominik.felczak@onet.eu"},
    {"name": "David Rosiak", "phone": "661771032", "email": "Dawidrosiak@wp.pl"},
    {"name": "Tomasz Hajok", "phone": "696039566", "email": "TomaszHajok@interia.pl"},
    {"name": "Damian Felix", "phone": "570140364", "email": "damianfeliks98@gmail.com"},
    {"name": "Wojciech Burek", "phone": "793673631", "email": "mbwworld.mb@gmail.com"},
    {"name": "Tomasz Pierniak", "phone": "509374490", "email": "tomekpierniak@gmail.com"},
    {"name": "Sebastian Wołodkowicz", "phone": "783631549", "email": "seba1992strazak@gmail.com"},
    {"name": "Patryk Gorazdza", "phone": "453102997", "email": "gorazdza@gmail.com"},
    {"name": "Adam Suchorab", "phone": "530589007", "email": "adam.suchorab87@gmail.com"},
    {"name": "Denis Żogała", "phone": "511805715", "email": "denis.zogala@interia.pl"},
    {"name": "Oskar Kania", "phone": "507775513", "email": "kanosakan@gmail.com"},
    {"name": "Mariusz Jarosz", "phone": "660465657", "email": "mariusz.jarosz1@gmail.com"},
    {"name": "Tomasz Zapotoczny", "phone": "504580368", "email": "zapotoczny1@o2.pl"},
    {"name": "Lukasz Soboczynski", "phone": "514503977", "email": "lsoboczynski@gmail.com"},
    {"name": "Kuba Roszak", "phone": "692697084", "email": "kubaroszak268@gmail.com"},
    {"name": "Artur Rolicz", "phone": "665004633", "email": "dyzma221@gmail.com"},
    {"name": "Nicholas Szostek", "phone": "796507778", "email": "mikolaj.sz05@gmail.com"},
    {"name": "Adam Szymaniak", "phone": "889100788", "email": "a.szymaniak83@gmail.com"},
    {"name": "Mariusz Wieczorek", "phone": "666687132", "email": "negro.slask@gmail.com"},
    {"name": "Hamza", "phone": "6464646", "email": "ajajsj@gmail.com"},
    {"name": "Hamza", "phone": "868668", "email": "hahsjx@gmail.com"},
    {"name": "Rafal Jakubiak", "phone": "502272244", "email": "rafal.j@op.pl"},
    {"name": "Bartłomiej Barcicki", "phone": "728498010", "email": "bartek.barcicki0202@o2.pL"},
    {"name": "Robert Półrolniczak", "phone": "506170887", "email": "rpolrolniczak123@gmail.com"},
    {"name": "Rafał Brzezina", "phone": "792131081", "email": "mercyk73@o2.pl"},
    {"name": "Ciszczoń Krzysztof", "phone": "606585475", "email": "czystyispec@poczta.onet.pl"},
    {"name": "Robert Kuźnik", "phone": "661021280", "email": "largo23@o2.pl"},
    {"name": "Konrad Grabicki", "phone": "884914114", "email": "konradgrabicki@gmail.com"},
    {"name": "Karol Baczyński", "phone": "794049534", "email": "rzeczoznawca@karolbaczynski.pl"},
    {"name": "Tomasz Duda", "phone": "570523485", "email": "tomaszd502@wp.pl"},
    {"name": "Kosela krystian", "phone": "668791135", "email": "kosela_krystian@o2.pl"},
    {"name": "Arkadiusz Walczak", "phone": "606337816", "email": "arekmarmaris@gmail.com"},
    {"name": "Jacek Cichocki", "phone": "512463408", "email": "j.cich@op.pl"},
    {"name": "Dawid Krzysztala", "phone": "884283684", "email": "kontakt@autoscanning.pl"},
    {"name": "Mateusz Wasilewski", "phone": "605539157", "email": "rzeczoznawca.wasilewski@gmail.com"},
    {"name": "Grzegorz Lesiuk", "phone": "690000595", "email": "biuro@truck-exp.pl"},
    {"name": "kamil sajdak", "phone": "452888451", "email": "Marcin.bojaczuk@op.pl"},
    {"name": "Marcin Bojaczuk", "phone": "793730348", "email": "Marcin.bojaczuk@op.pl"},
    {"name": "Sławomir potykus", "phone": "604244490", "email": "primavera.cars@wp.pl"},
    {"name": "Tomasz Dziadczykowski", "phone": "602399311", "email": "temek78@interia.pl"},
    {"name": "Leszek Bednarski", "phone": "508044838", "email": "szkody.leszek1976@gmail.com"},
    {"name": "Bartłomiej Szadkowski", "phone": "784595505", "email": "autoexpertlodz@gmail.com"},
    {"name": "Hubert Kozieł", "phone": "608592779", "email": "opinie.kielce@gmail.com"},
    {"name": "DANIEL BEDYK", "phone": "887788776", "email": "daniel.bedyk@gmail.com"},
    {"name": "Tomasz Stachurski", "phone": "693175750", "email": "tomasz.stachurski82@gmail.com"},
    {"name": "Ivan Halaburda", "phone": "452330653", "email": "halaburda.john@gmail.com"},
    {"name": "Konrad GajewskI", "phone": "883981144", "email": "conrados69@gmail.com"},
    {"name": "Marcin Kwiatkowski", "phone": "669109848", "email": "669109848"},
    {"name": "Kamil Muras", "phone": "732500055", "email": "biuro.elmurasso@gmail.com"},
    {"name": "RAFAŁ WRONA", "phone": "605600570", "email": "MCROW@O2.PL"},
    {"name": "Piotr Drozd", "phone": "798018114", "email": "pio.drozd@gmail.com"},
    {"name": "Radosław Bobowski", "phone": "509577213", "email": "adus121@onet.pl"},
    {"name": "Grzegorz jędrzejczak", "phone": "536015839", "email": "gregor119191@gmail.com"},
    {"name": "Krzysztof Nowacki", "phone": "696176202", "email": "krz.nowacki@gmail.com"},
    {"name": "Piotr Chruślak", "phone": "790850530", "email": "inz.p@wp.pl"},
    {"name": "Daniel Łukowiak", "phone": "723264702", "email": "daniellos11211@gmail.com"},
    {"name": "Daniel Filoniuk", "phone": "794497144", "email": "danielfiloniuk@onet.pl"},
    {"name": "Zbigniew Pietrasiak", "phone": "601226161", "email": "zpietrasiak@gmail.com"},
    {"name": "Jarosław Osak", "phone": "518926296", "email": "jarekosak@gmail.com"},
    {"name": "Artur Melechowicz", "phone": "666159516", "email": "melechowicz-rzeczoznawca@wp.pl"},
    {"name": "Michał Pietrasiak", "phone": "509038811", "email": "michal.pietrasiak@gmail.com"},
    {"name": "Grzegorz Grabowski", "phone": "535344434", "email": "moto.expert.gdynia@gmail.com"},
    {"name": "Tomasz Mądry", "phone": "516462327", "email": "madry.tomasz@o2.pl"},
    {"name": "Maciej Zarębski", "phone": "501185345", "email": "perfectdetailingwwa@gmail.com"},
    {"name": "Jerzy Dudek", "phone": "601988226", "email": "aurus.sos@gmail.com"},
    {"name": "Krzysztof Janicki", "phone": "698077148", "email": "zyziu997@wp.pl"},
    {"name": "Jakub Grzebiennik", "phone": "533235917", "email": "jakubgrzebiennik@gmail.com"},
    {"name": "Michał Kowalówka", "phone": "570285245", "email": "michalkowalowka75@gmail.com"},
    {"name": "Marcin Dwojewski", "phone": "510191440", "email": "marcindwojewski@gmail.com"},
    {"name": "Sebastian Marszał", "phone": "508084109", "email": "sebastianmarszal@wp.pl"},
    {"name": "maka", "phone": "515733210", "email": "maka1308@gmail.com"},
    {"name": "Marek Szloński", "phone": "577141513", "email": "Szmarek72@interia.pl"},
    {"name": "Stańko Łukasz", "phone": "512286056", "email": "stanko.lukasz@gmail.com"},
    {"name": "Dawid Kozioł", "phone": "884194793", "email": "koziol.performance@gmail.com"},
    {"name": "Łukasz Zapadka", "phone": "798799949", "email": "zapadka1108@gmail.com"},
    {"name": "Gadomski Mateusz", "phone": "798316075", "email": "mateusz.gadomski@wp.pl"},
    {"name": "Sławomir Osiński", "phone": "509185837", "email": "slawomir.osinski@gmail.com"},
    {"name": "Łukasz Dybciak", "phone": "725419498", "email": "lukasz.dybciak@wp.pl"},
    {"name": "Kamil Wieczorek", "phone": "797576846", "email": "rzeczoznawcammz@gmail.com"},
    {"name": "BARTOSZ WNUK", "phone": "793031189", "email": "wnuk.bartosz1@gmail.com"},
    {"name": "Adrian Piątek", "phone": "601703010", "email": "adinik@wp.pl"},
    {"name": "DARIUSZ MAŁYSZ", "phone": "888760212", "email": "dmd@interia.pl"},
    {"name": "Rafał Pelczar", "phone": "692376595", "email": "rafal.pelczar@tlen.pl"},
    {"name": "ŁUKASZ KAMINSKI", "phone": "600441027", "email": "lukasz1111@gmail.com"},
    {"name": "Karol Styp", "phone": "889959368", "email": "likwidacja.komunikacyjne@wp.pl"},
    {"name": "Maciej Czubalski", "phone": "730414106", "email": "maciek.czubalski@gmail.com"},
    {"name": "REMIGIUSZ BRZYCYN", "phone": "667063608", "email": "remigiusz1239@wp.pl"},
    {"name": "Karol ŻURKOWSKI", "phone": "695986269", "email": "k.zurkowski@gmail.com"},
    {"name": "Patryk Koniec", "phone": "504594958", "email": "patryk.koniec@onet.pl"},
    {"name": "Paweł Gaj", "phone": "723971105", "email": "gajpawel06@gmail.com"},
    {"name": "BARTOSZ CICH", "phone": "668383675", "email": "bartoszcich@gmail.com"},
    {"name": "MARCIN PAPAS", "phone": "791288296", "email": "lobodam@gmail.com"},
    {"name": "ANTONIUS LIMANSKI", "phone": "516281366", "email": "antoniuslimanski@gmail.com"},
    {"name": "STASZEK", "phone": "512890349", "email": "Kosztorysywarsztat@gmail.com"},
    {"name": "MICHAŁ OPOLE", "phone": "691974876", "email": "Biuro.expert@op.pl"}
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
