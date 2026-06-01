'use client';
import React from 'react';
import { COLORS, fmtPLN } from '@/app/kosztorys/_components/styles';
import type { MacadamPart, MacadamTotals } from '@/types/kosztorysMacadam';

/**
 * Macadam-style summary table — one row per part sorted by koszt_netto
 * DESC (nulls last), totals row at the bottom in COLORS.green.
 */
export function PrzegladKosztow({
  parts,
  totals,
}: {
  parts: MacadamPart[];
  totals: MacadamTotals;
}) {
  const sorted = [...parts].sort((a, b) => {
    const av = a.koszt_netto_pln;
    const bv = b.koszt_netto_pln;
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return bv - av;
  });

  const monoNum: React.CSSProperties = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontVariantNumeric: 'tabular-nums',
  };

  const th: React.CSSProperties = {
    padding: '12px 8px',
    textAlign: 'left',
    fontSize: 11,
    textTransform: 'uppercase',
    color: COLORS.muted,
    letterSpacing: 0.5,
    fontWeight: 600,
    borderBottom: `1px solid ${COLORS.border}`,
  };
  const thRight: React.CSSProperties = { ...th, textAlign: 'right' };
  const td: React.CSSProperties = {
    padding: '14px 8px',
    fontSize: 14,
    color: COLORS.text,
    borderBottom: `1px solid ${COLORS.borderLt}`,
    verticalAlign: 'top',
  };
  const tdRight: React.CSSProperties = { ...td, textAlign: 'right', ...monoNum };
  const totalCell: React.CSSProperties = {
    padding: '14px 8px',
    borderTop: `2px solid ${COLORS.border}`,
  };
  const totalCellRight: React.CSSProperties = {
    ...totalCell,
    textAlign: 'right',
    fontWeight: 700,
    fontSize: 16,
    color: COLORS.green,
    ...monoNum,
  };

  return (
    <div>
      <h2
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: COLORS.text,
          textTransform: 'uppercase',
          margin: '0 0 24px',
          letterSpacing: 0.5,
        }}
      >
        PRZEGLĄD KOSZTÓW
      </h2>

      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            minWidth: 700,
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
          }}
        >
          <thead>
            <tr>
              <th style={{ ...th, width: '22%' }}>Część</th>
              <th style={{ ...th, width: '18%' }}>Typ uszkodzenia</th>
              <th style={{ ...th, width: '24%' }}>Tryb naprawy</th>
              <th style={{ ...thRight, width: '12%' }}>Koszty naprawy</th>
              <th style={{ ...thRight, width: '12%' }}>Koszt amortyzacji</th>
              <th style={{ ...thRight, width: '12%' }}>Koszt netto</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => (
              <tr key={p.id}>
                <td style={{ ...td, fontWeight: 700 }}>
                  {p.index} | {p.czesc}
                </td>
                <td style={td}>{p.typ}</td>
                <td style={td}>{p.tryb_naprawy}</td>
                <td style={tdRight}>{fmtPLN(p.koszty_naprawy_pln)}</td>
                <td style={tdRight}>{fmtPLN(p.koszt_amortyzacji_pln)}</td>
                <td style={tdRight}>{fmtPLN(p.koszt_netto_pln)}</td>
              </tr>
            ))}
            <tr>
              <td style={totalCell} />
              <td style={totalCell} />
              <td style={totalCell} />
              <td style={totalCellRight}>{fmtPLN(totals.koszty_naprawy_pln)}</td>
              <td style={totalCellRight}>{fmtPLN(totals.amortyzacja_pln)}</td>
              <td style={totalCellRight}>{fmtPLN(totals.netto_pln)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
