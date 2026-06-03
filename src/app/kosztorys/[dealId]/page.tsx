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
import type { MacadamData, MacadamPart } from '@/types/kosztorysMacadam';

// ─── Types for the inspection report (subset we use) ──────────────────────────

interface ReportPhoto { label?: string; url?: string }
interface ReportEquipmentItem { name: string; present: boolean }
interface ReportDocumentItem { name: string; status: string; status_type: string }
interface ReportTire {
  position?: string | null;
  brand?: string | null;
  model?: string | null;
  treadDepth?: string | number | null;
  size?: string | null;
  season?: string | null;
}
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
  equipment?: ReportEquipmentItem[];
  documents_check?: ReportDocumentItem[];
  tires?: ReportTire[];
  generated_at?: string;
}

// ─── Section nav ──────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: 'expertise', label: 'Pojazd' },
  { id: 'eurotax',   label: 'Eurotax' },
  { id: 'uszkodzenia', label: 'Uszkodzenia' },
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function KosztorysDealPage({ params }: { params: { dealId: string } }) {
  const { dealId } = params;
  const [kosztorys, setKosztorys] = useState<KosztorysData | null>(null);
  const [report, setReport]       = useState<ReportData | null>(null);
  const [costs, setCosts]         = useState<MacadamData | null>(null);
  const [kosztorysErr, setKErr]   = useState<{ status: number; msg: string } | null>(null);
  const [reportErr, setRErr]      = useState<{ status: number; msg: string } | null>(null);
  const [loadingK, setLoadingK]   = useState(true);
  const [loadingR, setLoadingR]   = useState(true);
  const [lightbox, setLightbox]   = useState<{ photos: string[]; start: number } | null>(null);
  const [heroIdx, setHeroIdx]     = useState(0);

  useEffect(() => {
    fetch(`/api/kosztorys/${dealId}`)
      .then(async r => {
        if (!r.ok) { setKErr({ status: r.status, msg: await r.text() }); return null; }
        return r.json() as Promise<KosztorysData>;
      })
      .catch(e => { setKErr({ status: 0, msg: String(e) }); return null; })
      .then(k => { setKosztorys(k); setLoadingK(false); });

    fetch(`/api/report/${dealId}`)
      .then(async r => {
        if (!r.ok) { setRErr({ status: r.status, msg: await r.text() }); return null; }
        return r.json() as Promise<ReportData>;
      })
      .catch(e => { setRErr({ status: 0, msg: String(e) }); return null; })
      .then(r => { setReport(r); setLoadingR(false); });

    // Above-norm damage costs — saved DB layer. Failure is non-fatal:
    // section just doesn't render if no costs were saved for this deal.
    fetch(`/api/kosztorys-costs/${dealId}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(c => {
        if (c && typeof c === 'object' && Array.isArray(c.parts)) {
          setCosts(c as MacadamData);
        }
      })
      .catch(() => { /* non-fatal */ });
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

  const loading = loadingK || loadingR;

  // Both failed → error page
  if (!loading && !kosztorys && !report) {
    return <ErrorPage dealId={dealId} kErr={kosztorysErr} rErr={reportErr} />;
  }

  // Show full skeleton only when BOTH are still loading
  if (loadingK && loadingR) return <SkeletonPage />;

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
        <div className="nav-outer">
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

      <div className="page-container">

        {/* Banner: Eurotax loading or not available */}
        {!hasEurotax && (
          loadingK ? (
            <div style={{
              margin: '0 0 20px', padding: '14px 18px', borderRadius: 10,
              background: '#EFF6FF', border: '1px solid #BFDBFE',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <i className="fas fa-spinner fa-spin" style={{ color: '#1E40AF', fontSize: 18 }} />
              <div style={{ fontSize: 13, color: '#1E40AF' }}>
                <strong>Ładowanie danych Eurotax…</strong>
              </div>
            </div>
          ) : (
            <div style={{
              margin: '0 0 20px', padding: '14px 18px', borderRadius: 10,
              background: '#FEF3C7', border: '1px solid #FBBF24',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <i className="fas fa-info-circle" style={{ color: '#92400E', fontSize: 18 }} />
              <div style={{ fontSize: 13, color: '#92400E' }}>
                <strong>Eurotax PDF jeszcze nie został przesłany dla tego zlecenia.</strong>
                {' '}Sekcje kosztów, części i podsumowania będą widoczne po przesłaniu PDF do Bitrix24.
              </div>
            </div>
          )
        )}

        {/* ═══ EXPERTISE — vehicle header ═══════════════════════════════ */}
        <section id="expertise" className="kosz-card">
          <div style={{
            display: 'inline-block', background: COLORS.primary, color: '#fff',
            padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 700,
            letterSpacing: 1, textTransform: 'uppercase', marginBottom: 20,
          }}>
            Ekspertyza{hasEurotax ? ' — Eurotax' : ''}
          </div>

          <div className="expertise-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 0.85fr)', gap: 40 }}>
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

        {/* ═══ USZKODZENIA — clean view (above-norm + acceptable) ════════════
            Sits BEFORE the Eurotax raw-detail block so readers see the
            actionable cost view first; the Eurotax tables with times +
            operations follow at the end of the report. */}
        {costs?.parts && costs.parts.length > 0 && (() => {
          const aboveNorm = costs.parts.filter(p => p.qualification !== 'akceptowalne');
          const accept    = costs.parts.filter(p => p.qualification === 'akceptowalne');
          const monoNum: React.CSSProperties = {
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontVariantNumeric: 'tabular-nums',
          };
          const sumNetto  = costs.totals?.netto_pln
            ?? aboveNorm.reduce((s, p) => s + (p.koszt_netto_pln ?? 0), 0);
          const sumGross  = costs.totals?.gross_pln ?? sumNetto * 1.23;
          const sumVat    = sumGross - sumNetto;
          const onPhoto   = (photos: string[], start: number) => setLightbox({ photos, start });

          return (
            <section id="uszkodzenia" className="kosz-card">
              <div className="section-title">USZKODZENIA</div>

              {aboveNorm.length > 0 && (
                <>
                  <h3 style={{
                    fontSize: 14, fontWeight: 700, color: COLORS.text,
                    textTransform: 'uppercase', letterSpacing: 0.6,
                    margin: '0 0 16px',
                  }}>
                    Uszkodzenia ponadnormatywne
                  </h3>
                  {aboveNorm.map((p, i) => (
                    <DamageCard
                      key={p.id}
                      part={p}
                      isLast={i === aboveNorm.length - 1}
                      onPhotoClick={onPhoto}
                    />
                  ))}

                  {/* Cost summary — netto + VAT 23% + brutto */}
                  <div style={{
                    marginTop: 28,
                    padding: '20px 24px',
                    borderRadius: 12,
                    background: COLORS.mutedLt,
                    border: `1px solid ${COLORS.borderLt}`,
                  }}>
                    <div style={{
                      fontSize: 11, color: COLORS.muted, fontWeight: 700,
                      letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12,
                    }}>
                      Podsumowanie kosztów napraw
                    </div>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      padding: '8px 0', borderBottom: `1px solid ${COLORS.borderLt}`,
                    }}>
                      <span style={{ color: COLORS.muted, fontSize: 14 }}>Suma netto</span>
                      <span style={{ fontWeight: 700, fontSize: 15, ...monoNum }}>{fmtPLN(sumNetto)}</span>
                    </div>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      padding: '8px 0', borderBottom: `1px solid ${COLORS.borderLt}`,
                    }}>
                      <span style={{ color: COLORS.muted, fontSize: 14 }}>VAT 23%</span>
                      <span style={{ fontWeight: 700, fontSize: 15, ...monoNum }}>{fmtPLN(sumVat)}</span>
                    </div>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'baseline', padding: '12px 0 0',
                    }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.text }}>
                        Suma brutto
                      </span>
                      <span style={{ fontSize: 19, fontWeight: 800, color: COLORS.green, ...monoNum }}>
                        {fmtPLN(sumGross)}
                      </span>
                    </div>
                  </div>
                </>
              )}

              {accept.length > 0 && (
                <>
                  <h3 style={{
                    fontSize: 14, fontWeight: 700, color: COLORS.text,
                    textTransform: 'uppercase', letterSpacing: 0.6,
                    margin: aboveNorm.length > 0 ? '40px 0 16px' : '0 0 16px',
                  }}>
                    Uszkodzenia akceptowalne{' '}
                    <span style={{
                      fontSize: 11, color: COLORS.muted, fontWeight: 500,
                      textTransform: 'none', letterSpacing: 0,
                    }}>
                      (bez kosztu)
                    </span>
                  </h3>
                  {accept.map((p, i) => (
                    <AcceptableRow
                      key={p.id}
                      part={p}
                      isLast={i === accept.length - 1}
                      onPhotoClick={onPhoto}
                    />
                  ))}
                </>
              )}
            </section>
          );
        })()}

        {/* ═══ EUROTAX KOSZTORYS — raw operations, times, materials (detail) ═ */}
        {hasEurotax && (
          <>
            <section id="eurotax" className="kosz-card">
              <div className="section-title">EUROTAX — KOSZTORYS NAPRAW</div>

              <BlachSectionTable title="Blacharz"      section={kosztorys.sections.blacharz} />
              <BlachSectionTable title="Pr.dodatkowe"  section={kosztorys.sections.pr_dodatkowe} />
              <LakierSectionTable title="Lakiernik"    section={kosztorys.sections.lakiernik} />
            </section>

            {/* ═══ SUMMARY ════════════════════════════════════════════════ */}
            <section id="summary" className="kosz-card">
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

              {/* VAT breakdown — equal-height cards, grand-total emphasized */}
              <div className="summary-cards">
                <div className="summary-card">
                  <div className="label">KOSZT BEZ VAT</div>
                  <div className="value">{fmtPLN(kosztorys.summary?.subtotal_no_vat)}</div>
                </div>
                <div className="summary-card">
                  <div className="label">VAT ({fmtPct(kosztorys.summary?.vat_pct)})</div>
                  <div className="value">{fmtPLN(kosztorys.summary?.vat_amount)}</div>
                </div>
                <div className="summary-card grand-total">
                  <div className="label">KOSZT Z VAT</div>
                  <div className="value">{fmtPLN(kosztorys.summary?.total_with_vat_pln)}</div>
                  {kosztorys.summary?.total_eur !== null && (
                    <div className="sub">≈ {fmtEUR(kosztorys.summary?.total_eur)}</div>
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
                <section id="parts" className="kosz-card">
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
                <section id="equipment" className="kosz-card">
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
                <section className="kosz-card">
                  <div className="section-title">WYPOSAŻENIE — INSPEKCJA</div>
                  <div className="equip-grid" style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10,
                  }}>
                    {report.equipment.map((item, i) => {
                      const label = item.present ? 'Tak' : 'Nie';
                      const clr = item.present ? COLORS.green : COLORS.muted;
                      return (
                        <div key={i} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '10px 14px', borderRadius: 8, background: COLORS.mutedLt,
                          border: `1px solid ${COLORS.borderLt}`,
                        }}>
                          <span style={{ color: COLORS.muted, fontSize: 13, fontWeight: 500 }}>{item.name}</span>
                          <span style={{ fontWeight: 700, fontSize: 13, color: clr }}>{label}</span>
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
                <section className="kosz-card">
                  <div className="section-title">OPONY</div>
                  <div className="table-scroll tires-card-stack">
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
                        {report.tires.map((t, i) => {
                          const treadStr =
                            t.treadDepth === null || t.treadDepth === undefined || t.treadDepth === ''
                              ? '—'
                              : `${t.treadDepth} mm`;
                          const brand = (t.brand ?? '').toString().trim();
                          const model = (t.model ?? '').toString().trim();
                          const producerModel = brand && model
                            ? `${brand} / ${model}`
                            : (brand || model || '—');
                          return (
                            <tr key={i}>
                              <td data-label="Pozycja">{t.position ?? `${i + 1}`}</td>
                              <td data-label="Bieżnik" style={{ color: COLORS.green, fontWeight: 600 }}>
                                {treadStr}
                              </td>
                              <td data-label="Producent / Model">{producerModel}</td>
                              <td data-label="Wymiary" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                                {t.size ?? ''}
                              </td>
                              <td data-label="Sezon">{t.season ?? '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}

            {/* Documents */}
            {(report?.documents_check && report.documents_check.length > 0) && (
              <>
                <section className="kosz-card">
                  <div className="section-title">WYKAZ DOKUMENTÓW</div>
                  <div className="docs-grid" style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12,
                  }}>
                    {report.documents_check.map((doc, i) => {
                      const clr = doc.status_type === 'green' ? COLORS.green
                                : doc.status_type === 'red'   ? COLORS.red
                                : COLORS.text;
                      return (
                        <div key={i} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '12px 16px', borderRadius: 10, background: COLORS.mutedLt,
                          border: `1px solid ${COLORS.borderLt}`,
                        }}>
                          <span style={{ color: COLORS.muted, fontSize: 13, fontWeight: 500 }}>{doc.name}</span>
                          <span style={{ fontWeight: 700, fontSize: 13, color: clr }}>{doc.status}</span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </>
            )}

            {/* Inspection photos grid */}
            {allInspPhotos.length > 0 && (
              <>
                <section id="inspection-photos" className="kosz-card">
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
            <section className="kosz-card">
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
          padding: '28px 48px', background: COLORS.navy, color: '#9CA3AF', fontSize: 12,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderRadius: 12,
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

// ─── Damage card label/value row helper ──────────────────────────────────────

function DamageRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        padding: '10px 0',
        borderBottom: `1px solid ${COLORS.borderLt}`,
        gap: 16,
      }}
    >
      <span style={{ fontSize: 13, color: COLORS.muted }}>{label}</span>
      <span style={{ fontSize: 14, color: COLORS.text, textAlign: 'right', overflowWrap: 'anywhere' }}>
        {value}
      </span>
    </div>
  );
}

// ─── Damage cards — above-norm (full) and acceptable (simple) ────────────────

function DamageCard({
  part,
  isLast,
  onPhotoClick,
}: {
  part: MacadamPart;
  isLast: boolean;
  onPhotoClick: (photos: string[], start: number) => void;
}) {
  const monoNum: React.CSSProperties = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontVariantNumeric: 'tabular-nums',
  };
  return (
    <div
      className="kosz-damage-card"
      style={{
        display: 'flex',
        gap: 24,
        padding: '20px 0',
        borderBottom: isLast ? 'none' : `1px solid ${COLORS.borderLt}`,
        alignItems: 'flex-start',
      }}
    >
      {part.photos.length > 0 && (
        <div style={{ flex: '1 1 0', maxWidth: '45%', minWidth: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
            {part.photos.map((src, pi) => (
              <div
                key={`${part.id}-${pi}`}
                onClick={() => onPhotoClick(part.photos, pi)}
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onPhotoClick(part.photos, pi);
                  }
                }}
                style={{
                  aspectRatio: '4 / 3',
                  cursor: 'pointer',
                  borderRadius: 6,
                  overflow: 'hidden',
                  background: COLORS.mutedLt,
                  border: `1px solid ${COLORS.borderLt}`,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt=""
                  loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ flex: '1 1 0', minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.text, marginBottom: 12 }}>
          {part.index} | {part.czesc}
        </div>
        <DamageRow label="Typ uszkodzenia" value={part.typ || '—'} />
        <DamageRow label="Tryb naprawy" value={part.tryb_naprawy || '—'} />
        <DamageRow
          label="Koszty naprawy"
          value={<span style={monoNum}>{fmtPLN(part.koszty_naprawy_pln)}</span>}
        />
        <DamageRow
          label="Koszt amortyzacji"
          value={<span style={monoNum}>{fmtPLN(part.koszt_amortyzacji_pln)}</span>}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            padding: '14px 0 0',
            gap: 16,
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.text }}>
            KOSZT NETTO{' '}
            <span style={{ fontSize: 11, fontWeight: 400, color: COLORS.muted }}>
              (bez VAT)
            </span>
          </span>
          <span style={{ ...monoNum, fontSize: 17, fontWeight: 700, color: COLORS.green }}>
            {fmtPLN(part.koszt_netto_pln)}
          </span>
        </div>
      </div>
    </div>
  );
}

function AcceptableRow({
  part,
  isLast,
  onPhotoClick,
}: {
  part: MacadamPart;
  isLast: boolean;
  onPhotoClick: (photos: string[], start: number) => void;
}) {
  return (
    <div
      className="kosz-acceptable-row"
      style={{
        display: 'flex',
        gap: 16,
        padding: '14px 0',
        borderBottom: isLast ? 'none' : `1px solid ${COLORS.borderLt}`,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      {part.photos.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {part.photos.slice(0, 4).map((src, pi) => (
            <div
              key={`${part.id}-${pi}`}
              onClick={() => onPhotoClick(part.photos, pi)}
              role="button"
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onPhotoClick(part.photos, pi);
                }
              }}
              style={{
                width: 64,
                height: 48,
                cursor: 'pointer',
                borderRadius: 5,
                overflow: 'hidden',
                background: COLORS.mutedLt,
                border: `1px solid ${COLORS.borderLt}`,
                flexShrink: 0,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                loading="lazy"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </div>
          ))}
          {part.photos.length > 4 && (
            <span style={{ alignSelf: 'center', fontSize: 11, color: COLORS.muted, marginLeft: 4 }}>
              +{part.photos.length - 4}
            </span>
          )}
        </div>
      )}
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>
          {part.index} | {part.czesc}
        </div>
        {part.typ && (
          <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>
            {part.typ}
          </div>
        )}
      </div>
      <span
        style={{
          background: COLORS.mutedLt,
          color: COLORS.muted,
          border: `1px solid ${COLORS.borderLt}`,
          borderRadius: 999,
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          flexShrink: 0,
        }}
      >
        Bez kosztu
      </span>
    </div>
  );
}

// ─── Skeleton + error pages ───────────────────────────────────────────────────

function SkeletonPage() {
  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: 32 }}>
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

  /* Page container — wide premium feel; cards float on canvas */
  .page-container { max-width:1400px; margin:0 auto; padding:24px 24px 48px;
    background:transparent; min-height:100vh; color:#1D1D1F; overflow:hidden; width:100%; }

  /* Sticky nav inner width matches page */
  .nav-outer { max-width:1400px; margin:0 auto; padding:0 24px;
    display:flex; align-items:center; justify-content:space-between; gap:16px; }
  .nav-link { color:#6B7280; text-decoration:none; font-size:13px; font-weight:600;
    padding:8px 0; border-bottom:2px solid transparent; transition:all 0.2s; white-space:nowrap; cursor:pointer; }
  .nav-link:hover { color:#1D1D1F; border-bottom-color:#B71C1C; }

  /* Card pattern — matches /report/[dealId] design language */
  .kosz-card { background:#fff; border:1px solid #E8E8ED; border-radius:12px;
    box-shadow:0 1px 3px rgba(0,0,0,0.04); padding:40px 56px; margin-bottom:24px; }

  /* Section title */
  .section-title { font-size:24px; font-weight:800; color:#1D1D1F; margin:0 0 24px;
    text-transform:uppercase; letter-spacing:0.5px; padding-bottom:12px;
    border-bottom:3px solid #B71C1C; display:inline-block; }

  /* Data tables */
  table.data-table { width:100%; border-collapse:collapse; font-size:13px; }
  table.data-table th { text-align:left; padding:11px 14px; background:#F9FAFB; color:#6B7280;
    font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:0.5px;
    border-bottom:2px solid #E5E7EB; }
  table.data-table td { padding:11px 14px; border-bottom:1px solid #F3F4F6; vertical-align:top; color:#374151; }
  table.data-table tr:hover td { background:#FAFAFA; }
  table.data-table .total-row td { font-weight:700; border-top:2px solid #E5E7EB; background:#F9FAFB; }
  .amt { text-align:right; font-variant-numeric:tabular-nums; color:#1D1D1F; }

  /* Horizontal scroll with visible affordance */
  .table-scroll { overflow-x:auto; -webkit-overflow-scrolling:touch; scrollbar-width:thin; }
  .table-scroll::-webkit-scrollbar { height:6px; }
  .table-scroll::-webkit-scrollbar-thumb { background:#D1D5DB; border-radius:3px; }
  .table-scroll::-webkit-scrollbar-track { background:#F3F4F6; border-radius:3px; }
  .table-scroll table { min-width:520px; }

  /* Vehicle row */
  .veh-row { display:flex; justify-content:space-between; align-items:flex-start; gap:16px;
    padding:11px 0; border-bottom:1px solid #F3F4F6; }
  .veh-label { color:#4B5563; font-weight:600; font-size:14px; flex-shrink:0; }
  .veh-value { font-weight:700; font-size:15px; text-align:right; overflow-wrap:anywhere;
    word-break:break-word; min-width:0; color:#1D1D1F; }

  /* Hero thumbs + photo tile */
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

  /* Summary cards — equal-height 3-col with emphasized grand total */
  .summary-cards { display:grid; grid-template-columns:repeat(3,minmax(0,1fr));
    gap:20px; align-items:stretch; margin-top:24px; }
  .summary-card { background:#F9FAFB; border:1px solid #F3F4F6; border-radius:14px;
    padding:22px 24px; display:flex; flex-direction:column; justify-content:space-between; gap:8px; }
  .summary-card .label { font-size:11px; color:#6B7280; font-weight:700;
    letter-spacing:0.4px; text-transform:uppercase; }
  .summary-card .value { font-size:22px; font-weight:800; color:#1D1D1F; }
  .summary-card.grand-total { background:linear-gradient(135deg,#F0FDF4 0%,#fff 100%);
    border:2px solid #BBF7D0; border-radius:16px;
    box-shadow:0 4px 20px rgba(22,163,74,0.10); }
  .summary-card.grand-total .label { color:#16A34A; }
  .summary-card.grand-total .value { font-size:26px; font-weight:900; color:#16A34A; }
  .summary-card.grand-total .sub { font-size:12px; color:#6B7280; }

  /* Inspection photos: 5 cols on wide */
  @media (min-width:1280px) {
    .photos-grid { grid-template-columns:repeat(5,1fr) !important; }
  }

  /* Very wide screens */
  @media (min-width:1600px) {
    .page-container { max-width:1500px; padding:28px 28px 56px; }
    .nav-outer { max-width:1500px; }
  }

  /* Tablet / mobile */
  @media (max-width:768px) {
    .page-container { padding:12px 12px 24px; }
    .kosz-card { padding:28px 20px; margin-bottom:16px; border-radius:10px; }
    .section-title { font-size:19px; margin-bottom:18px; }
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
    .summary-cards { grid-template-columns:1fr !important; gap:14px !important; }
    .summary-card { padding:18px 20px; border-radius:12px; }
    .summary-card .value { font-size:20px; }
    .summary-card.grand-total .value { font-size:23px; }
    .footer-bar { flex-direction:column !important; gap:8px !important;
      text-align:center !important; padding:24px 20px !important; }
    .table-scroll table { min-width:500px; }
    .thumb-grid { grid-template-columns:repeat(3,1fr) !important; }
    .veh-row { padding:8px 0; }
    .veh-label { font-size:13px; }
    .veh-value { font-size:13px; }
    .hero-main { border-radius:10px !important; }
  }

  /* Tires table → card-stack at ≤640px (data-label driven) */
  @media (max-width:640px) {
    .tires-card-stack { overflow:visible !important; }
    .tires-card-stack table { min-width:0 !important; }
    .tires-card-stack table thead { display:none; }
    .tires-card-stack table, .tires-card-stack tbody,
    .tires-card-stack tr, .tires-card-stack td { display:block; width:100%; }
    .tires-card-stack tr { border:1px solid #E5E7EB; border-radius:10px;
      padding:12px 14px; margin-bottom:12px; background:#FCFCFD; }
    .tires-card-stack tr:hover td { background:transparent; }
    .tires-card-stack td { border:none !important; padding:6px 0 !important;
      display:flex !important; justify-content:space-between; align-items:center;
      gap:12px; text-align:left !important; }
    .tires-card-stack td::before { content:attr(data-label);
      font-weight:700; color:#6B7280; text-transform:uppercase;
      font-size:10px; letter-spacing:0.5px; flex-shrink:0; }
  }

  @media (max-width:480px) {
    .nav-link { font-size:10px !important; }
    .photos-grid { grid-template-columns:repeat(2,1fr) !important; }
    .table-scroll table { min-width:420px; }
    .veh-value { font-size:12px; }
  }

  /* Print */
  @media print {
    .no-print { display:none !important; }
    body { background:#fff; }
    .page-container { box-shadow:none !important; max-width:100% !important; padding:0 !important; }
    section { page-break-inside:avoid; }
    .kosz-card { box-shadow:none !important; border:1px solid #E5E7EB !important;
      padding:20px 24px !important; margin-bottom:12px !important; border-radius:0 !important; }
    .section-title { page-break-after:avoid; }
    table { page-break-inside:auto; }
    tr { page-break-inside:avoid; page-break-after:auto; }
    .photo-tile, .hero-thumb { break-inside:avoid; }
    .summary-card.grand-total { box-shadow:none !important; }
    * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
  }
`;
