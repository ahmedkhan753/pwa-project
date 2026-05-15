'use client';

/**
 * DamageMap — Condition Report "Mapa uszkodzeń" (Position 8).
 *
 * Top-down generic vehicle silhouette with clickable damage markers,
 * a colour legend and a damage list. Phase 1: one generic silhouette
 * for every body type (designer variants land in Phase 2).
 *
 * Pure presentational component — all data arrives via props from the
 * existing GET /api/report/{dealId} payload. No backend involvement.
 */

import React from 'react';
import { MapPin } from 'lucide-react';
import {
  exteriorDamageColor,
  INTERIOR_COLOR,
} from '@/lib/damageMapConfig';

// Damage shape as it arrives from the report API (subset we use here).
interface Damage {
  index: number;
  type: string;
  location: string;
  size?: string;
  description?: string;
}

type DamageKind = 'ext' | 'int';

interface DamageMapProps {
  damages: Damage[];
  interiorDamages: Damage[];
  bodyType: string;
  scrollToDamage: (kind: DamageKind, index: number) => void;
}

// ── Marker coordinate tables (viewBox 300×615, top-down, front at top) ──

const EXTERIOR_COORDS: Record<string, [number, number]> = {
  "Maska / Pokrywa silnika": [150, 80],
  "Zderzak przedni": [150, 30],
  "Zderzak tylny": [150, 570],
  "Błotnik przedni lewy": [60, 110],
  "Błotnik przedni prawy": [240, 110],
  "Błotnik tylny lewy": [60, 510],
  "Błotnik tylny prawy": [240, 510],
  "Drzwi przednie lewe": [70, 220],
  "Drzwi przednie prawe": [230, 220],
  "Drzwi tylne lewe": [70, 340],
  "Drzwi tylne prawe": [230, 340],
  "Dach": [150, 280],
  "Klapa / Pokrywa bagażnika": [150, 480],
  "Próg lewy": [52, 280],
  "Próg prawy": [248, 280],
  "Lusterko lewe": [34, 158],
  "Lusterko prawe": [266, 158],
  "Szyba przednia": [150, 158],
  "Szyba tylna": [150, 405],
  "Szyba boczna lewa": [78, 280],
  "Szyba boczna prawa": [222, 280],
  "Reflektor przedni lewy": [100, 50],
  "Reflektor przedni prawy": [200, 50],
  "Lampa tylna lewa": [100, 545],
  "Lampa tylna prawa": [200, 545],
  "Felga przednia lewa": [42, 205],
  "Felga przednia prawa": [258, 205],
  "Felga tylna lewa": [42, 460],
  "Felga tylna prawa": [258, 460],
  "Inne": [150, 600],
};

const INTERIOR_COORDS: Record<string, [number, number]> = {
  "Fotel kierowcy": [110, 240],
  "Fotel pasażera": [190, 240],
  "Kanapa tylna": [150, 360],
  "Zagłówki": [150, 218],
  "Deska rozdzielcza": [150, 198],
  "Konsola środkowa": [150, 285],
  "Kierownica": [108, 210],
  "Dźwignia zmiany biegów": [142, 270],
  "Podsufitka": [165, 315],
  "Wykładzina podłogowa": [150, 385],
  "Panel drzwi przednich lewych": [84, 230],
  "Panel drzwi przednich prawych": [216, 230],
  "Panel drzwi tylnych lewych": [84, 340],
  "Panel drzwi tylnych prawych": [216, 340],
  "Podłokietnik": [135, 300],
  "Schowek": [178, 212],
  "Lusterko wsteczne": [150, 188],
  "Osłony przeciwsłoneczne": [120, 188],
  "Pas bezpieczeństwa przód": [96, 252],
  "Pas bezpieczeństwa tył": [96, 372],
  "Bagażnik — wykładzina": [150, 445],
  "Bagażnik — ścianki": [180, 432],
  "Pedały": [108, 192],
  "Dywaniki": [128, 340],
  "Inne": [150, 410],
};

interface Marker {
  x: number;
  y: number;
  color: string;
  label: string;
  kind: DamageKind;
  index: number;
  location: string;
  type: string;
}

