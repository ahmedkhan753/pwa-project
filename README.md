# Auto-Inspection PWA + Report Suite

A field-to-report platform for vehicle appraisers (Polish market, **Zaufaj
Rzeczoznawcy**). Inspectors complete vehicle inspections on a Progressive
Web App, the backend submits the data to Bitrix24 CRM and persists a
local copy, and downstream pages render web reports and downloadable PDFs
for the client and the workshop.

```
                                      ┌─────────────────────┐
 Inspector (mobile PWA)  ──submit──▶  │  FastAPI backend    │ ──┐
                                      │  Python 3.13        │   │ Bitrix24 REST
 Admin (browser)         ──edit──▶    │  SQLAlchemy / SQLite│ ◀─┘ (OAuth + webhook)
                                      └─────────────────────┘
                                                │
                       ┌────────────────────────┼────────────────────────┐
                       ▼                        ▼                        ▼
              /report/{dealId}        /kosztorys/{dealId}         /api/.../pdf
              (condition report)      (Eurotax + above-norm)      (downloadable)
```

## Highlights

| Area | What it does |
|---|---|
| **Inspection PWA** | Multi-step capture (vehicle, paint, mechanical, tires, equipment, damages with photos, signatures) with offline draft persistence and resync on reconnect. |
| **Bitrix24 integration** | Dynamic field discovery — zero hard-coded UF_CRM IDs. Lazy re-init on transient DNS/network failures so the workers never get stuck in a degraded mode after a flaky startup. |
| **Condition Report** | Public read-only HTML report at `/report/{dealId}`. Admin edit at `/admin/reports/{dealId}` covers vehicle data, paint µm measurements, tires, mechanical, photo replacement, document upload (CEPIK, Historia Szkodowości), hero photo selection, signatures. |
| **Eurotax kosztorys** | Server-side parser for two PDF formats (classic brutto/VAT + newer `nr34` netto/urealnienie). A `detect_format()` dispatcher routes each PDF to the right parser. Output mirrors the on-screen layout at `/kosztorys/{dealId}`. |
| **Above-norm cost engine** | Order-level inputs (labour rate, depreciation %, material cost) plus per-part qualification, repair time and parts cost. Backend `_recompute()` is the source of truth — koszty naprawy / amortyzacja / netto / VAT 23% / brutto are derived deterministically on every PUT. |
| **Downloadable PDFs** | Reusable reportlab-based generators: `protokol_wycena_pdf.py` (appraisal), `kosztorys_pdf.py` (above-norm + Eurotax + summary). Photos are loaded directly from SQLAlchemy (no HTTP round-trip — see the dedicated section below). |

## Tech Stack

**Frontend** — Next.js 14 (App Router), React 18, Tailwind CSS, Zustand
(persisted), html2pdf.js, html5-qrcode + ZXing/Tesseract for VIN / Aztec
decoding, react-signature-canvas.

**Backend** — FastAPI, SQLAlchemy (SQLite by default; Postgres via
`DATABASE_URL`), Pydantic v2, httpx, reportlab, pdfplumber, zxing-cpp +
OpenCV (server-side barcode decoding), passlib (bcrypt).

**Infra** — Docker / docker-compose, Nginx (TLS terminator + `/api` →
backend routing).

## Repository Layout

```
.
├── backend/
│   ├── main.py                  # FastAPI app, startup lifespan, exception handlers
│   ├── database.py              # SQLAlchemy engine + lightweight migrate_db()
│   ├── deps.py                  # auth + DB dependencies
│   ├── models/
│   │   └── inspector.py         # InspectionRecord, InspectionPhoto, KosztorysCost, …
│   ├── routers/
│   │   ├── admin.py             # admin login (JWT)
│   │   ├── admin_reports.py     # CR admin editor backend (paths, schema, audit)
│   │   ├── auth.py              # inspector phone+PIN auth
│   │   ├── deals.py             # Bitrix deal list + single deal lookup
│   │   ├── files.py             # binary upload-binary path for photos / videos
│   │   ├── inspection.py        # submit + stored inspection PDF
│   │   ├── kosztorys.py         # Eurotax kosztorys read endpoint (PDF dispatch)
│   │   ├── kosztorys_costs.py   # above-norm cost layer (engine, GET, PUT, PDF)
│   │   ├── metadata.py          # PWA dropdown options
│   │   ├── report.py            # public condition report + gallery
│   │   └── webhook.py           # Bitrix outgoing webhook (doc sync, kosztorys URL)
│   └── services/
│       ├── bitrix_discovery.py  # dynamic UF_CRM field map
│       ├── bitrix_gateway.py    # httpx-async Bitrix client (retries + fast-fail timeouts)
│       ├── bitrix_oauth.py      # OAuth token + refresh
│       ├── bitrix_disk.py       # disk.file.upload + show_file.php downloads
│       ├── eurotax_format.py    # PDF format detector (original vs nr34)
│       ├── eurotax_parser.py    # original (brutto/VAT) parser
│       ├── eurotax_nr34_parser.py  # netto/urealnienie parser
│       ├── pdf_generator.py     # shared reportlab helpers (load_image, _fn, fmt_date)
│       ├── protokol_wycena_pdf.py  # appraisal PDF
│       └── kosztorys_pdf.py     # above-norm kosztorys PDF
│
├── src/                         # Next.js (App Router)
│   ├── app/
│   │   ├── api/                 # Next.js proxies to FastAPI (kosztorys, kosztorys-costs, report, …)
│   │   ├── admin/               # /admin login, list, /admin/reports/[dealId], /admin/kosztorys/[dealId]
│   │   ├── dashboard/           # inspector dashboard (deal list / calendar)
│   │   ├── gallery/[dealId]/    # photo gallery
│   │   ├── inspection/[id]/     # multi-step inspection PWA
│   │   ├── kosztorys/[dealId]/  # public Eurotax + above-norm cost report
│   │   └── report/[dealId]/     # public condition report
│   ├── components/              # inspection wizard + shared UI
│   ├── store/                   # zustand stores (inspection + drafts)
│   └── types/                   # KosztorysData, MacadamData (cost-engine contract)
│
├── docker-compose.yml
└── package.json
```

