'use client';
import React, { useMemo, useState } from 'react';
import { Lightbox } from '@/app/kosztorys/_components/Lightbox';
import { COLORS, fmtNum } from '@/app/kosztorys/_components/styles';
import { PrzegladKosztow } from './_components/PrzegladKosztow';
import { PartCard } from './_components/PartCard';
import { DEMO_MACADAM } from './_demo';
import type { MacadamTotals } from '@/types/kosztorysMacadam';

/**
 * Macadam-style Kosztorys report — Phase 1 MVP renders DEMO_MACADAM.
 * Backend wiring (XML / manual entry / PDF parser) is TBD. The data
 * contract lives in @/types/kosztorysMacadam so a switch to live data
 * is a one-spot swap (DEMO_MACADAM → fetched MacadamData).
 *
 * Does NOT touch the existing /kosztorys/[dealId] Eurotax page.
 */
export default function MacadamKosztorysPage({
  params,
}: {
  params: { dealId: string };
}) {
  const { dealId } = params;
  const data = DEMO_MACADAM;

  const [lb, setLb] = useState<{ photos: string[]; start: number } | null>(null);
  const [bannerOpen, setBannerOpen] = useState(true);

  const totals: MacadamTotals = useMemo(() => {
    if (data.totals) return data.totals;
    return data.parts.reduce<MacadamTotals>(
      (acc, p) => ({
        koszty_naprawy_pln: acc.koszty_naprawy_pln + (p.koszty_naprawy_pln ?? 0),
        amortyzacja_pln:    acc.amortyzacja_pln    + (p.koszt_amortyzacji_pln ?? 0),
        netto_pln:          acc.netto_pln          + (p.koszt_netto_pln ?? 0),
      }),
      { koszty_naprawy_pln: 0, amortyzacja_pln: 0, netto_pln: 0 }
    );
  }, [data]);

  const interior = useMemo(
    () => data.parts.filter(p => p.location === 'interior'),
    [data]
  );
  const exterior = useMemo(
    () => data.parts.filter(p => p.location === 'exterior'),
    [data]
  );

  const onPhotoClick = (photos: string[], idx: number) =>
    setLb({ photos, start: idx });

  const veh = data.vehicle;
  const heroUrl = veh.main_photo_url;
  const mileageStr =
    veh.mileage_km !== null ? `${fmtNum(veh.mileage_km, 0)} km` : '—';

  return (
    <div
      style={{
        background: COLORS.bg,
        minHeight: '100vh',
        color: COLORS.text,
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
      />
      <style dangerouslySetInnerHTML={{ __html: MAC_CSS }} />

      {/* Demo banner */}
      {bannerOpen && (
        <div
          className="no-print"
          style={{
            background: '#FEF3C7',
            color: '#92400E',
            padding: '10px 16px',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            justifyContent: 'center',
          }}
        >
          <span>
            <strong>Demo data</strong> — backend wiring TBD (dealId: {dealId})
          </span>
          <button
            type="button"
            onClick={() => setBannerOpen(false)}
            aria-label="Zamknij banner"
            style={{
              border: 'none',
              background: 'transparent',
              color: '#92400E',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 16,
              padding: '0 6px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Sticky nav */}
      <nav
        className="no-print mac-nav"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: '#fff',
          borderBottom: `1px solid ${COLORS.border}`,
          padding: '12px 24px',
        }}
      >
        <div
          className="mac-nav-inner"
          style={{
            maxWidth: 1400,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: COLORS.primary,
                letterSpacing: 0.5,
              }}
            >
              ZAUFAJ RZECZOZNAWCY
            </span>
            <span style={{ fontSize: 11, color: COLORS.muted }}>
              Raport oceny
            </span>
          </div>
          <div className="mac-nav-links" style={{ display: 'flex', gap: 24 }}>
            <a href="#pojazd" className="mac-link">Pojazd</a>
            <a href="#przeglad" className="mac-link">Przegląd kosztów</a>
            <a href="#uszkodzenia" className="mac-link">Uszkodzenia</a>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="mac-print-btn"
            style={{
              border: `1.5px solid ${COLORS.green}`,
              color: COLORS.green,
              background: 'transparent',
              padding: '6px 16px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Drukuj
          </button>
        </div>
      </nav>

      {/* Main container */}
      <main
        className="mac-container"
        style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}
      >
        {/* Vehicle header */}
        <section id="pojazd">
          <span
            style={{
              display: 'inline-block',
              background: COLORS.green,
              color: '#fff',
              padding: '6px 14px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            Ekspertyza
          </span>

          <div
            className="mac-vehicle-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: '1.1fr 0.9fr',
              gap: 32,
              marginBottom: 24,
            }}
          >
            <div>
              {heroUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={heroUrl}
                  alt={veh.make_model}
                  onClick={() => onPhotoClick([heroUrl], 0)}
                  style={{
                    width: '100%',
                    aspectRatio: '4 / 3',
                    objectFit: 'cover',
                    borderRadius: 12,
                    cursor: 'pointer',
                    display: 'block',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    aspectRatio: '4 / 3',
                    borderRadius: 12,
                    background: COLORS.mutedLt,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: COLORS.muted,
                  }}
                >
                  Brak zdjęcia
                </div>
              )}
            </div>

            <div>
              <h1
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: COLORS.text,
                  margin: 0,
                }}
              >
                {veh.make_model}
              </h1>
              <div
                style={{
                  fontSize: 18,
                  color: COLORS.muted,
                  marginBottom: 24,
                }}
              >
                {veh.variant}
              </div>

              <InfoRows
                rows={[
                  ['VIN',                  veh.vin],
                  ['Rejestracja',          veh.registration_plate],
                  ['Grupa',                veh.grupa],
                  ['Przebieg',             mileageStr],
                  ['Pierwsza rejestracja', veh.first_registration],
                  ['Kolor nadwozia',       veh.body_colour],
                  ['Klient',               veh.klient],
                  ['Data ekspertyzy',      veh.inspection_date],
                  ['Adres inspekcji',      veh.inspection_address],
                ]}
              />
            </div>
          </div>
        </section>

        {/* Przegląd kosztów */}
        <section id="przeglad" style={{ marginTop: 64 }}>
          <PrzegladKosztow parts={data.parts} totals={totals} />
        </section>

        {/* Uszkodzenia */}
        <section id="uszkodzenia" style={{ marginTop: 64 }}>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: COLORS.text,
              textTransform: 'uppercase',
              margin: '0 0 24px',
              letterSpacing: 0.5,
            }}
          >
            USZKODZENIA
          </h2>

          {interior.length > 0 && (
            <>
              <h3
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: COLORS.text,
                  margin: '16px 0',
                }}
              >
                Wnętrze
              </h3>
              {interior.map(p => (
                <PartCard key={p.id} part={p} onPhotoClick={onPhotoClick} />
              ))}
            </>
          )}

          {exterior.length > 0 && (
            <>
              <h3
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: COLORS.text,
                  margin: '16px 0',
                }}
              >
                Zewnętrze
              </h3>
              {exterior.map(p => (
                <PartCard key={p.id} part={p} onPhotoClick={onPhotoClick} />
              ))}
            </>
          )}
        </section>
      </main>

      {lb && (
        <Lightbox
          photos={lb.photos}
          start={lb.start}
          onClose={() => setLb(null)}
        />
      )}
    </div>
  );
}

