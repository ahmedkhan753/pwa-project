'use client';
import React from 'react';
import { COLORS, fmtPLN } from '@/app/kosztorys/_components/styles';
import type { MacadamPart } from '@/types/kosztorysMacadam';

/**
 * Per-damage detail card. Photos grid on the left, label/value rows
 * on the right with KOSZT NETTO emphasized in COLORS.green. Lightbox
 * state is lifted to the parent — clicking a photo calls onPhotoClick.
 *
 * Responsive: stacks at ≤640px via the .mac-part-* classes scoped in
 * the page's <style> block.
 */
export function PartCard({
  part,
  onPhotoClick,
}: {
  part: MacadamPart;
  onPhotoClick: (photos: string[], idx: number) => void;
}) {
  const monoNum: React.CSSProperties = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontVariantNumeric: 'tabular-nums',
  };

  const labelRow = (label: string, value: React.ReactNode) => (
    <div
      key={label}
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
      <span style={{ fontSize: 14, color: COLORS.text, textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );

  return (
    <div
      className="mac-part-card"
      style={{
        display: 'flex',
        gap: 32,
        padding: '24px 0',
        borderBottom: `1px solid ${COLORS.borderLt}`,
        alignItems: 'flex-start',
      }}
    >
      {part.photos.length > 0 && (
        <div
          className="mac-part-photos"
          style={{ flex: '1 1 0', maxWidth: '50%', minWidth: 0 }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 8,
            }}
          >
            {part.photos.map((src, i) => (
              <div
                key={i}
                onClick={() => onPhotoClick(part.photos, i)}
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onPhotoClick(part.photos, i);
                  }
                }}
                style={{
                  aspectRatio: '4 / 3',
                  cursor: 'pointer',
                  borderRadius: 6,
                  overflow: 'hidden',
                  background: COLORS.mutedLt,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt=""
                  loading="lazy"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        className="mac-part-fields"
        style={{ flex: '1 1 0', minWidth: 0 }}
      >
        <div
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: COLORS.text,
            marginBottom: 16,
          }}
        >
          {part.index} | {part.czesc}
        </div>

        {labelRow('Typ uszkodzenia', part.typ)}
        {labelRow('Tryb naprawy', part.tryb_naprawy)}
        {labelRow(
          'Koszty naprawy',
          <span style={monoNum}>{fmtPLN(part.koszty_naprawy_pln)}</span>
        )}
        {labelRow(
          'Koszt amortyzacji',
          <span style={monoNum}>{fmtPLN(part.koszt_amortyzacji_pln)}</span>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            padding: '14px 0 0',
            gap: 16,
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 700, color: COLORS.text }}>
            KOSZT NETTO{' '}
            <span style={{ fontSize: 11, fontWeight: 400, color: COLORS.muted }}>
              (bez VAT)
            </span>
          </span>
          <span
            style={{
              ...monoNum,
              fontSize: 18,
              fontWeight: 700,
              color: COLORS.green,
            }}
          >
            {fmtPLN(part.koszt_netto_pln)}
          </span>
        </div>
      </div>
    </div>
  );
}
