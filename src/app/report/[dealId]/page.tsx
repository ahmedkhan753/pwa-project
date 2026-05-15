'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { DamageMap } from '@/components/ui/report/DamageMap';
import { HIGHLIGHT_COLOR } from '@/lib/damageMapConfig';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface PhotoItem {
  label: string;
  url: string | null;
  position: number;
  damage_type?: string;
}

interface ReportData {
  deal_id: number;
  generated_at: string;
  title?: string;
  company_name?: string;
  client_name?: string;
  inspection_date: string;
  inspection_place?: string;
  inspector_name?: string;
  vehicle: {
    make: string; model: string; version?: string; vin: string;
    registration_plate: string; year: string | number;
    first_registration_date?: string; mileage: string | number; mileage_unit?: string;
    color: string; fuel_type: string;
    engine_power_kw?: string | number; engine_power_hp?: string | number;
    engine_capacity_cc?: string | number;
    transmission: string; drive_type?: string; body_type?: string;
    doors?: string | number; seats?: string | number; weight_kg?: string | number;
    owners_count?: string | number; overall_condition?: string; paint_type?: string;
    [key: string]: unknown;
  };
  hero_photo_url: string | null;
  quick_stats: { year?: string | number; fuel?: string; power?: string; transmission?: string };
  damage_summary: { cosmetic: number; structural: number; bodywork: number };
  equipment: Array<{ name: string; present: boolean }>;
  eurotax_equipment?: string[];
  wyposazenie?: {
    standardowe:         string[];
    dodatkowe:           string[];
    specjalne:           string[];
    czynniki_obnizajace: string[];
  };
  komentarze?: {
    dane_pojazdu: string;
    wyposazenie:  string;
    zdjecia:      string;
    opony_lakier: string;
    uszkodzenia:  string;
    silnik:       string;
  };
  photos: {
    standard: PhotoItem[]; body: PhotoItem[]; interior: PhotoItem[];
    engine: PhotoItem[]; documents: PhotoItem[]; damages: PhotoItem[];
  };
  videos?: Array<{ slot_id: string; label: string; url: string; is_video: true; mime?: string }>;
  documents_check: Array<{ name: string; status: string; status_type: string }>;
  tires: Array<{
    position: string; brand?: string; model?: string; size?: string;
    dot?: string; season?: string; tread_mm?: number; status: string;
  }>;
  paint_measurements: Array<{ point: number; name: string; value_um: number | null; range_label?: string | null; status: string }>;
  damages: Array<{ index: number; type: string; location: string; size?: string; description?: string; severity?: string; photo_url?: string | null; photo_urls?: string[] }>;

  interior_damages?: Array<{ index: number; type: string; location: string; size?: string; description?: string; photo_url?: string | null; photo_urls?: string[] }>;
  mechanical?: { engine_start?: string; ac_working?: boolean; warning_lights?: string; [key: string]: unknown };
  notes?: string;
  signatures?: {
    inspector?: { name: string; signature_url?: string };
    client?: { name: string; signature_url?: string };
  };
  inspector?: { name: string; phone?: string };
  attached_reports?: {
    cepik_url?: string | null;
    damage_history_url?: string | null;
    has_cepik?: boolean;
    has_damage_history?: boolean;
  };
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const LOGO_URL = 'https://i.postimg.cc/VsgMRGYH/SPROWADZENIE-SAMOCHODOW-Z-USAPOD-DOM-(500-x-500-px)-(800-x-500-px)-(700-x-300-px)-2.png';

// Order MUST match backend PAINT_PANELS_19 (backend/routers/report.py:510).
// Index i (0-based) corresponds to backend `point` = i+1.
const PAINT_POINTS = [
  { id: 'hood',             label: 'Pokrywa przednia',      cx: 200, cy: 78,  r: 15 },
  { id: 'leftFrontFender',  label: 'Błotnik przedni L',     cx: 122, cy: 90,  r: 15 },
  { id: 'rightFrontFender', label: 'Błotnik przedni P',     cx: 278, cy: 90,  r: 15 },
  { id: 'leftFrontDoor',    label: 'Drzwi przednie L',      cx: 122, cy: 140, r: 15 },
  { id: 'rightFrontDoor',   label: 'Drzwi przednie P',      cx: 278, cy: 140, r: 15 },
  { id: 'leftRearDoor',     label: 'Drzwi tylne L',         cx: 122, cy: 172, r: 15 },
  { id: 'rightRearDoor',    label: 'Drzwi tylne P',         cx: 278, cy: 172, r: 15 },
  { id: 'leftRearFender',   label: 'Błotnik tylny L',       cx: 122, cy: 218, r: 15 },
  { id: 'rightRearFender',  label: 'Błotnik tylny P',       cx: 278, cy: 218, r: 15 },
  { id: 'trunk',            label: 'Pokrywa tylna / klapa', cx: 200, cy: 232, r: 15 },
  { id: 'roof',             label: 'Dach',                  cx: 200, cy: 155, r: 15 },
  { id: 'leftAColumn',      label: 'Słupek przedni L',      cx: 152, cy: 115, r: 10 },
  { id: 'rightAColumn',     label: 'Słupek przedni P',      cx: 248, cy: 115, r: 10 },
  { id: 'leftBColumn',      label: 'Słupek środkowy L',     cx: 152, cy: 155, r: 10 },
  { id: 'rightBColumn',     label: 'Słupek środkowy P',     cx: 248, cy: 155, r: 10 },
  { id: 'leftSill',         label: 'Próg L',                cx: 105, cy: 156, r: 15 },
  { id: 'rightSill',        label: 'Próg P',                cx: 295, cy: 156, r: 15 },
  { id: 'frontBumper',      label: 'Zderzak przedni',       cx: 200, cy: 48,  r: 15 },
  { id: 'rearBumper',       label: 'Zderzak tylny',         cx: 200, cy: 262, r: 15 },
];

function paintColor(s: string) {
  if (s === 'factory')   return '#22C55E';
  if (s === 'repainted') return '#F59E0B';
  if (s === 'repair')    return '#EF4444';
  return '#AEAEB2';
}
function tireColor(s: string) {
  if (s === 'good')   return '#22C55E';
  if (s === 'warn')   return '#F59E0B';
  if (s === 'danger') return '#EF4444';
  return '#AEAEB2';
}

function formatDate(raw: string | undefined): string {
  if (!raw) return '';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' · ' + d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  } catch { return raw; }
}

// ─── Lightbox ──────────────────────────────────────────────────────────────────

