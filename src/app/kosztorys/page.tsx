'use client';
import React, { useState, useRef, useCallback } from 'react';

/* ═══════════════════════════════════════════════════════════════
   KOSZTORYS REPORT — Static Demo (ŠKODA Superb IV)
   Professional repair cost estimate page with ZR branding.
   Data source: Eurotax PDF + PWA inspection photos.
   Polish labels. Publicly accessible, no auth.
   ═══════════════════════════════════════════════════════════════ */

// ─── Vehicle Data ─────────────────────────────────────────────────────────────

const VEHICLE = {
  make: 'ŠKODA',
  model: 'Superb IV',
  variant: '1.5 TSI mHEV Selection',
  vin: 'TMBAN8NZ6TC021997',
  etgCode: '0162524',
  registration: 'WI 746RH',
  group: 'Pojazd używany',
  mileage: '4 369 km',
  firstRegistration: '10/2025',
  color: 'Srebrny (DXDB)',
  customer: 'Zaufaj Rzeczoznawcy',
  expertiseDate: '08-03-2026',
  address: 'Warszawa',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface DamageItem {
  id: number;
  name: string;
  damageType: string;
  size: string;
  repairMode: string;
  repairDegree: string;
  sheetMetalLabor: number;
  paintingLabor: number;
  material: number;
  partsCost: number;
  totalCost: number;
  amortPct: number;
  isInterior: boolean;
  comment?: string;
  photos: string[];   // paths under /skoda/
}

// ─── Damage Data (from Eurotax PDF) ───────────────────────────────────────────

const DAMAGES: DamageItem[] = [
  {
    id: 1,
    name: 'Napis (emblemat)',
    damageType: 'Zarysowanie / brak',
    size: '~12 cm',
    repairMode: 'Wymiana',
    repairDegree: 'WY',
    sheetMetalLabor: 60.00,
    paintingLabor: 0,
    material: 0,
    partsCost: 116.99,
    totalCost: 176.99,
    amortPct: 0,
    isInterior: false,
    comment: 'Nr części: 3P38536876DH',
    photos: ['/skoda/dmg-badge-area.jpg', '/skoda/dmg-badge-scratch.jpg', '/skoda/dmg-rear-overview.jpg'],
  },
  {
    id: 2,
    name: 'Drzwi tylne K (L)',
    damageType: 'Zarysowanie(a)',
    size: '>0,5 cm – 2 cm',
    repairMode: 'Lakierowanie (naprawa III)',
    repairDegree: 'III',
    sheetMetalLabor: 0,
    paintingLabor: 320.00,
    material: 436.05,
    partsCost: 0,
    totalCost: 756.05,
    amortPct: 0,
    isInterior: false,
    photos: ['/skoda/dmg-door-L.jpg', '/skoda/dmg-door-scratch.jpg', '/skoda/dmg-measure.jpg'],
  },
  {
    id: 3,
    name: 'Błotnik tylny K (L)',
    damageType: 'Wgniecenie / zarysowanie',
    size: '>2 cm – 8 cm',
    repairMode: 'Lakierowanie (naprawa I)',
    repairDegree: 'I',
    sheetMetalLabor: 0,
    paintingLabor: 620.00,
    material: 738.60,
    partsCost: 0,
    totalCost: 1358.60,
    amortPct: 0,
    isInterior: false,
    photos: ['/skoda/dmg-fender-L.jpg', '/skoda/dmg-door-L.jpg', '/skoda/dmg-measure.jpg'],
  },
  {
    id: 4,
    name: 'Drzwi tylne z ramą okna',
    damageType: 'Zarysowanie(a)',
    size: '>0,5 cm – 1 cm',
    repairMode: 'Lakierowanie (naprawa II)',
    repairDegree: 'II',
    sheetMetalLabor: 0,
    paintingLabor: 180.00,
    material: 501.45,
    partsCost: 0,
    totalCost: 681.45,
    amortPct: 0,
    isInterior: false,
    photos: ['/skoda/dmg-door-scratch.jpg', '/skoda/dmg-door-L.jpg'],
  },
  {
    id: 5,
    name: 'Seat bolster — siedzisko kierowcy',
    damageType: 'Przetarcie / drobne uszkodzenie',
    size: '<1 cm',
    repairMode: 'Naprawa kosmetyczna',
    repairDegree: '—',
    sheetMetalLabor: 0,
    paintingLabor: 0,
    material: 0,
    partsCost: 0,
    totalCost: 0,
    amortPct: 0,
    isInterior: true,
    comment: 'Drobne przetarcie tapicerki — nie ujęte w kosztorysie',
    photos: ['/skoda/dmg-seat.jpg'],
  },
];

// Additional prep cost (from Eurotax: Przygotowanie blacha)
const PREP_LABOR   = 460.00;
const PREP_MAT     = 192.50;
const PREP_TOTAL   = PREP_LABOR + PREP_MAT;   // 652.50
const SMALL_PARTS  = 2.34;                     // 2% materiał drobny

// ─── Supporting Data ──────────────────────────────────────────────────────────

const TIRES = [
  { location:'Przód', position:'Lewy',  tread:'8,0 mm', producer:'Continental', dimensions:'235/45 R 18 98 Y', season:'Całoroczne', rim:'Aluminiowe', runflat:'Nie' },
  { location:'Przód', position:'Prawy', tread:'8,0 mm', producer:'Continental', dimensions:'235/45 R 18 98 Y', season:'Całoroczne', rim:'Aluminiowe', runflat:'Nie' },
  { location:'Tył',  position:'Lewy',  tread:'8,0 mm', producer:'Continental', dimensions:'235/45 R 18 98 Y', season:'Całoroczne', rim:'Aluminiowe', runflat:'Nie' },
  { location:'Tył',  position:'Prawy', tread:'8,0 mm', producer:'Continental', dimensions:'235/45 R 18 98 Y', season:'Całoroczne', rim:'Aluminiowe', runflat:'Nie' },
];

const EQUIPMENT: [string, string][] = [
  ['ABS / ESP',                       'Tak'],
  ['Kamera cofania',                  'Tak'],
  ['Klimatyzacja automatyczna 2-str.','Tak'],
  ['Elektryczne szyby (4x)',          'Tak'],
  ['Bezkluczykowy dostęp i zapłon',   'Tak'],
  ['Tempomat adaptacyjny',            'Tak'],
  ['Typ reflektorów',                 'LED'],
  ['Nawigacja GPS',                   'Tak'],
  ['Ekran multimedialny',             'Tak'],
  ['Podgrzewane fotele',              'Tak'],
  ['Wspomaganie kierownicy',          'Elektryczne'],
  ['Czujniki parkowania P+T',         'Tak'],
  ['Bluetooth / USB',                 'Tak'],
  ['Typ tapicerki',                   'Materiałowa'],
  ['Felgi aluminiowe',                'Tak'],
  ['Typ haka holowniczego',           'Brak'],
  ['System hybrydowy',                'mHEV 48V'],
  ['Start / Stop',                    'Tak'],
  ['Head-up display',                 'NIE'],
  ['Kabli ładowania',                 '0'],
];

const DOCUMENTS: [string, string][] = [
  ['Łączna liczba kluczy',            '2 + 1 mechaniczny'],
  ['Instrukcja obsługi',              'Tak'],
  ['Dowód rejestracyjny',             'Tak'],
  ['Oryginalny kluczyk smart',        'Tak'],
  ['Typ książki serwisowej',          'Elektroniczna'],
  ['Koło zapasowe (dojazdowe)',       'Tak'],
  ['Podnośnik i narzędzia',          'Tak'],
];

const NAV_ITEMS = [
  { id: 'expertise',  label: 'Szczegóły ekspertyzy' },
  { id: 'costs',      label: 'Zestawienie kosztów'  },
  { id: 'documents',  label: 'Dokumenty'             },
  { id: 'equipment',  label: 'Wyposażenie'           },
  { id: 'tires',      label: 'Opony'                 },
  { id: 'damage',     label: 'Uszkodzenia'           },
  { id: 'photos',     label: 'Zdjęcia podstawowe'   },
];

// Hero + basic photo lists
const HERO_PHOTOS = [
  '/skoda/front.jpg',
  '/skoda/front-left.jpg',
  '/skoda/front-right.jpg',
  '/skoda/side-left.jpg',
  '/skoda/rear.jpg',
];

const BASIC_PHOTOS: { src: string; label: string }[] = [
  { src: '/skoda/front.jpg',             label: 'Przód' },
  { src: '/skoda/front-left.jpg',        label: 'Przód lewy' },
  { src: '/skoda/front-right.jpg',       label: 'Przód prawy' },
  { src: '/skoda/side-left.jpg',         label: 'Bok lewy' },
  { src: '/skoda/rear-left.jpg',         label: 'Tył lewy' },
  { src: '/skoda/rear.jpg',              label: 'Tył' },
  { src: '/skoda/rear-right.jpg',        label: 'Tył prawy' },
  { src: '/skoda/side-right.jpg',        label: 'Bok prawy' },
  { src: '/skoda/rear-left2.jpg',        label: 'Tył lewy (2)' },
  { src: '/skoda/hood.jpg',              label: 'Pokrywa silnika' },
  { src: '/skoda/engine.jpg',            label: 'Komora silnika' },
  { src: '/skoda/vin-engine.jpg',        label: 'VIN — komora' },
  { src: '/skoda/vin-door.jpg',          label: 'VIN — naklejka' },
  { src: '/skoda/cluster.jpg',           label: 'Zegary / przebieg' },
  { src: '/skoda/interior-full.jpg',     label: 'Wnętrze — panorama' },
  { src: '/skoda/interior-front.jpg',    label: 'Wnętrze — przód L' },
  { src: '/skoda/interior-center.jpg',   label: 'Multimedia' },
  { src: '/skoda/interior-console.jpg',  label: 'Konsola / kierownica' },
  { src: '/skoda/interior-rear.jpg',     label: 'Wnętrze — tył' },
  { src: '/skoda/interior-rear-ac.jpg',  label: 'Klimatyzacja tył' },
  { src: '/skoda/door-panel.jpg',        label: 'Panel drzwi' },
  { src: '/skoda/boot.jpg',              label: 'Bagażnik' },
  { src: '/skoda/spare.jpg',             label: 'Koło zapasowe' },
  { src: '/skoda/docs.jpg',              label: 'Dokumenty + kluczyki' },
  { src: '/skoda/docs2.jpg',             label: 'Dowód rejestracyjny' },
  { src: '/skoda/manual.jpg',            label: 'Instrukcja obsługi' },
  { src: '/skoda/floor-driver.jpg',      label: 'Dywanik — kierowca' },
  { src: '/skoda/floor-rear.jpg',        label: 'Dywanik — tył' },
  { src: '/skoda/bumper-front.jpg',      label: 'Zderzak przedni' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' PLN';

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({ photos, start, onClose }: { photos: string[]; start: number; onClose: () => void }) {
  const [idx, setIdx] = useState(start);
  const touchX = useRef<number | null>(null);

  const prev = () => setIdx(i => Math.max(i - 1, 0));
  const next = () => setIdx(i => Math.min(i + 1, photos.length - 1));

  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft')  prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.92)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
      onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (dx > 50) prev();
        if (dx < -50) next();
        touchX.current = null;
      }}
    >
      <img
        src={photos[idx]} alt=""
        style={{ maxWidth: '92vw', maxHeight: '82vh', objectFit: 'contain', borderRadius: 8 }}
        onClick={e => e.stopPropagation()}
      />
      <div style={{ marginTop: 14, color: '#fff', fontSize: 13, opacity: 0.7 }}>
        {idx + 1} / {photos.length}
      </div>
      {idx > 0 && (
        <button onClick={e => { e.stopPropagation(); prev(); }}
          style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 50, width: 44, height: 44,
            color: '#fff', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          ‹
        </button>
      )}
      {idx < photos.length - 1 && (
        <button onClick={e => { e.stopPropagation(); next(); }}
          style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 50, width: 44, height: 44,
            color: '#fff', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          ›
        </button>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function KosztorysPage() {
  const [heroIdx, setHeroIdx] = useState(0);
  const [lightbox, setLightbox] = useState<{ photos: string[]; start: number } | null>(null);
  const [globalAmort, setGlobalAmort] = useState(0);

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const applyAmort = (cost: number, pct: number) => cost * (pct / 100);
  const netAfterAmort = (cost: number, pct: number) => cost - applyAmort(cost, pct);

  // Exterior damages only for cost table
  const extDamages = DAMAGES.filter(d => !d.isInterior);

  const totalRepairCosts   = extDamages.reduce((s, d) => s + d.totalCost, 0) + PREP_TOTAL;
  const totalSmallParts    = SMALL_PARTS;
  const baseGrandTotal     = totalRepairCosts + totalSmallParts;
  const totalDepreciation  = applyAmort(baseGrandTotal, globalAmort);
  const grandNetTotal      = baseGrandTotal - totalDepreciation;

  return (
    <div style={{ overflowX: 'hidden', width: '100%', maxWidth: '100vw' }}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" />
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" />
      <style dangerouslySetInnerHTML={{ __html: `
        * { box-sizing: border-box; }
        html, body { margin:0; padding:0; font-family:'Inter',system-ui,sans-serif;
          background:#FAFAFA; color:#1D1D1F; overflow-x:hidden; width:100%; max-width:100vw; }
        @media print {
          .no-print { display:none !important; }
          body { background:#fff; }
          .page-container { box-shadow:none !important; }
        }
        .page-container { overflow:hidden; width:100%; }
        .nav-link { color:#6B7280; text-decoration:none; font-size:13px; font-weight:600;
          padding:8px 0; border-bottom:2px solid transparent; transition:all 0.2s; white-space:nowrap; cursor:pointer; }
        .nav-link:hover { color:#1D1D1F; border-bottom-color:#B71C1C; }
        .section-title { font-size:22px; font-weight:800; color:#1D1D1F; margin:0 0 20px;
          text-transform:uppercase; letter-spacing:0.5px; padding-bottom:12px;
          border-bottom:3px solid #B71C1C; display:inline-block; }
        table.data-table { width:100%; border-collapse:collapse; font-size:13px; }
        table.data-table th { text-align:left; padding:10px 12px; background:#F9FAFB; color:#6B7280;
          font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:0.5px;
          border-bottom:2px solid #E5E7EB; }
        table.data-table td { padding:10px 12px; border-bottom:1px solid #F3F4F6; vertical-align:top; }
        table.data-table tr:hover td { background:#FAFAFA; }
        table.data-table .total-row td { font-weight:700; border-top:2px solid #E5E7EB; background:#F9FAFB; }
        .amt { text-align:right; font-variant-numeric:tabular-nums; }
        .green { color:#16A34A; }
        .red { color:#DC2626; }
        .orange { color:#EA580C; }
        .table-scroll { overflow-x:auto; -webkit-overflow-scrolling:touch; }
        .table-scroll table { min-width:580px; }
        .veh-row { display:flex; justify-content:space-between; align-items:flex-start; gap:16px;
          padding:10px 0; border-bottom:1px solid #F3F4F6; }
        .veh-label { color:#6B7280; font-weight:500; font-size:14px; flex-shrink:0; }
        .veh-value { font-weight:600; font-size:14px; text-align:right; overflow-wrap:anywhere;
          word-break:break-word; min-width:0; }
        .hero-thumb { cursor:pointer; border-radius:8px; overflow:hidden; aspect-ratio:4/3;
          border:2px solid transparent; transition:all 0.2s; }
        .hero-thumb:hover { border-color:#B71C1C; }
        .hero-thumb.active { border-color:#B71C1C; }
        .photo-tile { cursor:pointer; border-radius:10px; overflow:hidden; aspect-ratio:4/3;
          background:#F5F5F7; position:relative; }
        .photo-tile img { width:100%; height:100%; object-fit:cover; display:block;
          transition:transform 0.25s; }
        .photo-tile:hover img { transform:scale(1.04); }
        .photo-tile .tile-label { position:absolute; bottom:0; left:0; right:0;
          background:linear-gradient(transparent,rgba(0,0,0,0.55)); color:#fff;
          font-size:10px; font-weight:600; padding:18px 6px 5px; }
        /* ── Mobile ── */
        @media (max-width:768px) {
          .section-title { font-size:18px; margin-bottom:16px; }
          .kosz-section { padding:20px 16px !important; }
          .kosz-hr { margin:0 16px !important; }
          .expertise-grid { grid-template-columns:1fr !important; gap:20px !important; }
          .expertise-grid h1 { font-size:22px !important; }
          .nav-scroll { gap:10px !important; justify-content:flex-start !important; padding:0 4px;
            -ms-overflow-style:none; scrollbar-width:none; }
          .nav-scroll::-webkit-scrollbar { display:none; }
          .nav-link { font-size:11px !important; padding:6px 0 !important; }
          .nav-outer { padding:0 8px !important; gap:8px !important; }
          .print-label { display:none !important; }
          .print-btn { padding:6px 10px !important; min-width:36px; }
          .damage-grid { grid-template-columns:1fr !important; }
          .amort-bar { flex-direction:column !important; gap:12px !important; align-items:stretch !important; }
          .amort-bar input[type=range] { min-width:unset !important; width:100% !important; }
          .grand-total { flex-direction:column !important; gap:8px !important; text-align:center !important; }
          .grand-total span:last-child { font-size:22px !important; }
          .equip-grid { grid-template-columns:1fr !important; }
          .docs-grid { grid-template-columns:1fr !important; }
          .photos-grid { grid-template-columns:repeat(2,1fr) !important; }
          .footer-bar { flex-direction:column !important; gap:8px !important; text-align:center !important; }
          .table-scroll table { min-width:500px; }
          .thumb-grid { grid-template-columns:repeat(3,1fr) !important; }
          .veh-row { padding:8px 0; }
          .veh-label { font-size:13px; }
          .veh-value { font-size:12px; }
          .hero-main { border-radius:10px !important; }
        }
        @media (max-width:480px) {
          .nav-link { font-size:10px !important; }
          .photos-grid { grid-template-columns:repeat(2,1fr) !important; }
          .table-scroll table { min-width:420px; }
          .veh-value { font-size:11px; }
        }
      `}} />

      {/* Lightbox */}
      {lightbox && (
        <Lightbox photos={lightbox.photos} start={lightbox.start} onClose={() => setLightbox(null)} />
      )}

      {/* ─── Sticky Nav ──────────────────────────────────────────────── */}
      <nav className="no-print" style={{ position: 'sticky', top: 0, zIndex: 100, background: '#fff',
        borderBottom: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div className="nav-outer" style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          {/* Logo — dark pill so the white Z is visible */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ background: '#1D1D1F', borderRadius: 8, padding: '4px 10px',
              display: 'flex', alignItems: 'center' }}>
            <img
              src="https://i.postimg.cc/VsgMRGYH/SPROWADZENIE-SAMOCHODOW-Z-USAPOD-DOM-(500-x-500-px)-(800-x-500-px)-(700-x-300-px)-2.png"
              alt="Zaufaj Rzeczoznawcy"
              style={{ height: 30, width: 'auto', objectFit: 'contain', display: 'block' }}
            />
            </div>
          </div>
          <div className="nav-scroll" style={{ display: 'flex', gap: 20, overflow: 'auto', flex: 1, justifyContent: 'center' }}>
            {NAV_ITEMS.map(n => (
              <a key={n.id} className="nav-link" onClick={() => scrollTo(n.id)}>{n.label}</a>
            ))}
          </div>
          <button onClick={() => window.print()} className="no-print print-btn" style={{
            padding: '8px 16px', borderRadius: 8, border: '1.5px solid #D1D5DB', background: '#fff',
            color: '#374151', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, transition: 'all 0.2s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = '#F3F4F6'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
          >
            <i className="fas fa-print" style={{ fontSize: 13 }} />
            <span className="print-label">Drukuj</span>
          </button>
        </div>
      </nav>

      <div className="page-container" style={{ maxWidth: 1100, margin: '0 auto', background: '#fff',
        minHeight: '100vh', boxShadow: '0 0 40px rgba(0,0,0,0.06)' }}>

        {/* ═══ SECTION 1: EXPERTISE ════════════════════════════════════ */}
        <section id="expertise" className="kosz-section" style={{ padding: '32px 40px' }}>
          <div style={{ display: 'inline-block', background: '#B71C1C', color: '#fff',
            padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 700,
            letterSpacing: 1, textTransform: 'uppercase', marginBottom: 20 }}>
            Ekspertyza — Eurotax
          </div>

          <div className="expertise-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
            {/* Hero photo carousel */}
            <div>
              <div className="hero-main" style={{ borderRadius: 12, overflow: 'hidden',
                aspectRatio: '4/3', background: '#F5F5F7', cursor: 'pointer', marginBottom: 10 }}
                onClick={() => setLightbox({ photos: HERO_PHOTOS, start: heroIdx })}>
                <img src={HERO_PHOTOS[heroIdx]} alt="ŠKODA Superb"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </div>
              <div className="thumb-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6 }}>
                {HERO_PHOTOS.map((src, i) => (
                  <div key={i}
                    className={`hero-thumb${i === heroIdx ? ' active' : ''}`}
                    onClick={() => setHeroIdx(i)}>
                    <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                ))}
              </div>
            </div>

            {/* Vehicle details */}
            <div>
              <h1 style={{ margin: '0 0 4px', fontSize: 28, fontWeight: 900, color: '#1D1D1F' }}>
                {VEHICLE.make} {VEHICLE.model}
              </h1>
              <div style={{ fontSize: 15, color: '#6B7280', fontWeight: 500, marginBottom: 24 }}>
                {VEHICLE.variant}
              </div>
              <div style={{ marginBottom: 24 }}>
                {([
                  ['VIN',                  VEHICLE.vin],
                  ['Kod ETG',              VEHICLE.etgCode],
                  ['Nr rejestracyjny',     VEHICLE.registration],
                  ['Przebieg',             VEHICLE.mileage],
                  ['Pierwsza rejestracja', VEHICLE.firstRegistration],
                  ['Kolor nadwozia',       VEHICLE.color],
                  ['Klient',               VEHICLE.customer],
                  ['Data ekspertyzy',      VEHICLE.expertiseDate],
                  ['Adres oględzin',       VEHICLE.address],
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k} className="veh-row">
                    <span className="veh-label">{k}</span>
                    <span className="veh-value"
                      style={{ fontFamily: k === 'VIN' ? 'monospace' : undefined,
                               fontSize:   k === 'VIN' ? 13 : undefined }}>
                      {v}
                    </span>
                  </div>
                ))}
              </div>
              {/* Eurotax badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                borderRadius: 8, background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                <i className="fas fa-file-invoice-dollar" style={{ color: '#16A34A', fontSize: 16 }} />
                <div>
                  <div style={{ fontSize: 11, color: '#16A34A', fontWeight: 700 }}>EUROTAX — System lakierniczy AZT</div>
                  <div style={{ fontSize: 11, color: '#6B7280' }}>Baza: 2026.03  |  Waluta: PLN  |  Logika: ETG</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <hr className="kosz-hr" style={{ margin: '0 40px', border: 'none', borderTop: '1px solid #E5E7EB' }} />

        {/* ═══ SECTION 2: COST OVERVIEW ════════════════════════════════ */}
        <section id="costs" className="kosz-section" style={{ padding: '32px 40px' }}>
          <div className="section-title">ZESTAWIENIE KOSZTÓW</div>

          {/* Amortisation slider */}
          <div className="no-print amort-bar" style={{ marginBottom: 24, padding: '16px 20px', borderRadius: 12,
            background: 'linear-gradient(135deg,#FEF2F2,#FFFBEB)', border: '1.5px solid rgba(183,28,28,0.15)',
            display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <i className="fas fa-calculator" style={{ color: '#B71C1C', fontSize: 18 }} />
              <span style={{ fontWeight: 700, fontSize: 14 }}>Amortyzacja:</span>
            </div>
            <input type="range" min={0} max={50} value={globalAmort}
              onChange={e => setGlobalAmort(Number(e.target.value))}
              style={{ flex: 1, minWidth: 150, accentColor: '#B71C1C' }} />
            <div style={{ background: '#B71C1C', color: '#fff', padding: '6px 14px',
              borderRadius: 8, fontWeight: 800, fontSize: 16, minWidth: 60, textAlign: 'center' }}>
              {globalAmort}%
            </div>
          </div>

          {/* Main cost table */}
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>#</th>
                  <th>Część / Uszkodzenie</th>
                  <th>Stopień / Tryb naprawy</th>
                  <th className="amt">Koszt naprawy</th>
                  <th className="amt">Amortyzacja</th>
                  <th className="amt">Koszt netto</th>
                </tr>
              </thead>
              <tbody>
                {extDamages.map(d => {
                  const dep = applyAmort(d.totalCost, globalAmort);
                  const net = d.totalCost - dep;
                  return (
                    <tr key={d.id}>
                      <td style={{ fontWeight: 600, color: '#6B7280' }}>{d.id}</td>
                      <td style={{ fontWeight: 600 }}>{d.name}</td>
                      <td style={{ color: '#6B7280' }}>{d.repairDegree} — {d.repairMode}</td>
                      <td className="amt">{fmt(d.totalCost)}</td>
                      <td className="amt red">{fmt(dep)}</td>
                      <td className="amt" style={{ fontWeight: 700 }}>{fmt(net)}</td>
                    </tr>
                  );
                })}
                {/* Prep row */}
                <tr>
                  <td style={{ fontWeight: 600, color: '#6B7280' }}>—</td>
                  <td style={{ fontWeight: 600 }}>Przygotowanie blachy (na pojeździe)</td>
                  <td style={{ color: '#6B7280' }}>II — Naprawa</td>
                  <td className="amt">{fmt(PREP_TOTAL)}</td>
                  <td className="amt red">{fmt(applyAmort(PREP_TOTAL, globalAmort))}</td>
                  <td className="amt" style={{ fontWeight: 700 }}>{fmt(netAfterAmort(PREP_TOTAL, globalAmort))}</td>
                </tr>
                <tr className="total-row">
                  <td colSpan={3} />
                  <td className="amt">{fmt(totalRepairCosts)}</td>
                  <td className="amt red">{fmt(applyAmort(totalRepairCosts, globalAmort))}</td>
                  <td className="amt" style={{ color: '#B71C1C' }}>{fmt(netAfterAmort(totalRepairCosts, globalAmort))}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* INNE — small parts */}
          <h3 style={{ fontSize: 18, fontWeight: 800, marginTop: 36, marginBottom: 16, color: '#1D1D1F' }}>INNE</h3>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Pozycja</th>
                  <th>Opis</th>
                  <th className="amt">Koszt</th>
                  <th className="amt">Amortyzacja</th>
                  <th className="amt">Koszt netto</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 600 }}>Mat. drobne i dodatkowe</td>
                  <td style={{ color: '#6B7280' }}>2,00 % materiałów</td>
                  <td className="amt">{fmt(SMALL_PARTS)}</td>
                  <td className="amt red">{fmt(applyAmort(SMALL_PARTS, globalAmort))}</td>
                  <td className="amt" style={{ fontWeight: 700 }}>{fmt(netAfterAmort(SMALL_PARTS, globalAmort))}</td>
                </tr>
                <tr className="total-row">
                  <td colSpan={2} style={{ color: '#16A34A', fontWeight: 700 }}>Łączne koszty dodatkowe</td>
                  <td className="amt">{fmt(SMALL_PARTS)}</td>
                  <td className="amt red">{fmt(applyAmort(SMALL_PARTS, globalAmort))}</td>
                  <td className="amt" style={{ color: '#B71C1C' }}>{fmt(netAfterAmort(SMALL_PARTS, globalAmort))}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Grand Total */}
          <div className="grand-total" style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', padding: '20px 24px', borderRadius: 14,
            background: 'linear-gradient(135deg,#F0FDF4,#ECFDF5)', border: '2px solid #86EFAC' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, textTransform: 'uppercase', color: '#1D1D1F' }}>
                ŁĄCZNY KOSZT NETTO
              </div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>bez VAT · system AZT / ETG Eurotax</div>
            </div>
            <span style={{ fontSize: 32, fontWeight: 900, color: '#16A34A' }}>{fmt(grandNetTotal)}</span>
          </div>

          {/* VAT info */}
          <div style={{ marginTop: 10, display: 'flex', gap: 16, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {[
              ['VAT 23%', fmt(grandNetTotal * 0.23)],
              ['Koszt z VAT', fmt(grandNetTotal * 1.23)],
            ].map(([k, v]) => (
              <div key={k} style={{ background: '#F9FAFB', borderRadius: 8, padding: '8px 16px',
                fontSize: 13, fontWeight: 700, border: '1px solid #E5E7EB' }}>
                <span style={{ color: '#6B7280', fontWeight: 500 }}>{k}: </span>{v}
              </div>
            ))}
          </div>

          {/* Labor costs */}
          <h3 style={{ fontSize: 18, fontWeight: 800, marginTop: 36, marginBottom: 16 }}>KOSZTY ROBOCIZNY</h3>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Typ</th>
                  <th className="amt">Stawka / rbg</th>
                  <th className="amt">Godziny efektywne</th>
                  <th className="amt">Suma</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Mechaniczna',  '200,00 PLN', '0,00', 0],
                  ['Blacharstwo',  '200,00 PLN', '0,30', 60.00],
                  ['Lakiernictwo', '200,00 PLN', '7,90', 1580.00],
                ].map(([t, r, h, s]) => (
                  <tr key={t as string}>
                    <td>{t}</td>
                    <td className="amt">{r}</td>
                    <td className="amt">{h}</td>
                    <td className="amt" style={{ fontWeight: 600 }}>
                      {(s as number) > 0 ? fmt(s as number) : '—'}
                    </td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td colSpan={2} style={{ color: '#16A34A' }}>Łączne koszty robocizny</td>
                  <td className="amt" style={{ fontWeight: 700 }}>8,20</td>
                  <td className="amt" style={{ fontWeight: 700 }}>{fmt(1640)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <hr className="kosz-hr" style={{ margin: '0 40px', border: 'none', borderTop: '1px solid #E5E7EB' }} />

        {/* ═══ SECTION 3: DOCUMENTS ════════════════════════════════════ */}
        <section id="documents" className="kosz-section" style={{ padding: '32px 40px' }}>
          <div className="section-title">WYKAZ DOKUMENTÓW</div>
          <div className="docs-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
            {DOCUMENTS.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 16px', borderRadius: 10, background: '#F9FAFB', border: '1px solid #F3F4F6' }}>
                <span style={{ color: '#6B7280', fontSize: 13, fontWeight: 500 }}>{k}</span>
                <span style={{ fontWeight: 700, fontSize: 13,
                  color: v === 'Tak' ? '#16A34A' : v.startsWith('2') || v.startsWith('E') ? '#16A34A' : '#1D1D1F' }}>
                  {v}
                </span>
              </div>
            ))}
          </div>
        </section>

        <hr className="kosz-hr" style={{ margin: '0 40px', border: 'none', borderTop: '1px solid #E5E7EB' }} />

        {/* ═══ SECTION 4: EQUIPMENT ════════════════════════════════════ */}
        <section id="equipment" className="kosz-section" style={{ padding: '32px 40px' }}>
          <div className="section-title">WYPOSAŻENIE POJAZDU</div>
          <div className="equip-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 10 }}>
            {EQUIPMENT.map(([k, v]) => {
              const clr = v === 'Tak' || v === 'Elektryczne' || v === 'LED' || v === 'mHEV 48V'
                ? '#16A34A'
                : v === 'NIE' ? '#DC2626'
                : v === '0' ? '#EA580C'
                : '#1D1D1F';
              return (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px', borderRadius: 8, background: '#F9FAFB', border: '1px solid #F3F4F6' }}>
                  <span style={{ color: '#6B7280', fontSize: 13, fontWeight: 500 }}>{k}</span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: clr }}>{v}</span>
                </div>
              );
            })}
          </div>
        </section>

        <hr className="kosz-hr" style={{ margin: '0 40px', border: 'none', borderTop: '1px solid #E5E7EB' }} />

        {/* ═══ SECTION 5: TIRES ════════════════════════════════════════ */}
        <section id="tires" className="kosz-section" style={{ padding: '32px 40px' }}>
          <div className="section-title">OPONY</div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Lokalizacja</th><th>Pozycja</th><th>Bieżnik</th><th>Producent</th>
                  <th>Wymiary</th><th>Sezon</th><th>Typ felgi</th><th>Runflat</th>
                </tr>
              </thead>
              <tbody>
                {TIRES.map((t, i) => (
                  <tr key={i}>
                    <td>{t.location}</td>
                    <td style={{ color: '#2563EB', fontWeight: 600 }}>{t.position}</td>
                    <td style={{ color: '#16A34A', fontWeight: 600 }}>{t.tread}</td>
                    <td>{t.producer}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{t.dimensions}</td>
                    <td>{t.season}</td>
                    <td>{t.rim}</td>
                    <td>{t.runflat}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <hr className="kosz-hr" style={{ margin: '0 40px', border: 'none', borderTop: '1px solid #E5E7EB' }} />

        {/* ═══ SECTION 6: DAMAGE ═══════════════════════════════════════ */}
        <section id="damage" className="kosz-section" style={{ padding: '32px 40px' }}>
          <div className="section-title">USZKODZENIA</div>

          {/* Interior */}
          <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 16, color: '#6B7280',
            textTransform: 'uppercase', letterSpacing: 1 }}>Wnętrze</h3>
          {DAMAGES.filter(d => d.isInterior).map(d => (
            <DamageCard key={d.id} damage={d} globalAmort={globalAmort}
              onPhotoClick={(photos, idx) => setLightbox({ photos, start: idx })} />
          ))}

          {/* Exterior */}
          <h3 style={{ fontSize: 15, fontWeight: 800, margin: '32px 0 16px', color: '#6B7280',
            textTransform: 'uppercase', letterSpacing: 1 }}>Zewnętrze</h3>
          {DAMAGES.filter(d => !d.isInterior).map(d => (
            <DamageCard key={d.id} damage={d} globalAmort={globalAmort}
              onPhotoClick={(photos, idx) => setLightbox({ photos, start: idx })} />
          ))}
        </section>

        <hr className="kosz-hr" style={{ margin: '0 40px', border: 'none', borderTop: '1px solid #E5E7EB' }} />

        {/* ═══ SECTION 7: BASIC PHOTOS ═════════════════════════════════ */}
        <section id="photos" className="kosz-section" style={{ padding: '32px 40px' }}>
          <div className="section-title">ZDJĘCIA PODSTAWOWE</div>
          <div className="photos-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
            {BASIC_PHOTOS.map((p, i) => (
              <div key={i} className="photo-tile"
                onClick={() => setLightbox({ photos: BASIC_PHOTOS.map(x => x.src), start: i })}>
                <img src={p.src} alt={p.label} loading="lazy" />
                <div className="tile-label">{p.label}</div>
              </div>
            ))}
          </div>
        </section>

        <hr className="kosz-hr" style={{ margin: '0 40px', border: 'none', borderTop: '1px solid #E5E7EB' }} />

        {/* ═══ COMMENTS ════════════════════════════════════════════════ */}
        <section className="kosz-section" style={{ padding: '32px 40px' }}>
          <div className="section-title">UWAGI</div>
          <div style={{ padding: '16px 20px', borderRadius: 10, background: '#F9FAFB',
            border: '1px solid #F3F4F6', fontSize: 14, lineHeight: 1.8, color: '#374151' }}>
            Pojazd w bardzo dobrym stanie technicznym. Przebieg potwierdza stan pojazdu (4 369 km).
            Stwierdzone uszkodzenia dotyczą lewej strony tylnej (drzwi tylne L, błotnik tylny L) oraz
            emblematu tylnego. Drobne przetarcie tapicerki fotela kierowcy nie ujęte w kosztorysie.
            Pojazd wyposażony w układ hybrydowy mHEV 48V. Wszystkie dokumenty zgodne z pojazdem.
          </div>
        </section>

        {/* ─── Footer ───────────────────────────────────────────────── */}
        <footer className="footer-bar" style={{ padding: '24px 40px', background: '#1D1D1F',
          color: '#9CA3AF', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img
              src="https://i.postimg.cc/VsgMRGYH/SPROWADZENIE-SAMOCHODOW-Z-USAPOD-DOM-(500-x-500-px)-(800-x-500-px)-(700-x-300-px)-2.png"
              alt="ZR"
              style={{ height: 28, width: 'auto', filter: 'brightness(0) invert(1)' }}
            />
            <span style={{ fontWeight: 600, color: '#E5E7EB' }}>Zaufaj Rzeczoznawcy</span>
          </div>
          <div>© 2026 Zaufaj Rzeczoznawcy · Eurotax AZT · Wygenerowano: {VEHICLE.expertiseDate}</div>
        </footer>
      </div>
    </div>
  );
}

// ─── DamageCard Component ─────────────────────────────────────────────────────

function DamageCard({
  damage: d,
  globalAmort,
  onPhotoClick,
}: {
  damage: DamageItem;
  globalAmort: number;
  onPhotoClick: (photos: string[], idx: number) => void;
}) {
  const dep = d.totalCost * (globalAmort / 100);
  const net = d.totalCost - dep;

  const laborTotal = d.sheetMetalLabor + d.paintingLabor;

  return (
    <div style={{ marginBottom: 24, padding: '24px', borderRadius: 14,
      border: '1px solid #E5E7EB', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div className="damage-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) 3fr', gap: 24 }}>

        {/* Photos */}
        <div style={{ display: 'grid', gridTemplateColumns: d.photos.length === 1 ? '1fr' : 'repeat(2,1fr)', gap: 8, alignContent: 'start' }}>
          {d.photos.map((src, i) => (
            <div key={i} onClick={() => onPhotoClick(d.photos, i)}
              style={{ borderRadius: 10, overflow: 'hidden', aspectRatio: '4/3',
                background: '#F5F5F7', cursor: 'pointer', position: 'relative' }}>
              <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                transition: 'transform 0.2s' }}
                onMouseEnter={e => { (e.target as HTMLImageElement).style.transform = 'scale(1.05)'; }}
                onMouseLeave={e => { (e.target as HTMLImageElement).style.transform = 'scale(1)'; }}
              />
              <div style={{ position: 'absolute', bottom: 4, right: 6, background: 'rgba(0,0,0,0.45)',
                color: '#fff', fontSize: 10, padding: '2px 5px', borderRadius: 4 }}>
                {i + 1}/{d.photos.length}
              </div>
            </div>
          ))}
        </div>

        {/* Details */}
        <div>
          <h4 style={{ margin: '0 0 14px', fontSize: 17, fontWeight: 800, color: '#B71C1C' }}>
            {d.id} | {d.name}
          </h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {([
                ['Rodzaj uszkodzenia',    d.damageType],
                ['Rozmiar',              d.size],
                ['Tryb naprawy',         d.repairMode],
                ...(d.partsCost > 0    ? [['Cena części', fmt(d.partsCost)]] : []),
                ...(d.sheetMetalLabor > 0 ? [['Robocizna — blacharstwo', fmt(d.sheetMetalLabor)]] : []),
                ...(d.paintingLabor > 0   ? [['Koszty lakierowania',      fmt(d.paintingLabor)]] : []),
                ...(d.material > 0        ? [['Materiały lakiernicze',     fmt(d.material)]] : []),
                ['Łączne koszty',        d.totalCost > 0 ? fmt(d.totalCost) : '— (informacyjnie)'],
                ...(d.totalCost > 0 ? [
                  ['Amortyzacja (%)',   `${globalAmort.toFixed(2)} %`],
                  ['Koszt amortyzacji', fmt(dep)],
                ] : []),
              ] as [string, string][]).map(([k, v]) => (
                <tr key={k}>
                  <td style={{ padding: '6px 0', color: '#6B7280', fontSize: 12, fontWeight: 500,
                    borderBottom: '1px solid #F3F4F6' }}>{k}</td>
                  <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 600, fontSize: 13,
                    borderBottom: '1px solid #F3F4F6',
                    color: k.includes('Amortyzacja') && !k.includes('(%)') ? '#DC2626'
                         : k.includes('(%)') ? '#EA580C' : '#1D1D1F' }}>
                    {v}
                  </td>
                </tr>
              ))}
              {d.totalCost > 0 && (
                <tr>
                  <td style={{ padding: '10px 0', fontWeight: 800, fontSize: 14, color: '#16A34A' }}>
                    KOSZT NETTO <span style={{ fontWeight: 500, fontSize: 11, color: '#6B7280' }}>(bez VAT)</span>
                  </td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 900, fontSize: 16, color: '#16A34A' }}>
                    {fmt(net)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {d.comment && (
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6,
              background: '#FEF2F2', fontSize: 12, color: '#B71C1C', fontWeight: 600 }}>
              <i className="fas fa-comment" style={{ marginRight: 6 }} />Uwagi: {d.comment}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
