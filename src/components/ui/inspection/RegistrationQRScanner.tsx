"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, QrCode, Loader2, CheckCircle2, AlertCircle, Keyboard, ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Convert raw scanner output (string) to Base64.
 * Scanners (ZXing / BarcodeDetector) represent binary Aztec payloads as
 * Latin-1 strings — each charCode IS the byte value (0-255).
 */
function rawToBase64(raw: string): string {
    // Build bytes from charCodes (Latin-1)
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) & 0xff;
    // Convert to Base64 in chunks (avoid stack overflow for large payloads)
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = Array.from(bytes.slice(i, i + chunkSize));
        binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
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
 * Send Base64 payload to the Next.js API route for server-side decoding
 * using the polish-vehicle-registration-certificate-decoder npm package.
 */
async function decodeViaAPI(base64: string): Promise<DecodedVehicleData | null> {
    try {
        const res = await fetch("/api/decode-registration", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ aztecBase64: base64 }),
        });
        if (!res.ok) return null;
        const json = await res.json();
        if (!json.ok || !json.result) return null;
        const r = json.result;
        const data: DecodedVehicleData = {};
        if (r.vin) data.vin = r.vin;
        if (r.registrationPlates) data.registrationPlates = r.registrationPlates;
        if (r.make) data.make = r.make;
        if (r.model) data.model = r.model;
        if (r.year) data.year = r.year;
        if (r.engineCapacity) data.engineCapacity = r.engineCapacity;
        if (r.enginePower) data.enginePower = r.enginePower;
        if (r.fuelType) data.fuelType = r.fuelType;
        if (r.ownWeight) data.ownWeight = r.ownWeight;
        if (r.totalWeight) data.totalWeight = r.totalWeight;
        if (r.seatsCount) data.seatsCount = r.seatsCount;
        if (r.firstRegistration) data.firstRegistration = r.firstRegistration;
        return data;
    } catch {
        return null;
    }
}

/**
 * Heuristic: does this string look like binary Aztec data (not readable text)?
 */