function InfoRows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div>
      {rows.map(([k, v]) => (
        <div
          key={k}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            padding: '10px 0',
            borderBottom: `1px solid ${COLORS.borderLt}`,
            gap: 16,
          }}
        >
          <span style={{ fontSize: 13, color: COLORS.muted }}>{k}</span>
          <span
            style={{
              fontSize: 14,
              color: COLORS.text,
              fontWeight: 700,
              textAlign: 'right',
              overflowWrap: 'anywhere',
            }}
          >
            {v}
          </span>
        </div>
      ))}
    </div>
  );
}

const MAC_CSS = `
  .mac-link { color: #6B7280; text-decoration: none; font-size: 13px;
    transition: color 0.15s; }
  .mac-link:hover { color: #1D1D1F; }

  @media (min-width: 1600px) {
    .mac-container, .mac-nav-inner { max-width: 1500px !important; }
  }

  @media (max-width: 768px) {
    .mac-container { padding: 16px !important; }
    .mac-nav { padding: 10px 16px !important; }
    .mac-nav-inner { flex-wrap: wrap; gap: 12px !important; }
    .mac-nav-links { width: 100%; justify-content: center; gap: 16px !important; }
    .mac-vehicle-grid { grid-template-columns: 1fr !important; gap: 20px !important; }
  }

  @media (max-width: 640px) {
    .mac-part-card { flex-direction: column !important; gap: 16px !important; }
    .mac-part-photos { max-width: 100% !important; }
  }

  @media print {
    .no-print { display: none !important; }
    body { background: #fff !important; }
    section { page-break-inside: avoid; }
    * { -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important; }
  }
`;