## Quick Start

### Local development (no Docker)

```bash
# Frontend
npm install
npm run dev                      # http://localhost:3000

# Backend (separate terminal)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload        # http://localhost:8000
```

The frontend's `/api/*` proxies forward to `BACKEND_URL` (defaults to
`http://backend:8000`).

### Docker workflow

```bash
docker-compose up --build        # http://localhost:3000
```

In production the same compose stack sits behind Nginx — `/api/*`
requests get the `/api` prefix stripped before forwarding to FastAPI, so
backend routers register themselves at the path Nginx forwards (e.g.
`kosztorys.py` uses `prefix="/kosztorys"`, not `"/api/kosztorys"`).

## Environment Variables

| Variable | Purpose |
|---|---|
| `BACKEND_URL` | Next.js → backend forward target. Defaults `http://backend:8000` (Docker service name). |
| `NEXT_PUBLIC_API_URL` | Browser-facing API base. Usually `https://<host>/api`. |
| `DATABASE_URL` | SQLAlchemy URL. Defaults `sqlite:///./inspectors.db`. |
| `BITRIX_WEBHOOK_URL` | Bitrix24 incoming webhook URL (used by gateway as a fallback). |
| `BITRIX_APP_ID` / `BITRIX_APP_SECRET` | OAuth credentials for the local Bitrix app. |
| `BITRIX_EUROTAX_FIELD` | UF_CRM field holding the Eurotax PDF (default `UF_CRM_1775497355115`). |
| `BITRIX_KOSZTORYS_URL_FIELD` | UF_CRM field receiving the public kosztorys URL. |
| `PUBLIC_APP_BASE` | Public origin (used for outbound URLs sent to Bitrix). |
| `JWT_SECRET` | Admin session signing key. |

## Cost Engine (Above-Norm Kosztorys)

The engine that drives `/admin/kosztorys/{dealId}` and the
`USZKODZENIA PONADNORMATYWNE` section of the public report.

**Order-level inputs** — labour rate (PLN/h), depreciation % (0..100),
material cost (PLN).

**Per-part inputs** — `qualification` ∈ `{lakierowanie | naprawa |
wymiana | akceptowalne}`, `repair_time_h`, `parts_cost_pln`,
`is_manual`.

**Rules** (mirrored exactly by the Python backend `_recompute()` and
the TypeScript `computePartCosts()`; the backend is the source of truth
on PUT):

```
labour       = repair_time_h × labour_rate
akceptowalne → koszty_naprawy = 0,         amortyzacja = 0,           netto = 0
naprawa /    → koszty_naprawy = labour,    amortyzacja = labour × d,  netto = labour × (1 − d)
 lakierowanie
wymiana      → koszty_naprawy = labour + parts_cost,
               amortyzacja  = labour × d        (parts NOT depreciated),
               netto        = labour × (1 − d) + parts_cost
is_manual    → fixed = parts_cost_pln, treated like labour:
               koszty_naprawy = fixed, amortyzacja = fixed × d, netto = fixed × (1 − d)

Material (order-level) added straight to net + koszty_naprawy headline,
NOT depreciated.

gross = netto × 1.23  (VAT 23%).  All money rounded to 2 decimals.
```

## Kosztorys PDF — Photo Loading Note

`backend/services/kosztorys_pdf.py` loads photos **directly from
SQLAlchemy** rather than fetching its own `/api/gallery/...` URLs over
HTTP. An earlier HTTP-based approach deadlocked: when `build_kosztorys_pdf`
runs inside the same uvicorn worker that's serving the PDF request, an
in-process httpx GET back to `/gallery` on the same server can't be
served until the current request returns → 504.

The DB loaders mirror the gallery route's queries exactly:

- `/gallery/{deal_id}/damage/{ext|int}/{i}/{j}` → `InspectionRecord
  .{exterior|interior}_damage_json` → `damages[i]["photos"][j]` (base64
  string, optionally `data:image/...;base64,` prefixed) → bytes.
- `/gallery/{deal_id}/media/{slot_id}` → `InspectionPhoto.photo_bytes`.

Genuine external URLs (real http(s) / data:) still flow through the
shared `load_image_from_source` httpx path with a short 4s/2s timeout.

## Verifying a Build

```bash
# Backend
python -c "import main"
python -c "import services.kosztorys_pdf"
python -c "import routers.deals"

# Frontend
npx tsc --noEmit
npm run build
```

## License

Proprietary — © Zaufaj Rzeczoznawcy Sp. z o.o.
