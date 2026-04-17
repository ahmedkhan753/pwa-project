/**
 * Next.js API Route — /api/decode-registration
 *
 * Decodes a Polish vehicle registration certificate Aztec barcode.
 *
 * Accepts:
 *   { aztecBase64: string }         — the preferred payload form, already base64-encoded
 *   { rawText: string }             — raw ZXing text (binary chars in Latin-1 string form)
 *   { rawBytes: number[] }          — ZXing raw byte array
 *
 * The decoder from the npm package needs the *exact* payload bytes: a little-endian
 * uint32 output-length header followed by nrv2e-compressed UTF-16LE text.
 * Different scan paths give us the payload in different encodings, so we try
 * several interpretations and return the first one that produces something useful
 * (at minimum a plausible VIN or registration plate).
 */
import { NextRequest, NextResponse } from "next/server";
import PolishVehicleRegistrationCertificateDecoder from "polish-vehicle-registration-certificate-decoder";

// Force Node.js runtime — the npm decoder needs `Buffer` which the Edge
// runtime does not provide.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

interface DecodedResult {
    vin: string | null;
    registrationPlates: string | null;
    make: string | null;
    model: string | null;
    year: string | null;
    engineCapacity: string | null;
    enginePower: string | null;
    fuelType: string | null;
    ownWeight: string | null;
    totalWeight: string | null;
    seatsCount: string | null;
    firstRegistration: string | null;
}

function log(msg: string) {
    console.log(`[decode-registration] ${msg}`);
}

function mapFields(d: any): DecodedResult {
    const kwStr = d?.maksymalnaMocNettoSilnikaKW?.value;
    let enginePowerKM: string | null = null;
    if (kwStr) {
        const kw = parseFloat(String(kwStr).replace(",", "."));
        if (!isNaN(kw)) enginePowerKM = String(Math.round(kw * 1.36));
    }

    const fuelCode = d?.rodzajPaliwa?.value ?? null;
    const fuelType = fuelCode ? FUEL_MAP[fuelCode] ?? null : null;

    const regDateRaw = d?.dataPierwszejRejestracjiPojazdu?.value ?? null;
    let firstRegistration: string | null = null;
    if (regDateRaw && String(regDateRaw).includes("-")) {
        const [y, m, day] = String(regDateRaw).split("-");
        firstRegistration = `${day}.${m}.${y}`;
    } else if (regDateRaw) {
        firstRegistration = String(regDateRaw);
    }

    const cleanNum = (v: string | null): string | null => {
        if (!v) return null;
        const n = String(v).replace(/[^0-9]/g, "");
        return n || null;
    };

    return {
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
}

function looksGoodEnough(r: DecodedResult): boolean {
    const vin = (r.vin || "").replace(/\s/g, "");
    if (vin.length === 17 && /^[A-HJ-NPR-Z0-9]+$/i.test(vin)) return true;
    if (r.make && r.make.length >= 2) return true;
    if (r.registrationPlates && r.registrationPlates.length >= 4) return true;
    return false;
}

function tryDecode(buf: Buffer, label: string): { result: DecodedResult; label: string } | { error: string; label: string } {
    try {
        const b64 = buf.toString("base64");
        const decoder = new PolishVehicleRegistrationCertificateDecoder(b64);
        const mapped = mapFields(decoder.data);
        log(`${label}: VIN=${mapped.vin ?? "?"} make=${mapped.make ?? "?"} plate=${mapped.registrationPlates ?? "?"}`);
        return { result: mapped, label };
    } catch (err: any) {
        const msg = err?.message || String(err);
        log(`${label}: decode threw — ${msg}`);
        return { error: msg, label };
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { aztecBase64, rawText, rawBytes } = body ?? {};

        // Gather candidate byte buffers from whichever input the client gave us.
        const candidates: { buf: Buffer; label: string }[] = [];

        if (typeof aztecBase64 === "string" && aztecBase64.length > 0) {
            try {
                const b = Buffer.from(aztecBase64, "base64");
                if (b.length > 4) candidates.push({ buf: b, label: `aztecBase64 (${b.length}B)` });
            } catch { /* ignore */ }
        }

        if (typeof rawText === "string" && rawText.length > 0) {
            // Latin-1: each JS char code → one byte (ZXing's default for binary Aztec).
            const latin1 = Buffer.from(rawText, "latin1");
            if (latin1.length > 4) candidates.push({ buf: latin1, label: `rawText→latin1 (${latin1.length}B)` });

            // UTF-8: in case the client already encoded via TextEncoder.
            const utf8 = Buffer.from(rawText, "utf8");
            if (utf8.length > 4 && utf8.length !== latin1.length) {
                candidates.push({ buf: utf8, label: `rawText→utf8 (${utf8.length}B)` });
            }
        }

        if (Array.isArray(rawBytes) && rawBytes.length > 4) {
            const b = Buffer.from(rawBytes.map((n: number) => Number(n) & 0xff));
            candidates.push({ buf: b, label: `rawBytes[] (${b.length}B)` });
        }

        if (candidates.length === 0) {
            return NextResponse.json(
                { ok: false, error: "Provide aztecBase64, rawText or rawBytes" },
                { status: 400 },
            );
        }

        log(`Got ${candidates.length} candidate payload(s)`);

        const attempts: { label: string; error?: string; preview?: DecodedResult }[] = [];

        for (const { buf, label } of candidates) {
            // Try as-is first.
            const direct = tryDecode(buf, label);
            if ("result" in direct) {
                attempts.push({ label: direct.label, preview: direct.result });
                if (looksGoodEnough(direct.result)) {
                    return NextResponse.json({ ok: true, result: direct.result, picked: direct.label, attempts });
                }
            } else {
                attempts.push({ label: direct.label, error: direct.error });
            }

            // Fallback 1 — skip leading bytes in case a header was stripped/added.
            // The decoder expects the first 4 bytes to be a uint32LE output length;
            // if those bytes look unreasonable, slide the window a few bytes ahead.
            const hdr = buf.length >= 4 ? buf.readUInt32LE(0) : 0;
            if (hdr > 0 && (hdr < 16 || hdr > 65536)) {
                for (const offset of [1, 2, 3, 4]) {
                    if (buf.length <= offset + 8) break;
                    const sliced = buf.slice(offset);
                    const out = tryDecode(sliced, `${label} offset+${offset}`);
                    if ("result" in out && looksGoodEnough(out.result)) {
                        return NextResponse.json({ ok: true, result: out.result, picked: out.label, attempts: [...attempts, { label: out.label, preview: out.result }] });
                    }
                    if ("error" in out) attempts.push({ label: out.label, error: out.error });
                }
            }
        }

        // No candidate hit the "good enough" bar — return the best we got (if any).
        const bestPreview = attempts.find(a => a.preview)?.preview;
        if (bestPreview) {
            log("No strong match; returning best partial result");
            return NextResponse.json({ ok: true, result: bestPreview, picked: "best-effort", attempts });
        }

        log("All decode attempts failed");
        return NextResponse.json(
            {
                ok: false,
                error: "Decoding failed — none of the candidate payloads yielded a valid registration record",
                attempts,
            },
            { status: 422 },
        );
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error("[decode-registration] Unhandled error:", error);
        return NextResponse.json(
            { ok: false, error: "Unhandled error", details: msg },
            { status: 500 },
        );
    }
}
