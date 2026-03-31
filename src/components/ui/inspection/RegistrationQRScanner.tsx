"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, QrCode, Loader2, CheckCircle2, AlertCircle, Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════
   Browser-compatible NRV2E decompressor  (no Buffer / Node.js needed)
   Reimplemented from nrv2e-decompress using Uint8Array.
   ═══════════════════════════════════════════════════════════════════════ */

class BitReader {
    private buf: Uint8Array;
    private bBits: number;
    private off = 0;
    private cBit = 0;
    private cBuf = 0;

    constructor(buffer: Uint8Array, bufferBits = 8) {
        this.buf = buffer;
        this.bBits = bufferBits;
    }

    get ended(): boolean {
        return this.off >= this.buf.length && this.cBit === 0;
    }

    readBit(): number {
        if (this.cBit === 0) {
            this.cBuf = 0;
            for (let b = this.bBits / 8 - 1; b >= 0; b--) {
                this.cBuf += this.readByte() << (8 * b);
            }
            this.cBit = this.bBits;
        }
        return (this.cBuf >> --this.cBit) & 1;
    }

    readByte(): number {
        return this.buf[this.off++] ?? 0;
    }
}

function nrv2eDecompress(input: Uint8Array, output: Uint8Array): number {
    const bits = new BitReader(input, 8);
    let oPos = 0;
    let lastOff = 1;

    while (!bits.ended) {
        if (bits.readBit() === 1) {
            if (oPos >= output.length) break;
            output[oPos++] = bits.readByte();
        } else {
            let off = 1;
            let len = 0;

            for (;;) {
                off = off * 2 + bits.readBit();
                if (bits.readBit() === 1) break;
                off = (off - 1) * 2 + bits.readBit();
            }

            if (off === 2) {
                off = lastOff;
                len = bits.readBit();
            } else {
                off = (off - 3) * 0x100 + bits.readByte();
                if (off === 0xffffffff) break;
                len = (off ^ 0xffffffff) & 1;
                off >>= 1;
                lastOff = ++off;
            }

            if (len) {
                len = 1 + bits.readBit();
            } else if (bits.readBit() === 1) {
                len = 3 + bits.readBit();
            } else {
                len++;
                do { len = len * 2 + bits.readBit(); } while (bits.readBit() === 0);
                len += 3;
            }

            if (off > 0x500) len++;

            let cur = oPos - off;
            if (cur < 0 || off > oPos) break;

            for (let i = 0; i <= len; i++) {
                if (oPos >= output.length || cur >= output.length) break;
                output[oPos++] = output[cur++];
            }
        }
    }
    return oPos;
}

/* ═══════════════════════════════════════════════════════════════════════
   Field mapping  (indexes from the official decoder library)
   ═══════════════════════════════════════════════════════════════════════ */

const FUEL_MAP: Record<string, string> = {
    P: "BENZYNA", D: "DIESEL", M: "BENZYNA", LPG: "LPG",
    CNG: "LPG", H: "WODÓR", LNG: "LPG", BD: "DIESEL",
    E85: "BENZYNA", EE: "ELEKTRYCZNY", "999": "NIE DOTYCZY",
};

export interface DecodedVehicleData {
    vin?: string;
    registrationPlates?: string;
    make?: string;
    model?: string;
    year?: string;
    engineCapacity?: string;
    enginePower?: string;
    fuelType?: string;
    ownWeight?: string;
    totalWeight?: string;
    seatsCount?: string;
    firstRegistration?: string;
    /** Raw QR text — set when the QR was decoded but no structured fields could be extracted */
    rawText?: string;
}

/**
 * Try to extract vehicle data from a plain-text QR code.
 * Handles JSON payloads and raw text with VIN / plate patterns.
 */