/** Build placed markers, offsetting overlapping damages on the same part diagonally. */
function buildMarkers(damages: Damage[], interiorDamages: Damage[]): Marker[] {
  const markers: Marker[] = [];
  const seen: Record<string, number> = {};

  const place = (
    d: Damage,
    kind: DamageKind,
    coords: Record<string, [number, number]>,
    color: string,
  ) => {
    const base = coords[d.location];
    if (!base) {
      // Unknown / free-text location — no coordinate, skip silently on the map
      // (the damage still shows in the list below).
      console.warn(`[DamageMap] no coordinates for ${kind} part "${d.location}" — marker skipped`);
      return;
    }
    const key = `${kind}:${d.location}`;
    const n = seen[key] || 0;
    seen[key] = n + 1;
    markers.push({
      x: base[0] + n * 12,
      y: base[1] + n * 12,
      color,
      label: `${kind === 'ext' ? 'E' : 'I'}${d.index}`,
      kind,
      index: d.index,
      location: d.location,
      type: d.type,
    });
  };

  for (const d of damages) place(d, 'ext', EXTERIOR_COORDS, exteriorDamageColor(d.type));
  for (const d of interiorDamages) place(d, 'int', INTERIOR_COORDS, INTERIOR_COLOR);
  return markers;
}

// ── Generic top-down car silhouette (same for every body type in Phase 1) ──

function CarSilhouette() {
  const STROKE = '#9CA3AF';
  const FILL = '#F3F4F6';
  const GLASS = '#E5E7EB';
  const PANEL = '#FFFFFF';
  const SOFT = '#D1D5DB';
  return (
    <g>
      {/* Body outline */}
      <rect x="44" y="24" width="212" height="558" rx="46" fill={FILL} stroke={STROKE} strokeWidth="2" />
      {/* Front + rear bumper sweeps */}
      <path d="M 72 27 Q 150 14 228 27" fill="none" stroke={STROKE} strokeWidth="2" />
      <path d="M 72 579 Q 150 592 228 579" fill="none" stroke={STROKE} strokeWidth="2" />
      {/* Hood */}
      <rect x="72" y="56" width="156" height="74" rx="14" fill={PANEL} stroke={SOFT} strokeWidth="1.5" />
      {/* Windshield */}
      <path d="M 80 138 L 220 138 L 204 178 L 96 178 Z" fill={GLASS} stroke={STROKE} strokeWidth="1.5" />
      {/* Roof */}
      <rect x="94" y="182" width="112" height="200" rx="10" fill={PANEL} stroke={SOFT} strokeWidth="1.5" />
      {/* Rear glass */}
      <path d="M 96 386 L 204 386 L 220 424 L 80 424 Z" fill={GLASS} stroke={STROKE} strokeWidth="1.5" />
      {/* Trunk */}
      <rect x="72" y="430" width="156" height="118" rx="14" fill={PANEL} stroke={SOFT} strokeWidth="1.5" />
      {/* Wheel arches — front L/R, rear L/R */}
      <rect x="33" y="186" width="17" height="48" rx="8" fill={GLASS} stroke={STROKE} strokeWidth="1.5" />
      <rect x="250" y="186" width="17" height="48" rx="8" fill={GLASS} stroke={STROKE} strokeWidth="1.5" />
      <rect x="33" y="440" width="17" height="48" rx="8" fill={GLASS} stroke={STROKE} strokeWidth="1.5" />
      <rect x="250" y="440" width="17" height="48" rx="8" fill={GLASS} stroke={STROKE} strokeWidth="1.5" />
      {/* Side mirrors */}
      <path d="M 44 152 l -14 -5 l 0 14 z" fill={GLASS} stroke={STROKE} strokeWidth="1.5" />
      <path d="M 256 152 l 14 -5 l 0 14 z" fill={GLASS} stroke={STROKE} strokeWidth="1.5" />
      {/* Subtle door lines */}
      <line x1="44" y1="262" x2="94" y2="262" stroke={SOFT} strokeWidth="1.5" />
      <line x1="206" y1="262" x2="256" y2="262" stroke={SOFT} strokeWidth="1.5" />
      <line x1="44" y1="320" x2="94" y2="320" stroke={SOFT} strokeWidth="1.5" />
      <line x1="206" y1="320" x2="256" y2="320" stroke={SOFT} strokeWidth="1.5" />
    </g>
  );
}

// ── Legend ─────────────────────────────────────────────────────────

