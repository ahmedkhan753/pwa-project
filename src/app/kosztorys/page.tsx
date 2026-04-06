'use client';
import React, { useState, useRef, useCallback } from 'react';

/* ═══════════════════════════════════════════════════════════════
   KOSZTORYS REPORT — Static Demo (Toyota Aygo X)
   Professional repair cost estimate page with ZR branding.
   Polish labels. Publicly accessible, no auth.
   ═══════════════════════════════════════════════════════════════ */

// ─── Data ────────────────────────────────────────────────────────────────────

const VEHICLE = {
  make: 'TOYOTA', model: 'Aygo X', variant: '1.0 Vvt-I Comfort',
  vin: 'JTDAGNAC200082240', registration: 'WPR3123L',
  group: 'Po kontrakcie', mileage: '24 917 km',
  firstRegistration: '11/01/2023', color: 'Czarny',
  customer: 'Ayvens Poland', expertiseDate: '03/12/2025 15:22:37',
  address: 'Łajski Logistics Center',
};

interface DamageItem {
  id: number; name: string; type: string; size: string;
  repairMode: string; fixedRate: number; sheetMetal: number;
  painting: number; otherLabor: number; varnish: number;
  totalCost: number; amortPct: number; depreciationCost: number;
  netCost: number; isInterior: boolean; comment?: string;
  photoSlots: number;
}

const DAMAGES: DamageItem[] = [
  { id:1, name:'Kluczyk zapłonowy', type:'Brak', size:'Brakujący', repairMode:'Wymiana', fixedRate:0, sheetMetal:0, painting:0, otherLabor:0, varnish:0, totalCost:800, amortPct:0, depreciationCost:0, netCost:800, isInterior:true, comment:'+ pilot alarmu', photoSlots:1 },
  { id:2, name:'Przegląd serwisowy', type:'Przegląd', size:'<50%, lekkie', repairMode:'Bez naprawy', fixedRate:0, sheetMetal:0, painting:0, otherLabor:0, varnish:0, totalCost:0, amortPct:25, depreciationCost:0, netCost:0, isInterior:true, photoSlots:1 },
  { id:3, name:'Pokrywa przednia', type:'Uszkodzenie gradowe', size:'>0,5 cm - 1 cm', repairMode:'Naprawa i lakierowanie (całość)', fixedRate:0, sheetMetal:0, painting:372, otherLabor:0, varnish:767.92, totalCost:1139.92, amortPct:25, depreciationCost:284.98, netCost:854.94, isInterior:false, photoSlots:4 },
  { id:4, name:'Słupek A lewy', type:'Wgniecenie(a) i zarysowanie(a)', size:'>0,5 cm - 1 cm', repairMode:'Naprawa i lakierowanie (całość)', fixedRate:0, sheetMetal:0, painting:170.50, otherLabor:0, varnish:93.60, totalCost:264.10, amortPct:25, depreciationCost:66.02, netCost:198.08, isInterior:false, photoSlots:4 },
  { id:5, name:'Błotnik PL', type:'Uszkodzenie gradowe', size:'>0,5 cm - 1 cm', repairMode:'Naprawa i lakierowanie (całość)', fixedRate:0, sheetMetal:0, painting:232.50, otherLabor:0, varnish:291.60, totalCost:524.10, amortPct:25, depreciationCost:131.02, netCost:393.08, isInterior:false, photoSlots:4 },
  { id:6, name:'Drzwi PL', type:'Wgniecenie(a)', size:'>4 cm - 6 cm', repairMode:'Lakierowanie', fixedRate:0, sheetMetal:0, painting:387.50, otherLabor:0, varnish:824.18, totalCost:1211.68, amortPct:25, depreciationCost:302.92, netCost:908.76, isInterior:false, photoSlots:4 },
  { id:7, name:'Drzwi TL', type:'Wgniecenie(a)', size:'>0,5 cm - 1 cm', repairMode:'Lakierowanie', fixedRate:0, sheetMetal:0, painting:341, otherLabor:0, varnish:646.20, totalCost:987.20, amortPct:25, depreciationCost:246.80, netCost:740.40, isInterior:false, photoSlots:4 },
  { id:8, name:'Błotnik TL', type:'Uszkodzenie gradowe', size:'>1 cm - 2 cm', repairMode:'Naprawa i lakierowanie (całość)', fixedRate:0, sheetMetal:0, painting:263.50, otherLabor:0, varnish:393.30, totalCost:656.80, amortPct:25, depreciationCost:164.20, netCost:492.60, isInterior:false, photoSlots:4 },
  { id:9, name:'Pokrywa bagażnika', type:'Uszkodzenie gradowe', size:'>0,5 cm - 1 cm', repairMode:'Naprawa i lakierowanie (całość)', fixedRate:0, sheetMetal:0, painting:310, otherLabor:0, varnish:589.95, totalCost:899.95, amortPct:25, depreciationCost:224.99, netCost:674.96, isInterior:false, photoSlots:2 },
  { id:10, name:'Zderzak tylny', type:'Zarysowanie(a)', size:'>10 cm - 15 cm', repairMode:'Lakierowanie', fixedRate:0, sheetMetal:0, painting:186, otherLabor:0, varnish:495.68, totalCost:681.68, amortPct:25, depreciationCost:170.42, netCost:511.26, isInterior:false, photoSlots:2 },
  { id:11, name:'Błotnik TP', type:'Uszkodzenie gradowe', size:'>0,5 cm - 1 cm', repairMode:'Naprawa i lakierowanie (całość)', fixedRate:0, sheetMetal:0, painting:201.50, otherLabor:0, varnish:568.13, totalCost:769.63, amortPct:25, depreciationCost:192.41, netCost:577.22, isInterior:false, photoSlots:3 },
  { id:12, name:'Drzwi TP', type:'Rdza', size:'>0,5 cm - 1 cm', repairMode:'Lakierowanie', fixedRate:0, sheetMetal:0, painting:341, otherLabor:0, varnish:646.20, totalCost:987.20, amortPct:25, depreciationCost:246.80, netCost:740.40, isInterior:false, photoSlots:4 },
  { id:13, name:'Drzwi PP', type:'Wgniecenie(a)', size:'>25 cm - 30 cm', repairMode:'Lakierowanie', fixedRate:0, sheetMetal:0, painting:387.50, otherLabor:0, varnish:824.18, totalCost:1211.68, amortPct:25, depreciationCost:302.92, netCost:908.76, isInterior:false, photoSlots:4 },
  { id:14, name:'Błotnik PP', type:'Wgniecenie(a)', size:'>4 cm - 6 cm', repairMode:'Lakierowanie', fixedRate:0, sheetMetal:0, painting:155, otherLabor:0, varnish:256.95, totalCost:411.95, amortPct:25, depreciationCost:102.99, netCost:308.96, isInterior:false, photoSlots:3 },
  { id:15, name:'Dach', type:'Uszkodzenie gradowe', size:'>0,5 cm - 1 cm', repairMode:'Naprawa i lakierowanie (całość)', fixedRate:0, sheetMetal:0, painting:573.50, otherLabor:0, varnish:1442.25, totalCost:2015.75, amortPct:25, depreciationCost:503.94, netCost:1511.81, isInterior:false, photoSlots:4 },
];

