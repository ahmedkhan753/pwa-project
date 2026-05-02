/**
 * Type definitions mirroring the backend Eurotax parser output
 * (`backend/services/eurotax_parser.py::parse_eurotax_pdf`).
 *
 * Keep in sync with backend KosztorysData shape — any field added/renamed
 * on the backend must be reflected here.
 */

export interface KosztorysVehicle {
  make_model_type:    string;
  etg_code:           string;
  registration_plate: string;
  vin:                string;
  date:               string;
  paint_system:       string;
  currency:           string;
  base_version:       string;
  klient:             string;
  hail_logic:         string;
  time_units:         string;
}

export interface BlachSubItem {
  code:        string | null;
  description: string;
}

export interface BlachRow {
  code:           string | null;
  description:    string;
  operation_type: string | null;        // WY / WZ / KD
  hours:          number | null;
  deduction:      number | null;
  labor_pln:      number | null;
  material_pln:   number | null;
  sub_items:      BlachSubItem[];
  notes:          string[];
}

export interface LakierRow {
  description:    string;
  rodz_napraw:    string | null;        // typically "200"
  stopien:        string | null;        // I / II / III / SP / K2 / etc.
  hours:          number | null;
  labor_pln:      number | null;
  material_pln:   number | null;
}

export interface SectionTotals {
  labor_pln:    number | null;
  material_pln: number | null;
  total_pln:    number | null;
}

export interface BlachSection {
  present: boolean;
  rows:    BlachRow[];
  totals:  SectionTotals;
}

export interface LakierSection {
  present: boolean;
  rows:    LakierRow[];
  totals:  SectionTotals;
}

export interface KosztorysSummaryRow {
  section:  string;
  rate:     number | null;
  hours:    number | null;
  labor:    number | null;
  material: number | null;
}

export interface KosztorysSummary {
  per_section:          KosztorysSummaryRow[];
  small_materials_pct:  number | null;
  small_materials_pln:  number | null;
  total_labor:          number | null;
  total_labor_hours:    number | null;
  total_material:       number | null;
  subtotal_no_vat:      number | null;
  vat_pct:              number | null;
  vat_amount:           number | null;
  total_with_vat_pln:   number | null;
  total_eur:            number | null;
}

export interface PartItem {
  description:           string;
  part_number:           string | null;
  previous_part_number:  string | null;
  price_pln:             number | null;
}

export interface KosztorysIndices {
  indeks_mat_lak_pct:           number | null;
  indeks_czesci_zamiennych_pct: number | null;
}

export interface AbbreviationItem {
  short:       string;
  description: string;
}

export interface KosztorysData {
  vehicle:             KosztorysVehicle;
  sections: {
    blacharz:     BlachSection;
    pr_dodatkowe: BlachSection;
    lakiernik:    LakierSection;
  };
  summary:             KosztorysSummary;
  parts:               PartItem[];
  parts_total_pln:     number | null;
  equipment_options:   string[];
  indices:             KosztorysIndices;
  abbreviations:       AbbreviationItem[];
  paint_method_legend: AbbreviationItem[];
}
