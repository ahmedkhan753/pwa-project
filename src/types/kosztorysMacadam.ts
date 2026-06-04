/**
 * Data contract for the kosztorys cost layer.
 * - Order-level inputs (labour rate, depreciation %) drive the cost
 *   engine; per-part qualification + repair time + parts cost feed in.
 * - The 3 cost fields on MacadamPart are now COMPUTED + stored (the
 *   backend recomputes on PUT and is the source of truth). The
 *   appraiser never types them directly.
 */

export type Qualification =
  | ''
  | 'lakierowanie'
  | 'naprawa'
  | 'wymiana'
  | 'akceptowalne';

export interface MacadamVehicleHeader {
  make_model:         string;
  variant:            string;
  vin:                string;
  registration_plate: string;
  grupa:              string;
  mileage_km:         number | null;
  first_registration: string;
  body_colour:        string;
  klient:             string;
  inspection_date:    string;
  inspection_address: string;
  main_photo_url:     string | null;
}

export interface MacadamPart {
  id:                    string;
  index:                 number;
  location:              'interior' | 'exterior';
  czesc:                 string;
  typ:                   string;
  tryb_naprawy:          string;

  // Cost engine inputs — appraiser-entered, drive the computed costs below.
  qualification:         Qualification;
  repair_time_h:         number | null;
  parts_cost_pln:        number | null;   // wymiana: parts price; is_manual: fixed sum
  is_manual:             boolean;

  // Computed (recomputed server-side on PUT). Null = nothing entered yet.
  koszty_naprawy_pln:    number | null;
  koszt_amortyzacji_pln: number | null;
  koszt_netto_pln:       number | null;

  photos:                string[];
}

export interface MacadamTotals {
  koszty_naprawy_pln: number;
  amortyzacja_pln:    number;
  netto_pln:          number;
  gross_pln:          number;       // netto × 1.23 (VAT 23%)
}

export interface MacadamData {
  vehicle: MacadamVehicleHeader;
  parts:   MacadamPart[];
  totals?: MacadamTotals;

  // Order-level cost-engine parameters.
  labour_rate_pln_per_h: number | null;
  depreciation_pct:      number | null;   // 0..100

  // Material + small parts (single manual figure, NOT depreciated —
  // flows straight into the net total, then VAT).
  koszt_materialu_pln:   number | null;
}