function Lightbox({ photos, startIndex, onClose }: {
  photos: Array<{ label: string; url: string }>;
  startIndex: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(startIndex);
  const [scale, setScale] = useState(1);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIdx(i => Math.min(i + 1, photos.length - 1));
      if (e.key === 'ArrowLeft')  setIdx(i => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, photos.length]);

  // Reset zoom each time the active image changes
  useEffect(() => { setScale(1); }, [idx]);

  const p = photos[idx];
  const zoomed = scale > 1.01;

  return (
    <div
      style={{ position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,0.92)',display:'flex',
        flexDirection:'column',alignItems:'center',justifyContent:'center',opacity:1,
        // touch-action: none always — without this iOS Safari intercepts the
        // multi-finger pinch as page-zoom (now enabled by /report/layout.tsx
        // viewport override) before react-zoom-pan-pinch can detect it.
        // Single-finger swipe-nav still works because onTouchStart/End below
        // read raw touches; touch-action:none only suppresses default browser
        // gestures, it doesn't block JS from receiving the touch events.
        touchAction: 'none' }}
      onClick={onClose}
    >
      <button onClick={e => { e.stopPropagation(); onClose(); }}
        style={{ position:'absolute',top:16,right:16,width:44,height:44,
          background:'rgba(255,255,255,0.1)',border:'none',color:'#fff',fontSize:22,
          borderRadius:'50%',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',zIndex:10 }}>
        <i className="fas fa-times"/>
      </button>
      <div style={{ position:'absolute',top:20,left:'50%',transform:'translateX(-50%)',
        color:'rgba(255,255,255,0.5)',fontSize:13 }}>{idx+1} / {photos.length}</div>
      {zoomed && (
        <div style={{ position:'absolute',top:20,left:20,color:'rgba(255,255,255,0.55)',fontSize:11,
          background:'rgba(0,0,0,0.35)',padding:'4px 10px',borderRadius:10,pointerEvents:'none' }}>
          {scale.toFixed(1)}×
        </div>
      )}
      {idx > 0 && !zoomed && (
        <button onClick={e => { e.stopPropagation(); setIdx(i => i - 1); }}
          style={{ position:'absolute',left:16,top:'50%',transform:'translateY(-50%)',
            width:50,height:50,borderRadius:'50%',background:'rgba(255,255,255,0.12)',
            border:'none',color:'#fff',fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',zIndex:10 }}>
          <i className="fas fa-chevron-left"/>
        </button>
      )}
      <div
        onClick={e => e.stopPropagation()}
        onTouchStart={e => {
          if (zoomed) return;
          if (e.touches.length !== 1) { touchX.current = null; return; }
          touchX.current = e.touches[0].clientX;
        }}
        onTouchEnd={e => {
          if (zoomed || touchX.current === null) { touchX.current = null; return; }
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (dx > 50)  setIdx(i => Math.max(i - 1, 0));
          if (dx < -50) setIdx(i => Math.min(i + 1, photos.length - 1));
          touchX.current = null;
        }}
        style={{ width:'90vw',height:'75vh',display:'flex',alignItems:'center',justifyContent:'center',touchAction:'none' }}
      >
        <TransformWrapper
          key={idx}
          initialScale={1}
          minScale={1}
          maxScale={5}
          doubleClick={{ mode: 'toggle', step: 2 }}
          wheel={{ step: 0.2 }}
          panning={{ disabled: !zoomed }}
          onTransform={(_ref, state) => setScale(state.scale)}
        >
          <TransformComponent
            wrapperStyle={{ width:'100%',height:'100%' }}
            contentStyle={{ width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.label} draggable={false}
              style={{ maxWidth:'90vw',maxHeight:'75vh',objectFit:'contain',borderRadius:4,display:'block',userSelect:'none' }} />
          </TransformComponent>
        </TransformWrapper>
      </div>
      <div style={{ color:'#fff',textAlign:'center',marginTop:16,fontSize:15,fontWeight:500,pointerEvents:'none' }}>{p.label}</div>
      {idx < photos.length - 1 && !zoomed && (
        <button onClick={e => { e.stopPropagation(); setIdx(i => i + 1); }}
          style={{ position:'absolute',right:16,top:'50%',transform:'translateY(-50%)',
            width:50,height:50,borderRadius:'50%',background:'rgba(255,255,255,0.12)',
            border:'none',color:'#fff',fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',zIndex:10 }}>
          <i className="fas fa-chevron-right"/>
        </button>
      )}
    </div>
  );
}

// ─── CollapsibleSection ────────────────────────────────────────────────────────

function CollapsibleSection({ id, icon, num, title, children, defaultOpen = false }: {
  id: string; icon: string; num: string; title: string;
  children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      className={`section-card${open ? ' active' : ''}`}
      id={id}
      style={{ background:'#fff',borderRadius:12,boxShadow:'0 1px 3px rgba(0,0,0,0.04)',
        marginBottom:0,overflow:'hidden',border:'1px solid #E8E8ED',transition:'box-shadow 0.3s' }}
    >
      <div
        className="section-header"
        onClick={() => setOpen(o => !o)}
        role="button" tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setOpen(o => !o)}
        style={{ display:'flex',alignItems:'center',justifyContent:'space-between',
          padding:'20px 28px',cursor:'pointer',userSelect:'none',
          position:'relative',background:'#fff',transition:'background 0.2s' }}
      >
        {/* Left accent bar */}
        <span style={{ position:'absolute',left:0,top:0,bottom:0,width:3,background:'#B71C1C',borderRadius:'0 3px 3px 0' }}/>
        <div style={{ display:'flex',alignItems:'center',gap:14 }}>
          <div style={{ width:42,height:42,borderRadius:8,background:'#FEF2F2',
            display:'flex',alignItems:'center',justifyContent:'center',color:'#B71C1C',fontSize:17,flexShrink:0 }}>
            <i className={icon}/>
          </div>
          <div>
            <div style={{ fontSize:11,fontWeight:700,color:'#B71C1C',letterSpacing:'2px',textTransform:'uppercase',lineHeight:1.2,marginBottom:2 }}>
              {num}
            </div>
            <div style={{ fontSize:19,fontWeight:700,color:'#1D1D1F',lineHeight:1.3 }}>{title}</div>
          </div>
        </div>
        <div style={{ width:34,height:34,borderRadius:'50%',background: open ? '#FEF2F2' : '#F5F5F7',
          display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'background 0.3s' }}>
          <i className="fa-solid fa-chevron-down" style={{
            fontSize:13,color: open ? '#B71C1C' : '#86868B',
            transition:'transform 0.4s cubic-bezier(0.4,0,0.2,1)',
            transform: open ? 'rotate(180deg)' : 'none',
          }}/>
        </div>
      </div>
      <div className="section-body" style={{
        display:'grid',
        gridTemplateRows: open ? '1fr' : '0fr',
        transition:'grid-template-rows 0.5s cubic-bezier(0.4,0,0.2,1)',
      }}>
        <div className="sec-body-inner" style={{ overflow:'hidden',minHeight:0,
          padding: open ? '20px' : '0',
          opacity: open ? 1 : 0,
          borderTop: open ? '1px solid #E8E8ED' : 'none',
          transition:'padding 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease, border-color 0.3s' }}>
          {children}
        </div>
      </div>
    </section>
  );
}
// ─── DocumentsSection ──────────────────────────────────────────────────────────

function DocumentsSection({ dealId }: { dealId: number }) {
  const [status, setStatus] = useState<{ has_cepik: boolean; has_damage_history: boolean }>({ has_cepik: false, has_damage_history: false });
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/report/${dealId}/documents/status`)
      .then(r => r.ok ? r.json() : { has_cepik: false, has_damage_history: false })
      .then(setStatus)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [dealId]);

  const handleDownload = async (docType: string, filename: string) => {
    setDownloading(docType);
    try {
      const res = await fetch(`/api/report/${dealId}/document/${docType}`);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { alert('Nie udało się pobrać pliku'); }
    setDownloading(null);
  };

  const handleView = (docType: string) => {
    window.open(`/api/report/${dealId}/document/${docType}`, '_blank', 'noopener,noreferrer');
  };

  if (loading || (!status.has_cepik && !status.has_damage_history)) return null;

  const docs = [
    { key: 'cepik', label: 'Raport CEPIK', sub: 'Historia pojazdu z CEPiK', icon: 'fas fa-car-crash',
      filename: `CEPIK_Raport_${dealId}.pdf`,
      color: '#B71C1C', bg: 'linear-gradient(135deg,#FEF2F2,#fff)', border: 'rgba(183,28,28,0.15)',
      hoverShadow: 'rgba(183,28,28,0.12)', has: status.has_cepik },
    { key: 'damage_history', label: 'Historia szkodowości', sub: 'Raport szkód i napraw', icon: 'fas fa-shield-alt',
      filename: `Historia_Szkodowosci_${dealId}.pdf`,
      color: '#F59E0B', bg: 'linear-gradient(135deg,#FFF7ED,#fff)', border: 'rgba(245,158,11,0.2)',
      hoverShadow: 'rgba(245,158,11,0.12)', has: status.has_damage_history },
  ].filter(d => d.has);

  return (
    <div style={{ marginTop:32,marginBottom:32,background:'#fff',borderRadius:16,padding:'28px 24px',
      boxShadow:'0 4px 20px rgba(0,0,0,0.08)',border:'2px solid #E8E8ED' }}>
      <div style={{ display:'flex',alignItems:'center',gap:12,marginBottom:24 }}>
        <div style={{ width:46,height:46,borderRadius:12,background:'linear-gradient(135deg,#B71C1C,#D32F2F)',
          display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:20,flexShrink:0 }}>
          <i className="fas fa-file-pdf"/>
        </div>
        <div>
          <div style={{ fontSize:11,fontWeight:700,color:'#B71C1C',letterSpacing:'2px',textTransform:'uppercase',lineHeight:1.2,marginBottom:3 }}>Dokumenty</div>
          <div style={{ fontSize:19,fontWeight:700,color:'#1D1D1F',lineHeight:1.3 }}>Raporty historii pojazdu</div>
        </div>
      </div>
      <div style={{ display:'grid',gridTemplateColumns:'1fr',gap:16 }}>
        {docs.map(d => (
          <div key={d.key} style={{
            padding:'20px',borderRadius:14,background:d.bg,
            border:`1.5px solid ${d.border}`,transition:'all 0.3s',
          }}>
            <div style={{ display:'flex',alignItems:'center',gap:14,marginBottom:16 }}>
              <div style={{ width:48,height:48,borderRadius:12,background:d.color,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                <i className={d.icon} style={{ color:'#fff',fontSize:20 }}/>
              </div>
              <div style={{ minWidth:0,flex:1 }}>
                <div style={{ fontSize:16,fontWeight:700,color:'#1D1D1F',marginBottom:3 }}>{d.label}</div>
                <div style={{ fontSize:12,color:'#86868B',fontWeight:500 }}>{d.sub}</div>
              </div>
            </div>
            <div style={{ display:'flex',gap:10 }}>
              <button
                onClick={() => handleView(d.key)}
                style={{
                  flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:8,
                  padding:'12px 16px',borderRadius:10,border:`1.5px solid ${d.color}`,
                  background:'#fff',color:d.color,fontSize:13,fontWeight:700,cursor:'pointer',
                  transition:'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background=d.color; e.currentTarget.style.color='#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background='#fff'; e.currentTarget.style.color=d.color; }}
              >
                <i className="fas fa-eye" style={{ fontSize:14 }}/>
                Otwórz
              </button>
              <button
                onClick={() => handleDownload(d.key, d.filename)}
                disabled={downloading === d.key}
                style={{
                  flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:8,
                  padding:'12px 16px',borderRadius:10,border:'none',
                  background:d.color,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',
                  transition:'all 0.2s',opacity: downloading === d.key ? 0.7 : 1,
                }}
                onMouseEnter={e => { if (downloading !== d.key) e.currentTarget.style.opacity='0.85'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = downloading === d.key ? '0.7' : '1'; }}
              >
                <i className={downloading === d.key ? 'fas fa-spinner fa-spin' : 'fas fa-download'} style={{ fontSize:14 }}/>
                {downloading === d.key ? 'Pobieranie...' : 'Pobierz PDF'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}



// ─── GallerySubcategory ────────────────────────────────────────────────────────

function GallerySubcategory({ letter, title, icon, count, children, isDamage = false, defaultOpen = false }: {
  letter: string; title: string; icon: string; count: number;
  children: React.ReactNode; isDamage?: boolean; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom:16,border:'1px solid #E8E8ED',borderRadius:12,overflow:'hidden',background:'#fff' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display:'flex',alignItems:'center',justifyContent:'space-between',
          padding:'16px 20px',cursor:'pointer',userSelect:'none',
          background: isDamage ? (open ? '#fff' : '#FEF2F2') : (open ? '#fff' : '#F5F5F7'),
          borderBottom: open ? '1px solid #E8E8ED' : '1px solid transparent',
          transition:'background 0.2s' }}
      >
        <div style={{ display:'flex',alignItems:'center',gap:12 }}>
          <div style={{ width:34,height:34,borderRadius:8,background:'#B71C1C',color:'#fff',
            display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,flexShrink:0 }}>
            <i className={icon}/>
          </div>
          <div>
            <span style={{ fontSize:12,fontWeight:700,color:'#B71C1C',letterSpacing:'1px' }}>{letter}</span>
            <span style={{ fontSize:16,fontWeight:600,color:'#1D1D1F',marginLeft:8 }}>{title}</span>
          </div>
        </div>
        <div style={{ display:'flex',alignItems:'center',gap:10 }}>
          <span style={{ fontSize:11,fontWeight:600,color:'#86868B',background:'#F5F5F7',
            border:'1px solid #E8E8ED',padding:'3px 10px',borderRadius:20 }}>
            {count} zdjęć
          </span>
          <div style={{ width:28,height:28,borderRadius:'50%',background:'#F5F5F7',
            border:'1px solid #E8E8ED',display:'flex',alignItems:'center',justifyContent:'center' }}>
            <i className="fas fa-chevron-down" style={{
              fontSize:11,color: open ? '#B71C1C' : '#86868B',
              transition:'transform 0.3s',transform: open ? 'rotate(180deg)' : 'none',
            }}/>
          </div>
        </div>
      </div>
      <div className="gal-sub-body" style={{ display:'grid',gridTemplateRows: open ? '1fr' : '0fr',transition:'grid-template-rows 0.5s cubic-bezier(0.4,0,0.2,1)' }}>
        <div className="gal-sub-inner" style={{ overflow:'hidden',minHeight:0 }}>
          <div style={{ padding:20 }}>{children}</div>
        </div>
      </div>
    </div>
  );
}

// ─── PhotoCard ─────────────────────────────────────────────────────────────────

function PhotoCard({ photo, index, total, onClick }: {
  photo: PhotoItem; index: number; total: number; onClick: () => void;
}) {
  const [err, setErr] = useState(false);
  return (
    <div onClick={photo.url && !err ? onClick : undefined}
      style={{ borderRadius:10,overflow:'hidden',background:'#fff',
        border:'1px solid #E8E8ED',boxShadow:'0 1px 3px rgba(0,0,0,0.04)',
        cursor: photo.url && !err ? 'pointer' : 'default',
        transition:'transform 0.3s,box-shadow 0.3s' }}
      onMouseEnter={e => { if (photo.url && !err) { (e.currentTarget as HTMLDivElement).style.transform='scale(1.02)'; (e.currentTarget as HTMLDivElement).style.boxShadow='0 4px 16px rgba(0,0,0,0.08)'; } }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform=''; (e.currentTarget as HTMLDivElement).style.boxShadow='0 1px 3px rgba(0,0,0,0.04)'; }}
    >
      {photo.url && !err ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo.url} alt={photo.label} loading="lazy" decoding="async" fetchPriority="low" onError={() => setErr(true)}
          style={{ width:'100%',height:200,objectFit:'cover',display:'block',background:'#F5F5F7' }} />
      ) : (
        <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
          gap:8,background:'#F5F5F7',height:200 }}>
          <i className="fas fa-camera" style={{ fontSize:28,color:'#AEAEB2' }}/>
          <span style={{ fontSize:12,color:'#86868B',fontWeight:500,textAlign:'center',padding:'0 10px' }}>{photo.label}</span>
        </div>
      )}
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',
        padding:'10px 14px',background:'#F8F8FA',borderTop:'1px solid #E8E8ED' }}>
        <span style={{ fontSize:13,fontWeight:600,color:'#1D1D1F' }}>{photo.label}</span>
        <span style={{ fontSize:11,color:'#B71C1C',fontWeight:700 }}>
          {String(index+1).padStart(2,'0')}/{String(total).padStart(2,'0')}
        </span>
      </div>
    </div>
  );
}

// ─── TireCard ──────────────────────────────────────────────────────────────────

function TireCard({ tire }: { tire: ReportData['tires'][0] }) {
  const tread = tire.tread_mm ?? 0;
  const pct = Math.min((tread / 8) * 100, 100);
  const c = tireColor(tire.status);
  const statusCls = tire.status === 'good' ? 'good' : tire.status === 'warn' ? 'warn' : 'danger';

  return (
    <div style={{ background:'#F5F5F7',border:'1px solid #E8E8ED',borderRadius:12,overflow:'hidden',transition:'box-shadow 0.3s' }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow='0 2px 8px rgba(0,0,0,0.06)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow=''; }}
    >
      <div style={{ height:4,background:c }}/>
      <div style={{ padding:14 }}>
        <div style={{ fontSize:13,fontWeight:700,color:'#1D1D1F',marginBottom:10,textTransform:'uppercase',letterSpacing:'0.5px' }}>
          {tire.position}
        </div>
        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:6 }}>
          {tire.brand && (<>
            <div><div style={{ fontSize:10,color:'#86868B',textTransform:'uppercase',letterSpacing:'0.3px',fontWeight:600 }}>Marka</div>
              <div className="tire-val" style={{ fontSize:13,color:'#1D1D1F',fontWeight:600,marginBottom:4 }}>{tire.brand}</div></div>
            <div><div style={{ fontSize:10,color:'#86868B',textTransform:'uppercase',letterSpacing:'0.3px',fontWeight:600 }}>Model</div>
              <div className="tire-val" style={{ fontSize:13,color:'#1D1D1F',fontWeight:600,marginBottom:4 }}>{tire.model || '—'}</div></div>
          </>)}
          {tire.size && (<>
            <div><div style={{ fontSize:10,color:'#86868B',textTransform:'uppercase',letterSpacing:'0.3px',fontWeight:600 }}>Rozmiar</div>
              <div className="tire-val" style={{ fontSize:13,color:'#1D1D1F',fontWeight:600,marginBottom:4 }}>{tire.size}</div></div>
            <div><div style={{ fontSize:10,color:'#86868B',textTransform:'uppercase',letterSpacing:'0.3px',fontWeight:600 }}>DOT</div>
              <div className="tire-val" style={{ fontSize:13,color:'#1D1D1F',fontWeight:600,marginBottom:4 }}>{tire.dot || '—'}</div></div>
          </>)}
          {tire.season && (
            <div style={{ gridColumn:'1/-1' }}>
              <div style={{ fontSize:10,color:'#86868B',textTransform:'uppercase',letterSpacing:'0.3px',fontWeight:600 }}>Sezon</div>
              <div className="tire-val" style={{ fontSize:13,color:'#1D1D1F',fontWeight:600,marginBottom:4 }}>{tire.season}</div>
            </div>
          )}
        </div>
        <div style={{ marginTop:10,paddingTop:10,borderTop:'1px solid #E8E8ED',textAlign:'center' }}>
          <div style={{ fontSize:26,fontWeight:800,color:c,lineHeight:1 }}>{tread.toFixed(1)} mm</div>
          <div style={{ fontSize:10,color:'#86868B',textTransform:'uppercase',marginTop:2 }}>Bieżnik</div>
          <div style={{ marginTop:6,height:5,background:'rgba(0,0,0,0.06)',borderRadius:3,overflow:'hidden' }}>
            <div style={{ width:`${pct}%`,height:'100%',borderRadius:3,background:c }}/>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PaintDiagram ──────────────────────────────────────────────────────────────

function paintStatusLabel(s: string): string {
  if (s === 'factory')   return 'Fabryczny';
  if (s === 'repainted') return 'Lakierowany';
  if (s === 'repair')    return 'Naprawiany / Szpachlowany';
  return 'Brak danych';
}

function paintDisplayText(m: { value_um: number | null; range_label?: string | null } | undefined): string {
  if (!m) return '—';
  if (m.range_label) return m.range_label;
  if (m.value_um != null && m.value_um > 0) return `${m.value_um} µm`;
  return 'Brak danych';
}

function PaintDiagram({ measurements }: { measurements: ReportData['paint_measurements'] }) {
  const [tooltip, setTooltip] = useState<{ label: string; display: string; status: string; x: number; y: number } | null>(null);
  const measureMap = Object.fromEntries(measurements.map(m => [m.point, m]));

  return (
    <div className="paint-diagram" style={{ position:'relative' }}>
      <div style={{ overflowX:'auto',WebkitOverflowScrolling:'touch' }}>
        <svg viewBox="0 0 400 310" style={{ width:'100%',maxWidth:350,height:'auto',margin:'0 auto',display:'block' }}>
          {/* Car outline */}
          <rect x="132" y="28" width="136" height="254" rx="30" fill="#F1F5F9" stroke="#CBD5E1" strokeWidth="1.5"/>
          <rect x="152" y="88" width="96" height="124" rx="6" fill="#E2E8F0" stroke="#CBD5E1" strokeWidth="1.2"/>
          <rect x="152" y="17" width="96" height="20" rx="7" fill="#E2E8F0" stroke="#CBD5E1" strokeWidth="1.2"/>
          <rect x="152" y="273" width="96" height="20" rx="7" fill="#E2E8F0" stroke="#CBD5E1" strokeWidth="1.2"/>
          {/* Wheels */}
          <rect x="108" y="64" width="28" height="52" rx="6" fill="#374151" stroke="#1F2937" strokeWidth="1"/>
          <rect x="264" y="64" width="28" height="52" rx="6" fill="#374151" stroke="#1F2937" strokeWidth="1"/>
          <rect x="108" y="194" width="28" height="52" rx="6" fill="#374151" stroke="#1F2937" strokeWidth="1"/>
          <rect x="264" y="194" width="28" height="52" rx="6" fill="#374151" stroke="#1F2937" strokeWidth="1"/>

          {/* Measurement points */}
          {PAINT_POINTS.map((pt, i) => {
            const m = measureMap[i + 1];
            const hasValue = m && (m.value_um != null && m.value_um > 0);
            const c = hasValue ? paintColor(m.status) : '#AEAEB2';
            const fontSize = pt.r >= 14 ? 9 : 7;
            const dy = pt.r >= 14 ? 4 : 3;
            const circleText = hasValue ? String(m!.value_um) : '—';
            return (
              <g key={pt.id}
                onMouseEnter={() => hasValue && setTooltip({ label: pt.label, display: paintDisplayText(m), status: m!.status, x: pt.cx, y: pt.cy })}
                onMouseLeave={() => setTooltip(null)}
                style={{ cursor: hasValue ? 'pointer' : 'default' }}
              >
                <circle cx={pt.cx} cy={pt.cy} r={pt.r} fill={c} stroke="#fff" strokeWidth="2" opacity={0.92}/>
                <text x={pt.cx} y={pt.cy + dy} textAnchor="middle" fontSize={fontSize} fill="#fff" fontWeight="700">
                  {circleText}
                </text>
              </g>
            );
          })}

          {/* Tooltip */}
          {tooltip && (
            <g>
              <rect x="40" y="128" width="320" height="54" rx="8" fill="#1D1D1F" opacity="0.96"/>
              <text x="200" y="150" textAnchor="middle" fontSize="12" fill="#fff" fontWeight="700">{tooltip.label}</text>
              <text x="200" y="170" textAnchor="middle" fontSize="11" fill={paintColor(tooltip.status)}>
                {tooltip.display} — {paintStatusLabel(tooltip.status)}
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Paint measurement table — explicit range per panel */}
      <div className="paint-table" style={{ marginTop:16,display:'grid',
        gridTemplateColumns:'repeat(2, minmax(0,1fr))',gap:6,fontSize:12 }}>
        {PAINT_POINTS.map((pt, i) => {
          const m = measureMap[i + 1];
          const text = paintDisplayText(m);
          const dotColor = m && m.value_um != null && m.value_um > 0 ? paintColor(m.status) : '#AEAEB2';
          return (
            <div key={pt.id} style={{ display:'flex',alignItems:'center',gap:8,padding:'6px 10px',
              background:'#F8F8FA',borderRadius:6,border:'1px solid #EEF0F3',minHeight:32 }}>
              <span style={{ width:8,height:8,borderRadius:'50%',background:dotColor,flexShrink:0 }}/>
              <span style={{ flex:1,color:'#1D1D1F',fontSize:11,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{pt.label}</span>
              <span style={{ fontSize:11,fontWeight:700,color: text === 'Brak danych' ? '#AEAEB2' : '#1D1D1F',flexShrink:0 }}>{text}</span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ marginTop:16,padding:'12px 16px',background:'#F5F5F7',borderRadius:8,
        fontSize:11,color:'#86868B',lineHeight:1.8,border:'1px solid #E8E8ED' }}>
        {[
          { c:'#22C55E', label:'≤ 150 μm — Fabryczny' },
          { c:'#F59E0B', label:'151–300 μm — Lakierowany' },
          { c:'#EF4444', label:'> 300 μm — Naprawiany / Szpachlowany' },
        ].map(l => (
          <div key={l.label} style={{ display:'flex',alignItems:'center',gap:6 }}>
            <span style={{ width:10,height:10,borderRadius:'50%',background:l.c,display:'inline-block',flexShrink:0 }}/>
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Loading Screen ─────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div style={{ position:'fixed',inset:0,zIndex:10000,background:'#1A1A2E',
      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:24 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_URL} alt="Zaufaj Rzeczoznawcy"
        style={{ maxWidth:300,height:'auto',filter:'drop-shadow(0 4px 20px rgba(0,0,0,0.4))' }} />
      <div style={{ width:32,height:32,border:'3px solid rgba(183,28,28,0.2)',
        borderTopColor:'#B71C1C',borderRadius:'50%',
        animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Komentarz rzeczoznawcy block (renders only when text non-empty) ────────────
function KomentarzBlock({ text }: { text: string }) {
  if (!text || !text.trim()) return null;
  return (
    <div style={{
      marginTop: 20,
      padding: '14px 16px',
      borderLeft: '3px solid #B71C1C',
      background: '#FFF8F8',
      borderRadius: 6,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#B71C1C', marginBottom: 6, letterSpacing: 0.3, textTransform: 'uppercase' }}>
        Komentarz rzeczoznawcy
      </div>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: '#1D1D1F', fontStyle: 'italic', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {text}
      </p>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function ReportPage({ params }: { params: { dealId: string } }) {
  const { dealId } = params;
  const [data, setData]         = useState<ReportData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ photos: Array<{ label:string; url:string }>; idx: number } | null>(null);
  const [backTop, setBackTop]   = useState(false);
  const [docs, setDocs] = useState<{ has_cepik: boolean; has_damage_history: boolean }>({ has_cepik: false, has_damage_history: false });

  useEffect(() => {
    const onScroll = () => setBackTop(window.scrollY > 400);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    fetch(`/api/report/${dealId}/documents/status`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setDocs({ has_cepik: !!d.has_cepik, has_damage_history: !!d.has_damage_history }); })
      .catch(() => { /* non-fatal — section just stays hidden */ });
  }, [dealId]);

  useEffect(() => {
    // Use the Next.js API proxy route (relative URL — same origin, no CORS/expiry issues).
    fetch(`/api/report/${dealId}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => {
        const norm: ReportData = {
          ...d,
          equipment:          Array.isArray(d.equipment)          ? d.equipment          : [],
          eurotax_equipment:  Array.isArray(d.eurotax_equipment)  ? d.eurotax_equipment  : [],
          wyposazenie: {
            standardowe:         Array.isArray(d.wyposazenie?.standardowe)         ? d.wyposazenie.standardowe.filter((x: unknown): x is string => typeof x === 'string' && x.trim().length > 0)         : [],
            dodatkowe:           Array.isArray(d.wyposazenie?.dodatkowe)           ? d.wyposazenie.dodatkowe.filter((x: unknown): x is string => typeof x === 'string' && x.trim().length > 0)           : [],
            specjalne:           Array.isArray(d.wyposazenie?.specjalne)           ? d.wyposazenie.specjalne.filter((x: unknown): x is string => typeof x === 'string' && x.trim().length > 0)           : [],
            czynniki_obnizajace: Array.isArray(d.wyposazenie?.czynniki_obnizajace) ? d.wyposazenie.czynniki_obnizajace.filter((x: unknown): x is string => typeof x === 'string' && x.trim().length > 0) : [],
          },
          komentarze: {
            dane_pojazdu: typeof d.komentarze?.dane_pojazdu === 'string' ? d.komentarze.dane_pojazdu.trim() : '',
            wyposazenie:  typeof d.komentarze?.wyposazenie  === 'string' ? d.komentarze.wyposazenie.trim()  : '',
            zdjecia:      typeof d.komentarze?.zdjecia      === 'string' ? d.komentarze.zdjecia.trim()      : '',
            opony_lakier: typeof d.komentarze?.opony_lakier === 'string' ? d.komentarze.opony_lakier.trim() : '',
            uszkodzenia:  typeof d.komentarze?.uszkodzenia  === 'string' ? d.komentarze.uszkodzenia.trim()  : '',
            silnik:       typeof d.komentarze?.silnik       === 'string' ? d.komentarze.silnik.trim()       : '',
          },
          documents_check:    Array.isArray(d.documents_check)    ? d.documents_check    : [],
          tires:              Array.isArray(d.tires)              ? d.tires              : [],
          paint_measurements: Array.isArray(d.paint_measurements) ? d.paint_measurements : [],
          damages:            Array.isArray(d.damages)            ? d.damages.map((x: Record<string,unknown>) => ({ index: Number(x.index)||0, type: String(x.type||''), location: String(x.location||''), size: String(x.size||''), severity: String(x.severity||'cosmetic'), description: String(x.description||''), photo_url: x.photo_url ? String(x.photo_url) : null, photo_urls: Array.isArray(x.photo_urls) ? (x.photo_urls as unknown[]).map(String) : (x.photo_url ? [String(x.photo_url)] : []) })) : [],
          interior_damages:   Array.isArray(d.interior_damages)   ? d.interior_damages.map((x: Record<string,unknown>) => ({ index: Number(x.index)||0, type: String(x.type||''), location: String(x.location||''), size: String(x.size||''), severity: String(x.severity||'cosmetic'), description: String(x.description||''), photo_url: x.photo_url ? String(x.photo_url) : null, photo_urls: Array.isArray(x.photo_urls) ? (x.photo_urls as unknown[]).map(String) : (x.photo_url ? [String(x.photo_url)] : []) })) : [],
          notes:              d.notes != null && typeof d.notes !== 'string' ? String(d.notes) : (d.notes ?? ''),
          vehicle: d.vehicle ? Object.fromEntries(Object.entries(d.vehicle).map(([k,v]) => [k, v == null || typeof v === 'object' ? (typeof v === 'boolean' ? v : '') : v])) : { make:'', model:'', vin:'', registration_plate:'', year:'', mileage:'', color:'', fuel_type:'', transmission:'', body_type:'', drive_type:'', doors:'', seats:'', weight_kg:'', engine_capacity_cc:'', engine_power_hp:'', engine_power_kw:'' },
          damage_summary:     d.damage_summary  ?? { cosmetic:0, structural:0, bodywork:0 },
          quick_stats:        d.quick_stats ? Object.fromEntries(Object.entries(d.quick_stats).map(([k,v]) => [k, v == null || typeof v === 'object' ? '' : v])) : {},
          photos: {
            standard:  Array.isArray(d.photos?.standard)  ? d.photos.standard  : [],
            body:      Array.isArray(d.photos?.body)      ? d.photos.body      : [],
            interior:  Array.isArray(d.photos?.interior)  ? d.photos.interior  : [],
            engine:    Array.isArray(d.photos?.engine)    ? d.photos.engine    : [],
            documents: Array.isArray(d.photos?.documents) ? d.photos.documents : [],
            damages:   Array.isArray(d.photos?.damages)   ? d.photos.damages   : [],
          },
        };
        setData(norm);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [dealId]);

  const openLightbox = useCallback((photos: Array<{ label:string; url:string }>, idx: number) => {
    setLightbox({ photos, idx });
  }, []);

  const scrollToDamage = useCallback((kind: 'ext' | 'int', index: number) => {
    const el = document.getElementById(`damage-${kind}-${index}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Capture the existing background (set inline by React) so we can restore
    // it cleanly after the yellow flash fades — otherwise the tinted exterior
    // card backgrounds would be wiped to transparent until the next render.
    const prev = el.style.backgroundColor;
    el.style.transition = 'background-color 0.3s';
    el.style.backgroundColor = HIGHLIGHT_COLOR;
    window.setTimeout(() => { el.style.backgroundColor = prev; }, 2000);
  }, []);

  // ⚠️ ALL HOOKS MUST BE DECLARED BEFORE EARLY RETURNS — Rules of Hooks (React #310)
  const handlePrint = useCallback(() => {
    // Force-open all collapsibles BEFORE print so content/images render.
    // The CSS @media print overrides also do this, but adding the class
    // applies it earlier so images get a chance to actually render to the
    // browser's print layout pipeline.
    document.body.classList.add('force-print-open');

    const cleanup = () => document.body.classList.remove('force-print-open');
    window.addEventListener('afterprint', cleanup, { once: true });

    const doPrint = () => {
      try { window.print(); }
      finally {
        // Safety: some browsers don't fire afterprint reliably
        setTimeout(cleanup, 1000);
      }
    };

    // Wait for all images to finish loading before printing so none appear blank.
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('img'));
    const pending = imgs.filter(img => !img.complete);
    if (pending.length === 0) {
      // Defer one frame so the force-print-open layout takes effect
      requestAnimationFrame(() => requestAnimationFrame(doPrint));
      return;
    }
    let settled = 0;
    const onSettle = () => {
      settled++;
      if (settled >= pending.length) {
        requestAnimationFrame(() => requestAnimationFrame(doPrint));
      }
    };
    pending.forEach(img => {
      img.addEventListener('load',  onSettle, { once: true });
      img.addEventListener('error', onSettle, { once: true });
    });
    // Fallback: print anyway after 5s even if some images fail
    setTimeout(doPrint, 5000);
  }, []);

  const [pdfLoading, setPdfLoading] = useState(false);

  const handleDownloadPdf = useCallback(async () => {
    setPdfLoading(true);
    try {
      // Dynamically import html2pdf.js (client-side only)
      const html2pdfModule = await import('html2pdf.js');
      const html2pdf = html2pdfModule.default;

      // Force-open all collapsible sections so content renders
      document.body.classList.add('force-print-open');

      // Wait a tick for sections to expand and images to start loading
      await new Promise(r => setTimeout(r, 300));

      // Wait for all images to finish loading
      const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('#main-content img'));
      const pending = imgs.filter(img => !img.complete);
      if (pending.length > 0) {
        await Promise.race([
          Promise.all(pending.map(img => new Promise<void>(resolve => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          }))),
          new Promise<void>(r => setTimeout(r, 5000)), // 5s timeout
        ]);
      }

      const element = document.getElementById('main-content');
      if (!element) throw new Error('Content element not found');

      // Hide no-print elements (buttons, etc.) during PDF generation
      const noPrintEls = element.querySelectorAll<HTMLElement>('.no-print');
      noPrintEls.forEach(el => { el.style.display = 'none'; });

      await html2pdf().set({
        margin:      [8, 5, 8, 5],
        filename:    `Raport_stanu_pojazdu_${dealId}.pdf`,
        image:       { type: 'jpeg', quality: 0.92 },
        html2canvas: { scale: 2, useCORS: true, logging: false, letterRendering: true },
        jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak:   { mode: ['avoid-all', 'css', 'legacy'] },
      }).from(element).save();

      // Restore hidden elements
      noPrintEls.forEach(el => { el.style.display = ''; });
      document.body.classList.remove('force-print-open');
    } catch (err) {
      document.body.classList.remove('force-print-open');
      alert('Nie udało się wygenerować PDF. Spróbuj ponownie.');
      console.error('PDF download failed:', err);
    } finally {
      setPdfLoading(false);
    }
  }, [dealId]);

  if (loading) return <LoadingScreen />;

  if (error || !data) {
    return (
      <div style={{ minHeight:'100vh',background:'#1A1A2E',display:'flex',flexDirection:'column',
        alignItems:'center',justifyContent:'center',gap:16,padding:32 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_URL} alt="Zaufaj Rzeczoznawcy" style={{ maxWidth:240,height:'auto',marginBottom:24 }} />
        <div style={{ fontSize:48,marginBottom:8 }}>🔍</div>
        <h1 style={{ color:'#fff',fontSize:22,fontWeight:800,marginBottom:8 }}>Raport nie znaleziony</h1>
        <p style={{ color:'rgba(255,255,255,0.6)',fontSize:14,lineHeight:1.6,textAlign:'center' }}>
          Zlecenie #{dealId} nie istnieje lub nie jest dostępne.
        </p>
        {error && <p style={{ color:'#f87171',fontSize:12,marginTop:4 }}>{error}</p>}
      </div>
    );
  }

  const v = data.vehicle;
  const vehicleName = [v.make, v.model, v.version].filter(Boolean).join(' ');
  const heroSubtitle = [
    (v as any).engine_capacity_cc ? `${(v as any).engine_capacity_cc} cc` : null,
    (v as any).engine_power_hp ? `${(v as any).engine_power_hp} KM` : null,
    v.transmission,
    v.fuel_type,
    v.year ? String(v.year) : null,
  ].filter(Boolean).join(' · ');

  const allStandardPhotos = data.photos.standard.filter(p => p.url).map(p => ({ label: p.label, url: p.url! }));

  return (
    <>
      <style>{`
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}
        html{scroll-behavior:smooth;-webkit-font-smoothing:antialiased;overflow-x:hidden;}
        body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
          background:#F5F5F7!important;color:#1D1D1F!important;line-height:1.6;min-height:100vh;overflow-x:hidden;
          max-width:100vw;}
        ::-webkit-scrollbar{width:7px;}
        ::-webkit-scrollbar-track{background:#F5F5F7;}
        ::-webkit-scrollbar-thumb{background:#AEAEB2;border-radius:10px;}

        /* ── Responsive grids ── */
        .rg-4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;}
        .rg-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;}
        .rg-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:20px;}
        .rg-tire-paint{display:grid;grid-template-columns:45fr 55fr;gap:28px;align-items:start;}
        .rg-photos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;}
        .rg-gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;}

        /* ── Sections stack — clean vertical rhythm ── */
        .sections-stack{display:flex;flex-direction:column;gap:16px;}
        .sections-stack .section-card{transition:box-shadow 0.3s,transform 0.3s;}
        .sections-stack .section-card:hover{box-shadow:0 4px 16px rgba(0,0,0,0.06);}

        .summary-bar{display:flex;align-items:stretch;gap:24px;flex-wrap:wrap;min-width:0;}
        .summary-specs{flex:1;display:flex;flex-wrap:wrap;align-items:center;gap:8px;
          padding-right:24px;border-right:1px solid #E8E8ED;min-width:0;}
        .summary-specs > span{max-width:100%;overflow:hidden;text-overflow:ellipsis;}
        .summary-damages{display:flex;gap:12px;flex-shrink:0;align-items:stretch;flex-wrap:wrap;}
        /* Defensive overflow safety — long enum labels (e.g., body type) won't break layout */
        .field-val,.tire-val{word-break:break-word;overflow-wrap:anywhere;min-width:0;}
        .stat-val{word-break:break-word;overflow-wrap:anywhere;hyphens:auto;}

        @media(max-width:1024px){
          .rg-4{grid-template-columns:repeat(3,minmax(0,1fr));}
          .rg-tire-paint{grid-template-columns:1fr;}
          .rg-std-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;}
          .summary-specs{border-right:none;padding-right:0;padding-bottom:16px;border-bottom:1px solid #E8E8ED;}
          .summary-damages{justify-content:center;}
        }
        @media(max-width:640px){
          .rg-std-grid{grid-template-columns:1fr!important;}
        }
        @media(max-width:768px){
          .rg-4{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}
          .rg-3{grid-template-columns:1fr;}
          .rg-stats{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}
          .rg-photos{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}
          .rg-gallery{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}
          .rg-tire-paint{grid-template-columns:1fr;}
          .summary-bar{flex-direction:column;}
          .summary-specs{border-right:none;padding-right:0;padding-bottom:12px;border-bottom:1px solid #E8E8ED;min-width:0;}
          .summary-damages{justify-content:center;}
          .damage-counter-mobile{min-width:90px!important;padding:10px 12px!important;}
          .damage-counter-val-mobile{font-size:22px!important;}
          .section-header{padding:16px 14px!important;}
          .sec-body-inner{padding:14px!important;}
          .sections-stack{gap:12px;}
          /* Tighten tire card inner padding on narrow screens */
          .tire-outer-grid{gap:10px!important;}
        }
        @media(max-width:480px){
          /* Vehicle details: 2-col → 1-col for full-width field rows on phones */
          .rg-4{grid-template-columns:1fr!important;gap:6px;}
          .rg-stats{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}
          .rg-photos,.rg-gallery{grid-template-columns:1fr;}
          /* Tire cards: 2-col → 1-col */
          .tire-outer-grid{grid-template-columns:1fr!important;}
          .summary-damages{flex-direction:column;align-items:stretch;}
          .sec-body-inner{padding:10px!important;}
          .section-header{padding:14px 12px!important;}
          .field-val{word-break:break-word;overflow-wrap:anywhere;font-size:14px!important;}
          .sections-stack{gap:10px;}
          /* 44x44 min touch targets for PDF download buttons */
          .pdf-dl-btn{min-height:44px;padding:12px 18px!important;font-size:14px!important;}
          /* Paint diagram: ensure the SVG fills the available width on phones */
          .paint-diagram svg{max-width:100%!important;}
          /* Paint measurement table: 2-col → 1-col */
          .paint-table{grid-template-columns:1fr!important;}
        }

        /* ── .force-print-open: applied to <body> just before window.print()
              so collapsed sections expand BEFORE the print dialog opens.
              Otherwise images inside hidden grid rows may not render. ── */
        body.force-print-open .section-body,
        body.force-print-open .gal-sub-body{
          display:grid!important;grid-template-rows:1fr!important;overflow:visible!important;
        }
        body.force-print-open .sec-body-inner{
          opacity:1!important;padding:20px!important;overflow:visible!important;
          border-top:1px solid #E8E8ED!important;
        }
        body.force-print-open .gal-sub-inner{overflow:visible!important;}

        @media print {
          .no-print{display:none!important;}
          *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
          @page{size:A4;margin:12mm 10mm;}
          body{background:#fff!important;}

          /* Force ALL collapsible sections open */
          .section-body{display:grid!important;grid-template-rows:1fr!important;overflow:visible!important;}
          .sec-body-inner{opacity:1!important;padding:20px!important;overflow:visible!important;border-top:1px solid #E8E8ED!important;}

          /* Force GallerySubcategory sections open */
          .gal-sub-body{display:grid!important;grid-template-rows:1fr!important;overflow:visible!important;}
          .gal-sub-inner{overflow:visible!important;}

          /* Layout overrides for print */
          .rg-4{grid-template-columns:repeat(4,minmax(0,1fr))!important;}
          .rg-stats{grid-template-columns:repeat(4,minmax(0,1fr))!important;}
          .rg-photos,.rg-gallery{grid-template-columns:repeat(3,minmax(0,1fr))!important;}
          .rg-tire-paint{grid-template-columns:1fr 1fr!important;}
          .summary-bar{flex-direction:row!important;}
          .summary-specs{border-right:1px solid #E0E0E0!important;border-bottom:none!important;padding-right:16px!important;padding-bottom:0!important;}
          .sections-stack{gap:12px;}

          /* Ensure images render */
          img{display:block!important;max-width:100%!important;}
        }
      `}</style>

      {/* ── HEADER ── */}
      <header style={{ background:'#1A1A2E',padding:'20px 15px',position:'relative',zIndex:100,textAlign:'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_URL} alt="Zaufaj Rzeczoznawcy"
          style={{ maxWidth:300,height:'auto',display:'inline-block',filter:'drop-shadow(0 2px 12px rgba(0,0,0,0.3))' }} />
        {/* Red accent stripe */}
        <div style={{ position:'absolute',bottom:0,left:0,right:0,height:3,background:'#B71C1C' }}/>
      </header>

      <div style={{ textAlign:'center',letterSpacing:'3px',fontSize:14,color:'#B71C1C',fontWeight:600,
        padding:'10px',textTransform:'uppercase' }}>
        RAPORT STANU POJAZDU — #{data.deal_id}
      </div>

      {/* ── MAIN ── */}
      <main style={{ maxWidth:1200,margin:'0 auto',padding:'0 12px 60px',overflow:'hidden',width:'100%' }} id="main-content">

        {/* PDF download + Print buttons */}
        <div className="no-print" style={{ display:'flex',justifyContent:'flex-end',gap:8,marginBottom:-10,padding:'8px 0' }}>
          <button onClick={handleDownloadPdf} disabled={pdfLoading}
            className="pdf-dl-btn"
            style={{ display:'inline-flex',alignItems:'center',gap:6,padding:'8px 16px',fontSize:13,fontWeight:600,
              color:'#fff',background:'#B71C1C',border:'1px solid #B71C1C',borderRadius:6,cursor: pdfLoading ? 'wait' : 'pointer',
              fontFamily:'inherit',transition:'all 0.3s',opacity: pdfLoading ? 0.7 : 1 }}
          >
            <i className={pdfLoading ? 'fas fa-spinner fa-spin' : 'fas fa-file-pdf'} style={{ fontSize:14 }}/>
            {pdfLoading ? 'Generowanie…' : 'Pobierz PDF'}
          </button>
          <button onClick={() => handlePrint()}
            style={{ display:'inline-flex',alignItems:'center',gap:6,padding:'8px 16px',fontSize:13,fontWeight:500,
              color:'#86868B',background:'#fff',border:'1px solid #E0E0E0',borderRadius:6,cursor:'pointer',
              fontFamily:'inherit',transition:'all 0.3s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color='#1A1A2E'; (e.currentTarget as HTMLButtonElement).style.borderColor='#1A1A2E'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color='#86868B'; (e.currentTarget as HTMLButtonElement).style.borderColor='#E0E0E0'; }}
          >
            <i className="fas fa-print" style={{ fontSize:14 }}/> Drukuj
          </button>
        </div>

        {/* ── HERO ── */}
        <section style={{ marginTop:32,marginBottom:32 }}>
          {/* Title block */}
          <div style={{ textAlign:'center',marginBottom:28 }}>
            <div style={{ display:'inline-flex',alignItems:'center',gap:8,background:'#B71C1C',color:'#fff',
              padding:'8px 22px',borderRadius:20,fontSize:11,fontWeight:700,letterSpacing:'3px',
              textTransform:'uppercase',marginBottom:16,boxShadow:'0 2px 10px rgba(183,28,28,0.25)' }}>
              <i className="fas fa-file-alt" style={{ fontSize:12 }}/> RAPORT STANU POJAZDU
            </div>
            <h1 style={{ fontSize:'clamp(28px,5vw,38px)',fontWeight:800,color:'#1D1D1F',
              lineHeight:1.15,marginBottom:6,letterSpacing:'-0.5px' }}>
              {vehicleName || 'Pojazd'}
            </h1>
            <p style={{ fontSize:17,color:'#86868B',fontWeight:400 }}>{heroSubtitle}</p>
          </div>

          {/* Photo */}
          <div style={{ position:'relative',borderRadius:16,overflow:'hidden',
            boxShadow:'0 8px 30px rgba(0,0,0,0.12)',background:'#fff',border:'1px solid #E8E8ED' }}>
            <div style={{ width:'100%',maxHeight:500,position:'relative',overflow:'hidden',background:'#F5F5F7',borderRadius:12 }}>
              {data.hero_photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.hero_photo_url} alt={vehicleName}
                  style={{ width:'100%',maxHeight:500,objectFit:'contain',display:'block',position:'relative',zIndex:1,background:'#F5F5F7' }} />
              ) : (
                <div style={{ width:'100%',height:400,background:'linear-gradient(145deg,#1A1A2E,#12121F)',
                  display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12 }}>
                  <i className="fas fa-camera" style={{ fontSize:56,color:'rgba(183,28,28,0.2)' }}/>
                  <span style={{ color:'rgba(255,255,255,0.3)',fontSize:13,fontWeight:500,letterSpacing:'2px',textTransform:'uppercase' }}>Zdjęcie główne pojazdu</span>
                </div>
              )}
              {/* Gradient overlay */}
              <div style={{ position:'absolute',bottom:0,left:0,right:0,height:'55%',
                background:'linear-gradient(to top,rgba(0,0,0,0.6) 0%,rgba(0,0,0,0.1) 60%,transparent 100%)',
                zIndex:2,pointerEvents:'none' }}/>
            </div>
            {/* Badges */}
            <div style={{ position:'absolute',bottom:16,left:16,right:16,display:'flex',
              justifyContent:'space-between',alignItems:'flex-end',zIndex:3 }}>
              {v.mileage && (
                <div style={{ background:'rgba(255,255,255,0.95)',backdropFilter:'blur(12px)',
                  padding:'10px 18px',borderRadius:10,border:'1px solid #E8E8ED',boxShadow:'0 2px 12px rgba(0,0,0,0.1)' }}>
                  <div style={{ fontSize:9,color:'#86868B',textTransform:'uppercase',letterSpacing:'1.5px',fontWeight:600 }}>Przebieg</div>
                  <div style={{ fontSize:17,color:'#1D1D1F',fontWeight:700 }}>
                    {Number(v.mileage).toLocaleString('pl-PL')} {v.mileage_unit || 'km'}
                  </div>
                </div>
              )}
              {v.overall_condition && (
                <div style={{ background:'rgba(255,255,255,0.95)',backdropFilter:'blur(12px)',
                  padding:'10px 18px',borderRadius:10,border:'1px solid #22C55E',boxShadow:'0 2px 12px rgba(0,0,0,0.1)' }}>
                  <div style={{ fontSize:9,color:'#86868B',textTransform:'uppercase',letterSpacing:'1.5px',fontWeight:600 }}>Stan ogólny</div>
                  <div style={{ fontSize:17,color:'#22C55E',fontWeight:700 }}>{v.overall_condition}</div>
                </div>
              )}
            </div>
          </div>

          {/* Quick stats */}
          <div className="rg-stats">
            {[
              { icon:'fas fa-calendar-alt', value: data.quick_stats.year || v.year, label:'Rok produkcji' },
              { icon:'fas fa-gas-pump',     value: data.quick_stats.fuel || v.fuel_type, label:'Rodzaj paliwa' },
              { icon:'fas fa-bolt',         value: data.quick_stats.power || ((v as any).engine_power_hp ? `${(v as any).engine_power_hp} KM` : null), label: (v as any).engine_power_kw ? `${(v as any).engine_power_kw} kW` : 'Moc' },
              { icon:'fas fa-cogs',         value: data.quick_stats.transmission || v.transmission, label:'Skrzynia biegów' },
            ].map(s => s.value && (
              <div key={s.label} style={{ background:'#fff',borderRadius:12,padding:'18px 14px',
                textAlign:'center',border:'1px solid #E8E8ED',boxShadow:'0 1px 3px rgba(0,0,0,0.04)',transition:'all 0.3s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform='translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow='0 2px 8px rgba(0,0,0,0.06)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform=''; (e.currentTarget as HTMLDivElement).style.boxShadow='0 1px 3px rgba(0,0,0,0.04)'; }}
              >
                <div style={{ fontSize:20,color:'#B71C1C',marginBottom:6 }}><i className={s.icon}/></div>
                <div className="stat-val" style={{ fontSize:17,fontWeight:700,color:'#1D1D1F',lineHeight:1.2 }}>{String(s.value)}</div>
                <div style={{ fontSize:10,color:'#86868B',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:500,marginTop:2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Summary bar */}
          <div className="summary-bar" style={{ marginTop:20,background:'#fff',borderRadius:12,border:'1px solid #E8E8ED',
            boxShadow:'0 1px 3px rgba(0,0,0,0.04)',padding:'20px 28px' }}>
            {/* Spec pills */}
            <div className="summary-specs">
              {[
                { label:'Rocznik',    val: v.year },
                { label:'Przebieg',   val: v.mileage ? `${Number(v.mileage).toLocaleString('pl-PL')} km` : null },
                { label:'Pojemność',  val: v.engine_capacity_cc ? `${v.engine_capacity_cc} cc` : null },
                { label:'Moc',        val: v.engine_power_hp ? `${v.engine_power_hp} KM` : null },
                { label:'Paliwo',     val: v.fuel_type },
                { label:'Napęd',      val: v.drive_type },
                { label:'Skrzynia',   val: v.transmission },
                { label:'Kolor',      val: v.color },
              ].filter(s => s.val).map(s => (
                <span key={s.label} style={{ display:'inline-flex',alignItems:'center',gap:5,
                  background:'#F5F5F7',color:'#1D1D1F',fontSize:13,fontWeight:500,
                  padding:'5px 12px',borderRadius:6,border:'1px solid #E8E8ED',
                  maxWidth:'100%',wordBreak:'break-word',overflowWrap:'anywhere' }}>
                  <span style={{ color:'#86868B',fontWeight:600,fontSize:11,textTransform:'uppercase',letterSpacing:'0.3px' }}>{s.label}</span>
                  {' '}{String(s.val)}
                </span>
              ))}
            </div>
            {/* Damage counters */}
            <div className="summary-damages">
              {[
                { label:'Uszkodzenia\nkosmetyczne', count: data.damage_summary.cosmetic,  cls: data.damage_summary.cosmetic  > 0 ? 'yellow' : 'green' },
                { label:'Uszkodzenia\nkonstrukcyjne', count: data.damage_summary.structural, cls: data.damage_summary.structural > 0 ? 'red' : 'green' },
                { label:'Uszkodzenia\nblacharskie',  count: data.damage_summary.bodywork,   cls: data.damage_summary.bodywork   > 0 ? 'red' : 'green' },
              ].map(d => {
                const bg = d.cls === 'green' ? '#F0FDF4' : d.cls === 'yellow' ? '#FFFBEB' : '#FEF2F2';
                const clr = d.cls === 'green' ? '#22C55E' : d.cls === 'yellow' ? '#F59E0B' : '#EF4444';
                const bdr = d.cls === 'green' ? 'rgba(34,197,94,0.3)' : d.cls === 'yellow' ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)';
                return (
                  <div key={d.label} style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                    padding:'12px 18px',borderRadius:8,minWidth:120,textAlign:'center',
                    border:`1px solid ${bdr}`,background:bg,transition:'all 0.3s' }}>
                    <div style={{ fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px',
                      lineHeight:1.3,marginBottom:4,color:clr,whiteSpace:'pre-line' }}>{d.label}</div>
                    <div style={{ fontSize:28,fontWeight:800,lineHeight:1,color:clr }}>{d.count}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <div style={{ width:'90%',maxWidth:1080,height:1,background:'#E8E8ED',margin:'24px auto' }}/>

        {/* ── INSPECTION DETAILS BAR ── */}
        {(data.company_name || data.client_name || data.inspection_place || data.inspection_date || data.inspector_name) && (
          <div style={{ background:'#fff',borderRadius:12,border:'1px solid #E8E8ED',
            boxShadow:'0 1px 3px rgba(0,0,0,0.04)',padding:'16px 20px',marginBottom:24,
            display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:'12px 20px' }}>
            {[
              { icon:'fas fa-building',         label:'Firma',           val: data.company_name },
              { icon:'fas fa-user',             label:'Klient',          val: data.client_name },
              { icon:'fas fa-map-marker-alt',   label:'Miejsce oględzin',val: data.inspection_place },
              { icon:'fas fa-calendar-alt',     label:'Data oględzin',   val: formatDate(data.inspection_date) },
              { icon:'fas fa-user-tie',         label:'Inspektor',       val: data.inspector_name },
            ].filter(i => i.val).map(i => (
              <div key={i.label} style={{ display:'flex',alignItems:'flex-start',gap:10 }}>
                <div style={{ width:30,height:30,borderRadius:6,background:'#FEF2F2',
                  display:'flex',alignItems:'center',justifyContent:'center',
                  color:'#B71C1C',fontSize:12,flexShrink:0 }}>
                  <i className={i.icon}/>
                </div>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:10,color:'#86868B',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:600 }}>{i.label}</div>
                  <div style={{ fontSize:13,fontWeight:600,color:'#1D1D1F',marginTop:1,wordBreak:'break-word' }}>{i.val}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── SECTION 01: DANE POJAZDU ── */}
        <div className="sections-stack">
        <CollapsibleSection id="dane-pojazdu" icon="fas fa-car" num="01 / Dane pojazdu" title="Dane pojazdu">
          <div className="rg-4">
            {[
              { icon:'fas fa-id-card',       label:'Numer rejestracyjny', value: v.registration_plate, highlight: true },
              { icon:'fas fa-car',           label:'Marka',               value: v.make },
              { icon:'fas fa-car-side',      label:'Model',               value: v.model },
              { icon:'fas fa-barcode',       label:'VIN',                 value: v.vin, mono: true },
              { icon:'fas fa-calendar',      label:'Rok produkcji',       value: v.year },
              { icon:'fas fa-tachometer-alt',label:'Przebieg',            value: v.mileage ? `${Number(v.mileage).toLocaleString('pl-PL')} ${v.mileage_unit||'km'}` : null, highlight: true },
              { icon:'fas fa-palette',       label:'Kolor',               value: v.color },
              { icon:'fas fa-gas-pump',      label:'Rodzaj paliwa',       value: v.fuel_type },
              { icon:'fas fa-paint-roller',  label:'Lakier',              value: v.paint_type },
              { icon:'fas fa-bolt',          label:'Moc silnika',         value: v.engine_power_hp ? `${v.engine_power_kw ? v.engine_power_kw+' kW / ' : ''}${v.engine_power_hp} KM` : null },
              { icon:'fas fa-cog',           label:'Pojemność',           value: v.engine_capacity_cc ? `${v.engine_capacity_cc} cc` : null },
              { icon:'fas fa-cogs',          label:'Skrzynia biegów',     value: v.transmission },
              { icon:'fas fa-road',          label:'Napęd',               value: v.drive_type },
              { icon:'fas fa-door-open',     label:'Liczba drzwi',        value: v.doors },
              { icon:'fas fa-users',         label:'Liczba miejsc',       value: v.seats },
              { icon:'fas fa-weight-hanging',label:'Masa własna',         value: v.weight_kg ? `${v.weight_kg} kg` : null },
              { icon:'fas fa-truck',         label:'Nadwozie',            value: v.body_type },
              { icon:'fas fa-calendar-check',label:'Data pierwszej rejestracji', value: v.first_registration_date },
              { icon:'fas fa-user',          label:'Liczba właścicieli',  value: v.owners_count },
              { icon:'fas fa-star',          label:'Wersja wyposażenia',  value: v.version },
              { icon:'fas fa-check-circle',  label:'Stan ogólny',         value: v.overall_condition, highlight: true, fullWidth: true },
            ].filter(f => f.value !== null && f.value !== undefined && String(f.value) !== '').map((f, i) => (
              <div key={i} style={{
                display:'flex',alignItems:'flex-start',gap:10,padding:'12px 14px',
                borderRadius:8,gridColumn: f.fullWidth ? '1/-1' : undefined,
                background: f.highlight ? '#FEF2F2' : '#F5F5F7',
                border: f.highlight ? '1px solid rgba(183,28,28,0.12)' : '1px solid transparent',
                transition:'all 0.3s',overflow:'hidden',minWidth:0,
              }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.background='#fff'; el.style.borderColor='#E8E8ED'; el.style.boxShadow='0 1px 3px rgba(0,0,0,0.04)'; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.background=f.highlight?'#FEF2F2':'#F5F5F7'; el.style.borderColor=f.highlight?'rgba(183,28,28,0.12)':'transparent'; el.style.boxShadow=''; }}
              >
                <div style={{ width:32,height:32,borderRadius:8,background:'rgba(0,0,0,0.03)',
                  display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,
                  color: f.highlight ? '#B71C1C' : '#86868B',fontSize:13 }}>
                  <i className={f.icon}/>
                </div>
                <div style={{ display:'flex',flexDirection:'column',minWidth:0 }}>
                  <div style={{ fontSize:10,textTransform:'uppercase',letterSpacing:'0.5px',
                    color:'#86868B',fontWeight:600,lineHeight:1.3 }}>{f.label}</div>
                  <div className="field-val" style={{ fontSize: f.mono ? 12 : 15,fontWeight:600,color:'#1D1D1F',lineHeight:1.3,marginTop:2,
                    fontFamily: f.mono ? '\'Courier New\',monospace' : undefined,
                    wordBreak:'break-word',overflowWrap:'anywhere' } as React.CSSProperties}>
                    {String(f.value)}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <KomentarzBlock text={data.komentarze?.dane_pojazdu || ''} />
        </CollapsibleSection>



        {/* ── SECTION 02: WYPOSAŻENIE (manualne, Stage-2 appraiser) ── */}
        {(() => {
          const w = data.wyposazenie;
          if (!w) return null;
          const hasStd = w.standardowe.length > 0;
          const hasDod = w.dodatkowe.length > 0;
          const hasSpe = w.specjalne.length > 0;
          const hasCzy = w.czynniki_obnizajace.length > 0;
          if (!hasStd && !hasDod && !hasSpe && !hasCzy) return null;

          // Bullet card style — matches Eurotax block visual language.
          const bulletCard = (text: React.ReactNode, right?: React.ReactNode, key?: number) => (
            <div key={key} style={{
              display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,
              padding:'10px 14px',borderRadius:10,
              background:'#F8F8FA',border:'1px solid #E8E8ED',
              transition:'all 0.2s',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background='#F0F0F5'; (e.currentTarget as HTMLDivElement).style.borderColor='#D0D0D8'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background='#F8F8FA'; (e.currentTarget as HTMLDivElement).style.borderColor='#E8E8ED'; }}
            >
              <div style={{ display:'flex',alignItems:'center',gap:10,minWidth:0,flex:1 }}>
                <i className="fas fa-check-circle" style={{ color:'#22C55E',fontSize:14,flexShrink:0 }}/>
                <span style={{ fontSize:13,fontWeight:500,color:'#1D1D1F',wordBreak:'break-word',whiteSpace:'normal' }}>{text}</span>
              </div>
              {right ? <span style={{ fontSize:12,fontWeight:600,color:'#86868B',whiteSpace:'nowrap',flexShrink:0 }}>{right}</span> : null}
            </div>
          );

          // Match "<text> <number> PLN" - number may have inner spaces ("1 690")
          // and an optional leading minus sign (e.g. "-1200 PLN" for czynniki).
          const PRICE_RE = /^(.+?)\s+(-?\d[\d \s]*\s*PLN)\s*$/i;
          const renderWithPrice = (item: string, i: number) => {
            const m = item.match(PRICE_RE);
            if (!m) return bulletCard(item, undefined, i);
            const price = m[2].trim();
            const isNegative = price.startsWith('-');
            return (
              <div key={i} style={{
                display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,
                padding:'10px 14px',borderRadius:10,
                background:'#F8F8FA',border:'1px solid #E8E8ED',
                transition:'all 0.2s',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background='#F0F0F5'; (e.currentTarget as HTMLDivElement).style.borderColor='#D0D0D8'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background='#F8F8FA'; (e.currentTarget as HTMLDivElement).style.borderColor='#E8E8ED'; }}
              >
                <div style={{ display:'flex',alignItems:'center',gap:10,minWidth:0,flex:1 }}>
                  <i className="fas fa-check-circle" style={{ color:'#22C55E',fontSize:14,flexShrink:0 }}/>
                  <span style={{ fontSize:13,fontWeight:500,color:'#1D1D1F',wordBreak:'break-word',whiteSpace:'normal' }}>{m[1].trim()}</span>
                </div>
                <span style={{ fontSize:12,fontWeight:600,color: isNegative ? '#B71C1C' : '#86868B',whiteSpace:'nowrap',flexShrink:0 }}>{price}</span>
              </div>
            );
          };

          const subHeader = (label: string) => (
            <div style={{
              display:'flex',alignItems:'center',gap:10,
              fontSize:14,fontWeight:700,color:'#1D1D1F',
              margin:'18px 0 10px',
              paddingBottom:8,borderBottom:'2px solid #FEE2E2',
            }}>
              <span style={{ width:4,height:16,background:'#B71C1C',borderRadius:2 }}/>
              {label}
            </div>
          );

          // Two-column grid kicks in when item count > 12.
          const gridFor = (count: number) => ({
            display:'grid',
            gridTemplateColumns: count > 12 ? 'repeat(auto-fill,minmax(260px,1fr))' : '1fr',
            gap:8,
          } as React.CSSProperties);

          // Wyposażenie standardowe: 3 cols desktop / 2 tablet / 1 mobile.
          // Uses a className so we can hook responsive breakpoints in CSS.
          const stdGridStyle: React.CSSProperties = {
            display:'grid',
            gridTemplateColumns:'repeat(3,minmax(0,1fr))',
            gap:8,
          };

          return (
            <CollapsibleSection id="wyposazenie-manual" icon="fas fa-clipboard-check" num="02 / Wyposażenie" title="Wyposażenie pojazdu">
              <div style={{ fontSize:12,color:'#86868B',marginBottom:8,display:'flex',alignItems:'center',gap:8 }}>
                <i className="fas fa-user-check" style={{ color:'#B71C1C' }}/>
                Lista wyposażenia uzupełniona przez rzeczoznawcę
              </div>

              {hasStd && (
                <>
                  {subHeader('Wyposażenie standardowe')}
                  <div className="rg-std-grid" style={stdGridStyle}>
                    {w.standardowe.map((it, i) => bulletCard(it, undefined, i))}
                  </div>
                </>
              )}

              {hasDod && (
                <>
                  {subHeader('Wyposażenie dodatkowe')}
                  <div className="rg-std-grid" style={stdGridStyle}>
                    {w.dodatkowe.map((it, i) => renderWithPrice(it, i))}
                  </div>
                </>
              )}

              {hasSpe && (
                <>
                  {subHeader('Wyposażenie specjalne')}
                  <div className="rg-std-grid" style={stdGridStyle}>
                    {w.specjalne.map((it, i) => bulletCard(it, undefined, i))}
                  </div>
                </>
              )}

              {hasCzy && (
                <>
                  {subHeader('Czynniki obniżające wartość')}
                  <div className="rg-std-grid" style={stdGridStyle}>
                    {w.czynniki_obnizajace.map((it, i) => renderWithPrice(it, i))}
                  </div>
                </>
              )}

              <KomentarzBlock text={data.komentarze?.wyposazenie || ''} />
            </CollapsibleSection>
          );
        })()}

        {/* ── SECTION 02: WYPOSAŻENIE (Eurotax) ── */}
        {(data.eurotax_equipment && data.eurotax_equipment.length > 0) && (
          <CollapsibleSection id="wyposazenie" icon="fas fa-list-check" num="02 / Wyposażenie" title="Wyposażenie — Eurotax">
            <div style={{ fontSize:12,color:'#86868B',marginBottom:16,display:'flex',alignItems:'center',gap:8 }}>
              <i className="fas fa-file-pdf" style={{ color:'#B71C1C' }}/>
              Lista wyposażenia wyodrębniona z wyceny Eurotax
            </div>
            <div className="rg-photos" style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:10 }}>
              {data.eurotax_equipment.map((item, i) => (
                <div key={i} style={{
                  display:'flex',alignItems:'center',gap:10,
                  padding:'10px 14px',borderRadius:10,
                  background:'#F8F8FA',border:'1px solid #E8E8ED',
                  transition:'all 0.2s',
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background='#F0F0F5'; (e.currentTarget as HTMLDivElement).style.borderColor='#D0D0D8'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background='#F8F8FA'; (e.currentTarget as HTMLDivElement).style.borderColor='#E8E8ED'; }}
                >
                  <i className="fas fa-check-circle" style={{ color:'#22C55E',fontSize:14,flexShrink:0 }}/>
                  <span style={{ fontSize:13,fontWeight:500,color:'#1D1D1F' }}>{item}</span>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* ── SECTION 03: ZDJĘCIA PODSTAWOWE ── */}
        <CollapsibleSection id="zdjecia-podstawowe" icon="fas fa-camera" num="03 / Zdjęcia podstawowe" title="Zdjęcia podstawowe">
          {data.photos.standard.length > 0 ? (
            <>
              <div className="rg-photos">
                {data.photos.standard.map((p, i) => (
                  <PhotoCard key={i} photo={p} index={i} total={data.photos.standard.length}
                    onClick={() => allStandardPhotos.length > 0 && openLightbox(allStandardPhotos, allStandardPhotos.findIndex(x => x.url === p.url))} />
                ))}
              </div>
              <div style={{ textAlign:'center',marginTop:16,fontSize:12,color:'#AEAEB2' }}>
                <i className="fas fa-hand-pointer"/> Kliknij zdjęcie, aby powiększyć
              </div>
            </>
          ) : (
            <p style={{ color:'#86868B',textAlign:'center',padding:'32px 0' }}>Brak zdjęć podstawowych</p>
          )}
        </CollapsibleSection>

        <div style={{ width:'90%',maxWidth:1080,height:1,background:'#E8E8ED',margin:'24px auto' }}/>

        {/* ── SECTION 04: DOKUMENTACJA POJAZDU ── */}
        {data.documents_check.length > 0 && (
          <>
            <CollapsibleSection id="dokumentacja" icon="fas fa-folder-open" num="04 / Dokumentacja pojazdu" title="Dokumentacja pojazdu">
              <div className="rg-3" style={{ gap:12 }}>
                {data.documents_check.map((d, i) => {
                  const badgeCls = d.status_type === 'green' ? { bg:'rgba(34,197,94,0.15)', clr:'#16a34a' }
                    : d.status_type === 'red' ? { bg:'rgba(239,68,68,0.15)', clr:'#dc2626' }
                    : d.status_type === 'blue' ? { bg:'rgba(59,130,246,0.15)', clr:'#2563eb' }
                    : { bg:'rgba(107,114,128,0.15)', clr:'#4b5563' };
                  return (
                    <div key={i} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',
                      padding:'14px 16px',borderRadius:8,background:'#F5F5F7',
                      border:'1px solid transparent',transition:'all 0.3s',gap:10 }}
                      onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.background='#fff'; el.style.borderColor='#E8E8ED'; el.style.boxShadow='0 1px 3px rgba(0,0,0,0.04)'; }}
                      onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.background='#F5F5F7'; el.style.borderColor='transparent'; el.style.boxShadow=''; }}
                    >
                      <span style={{ fontSize:14,fontWeight:600,color:'#1D1D1F' }}>{d.name}</span>
                      <span style={{ padding:'4px 12px',borderRadius:50,fontSize:12,fontWeight:600,
                        whiteSpace:'nowrap',flexShrink:0,background:badgeCls.bg,color:badgeCls.clr }}>
                        {d.status}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop:20,padding:'14px 20px',borderRadius:8,
                background:'#F0FDF4',border:'1px solid rgba(34,197,94,0.2)',
                textAlign:'center',fontSize:14,color:'#16a34a',fontWeight:500 }}>
                ✅ Dokumentacja zweryfikowana — {data.documents_check.filter(d => d.status_type === 'green').length} z {data.documents_check.length} pozycji pozytywnych
              </div>
            </CollapsibleSection>
            <div style={{ width:'90%',maxWidth:1080,height:1,background:'#E8E8ED',margin:'24px auto' }}/>
          </>
        )}

        {/* ── SECTION 05: OPONY I POMIAR LAKIERU ── */}
        <CollapsibleSection id="opony-lakier" icon="fas fa-circle-notch" num="05 / Opony i pomiar lakieru" title="Opony i pomiar lakieru">
          <div className="rg-tire-paint">
            {/* Tires */}
            <div style={{ background:'#fff',borderRadius:12,border:'1px solid #E8E8ED',boxShadow:'0 1px 3px rgba(0,0,0,0.04)',overflow:'hidden' }}>
              <div style={{ padding:'20px 24px',borderBottom:'1px solid #E8E8ED' }}>
                <div style={{ display:'flex',alignItems:'center',gap:10,fontSize:17,fontWeight:700,color:'#1D1D1F' }}>
                  <i className="fas fa-circle-notch" style={{ color:'#B71C1C',fontSize:18 }}/> Opony
                </div>
                <div style={{ fontSize:13,color:'#86868B',marginTop:3 }}>Stan opon na dzień oględzin</div>
              </div>
              <div style={{ padding:24 }}>
                {data.tires.length > 0 ? (
                  <div className="tire-outer-grid" style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:14 }}>
                    {data.tires.map((t, i) => <TireCard key={i} tire={t} />)}
                  </div>
                ) : (
                  <p style={{ color:'#86868B',textAlign:'center' }}>Brak danych o oponach</p>
                )}
                <div style={{ marginTop:16,padding:'12px 16px',background:'#F5F5F7',borderRadius:8,
                  fontSize:11,color:'#86868B',lineHeight:1.8,border:'1px solid #E8E8ED' }}>
                  <div>Dobry ≥ 4,0 mm &nbsp;·&nbsp; Do wymiany 1,6–4,0 mm &nbsp;·&nbsp; Wymienić! &lt; 1,6 mm</div>
                </div>
              </div>
            </div>
            {/* Paint */}
            <div style={{ background:'#fff',borderRadius:12,border:'1px solid #E8E8ED',boxShadow:'0 1px 3px rgba(0,0,0,0.04)',overflow:'hidden' }}>
              <div style={{ padding:'20px 24px',borderBottom:'1px solid #E8E8ED' }}>
                <div style={{ display:'flex',alignItems:'center',gap:10,fontSize:17,fontWeight:700,color:'#1D1D1F' }}>
                  <i className="fas fa-paint-brush" style={{ color:'#B71C1C',fontSize:18 }}/> Pomiar grubości lakieru
                </div>
                <div style={{ fontSize:13,color:'#86868B',marginTop:3 }}>Wartości w μm (mikrometrach)</div>
              </div>
              <div style={{ padding:24 }}>
                {data.paint_measurements.length > 0 ? (
                  <PaintDiagram measurements={data.paint_measurements} />
                ) : (
                  <p style={{ color:'#86868B',textAlign:'center' }}>Brak pomiarów lakieru</p>
                )}
              </div>
            </div>
          </div>
          <KomentarzBlock text={data.komentarze?.opony_lakier || ''} />
        </CollapsibleSection>

        <div style={{ width:'90%',maxWidth:1080,height:1,background:'#E8E8ED',margin:'24px auto' }}/>

        {/* ── SECTION 06: GALERIA ZDJĘCIOWA ── */}
        <CollapsibleSection id="galeria" icon="fas fa-images" num="06 / Galeria zdjęciowa" title="Galeria zdjęciowa">
          {[
            { letter:'A', title:'Nadwozie',    icon:'fas fa-car',         photos: data.photos.body },
            { letter:'B', title:'Wnętrze',     icon:'fas fa-couch',       photos: data.photos.interior },
            { letter:'C', title:'Silnik',      icon:'fas fa-cog',         photos: data.photos.engine },
            { letter:'D', title:'Dokumentacja',icon:'fas fa-file-alt',    photos: data.photos.documents },
            { letter:'E', title:'Uszkodzenia', icon:'fas fa-exclamation-triangle', photos: data.photos.damages, isDamage: true },
          ].map((g) => {
            const withUrls = g.photos.filter(p => p.url).map(p => ({ label: p.label, url: p.url! }));
            return (
              <GallerySubcategory key={g.letter} letter={g.letter} title={g.title} icon={g.icon}
                count={g.photos.length} isDamage={g.isDamage} defaultOpen={false}>
                {g.isDamage && data.damages.length > 0 && (
                  <div style={{ padding:'12px 16px',marginBottom:16,background:'#FEF2F2',
                    borderLeft:'3px solid #EF4444',borderRadius:'0 8px 8px 0',fontSize:13,color:'#991B1B',
                    display:'flex',flexWrap:'wrap',gap:6,alignItems:'center' }}>
                    <span style={{ fontWeight:600 }}>Zarejestrowano {data.damages.length} uszkodzeń:</span>
                    {data.damages.map((d, i) => (
                      <button key={i} onClick={() => scrollToDamage('ext', d.index)}
                        style={{ appearance:'none',border:'1px solid rgba(239,68,68,0.35)',
                          background:'#fff',color:'#991B1B',borderRadius:999,padding:'4px 10px',
                          fontSize:12,fontWeight:600,cursor:'pointer',minHeight:28,
                          transition:'all 0.15s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background='#FEE2E2'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background='#fff'; }}
                        title="Przejdź do szczegółów uszkodzenia"
                      >
                        #{d.index} {d.type}{d.location ? ` (${d.location})` : ''}
                      </button>
                    ))}
                  </div>
                )}
                {g.photos.length > 0 ? (
                  <div className="rg-gallery">
                    {g.photos.map((p, i) => (
                      <div key={i}
                        onClick={() => p.url && openLightbox(withUrls, withUrls.findIndex(x => x.url === p.url))}
                        style={{ borderRadius:10,overflow:'hidden',background:'#fff',
                          border: g.isDamage ? '1px solid #E8E8ED' : '1px solid #E8E8ED',
                          borderLeft: g.isDamage ? '4px solid #EF4444' : undefined,
                          boxShadow:'0 1px 3px rgba(0,0,0,0.04)',
                          cursor: p.url ? 'pointer' : 'default',transition:'all 0.3s' }}
                        onMouseEnter={e => { if (p.url) { (e.currentTarget as HTMLDivElement).style.transform='scale(1.02)'; (e.currentTarget as HTMLDivElement).style.boxShadow='0 4px 16px rgba(0,0,0,0.08)'; } }}
                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform=''; (e.currentTarget as HTMLDivElement).style.boxShadow='0 1px 3px rgba(0,0,0,0.04)'; }}
                      >
                        <div style={{ position:'relative',width:'100%',aspectRatio:'4/3',overflow:'hidden',background:'#F5F5F7' }}>
                          {p.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.url} alt={p.label} loading="lazy" decoding="async" fetchPriority="low"
                              style={{ position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',display:'block' }} />
                          ) : (
                            <div style={{ position:'absolute',inset:0,display:'flex',flexDirection:'column',
                              alignItems:'center',justifyContent:'center',gap:8 }}>
                              <i className="fas fa-camera" style={{ fontSize:28,color:'#AEAEB2' }}/>
                              <span style={{ fontSize:12,color:'#86868B',textAlign:'center',padding:'0 8px' }}>{p.label}</span>
                            </div>
                          )}
                        </div>
                        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',
                          padding:'10px 14px',background:'#F8F8FA',borderTop:'1px solid #E8E8ED' }}>
                          <span style={{ fontSize:13,fontWeight:600,color:'#1D1D1F' }}>{p.label}</span>
                          {g.isDamage && p.damage_type && (
                            <span style={{ padding:'2px 10px',borderRadius:20,fontSize:11,fontWeight:600,
                              background:'#FFF7ED',color:'#EA580C' }}>{p.damage_type}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color:'#86868B',fontSize:13 }}>Brak zdjęć w tej kategorii</p>
                )}
              </GallerySubcategory>
            );
          })}

          <div style={{ marginTop:24,padding:'18px 24px',background:'#F8F8FA',borderRadius:8,
            textAlign:'center',border:'1px solid #E8E8ED' }}>
            <div style={{ fontSize:14,color:'#1D1D1F',fontWeight:500 }}>
              Łącznie {[data.photos.body,data.photos.interior,data.photos.engine,data.photos.documents,data.photos.damages].flat().filter(p=>p.url).length} zdjęć
            </div>
            <div style={{ fontSize:12,color:'#AEAEB2',marginTop:4 }}>Dokumentacja fotograficzna pojazdu</div>
          </div>

          {data.videos && data.videos.length > 0 && (
            <div style={{ marginTop:24 }}>
              <h3 style={{ fontSize:16,fontWeight:600,color:'#1D1D1F',margin:'0 0 12px',
                display:'flex',alignItems:'center',gap:8 }}>
                <i className="fas fa-video" style={{ color:'#0071E3' }}/> Film z silnikiem
              </h3>
              {data.videos.map((v) => (
                <div key={v.slot_id} style={{ borderRadius:10,overflow:'hidden',
                  border:'1px solid #E8E8ED',background:'#000' }}>
                  <video
                    src={v.url}
                    controls
                    preload="metadata"
                    playsInline
                    style={{ display:'block',width:'100%',maxHeight:480,background:'#000' }}
                  >
                    {v.mime && <source src={v.url} type={v.mime} />}
                  </video>
                </div>
              ))}
            </div>
          )}
          <KomentarzBlock text={data.komentarze?.zdjecia || ''} />
        </CollapsibleSection>

        {/* ── EXTERIOR DAMAGE ── */}
        {data.damages.length > 0 && (
          <>
            <div style={{ width:'90%',maxWidth:1080,height:1,background:'#E8E8ED',margin:'24px auto' }}/>
            <CollapsibleSection id="uszkodzenia" icon="fas fa-exclamation-triangle" num="07 / Uszkodzenia zewnętrzne" title="Uszkodzenia zewnętrzne" defaultOpen>
              <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
                {data.damages.map((d, i) => (
                  <div key={i} id={`damage-ext-${d.index}`} style={{ display:'flex',gap:14,padding:'14px 16px',borderRadius:8,
                    background: d.severity === 'structural' ? '#FEF2F2' : '#FFFBEB',
                    border: `1px solid ${d.severity === 'structural' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`,
                    alignItems:'flex-start',scrollMarginTop:100,transition:'box-shadow 0.3s' }}>
                    <div style={{ width:32,height:32,borderRadius:6,flexShrink:0,
                      background: d.severity === 'structural' ? '#EF4444' : '#F59E0B',
                      display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:13 }}>
                      {d.index}
                    </div>
                    <div style={{ flex:1,minWidth:0 }}>
                      <div style={{ display:'flex',flexWrap:'wrap',gap:6,marginBottom:4 }}>
                        {d.type && <span style={{ fontSize:12,fontWeight:700,color: d.severity === 'structural' ? '#DC2626' : '#D97706' }}>{d.type}</span>}
                        {d.location && <span style={{ fontSize:12,color:'#6B7280' }}>· {d.location}</span>}
                        {d.size && <span style={{ fontSize:11,color:'#9CA3AF',padding:'1px 8px',background:'#F3F4F6',borderRadius:10 }}>{d.size}</span>}
                      </div>
                      {d.description && <p style={{ fontSize:12,color:'#4B5563',margin:0,lineHeight:1.5 }}>{d.description}</p>}
                      {(() => {
                        const urls = (d.photo_urls && d.photo_urls.length > 0)
                          ? d.photo_urls
                          : (d.photo_url ? [d.photo_url] : []);
                        if (urls.length === 0) return null;
                        const lightboxPhotos = urls.map((u, ui) => ({
                          label: `Uszkodzenie ${d.index} — zdjęcie ${ui + 1}`,
                          url: u,
                        }));
                        return (
                          <div style={{ marginTop:8,display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(140px, 1fr))',gap:6,maxWidth:560 }}>
                            {urls.map((u, ui) => (
                              <button
                                key={ui}
                                type="button"
                                onClick={() => openLightbox(lightboxPhotos, ui)}
                                style={{ padding:0,border:'1px solid #E8E8ED',borderRadius:8,overflow:'hidden',
                                  background:'transparent',cursor:'pointer',display:'block' }}
                                aria-label={`Otwórz zdjęcie uszkodzenia ${d.index} — ${ui + 1}`}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={u} alt={`Uszkodzenie ${d.index} — zdjęcie ${ui + 1}`}
                                  loading="lazy" decoding="async" fetchPriority="low"
                                  style={{ width:'100%',height:120,objectFit:'cover',display:'block',background:'#F5F5F7' }}
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          </>
        )}

        {/* ── INTERIOR DAMAGE ── */}
        {(data.interior_damages?.length ?? 0) > 0 && (
          <>
            <div style={{ width:'90%',maxWidth:1080,height:1,background:'#E8E8ED',margin:'24px auto' }}/>
            <CollapsibleSection id="uszkodzenia-wnetrze" icon="fas fa-couch" num="08 / Uszkodzenia wnętrza" title="Uszkodzenia wnętrza">
              <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
                {(data.interior_damages ?? []).map((d, i) => (
                  <div key={i} id={`damage-int-${d.index}`} style={{ display:'flex',gap:14,padding:'14px 16px',borderRadius:8,
                    background:'#F5F5F7',border:'1px solid #E8E8ED',alignItems:'flex-start',scrollMarginTop:100,transition:'background-color 0.3s' }}>
                    <div style={{ width:32,height:32,borderRadius:6,flexShrink:0,
                      background:'#6B7280',display:'flex',alignItems:'center',
                      justifyContent:'center',color:'#fff',fontWeight:700,fontSize:13 }}>
                      {d.index}
                    </div>
                    <div style={{ flex:1,minWidth:0 }}>
                      <div style={{ display:'flex',flexWrap:'wrap',gap:6,marginBottom:4 }}>
                        {d.type && <span style={{ fontSize:12,fontWeight:700,color:'#374151' }}>{d.type}</span>}
                        {d.location && <span style={{ fontSize:12,color:'#6B7280' }}>· {d.location}</span>}
                        {d.size && <span style={{ fontSize:11,color:'#9CA3AF',padding:'1px 8px',background:'#fff',borderRadius:10,border:'1px solid #E8E8ED' }}>{d.size}</span>}
                      </div>
                      {d.description && <p style={{ fontSize:12,color:'#4B5563',margin:0,lineHeight:1.5 }}>{d.description}</p>}
                      {(() => {
                        const urls = (d.photo_urls && d.photo_urls.length > 0)
                          ? d.photo_urls
                          : (d.photo_url ? [d.photo_url] : []);
                        if (urls.length === 0) return null;
                        const lightboxPhotos = urls.map((u, ui) => ({
                          label: `Uszkodzenie wnętrza ${d.index} — zdjęcie ${ui + 1}`,
                          url: u,
                        }));
                        return (
                          <div style={{ marginTop:8,display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(140px, 1fr))',gap:6,maxWidth:560 }}>
                            {urls.map((u, ui) => (
                              <button
                                key={ui}
                                type="button"
                                onClick={() => openLightbox(lightboxPhotos, ui)}
                                style={{ padding:0,border:'1px solid #E8E8ED',borderRadius:8,overflow:'hidden',
                                  background:'transparent',cursor:'pointer',display:'block' }}
                                aria-label={`Otwórz zdjęcie uszkodzenia wnętrza ${d.index} — ${ui + 1}`}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={u} alt={`Uszkodzenie ${d.index} — zdjęcie ${ui + 1}`}
                                  loading="lazy" decoding="async" fetchPriority="low"
                                  style={{ width:'100%',height:120,objectFit:'cover',display:'block',background:'#F5F5F7' }}
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
              <KomentarzBlock text={data.komentarze?.uszkodzenia || ''} />
            </CollapsibleSection>
          </>
        )}

        {/* ── DAMAGE MAP (Position 8 — Mapa uszkodzeń) ── */}
        {(data.damages.length > 0 || (data.interior_damages?.length ?? 0) > 0) && (
          <>
            <div style={{ width:'90%',maxWidth:1080,height:1,background:'#E8E8ED',margin:'24px auto' }}/>
            <CollapsibleSection
              id="mapa-uszkodzen"
              icon="fas fa-map-marker-alt"
              num=""
              title="Mapa uszkodzeń"
              defaultOpen
            >
              <DamageMap
                damages={data.damages}
                interiorDamages={data.interior_damages ?? []}
                bodyType={data.vehicle.body_type || ''}
                scrollToDamage={scrollToDamage}
              />
            </CollapsibleSection>
          </>
        )}

        {/* ── MECHANICAL CONDITION ── */}
        {(() => {
          const mech = data.mechanical || {};
          // Same label set + value mapping as the Protokół Wycena PDF
          // (services/protokol_wycena_pdf.py::MECHANICAL_ROWS) so the
          // condition report and the appraisal stay in sync.
          type Mode = 'fitness' | 'fluid' | 'presence' | 'good_bad' | 'yesno';
          const ROWS: Array<[string, string, Mode]> = [
            ['engineCondition',    'Stan silnika',                'good_bad'],
            ['engineOilLevel',     'Poziom oleju',                'fluid'],
            ['coolantLevel',       'Poziom płynu chłodniczego',   'fluid'],
            ['engineNoises',       'Hałasy silnika',              'presence'],
            ['engineSmoke',        'Dymienie silnika',            'presence'],
            ['transmission',       'Skrzynia biegów',             'fitness'],
            ['clutch',             'Sprzęgło',                    'fitness'],
            ['driveShaft',         'Wał napędowy',                'fitness'],
            ['frontSuspension',    'Zawieszenie przednie',        'fitness'],
            ['rearSuspension',     'Zawieszenie tylne',           'fitness'],
            ['shockAbsorbers',     'Amortyzatory',                'fitness'],
            ['frontBrakes',        'Hamulce przednie',            'fitness'],
            ['rearBrakes',         'Hamulce tylne',               'fitness'],
            ['handbrake',          'Hamulec ręczny',              'fitness'],
            ['steeringPlay',       'Luz kierownicy',              'presence'],
            ['steeringPump',       'Wspomaganie kierownicy',      'fitness'],
            ['exhaustSystem',      'Układ wydechowy',             'fitness'],
            ['airConditioning',    'Klimatyzacja',                'fitness'],
            ['heatingSystem',      'Ogrzewanie',                  'fitness'],
            ['electricalSystem',   'Instalacja elektryczna',      'fitness'],
            ['batteryCondition',   'Akumulator',                  'good_bad'],
            ['lightsAll',          'Oświetlenie',                 'fitness'],
            ['wipers',             'Wycieraczki',                 'fitness'],
          ];
          const labelFor = (raw: unknown, mode: Mode): { text: string; color: string } => {
            const v = raw == null ? '' : String(raw).trim().toUpperCase();
            const GREEN = '#16A34A';
            const RED = '#DC2626';
            const GRAY = '#6B7280';
            if (!v) return { text: '-', color: GRAY };
            // Boolean-ish values
            if (v === 'TRUE' || v === 'TAK' || v === 'YES' || v === '1') {
              if (mode === 'fitness')  return { text: 'Sprawny',     color: GREEN };
              if (mode === 'fluid')    return { text: 'OK',          color: GREEN };
              if (mode === 'presence') return { text: 'Brak',        color: GREEN };
              if (mode === 'good_bad') return { text: 'Dobry',       color: GREEN };
              return { text: 'Tak', color: GREEN };
            }
            if (v === 'FALSE' || v === 'NIE' || v === 'NO' || v === '0') {
              if (mode === 'fitness')  return { text: 'Niesprawny',  color: RED };
              if (mode === 'fluid')    return { text: 'Niski',       color: RED };
              if (mode === 'presence') return { text: 'Występują',   color: RED };
              if (mode === 'good_bad') return { text: 'Zły',         color: RED };
              return { text: 'Nie', color: RED };
            }
            // Free-text values fall through unchanged (e.g. "Dobry", "Zły")
            const lower = v.toLowerCase();
            const goodWords = ['dobry', 'sprawny', 'ok', 'brak'];
            const badWords  = ['zły', 'niesprawny', 'niski', 'występują', 'wystepuja'];
            const color = goodWords.some(w => lower.includes(w)) ? GREEN
                        : badWords.some(w => lower.includes(w)) ? RED
                        : GRAY;
            // Title-case for readability
            const text = v.length > 1 ? v[0] + v.slice(1).toLowerCase() : v;
            return { text, color };
          };
          const visibleRows = ROWS
            .map(([key, label, mode]) => {
              const raw = (mech as Record<string, unknown>)[key];
              if (raw == null || String(raw).trim() === '') return null;
              const { text, color } = labelFor(raw, mode);
              return { key, label, text, color };
            })
            .filter(Boolean) as Array<{ key: string; label: string; text: string; color: string }>;
          const warningLights = String(
            (mech as Record<string, unknown>).warning_lights ??
            (mech as Record<string, unknown>).warningLights ?? ''
          ).trim();
          const testDriveComment = String((mech as Record<string, unknown>).testDriveComment ?? '').trim();
          // Inspector who skipped Step 9 of the wizard leaves every key
          // null, so visibleRows is empty and both extra rows are blank.
          // Render a muted placeholder rather than hiding the whole section
          // — the client should see that Stan mechaniczny was skipped, not
          // assume the report has no such section at all.
          const noData = visibleRows.length === 0 && !warningLights && !testDriveComment;
          return (
            <>
              <div style={{ width:'90%',maxWidth:1080,height:1,background:'#E8E8ED',margin:'24px auto' }}/>
              <CollapsibleSection id="stan-mechaniczny" icon="fas fa-cogs" num="09 / Stan mechaniczny" title="Stan mechaniczny">
                {noData ? (
                  <div style={{
                    background:'#F8F8FA',borderRadius:8,border:'1px dashed #D0D0D8',
                    padding:'24px 20px',textAlign:'center',
                    color:'#86868B',fontSize:13,fontStyle:'italic',lineHeight:1.5,
                  }}>
                    Brak danych — sekcja nieuzupełniona przez rzeczoznawcę
                  </div>
                ) : (
                  <div style={{ background:'#fff',borderRadius:8,border:'1px solid #E8E8ED',overflow:'hidden' }}>
                    <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
                      <thead>
                        <tr style={{ background:'#F8F8FA',borderBottom:'1px solid #E8E8ED' }}>
                          <th style={{ textAlign:'left',padding:'10px 14px',fontSize:12,fontWeight:700,color:'#6B7280',textTransform:'uppercase',letterSpacing:'0.04em' }}>Element</th>
                          <th style={{ textAlign:'left',padding:'10px 14px',fontSize:12,fontWeight:700,color:'#6B7280',textTransform:'uppercase',letterSpacing:'0.04em' }}>Stan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRows.map((r, i) => (
                          <tr key={r.key} style={{ borderBottom: i < visibleRows.length - 1 ? '1px solid #F0F0F2' : undefined }}>
                            <td style={{ padding:'10px 14px',color:'#1D1D1F',fontWeight:500 }}>{r.label}</td>
                            <td style={{ padding:'10px 14px',fontWeight:700,color:r.color }}>{r.text}</td>
                          </tr>
                        ))}
                        {testDriveComment && (
                          <tr style={{ borderTop:'1px solid #E8E8ED' }}>
                            <td style={{ padding:'10px 14px',color:'#1D1D1F',fontWeight:500 }}>Uwagi z jazdy próbnej</td>
                            <td style={{ padding:'10px 14px',color:'#374151' }}>{testDriveComment}</td>
                          </tr>
                        )}
                        {warningLights && (
                          <tr style={{ borderTop:'1px solid #E8E8ED' }}>
                            <td style={{ padding:'10px 14px',color:'#1D1D1F',fontWeight:500 }}>Kontrolki ostrzegawcze</td>
                            <td style={{ padding:'10px 14px',color:'#DC2626',fontWeight:600 }}>{warningLights}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
                <KomentarzBlock text={data.komentarze?.silnik || ''} />
              </CollapsibleSection>
            </>
          );
        })()}

        </div>{/* end sections-stack */}

        {/* Attached PDF Reports — rendered below inside `dodatkowe-dokumenty`
            CollapsibleSection. The standalone <DocumentsSection> component was
            previously rendered here too, which caused CEPIK / Historia Szkodowości
            to appear twice on the page. Removed; the inline section is canonical. */}

        {/* Notes */}
        {data.notes && (
          <div style={{ marginTop:24,background:'#fff',borderRadius:12,padding:'20px 24px',
            boxShadow:'0 1px 3px rgba(0,0,0,0.04)',borderLeft:'4px solid #B71C1C',border:'1px solid #E8E8ED' }}>
            <h3 style={{ fontSize:14,fontWeight:700,color:'#86868B',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8 }}>
              Uwagi inspektora
            </h3>
            <p style={{ fontSize:14,color:'#1D1D1F',lineHeight:1.6,margin:0 }}>{data.notes}</p>
          </div>
        )}

        {/* Signatures */}
        {(data.signatures?.inspector || data.signatures?.client) && (
          <div style={{ marginTop:20,background:'#fff',borderRadius:12,padding:'20px 24px',
            boxShadow:'0 1px 3px rgba(0,0,0,0.04)',border:'1px solid #E8E8ED' }}>
            <h3 style={{ fontSize:14,fontWeight:700,color:'#86868B',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:16 }}>
              Podpisy
            </h3>
            <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:16 }}>
              {data.signatures?.inspector && (
                <div style={{ textAlign:'center' }}>
                  {data.signatures.inspector.signature_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={data.signatures.inspector.signature_url} alt="Podpis inspektora" style={{ maxHeight:80,maxWidth:200,marginBottom:8 }}/>
                  )}
                  <div style={{ borderTop:'2px solid #E8E8ED',paddingTop:8,fontSize:13,fontWeight:600 }}>
                    Inspektor: {data.signatures.inspector.name}
                  </div>
                </div>
              )}
              {data.signatures?.client && (
                <div style={{ textAlign:'center' }}>
                  {data.signatures.client.signature_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={data.signatures.client.signature_url} alt="Podpis klienta" style={{ maxHeight:80,maxWidth:200,marginBottom:8 }}/>
                  )}
                  <div style={{ borderTop:'2px solid #E8E8ED',paddingTop:8,fontSize:13,fontWeight:600 }}>
                    Klient: {data.signatures.client.name}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── DODATKOWE DOKUMENTY (CEPIK + Historia Szkodowości) ── */}
        {(docs.has_cepik || docs.has_damage_history) && (
          <>
            <div style={{ width:'90%',maxWidth:1080,height:1,background:'#E8E8ED',margin:'24px auto' }}/>
            <CollapsibleSection id="dodatkowe-dokumenty" icon="fas fa-file-pdf" num="" title="Dodatkowe dokumenty">
              <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))',gap:14 }}>
                {[
                  { type: 'cepik',          label: 'Raport Historia Pojazdu (CEPIK)', filename: `CEPIK_Raport_${dealId}.pdf`,        present: docs.has_cepik },
                  { type: 'damage_history', label: 'Historia Szkodowości',           filename: `Historia_Szkodowosci_${dealId}.pdf`, present: docs.has_damage_history },
                ].filter(d => d.present).map(d => {
                  const url = `/api/report/${dealId}/document/${d.type}`;
                  return (
                    <div key={d.type}
                      style={{ display:'flex',gap:14,padding:'16px 18px',borderRadius:10,
                        background:'#fff',border:'1px solid #E8E8ED',boxShadow:'0 1px 3px rgba(0,0,0,0.04)',alignItems:'center' }}>
                      <div style={{ width:44,height:54,borderRadius:6,flexShrink:0,
                        background:'#FEE2E2',display:'flex',alignItems:'center',justifyContent:'center',
                        color:'#DC2626',fontSize:14,fontWeight:700,letterSpacing:'0.5px' }}>
                        PDF
                      </div>
                      <div style={{ flex:1,minWidth:0 }}>
                        <div style={{ fontSize:13,fontWeight:600,color:'#1A1A2E',marginBottom:6,lineHeight:1.3 }}>
                          {d.label}
                        </div>
                        <div className="no-print" style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
                          <a href={url} target="_blank" rel="noopener noreferrer"
                            style={{ display:'inline-flex',alignItems:'center',gap:6,padding:'6px 12px',fontSize:12,fontWeight:500,
                              color:'#1A1A2E',background:'#F5F5F7',border:'1px solid #E0E0E0',borderRadius:6,
                              textDecoration:'none',fontFamily:'inherit' }}>
                            <i className="fas fa-eye"/> Otwórz
                          </a>
                          <a href={`${url}?download=1`} download={d.filename}
                            style={{ display:'inline-flex',alignItems:'center',gap:6,padding:'6px 12px',fontSize:12,fontWeight:500,
                              color:'#fff',background:'#B71C1C',border:'1px solid #B71C1C',borderRadius:6,
                              textDecoration:'none',fontFamily:'inherit' }}>
                            <i className="fas fa-download"/> Pobierz
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CollapsibleSection>
          </>
        )}

        {/* PDF bottom */}
        <div className="no-print" style={{ display:'flex',justifyContent:'center',gap:8,padding:'24px 0' }}>
          <button onClick={handleDownloadPdf} disabled={pdfLoading}
            className="pdf-dl-btn"
            style={{ display:'inline-flex',alignItems:'center',gap:6,padding:'8px 16px',fontSize:13,fontWeight:600,
              color:'#fff',background:'#B71C1C',border:'1px solid #B71C1C',borderRadius:6,cursor: pdfLoading ? 'wait' : 'pointer',
              fontFamily:'inherit',opacity: pdfLoading ? 0.7 : 1 }}>
            <i className={pdfLoading ? 'fas fa-spinner fa-spin' : 'fas fa-file-pdf'}/>
            {pdfLoading ? 'Generowanie…' : 'Pobierz PDF'}
          </button>
          <button onClick={() => handlePrint()}
            style={{ display:'inline-flex',alignItems:'center',gap:6,padding:'8px 16px',fontSize:13,fontWeight:500,
              color:'#86868B',background:'#fff',border:'1px solid #E0E0E0',borderRadius:6,cursor:'pointer',fontFamily:'inherit' }}>
            <i className="fas fa-print"/> Drukuj
          </button>
        </div>
      </main>

      {/* ── FOOTER ── */}
      <footer style={{ background:'#1A1A2E',padding:'40px 24px',textAlign:'center',marginTop:0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_URL} alt="Zaufaj Rzeczoznawcy"
          style={{ maxWidth:240,height:'auto',display:'block',margin:'0 auto 20px',filter:'drop-shadow(0 2px 8px rgba(0,0,0,0.3))' }} />
        <div style={{ display:'flex',justifyContent:'center',gap:48,marginBottom:20,flexWrap:'wrap' }}>
          {[
            { city:'SIEDZIBA',           addr:'ul. Smolna 27a/11\n44-200 Rybnik' },
            { city:'ODDZIAŁ WARSZAWA',   addr:'Al. Jerozolimskie 109\n02-011 Warszawa' },
            { city:'ODDZIAŁ WROCŁAW',    addr:'ul. Leszczyńskiego 4/29\n50-078 Wrocław' },
          ].map(o => (
            <div key={o.city}>
              <div style={{ fontSize:13,fontWeight:600,color:'#fff',marginBottom:6,textTransform:'uppercase',letterSpacing:'1px' }}>{o.city}</div>
              <div style={{ fontSize:13,color:'rgba(255,255,255,0.7)',lineHeight:1.6,whiteSpace:'pre-line' }}>{o.addr}</div>
            </div>
          ))}
        </div>
        <div style={{ width:80,height:1,background:'rgba(255,255,255,0.15)',margin:'20px auto' }}/>
        {data.inspector && (
          <div style={{ fontSize:13,color:'rgba(255,255,255,0.7)',marginBottom:8 }}>
            Inspektor: <span style={{ color:'rgba(255,255,255,0.85)',fontWeight:600 }}>{data.inspector.name}</span>
            {data.inspector.phone && <> &nbsp;·&nbsp; <span style={{ color:'rgba(255,255,255,0.85)' }}>{data.inspector.phone}</span></>}
          </div>
        )}
        <div style={{ fontSize:11,color:'rgba(255,255,255,0.4)',marginBottom:6 }}>
          © {new Date().getFullYear()} Zaufaj Rzeczoznawcy Sp. z o.o. Wszelkie prawa zastrzeżone.
        </div>
        <div style={{ fontSize:11,color:'rgba(255,255,255,0.3)',fontStyle:'italic',maxWidth:500,margin:'0 auto' }}>
          Raport wygenerowany {new Date(data.generated_at).toLocaleDateString('pl-PL')} dla zlecenia #{data.deal_id}
        </div>
      </footer>

      {/* Back to top */}
      <button
        className="no-print"
        onClick={() => window.scrollTo({ top:0, behavior:'smooth' })}
        style={{ position:'fixed',bottom:24,right:24,width:44,height:44,borderRadius:'50%',
          background:'#fff',color:'#B71C1C',border:'1px solid #E8E8ED',boxShadow:'0 2px 8px rgba(0,0,0,0.06)',
          display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',zIndex:90,fontSize:16,
          opacity: backTop ? 1 : 0,visibility: backTop ? 'visible' : 'hidden',
          transition:'all 0.3s' }}
        onMouseEnter={e => { const el = e.currentTarget as HTMLButtonElement; el.style.background='#B71C1C'; el.style.color='#fff'; el.style.borderColor='#B71C1C'; el.style.transform='translateY(-2px)'; }}
        onMouseLeave={e => { const el = e.currentTarget as HTMLButtonElement; el.style.background='#fff'; el.style.color='#B71C1C'; el.style.borderColor='#E8E8ED'; el.style.transform=''; }}
      >
        <i className="fas fa-chevron-up"/>
      </button>

      {/* Lightbox */}
      {lightbox && (
        <Lightbox photos={lightbox.photos} startIndex={lightbox.idx} onClose={() => setLightbox(null)} />
      )}
    </>
  );
}
