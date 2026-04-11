/**
 * Next.js API Route — /api/decode-registration
 *
 * Decodes a Polish vehicle registration certificate Aztec barcode.
 * Expects { aztecBase64: string } in the POST body.
 * Uses the `polish-vehicle-registration-certificate-decoder` npm package
 * which requires Node.js Buffer (hence server-side only).
 */
import { NextRequest, NextResponse } from "next/server";
import PolishVehicleRegistrationCertificateDecoder from "polish-vehicle-registration-certificate-decoder";

const FUEL_MAP: Record<string, string> = {
  P: "BENZYNA",
  D: "DIESEL",
  M: "BENZYNA",
  LPG: "LPG",
  CNG: "LPG",
  H: "WODÓR",
  LNG: "LPG",
  BD: "DIESEL",
  E85: "BENZYNA",
  EE: "ELEKTRYCZNY",
  "999": "NIE DOTYCZY",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { aztecBase64 } = body ?? {};

    if (!aztecBase64 || typeof aztecBase64 !== "string") {
      return NextResponse.json(
        { ok: false, error: "aztecBase64 is required" },
        { status: 400 },
      );
    }

    const decoder = new PolishVehicleRegistrationCertificateDecoder(
      aztecBase64,
    );
    const d: any = decoder.data;

    // Map engine power from kW to KM (horsepower)
    const kwStr = d?.maksymalnaMocNettoSilnikaKW?.value;
    let enginePowerKM: string | null = null;
    if (kwStr) {
      const kw = parseFloat(String(kwStr).replace(",", "."));
      if (!isNaN(kw)) enginePowerKM = String(Math.round(kw * 1.36));
    }

    // Map fuel code to display name
    const fuelCode = d?.rodzajPaliwa?.value ?? null;
    const fuelType = fuelCode ? FUEL_MAP[fuelCode] ?? null : null;

    // Convert first registration date YYYY-MM-DD → DD.MM.YYYY
    const regDateRaw = d?.dataPierwszejRejestracjiPojazdu?.value ?? null;
    let firstRegistration: string | null = null;
    if (regDateRaw && regDateRaw.includes("-")) {
      const [y, m, day] = regDateRaw.split("-");
      firstRegistration = `${day}.${m}.${y}`;
    } else if (regDateRaw) {
      firstRegistration = regDateRaw;
    }

    // Strip non-numeric from weight/capacity fields
    const cleanNum = (v: string | null): string | null => {
      if (!v) return null;
      const n = String(v).replace(/[^0-9]/g, "");
      return n || null;
    };

    const result = {
      vin: d?.numerIdentyfikacyjnyPojazdu?.value ?? null,
      registrationPlates: d?.numerRejestracyjnyPojazdu?.value ?? null,
      make: d?.markaPojazdu?.value ?? null,
      model: d?.modelPojazdu?.value ?? null,
      year: d?.rokProdukcji?.value ?? null,
      engineCapacity: cleanNum(d?.pojemnoscSilnikaCm3?.value ?? null),
      enginePower: enginePowerKM,
      fuelType,
      ownWeight: cleanNum(d?.masaWlasnaPojazduKg?.value ?? null),
      totalWeight: cleanNum(d?.dopuszczalnaMasaCalkowitaPojazduKg?.value ?? null),
      seatsCount: d?.liczbaMiejscSiedzacych?.value ?? null,
      firstRegistration,
    };

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[decode-registration] Error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Decoding failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 422 },
    );
  }
}