const COST_OVERVIEW = DAMAGES.map(d => ({
  id: d.id, name: d.name, type: d.type, repairMode: d.repairMode,
  repairCosts: d.totalCost, depreciationCost: d.depreciationCost, netCost: d.netCost,
})).sort((a,b) => b.repairCosts - a.repairCosts);

const TIRES = [
  { location:'Przód', position:'Lewy', tread:'4,0 mm', producer:'Goodyear', dimensions:'175/65 R 17 87 H', season:'Letnie', rim:'Stalowe', runflat:'Nie dotyczy' },
  { location:'Przód', position:'Prawy', tread:'4,0 mm', producer:'Goodyear', dimensions:'175/65 R 17 87 H', season:'Letnie', rim:'Stalowe', runflat:'Nie dotyczy' },
  { location:'Tył', position:'Lewy', tread:'4,0 mm', producer:'Goodyear', dimensions:'175/65 R 17 87 H', season:'Letnie', rim:'Stalowe', runflat:'Nie dotyczy' },
  { location:'Tył', position:'Prawy', tread:'4,0 mm', producer:'Goodyear', dimensions:'175/65 R 17 87 H', season:'Letnie', rim:'Stalowe', runflat:'Nie dotyczy' },
];

const EQUIPMENT: [string, string][] = [
  ['ABS','Tak'],['Kamera cofania','Tak'],['Typ radia','Multimedia'],['Typ reflektorów','Halogenowe'],
  ['Elektryczne szyby przednie','Tak'],['Tempomat','Tak'],['Wspomaganie kierownicy','Tak'],['Head-up display','NIE'],
  ['Elektryczna klapa bagażnika','NIE'],['Typ haka holowniczego','Brak haka'],['Klimatyzacja','Manualna'],['Typ nawigacji GPS','ND'],
  ['Pokrycie bagażnika','Tak'],['Typ tapicerki','Materiałowa'],['Kabli ładowania','0'],['Kabli ładowania szybkiego','0'],
];

