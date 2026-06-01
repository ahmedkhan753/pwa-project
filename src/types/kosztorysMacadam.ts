/**
 * Data contract for the Macadam-style kosztorys report template
 * (/kosztorys/macadam/[dealId]). Source-agnostic — XML, manual entry,
 * or PDF parser output can all feed this shape later.
 */

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
  koszty_naprawy_pln:    number | null;
  koszt_amortyzacji_pln: number | null;
  koszt_netto_pln:       number | null;
  photos:                string[];
}

export interface MacadamTotals {
  koszty_naprawy_pln: number;
  amortyzacja_pln:    number;
  netto_pln:          number;
}

export interface MacadamData {
  vehicle: MacadamVehicleHeader;
  parts:   MacadamPart[];
  totals?: MacadamTotals;
}
