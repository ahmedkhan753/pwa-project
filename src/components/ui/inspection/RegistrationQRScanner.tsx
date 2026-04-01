"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, QrCode, Loader2, CheckCircle2, AlertCircle, Keyboard, ImagePlus } from "lucide-react";
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
    const [attempts, setAttempts] = useState(0);
    const [fileScanning, setFileScanning] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [debugLines, setDebugLines] = useState<string[]>([]);
    const [lastFailReason, setLastFailReason] = useState("");
    const scannerRef = useRef<any>(null);
    const idRef = useRef(`qr-reader-${Date.now()}`);
    const doneRef = useRef(false);

    const dbg = useCallback((line: string) => {
        console.log("[QR-DBG]", line);
        setDebugLines(prev => [...prev.slice(-6), line]);
    }, []);

    /* ── scan callback ── */
    const handleSuccess = useCallback(
        // eslint-disable-next-line react-hooks/exhaustive-deps
        async (decodedText: string) => {
            if (doneRef.current) return;
            doneRef.current = true;

            const preview = JSON.stringify(decodedText.slice(0, 60));
            dbg(`Detected! len=${decodedText.length} text=${preview}`);
            console.log("[QR] handleSuccess — raw text:", JSON.stringify(decodedText));

            let data: DecodedVehicleData | null = null;

            // Path 1: Polish registration Aztec (NRV2E-compressed binary)
            // BarcodeDetector may encode binary bytes as Latin-1 OR UTF-8 when building the DOMString.
            // Try both encodings so we recover the original Aztec bytes regardless.
            const byteCandidates: [string, Uint8Array][] = [
                [
                    "latin1",
                    // Latin-1: each char code IS the byte value (charCode 0-255)
                    (() => {
                        const b = new Uint8Array(decodedText.length);
                        for (let i = 0; i < decodedText.length; i++) b[i] = decodedText.charCodeAt(i) & 0xff;
                        return b;
                    })(),
                ],
                [
                    "utf8",
                    // UTF-8: re-encode the DOMString back to UTF-8 bytes — recovers original bytes
                    // if the browser converted the Aztec binary via UTF-8 when building rawValue.
                    new TextEncoder().encode(decodedText),
                ],
            ];

            for (const [enc, bytes] of byteCandidates) {
                if (data) break;
                try {
                    const aztecData = decodeRegistrationBytes(bytes);
                    if (aztecData.vin || aztecData.make || aztecData.registrationPlates) {
                        data = aztecData;
                        dbg(`Path1 Aztec OK (${enc}) — VIN:${aztecData.vin ?? "?"} make:${aztecData.make ?? "?"}`);
                        console.log(`[QR] Decoded as Aztec NRV2E (${enc})`, data);
                    } else {
                        dbg(`Path1 Aztec (${enc}) — decoded but no VIN/make/plates`);
                    }
                } catch (e: any) {
                    dbg(`Path1 Aztec (${enc}) failed: ${e?.message ?? e}`);
                }
            }

            // Path 2: Plain text QR (VIN, JSON, etc.)
            if (!data) {
                const plainData = parsePlainTextQR(decodedText);
                if (plainData.vin || plainData.make || plainData.registrationPlates) {
                    data = plainData;
                    dbg(`Path2 plain OK — VIN:${plainData.vin ?? "?"} plates:${plainData.registrationPlates ?? "?"}`);
                    console.log("[QR] Decoded as plain text", data);
                } else {
                    dbg(`Path2 plain — no VIN/make/plates in: "${decodedText.slice(0, 80)}"`);
                }
            }

            // Path 3: Unknown format — accept raw text so user sees it was scanned
            if (!data) {
                dbg(`Path3 rawText — "${decodedText.slice(0, 80)}"`);
                console.log("[QR] No structured data — passing raw text");
                data = { rawText: decodedText.slice(0, 200) };
            }

            setDecoded(data);
            setStatus("success");
            setMessage(data.rawText && !data.vin && !data.make ? "Zeskanowano — sprawdź dane poniżej" : "Dane odczytane pomyślnie!");

            // ── Send decode diagnostics to backend for server-side logging ──
            try {
                const latin1Bytes = Array.from({ length: Math.min(30, decodedText.length) }, (_, i) => decodedText.charCodeAt(i) & 0xff);
                const utf8Bytes = Array.from(new TextEncoder().encode(decodedText).slice(0, 30));
                const pathTaken = data.vin || data.make ? (decodedText.length > 20 && decodedText.charCodeAt(0) < 32 ? "aztec" : "plain") : "rawtext";
                const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
                fetch(`${BASE_URL}/debug/qr`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        raw_length: decodedText.length,
                        first_bytes_latin1: latin1Bytes,
                        first_bytes_utf8: utf8Bytes,
                        path_taken: pathTaken,
                        vin_found: data.vin ?? "",
                        make_found: data.make ?? "",
                        raw_preview: decodedText.slice(0, 80),
                    }),
                }).catch(() => {});
            } catch { /* non-critical */ }

            // stop camera
            try { await scannerRef.current?.stop(); } catch { /* ok */ }

            // auto-apply after 6 s preview (enough time to read debug panel)
            setTimeout(() => { onData(data!); onClose(); }, 6000);
        },
        [onData, onClose, dbg],
    );

    /* ── manual text submit ── */
    const handleManualSubmit = useCallback(() => {
        const text = manualText.trim();
        if (!text) return;
        handleSuccess(text);
    }, [manualText, handleSuccess]);

    /* ── scan from image file ── */
    const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        // reset so the same file can be re-selected if needed
        e.target.value = "";

        setFileScanning(true);
        dbg(`File: ${file.name} (${file.type}, ${(file.size / 1024).toFixed(0)} KB)`);
        dbg(`doneRef was: ${doneRef.current} — resetting for file decode`);

        // Path 1 — native BarcodeDetector on the image (most reliable)
        const BDClass = (window as any).BarcodeDetector as any;
        if (BDClass) {
            try {
                const bd = new BDClass({ formats: ["qr_code", "aztec", "data_matrix", "code_128", "code_39", "ean_13"] });
                const bitmap = await createImageBitmap(file);
                const codes = await bd.detect(bitmap);
                bitmap.close();
                if (codes.length > 0 && codes[0].rawValue) {
                    const raw = codes[0].rawValue;
                    dbg(`File BarcodeDetector OK: len=${raw.length} "${raw.slice(0, 60)}"`);
                    console.log("[QR-FILE] BarcodeDetector decoded:", JSON.stringify(raw));
                    setFileScanning(false);
                    doneRef.current = false; // reset so handleSuccess isn't blocked
                    handleSuccess(raw);
                    return;
                }
                dbg("File BarcodeDetector: no code found — trying ZXing");
            } catch (err: any) {
                dbg(`File BarcodeDetector error: ${err.message ?? err}`);
            }
        }

        // Path 2 — ZXing via html5-qrcode scanFile
        try {
            dbg("ZXing scanFile…");
            const { Html5Qrcode } = await import("html5-qrcode");
            const tmpId = `qr-tmp-${Date.now()}`;
            const tmpDiv = document.createElement("div");
            tmpDiv.id = tmpId;
            tmpDiv.style.display = "none";
            document.body.appendChild(tmpDiv);
            try {
                const tmpScanner = new Html5Qrcode(tmpId, { verbose: false });
                const result = await tmpScanner.scanFile(file, false);
                dbg(`ZXing scanFile OK: len=${result.length} "${result.slice(0, 60)}"`);
                console.log("[QR-FILE] ZXing decoded:", JSON.stringify(result));
                setFileScanning(false);
                doneRef.current = false; // reset so handleSuccess isn't blocked
                handleSuccess(result);
            } finally {
                document.body.removeChild(tmpDiv);
            }
        } catch (err: any) {
            const msg = err?.message ?? String(err);
            dbg(`ZXing scanFile error: ${msg}`);
            // Both JS decoders failed — try server-side pyzbar (handles compressed/rotated images)
            dbg("Trying server-side pyzbar decode…");
            try {
                const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
                const form = new FormData();
                form.append("file", file, file.name);
                const res = await fetch(`${BASE_URL}/decode-barcode`, { method: "POST", body: form });
                if (res.ok) {
                    const json = await res.json();
                    if (json.found && json.raw_bytes_b64) {
                        dbg(`Server pyzbar OK: type=${json.type} bytes=${json.raw_bytes_b64.length}`);
                        // Decode base64 → Uint8Array and pass directly to NRV2E decoder
                        const binaryStr = atob(json.raw_bytes_b64);
                        const rawBytes = new Uint8Array(binaryStr.length);
                        for (let i = 0; i < binaryStr.length; i++) rawBytes[i] = binaryStr.charCodeAt(i);
                        // Try Aztec NRV2E decode first, then fall back to string
                        let decodedStr = json.raw_string ?? "";
                        try {
                            const aztecData = decodeRegistrationBytes(rawBytes);
                            if (aztecData.vin || aztecData.make || aztecData.registrationPlates) {
                                dbg(`Server Aztec OK — VIN:${aztecData.vin ?? "?"} make:${aztecData.make ?? "?"}`);
                                setFileScanning(false);
                                // Apply data directly without going through handleSuccess string path
                                setDecoded(aztecData);
                                setStatus("success");
                                setMessage("Dane odczytane pomyślnie!");
                                try { await scannerRef.current?.stop(); } catch { /* ok */ }
                                setTimeout(() => { onData(aztecData); onClose(); }, 6000);
                                return;
                            }
                        } catch { /* not Aztec NRV2E — use raw_string path */ }
                        // Fall back to handleSuccess with the raw string
                        setFileScanning(false);
                        doneRef.current = false;
                        handleSuccess(decodedStr);
                        return;
                    }
                    dbg("Server pyzbar: no barcode found in image");
                } else {
                    dbg(`Server pyzbar HTTP error: ${res.status}`);
                }
            } catch (serverErr: any) {
                dbg(`Server pyzbar error: ${serverErr?.message ?? serverErr}`);
            }
            setFileScanning(false);
            setStatus("error");
            setMessage(`Nie udało się odczytać kodu z obrazu. Spróbuj wyraźniejsze zdjęcie.`);
            setTimeout(() => {
                setStatus("scanning");
                setMessage("Nakieruj kamerę na kod Aztec lub QR z dowodu rejestracyjnego");
            }, 3000);
        }
    }, [dbg, handleSuccess, onData, onClose]);

    /* ── mount / unmount scanner ── */
    useEffect(() => {
        let alive = true;
        let sc: any = null;
        let started = false;

        (async () => {
            try {
                // 1. HTTPS check
                const proto = typeof window !== "undefined" ? window.location.protocol : "?";
                const host  = typeof window !== "undefined" ? window.location.hostname  : "?";
                const isSecure = proto === "https:" || host === "localhost" || host === "127.0.0.1";
                dbg(`HTTPS: ${proto}//${host} → ${isSecure ? "OK" : "FAIL"}`);

                if (!isSecure) {
                    throw Object.assign(new Error("HTTPS required"), { _httpsError: true });
                }

                // 2. Load library
                dbg("Loading html5-qrcode…");
                const { Html5Qrcode } = await import("html5-qrcode");
                if (!alive) return;
                dbg("Library loaded");

                // 3. DOM element
                const el = document.getElementById(idRef.current);
                dbg(`DOM element: ${el ? "found" : "MISSING"}`);
                if (!el) throw new Error("Scanner container not found in DOM");

                // 4. Construct scanner
                dbg("Constructing scanner…");
                sc = new Html5Qrcode(idRef.current, { verbose: false });
                scannerRef.current = sc;
                dbg("Scanner constructed");

                // 5. Start
                dbg("Calling start()…");
                await sc.start(
                    { facingMode: "environment" },
                    {
                        fps: 10,
                        // aspectRatio:1 forces a SQUARE video frame.
                        // Without it the camera is 16:9 landscape (~390×219 px).
                        // Any square qrbox in a 390×219 frame looks narrow — the
                        // box is constrained by height (219), not width (390).
                        // With a square frame the box fills ~85% of both dimensions.
                        aspectRatio: 1,
                        qrbox: (w: number, h: number) => {
                            // Both w and h are now ~equal (square video).
                            // Use 85% of the smaller just as a safe guard.
                            const side = Math.floor(Math.min(w, h) * 0.85);
                            dbg(`qrbox: viewfinder ${w}×${h} → box ${side}×${side}`);
                            return { width: side, height: side };
                        },
                    },
                    handleSuccess,
                    (errMsg: string) => {
                        setAttempts(n => n + 1);
                        setLastFailReason(errMsg);
                    },
                );
                started = true;
                dbg("start() OK — scanning");

                // ── Parallel native BarcodeDetector loop ──────────────────────
                // ZXing (html5-qrcode default) often fails on real-world codes.
                // Chrome/Android's native BarcodeDetector is much more reliable.
                // Run it in parallel: whichever detects first calls handleSuccess.
                const BDClass = (window as any).BarcodeDetector as any;
                if (typeof BDClass !== "undefined") {
                    dbg("BarcodeDetector: available — starting parallel loop");
                    const bd = new BDClass({ formats: ["qr_code", "aztec", "data_matrix", "code_128", "code_39", "ean_13"] });
                    const getVideo = () => document.querySelector(`#${idRef.current} video`) as HTMLVideoElement | null;

                    const bdLoop = async () => {
                        if (!alive || doneRef.current) return;
                        const video = getVideo();
                        if (video && video.readyState >= 2) {
                            try {
                                const codes = await bd.detect(video);
                                if (codes.length > 0 && codes[0].rawValue) {
                                    dbg(`BarcodeDetector: found "${codes[0].rawValue.slice(0, 40)}"`);
                                    handleSuccess(codes[0].rawValue);
                                    return;
                                }
                            } catch (e: any) {
                                // detect() throws when no code found — normal, ignore
                            }
                        }
                        if (alive && !doneRef.current) {
                            setTimeout(bdLoop, 200); // ~5 fps is enough
                        }
                    };
                    setTimeout(bdLoop, 500); // give camera 500ms to warm up
                } else {
                    dbg("BarcodeDetector: NOT available — ZXing only");
                }
            } catch (err: any) {
                const msg = err?.message || String(err);
                dbg(`ERROR: ${msg}`);
                console.error("[QR] camera error", err);
                if (alive) {
                    setStatus("error");
                    if (err?._httpsError) {
                        setMessage("Kamera wymaga połączenia HTTPS. Skontaktuj się z administratorem.");
                    } else {
                        setMessage(`Błąd: ${msg}`);
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
    }, [handleSuccess, dbg]);

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
                    className="w-full rounded-2xl overflow-hidden border-2 border-primary/40"
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
                    <p className="mt-3 text-[10px] text-white/40 font-bold uppercase tracking-widest text-center max-w-[280px]">
                        Kod Aztec (odwrót dowodu rej.) lub zwykły kod QR z numerem VIN
                    </p>
                )}

                {/* ── debug panel ── */}
                <div className="mt-3 w-full bg-black/60 border border-white/10 rounded-xl p-3 space-y-1">
                    {debugLines.map((l, i) => (
                        <p key={i} className="text-[10px] font-mono text-white/60 break-all">{l}</p>
                    ))}
                    {attempts > 0 && (
                        <p className="text-[10px] font-mono text-white/40">
                            Frames: {attempts}
                        </p>
                    )}
                    {lastFailReason && (
                        <p className="text-[10px] font-mono text-red-400/80 break-all">
                            Last error: {lastFailReason}
                        </p>
                    )}
                    {debugLines.length === 0 && attempts === 0 && (
                        <p className="text-[10px] font-mono text-white/30 italic">Initializing…</p>
                    )}
                </div>

                {/* ── image upload — primary fallback for screen-displayed codes ── */}
                {status === "scanning" && (
                    <div className="mt-4 w-full">
                        <p className="text-[10px] text-white/30 text-center mb-2 uppercase tracking-widest">
                            Kod wyświetlony na ekranie? Wyślij zdjęcie na telefon i wybierz:
                        </p>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={fileScanning}
                            className="w-full flex items-center justify-center gap-2 py-3 bg-white/10 hover:bg-white/15 border border-white/20 rounded-xl text-sm font-bold text-white active:scale-95 transition-all disabled:opacity-50"
                        >
                            {fileScanning
                                ? <><Loader2 size={16} className="animate-spin" /> Odczytuję obraz…</>
                                : <><ImagePlus size={16} /> Wybierz zdjęcie kodu QR / Aztec</>
                            }
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleFileSelect}
                        />
                    </div>
                )}

                {/* manual fallback */}
                {status === "scanning" && !showManual && (
                    <button
                        onClick={() => setShowManual(true)}
                        className="mt-3 flex items-center gap-2 text-xs text-white/30 hover:text-white/60 transition-colors"
                    >
                        <Keyboard size={14} />
                        Wpisz VIN ręcznie
                    </button>
                )}

                {showManual && status === "scanning" && (
                    <div className="mt-4 w-full flex gap-2">
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
