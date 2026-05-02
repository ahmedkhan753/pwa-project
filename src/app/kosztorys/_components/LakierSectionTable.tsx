'use client';
import React from 'react';
import type { LakierSection } from '@/types/kosztorys';
import { COLORS, fmtPLN, fmtNum } from './styles';

/**
 * Renders the Lakiernik section. Different column layout than Blacharz —
 * no code, no Potrącenia, but adds Stopień (paint method grade).
 */
export function LakierSectionTable({
  title,
  section,
}: {
  title: string;
  section: LakierSection;
}) {
  if (!section || !section.present || section.rows.length === 0) return null;

  return (
    <div style={{ marginBottom: 28 }}>
      <h3 style={{
        margin: '0 0 12px',
        padding: '8px 14px',
        background: COLORS.navy,
        color: '#fff',
        fontSize: 14,
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        borderRadius: 6,
      }}>
        {title}
      </h3>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Opis</th>
              <th style={{ width: 60, textAlign: 'center' }}>Rodz.</th>
              <th style={{ width: 70, textAlign: 'center' }}>Stopień</th>
              <th className="amt" style={{ width: 70 }}>Czas</th>
              <th className="amt" style={{ width: 90 }}>Robocizna</th>
              <th className="amt" style={{ width: 100 }}>Materiał</th>
            </tr>
          </thead>
          <tbody>
            {section.rows.map((r, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{r.description || '—'}</td>
                <td style={{ textAlign: 'center' }}>
                  {r.rodz_napraw ? (
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                      fontSize: 11, fontWeight: 700,
                      background: '#E0E7FF', color: '#3730A3',
                    }}>
                      {r.rodz_napraw}
                    </span>
                  ) : ''}
                </td>
                <td style={{ textAlign: 'center', fontWeight: 700, color: COLORS.primary }}>
                  {r.stopien || ''}
                </td>
                <td className="amt">{fmtNum(r.hours)}</td>
                <td className="amt">{fmtPLN(r.labor_pln)}</td>
                <td className="amt" style={{ fontWeight: 600 }}>{fmtPLN(r.material_pln)}</td>
              </tr>
            ))}

            <tr className="total-row">
              <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700 }}>
                Razem:
              </td>
              <td className="amt" style={{ fontWeight: 700 }}>
                {fmtPLN(section.totals?.labor_pln)}
              </td>
              <td className="amt" style={{ fontWeight: 700, color: COLORS.primary }}>
                {fmtPLN(section.totals?.material_pln)}
              </td>
            </tr>
            {section.totals?.total_pln !== null && section.totals?.total_pln !== undefined && (
              <tr className="total-row">
                <td colSpan={5} style={{ textAlign: 'right', fontWeight: 800, fontSize: 13 }}>
                  Łącznie {title.toLowerCase()}:
                </td>
                <td className="amt" style={{
                  fontWeight: 900, fontSize: 14, color: COLORS.primary,
                }}>
                  {fmtPLN(section.totals.total_pln)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
