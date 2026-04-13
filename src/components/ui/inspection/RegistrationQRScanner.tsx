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
    rawText?: string;
}

/* ═══════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════ */

function rawToBase64(raw: string): string {
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) & 0xff;
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = Array.from(bytes.slice(i, i + chunkSize));
        binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = Array.from(bytes.slice(i, i + chunkSize));
        binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
}

function parsePlainTextQR(text: string): DecodedVehicleData {
    const result: DecodedVehicleData = {};
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
    } catch { /* not JSON */ }

    if (!result.vin) {
        const m = text.match(/\b([A-HJ-NPR-Z0-9]{17})\b/i);
        if (m) result.vin = m[1].toUpperCase();
    }
    if (!result.registrationPlates) {
        const m = text.match(/\b([A-Z]{2,3}[\s]?[A-Z0-9]{4,5})\b/i);
        if (m) result.registrationPlates = m[1].toUpperCase().replace(/\s+/g, "");
    }
    return result;
}

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

function looksLikeBinary(text: string): boolean {
    if (text.length < 20) return false;
    let controlChars = 0;
    for (let i = 0; i < Math.min(text.length, 50); i++) {
        const c = text.charCodeAt(i);
        if (c < 32 || c > 126) controlChars++;
    }
    return controlChars > 5;
}

/**
 * Upload image to backend /decode-barcode for server-side Aztec decoding
 * (uses zxing-cpp which properly supports Aztec, unlike pyzbar).
 */