function parsePlainTextQR(text: string): DecodedVehicleData {
    const result: DecodedVehicleData = {};

    // 1. Try JSON
    try {
        const json = JSON.parse(text);
        if (json.vin) result.vin = String(json.vin).toUpperCase();
        if (json.make || json.brand) result.make = String(json.make || json.brand).toUpperCase();
        if (json.model) result.model = String(json.model).toUpperCase();
        const plates = json.registration || json.plates || json.registrationPlates;
        if (plates) result.registrationPlates = String(plates).toUpperCase();
        if (json.year) result.year = String(json.year);
        const fuel = json.fuel || json.fuelType;
        if (fuel) result.fuelType = String(fuel).toUpperCase();
    } catch {
        // not JSON — fall through to regex
    }

    // 2. VIN: 17 chars, no I / O / Q
    if (!result.vin) {
        const m = text.match(/\b([A-HJ-NPR-Z0-9]{17})\b/i);
        if (m) result.vin = m[1].toUpperCase();
    }

    // 3. Polish registration plate  e.g. "WA12345" or "KR 1234X"
    if (!result.registrationPlates) {
        const m = text.match(/\b([A-Z]{2,3}[\s]?[A-Z0-9]{4,5})\b/i);
        if (m) result.registrationPlates = m[1].toUpperCase().replace(/\s+/g, "");
    }

    return result;
}

/**
 * Decode raw Aztec barcode bytes from a Polish registration certificate.
 * Supports both new (XX…) and old format documents.
 */
function decodeRegistrationBytes(raw: Uint8Array): DecodedVehicleData {
    // 4-byte LE header = decompressed output size
    const outLen = raw[0] | (raw[1] << 8) | (raw[2] << 16) | (raw[3] << 24);
    if (outLen <= 0 || outLen > 100_000) throw new Error("Invalid header");

    const out = new Uint8Array(outLen);
    nrv2eDecompress(raw.slice(4), out);

    const text = new TextDecoder("utf-16le").decode(out);
    const fields = text.split(/\||\r?\n/);

    const isNew = fields[0]?.startsWith("XX");
    const g = (nIdx: number, oIdx = -1): string => {
        const i = isNew ? nIdx : oIdx;
        return i >= 0 && i < fields.length ? fields[i].trim() : "";
    };

    const result: DecodedVehicleData = {};

    result.vin = g(13, 11) || undefined;
    result.registrationPlates = g(7, 5) || undefined;
    result.make = g(8, 6) || undefined;
    result.model = g(12, 10) || undefined;
    result.year = g(56, 41) || undefined;
    result.engineCapacity = g(48, 32).replace(/[^0-9]/g, "") || undefined;

    const kwStr = g(49, 33);
    if (kwStr) {
        const kw = parseFloat(kwStr.replace(",", "."));
        if (!isNaN(kw)) result.enginePower = String(Math.round(kw * 1.36));
    }

    const fuel = g(50, 34);
    if (fuel) result.fuelType = FUEL_MAP[fuel] || undefined;

    result.ownWeight = g(41, 25).replace(/[^0-9]/g, "") || undefined;
    result.totalWeight = g(39, 23).replace(/[^0-9]/g, "") || undefined;
    result.seatsCount = g(52, 37) || undefined;

    const regDate = g(51, 36);
    if (regDate?.includes("-")) {
        const [y, m, d] = regDate.split("-");
        result.firstRegistration = `${d}.${m}.${y}`;
    } else if (regDate) {
        result.firstRegistration = regDate;
    }

    return result;
}

/* ═══════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════ */

interface RegistrationQRScannerProps {
    onData: (data: DecodedVehicleData) => void;
    onClose: () => void;
}