const DOCUMENTS: [string, string][] = [
  ['Łączna liczba kluczy','1'],['Instrukcja obsługi','Tak'],['Oryginalny dowód rejestracyjny','Tak'],
  ['Oryginalny kluczyk','Tak'],['Typ książki serwisowej','Tradycyjna książka serwisowa'],
];

const NAV_ITEMS = [
  { id:'expertise', label:'Szczegóły ekspertyzy' },
  { id:'costs', label:'Zestawienie kosztów' },
  { id:'documents', label:'Dokumenty' },
  { id:'equipment', label:'Wyposażenie' },
  { id:'tires', label:'Opony' },
  { id:'damage', label:'Uszkodzenia' },
  { id:'photos', label:'Zdjęcia podstawowe' },
];

const fmt = (v: number) => v.toLocaleString('pl-PL', { minimumFractionDigits:2, maximumFractionDigits:2 }) + ' PLN';

// ─── Photo Upload Spot ───────────────────────────────────────────────────────

function PhotoSpot({ id, size = 180 }: { id: string; size?: number }) {
  const [src, setSrc] = useState<string|null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const onFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setSrc(r.result as string);
    r.readAsDataURL(f);
  }, []);
  return (
    <div style={{ position:'relative',width:'100%',aspectRatio:'4/3',minHeight:size,borderRadius:10,
      overflow:'hidden',background:'#F5F5F7',border:'2px dashed #D1D1D6',cursor:'pointer',
      display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.2s' }}
      onClick={() => ref.current?.click()}
      onMouseEnter={e => { e.currentTarget.style.borderColor='#B71C1C'; e.currentTarget.style.background='#FEF2F2'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor='#D1D1D6'; e.currentTarget.style.background= src ? 'transparent' : '#F5F5F7'; }}
    >
      <input ref={ref} type="file" accept="image/*" style={{ display:'none' }} onChange={onFile} id={id} />
      {src ? (
        <img src={src} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }} />
      ) : (
        <div style={{ textAlign:'center',color:'#86868B',padding:12 }}>
          <i className="fas fa-camera" style={{ fontSize:24,marginBottom:6,display:'block',color:'#B71C1C' }}/>
          <div style={{ fontSize:11,fontWeight:600 }}>Kliknij aby dodać zdjęcie</div>
        </div>
      )}
    </div>
  );
}


// ─── Main Page ───────────────────────────────────────────────────────────────

