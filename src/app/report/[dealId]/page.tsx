'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import Image from 'next/image';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PhotoItem {
  label: string;
  url: string | null;
  position: number;
  damage_type?: string;
}

interface ReportData {
  deal_id: number;
  report_url: string;
  generated_at: string;
  inspection_date: string;
  vehicle: {
    make: string;
    model: string;
    version?: string;
    vin: string;
    registration_plate: string;
    year: string | number;
    first_registration_date?: string;
    mileage: string | number;
    mileage_unit?: string;
    color: string;
    fuel_type: string;
    engine_power_kw?: string | number;
    engine_power_hp?: string | number;
    engine_capacity_cc?: string | number;
    transmission: string;
    drive_type?: string;
    body_type?: string;
    doors?: string | number;
    seats?: string | number;
    weight_kg?: string | number;
    owners_count?: string | number;
    overall_condition?: string;
    paint_type?: string;
  };
  hero_photo_url: string | null;
  quick_stats: {
    year?: string | number;
    fuel?: string;
    power?: string;
    transmission?: string;
  };
  damage_summary: {
    cosmetic: number;
    structural: number;
    bodywork: number;
  };
  equipment: Array<{ name: string; present: boolean }>;
  photos: {
    standard: PhotoItem[];
    body: PhotoItem[];
    interior: PhotoItem[];
    engine: PhotoItem[];
    documents: PhotoItem[];
    damages: PhotoItem[];
  };
  documents_check: Array<{ name: string; status: string; status_type: string }>;
  tires: Array<{
    position: string;
    brand?: string;
    model?: string;
    size?: string;
    dot?: string;
    season?: string;
    tread_mm?: number;
    status: string;
  }>;
  paint_measurements: Array<{
    point: number;
    name: string;
    value_um: number;
    status: string;
  }>;
  damages: Array<{
    index: number;
    type: string;
    location: string;
    size?: string;
    photo_url?: string | null;
    severity?: string;
  }>;
  mechanical?: {
    engine_start?: string;
    ac_working?: boolean;
    warning_lights?: string;
  };
  notes?: string;
  signatures?: {
    inspector?: { name: string; signature_url?: string };
    client?: { name: string; signature_url?: string };
  };
  inspector?: { name: string; phone?: string };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LOGO_URL = 'https://i.postimg.cc/VsgMRGYH/SPROWADZENIE-SAMOCHODOW-Z-USAPOD-DOM-(500-x-500-px)-(800-x-500-px)-(700-x-300-px)-2.png';

const PAINT_POINTS: Array<{ id: string; label: string; cx: number; cy: number }> = [
  { id: 'hood',         label: 'Pokrywa silnika',   cx: 200, cy: 80  },
  { id: 'roof',         label: 'Dach',              cx: 200, cy: 155 },
  { id: 'trunk',        label: 'Klapa tylna',       cx: 200, cy: 230 },
  { id: 'fender_fl',   label: 'Błotnik przedni L', cx: 120, cy: 90  },
  { id: 'fender_fr',   label: 'Błotnik przedni P', cx: 280, cy: 90  },
  { id: 'fender_rl',   label: 'Błotnik tylny L',   cx: 120, cy: 220 },
  { id: 'fender_rr',   label: 'Błotnik tylny P',   cx: 280, cy: 220 },
  { id: 'door_fl',     label: 'Drzwi przednie L',  cx: 120, cy: 145 },
  { id: 'door_fr',     label: 'Drzwi przednie P',  cx: 280, cy: 145 },
  { id: 'door_rl',     label: 'Drzwi tylne L',     cx: 120, cy: 175 },
  { id: 'door_rr',     label: 'Drzwi tylne P',     cx: 280, cy: 175 },
  { id: 'bumper_front',label: 'Zderzak przedni',   cx: 200, cy: 50  },
  { id: 'bumper_rear', label: 'Zderzak tylny',     cx: 200, cy: 260 },
  { id: 'sill_left',   label: 'Próg lewy',         cx: 105, cy: 160 },
  { id: 'sill_right',  label: 'Próg prawy',        cx: 295, cy: 160 },
];

function getPaintColor(status: string) {
  if (status === 'factory')   return '#16a34a';
  if (status === 'repainted') return '#d97706';
  if (status === 'repair')    return '#dc2626';
  return '#94a3b8';
}

function getTireColor(status: string) {
  if (status === 'good')   return '#16a34a';
  if (status === 'warn')   return '#d97706';
  if (status === 'danger') return '#dc2626';
  return '#94a3b8';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PhotoPlaceholder({ label }: { label: string }) {
  return (
    <div style={{
      background: '#f1f5f9',
      border: '2px dashed #cbd5e1',
      borderRadius: 12,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: '24px 8px',
      minHeight: 160,
    }}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
        <rect x="3" y="7" width="18" height="14" rx="2"/>
        <circle cx="12" cy="14" r="3"/>
        <path d="M7 7V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1"/>
      </svg>
      <span style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', lineHeight: 1.3 }}>{label}</span>
    </div>
  );
}

function CollapsibleSection({ title, sectionNum, children, defaultOpen = true }: {
  title: string;
  sectionNum: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{
      background: '#fff',
      borderRadius: 16,
      boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      overflow: 'hidden',
      marginBottom: 20,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '18px 24px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{
          background: '#B71C1C',
          color: '#fff',
          borderRadius: 8,
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.05em',
          flexShrink: 0,
        }}>{sectionNum}</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#1A1A2E', flex: 1 }}>{title}</span>
        <svg
          width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s' }}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      <div style={{
        overflow: 'hidden',
        maxHeight: open ? 9999 : 0,
        transition: 'max-height 0.4s ease',
      }}>
        <div style={{ padding: '0 24px 24px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({ photos, startIndex, onClose }: {
  photos: Array<{ label: string; url: string }>;
  startIndex: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(startIndex);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIdx(i => Math.min(i + 1, photos.length - 1));
      if (e.key === 'ArrowLeft') setIdx(i => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, photos.length]);

  const photo = photos[idx];

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.95)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
      onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (touchStartX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        if (dx > 50) setIdx(i => Math.max(i - 1, 0));
        if (dx < -50) setIdx(i => Math.min(i + 1, photos.length - 1));
        touchStartX.current = null;
      }}
    >
      {/* Close */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 16, right: 16,
          background: 'rgba(255,255,255,0.15)', border: 'none',
          borderRadius: '50%', width: 40, height: 40,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: '#fff', zIndex: 1001,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>

      {/* Counter */}
      <div style={{
        position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
        color: 'rgba(255,255,255,0.6)', fontSize: 13,
      }}>
        {idx + 1} / {photos.length}
      </div>

      {/* Prev */}
      {idx > 0 && (
        <button
          onClick={e => { e.stopPropagation(); setIdx(i => i - 1); }}
          style={{
            position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
            width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#fff',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
      )}

      {/* Image */}
      <div onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '80vh', position: 'relative' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt={photo.label}
          style={{ maxWidth: '90vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: 8 }}
        />
      </div>

      {/* Label */}
      <div style={{ color: 'rgba(255,255,255,0.8)', marginTop: 12, fontSize: 14 }}>
        {photo.label}
      </div>

      {/* Next */}
      {idx < photos.length - 1 && (
        <button
          onClick={e => { e.stopPropagation(); setIdx(i => i + 1); }}
          style={{
            position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
            width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#fff',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      )}
    </div>
  );
}

// ─── Photo Grid ───────────────────────────────────────────────────────────────

function PhotoGrid({ photos, onPhotoClick }: {
  photos: PhotoItem[];
  onPhotoClick: (photos: Array<{ label: string; url: string }>, idx: number) => void;
}) {
  const withUrls = photos.filter(p => p.url);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
      gap: 12,
    }}>
      {photos.map((p, i) => {
        if (!p.url) return <PhotoPlaceholder key={i} label={p.label} />;
        const lightboxIdx = withUrls.findIndex(wp => wp.url === p.url);
        return (
          <div
            key={i}
            onClick={() => onPhotoClick(withUrls.map(wp => ({ label: wp.label, url: wp.url! })), lightboxIdx)}
            style={{
              cursor: 'pointer',
              borderRadius: 12,
              overflow: 'hidden',
              background: '#f1f5f9',
              aspectRatio: '4/3',
              position: 'relative',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.url}
              alt={p.label}
              loading="lazy"
              onError={e => {
                const el = e.currentTarget;
                el.style.display = 'none';
                const parent = el.parentElement;
                if (parent) parent.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:12px;padding:8px;text-align:center">${p.label}</div>`;
              }}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'linear-gradient(transparent, rgba(0,0,0,0.65))',
              color: '#fff', fontSize: 11, padding: '20px 8px 8px',
            }}>
              {p.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Paint Diagram ────────────────────────────────────────────────────────────

function PaintDiagram({ measurements }: { measurements: ReportData['paint_measurements'] }) {
  const [tooltip, setTooltip] = useState<{ id: string; label: string; value: number; status: string } | null>(null);

  const measureMap = Object.fromEntries(measurements.map(m => [m.point, m]));

  // Map paint point index to measurement point number
  const getPoint = (index: number) => measureMap[index + 1];

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox="0 0 400 310"
        style={{ width: '100%', maxWidth: 400, display: 'block', margin: '0 auto' }}
      >
        {/* Car outline — simplified top-down view */}
        <g stroke="#cbd5e1" strokeWidth="1.5" fill="#f8fafc">
          {/* Body */}
          <rect x="130" y="30" width="140" height="250" rx="30" fill="#f1f5f9" stroke="#cbd5e1"/>
          {/* Roof section */}
          <rect x="150" y="90" width="100" height="120" rx="8" fill="#e2e8f0" stroke="#cbd5e1"/>
          {/* Front bumper */}
          <rect x="150" y="18" width="100" height="22" rx="8" fill="#e2e8f0" stroke="#cbd5e1"/>
          {/* Rear bumper */}
          <rect x="150" y="270" width="100" height="22" rx="8" fill="#e2e8f0" stroke="#cbd5e1"/>
          {/* Front wheels */}
          <rect x="108" y="65" width="30" height="50" rx="6" fill="#374151" stroke="#1f2937"/>
          <rect x="262" y="65" width="30" height="50" rx="6" fill="#374151" stroke="#1f2937"/>
          {/* Rear wheels */}
          <rect x="108" y="195" width="30" height="50" rx="6" fill="#374151" stroke="#1f2937"/>
          <rect x="262" y="195" width="30" height="50" rx="6" fill="#374151" stroke="#1f2937"/>
        </g>

        {/* Measurement points */}
        {PAINT_POINTS.map((pt, i) => {
          const m = getPoint(i);
          const color = m ? getPaintColor(m.status) : '#cbd5e1';
          const value = m ? m.value_um : null;
          return (
            <g key={pt.id}
              onMouseEnter={() => m && setTooltip({ id: pt.id, label: pt.label, value: m.value_um, status: m.status })}
              onMouseLeave={() => setTooltip(null)}
              onTouchStart={() => m && setTooltip({ id: pt.id, label: pt.label, value: m.value_um, status: m.status })}
              style={{ cursor: m ? 'pointer' : 'default' }}
            >
              <circle cx={pt.cx} cy={pt.cy} r={14} fill={color} stroke="#fff" strokeWidth="2" opacity={0.9}/>
              <text x={pt.cx} y={pt.cy + 4} textAnchor="middle" fontSize="9" fill="#fff" fontWeight="700">
                {value !== null ? value : '—'}
              </text>
            </g>
          );
        })}

        {/* Tooltip */}
        {tooltip && (
          <g>
            <rect x="60" y="130" width="280" height="50" rx="8" fill="#1A1A2E" opacity="0.95"/>
            <text x="200" y="152" textAnchor="middle" fontSize="12" fill="#fff" fontWeight="700">{tooltip.label}</text>
            <text x="200" y="170" textAnchor="middle" fontSize="11" fill={getPaintColor(tooltip.status)}>
              {tooltip.value} μm —{' '}
              {tooltip.status === 'factory' ? 'Fabryczny' :
               tooltip.status === 'repainted' ? 'Lakierowany' : 'Naprawiany'}
            </text>
          </g>
        )}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginTop: 12 }}>
        {[
          { color: '#16a34a', label: 'Fabryczny (≤150 μm)' },
          { color: '#d97706', label: 'Lakierowany (151–300 μm)' },
          { color: '#dc2626', label: 'Naprawiany (>300 μm)' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748b' }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: l.color, display: 'inline-block' }}/>
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tire Card ────────────────────────────────────────────────────────────────

function TireCard({ tire }: { tire: ReportData['tires'][0] }) {
  const tread = tire.tread_mm ?? 0;
  const pct = Math.min((tread / 8) * 100, 100);
  const color = getTireColor(tire.status);
  const statusLabel = tire.status === 'good' ? 'Dobry' : tire.status === 'warn' ? 'Do wymiany' : 'Wymienić!';

  return (
    <div style={{
      background: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderRadius: 12,
      padding: 16,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#1A1A2E' }}>{tire.position}</span>
        <span style={{
          background: color, color: '#fff',
          borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700,
        }}>{statusLabel}</span>
      </div>

      {tire.brand && (
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
          {tire.brand} {tire.model} • {tire.size}
        </div>
      )}
      {tire.season && (
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
          {tire.season}{tire.dot ? ` • DOT: ${tire.dot}` : ''}
        </div>
      )}

      {/* Tread depth bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginBottom: 4 }}>
          <span>Głębokość bieżnika</span>
          <span style={{ fontWeight: 700, color }}>{tread.toFixed(1)} mm</span>
        </div>
        <div style={{ background: '#e2e8f0', borderRadius: 4, height: 8, overflow: 'hidden' }}>
          <div style={{
            width: `${pct}%`, height: '100%',
            background: color, borderRadius: 4,
            transition: 'width 0.6s ease',
          }}/>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
          <span>0 mm</span><span>8 mm</span>
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ background: '#F5F5F7', minHeight: '100vh' }}>
      {/* Header skeleton */}
      <div style={{ background: '#1A1A2E', height: 80 }}/>
      {/* Hero skeleton */}
      <div style={{ background: '#e2e8f0', height: 380 }}/>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 16px' }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{
            background: '#fff', borderRadius: 16, height: 200,
            marginBottom: 20, opacity: 0.6,
            animation: 'pulse 1.5s ease-in-out infinite',
          }}/>
        ))}
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:.6} 50%{opacity:.3} }`}</style>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReportPage({ params }: { params: { dealId: string } }) {
  const { dealId } = params;
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ photos: Array<{ label: string; url: string }>; idx: number } | null>(null);

  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
    fetch(`${apiBase}/api/report/${dealId}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [dealId]);

  const openLightbox = useCallback((photos: Array<{ label: string; url: string }>, idx: number) => {
    setLightbox({ photos, idx });
  }, []);

  if (loading) return <Skeleton />;

  if (error || !data) {
    return (
      <div style={{
        minHeight: '100vh', background: '#F5F5F7',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 16, padding: 32,
      }}>
        <div style={{ background: '#1A1A2E', borderRadius: 16, padding: 32, maxWidth: 480, textAlign: 'center' }}>
          <Image src={LOGO_URL} alt="Zaufaj Rzeczoznawcy" width={160} height={64} style={{ objectFit: 'contain', marginBottom: 24 }} unoptimized/>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Raport nie znaleziony</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 1.6 }}>
            Zlecenie #{dealId} nie istnieje lub nie jest dostępne.
          </p>
          {error && <p style={{ color: '#f87171', fontSize: 12, marginTop: 8 }}>{error}</p>}
        </div>
      </div>
    );
  }

  const v = data.vehicle;
  const vehicleName = [v.make, v.model, v.version].filter(Boolean).join(' ');
  const heroSubtitle = [v.year, v.fuel_type, v.engine_power_hp ? `${v.engine_power_hp} KM` : null, v.transmission].filter(Boolean).join(' • ');

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .collapsible-content { max-height: none !important; }
          body { background: #fff; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: A4; margin: 15mm; }
        }
        html { scroll-behavior: smooth; }
        body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif; }
        * { box-sizing: border-box; }
      `}</style>

      <div style={{ background: '#F5F5F7', minHeight: '100vh', color: '#1A1A2E' }}>

        {/* ── HEADER ── */}
        <header style={{
          background: '#1A1A2E',
          padding: '0 24px',
          position: 'sticky', top: 0, zIndex: 100,
          boxShadow: '0 2px 20px rgba(0,0,0,0.3)',
        }}>
          <div style={{
            maxWidth: 1100, margin: '0 auto',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            height: 68,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={LOGO_URL}
              alt="Zaufaj Rzeczoznawcy"
              style={{ height: 44, objectFit: 'contain', filter: 'brightness(1.1)' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{
                background: '#B71C1C',
                color: '#fff',
                borderRadius: 20,
                padding: '4px 14px',
                fontSize: 12,
                fontWeight: 700,
              }}>
                #{data.deal_id}
              </span>
              <button
                onClick={() => window.print()}
                className="no-print"
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 8, padding: '7px 14px',
                  color: '#fff', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
                </svg>
                PDF
              </button>
            </div>
          </div>
          {/* Red accent stripe */}
          <div style={{ background: '#B71C1C', height: 3, marginLeft: -24, marginRight: -24 }}/>
        </header>

        {/* ── HERO ── */}
        <div style={{ position: 'relative', height: 400, background: '#1A1A2E', overflow: 'hidden' }}>
          {data.hero_photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.hero_photo_url}
              alt={vehicleName}
              style={{
                width: '100%', height: '100%', objectFit: 'cover',
                opacity: 0.55,
              }}
            />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              background: 'linear-gradient(135deg, #1A1A2E 0%, #16213E 50%, #0F3460 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1">
                <rect x="2" y="7" width="20" height="14" rx="2"/>
                <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
                <line x1="12" y1="12" x2="12" y2="16"/>
              </svg>
            </div>
          )}

          {/* Gradient overlay */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to top, rgba(26,26,46,0.95) 0%, rgba(26,26,46,0.3) 60%, transparent 100%)',
          }}/>

          {/* Content */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: '32px 24px',
            maxWidth: 1100, margin: '0 auto',
          }}>
            <div style={{ maxWidth: 1100, margin: '0 auto' }}>
              {v.overall_condition && (
                <span style={{
                  background: '#B71C1C', color: '#fff',
                  borderRadius: 20, padding: '4px 14px',
                  fontSize: 12, fontWeight: 700, display: 'inline-block', marginBottom: 12,
                }}>
                  {v.overall_condition}
                </span>
              )}
              <h1 style={{
                color: '#fff', fontSize: 'clamp(24px, 5vw, 42px)',
                fontWeight: 900, margin: '0 0 8px', lineHeight: 1.1,
                textShadow: '0 2px 8px rgba(0,0,0,0.5)',
              }}>
                {vehicleName || 'Pojazd'}
              </h1>
              <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 15, margin: '0 0 20px' }}>
                {heroSubtitle}
              </p>

              {/* Hero badges */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {v.mileage && (
                  <div style={{
                    background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 20, padding: '6px 16px',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/><path d="m12 6 0 6 4 2"/>
                    </svg>
                    <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>
                      {Number(v.mileage).toLocaleString('pl-PL')} {v.mileage_unit || 'km'}
                    </span>
                  </div>
                )}
                {v.registration_plate && (
                  <div style={{
                    background: 'rgba(183, 28, 28, 0.85)', backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 20, padding: '6px 16px',
                  }}>
                    <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>
                      {v.registration_plate}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── QUICK STATS ── */}
        <div style={{
          background: '#1A1A2E',
          padding: '0 24px 24px',
        }}>
          <div style={{
            maxWidth: 1100, margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12,
          }}>
            {[
              { label: 'Rok produkcji', value: data.quick_stats.year || v.year, icon: '📅' },
              { label: 'Paliwo', value: data.quick_stats.fuel || v.fuel_type, icon: '⛽' },
              { label: 'Moc', value: data.quick_stats.power || (v.engine_power_hp ? `${v.engine_power_hp} KM` : null), icon: '🔧' },
              { label: 'Skrzynia biegów', value: data.quick_stats.transmission || v.transmission, icon: '⚙️' },
            ].map(s => s.value && (
              <div key={s.label} style={{
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12, padding: '16px 20px',
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                <span style={{ fontSize: 20 }}>{s.icon}</span>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</span>
                <span style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── DAMAGE SUMMARY BAR ── */}
        <div style={{
          background: '#fff',
          borderBottom: '1px solid #e2e8f0',
          padding: '0 24px',
          marginBottom: 8,
        }}>
          <div style={{
            maxWidth: 1100, margin: '0 auto',
            display: 'flex', flexWrap: 'wrap', alignItems: 'center',
            gap: 24, padding: '16px 0',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Uszkodzenia:
            </span>
            {[
              { label: 'Kosmetyczne', count: data.damage_summary.cosmetic, color: '#d97706', bg: '#fef3c7' },
              { label: 'Strukturalne', count: data.damage_summary.structural, color: '#dc2626', bg: '#fee2e2' },
              { label: 'Blacharskie', count: data.damage_summary.bodywork, color: '#7c3aed', bg: '#ede9fe' },
            ].map(d => (
              <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  background: d.bg, color: d.color,
                  borderRadius: 20, padding: '3px 12px', fontSize: 13, fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{
                    background: d.color, color: '#fff',
                    borderRadius: '50%', width: 20, height: 20,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800,
                  }}>{d.count}</span>
                  {d.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── MAIN CONTENT ── */}
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px 80px' }}>

          {/* Section 01: Dane pojazdu */}
          <CollapsibleSection title="Dane pojazdu" sectionNum="01">
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 12,
            }}>
              {[
                { label: 'Marka', value: v.make },
                { label: 'Model', value: v.model },
                { label: 'Wersja', value: v.version },
                { label: 'Rok produkcji', value: v.year },
                { label: 'Numer rejestracyjny', value: v.registration_plate },
                { label: 'VIN', value: v.vin },
                { label: 'Data pierwszej rejestracji', value: v.first_registration_date },
                { label: 'Przebieg', value: v.mileage ? `${Number(v.mileage).toLocaleString('pl-PL')} ${v.mileage_unit || 'km'}` : null },
                { label: 'Kolor', value: v.color },
                { label: 'Rodzaj paliwa', value: v.fuel_type },
                { label: 'Moc silnika', value: v.engine_power_hp ? `${v.engine_power_hp} KM${v.engine_power_kw ? ` / ${v.engine_power_kw} kW` : ''}` : null },
                { label: 'Pojemność silnika', value: v.engine_capacity_cc ? `${v.engine_capacity_cc} cm³` : null },
                { label: 'Skrzynia biegów', value: v.transmission },
                { label: 'Napęd', value: v.drive_type },
                { label: 'Typ nadwozia', value: v.body_type },
                { label: 'Liczba drzwi', value: v.doors },
                { label: 'Liczba miejsc', value: v.seats },
                { label: 'Masa własna', value: v.weight_kg ? `${v.weight_kg} kg` : null },
                { label: 'Liczba właścicieli', value: v.owners_count },
                { label: 'Rodzaj lakieru', value: v.paint_type },
                { label: 'Stan ogólny', value: v.overall_condition },
              ].filter(f => f.value !== null && f.value !== undefined && f.value !== '').map(f => (
                <div key={f.label} style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 10, padding: '12px 14px',
                }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    {f.label}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>
                    {String(f.value)}
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>

          {/* Section 02: Wyposażenie */}
          {data.equipment.length > 0 && (
            <CollapsibleSection title="Wyposażenie" sectionNum="02">
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 8,
              }}>
                {data.equipment.map(eq => (
                  <div key={eq.name} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px',
                    background: eq.present ? '#f0fdf4' : '#fff',
                    border: `1px solid ${eq.present ? '#bbf7d0' : '#e2e8f0'}`,
                    borderRadius: 8,
                  }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: eq.present ? '#16a34a' : '#e2e8f0',
                      color: eq.present ? '#fff' : '#94a3b8',
                      fontSize: 12, fontWeight: 700,
                    }}>
                      {eq.present ? '✓' : '✗'}
                    </span>
                    <span style={{ fontSize: 13, color: '#1A1A2E', fontWeight: eq.present ? 600 : 400 }}>
                      {eq.name}
                    </span>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Section 03: Zdjęcia podstawowe */}
          <CollapsibleSection title="Zdjęcia podstawowe" sectionNum="03">
            {data.photos.standard.length > 0 ? (
              <PhotoGrid photos={data.photos.standard} onPhotoClick={openLightbox} />
            ) : (
              <p style={{ color: '#94a3b8', textAlign: 'center', padding: '32px 0' }}>Brak zdjęć podstawowych</p>
            )}
          </CollapsibleSection>

          {/* Section 04: Dokumentacja pojazdu */}
          {data.documents_check.length > 0 && (
            <CollapsibleSection title="Dokumentacja pojazdu" sectionNum="04">
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: 10,
              }}>
                {data.documents_check.map(d => {
                  const color = d.status_type === 'green' ? '#16a34a' : d.status_type === 'red' ? '#dc2626' : '#2563eb';
                  const bg = d.status_type === 'green' ? '#f0fdf4' : d.status_type === 'red' ? '#fef2f2' : '#eff6ff';
                  const border = d.status_type === 'green' ? '#bbf7d0' : d.status_type === 'red' ? '#fecaca' : '#bfdbfe';
                  return (
                    <div key={d.name} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 16px',
                      background: bg, border: `1px solid ${border}`, borderRadius: 10,
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E' }}>{d.name}</span>
                      <span style={{
                        background: color, color: '#fff',
                        borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700,
                      }}>{d.status}</span>
                    </div>
                  );
                })}
              </div>
            </CollapsibleSection>
          )}

          {/* Section 05: Opony i pomiar lakieru */}
          <CollapsibleSection title="Opony i pomiar lakieru" sectionNum="05">
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: 32,
            }}>
              {/* Tires */}
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                  Opony
                </h3>
                {data.tires.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                    {data.tires.map((t, i) => <TireCard key={i} tire={t} />)}
                  </div>
                ) : (
                  <p style={{ color: '#94a3b8' }}>Brak danych o oponach</p>
                )}
              </div>

              {/* Paint */}
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                  Pomiar grubości lakieru
                </h3>
                {data.paint_measurements.length > 0 ? (
                  <PaintDiagram measurements={data.paint_measurements} />
                ) : (
                  <p style={{ color: '#94a3b8' }}>Brak pomiarów lakieru</p>
                )}
              </div>
            </div>
          </CollapsibleSection>

          {/* Section 06: Galeria zdjęciowa */}
          <CollapsibleSection title="Galeria zdjęciowa" sectionNum="06">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
              {[
                { key: 'body' as const, label: 'A — Nadwozie', photos: data.photos.body },
                { key: 'interior' as const, label: 'B — Wnętrze', photos: data.photos.interior },
                { key: 'engine' as const, label: 'C — Silnik', photos: data.photos.engine },
                { key: 'documents' as const, label: 'D — Dokumentacja', photos: data.photos.documents },
                { key: 'damages' as const, label: 'E — Uszkodzenia', photos: data.photos.damages },
              ].map(g => (
                <div key={g.key}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    marginBottom: 12, paddingBottom: 8,
                    borderBottom: '2px solid #f1f5f9',
                  }}>
                    <span style={{
                      background: '#1A1A2E', color: '#fff',
                      borderRadius: 6, padding: '3px 10px',
                      fontSize: 11, fontWeight: 800,
                    }}>{g.label}</span>
                  </div>

                  {g.photos.length > 0 ? (
                    <div>
                      {/* Damage type badges for damage photos */}
                      {g.key === 'damages' && (
                        <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {data.damages.map(d => (
                            <div key={d.index} style={{
                              display: 'flex', alignItems: 'center', gap: 6,
                              background: '#fff7ed', border: '1px solid #fed7aa',
                              borderRadius: 8, padding: '4px 10px',
                            }}>
                              <span style={{
                                background: '#B71C1C', color: '#fff',
                                borderRadius: '50%', width: 18, height: 18,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 10, fontWeight: 800,
                              }}>{d.index}</span>
                              <span style={{ fontSize: 12, color: '#9a3412' }}>
                                {d.type} — {d.location}
                                {d.size ? ` (${d.size})` : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      <PhotoGrid photos={g.photos} onPhotoClick={openLightbox} />
                    </div>
                  ) : (
                    <p style={{ color: '#94a3b8', fontSize: 13 }}>Brak zdjęć w tej kategorii</p>
                  )}
                </div>
              ))}
            </div>
          </CollapsibleSection>

          {/* Mechanical */}
          {data.mechanical && Object.values(data.mechanical).some(Boolean) && (
            <CollapsibleSection title="Stan mechaniczny" sectionNum="07">
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 12,
              }}>
                {[
                  { label: 'Rozruch silnika', value: data.mechanical.engine_start },
                  { label: 'Klimatyzacja', value: data.mechanical.ac_working != null ? (data.mechanical.ac_working ? 'Sprawna' : 'Niesprawna') : null },
                  { label: 'Kontrolki alarmowe', value: data.mechanical.warning_lights },
                ].filter(f => f.value).map(f => (
                  <div key={f.label} style={{
                    background: '#f8fafc', border: '1px solid #e2e8f0',
                    borderRadius: 10, padding: '12px 14px',
                  }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                      {f.label}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>{f.value}</div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Notes */}
          {data.notes && (
            <div style={{
              background: '#fff',
              borderRadius: 16, padding: '20px 24px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
              marginBottom: 20,
              borderLeft: '4px solid #B71C1C',
            }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Uwagi inspektora
              </h3>
              <p style={{ fontSize: 14, color: '#1A1A2E', lineHeight: 1.6, margin: 0 }}>{data.notes}</p>
            </div>
          )}

          {/* Signatures */}
          {(data.signatures?.inspector || data.signatures?.client) && (
            <div style={{
              background: '#fff',
              borderRadius: 16, padding: '20px 24px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
              marginBottom: 20,
            }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
                Podpisy
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                {data.signatures.inspector && (
                  <div style={{ textAlign: 'center' }}>
                    {data.signatures.inspector.signature_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={data.signatures.inspector.signature_url} alt="Podpis inspektora" style={{ maxHeight: 80, maxWidth: 200, marginBottom: 8 }}/>
                    )}
                    <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: 8, fontSize: 13, fontWeight: 600 }}>
                      Inspektor: {data.signatures.inspector.name}
                    </div>
                  </div>
                )}
                {data.signatures.client && (
                  <div style={{ textAlign: 'center' }}>
                    {data.signatures.client.signature_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={data.signatures.client.signature_url} alt="Podpis klienta" style={{ maxHeight: 80, maxWidth: 200, marginBottom: 8 }}/>
                    )}
                    <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: 8, fontSize: 13, fontWeight: 600 }}>
                      Klient: {data.signatures.client.name}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── FOOTER ── */}
        <footer style={{
          background: '#1A1A2E',
          padding: '40px 24px',
          marginTop: 40,
        }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 32, marginBottom: 32,
            }}>
              {/* Logo + inspector */}
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={LOGO_URL}
                  alt="Zaufaj Rzeczoznawcy"
                  style={{ height: 48, objectFit: 'contain', marginBottom: 16, filter: 'brightness(1.1)' }}
                />
                {data.inspector && (
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 1.8 }}>
                    <div style={{ color: '#fff', fontWeight: 700 }}>{data.inspector.name}</div>
                    {data.inspector.phone && <div>📞 {data.inspector.phone}</div>}
                  </div>
                )}
              </div>

              {/* Offices */}
              <div>
                <h4 style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                  Biura
                </h4>
                {[
                  { city: 'Rybnik', addr: 'ul. Przykładowa 1, 44-200 Rybnik' },
                  { city: 'Warszawa', addr: 'ul. Marszałkowska 1, 00-001 Warszawa' },
                  { city: 'Wrocław', addr: 'ul. Świdnicka 1, 50-001 Wrocław' },
                ].map(o => (
                  <div key={o.city} style={{ marginBottom: 8 }}>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>{o.city}</div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{o.addr}</div>
                  </div>
                ))}
              </div>

              {/* Report info */}
              <div>
                <h4 style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                  Informacje o raporcie
                </h4>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 2 }}>
                  <div>Zlecenie: <span style={{ color: '#fff', fontWeight: 700 }}>#{data.deal_id}</span></div>
                  {data.inspection_date && <div>Data inspekcji: <span style={{ color: '#fff', fontWeight: 700 }}>{data.inspection_date}</span></div>}
                  <div>Wygenerowano: <span style={{ color: '#fff', fontWeight: 700 }}>{new Date(data.generated_at).toLocaleDateString('pl-PL')}</span></div>
                </div>
              </div>
            </div>

            <div style={{
              borderTop: '1px solid rgba(255,255,255,0.1)',
              paddingTop: 20,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              flexWrap: 'wrap', gap: 12,
            }}>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                © {new Date().getFullYear()} Zaufaj Rzeczoznawcy. Wszelkie prawa zastrzeżone.
              </span>
              <span style={{ color: '#B71C1C', fontSize: 12, fontWeight: 600 }}>
                zaufajrzeczoznawcy.pl
              </span>
            </div>
          </div>
        </footer>

        {/* Back to top */}
        <button
          className="no-print"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          style={{
            position: 'fixed', bottom: 24, right: 24,
            background: '#B71C1C', color: '#fff',
            border: 'none', borderRadius: '50%',
            width: 48, height: 48,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', boxShadow: '0 4px 20px rgba(183,28,28,0.4)',
            zIndex: 99,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="18 15 12 9 6 15"/>
          </svg>
        </button>

      </div>

      {/* Lightbox */}
      {lightbox && (
        <Lightbox
          photos={lightbox.photos}
          startIndex={lightbox.idx}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  );
}
