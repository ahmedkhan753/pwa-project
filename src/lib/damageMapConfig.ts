/**
 * Damage Map configuration — Phase 1.
 *
 * Static part lists, damage-type → marker-colour mapping and
 * body-type → silhouette-variant mapping for the Condition Report
 * "Mapa uszkodzeń" (Damage Map) section.
 *
 * No backend involvement — damages[] / interior_damages[] already
 * arrive from GET /api/report/{dealId}.
 */

// ── Part catalogues ────────────────────────────────────────────────
// Mirrors ExteriorDamageStep.tsx / InteriorDamageStep.tsx exactly.

export const EXTERIOR_PARTS: string[] = [
  "Maska / Pokrywa silnika", "Zderzak przedni", "Zderzak tylny",
  "Błotnik przedni lewy", "Błotnik przedni prawy",
  "Błotnik tylny lewy", "Błotnik tylny prawy",
  "Drzwi przednie lewe", "Drzwi przednie prawe",
  "Drzwi tylne lewe", "Drzwi tylne prawe",
  "Dach", "Klapa / Pokrywa bagażnika",
  "Próg lewy", "Próg prawy",
  "Lusterko lewe", "Lusterko prawe",
  "Szyba przednia", "Szyba tylna",
  "Szyba boczna lewa", "Szyba boczna prawa",
  "Reflektor przedni lewy", "Reflektor przedni prawy",
  "Lampa tylna lewa", "Lampa tylna prawa",
  "Felga przednia lewa", "Felga przednia prawa",
  "Felga tylna lewa", "Felga tylna prawa",
  "Inne",
];

export const INTERIOR_PARTS: string[] = [
  "Fotel kierowcy", "Fotel pasażera",
  "Kanapa tylna", "Zagłówki",
  "Deska rozdzielcza", "Konsola środkowa",
  "Kierownica", "Dźwignia zmiany biegów",
  "Podsufitka", "Wykładzina podłogowa",
  "Panel drzwi przednich lewych", "Panel drzwi przednich prawych",
  "Panel drzwi tylnych lewych", "Panel drzwi tylnych prawych",
  "Podłokietnik", "Schowek",
  "Lusterko wsteczne", "Osłony przeciwsłoneczne",
  "Pas bezpieczeństwa przód", "Pas bezpieczeństwa tył",
  "Bagażnik — wykładzina", "Bagażnik — ścianki",
  "Pedały", "Dywaniki",
  "Inne",
];

// ── Colours ────────────────────────────────────────────────────────
// Keyed by lowercased+trimmed damage type. See exteriorDamageColor().

export const DAMAGE_TYPE_COLOR: Record<string, string> = {
  "zarysowanie": "#F97316", // orange
  "wytarcie":    "#F97316", // orange
  "odprysk":     "#FACC15", // yellow
  "wgniecenie":  "#DC2626", // red
  "pęknięcie":   "#DC2626", // red
};

/** Any exterior damage type not in the map above (and ALL interior types). */
export const DEFAULT_DAMAGE_COLOR = "#374151"; // dark grey
/** All interior damages are always grey in Phase 1. */
export const INTERIOR_COLOR = "#374151";
/** Yellow flash applied to a damage card when its marker / list row is clicked. */
export const HIGHLIGHT_COLOR = "#FEF3C7";

/** Marker colour for an exterior damage — lowercase+trim match against the spec map. */
export function exteriorDamageColor(type: string | undefined | null): string {
  const key = (type || "").trim().toLowerCase();
  return DAMAGE_TYPE_COLOR[key] || DEFAULT_DAMAGE_COLOR;
}

// ── Body-type → silhouette variant ─────────────────────────────────
// Phase 1 renders a single generic silhouette for every variant; the
// mapping is wired now so Phase 2 (designer assets) is a drop-in swap.

export type SilhouetteVariant = 'sedan' | 'hatchback' | 'suv' | 'van' | 'truck';

export function bodyTypeToVariant(bodyType: string | undefined | null): SilhouetteVariant {
  switch ((bodyType || "").trim().toUpperCase()) {
    case "HATCHBACK":
      return "hatchback";
    case "SUV":
    case "CROSSOVER":
      return "suv";
    case "VAN/MINIVAN":
    case "VAN":
    case "MINIVAN":
      return "van";
    case "PICKUP":
      return "truck";
    case "SEDAN":
    case "KOMBI":
    case "COUPE":
    case "CABRIO":
    default:
      return "sedan";
  }
}