export default function KosztorysPage() {
  const [globalAmort, setGlobalAmort] = useState(25);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior:'smooth', block:'start' });
  };

  const applyAmort = (cost: number, pct: number) => cost * (pct / 100);
  const netAfterAmort = (cost: number, pct: number) => cost - applyAmort(cost, pct);

  // Recalculate totals with global amort
  const totalRepairCosts = DAMAGES.reduce((s,d) => s + d.totalCost, 0);
  const totalDepreciation = DAMAGES.reduce((s,d) => s + applyAmort(d.totalCost, d.id === 1 ? 0 : globalAmort), 0);
  const totalNetCost = totalRepairCosts - totalDepreciation;

  // Additional costs
  const prepCostBase = 480.60;
  const smallPartsBase = 235.20;
  const addTotalBase = prepCostBase + smallPartsBase;
  const addDepreciation = applyAmort(addTotalBase, globalAmort);
  const addNet = addTotalBase - addDepreciation;

  const grandNetTotal = totalNetCost + addNet;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" />
      <style dangerouslySetInnerHTML={{ __html: `
        * { box-sizing: border-box; }
        html, body { margin:0; padding:0; font-family:'Inter',system-ui,sans-serif; background:#FAFAFA; color:#1D1D1F;
          overflow-x:hidden; width:100%; }
        @media print {
          .no-print { display:none !important; }
          body { background:#fff; }
          .page-container { box-shadow:none !important; }
        }
        .page-container { overflow-x:hidden; max-width:100vw; }
        .nav-link { color:#6B7280; text-decoration:none; font-size:13px; font-weight:600; padding:8px 0;
          border-bottom:2px solid transparent; transition:all 0.2s; white-space:nowrap; }
        .nav-link:hover { color:#1D1D1F; border-bottom-color:#B71C1C; }
        .section-title { font-size:22px; font-weight:800; color:#1D1D1F; margin:0 0 20px; text-transform:uppercase;
          letter-spacing:0.5px; padding-bottom:12px; border-bottom:3px solid #B71C1C; display:inline-block; }
        table.data-table { width:100%; border-collapse:collapse; font-size:13px; }
        table.data-table th { text-align:left; padding:10px 12px; background:#F9FAFB; color:#6B7280;
          font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; border-bottom:2px solid #E5E7EB; }
        table.data-table td { padding:10px 12px; border-bottom:1px solid #F3F4F6; vertical-align:top; }
        table.data-table tr:hover td { background:#FAFAFA; }
        table.data-table .total-row td { font-weight:700; border-top:2px solid #E5E7EB; background:#F9FAFB; }
        .amt { text-align:right; font-variant-numeric:tabular-nums; }
        .green { color:#16A34A; }
        .red { color:#DC2626; }
        .orange { color:#EA580C; }
        .table-scroll { overflow-x:auto; -webkit-overflow-scrolling:touch; }
        .table-scroll table { min-width:600px; }
        .vehicle-table td { word-break:break-word; }
        .vehicle-table td:last-child { max-width:55vw; overflow-wrap:break-word; }
        .print-label { display:inline; }
        .thumb-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:8px; }
        /* ─── Mobile Responsive ─────────────────────────── */
        @media (max-width: 768px) {
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
          .vehicle-table { font-size:13px !important; }
          .vehicle-table td { padding:8px 0 !important; }
          .vehicle-table td:last-child { font-size:12px !important; max-width:50vw; }
          .thumb-grid { grid-template-columns:repeat(3,1fr) !important; }
        }
        @media (max-width: 480px) {
          .nav-link { font-size:10px !important; }
          .photos-grid { grid-template-columns:repeat(2,1fr) !important; }
          .table-scroll table { min-width:420px; }
          .vehicle-table td:last-child { max-width:45vw; font-size:11px !important; }
        }
      `}} />

      {/* ─── Sticky Nav ─────────────────────────────────────────────── */}
      <nav className="no-print" style={{ position:'sticky',top:0,zIndex:100,background:'#fff',
        borderBottom:'1px solid #E5E7EB',boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
        <div className="nav-outer" style={{ maxWidth:1100,margin:'0 auto',padding:'0 24px',display:'flex',
          alignItems:'center',justifyContent:'space-between',gap:16 }}>
          <div style={{ display:'flex',alignItems:'center',gap:10,flexShrink:0 }}>
            <div style={{ width:36,height:36,background:'linear-gradient(135deg,#B71C1C,#D32F2F)',
              borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',
              fontWeight:900,fontSize:14 }}>ZR</div>
          </div>
          <div className="nav-scroll" style={{ display:'flex',gap:20,overflow:'auto',flex:1,justifyContent:'center' }}>
            {NAV_ITEMS.map(n => (
              <a key={n.id} className="nav-link" onClick={() => scrollTo(n.id)}
                style={{ cursor:'pointer' }}>{n.label}</a>
            ))}
          </div>
          <button onClick={() => window.print()} className="no-print print-btn" style={{
            padding:'8px 16px',borderRadius:8,border:'1.5px solid #D1D5DB',background:'#fff',
            color:'#374151',fontSize:12,fontWeight:700,cursor:'pointer',display:'flex',
            alignItems:'center',gap:6,flexShrink:0,transition:'all 0.2s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background='#F3F4F6'; }}
            onMouseLeave={e => { e.currentTarget.style.background='#fff'; }}
          >
            <i className="fas fa-print" style={{ fontSize:13 }}/>
            <span className="print-label">Drukuj</span>
          </button>
        </div>
      </nav>

      <div className="page-container" style={{ maxWidth:1100,margin:'0 auto',background:'#fff',
        minHeight:'100vh',boxShadow:'0 0 40px rgba(0,0,0,0.06)' }}>

        {/* ═══ SECTION 1: EXPERTISE ═══════════════════════════════════ */}
        <section id="expertise" className="kosz-section" style={{ padding:'32px 40px' }}>
          <div style={{ display:'inline-block',background:'#B71C1C',color:'#fff',padding:'6px 16px',
            borderRadius:6,fontSize:12,fontWeight:700,letterSpacing:1,textTransform:'uppercase',marginBottom:20 }}>
            Ekspertyza
          </div>
          <div className="expertise-grid" style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:32 }}>
            {/* Photo carousel placeholder */}
            <div>
              <PhotoSpot id="hero-main" size={280} />
              <div className="thumb-grid">
                {[1,2,3,4].map(i => <PhotoSpot key={i} id={`hero-thumb-${i}`} size={70} />)}
              </div>
            </div>
            {/* Vehicle details */}
            <div>
              <h1 style={{ margin:'0 0 4px',fontSize:28,fontWeight:900,color:'#1D1D1F' }}>
                {VEHICLE.make} {VEHICLE.model}
              </h1>
              <div style={{ fontSize:15,color:'#6B7280',fontWeight:500,marginBottom:24 }}>{VEHICLE.variant}</div>
              <table className="vehicle-table" style={{ width:'100%',borderCollapse:'collapse',fontSize:14,tableLayout:'fixed' }}>
                <tbody>
                  {([
                    ['VIN', VEHICLE.vin],
                    ['Rejestracja', VEHICLE.registration],
                    ['Grupa', VEHICLE.group],
                    ['Przebieg', VEHICLE.mileage],
                    ['Pierwsza rejestracja', VEHICLE.firstRegistration],
                    ['Kolor nadwozia', VEHICLE.color],
                    ['Klient', VEHICLE.customer],
                    ['Data ekspertyzy', VEHICLE.expertiseDate],
                    ['Adres oględzin', VEHICLE.address],
                  ] as [string,string][]).map(([k,v]) => (
                    <tr key={k}>
                      <td style={{ padding:'10px 0',color:'#6B7280',fontWeight:500,borderBottom:'1px solid #F3F4F6',width:'45%' }}>{k}</td>
                      <td style={{ padding:'10px 0',fontWeight:600,textAlign:'right',borderBottom:'1px solid #F3F4F6' }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <hr className="kosz-hr" style={{ margin:'0 40px',border:'none',borderTop:'1px solid #E5E7EB' }}/>

        {/* ═══ SECTION 2: COST OVERVIEW ═══════════════════════════════ */}
        <section id="costs" className="kosz-section" style={{ padding:'32px 40px' }}>
          <div className="section-title">ZESTAWIENIE KOSZTÓW</div>

          {/* Amortyzacja slider */}
          <div className="no-print amort-bar" style={{ marginBottom:24,padding:'16px 20px',borderRadius:12,
            background:'linear-gradient(135deg,#FEF2F2,#FFFBEB)',border:'1.5px solid rgba(183,28,28,0.15)',
            display:'flex',alignItems:'center',gap:20,flexWrap:'wrap' }}>
            <div style={{ display:'flex',alignItems:'center',gap:10 }}>
              <i className="fas fa-calculator" style={{ color:'#B71C1C',fontSize:18 }}/>
              <span style={{ fontWeight:700,fontSize:14 }}>Amortyzacja:</span>
            </div>
            <input type="range" min={0} max={50} value={globalAmort}
              onChange={e => setGlobalAmort(Number(e.target.value))}
              style={{ flex:1,minWidth:150,accentColor:'#B71C1C' }} />
            <div style={{ background:'#B71C1C',color:'#fff',padding:'6px 14px',borderRadius:8,
              fontWeight:800,fontSize:16,minWidth:60,textAlign:'center' }}>
              {globalAmort}%
            </div>
          </div>

          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{width:50}}>#</th>
                  <th>Rodzaj uszkodzenia</th>
                  <th>Tryb naprawy</th>
                  <th className="amt">Koszt naprawy</th>
                  <th className="amt">Amortyzacja</th>
                  <th className="amt">Koszt netto</th>
                </tr>
              </thead>
              <tbody>
                {COST_OVERVIEW.map(d => {
                  const amt = d.id === 1 ? 0 : globalAmort;
                  const dep = applyAmort(d.repairCosts, amt);
                  const net = d.repairCosts - dep;
                  return (
                    <tr key={d.id}>
                      <td style={{fontWeight:600,color:'#6B7280'}}>{d.id} | {d.name}</td>
                      <td>{d.type}</td>
                      <td>{d.repairMode}</td>
                      <td className="amt">{fmt(d.repairCosts)}</td>
                      <td className="amt red">{fmt(dep)}</td>
                      <td className="amt" style={{fontWeight:700}}>{fmt(net)}</td>
                    </tr>
                  );
                })}
                <tr className="total-row">
                  <td colSpan={3}></td>
                  <td className="amt">{fmt(totalRepairCosts)}</td>
                  <td className="amt red">{fmt(totalDepreciation)}</td>
                  <td className="amt" style={{color:'#B71C1C'}}>{fmt(totalNetCost)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Different */}
          <h3 style={{ fontSize:18,fontWeight:800,marginTop:32,marginBottom:16,color:'#1D1D1F' }}>INNE</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th><th>Godziny</th><th>Materiał</th><th className="amt">Koszt</th>
                <th className="amt">Amortyzacja</th><th className="amt">Koszt netto</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Koszty przygotowania</td><td>2,50</td><td>{fmt(93.10)}</td>
                <td className="amt">{fmt(prepCostBase)}</td>
                <td className="amt red">{fmt(applyAmort(prepCostBase, globalAmort))}</td>
                <td className="amt" style={{fontWeight:700}}>{fmt(netAfterAmort(prepCostBase, globalAmort))}</td>
              </tr>
              <tr>
                <td>Drobne części</td><td>—</td><td>—</td>
                <td className="amt">{fmt(smallPartsBase)}</td>
                <td className="amt red">{fmt(applyAmort(smallPartsBase, globalAmort))}</td>
                <td className="amt" style={{fontWeight:700}}>{fmt(netAfterAmort(smallPartsBase, globalAmort))}</td>
              </tr>
              <tr className="total-row">
                <td colSpan={3} style={{color:'#16A34A',fontWeight:700}}>Łączne koszty</td>
                <td className="amt">{fmt(addTotalBase)}</td>
                <td className="amt red">{fmt(addDepreciation)}</td>
                <td className="amt" style={{color:'#B71C1C'}}>{fmt(addNet)}</td>
              </tr>
            </tbody>
          </table>

          {/* Grand total */}
          <div className="grand-total" style={{ marginTop:24,display:'flex',justifyContent:'space-between',alignItems:'center',
            padding:'16px 20px',borderRadius:12,background:'#F9FAFB',border:'2px solid #E5E7EB' }}>
            <span style={{ fontSize:16,fontWeight:800,textTransform:'uppercase' }}>
              ŁĄCZNY KOSZT NETTO <span style={{color:'#6B7280',fontWeight:500,fontSize:12}}>(bez VAT)</span>
            </span>
            <span style={{ fontSize:28,fontWeight:900,color:'#16A34A' }}>{fmt(grandNetTotal)}</span>
          </div>

          {/* Labor costs */}
          <h3 style={{ fontSize:18,fontWeight:800,marginTop:32,marginBottom:16 }}>KOSZTY ROBOCIZNY</h3>
          <table className="data-table">
            <thead>
              <tr><th>Typ</th><th>Stawka</th><th>Godziny efektywne</th><th className="amt">Suma</th></tr>
            </thead>
            <tbody>
              {[
                ['Mechaniczna','155,00 PLN','0,00','0,00 PLN'],
                ['Blacharstwo','155,00 PLN','0,00','0,00 PLN'],
                ['Lakiernictwo','155,00 PLN','25,30','3 921,50 PLN'],
              ].map(([t,r,h,s]) => (
                <tr key={t}><td>{t}</td><td>{r}</td><td>{h}</td><td className="amt" style={{fontWeight:600}}>{s}</td></tr>
              ))}
              <tr className="total-row">
                <td colSpan={2} style={{color:'#16A34A'}}>Łączne koszty</td>
                <td style={{fontWeight:700}}>25,30</td>
                <td className="amt" style={{fontWeight:700}}>3 921,50 PLN</td>
              </tr>
            </tbody>
          </table>
        </section>

        <hr className="kosz-hr" style={{ margin:'0 40px',border:'none',borderTop:'1px solid #E5E7EB' }}/>

        {/* ═══ SECTION 3: DOCUMENTS ═══════════════════════════════════ */}
        <section id="documents" className="kosz-section" style={{ padding:'32px 40px' }}>
          <div className="section-title">WYKAZ DOKUMENTÓW</div>
          <div className="docs-grid" style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:12 }}>
            {DOCUMENTS.map(([k,v]) => (
              <div key={k} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',
                padding:'12px 16px',borderRadius:10,background:'#F9FAFB',border:'1px solid #F3F4F6' }}>
                <span style={{ color:'#6B7280',fontSize:13,fontWeight:500 }}>{k}</span>
                <span style={{ fontWeight:700,fontSize:13,color: v==='Tak'?'#16A34A':'#1D1D1F' }}>{v}</span>
              </div>
            ))}
          </div>
        </section>

        <hr className="kosz-hr" style={{ margin:'0 40px',border:'none',borderTop:'1px solid #E5E7EB' }}/>

        {/* ═══ SECTION 4: EQUIPMENT ═══════════════════════════════════ */}
        <section id="equipment" className="kosz-section" style={{ padding:'32px 40px' }}>
          <div className="section-title">WYPOSAŻENIE POJAZDU</div>
          <div className="equip-grid" style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:10 }}>
            {EQUIPMENT.map(([k,v]) => {
              const clr = v==='Tak'?'#16A34A':v==='NIE'?'#DC2626':v==='ND'?'#EA580C':'#1D1D1F';
              return (
                <div key={k} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',
                  padding:'10px 14px',borderRadius:8,background:'#F9FAFB',border:'1px solid #F3F4F6' }}>
                  <span style={{ color:'#6B7280',fontSize:13,fontWeight:500 }}>{k}</span>
                  <span style={{ fontWeight:700,fontSize:13,color:clr }}>{v}</span>
                </div>
              );
            })}
          </div>
        </section>

        <hr className="kosz-hr" style={{ margin:'0 40px',border:'none',borderTop:'1px solid #E5E7EB' }}/>

        {/* ═══ SECTION 5: TIRES ═══════════════════════════════════════ */}
        <section id="tires" className="kosz-section" style={{ padding:'32px 40px' }}>
          <div className="section-title">OPONY</div>
          <h4 style={{ fontSize:14,fontWeight:700,color:'#6B7280',marginBottom:12 }}>Opony zamontowane</h4>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Lokalizacja</th><th>Pozycja</th><th>Bieżnik</th><th>Producent</th>
                  <th>Wymiary</th><th>Sezon</th><th>Typ felgi</th><th>Runflat</th>
                </tr>
              </thead>
              <tbody>
                {TIRES.map((t,i) => (
                  <tr key={i}>
                    <td>{t.location}</td>
                    <td style={{color:'#2563EB',fontWeight:600}}>{t.position}</td>
                    <td>{t.tread}</td><td>{t.producer}</td><td>{t.dimensions}</td>
                    <td style={{color:'#16A34A',fontWeight:600}}>{t.season}</td>
                    <td>{t.rim}</td><td>{t.runflat}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <hr className="kosz-hr" style={{ margin:'0 40px',border:'none',borderTop:'1px solid #E5E7EB' }}/>

        {/* ═══ SECTION 6: DAMAGE ══════════════════════════════════════ */}
        <section id="damage" className="kosz-section" style={{ padding:'32px 40px' }}>
          <div className="section-title">USZKODZENIA</div>

          {/* Interior */}
          <h3 style={{ fontSize:16,fontWeight:800,marginBottom:20,color:'#6B7280',textTransform:'uppercase',letterSpacing:1 }}>
            Wnętrze
          </h3>
          {DAMAGES.filter(d => d.isInterior).map(d => (
            <DamageCard key={d.id} damage={d} globalAmort={globalAmort} />
          ))}

          {/* Exterior */}
          <h3 style={{ fontSize:16,fontWeight:800,margin:'32px 0 20px',color:'#6B7280',textTransform:'uppercase',letterSpacing:1 }}>
            Zewnętrze
          </h3>
          {DAMAGES.filter(d => !d.isInterior).map(d => (
            <DamageCard key={d.id} damage={d} globalAmort={globalAmort} />
          ))}
        </section>

        <hr className="kosz-hr" style={{ margin:'0 40px',border:'none',borderTop:'1px solid #E5E7EB' }}/>

        {/* ═══ SECTION 7: BASIC PHOTOS ════════════════════════════════ */}
        <section id="photos" className="kosz-section" style={{ padding:'32px 40px' }}>
          <div className="section-title">ZDJĘCIA PODSTAWOWE</div>
          <div className="photos-grid" style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:12 }}>
            {Array.from({length:12}).map((_,i) => (
              <PhotoSpot key={i} id={`basic-photo-${i}`} size={140} />
            ))}
          </div>
        </section>

        <hr className="kosz-hr" style={{ margin:'0 40px',border:'none',borderTop:'1px solid #E5E7EB' }}/>

        {/* ═══ COMMENTS + FOOTER ══════════════════════════════════════ */}
        <section className="kosz-section" style={{ padding:'32px 40px' }}>
          <div className="section-title">UWAGI</div>
          <div style={{ padding:'16px 20px',borderRadius:10,background:'#F9FAFB',border:'1px solid #F3F4F6',
            fontSize:14,lineHeight:1.8,color:'#374151',fontStyle:'italic' }}>
            <strong>Uwagi inspektora:</strong> drobne zarysowania na całym nadwoziu, ślady po naklejkach, wersja Aygo X.
          </div>
        </section>

        {/* Footer */}
        <footer className="footer-bar" style={{ padding:'24px 40px',background:'#1D1D1F',color:'#9CA3AF',fontSize:12,
          display:'flex',justifyContent:'space-between',alignItems:'center' }}>
          <div style={{ display:'flex',alignItems:'center',gap:10 }}>
            <div style={{ width:28,height:28,background:'#B71C1C',borderRadius:6,display:'flex',
              alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:900,fontSize:10 }}>ZR</div>
            <span style={{ fontWeight:600,color:'#E5E7EB' }}>Zaufaj Rzeczoznawcy</span>
          </div>
          <div>© 2025 Zaufaj Rzeczoznawcy. Wygenerowano: {VEHICLE.expertiseDate}</div>
        </footer>
      </div>
    </>
  );
}