async function decodeImageServerSide(file: File, dbg: (s: string) => void): Promise<DecodedVehicleData | null> {
    try {
        const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const form = new FormData();
        form.append("file", file, file.name);
        const res = await fetch(`${BASE_URL}/decode-barcode`, { method: "POST", body: form });
        if (!res.ok) {
            dbg(`Server decode HTTP error: ${res.status}`);
            return null;
        }
        const json = await res.json();
        if (!json.found) {
            dbg("Server decode: no barcode found");
            return null;
        }
        dbg(`Server decode OK: type=${json.type} bytes=${json.raw_bytes_b64?.length ?? 0}`);
        // If server returned raw bytes, decode via the npm decoder API
        if (json.raw_bytes_b64) {
            const apiData = await decodeViaAPI(json.raw_bytes_b64);
            if (apiData && (apiData.vin || apiData.make || apiData.registrationPlates)) {
                dbg(`Server → API decode OK — VIN:${apiData.vin ?? "?"}`);
                return apiData;
            }
        }
        // Fall back to raw string
        if (json.raw_string) {
            const plain = parsePlainTextQR(json.raw_string);
            if (plain.vin || plain.make || plain.registrationPlates) return plain;
        }
        return null;
    } catch (err: any) {
        dbg(`Server decode error: ${err?.message ?? err}`);
        return null;
    }
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
    const videoRef = useRef<HTMLVideoElement>(null);
    const controlsRef = useRef<any>(null);
    const doneRef = useRef(false);

    const dbg = useCallback((line: string) => {
        console.log("[QR-DBG]", line);
    }, []);

    /* ── Process scan result ── */
    const handleSuccess = useCallback(
        async (decodedText: string, rawBytes?: Uint8Array) => {
            if (doneRef.current) return;
            doneRef.current = true;

            dbg(`Detected! len=${decodedText.length} rawBytes=${rawBytes?.length ?? "none"}`);

            let data: DecodedVehicleData | null = null;

            // Path 1: If we have raw bytes from ZXing, convert directly to Base64
            if (rawBytes && rawBytes.length > 20) {
                dbg("Have raw bytes from ZXing — sending to /api/decode-registration");
                const base64 = bytesToBase64(rawBytes);
                data = await decodeViaAPI(base64);
                if (data && (data.vin || data.make || data.registrationPlates)) {
                    dbg(`Raw bytes decode OK — VIN:${data.vin ?? "?"} make:${data.make ?? "?"}`);
                } else {
                    data = null;
                    dbg("Raw bytes decode — no useful fields");
                }
            }

            // Path 2: Binary Aztec string → decode via API
            if (!data && looksLikeBinary(decodedText)) {
                dbg("Looks like binary Aztec — sending to /api/decode-registration");
                const base64 = rawToBase64(decodedText);
                data = await decodeViaAPI(base64);
                if (data && (data.vin || data.make || data.registrationPlates)) {
                    dbg(`API decode OK — VIN:${data.vin ?? "?"}`);
                } else {
                    // Try UTF-8 re-encoding
                    const utf8Bytes = new TextEncoder().encode(decodedText);
                    const utf8Base64 = bytesToBase64(utf8Bytes);
                    data = await decodeViaAPI(utf8Base64);
                    if (data && (data.vin || data.make || data.registrationPlates)) {
                        dbg(`API decode OK (UTF-8) — VIN:${data.vin ?? "?"}`);
                    } else {
                        data = null;
                    }
                }
            }

            // Path 3: Might be Base64 already
            if (!data && /^[A-Za-z0-9+/=]{20,}$/.test(decodedText.trim())) {
                data = await decodeViaAPI(decodedText.trim());
                if (data && (data.vin || data.make || data.registrationPlates)) {
                    dbg(`Direct Base64 decode OK — VIN:${data.vin ?? "?"}`);
                } else {
                    data = null;
                }
            }

            // Path 4: Plain text QR (VIN, JSON, etc.)
            if (!data) {
                const plainData = parsePlainTextQR(decodedText);
                if (plainData.vin || plainData.make || plainData.registrationPlates) {
                    data = plainData;
                    dbg(`Plain text OK — VIN:${plainData.vin ?? "?"}`);
                }
            }

            // Path 5: Unknown format
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
            try { controlsRef.current?.stop(); } catch { /* ok */ }

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

        // Path 1 — dedicated Aztec reader first (Polish registration certs are Aztec)
        try {
            dbg("ZXing BrowserAztecCodeReader decodeFromImageUrl...");
            const { BrowserAztecCodeReader } = await import("@zxing/browser");
            const { DecodeHintType } = await import("@zxing/library");
            const hints = new Map<any, any>();
            hints.set(DecodeHintType.TRY_HARDER, true);
            const aztecReader = new BrowserAztecCodeReader(hints);
            const imgUrl = URL.createObjectURL(file);
            try {
                const result = await aztecReader.decodeFromImageUrl(imgUrl);
                if (result) {
                    const text = result.getText();
                    const rawBytes = result.getRawBytes();
                    dbg(`Aztec reader OK: len=${text.length} rawBytes=${rawBytes?.length ?? 0}`);
                    setFileScanning(false);
                    doneRef.current = false;
                    handleSuccess(text, rawBytes ? new Uint8Array(rawBytes) : undefined);
                    URL.revokeObjectURL(imgUrl);
                    return;
                }
            } catch (err: any) {
                dbg(`Aztec reader file miss: ${err?.message ?? err}`);
            } finally {
                URL.revokeObjectURL(imgUrl);
            }
        } catch (err: any) {
            dbg(`Aztec reader load error: ${err?.message ?? err}`);
        }

        // Path 1b — generic multi-format with hints (QR, DataMatrix, etc.)
        try {
            dbg("ZXing BrowserMultiFormatReader decodeFromImageUrl (hinted)...");
            const { BrowserMultiFormatReader } = await import("@zxing/browser");
            const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");
            const hints = new Map<any, any>();
            hints.set(DecodeHintType.POSSIBLE_FORMATS, [
                BarcodeFormat.AZTEC,
                BarcodeFormat.QR_CODE,
                BarcodeFormat.DATA_MATRIX,
                BarcodeFormat.PDF_417,
                BarcodeFormat.CODE_128,
            ]);
            hints.set(DecodeHintType.TRY_HARDER, true);
            const reader = new BrowserMultiFormatReader(hints);
            const imgUrl = URL.createObjectURL(file);
            try {
                const result = await reader.decodeFromImageUrl(imgUrl);
                if (result) {
                    const text = result.getText();
                    const rawBytes = result.getRawBytes();
                    dbg(`MultiFormat file OK: len=${text.length} rawBytes=${rawBytes?.length ?? 0}`);
                    setFileScanning(false);
                    doneRef.current = false;
                    handleSuccess(text, rawBytes ? new Uint8Array(rawBytes) : undefined);
                    return;
                }
            } finally {
                URL.revokeObjectURL(imgUrl);
            }
        } catch (err: any) {
            dbg(`MultiFormat file error: ${err?.message ?? err}`);
        }

        // Path 2 — native BarcodeDetector
        const BDClass = (window as any).BarcodeDetector as any;
        if (BDClass) {
            try {
                const bd = new BDClass({ formats: ["qr_code", "aztec", "data_matrix", "code_128", "code_39", "ean_13"] });
                const bitmap = await createImageBitmap(file);
                const codes = await bd.detect(bitmap);
                bitmap.close();
                if (codes.length > 0 && codes[0].rawValue) {
                    dbg(`File BarcodeDetector OK: len=${codes[0].rawValue.length}`);
                    setFileScanning(false);
                    doneRef.current = false;
                    handleSuccess(codes[0].rawValue);
                    return;
                }
                dbg("File BarcodeDetector: no code found");
            } catch (err: any) {
                dbg(`File BarcodeDetector error: ${err.message ?? err}`);
            }
        }

        // Path 3 — server-side decode (zxing-cpp on backend)
        dbg("Trying server-side decode...");
        const serverData = await decodeImageServerSide(file, dbg);
        if (serverData) {
            setFileScanning(false);
            setDecoded(serverData);
            setStatus("success");
            setMessage("Dane odczytane pomyślnie!");
            try { controlsRef.current?.stop(); } catch { /* ok */ }
            setTimeout(() => { onData(serverData); onClose(); }, 2500);
            return;
        }

        // All paths failed
        setFileScanning(false);
        setStatus("error");
        setMessage("Nie udało się odczytać kodu z obrazu. Spróbuj wyraźniejsze zdjęcie.");
        setTimeout(() => {
            setStatus("scanning");
            setMessage("Nakieruj kamer\u0119 na kod Aztec lub QR z dowodu rejestracyjnego");
        }, 3000);
    }, [dbg, handleSuccess, onData, onClose]);

    /* ── mount / unmount camera scanner ── */
    useEffect(() => {
        let alive = true;

        (async () => {
            try {
                const proto = typeof window !== "undefined" ? window.location.protocol : "?";
                const host  = typeof window !== "undefined" ? window.location.hostname  : "?";
                const isSecure = proto === "https:" || host === "localhost" || host === "127.0.0.1";
                dbg(`HTTPS: ${proto}//${host} → ${isSecure ? "OK" : "FAIL"}`);
                if (!isSecure) {
                    throw Object.assign(new Error("HTTPS required"), { _httpsError: true });
                }

                // Use @zxing/browser for camera scanning — proper Aztec support
                dbg("Loading @zxing/browser...");
                const { BrowserMultiFormatReader } = await import("@zxing/browser");
                const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");
                if (!alive) return;

                // Hints: only scan formats we care about, use TRY_HARDER for tough codes.
                // This makes Aztec detection far more reliable on blurry phone photos
                // of Polish vehicle registration certificates.
                const hints = new Map<any, any>();
                hints.set(DecodeHintType.POSSIBLE_FORMATS, [
                    BarcodeFormat.AZTEC,
                    BarcodeFormat.QR_CODE,
                    BarcodeFormat.DATA_MATRIX,
                    BarcodeFormat.PDF_417,
                    BarcodeFormat.CODE_128,
                ]);
                hints.set(DecodeHintType.TRY_HARDER, true);

                const reader = new BrowserMultiFormatReader(hints, {
                    delayBetweenScanAttempts: 100,
                    delayBetweenScanSuccess: 500,
                });
                const videoEl = videoRef.current;
                if (!videoEl) throw new Error("Video element not found");

                // Prefer rear camera with high resolution for sharper Aztec decoding
                let deviceId: string | undefined;
                try {
                    const devices = await (BrowserMultiFormatReader as any).listVideoInputDevices?.();
                    if (Array.isArray(devices) && devices.length > 0) {
                        const rear = devices.find((d: any) =>
                            /back|rear|environment/i.test(d.label || "")
                        );
                        deviceId = (rear ?? devices[devices.length - 1]).deviceId;
                        dbg(`Cameras: ${devices.length}, using ${rear ? "rear" : "last"}: "${(rear ?? devices[devices.length - 1]).label}"`);
                    }
                } catch (err: any) {
                    dbg(`listVideoInputDevices err: ${err?.message ?? err}`);
                }

                dbg("Starting camera via ZXing...");
                const controls = await reader.decodeFromVideoDevice(
                    deviceId,
                    videoEl,
                    (result, error) => {
                        if (!alive || doneRef.current) return;
                        if (result) {
                            const text = result.getText();
                            const rawBytes = result.getRawBytes();
                            dbg(`ZXing camera detected: len=${text.length}`);
                            handleSuccess(text, rawBytes ? new Uint8Array(rawBytes) : undefined);
                        }
                        // error on each frame with no detection is normal — ignore
                    },
                );
                controlsRef.current = controls;
                dbg("Camera started — scanning with ZXing (Aztec + QR hinted, TRY_HARDER)");

                // ── Also run native BarcodeDetector in parallel (more reliable on some devices) ──
                const BDClass = (window as any).BarcodeDetector as any;
                if (typeof BDClass !== "undefined") {
                    dbg("BarcodeDetector: available — starting parallel loop");
                    const bd = new BDClass({ formats: ["qr_code", "aztec", "data_matrix", "code_128", "code_39", "ean_13"] });

                    const bdLoop = async () => {
                        if (!alive || doneRef.current) return;
                        if (videoEl && videoEl.readyState >= 2) {
                            try {
                                const codes = await bd.detect(videoEl);
                                if (codes.length > 0 && codes[0].rawValue) {
                                    dbg(`BarcodeDetector: found "${codes[0].rawValue.slice(0, 40)}"`);
                                    handleSuccess(codes[0].rawValue);
                                    return;
                                }
                            } catch { /* normal when no code found */ }
                        }
                        if (alive && !doneRef.current) setTimeout(bdLoop, 200);
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
                        setMessage(`B\u0142\u0105d: ${msg}`);
                    }
                }
            }
        })();

        return () => {
            alive = false;
            try { controlsRef.current?.stop(); } catch { /* ok */ }
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
            <div className="flex-1 flex flex-col items-center justify-center min-h-0 bg-black relative">
                <video
                    ref={videoRef}
                    className="w-full h-full object-contain"
                    style={{ maxHeight: "calc(100vh - 180px)" }}
                    playsInline
                    muted
                    autoPlay
                />
                {/* Scan reticle to help the user frame the Aztec code */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="w-64 h-64 border-2 border-primary/70 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                </div>
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

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between items-center">
            <span className="text-[10px] font-black text-white/50 uppercase">{label}</span>
            <span className="text-xs font-bold text-white">{value}</span>
        </div>
    );
}
