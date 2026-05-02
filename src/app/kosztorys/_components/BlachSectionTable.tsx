'use client';
import React from 'react';
import type { BlachSection, BlachSubItem } from '@/types/kosztorys';
import { COLORS, fmtPLN, fmtNum } from './styles';

/**
 * Renders a Blacharz / Pr.dodatkowe section as a table.
 * Sub-items appear indented under their parent operation (lighter, smaller
 * font). KD flat-rate rows in Pr.dodatkowe get a yellow "F" badge.
 *
 * Empty sub-items (code "NN" + empty description) are filtered out.
 */
export function BlachSectionTable({
  title,
  section,
}: {
  title: string;
  section: BlachSection;
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
              <th style={{ width: 90 }}>Kod</th>
              <th>Opis</th>
              <th style={{ width: 60, textAlign: 'center' }}>Typ</th>
              <th className="amt" style={{ width: 70 }}>Czas</th>
              <th className="amt" style={{ width: 80 }}>Potr.</th>
              <th className="amt" style={{ width: 90 }}>Robocizna</th>
              <th className="amt" style={{ width: 100 }}>Materiał</th>
            </tr>
          </thead>
          <tbody>
            {section.rows.map((r, i) => {
              const subs = (r.sub_items || []).filter(s => _hasSub(s));
              const isKD = r.operation_type === 'KD';
              return (
                <React.Fragment key={i}>
                  <tr>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: COLORS.muted }}>
                      {r.code || '—'}
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {r.description || '—'}
                      {(r.notes || []).map((n, ni) => (
                        <div key={ni} style={{
                          fontSize: 11, color: COLORS.muted, fontWeight: 400,
                          fontStyle: 'italic', marginTop: 2,
                        }}>
                          {n}
                        </div>
                      ))}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {r.operation_type ? (
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                          fontSize: 11, fontWeight: 700,
                          background: isKD ? '#FEF3C7' : '#DBEAFE',
                          color:      isKD ? '#92400E' : '#1E40AF',
                        }}>
                          {r.operation_type}
                          {isKD && (
                            <span style={{
                              marginLeft: 4, padding: '0 4px', borderRadius: 3,
                              background: '#F59E0B', color: '#fff', fontSize: 9,
                            }}>F</span>
                          )}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="amt">{fmtNum(r.hours)}</td>
                    <td className="amt" style={{ color: COLORS.muted }}>
                      {fmtNum(r.deduction)}
                    </td>
                    <td className="amt">{fmtPLN(r.labor_pln)}</td>
                    <td className="amt" style={{ fontWeight: 600 }}>
                      {fmtPLN(r.material_pln)}
                    </td>
                  </tr>
                  {subs.map((s, si) => (
                    <tr key={`sub-${i}-${si}`} style={{ background: '#FAFAFA' }}>
                      <td style={{
                        fontFamily: 'monospace', fontSize: 11,
                        color: COLORS.muted, paddingLeft: 24,
                      }}>
                        {s.code || ''}
                      </td>
                      <td colSpan={6} style={{
                        fontSize: 12, color: COLORS.muted, fontStyle: 'italic',
                      }}>
                        ↳ {s.description}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}

            {/* Section totals */}
            <tr className="total-row">
              <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700 }}>
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
                <td colSpan={6} style={{ textAlign: 'right', fontWeight: 800, fontSize: 13 }}>
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

/**
 * Sub-item is meaningful if it has any description content. We skip the
 * occasional "NN" stub the parser emits when a sub-item line has no body.
 */
function _hasSub(s: BlachSubItem): boolean {
  return !!(s.description && s.description.trim().length > 0);
}