const LEGEND: Array<{ color: string; label: string }> = [
  { color: '#F97316', label: 'Rysa / Wytarcie' },
  { color: '#FACC15', label: 'Odprysk' },
  { color: '#DC2626', label: 'Wgniecenie / Pęknięcie' },
  { color: '#374151', label: 'Inne / Wnętrze' },
];

export function DamageMap({ damages, interiorDamages, scrollToDamage }: DamageMapProps) {
  const markers = React.useMemo(
    () => buildMarkers(damages || [], interiorDamages || []),
    [damages, interiorDamages],
  );

  // Ordered list rows — exterior first, then interior, mirroring the report.
  const rows: Marker[] = React.useMemo(() => {
    const ext = (damages || []).map((d): Marker => ({
      x: 0, y: 0, color: exteriorDamageColor(d.type), label: `E${d.index}`,
      kind: 'ext', index: d.index, location: d.location, type: d.type,
    }));
    const int = (interiorDamages || []).map((d): Marker => ({
      x: 0, y: 0, color: INTERIOR_COLOR, label: `I${d.index}`,
      kind: 'int', index: d.index, location: d.location, type: d.type,
    }));
    return [...ext, ...int];
  }, [damages, interiorDamages]);

  return (
    <div>
      {/* a. Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 8, background: '#FEF2F2',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <MapPin size={20} color="#DC2626" />
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#1D1D1F', lineHeight: 1.3 }}>
            Mapa uszkodzeń
          </div>
          <div style={{ fontSize: 13, color: '#86868B' }}>
            Lokalizacja udokumentowanych uszkodzeń
          </div>
        </div>
      </div>

      {/* b + c. Silhouette with marker overlay */}
      <div style={{
        background: '#F8F8FA', border: '1px solid #E8E8ED', borderRadius: 12,
        padding: '16px 12px', display: 'flex', justifyContent: 'center',
      }}>
        <svg
          viewBox="0 0 300 615"
          style={{ width: '100%', maxWidth: 340, height: 'auto', display: 'block' }}
          role="img"
          aria-label="Schemat pojazdu z lokalizacją uszkodzeń"
        >
          <CarSilhouette />
          {markers.map((m, i) => (
            <g
              key={`${m.kind}-${m.index}-${i}`}
              onClick={() => scrollToDamage(m.kind, m.index)}
              style={{ cursor: 'pointer' }}
              aria-label={`${m.label} — ${m.type} — ${m.location}`}
            >
              <circle cx={m.x} cy={m.y} r={14} fill={m.color} stroke="#FFFFFF" strokeWidth={2} />
              <text
                x={m.x} y={m.y} textAnchor="middle" dy="0.35em"
                fill="#FFFFFF" fontSize={11} fontWeight={700}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {m.label}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* d. Colour legend */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '10px 20px',
        justifyContent: 'center', margin: '16px 0 4px',
      }}>
        {LEGEND.map((l) => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{
              width: 12, height: 12, borderRadius: '50%', background: l.color,
              flexShrink: 0, border: '1.5px solid #fff', boxShadow: '0 0 0 1px #E8E8ED',
            }} />
            <span style={{ fontSize: 12, color: '#4B5563', fontWeight: 500 }}>{l.label}</span>
          </div>
        ))}
      </div>

      {/* e. Damage list */}
      {rows.length > 0 && (
        <div
          className="rg-std-grid"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8, marginTop: 16 }}
        >
          {rows.map((m, i) => (
            <div
              key={`${m.kind}-${m.index}-${i}`}
              onClick={() => scrollToDamage(m.kind, m.index)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') scrollToDamage(m.kind, m.index); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                borderRadius: 8, border: '1px solid #E8E8ED', background: '#fff',
                cursor: 'pointer', transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#F5F5F7'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#fff'; }}
            >
              <span style={{
                flexShrink: 0, minWidth: 30, height: 24, padding: '0 6px', borderRadius: 6,
                background: m.color, color: '#fff', fontSize: 12, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {m.label}
              </span>
              <span style={{ fontSize: 12, color: '#1D1D1F', lineHeight: 1.4, minWidth: 0 }}>
                <span style={{ fontWeight: 700 }}>{m.type || 'Uszkodzenie'}</span>
                {m.location ? <span style={{ color: '#6B7280' }}> — {m.location}</span> : null}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
