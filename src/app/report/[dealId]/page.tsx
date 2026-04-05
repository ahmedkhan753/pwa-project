'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';

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
  photos: {
    standard: PhotoItem[]; body: PhotoItem[]; interior: PhotoItem[];
    engine: PhotoItem[]; documents: PhotoItem[]; damages: PhotoItem[];
  };
  documents_check: Array<{ name: string; status: string; status_type: string }>;
  tires: Array<{
    position: string; brand?: string; model?: string; size?: string;
    dot?: string; season?: string; tread_mm?: number; status: string;
  }>;
  paint_measurements: Array<{ point: number; name: string; value_um: number; status: string }>;
  damages: Array<{ index: number; type: string; location: string; size?: string; description?: string; severity?: string; photo_url?: string | null }>;
  interior_damages?: Array<{ index: number; type: string; location: string; size?: string; description?: string }>;
  mechanical?: { engine_start?: string; ac_working?: boolean; warning_lights?: string; [key: string]: unknown };
  notes?: string;
  signatures?: {
    inspector?: { name: string; signature_url?: string };
    client?: { name: string; signature_url?: string };
  };
  inspector?: { name: string; phone?: string };
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const LOGO_URL = 'https://i.postimg.cc/VsgMRGYH/SPROWADZENIE-SAMOCHODOW-Z-USAPOD-DOM-(500-x-500-px)-(800-x-500-px)-(700-x-300-px)-2.png';