export function RegistrationQRScanner({ onData, onClose }: RegistrationQRScannerProps) {
    const [status, setStatus] = useState<"scanning" | "success" | "error">("scanning");
    const [message, setMessage] = useState("Nakieruj kamerę na kod Aztec lub QR z dowodu rejestracyjnego");
    const [decoded, setDecoded] = useState<DecodedVehicleData | null>(null);
    const [showManual, setShowManual] = useState(false);
    const [manualText, setManualText] = useState("");
    const scannerRef = useRef<any>(null);
    const idRef = useRef(`qr-reader-${Date.now()}`);
    const doneRef = useRef(false);

    /* ── scan callback ── */
    const handleSuccess = useCallback(
        async (decodedText: string) => {
            if (doneRef.current) return;
            doneRef.current = true;

            // Log raw content immediately for debugging
            console.log("[QR] handleSuccess — raw text:", JSON.stringify(decodedText));

            let data: DecodedVehicleData | null = null;

            // Path 1: Polish registration Aztec (NRV2E-compressed binary)
            try {
                const bytes = new Uint8Array(decodedText.length);
                for (let i = 0; i < decodedText.length; i++) {
                    bytes[i] = decodedText.charCodeAt(i) & 0xff;
                }
                const aztecData = decodeRegistrationBytes(bytes);
                if (aztecData.vin || aztecData.make || aztecData.registrationPlates) {
                    data = aztecData;
                    console.log("[QR] Decoded as Aztec NRV2E", data);
                }
            } catch {
                // not an Aztec registration code — try plain text
            }

            // Path 2: Plain text QR (VIN, JSON, etc.)
            if (!data) {
                const plainData = parsePlainTextQR(decodedText);
                if (plainData.vin || plainData.make || plainData.registrationPlates) {
                    data = plainData;
                    console.log("[QR] Decoded as plain text", data);
                }
            }

            // Path 3: Unknown format — accept raw text so user sees it was scanned
            if (!data) {
                console.log("[QR] No structured data — passing raw text");
                data = { rawText: decodedText.slice(0, 200) };
            }

            setDecoded(data);
            setStatus("success");
            setMessage(data.rawText && !data.vin && !data.make ? "Zeskanowano — sprawdź dane poniżej" : "Dane odczytane pomyślnie!");

            // stop camera
            try { await scannerRef.current?.stop(); } catch { /* ok */ }

            // auto-apply after short preview
            setTimeout(() => { onData(data!); onClose(); }, 2500);
        },
        [onData, onClose],
    );

    /* ── manual text submit ── */
    const handleManualSubmit = useCallback(() => {
        const text = manualText.trim();
        if (!text) return;
        handleSuccess(text);
    }, [manualText, handleSuccess]);

    /* ── mount / unmount scanner ── */
    useEffect(() => {
        let alive = true;
        let sc: any = null;
        let started = false;

        (async () => {
            try {
                // Check HTTPS before even trying
                const isSecure =
                    typeof window !== "undefined" &&
                    (window.location.protocol === "https:" ||
                        window.location.hostname === "localhost" ||
                        window.location.hostname === "127.0.0.1");

                if (!isSecure) {
                    throw Object.assign(new Error("HTTPS required"), { _httpsError: true });
                }

                const { Html5Qrcode } = await import("html5-qrcode");
                if (!alive) return;

                // Verify DOM element exists
                if (!document.getElementById(idRef.current)) {
                    throw new Error("Scanner container not found in DOM");
                }

                // No formatsToSupport restriction — let the library detect everything.
                // Restricting to AZTEC/QR_CODE/DATA_MATRIX was silently preventing detection.
                sc = new Html5Qrcode(idRef.current, { verbose: false });
                scannerRef.current = sc;

                await sc.start(
                    { facingMode: "environment" },
                    // No aspectRatio — forcing 1:1 breaks focus on many mobile cameras
                    { fps: 15, qrbox: { width: 250, height: 250 } },
                    handleSuccess,
                    () => {},          // continuous scan-failure is expected
                );
                started = true;
            } catch (err: any) {
                console.error("[QR] camera error", err);
                if (alive) {
                    setStatus("error");
                    if (err?._httpsError) {
                        setMessage("Kamera wymaga połączenia HTTPS. Skontaktuj się z administratorem.");
                    } else {
                        setMessage("Nie można uruchomić kamery. Sprawdź uprawnienia.");
                    }
                }
            }
        })();

        return () => {
            alive = false;
            if (sc) {
                try {
                    if (started) {
                        sc.stop().catch(() => {});
                    }
                    sc.clear();
                } catch {
                    // scanner cleanup failed — safe to ignore
                }
            }
        };
    }, [handleSuccess]);

    /* ── UI ── */
    return (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
            {/* header */}
            <div className="flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur-md border-b border-white/5">
                <div className="flex items-center gap-2">
                    <QrCode size={20} className="text-primary" />
                    <span className="text-white font-black text-xs uppercase tracking-tight">
                        Skan Dowodu Rejestracyjnego
                    </span>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 bg-white/10 text-white rounded-xl hover:bg-white/20 active:scale-95 transition-all"
                    aria-label="Zamknij skaner"
                >
                    <X size={20} />
                </button>
            </div>

            {/* camera area */}
            <div className="flex-1 flex flex-col items-center justify-center px-4 overflow-auto">
                <div
                    id={idRef.current}
                    className="w-full max-w-[350px] rounded-2xl overflow-hidden border-2 border-primary/40"
                />

                {/* status pill */}
                <div
                    className={cn(
                        "mt-5 flex items-center gap-2.5 px-5 py-3 rounded-2xl text-sm font-bold transition-colors",
                        status === "scanning" && "bg-white/10 text-white",
                        status === "success" && "bg-emerald-500/20 text-emerald-400",
                        status === "error" && "bg-red-500/20 text-red-400",
                    )}
                >
                    {status === "scanning" && <Loader2 size={16} className="animate-spin" />}
                    {status === "success" && <CheckCircle2 size={16} />}
                    {status === "error" && <AlertCircle size={16} />}
                    <span>{message}</span>
                </div>

                {/* decoded preview */}
                {decoded && status === "success" && (
                    <div className="mt-4 w-full max-w-[350px] bg-white/5 rounded-2xl p-4 space-y-2 animate-in fade-in slide-in-from-bottom-4">
                        {decoded.vin && <Row label="VIN" value={decoded.vin} />}
                        {decoded.registrationPlates && <Row label="Nr rej." value={decoded.registrationPlates} />}
                        {decoded.make && <Row label="Marka" value={decoded.make} />}
                        {decoded.model && <Row label="Model" value={decoded.model} />}
                        {decoded.year && <Row label="Rok" value={decoded.year} />}
                        {decoded.fuelType && <Row label="Paliwo" value={decoded.fuelType} />}
                        {decoded.rawText && (
                            <div className="pt-1 border-t border-white/10">
                                <span className="text-[10px] font-black text-white/50 uppercase block mb-1">Treść kodu QR</span>
                                <span className="text-xs font-mono text-white/80 break-all">{decoded.rawText}</span>
                            </div>
                        )}
                    </div>
                )}

                {status === "scanning" && (
                    <p className="mt-4 text-[10px] text-white/40 font-bold uppercase tracking-widest text-center max-w-[280px]">
                        Kod Aztec (odwrót dowodu rej.) lub zwykły kod QR z numerem VIN
                    </p>
                )}

                {/* manual fallback */}
                {status === "scanning" && !showManual && (
                    <button
                        onClick={() => setShowManual(true)}
                        className="mt-5 flex items-center gap-2 text-xs text-white/40 hover:text-white/70 transition-colors"
                    >
                        <Keyboard size={14} />
                        Wpisz VIN ręcznie
                    </button>
                )}

                {showManual && status === "scanning" && (
                    <div className="mt-4 w-full max-w-[350px] flex gap-2">
                        <input
                            type="text"
                            value={manualText}
                            onChange={e => setManualText(e.target.value.toUpperCase())}
                            onKeyDown={e => e.key === "Enter" && handleManualSubmit()}
                            placeholder="Wklej lub wpisz VIN / treść kodu QR"
                            className="flex-1 bg-white/10 text-white text-xs font-mono px-3 py-2.5 rounded-xl border border-white/20 placeholder:text-white/30 focus:outline-none focus:border-primary/60"
                            autoFocus
                        />
                        <button
                            onClick={handleManualSubmit}
                            disabled={!manualText.trim()}
                            className="px-4 py-2.5 bg-primary text-black text-xs font-black rounded-xl disabled:opacity-40 active:scale-95 transition-all"
                        >
                            OK
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

/* tiny helper */
function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between items-center">
            <span className="text-[10px] font-black text-white/50 uppercase">{label}</span>
            <span className="text-xs font-bold text-white">{value}</span>
        </div>
    );
}