function looksLikeBinary(text: string): boolean {
    if (text.length < 20) return false;
    let controlChars = 0;
    for (let i = 0; i < Math.min(text.length, 50); i++) {
        const c = text.charCodeAt(i);
        if (c < 32 || c > 126) controlChars++;
    }
    return controlChars > 5;
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
    const [message, setMessage] = useState("Nakieruj kamer\u0119 na kod Aztec lub QR z dowodu rejestracyjnego");
    const [decoded, setDecoded] = useState<DecodedVehicleData | null>(null);
    const [showManual, setShowManual] = useState(false);
    const [manualText, setManualText] = useState("");
    const [fileScanning, setFileScanning] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const scannerRef = useRef<any>(null);
    const idRef = useRef(`qr-reader-${Date.now()}`);
    const doneRef = useRef(false);

    const dbg = useCallback((line: string) => {
        console.log("[QR-DBG]", line);
    }, []);

    /* ── Process decoded text (from any source: camera, file, manual) ── */
    const handleSuccess = useCallback(
        async (decodedText: string) => {
            if (doneRef.current) return;
            doneRef.current = true;

            dbg(`Detected! len=${decodedText.length} preview="${decodedText.slice(0, 60)}"`);

            let data: DecodedVehicleData | null = null;

            // Path 1: Binary Aztec → decode via server-side API
            if (looksLikeBinary(decodedText)) {
                dbg("Looks like binary Aztec — sending to /api/decode-registration");
                const base64 = rawToBase64(decodedText);
                dbg(`Base64 payload: ${base64.length} chars`);
                data = await decodeViaAPI(base64);
                if (data && (data.vin || data.make || data.registrationPlates)) {
                    dbg(`API decode OK — VIN:${data.vin ?? "?"} make:${data.make ?? "?"}`);
                } else {
                    dbg("API decode returned no useful fields — trying UTF-8 encoding");
                    // Try UTF-8 re-encoding (some browsers encode binary via UTF-8)
                    const utf8Bytes = new TextEncoder().encode(decodedText);
                    let utf8Binary = "";
                    const chunkSize = 8192;
                    for (let i = 0; i < utf8Bytes.length; i += chunkSize) {
                        const chunk = Array.from(utf8Bytes.slice(i, i + chunkSize));
                        utf8Binary += String.fromCharCode.apply(null, chunk);
                    }
                    const utf8Base64 = btoa(utf8Binary);
                    data = await decodeViaAPI(utf8Base64);
                    if (data && (data.vin || data.make || data.registrationPlates)) {
                        dbg(`API decode OK (UTF-8) — VIN:${data.vin ?? "?"}`);
                    } else {
                        data = null;
                        dbg("API decode failed for both encodings");
                    }
                }
            }

            // Path 2: Might be Base64 already (e.g. from another scanner)
            if (!data && /^[A-Za-z0-9+/=]{20,}$/.test(decodedText.trim())) {
                dbg("Looks like Base64 — trying direct API decode");
                data = await decodeViaAPI(decodedText.trim());
                if (data && (data.vin || data.make || data.registrationPlates)) {
                    dbg(`Direct Base64 decode OK — VIN:${data.vin ?? "?"}`);
                } else {
                    data = null;
                }
            }

            // Path 3: Plain text QR (VIN, JSON, etc.)
            if (!data) {
                const plainData = parsePlainTextQR(decodedText);
                if (plainData.vin || plainData.make || plainData.registrationPlates) {
                    data = plainData;
                    dbg(`Plain text OK — VIN:${plainData.vin ?? "?"} plates:${plainData.registrationPlates ?? "?"}`);
                }
            }

            // Path 4: Unknown format — show raw text
            if (!data) {
                dbg(`No structured data — rawText: "${decodedText.slice(0, 80)}"`);
                data = { rawText: decodedText.slice(0, 200) };
            }

            setDecoded(data);
            setStatus("success");
            setMessage(
                data.rawText && !data.vin && !data.make
                    ? "Zeskanowano \u2014 sprawdź dane poniżej"
                    : "Dane odczytane pomyślnie!",
            );

            // stop camera
            try { await scannerRef.current?.stop(); } catch { /* ok */ }

            // auto-apply after short preview
            setTimeout(() => { onData(data!); onClose(); }, 2500);
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
        e.target.value = "";

        setFileScanning(true);
        dbg(`File: ${file.name} (${file.type}, ${(file.size / 1024).toFixed(0)} KB)`);

        // Path 1 — native BarcodeDetector
        const BDClass = (window as any).BarcodeDetector as any;
        if (BDClass) {
            try {
                const bd = new BDClass({ formats: ["qr_code", "aztec", "data_matrix", "code_128", "code_39", "ean_13"] });
                const bitmap = await createImageBitmap(file);
                const codes = await bd.detect(bitmap);
                bitmap.close();
                if (codes.length > 0 && codes[0].rawValue) {
                    const raw = codes[0].rawValue;
                    dbg(`File BarcodeDetector OK: len=${raw.length}`);
                    setFileScanning(false);
                    doneRef.current = false;
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
            dbg("ZXing scanFile...");
            const { Html5Qrcode } = await import("html5-qrcode");
            const tmpId = `qr-tmp-${Date.now()}`;
            const tmpDiv = document.createElement("div");
            tmpDiv.id = tmpId;
            tmpDiv.style.display = "none";
            document.body.appendChild(tmpDiv);
            try {
                const tmpScanner = new Html5Qrcode(tmpId, { verbose: false });
                const result = await tmpScanner.scanFile(file, false);
                dbg(`ZXing scanFile OK: len=${result.length}`);
                setFileScanning(false);
                doneRef.current = false;
                handleSuccess(result);
            } finally {
                document.body.removeChild(tmpDiv);
            }
        } catch (err: any) {
            const msg = err?.message ?? String(err);
            dbg(`ZXing scanFile error: ${msg}`);

            // Path 3 — server-side pyzbar (handles compressed/rotated images)
            dbg("Trying server-side pyzbar decode...");
            try {
                const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
                const form = new FormData();
                form.append("file", file, file.name);
                const res = await fetch(`${BASE_URL}/decode-barcode`, { method: "POST", body: form });
                if (res.ok) {
                    const json = await res.json();
                    if (json.found && json.raw_bytes_b64) {
                        dbg(`Server pyzbar OK: type=${json.type} bytes=${json.raw_bytes_b64.length}`);
                        // Send the raw bytes Base64 directly to the decoder API
                        const apiData = await decodeViaAPI(json.raw_bytes_b64);
                        if (apiData && (apiData.vin || apiData.make || apiData.registrationPlates)) {
                            dbg(`Server → API decode OK — VIN:${apiData.vin ?? "?"}`);
                            setFileScanning(false);
                            setDecoded(apiData);
                            setStatus("success");
                            setMessage("Dane odczytane pomyślnie!");
                            try { await scannerRef.current?.stop(); } catch { /* ok */ }
                            setTimeout(() => { onData(apiData); onClose(); }, 2500);
                            return;
                        }
                        // Fall back to raw string from pyzbar
                        if (json.raw_string) {
                            setFileScanning(false);
                            doneRef.current = false;
                            handleSuccess(json.raw_string);
                            return;
                        }
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
            setMessage("Nie udało się odczytać kodu z obrazu. Spróbuj wyraźniejsze zdjęcie.");
            setTimeout(() => {
                setStatus("scanning");
                setMessage("Nakieruj kamer\u0119 na kod Aztec lub QR z dowodu rejestracyjnego");
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
                dbg("Loading html5-qrcode...");
                const { Html5Qrcode } = await import("html5-qrcode");
                if (!alive) return;
                dbg("Library loaded");

                // 3. DOM element
                const el = document.getElementById(idRef.current);
                dbg(`DOM element: ${el ? "found" : "MISSING"}`);
                if (!el) throw new Error("Scanner container not found in DOM");

                // 4. Construct scanner
                sc = new Html5Qrcode(idRef.current, { verbose: false });
                scannerRef.current = sc;

                // 5. Start camera
                dbg("Starting camera...");
                await sc.start(
                    { facingMode: "environment" },
                    {
                        fps: 10,
                        aspectRatio: 1,
                        qrbox: (w: number, h: number) => {
                            const side = Math.floor(Math.min(w, h) * 0.9);
                            return { width: side, height: side };
                        },
                    },
                    handleSuccess,
                    () => { /* per-frame scan miss — normal */ },
                );
                started = true;
                dbg("Camera started — scanning");

                // ── Parallel native BarcodeDetector loop ──
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
                            } catch {
                                // detect() throws when no code found — normal
                            }
                        }
                        if (alive && !doneRef.current) {
                            setTimeout(bdLoop, 200);
                        }
                    };
                    setTimeout(bdLoop, 500);
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
                        setMessage("Kamera wymaga po\u0142\u0105czenia HTTPS. Skontaktuj si\u0119 z administratorem.");
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
                    if (started) sc.stop().catch(() => {});
                    sc.clear();
                } catch {
                    // scanner cleanup — safe to ignore
                }
            }
        };
    }, [handleSuccess, dbg]);

    /* ── UI ── */
    return (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
            {/* header */}
            <div className="flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur-md border-b border-white/10 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <QrCode size={20} className="text-primary" />
                    <span className="text-white font-black text-sm uppercase tracking-tight">
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

            {/* camera */}
            <div className="flex-1 flex flex-col items-center justify-center min-h-0">
                <div
                    id={idRef.current}
                    className="w-full h-full"
                    style={{ maxHeight: "calc(100vh - 180px)" }}
                />
            </div>

            {/* bottom bar */}
            <div className="flex-shrink-0 px-4 pb-6 pt-3 space-y-3 bg-black/80">
                {/* status pill */}
                <div className={cn(
                    "flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-2xl text-sm font-bold transition-colors",
                    status === "scanning" && "bg-white/10 text-white",
                    status === "success" && "bg-emerald-500/20 text-emerald-400",
                    status === "error" && "bg-red-500/20 text-red-400",
                )}>
                    {status === "scanning" && <Loader2 size={16} className="animate-spin" />}
                    {status === "success" && <CheckCircle2 size={16} />}
                    {status === "error" && <AlertCircle size={16} />}
                    <span>{message}</span>
                </div>

                {/* decoded preview */}
                {decoded && status === "success" && (
                    <div className="w-full bg-white/5 rounded-2xl px-4 py-3 space-y-1.5 animate-in fade-in slide-in-from-bottom-4">
                        {decoded.vin && <Row label="VIN" value={decoded.vin} />}
                        {decoded.registrationPlates && <Row label="Nr rej." value={decoded.registrationPlates} />}
                        {decoded.make && <Row label="Marka" value={decoded.make} />}
                        {decoded.model && <Row label="Model" value={decoded.model} />}
                        {decoded.year && <Row label="Rok" value={decoded.year} />}
                    </div>
                )}

                {status === "scanning" && (
                    <div className="flex items-center gap-2">
                        {/* image upload */}
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={fileScanning}
                            className="flex items-center justify-center gap-1.5 py-2.5 px-4 bg-white/10 hover:bg-white/15 border border-white/20 rounded-xl text-xs font-bold text-white active:scale-95 transition-all disabled:opacity-50 flex-1"
                        >
                            {fileScanning
                                ? <><Loader2 size={14} className="animate-spin" /> Odczytuję...</>
                                : <><ImagePlus size={14} /> Wybierz zdjęcie</>
                            }
                        </button>
                        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

                        {/* manual VIN */}
                        <button
                            onClick={() => setShowManual(!showManual)}
                            className="flex items-center justify-center gap-1.5 py-2.5 px-4 bg-white/10 hover:bg-white/15 border border-white/20 rounded-xl text-xs font-bold text-white active:scale-95 transition-all flex-1"
                        >
                            <Keyboard size={14} />
                            Wpisz VIN
                        </button>
                    </div>
                )}

                {showManual && status === "scanning" && (
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={manualText}
                            onChange={e => setManualText(e.target.value.toUpperCase())}
                            onKeyDown={e => e.key === "Enter" && handleManualSubmit()}
                            placeholder="Wpisz lub wklej VIN (17 znaków)"
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