const PAINT_POINTS = [
  { id: 'hood',         label: 'Pokrywa silnika',   cx: 200, cy: 78  },
  { id: 'roof',         label: 'Dach',              cx: 200, cy: 155 },
  { id: 'trunk',        label: 'Klapa tylna',       cx: 200, cy: 232 },
  { id: 'fender_fl',   label: 'Błotnik przedni L', cx: 122, cy: 90  },
  { id: 'fender_fr',   label: 'Błotnik przedni P', cx: 278, cy: 90  },
  { id: 'fender_rl',   label: 'Błotnik tylny L',   cx: 122, cy: 218 },
  { id: 'fender_rr',   label: 'Błotnik tylny P',   cx: 278, cy: 218 },
  { id: 'door_fl',     label: 'Drzwi przednie L',  cx: 122, cy: 140 },
  { id: 'door_fr',     label: 'Drzwi przednie P',  cx: 278, cy: 140 },
  { id: 'door_rl',     label: 'Drzwi tylne L',     cx: 122, cy: 172 },
  { id: 'door_rr',     label: 'Drzwi tylne P',     cx: 278, cy: 172 },
  { id: 'bumper_front',label: 'Zderzak przedni',   cx: 200, cy: 48  },
  { id: 'bumper_rear', label: 'Zderzak tylny',     cx: 200, cy: 262 },
  { id: 'sill_left',   label: 'Próg lewy',         cx: 105, cy: 156 },
  { id: 'sill_right',  label: 'Próg prawy',        cx: 295, cy: 156 },
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

// ─── Lightbox ──────────────────────────────────────────────────────────────────

function Lightbox({ photos, startIndex, onClose }: {
  photos: Array<{ label: string; url: string }>;
  startIndex: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(startIndex);
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

  const p = photos[idx];

  return (
    <div
      style={{ position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,0.92)',display:'flex',
        flexDirection:'column',alignItems:'center',justifyContent:'center',opacity:1 }}
      onClick={onClose}
      onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (dx > 50) setIdx(i => Math.max(i - 1, 0));
        if (dx < -50) setIdx(i => Math.min(i + 1, photos.length - 1));
        touchX.current = null;
      }}
    >
      <button onClick={onClose} style={{ position:'absolute',top:16,right:16,width:44,height:44,
        background:'rgba(255,255,255,0.1)',border:'none',color:'#fff',fontSize:22,
        borderRadius:'50%',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',zIndex:10 }}>
        <i className="fas fa-times"/>
      </button>
      <div style={{ position:'absolute',top:20,left:'50%',transform:'translateX(-50%)',
        color:'rgba(255,255,255,0.5)',fontSize:13 }}>{idx+1} / {photos.length}</div>
      {idx > 0 && (
        <button onClick={e => { e.stopPropagation(); setIdx(i => i - 1); }}
          style={{ position:'absolute',left:16,top:'50%',transform:'translateY(-50%)',
            width:50,height:50,borderRadius:'50%',background:'rgba(255,255,255,0.12)',
            border:'none',color:'#fff',fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>
          <i className="fas fa-chevron-left"/>
        </button>
      )}
      <div onClick={e => e.stopPropagation()} style={{ maxWidth:'90vw',maxHeight:'75vh' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.url} alt={p.label}
          style={{ maxWidth:'90vw',maxHeight:'75vh',objectFit:'contain',borderRadius:4,display:'block' }} />
      </div>
      <div style={{ color:'#fff',textAlign:'center',marginTop:16,fontSize:15,fontWeight:500 }}>{p.label}</div>
      {idx < photos.length - 1 && (
        <button onClick={e => { e.stopPropagation(); setIdx(i => i + 1); }}
          style={{ position:'absolute',right:16,top:'50%',transform:'translateY(-50%)',
            width:50,height:50,borderRadius:'50%',background:'rgba(255,255,255,0.12)',
            border:'none',color:'#fff',fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>
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
          padding: open ? '20px' : '0 20px',
          borderTop: open ? '1px solid #E8E8ED' : '1px solid transparent',
          transition:'padding 0.4s cubic-bezier(0.4,0,0.2,1),border-color 0.3s' }}>
          {children}
        </div>
      </div>
    </section>
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
      <div style={{ display:'grid',gridTemplateRows: open ? '1fr' : '0fr',transition:'grid-template-rows 0.5s cubic-bezier(0.4,0,0.2,1)' }}>
        <div style={{ overflow:'hidden',minHeight:0 }}>
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
        <img src={photo.url} alt={photo.label} loading="lazy" onError={() => setErr(true)}
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
              <div style={{ fontSize:13,color:'#1D1D1F',fontWeight:600,marginBottom:4 }}>{tire.brand}</div></div>
            <div><div style={{ fontSize:10,color:'#86868B',textTransform:'uppercase',letterSpacing:'0.3px',fontWeight:600 }}>Model</div>
              <div style={{ fontSize:13,color:'#1D1D1F',fontWeight:600,marginBottom:4 }}>{tire.model || '—'}</div></div>
          </>)}
          {tire.size && (<>
            <div><div style={{ fontSize:10,color:'#86868B',textTransform:'uppercase',letterSpacing:'0.3px',fontWeight:600 }}>Rozmiar</div>
              <div style={{ fontSize:13,color:'#1D1D1F',fontWeight:600,marginBottom:4 }}>{tire.size}</div></div>
            <div><div style={{ fontSize:10,color:'#86868B',textTransform:'uppercase',letterSpacing:'0.3px',fontWeight:600 }}>DOT</div>
              <div style={{ fontSize:13,color:'#1D1D1F',fontWeight:600,marginBottom:4 }}>{tire.dot || '—'}</div></div>
          </>)}
          {tire.season && (
            <div style={{ gridColumn:'1/-1' }}>
              <div style={{ fontSize:10,color:'#86868B',textTransform:'uppercase',letterSpacing:'0.3px',fontWeight:600 }}>Sezon</div>
              <div style={{ fontSize:13,color:'#1D1D1F',fontWeight:600,marginBottom:4 }}>{tire.season}</div>
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

function PaintDiagram({ measurements }: { measurements: ReportData['paint_measurements'] }) {
  const [tooltip, setTooltip] = useState<{ label: string; value: number; status: string; x: number; y: number } | null>(null);
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
            const c = m ? paintColor(m.status) : '#AEAEB2';
            return (
              <g key={pt.id}
                onMouseEnter={e => m && setTooltip({ label: pt.label, value: m.value_um, status: m.status, x: pt.cx, y: pt.cy })}
                onMouseLeave={() => setTooltip(null)}
                style={{ cursor: m ? 'pointer' : 'default' }}
              >
                <circle cx={pt.cx} cy={pt.cy} r={15} fill={c} stroke="#fff" strokeWidth="2" opacity={0.92}/>
                <text x={pt.cx} y={pt.cy + 4} textAnchor="middle" fontSize="9" fill="#fff" fontWeight="700">
                  {m ? m.value_um : '—'}
                </text>
              </g>
            );
          })}

          {/* Tooltip */}
          {tooltip && (
            <g>
              <rect x="60" y="128" width="280" height="54" rx="8" fill="#1D1D1F" opacity="0.96"/>
              <text x="200" y="150" textAnchor="middle" fontSize="12" fill="#fff" fontWeight="700">{tooltip.label}</text>
              <text x="200" y="170" textAnchor="middle" fontSize="11" fill={paintColor(tooltip.status)}>
                {tooltip.value} μm — {tooltip.status === 'factory' ? 'Fabryczny' : tooltip.status === 'repainted' ? 'Lakierowany' : 'Naprawiany'}
              </text>
            </g>
          )}
        </svg>
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

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function ReportPage({ params }: { params: { dealId: string } }) {
  const { dealId } = params;
  const [data, setData]         = useState<ReportData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ photos: Array<{ label:string; url:string }>; idx: number } | null>(null);
  const [backTop, setBackTop]   = useState(false);

  useEffect(() => {
    const onScroll = () => setBackTop(window.scrollY > 400);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    // Use the Next.js API proxy route (relative URL — same origin, no CORS/expiry issues).
    fetch(`/api/report/${dealId}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => {
        const norm: ReportData = {
          ...d,
          equipment:          Array.isArray(d.equipment)          ? d.equipment          : [],
          documents_check:    Array.isArray(d.documents_check)    ? d.documents_check    : [],
          tires:              Array.isArray(d.tires)              ? d.tires              : [],
          paint_measurements: Array.isArray(d.paint_measurements) ? d.paint_measurements : [],
          damages:            Array.isArray(d.damages)            ? d.damages            : [],
          interior_damages:   Array.isArray(d.interior_damages)   ? d.interior_damages   : [],
          damage_summary:     d.damage_summary  ?? { cosmetic:0, structural:0, bodywork:0 },
          quick_stats:        d.quick_stats     ?? {},
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
          background:#F5F5F7;color:#1D1D1F;line-height:1.6;min-height:100vh;overflow-x:hidden;}
        ::-webkit-scrollbar{width:7px;}
        ::-webkit-scrollbar-track{background:#F5F5F7;}
        ::-webkit-scrollbar-thumb{background:#AEAEB2;border-radius:10px;}

        /* ── Responsive grids ── */
        .rg-4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
        .rg-3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}
        .rg-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:20px;}
        .rg-tire-paint{display:grid;grid-template-columns:45fr 55fr;gap:28px;align-items:start;}
        .rg-photos{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;}
        .rg-gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;}

        .summary-bar{display:flex;align-items:stretch;gap:24px;flex-wrap:wrap;}
        .summary-specs{flex:1;display:flex;flex-wrap:wrap;align-items:center;gap:8px;
          padding-right:24px;border-right:1px solid #E8E8ED;min-width:200px;}
        .summary-damages{display:flex;gap:12px;flex-shrink:0;align-items:stretch;flex-wrap:wrap;}

        @media(max-width:1024px){
          .rg-4{grid-template-columns:repeat(3,1fr);}
          .rg-tire-paint{grid-template-columns:1fr;}
          .summary-specs{border-right:none;padding-right:0;padding-bottom:16px;border-bottom:1px solid #E8E8ED;}
          .summary-damages{justify-content:center;}
        }
        @media(max-width:768px){
          .rg-4{grid-template-columns:repeat(2,1fr);gap:8px;}
          .rg-3{grid-template-columns:1fr;}
          .rg-stats{grid-template-columns:repeat(2,1fr);gap:10px;}
          .rg-photos{grid-template-columns:repeat(2,1fr);gap:10px;}
          .rg-gallery{grid-template-columns:repeat(2,1fr);gap:10px;}
          .rg-tire-paint{grid-template-columns:1fr;}
          .summary-bar{flex-direction:column;}
          .summary-specs{border-right:none;padding-right:0;padding-bottom:12px;border-bottom:1px solid #E8E8ED;}
          .summary-damages{justify-content:center;}
          .damage-counter-mobile{min-width:90px!important;padding:10px 12px!important;}
          .damage-counter-val-mobile{font-size:22px!important;}
        }
        @media(max-width:480px){
          .rg-4{grid-template-columns:repeat(2,1fr);}
          .rg-photos,.rg-gallery{grid-template-columns:1fr;}
          .summary-damages{flex-direction:column;align-items:stretch;}
          .sec-body-inner{padding:14px!important;}
          .rg-4 .field-val{word-break:break-all;}
        }

        @media print {
          .no-print{display:none!important;}
          *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
          @page{size:A4;margin:12mm 10mm;}
          .section-body{display:grid!important;grid-template-rows:1fr!important;}
          body{background:#fff!important;}
          .rg-4{grid-template-columns:repeat(4,1fr)!important;}
          .rg-stats{grid-template-columns:repeat(4,1fr)!important;}
          .rg-photos,.rg-gallery{grid-template-columns:repeat(3,1fr)!important;}
          .rg-tire-paint{grid-template-columns:1fr 1fr!important;}
          .summary-bar{flex-direction:row!important;}
          .summary-specs{border-right:1px solid #E0E0E0!important;border-bottom:none!important;padding-right:16px!important;padding-bottom:0!important;}
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
      <main style={{ maxWidth:1200,margin:'0 auto',padding:'0 16px 60px' }} id="main-content">

        {/* PDF button */}
        <div className="no-print" style={{ display:'flex',justifyContent:'flex-end',marginBottom:-10,padding:'8px 0' }}>
          <button onClick={() => window.print()}
            style={{ display:'inline-flex',alignItems:'center',gap:6,padding:'8px 16px',fontSize:13,fontWeight:500,
              color:'#86868B',background:'#fff',border:'1px solid #E0E0E0',borderRadius:6,cursor:'pointer',
              fontFamily:'inherit',transition:'all 0.3s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color='#B71C1C'; (e.currentTarget as HTMLButtonElement).style.borderColor='#B71C1C'; (e.currentTarget as HTMLButtonElement).style.background='#FEF2F2'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color='#86868B'; (e.currentTarget as HTMLButtonElement).style.borderColor='#E0E0E0'; (e.currentTarget as HTMLButtonElement).style.background='#fff'; }}
          >
            <i className="fas fa-file-pdf" style={{ fontSize:14 }}/> Pobierz PDF
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
                <div style={{ fontSize:17,fontWeight:700,color:'#1D1D1F',lineHeight:1.2 }}>{String(s.value)}</div>
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
                  padding:'5px 12px',borderRadius:6,border:'1px solid #E8E8ED',whiteSpace:'nowrap' }}>
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
              { icon:'fas fa-calendar-alt',     label:'Data oględzin',   val: data.inspection_date },
              { icon:'fas fa-user-tie',         label:'Inspektor',       val: data.inspector_name },
            ].filter(i => i.val).map(i => (
              <div key={i.label} style={{ display:'flex',alignItems:'flex-start',gap:10 }}>
                <div style={{ width:30,height:30,borderRadius:6,background:'#FEF2F2',
                  display:'flex',alignItems:'center',justifyContent:'center',
                  color:'#B71C1C',fontSize:12,flexShrink:0 }}>
                  <i className={i.icon}/>
                </div>
                <div>
                  <div style={{ fontSize:10,color:'#86868B',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:600 }}>{i.label}</div>
                  <div style={{ fontSize:13,fontWeight:600,color:'#1D1D1F',marginTop:1 }}>{i.val}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── SECTION 01: DANE POJAZDU ── */}
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
                display:'flex',alignItems:'flex-start',gap:12,padding:16,
                borderRadius:8,gridColumn: f.fullWidth ? '1/-1' : undefined,
                background: f.highlight ? '#FEF2F2' : '#F5F5F7',
                border: f.highlight ? '1px solid rgba(183,28,28,0.12)' : '1px solid transparent',
                transition:'all 0.3s',
              }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.background='#fff'; el.style.borderColor='#E8E8ED'; el.style.boxShadow='0 1px 3px rgba(0,0,0,0.04)'; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.background=f.highlight?'#FEF2F2':'#F5F5F7'; el.style.borderColor=f.highlight?'rgba(183,28,28,0.12)':'transparent'; el.style.boxShadow=''; }}
              >
                <div style={{ width:36,height:36,borderRadius:8,background:'rgba(0,0,0,0.03)',
                  display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,
                  color: f.highlight ? '#B71C1C' : '#86868B',fontSize:14 }}>
                  <i className={f.icon}/>
                </div>
                <div style={{ display:'flex',flexDirection:'column',minWidth:0 }}>
                  <div style={{ fontSize:11,textTransform:'uppercase',letterSpacing:'0.8px',
                    color:'#86868B',fontWeight:600,lineHeight:1.3 }}>{f.label}</div>
                  <div className="field-val" style={{ fontSize: f.mono ? 13 : 16,fontWeight:600,color:'#1D1D1F',lineHeight:1.3,marginTop:2,
                    fontFamily: f.mono ? '\'Courier New\',monospace' : undefined,
                    wordBreak: f.mono ? 'break-all' : undefined } as React.CSSProperties}>
                    {String(f.value)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>

        <div style={{ width:'90%',maxWidth:1080,height:1,background:'#E8E8ED',margin:'24px auto' }}/>

        {/* ── SECTION 02: WYPOSAŻENIE ── */}
        {data.equipment.length > 0 && (
          <>
            <CollapsibleSection id="wyposazenie" icon="fas fa-list-check" num="02 / Wyposażenie" title="Wyposażenie">
              <div className="rg-4" style={{ gap:10 }}>
                {data.equipment.filter(e => e.present).map((eq, i) => (
                  <div key={i} style={{ display:'flex',alignItems:'center',gap:10,padding:'14px 16px',
                    borderRadius:8,background:'#F5F5F7',transition:'all 0.3s',border:'1px solid transparent' }}
                    onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.background='#fff'; el.style.borderColor='#E8E8ED'; el.style.boxShadow='0 1px 3px rgba(0,0,0,0.04)'; }}
                    onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.background='#F5F5F7'; el.style.borderColor='transparent'; el.style.boxShadow=''; }}
                  >
                    <div style={{ width:24,height:24,borderRadius:'50%',
                      background:'linear-gradient(135deg,#22C55E,#16a34a)',
                      display:'flex',alignItems:'center',justifyContent:'center',
                      color:'#fff',fontSize:11,flexShrink:0 }}>
                      <i className="fas fa-check"/>
                    </div>
                    <span style={{ fontSize:14,color:'#1D1D1F',fontWeight:500 }}>{eq.name}</span>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
            <div style={{ width:'90%',maxWidth:1080,height:1,background:'#E8E8ED',margin:'24px auto' }}/>
          </>
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
                  <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:14 }}>
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
                count={g.photos.length} isDamage={g.isDamage} defaultOpen={g.letter === 'A'}>
                {g.isDamage && data.damages.length > 0 && (
                  <div style={{ padding:'12px 16px',marginBottom:16,background:'#FEF2F2',
                    borderLeft:'3px solid #EF4444',borderRadius:'0 8px 8px 0',fontSize:13,color:'#991B1B' }}>
                    Zarejestrowano {data.damages.length} uszkodzeń: {data.damages.map(d => `${d.type} (${d.location})`).join(', ')}
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
                            <img src={p.url} alt={p.label} loading="lazy"
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
        </CollapsibleSection>

        {/* ── EXTERIOR DAMAGE ── */}
        {data.damages.length > 0 && (
          <>
            <div style={{ width:'90%',maxWidth:1080,height:1,background:'#E8E8ED',margin:'24px auto' }}/>
            <CollapsibleSection id="uszkodzenia" icon="fas fa-exclamation-triangle" num="07 / Uszkodzenia zewnętrzne" title="Uszkodzenia zewnętrzne" defaultOpen>
              <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
                {data.damages.map((d, i) => (
                  <div key={i} style={{ display:'flex',gap:14,padding:'14px 16px',borderRadius:8,
                    background: d.severity === 'structural' ? '#FEF2F2' : '#FFFBEB',
                    border: `1px solid ${d.severity === 'structural' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`,
                    alignItems:'flex-start' }}>
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
                  <div key={i} style={{ display:'flex',gap:14,padding:'14px 16px',borderRadius:8,
                    background:'#F5F5F7',border:'1px solid #E8E8ED',alignItems:'flex-start' }}>
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
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          </>
        )}

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

        {/* PDF bottom */}
        <div className="no-print" style={{ textAlign:'center',padding:'24px 0' }}>
          <button onClick={() => window.print()}
            style={{ display:'inline-flex',alignItems:'center',gap:6,padding:'8px 16px',fontSize:13,fontWeight:500,
              color:'#86868B',background:'#fff',border:'1px solid #E0E0E0',borderRadius:6,cursor:'pointer',fontFamily:'inherit' }}>
            <i className="fas fa-file-pdf"/> Pobierz PDF
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
            { city:'Rybnik',    addr:'ul. Przykładowa 1\n44-200 Rybnik' },
            { city:'Warszawa',  addr:'ul. Marszałkowska 1\n00-001 Warszawa' },
            { city:'Wrocław',   addr:'ul. Świdnicka 1\n50-001 Wrocław' },
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
