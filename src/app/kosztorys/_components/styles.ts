/**
 * Shared styling tokens + format helpers for the kosztorys family.
 *
 * Mirrors the design language of the existing static /kosztorys page
 * (red primary #B71C1C, navy text #1D1D1F, neutral greys). Used by the
 * dynamic /kosztorys/[dealId] route and any shared sub-components.
 */

export const COLORS = {
  primary:   '#B71C1C',     // ZR red
  primaryLt: '#FEF2F2',
  text:      '#1D1D1F',
  muted:     '#6B7280',
  mutedLt:   '#F9FAFB',
  border:    '#E5E7EB',
  borderLt:  '#F3F4F6',
  green:     '#16A34A',
  greenLt:   '#F0FDF4',
  red:       '#DC2626',
  orange:    '#EA580C',
  bg:        '#FAFAFA',
  surface:   '#FFFFFF',
  navy:      '#1A1A2E',
};

/**
 * Format a number as Polish-locale PLN with 2 decimals, or '—' for null.
 * Eurotax JSON often has null for blank columns (vs 0.00 for actual zero).
 */
export function fmtPLN(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' PLN';
}

export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('pl-PL', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtEUR(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' €';
}

export function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('pl-PL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }) + ' %';
}

/**
 * Split "AUDI / Q3 18-25 / Q3 40 TFSI Quattro Advanced S [12-2018]"
 * into { make, model, variant }.
 */
export function splitMakeModel(s: string): { make: string; model: string; variant: string } {
  const parts = (s || '').split('/').map(p => p.trim()).filter(Boolean);
  return {
    make:    parts[0] || '',
    model:   parts[1] || '',
    variant: parts.slice(2).join(' / '),
  };
}