// ─── DamageCard ──────────────────────────────────────────────────────────────

function DamageCard({ damage: d, globalAmort }: { damage: DamageItem; globalAmort: number }) {
  const amt = d.id === 1 ? 0 : globalAmort;
  const dep = d.totalCost * (amt / 100);
  const net = d.totalCost - dep;

  const photoCols = d.photoSlots <= 1 ? '1fr' : d.photoSlots === 2 ? '1fr 1fr' : 'repeat(2,1fr)';

  return (
    <div style={{ marginBottom:24,padding:'24px',borderRadius:14,border:'1px solid #E5E7EB',
      background:'#fff',boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
      <div className="damage-grid" style={{ display:'grid',gridTemplateColumns:'minmax(200px,2fr) 3fr',gap:24 }}>
        {/* Photos */}
        <div style={{ display:'grid',gridTemplateColumns:photoCols,gap:8 }}>
          {Array.from({length:d.photoSlots}).map((_,i) => (
            <PhotoSpot key={i} id={`dmg-${d.id}-${i}`} size={d.photoSlots===1?200:120} />
          ))}
        </div>
        {/* Details */}
        <div>
          <h4 style={{ margin:'0 0 14px',fontSize:17,fontWeight:800,color:'#B71C1C' }}>
            {d.id} | {d.name}
          </h4>
          <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
            <tbody>
              {([
                ['Rodzaj', d.type],
                ['Rozmiar', d.size],
                ['Tryb naprawy', d.repairMode],
                ...(d.fixedRate ? [['Cena części', fmt(d.fixedRate)]] : []),
                ['Robocizna blacharstwo', fmt(d.sheetMetal)],
                ['Koszty lakierowania', fmt(d.painting)],
                ['Inne koszty robocizny', fmt(d.otherLabor)],
                ['Materiały lakiernicze', fmt(d.varnish)],
                ['Łączne koszty', fmt(d.totalCost)],
                ['Amortyzacja (%)', `${amt.toFixed(2)} %`],
                ['Koszt amortyzacji', fmt(dep)],
              ] as [string,string][]).map(([k,v]) => (
                <tr key={k}>
                  <td style={{ padding:'6px 0',color:'#6B7280',fontSize:12,fontWeight:500,
                    borderBottom:'1px solid #F3F4F6' }}>{k}</td>
                  <td style={{ padding:'6px 0',textAlign:'right',fontWeight:600,fontSize:13,
                    borderBottom:'1px solid #F3F4F6',
                    color: k.includes('Amortyzacja') && !k.includes('(%)') ? '#DC2626' : k.includes('(%)')? '#EA580C' : '#1D1D1F' }}>{v}</td>
                </tr>
              ))}
              <tr>
                <td style={{ padding:'10px 0',fontWeight:800,fontSize:14,color:'#16A34A' }}>
                  KOSZT NETTO <span style={{fontWeight:500,fontSize:11,color:'#6B7280'}}>(bez VAT)</span>
                </td>
                <td style={{ padding:'10px 0',textAlign:'right',fontWeight:900,fontSize:16,color:'#16A34A' }}>
                  {fmt(net)}
                </td>
              </tr>
            </tbody>
          </table>
          {d.comment && (
            <div style={{ marginTop:8,padding:'8px 12px',borderRadius:6,background:'#FEF2F2',
              fontSize:12,color:'#B71C1C',fontWeight:600 }}>
              <i className="fas fa-comment" style={{ marginRight:6 }}/>Uwagi: {d.comment}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
