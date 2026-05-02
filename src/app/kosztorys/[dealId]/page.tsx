'use client';
/* ════════════════════════════════════════════════════════════════════
   KOSZTORYS — Dynamic per-deal page (/kosztorys/[dealId])

   Hybrid Eurotax + inspection report. Fetches in parallel:
     • /api/kosztorys/{dealId}  → backend Eurotax PDF parser output
     • /api/report/{dealId}     → existing inspection record (photos,
                                  tires, documents, equipment, mileage,
                                  damages…)

   Either source can fail without breaking the page:
     • No Eurotax PDF yet → banner + skip cost / parts / summary
     • Inspection missing → hide photos / tires / documents
     • Both fail → friendly error page
   ════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useMemo, useState } from 'react';
import { Lightbox } from '../_components/Lightbox';
import { BlachSectionTable } from '../_components/BlachSectionTable';
import { LakierSectionTable } from '../_components/LakierSectionTable';
import { COLORS, fmtPLN, fmtNum, fmtEUR, fmtPct, splitMakeModel } from '../_components/styles';
import type { KosztorysData } from '@/types/kosztorys';

// ─── Types for the inspection report (subset we use) ──────────────────────────

interface ReportPhoto { label?: string; url?: string }
interface ReportData {
  deal_id?: number;
  vehicle?: {
    make?: string; model?: string; vin?: string; registration_plate?: string;
    year?: string; mileage?: string; color?: string; fuel_type?: string;
    transmission?: string; body_type?: string; drive_type?: string;
    doors?: string; seats?: string; engine_capacity_cc?: string; engine_power_hp?: string;
  };
  hero_photo_url?: string | null;
  inspection_date?: string;
  inspector?: { name?: string; phone?: string };
  photos?: {
    standard?: ReportPhoto[]; body?: ReportPhoto[]; interior?: ReportPhoto[];
    engine?: ReportPhoto[]; documents?: ReportPhoto[]; damages?: ReportPhoto[];
  };
  equipment?: Array<[string, string] | { label: string; value: string }>;
  documents_check?: Array<[string, string] | { label: string; value: string }>;
  tires?: Array<Record<string, unknown>>;
  generated_at?: string;
}

// ─── Section nav ──────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: 'expertise', label: 'Pojazd' },
  { id: 'eurotax',   label: 'Eurotax' },
  { id: 'summary',   label: 'Podsumowanie' },
  { id: 'parts',     label: 'Części' },
  { id: 'equipment', label: 'Wyposażenie' },
  { id: 'inspection-photos', label: 'Zdjęcia' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractAllPhotos(report: ReportData | null): { url: string; label: string }[] {
  if (!report?.photos) return [];
  const out: { url: string; label: string }[] = [];
  const groups: (keyof NonNullable<ReportData['photos']>)[] =
    ['standard', 'body', 'interior', 'engine', 'documents', 'damages'];
  for (const g of groups) {
    const arr = report.photos[g] || [];
    for (const p of arr) {
      if (p?.url) out.push({ url: p.url, label: p.label || g });
    }
  }
  return out;
}

function pairFromKV(kv: ReportData['equipment']): [string, string][] {
  if (!kv) return [];
  return kv.map((row): [string, string] => {
    if (Array.isArray(row)) return [String(row[0] ?? ''), String(row[1] ?? '')];
    return [String(row.label ?? ''), String(row.value ?? '')];
  });
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function KosztorysDealPage({ params }: { params: { dealId: string } }) {
  const { dealId } = params;
  const [kosztorys, setKosztorys] = useState<KosztorysData | null>(null);
  const [report, setReport]       = useState<ReportData | null>(null);
  const [kosztorysErr, setKErr]   = useState<{ status: number; msg: string } | null>(null);
  const [reportErr, setRErr]      = useState<{ status: number; msg: string } | null>(null);
  const [loading, setLoading]     = useState(true);
  const [lightbox, setLightbox]   = useState<{ photos: string[]; start: number } | null>(null);
  const [heroIdx, setHeroIdx]     = useState(0);

  useEffect(() => {
    const kPromise = fetch(`/api/kosztorys/${dealId}`)
      .then(async r => {
        if (!r.ok) { setKErr({ status: r.status, msg: await r.text() }); return null; }
        return r.json() as Promise<KosztorysData>;
      })
      .catch(e => { setKErr({ status: 0, msg: String(e) }); return null; });

    const rPromise = fetch(`/api/report/${dealId}`)
      .then(async r => {
        if (!r.ok) { setRErr({ status: r.status, msg: await r.text() }); return null; }
        return r.json() as Promise<ReportData>;
      })
      .catch(e => { setRErr({ status: 0, msg: String(e) }); return null; });

    Promise.all([kPromise, rPromise]).then(([k, r]) => {
      setKosztorys(k);
      setReport(r);
      setLoading(false);
    });
  }, [dealId]);

  // Hero gallery from report photos (fall back to single hero_photo_url)
  const heroPhotos = useMemo(() => {
    if (!report) return [];
    const urls: string[] = [];
    if (report.hero_photo_url) urls.push(report.hero_photo_url);
    for (const p of (report.photos?.standard || [])) {
      if (p?.url && !urls.includes(p.url)) urls.push(p.url);
    }
    for (const p of (report.photos?.body || [])) {
      if (p?.url && !urls.includes(p.url)) urls.push(p.url);
    }
    return urls.slice(0, 10);
  }, [report]);

  const allInspPhotos = useMemo(() => extractAllPhotos(report), [report]);

  // Both failed → error page
  if (!loading && !kosztorys && !report) {
    return <ErrorPage dealId={dealId} kErr={kosztorysErr} rErr={reportErr} />;
  }

  if (loading) return <SkeletonPage />;

  const veh = kosztorys?.vehicle;
  const vehSplit = splitMakeModel(veh?.make_model_type || '');
  // Inspection report's vehicle data (hybrid: prefer Eurotax for VIN/plate, fall back)
  const insp = report?.vehicle || {};
  const make    = vehSplit.make || (insp.make ? String(insp.make) : '');
  const model   = vehSplit.model || (insp.model ? String(insp.model) : '');
  const variant = vehSplit.variant;
  const vin     = veh?.vin || insp.vin || '';
  const plate   = veh?.registration_plate || insp.registration_plate || '';
  const date    = veh?.date || report?.inspection_date || '';

  const hasEurotax = !!kosztorys;
  const hasReport  = !!report;

  return (
    <div style={{ overflowX: 'hidden', width: '100%', maxWidth: '100vw' }}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" />
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" />
      <style dangerouslySetInnerHTML={{ __html: SHARED_CSS }} />

      {lightbox && (
        <Lightbox photos={lightbox.photos} start={lightbox.start} onClose={() => setLightbox(null)} />
      )}

      {/* ─── Sticky Nav ──────────────────────────────────────────────── */}
      <nav className="no-print" style={{
        position: 'sticky', top: 0, zIndex: 100, background: '#fff',
        borderBottom: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        <div className="nav-outer" style={{
          maxWidth: 1100, margin: '0 auto', padding: '0 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://i.postimg.cc/VsgMRGYH/SPROWADZENIE-SAMOCHODOW-Z-USAPOD-DOM-(500-x-500-px)-(800-x-500-px)-(700-x-300-px)-2.png"
              alt="Zaufaj Rzeczoznawcy"
              style={{ height: 36, width: 'auto', objectFit: 'contain', display: 'block' }}
            />
          </div>
          <div className="nav-scroll" style={{ display: 'flex', gap: 20, overflow: 'auto', flex: 1, justifyContent: 'center' }}>
            {NAV_ITEMS.map(n => (
              <a key={n.id} className="nav-link"
                onClick={() => document.getElementById(n.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                {n.label}
              </a>
            ))}
          </div>
          <button onClick={() => window.print()} className="no-print print-btn" style={{
            padding: '8px 16px', borderRadius: 8, border: '1.5px solid #D1D5DB', background: '#fff',
            color: '#374151', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
          }}>
            <i className="fas fa-print" style={{ fontSize: 13 }} />
            <span className="print-label">Drukuj</span>
          </button>
        </div>
      </nav>

      <div className="page-container" style={{
        maxWidth: 1100, margin: '0 auto', background: '#fff',
        minHeight: '100vh', boxShadow: '0 0 40px rgba(0,0,0,0.06)',
      }}>

        {/* Banner if Eurotax not available */}
        {!hasEurotax && (
          <div style={{
            margin: '20px 40px 0', padding: '14px 18px', borderRadius: 10,
            background: '#FEF3C7', border: '1px solid #FBBF24',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <i className="fas fa-info-circle" style={{ color: '#92400E', fontSize: 18 }} />
            <div style={{ fontSize: 13, color: '#92400E' }}>
              <strong>Eurotax PDF jeszcze nie został przesłany dla tego zlecenia.</strong>
              {' '}Sekcje kosztów, części i podsumowania będą widoczne po przesłaniu PDF do Bitrix24.
            </div>
          </div>
        )}

        {/* ═══ EXPERTISE — vehicle header ═══════════════════════════════ */}
        <section id="expertise" className="kosz-section" style={{ padding: '32px 40px' }}>
          <div style={{
            display: 'inline-block', background: COLORS.primary, color: '#fff',
            padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 700,
            letterSpacing: 1, textTransform: 'uppercase', marginBottom: 20,
          }}>
            Ekspertyza{hasEurotax ? ' — Eurotax' : ''}
          </div>

          <div className="expertise-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
            {/* Hero photo */}
            <div>
              {heroPhotos.length > 0 ? (
                <>
                  <div className="hero-main" style={{
                    borderRadius: 12, overflow: 'hidden', aspectRatio: '4/3',
                    background: '#F5F5F7', cursor: 'pointer', marginBottom: 10,
                  }}
                    onClick={() => setLightbox({ photos: heroPhotos, start: heroIdx })}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={heroPhotos[heroIdx]} alt={`${make} ${model}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                  {heroPhotos.length > 1 && (
                    <div className="thumb-grid" style={{
                      display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6,
                    }}>
                      {heroPhotos.slice(0, 5).map((src, i) => (
                        <div key={i}
                          className={`hero-thumb${i === heroIdx ? ' active' : ''}`}
                          onClick={() => setHeroIdx(i)}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div style={{
                  borderRadius: 12, aspectRatio: '4/3', background: '#F5F5F7',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: COLORS.muted, fontSize: 13,
                }}>
                  <i className="fas fa-image" style={{ fontSize: 28, opacity: 0.4, marginRight: 8 }} />
                  Brak zdjęć
                </div>
              )}
            </div>

            {/* Vehicle details */}
            <div>
              <h1 style={{ margin: '0 0 4px', fontSize: 28, fontWeight: 900, color: COLORS.text }}>
                {make} {model}
              </h1>
              {variant && (
                <div style={{ fontSize: 15, color: COLORS.muted, fontWeight: 500, marginBottom: 24 }}>
                  {variant}
                </div>
              )}
              <div style={{ marginBottom: 24 }}>
                {([
                  ['VIN',                  vin],
                  ['Kod ETG',              veh?.etg_code || ''],
                  ['Nr rejestracyjny',     plate],
                  ['Przebieg',             insp.mileage ? `${insp.mileage} km` : ''],
                  ['Pierwsza rejestracja', insp.year || ''],
                  ['Kolor nadwozia',       insp.color || ''],
                  ['Klient',               veh?.klient || ''],
                  ['Data',                 date],
                ] as [string, string][]).filter(([, v]) => v).map(([k, v]) => (
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
              {hasEurotax && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                  borderRadius: 8, background: COLORS.greenLt, border: '1px solid #BBF7D0',
                }}>
                  <i className="fas fa-file-invoice-dollar" style={{ color: COLORS.green, fontSize: 16 }} />
                  <div>
                    <div style={{ fontSize: 11, color: COLORS.green, fontWeight: 700 }}>
                      EUROTAX — System lakierniczy {veh?.paint_system || 'AZT'}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.muted }}>
                      Baza: {veh?.base_version || '—'}
                      {' | '}Waluta: {veh?.currency || 'PLN'}
                      {' | '}Logika: {veh?.hail_logic || '—'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ═══ EUROTAX KOSZTORYS — 3 sections ════════════════════════════ */}
        {hasEurotax && (
          <>
            <hr className="kosz-hr" />
            <section id="eurotax" className="kosz-section" style={{ padding: '32px 40px' }}>
              <div className="section-title">EUROTAX — KOSZTORYS NAPRAW</div>

              <BlachSectionTable title="Blacharz"      section={kosztorys.sections.blacharz} />
              <BlachSectionTable title="Pr.dodatkowe"  section={kosztorys.sections.pr_dodatkowe} />
              <LakierSectionTable title="Lakiernik"    section={kosztorys.sections.lakiernik} />
            </section>

            {/* ═══ SUMMARY ════════════════════════════════════════════════ */}
            <hr className="kosz-hr" />
            <section id="summary" className="kosz-section" style={{ padding: '32px 40px' }}>
              <div className="section-title">PODSUMOWANIE</div>

              {/* Per-section breakdown */}
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Sekcja</th>
                      <th className="amt">Stawka</th>
                      <th className="amt">Czasy napraw</th>
                      <th className="amt">Robocizna</th>
                      <th className="amt">Materiał</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(kosztorys.summary?.per_section || []).map((s, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{s.section}</td>
                        <td className="amt">{fmtPLN(s.rate)}</td>
                        <td className="amt">{fmtNum(s.hours)}</td>
                        <td className="amt">{fmtPLN(s.labor)}</td>
                        <td className="amt">{fmtPLN(s.material)}</td>
                      </tr>
                    ))}
                    {kosztorys.summary?.small_materials_pln !== null && (
                      <tr>
                        <td colSpan={4} style={{ color: COLORS.muted }}>
                          Mat. drobne i dodatk.
                          {kosztorys.summary?.small_materials_pct !== null && (
                            <span> ({fmtPct(kosztorys.summary.small_materials_pct)})</span>
                          )}
                        </td>
                        <td className="amt">{fmtPLN(kosztorys.summary?.small_materials_pln)}</td>
                      </tr>
                    )}
                    <tr className="total-row">
                      <td>Razem robocizna</td>
                      <td />
                      <td className="amt" style={{ fontWeight: 700 }}>
                        {fmtNum(kosztorys.summary?.total_labor_hours)}
                      </td>
                      <td className="amt" style={{ fontWeight: 700 }}>
                        {fmtPLN(kosztorys.summary?.total_labor)}
                      </td>
                      <td />
                    </tr>
                    <tr className="total-row">
                      <td>Razem materiał</td>
                      <td colSpan={3} />
                      <td className="amt" style={{ fontWeight: 700 }}>
                        {fmtPLN(kosztorys.summary?.total_material)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* VAT breakdown */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 12, marginTop: 24,
              }}>
                <div style={{
                  padding: '14px 16px', borderRadius: 10, background: COLORS.mutedLt,
                  border: `1px solid ${COLORS.borderLt}`,
                }}>
                  <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, marginBottom: 4 }}>
                    KOSZT BEZ VAT
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>
                    {fmtPLN(kosztorys.summary?.subtotal_no_vat)}
                  </div>
                </div>
                <div style={{
                  padding: '14px 16px', borderRadius: 10, background: COLORS.mutedLt,
                  border: `1px solid ${COLORS.borderLt}`,
                }}>
                  <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, marginBottom: 4 }}>
                    VAT ({fmtPct(kosztorys.summary?.vat_pct)})
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>
                    {fmtPLN(kosztorys.summary?.vat_amount)}
                  </div>
                </div>
                <div className="grand-total" style={{
                  padding: '14px 16px', borderRadius: 10, background: COLORS.greenLt,
                  border: '2px solid #86EFAC',
                }}>
                  <div style={{ fontSize: 11, color: COLORS.green, fontWeight: 700, marginBottom: 4 }}>
                    KOSZT Z VAT
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.green }}>
                    {fmtPLN(kosztorys.summary?.total_with_vat_pln)}
                  </div>
                  {kosztorys.summary?.total_eur !== null && (
                    <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>
                      ≈ {fmtEUR(kosztorys.summary?.total_eur)}
                    </div>
                  )}
                </div>
              </div>

              {/* Indices */}
              {(kosztorys.indices?.indeks_mat_lak_pct !== null
                || kosztorys.indices?.indeks_czesci_zamiennych_pct !== null) && (
                <div style={{
                  marginTop: 20, padding: '12px 16px', borderRadius: 8,
                  background: '#EFF6FF', border: '1px solid #BFDBFE',
                  fontSize: 12, color: '#1E3A8A', display: 'flex', gap: 24, flexWrap: 'wrap',
                }}>
                  <span>
                    <strong>Indeks na mat. lak.:</strong>{' '}
                    {fmtPct(kosztorys.indices?.indeks_mat_lak_pct)}
                  </span>
                  <span>
                    <strong>Indeks części zamiennych:</strong>{' '}
                    {fmtPct(kosztorys.indices?.indeks_czesci_zamiennych_pct)}
                  </span>
                </div>
              )}
            </section>

            {/* ═══ PARTS LIST ════════════════════════════════════════════ */}
            {kosztorys.parts && kosztorys.parts.length > 0 && (kosztorys.parts_total_pln || 0) > 0 && (
              <>
                <hr className="kosz-hr" />
                <section id="parts" className="kosz-section" style={{ padding: '32px 40px' }}>
                  <div className="section-title">CZĘŚCI ZAMIENNE</div>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Nazwa części</th>
                          <th>Numer części</th>
                          <th>Poprzedni numer</th>
                          <th className="amt">Cena</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kosztorys.parts.map((p, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 600 }}>{p.description || '—'}</td>
                            <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                              {p.part_number || '—'}
                            </td>
                            <td style={{ fontFamily: 'monospace', fontSize: 12, color: COLORS.muted }}>
                              {p.previous_part_number || '—'}
                            </td>
                            <td className="amt">{fmtPLN(p.price_pln)}</td>
                          </tr>
                        ))}
                        <tr className="total-row">
                          <td colSpan={3} style={{ textAlign: 'right', fontWeight: 800 }}>
                            Razem części:
                          </td>
                          <td className="amt" style={{ fontWeight: 900, color: COLORS.primary }}>
                            {fmtPLN(kosztorys.parts_total_pln)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p style={{
                    marginTop: 10, fontSize: 11, color: COLORS.muted, fontStyle: 'italic',
                  }}>
                    Uwaga: Podane numery katalogowe nie powinny być używane do zamawiania części zamiennych.
                  </p>
                </section>
              </>
            )}

            {/* ═══ EQUIPMENT — Eurotax flat list ═══════════════════════════ */}
            {kosztorys.equipment_options && kosztorys.equipment_options.length > 0 && (
              <>
                <hr className="kosz-hr" />
                <section id="equipment" className="kosz-section" style={{ padding: '32px 40px' }}>
                  <div className="section-title">WYPOSAŻENIE Z EUROTAX</div>
                  <div className="equip-grid" style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8,
                  }}>
                    {kosztorys.equipment_options.map((opt, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 14px', borderRadius: 8,
                        background: COLORS.mutedLt, border: `1px solid ${COLORS.borderLt}`,
                      }}>
                        <i className="fas fa-check-circle" style={{ color: COLORS.green, fontSize: 14 }} />
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{opt}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
          </>
        )}

        {/* ═══ INSPECTION DATA ═══════════════════════════════════════════ */}
        {hasReport && (
          <>
            {/* Equipment from inspection */}
            {(report?.equipment && report.equipment.length > 0) && (
              <>
                <hr className="kosz-hr" />
                <section className="kosz-section" style={{ padding: '32px 40px' }}>
                  <div className="section-title">WYPOSAŻENIE — INSPEKCJA</div>
                  <div className="equip-grid" style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10,
                  }}>
                    {pairFromKV(report.equipment).map(([k, v], i) => {
                      const clr = v === 'Tak' || v === 'OK' ? COLORS.green
                                : v === 'Nie' || v === 'NIE' ? COLORS.red
                                : COLORS.text;
                      return (
                        <div key={i} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '10px 14px', borderRadius: 8, background: COLORS.mutedLt,
                          border: `1px solid ${COLORS.borderLt}`,
                        }}>
                          <span style={{ color: COLORS.muted, fontSize: 13, fontWeight: 500 }}>{k}</span>
                          <span style={{ fontWeight: 700, fontSize: 13, color: clr }}>{v}</span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </>
            )}

            {/* Tires */}
            {(report?.tires && report.tires.length > 0) && (
              <>
                <hr className="kosz-hr" />
                <section className="kosz-section" style={{ padding: '32px 40px' }}>
                  <div className="section-title">OPONY</div>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Pozycja</th>
                          <th>Bieżnik</th>
                          <th>Producent / Model</th>
                          <th>Wymiary</th>
                          <th>Sezon</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.tires.map((t, i) => (
                          <tr key={i}>
                            <td>{String((t as Record<string, unknown>).position ?? (t as Record<string, unknown>).location ?? `${i + 1}`)}</td>
                            <td style={{ color: COLORS.green, fontWeight: 600 }}>
                              {String((t as Record<string, unknown>).tread ?? '')}
                            </td>
                            <td>
                              {String((t as Record<string, unknown>).producer ?? '')}
                              {(t as Record<string, unknown>).model ? ` / ${String((t as Record<string, unknown>).model)}` : ''}
                            </td>
                            <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                              {String((t as Record<string, unknown>).dimensions ?? '')}
                            </td>
                            <td>{String((t as Record<string, unknown>).season ?? '')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}

            {/* Documents */}
            {(report?.documents_check && report.documents_check.length > 0) && (
              <>
                <hr className="kosz-hr" />
                <section className="kosz-section" style={{ padding: '32px 40px' }}>
                  <div className="section-title">WYKAZ DOKUMENTÓW</div>
                  <div className="docs-grid" style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12,
                  }}>
                    {pairFromKV(report.documents_check).map(([k, v], i) => (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '12px 16px', borderRadius: 10, background: COLORS.mutedLt,
                        border: `1px solid ${COLORS.borderLt}`,
                      }}>
                        <span style={{ color: COLORS.muted, fontSize: 13, fontWeight: 500 }}>{k}</span>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}

            {/* Inspection photos grid */}
            {allInspPhotos.length > 0 && (
              <>
                <hr className="kosz-hr" />
                <section id="inspection-photos" className="kosz-section" style={{ padding: '32px 40px' }}>
                  <div className="section-title">ZDJĘCIA Z INSPEKCJI</div>
                  <div className="photos-grid" style={{
                    display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10,
                  }}>
                    {allInspPhotos.map((p, i) => (
                      <div key={i} className="photo-tile"
                        onClick={() => setLightbox({ photos: allInspPhotos.map(x => x.url), start: i })}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.url} alt={p.label} loading="lazy" />
                        <div className="tile-label">{p.label}</div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
          </>
        )}

        {/* ═══ ABBREVIATIONS LEGEND ════════════════════════════════════ */}
        {hasEurotax && (kosztorys.abbreviations.length > 0 || kosztorys.paint_method_legend.length > 0) && (
          <>
            <hr className="kosz-hr" />
            <section className="kosz-section" style={{ padding: '32px 40px' }}>
              <div className="section-title">LEGENDA</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
                {kosztorys.abbreviations.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                      Skróty
                    </h4>
                    <table className="data-table" style={{ fontSize: 12 }}>
                      <tbody>
                        {kosztorys.abbreviations.map((a, i) => (
                          <tr key={i}>
                            <td style={{ width: 60, fontFamily: 'monospace', fontWeight: 700 }}>{a.short}</td>
                            <td>{a.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {kosztorys.paint_method_legend.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                      Rodzaj / Stopień / Metoda
                    </h4>
                    <table className="data-table" style={{ fontSize: 12 }}>
                      <tbody>
                        {kosztorys.paint_method_legend.map((a, i) => (
                          <tr key={i}>
                            <td style={{ width: 60, fontFamily: 'monospace', fontWeight: 700 }}>{a.short}</td>
                            <td>{a.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {/* ─── Footer ─────────────────────────────────────────────────── */}
        <footer className="footer-bar" style={{
          padding: '24px 40px', background: COLORS.navy, color: '#9CA3AF', fontSize: 12,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://i.postimg.cc/VsgMRGYH/SPROWADZENIE-SAMOCHODOW-Z-USAPOD-DOM-(500-x-500-px)-(800-x-500-px)-(700-x-300-px)-2.png"
              alt="ZR"
              style={{ height: 28, width: 'auto', filter: 'brightness(0) invert(1)' }}
            />
            <span style={{ fontWeight: 600, color: '#E5E7EB' }}>Zaufaj Rzeczoznawcy</span>
          </div>
          <div>© 2026 Zaufaj Rzeczoznawcy · Eurotax{date ? ` · ${date}` : ''} · Zlecenie #{dealId}</div>
        </footer>
      </div>
    </div>
  );
}

// ─── Skeleton + error pages ───────────────────────────────────────────────────

function SkeletonPage() {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 32 }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" />
      <div style={{ height: 40, background: '#F3F4F6', borderRadius: 8, marginBottom: 24, animation: 'pulse 1.6s ease-in-out infinite' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginBottom: 32 }}>
        <div style={{ aspectRatio: '4/3', background: '#F3F4F6', borderRadius: 12, animation: 'pulse 1.6s ease-in-out infinite' }} />
        <div>
          <div style={{ height: 32, background: '#F3F4F6', borderRadius: 6, marginBottom: 12, animation: 'pulse 1.6s ease-in-out infinite' }} />
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ height: 18, background: '#F3F4F6', borderRadius: 4, marginBottom: 8, animation: 'pulse 1.6s ease-in-out infinite' }} />
          ))}
        </div>
      </div>
      {[...Array(3)].map((_, i) => (
        <div key={i} style={{ height: 180, background: '#F3F4F6', borderRadius: 12, marginBottom: 24, animation: 'pulse 1.6s ease-in-out infinite' }} />
      ))}
      <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.5 } }`}</style>
    </div>
  );
}

function ErrorPage({
  dealId, kErr, rErr,
}: {
  dealId: string;
  kErr: { status: number; msg: string } | null;
  rErr: { status: number; msg: string } | null;
}) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 32,
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" />
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" />
      <i className="fas fa-folder-open" style={{ fontSize: 56, color: COLORS.muted, marginBottom: 16 }} />
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
        Brak danych dla zlecenia #{dealId}
      </h1>
      <p style={{ color: COLORS.muted, maxWidth: 480, textAlign: 'center', lineHeight: 1.6 }}>
        Nie udało się pobrać kosztorysu Eurotax ani danych inspekcji dla tego zlecenia.
        Sprawdź, czy numer zlecenia jest poprawny, lub skontaktuj się z administratorem.
      </p>
      <div style={{ marginTop: 24, fontSize: 11, color: COLORS.muted, maxWidth: 480 }}>
        <div>Eurotax: {kErr ? `${kErr.status || '—'} ${kErr.msg.slice(0, 80)}` : 'brak danych'}</div>
        <div>Inspekcja: {rErr ? `${rErr.status || '—'} ${rErr.msg.slice(0, 80)}` : 'brak danych'}</div>
      </div>
    </div>
  );
}

// ─── Shared CSS ──────────────────────────────────────────────────────────────

const SHARED_CSS = `
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; font-family:'Inter',system-ui,sans-serif;
    background:#FAFAFA; color:#1D1D1F; overflow-x:hidden; width:100%; max-width:100vw; }
  @media print {
    .no-print { display:none !important; }
    body { background:#fff; }
    .page-container { box-shadow:none !important; max-width:100% !important; }
    section { page-break-inside: avoid; }
    .kosz-section { padding:16px 24px !important; }
    .section-title { page-break-after: avoid; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; page-break-after: auto; }
    .photo-tile, .hero-thumb { break-inside: avoid; }
    /* Preserve colour for badges and total-rows */
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
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
  .kosz-hr { margin:0 40px; border:none; border-top:1px solid #E5E7EB; }
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
`;
