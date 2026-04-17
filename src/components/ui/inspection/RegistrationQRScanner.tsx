"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, QrCode, Loader2, CheckCircle2, AlertCircle, Keyboard, ImagePlus, Bug } from "lucide-react";
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

function hasUsefulFields(d: DecodedVehicleData | null | undefined): d is DecodedVehicleData {
    if (!d) return false;
    const vin = (d.vin || "").trim();
    if (vin.length === 17) return true;
    if (d.make && d.make.length >= 2) return true;
    if (d.registrationPlates && d.registrationPlates.length >= 4) return true;
    return false;
}

/**
 * Ask the /api/decode-registration route to decode an Aztec payload.
 * We send every possible interpretation we have — the route tries each
 * one and returns the first that produces a valid record.
 */
async function decodeViaAPI(
    payload: { aztecBase64?: string; rawText?: string; rawBytes?: number[] },
    dbg: (s: string) => void,
): Promise<DecodedVehicleData | null> {
    try {
        const res = await fetch("/api/decode-registration", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const text = await res.text();
        let json: any = null;
        try { json = JSON.parse(text); } catch { /* non-JSON */ }

        if (!res.ok) {
            dbg(`API ${res.status}: ${text.slice(0, 140)}`);
            return null;
        }
        if (!json?.ok || !json?.result) {
            dbg(`API not-ok: ${text.slice(0, 140)}`);
            return null;
        }
        dbg(`API OK via "${json.picked}"`);
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
    } catch (err: any) {
        dbg(`API fetch error: ${err?.message ?? err}`);
        return null;
    }
}

/**
 * Upload image to backend /decode-barcode for server-side Aztec decoding
 * (uses zxing-cpp which properly supports Aztec, unlike pyzbar).
 * Only useful when a Python backend is configured.
 */
async function decodeImageServerSide(file: File, dbg: (s: string) => void): Promise<DecodedVehicleData | null> {
    try {
        const BASE_URL = process.env.NEXT_PUBLIC_API_URL;
        if (!BASE_URL) {
            dbg("Server decode skipped — NEXT_PUBLIC_API_URL not set");
            return null;
        }
        const form = new FormData();
        form.append("file", file, file.name);
        const res = await fetch(`${BASE_URL}/decode-barcode`, { method: "POST", body: form });
        if (!res.ok) {
            dbg(`Server decode HTTP ${res.status}`);
            return null;
        }
        const json = await res.json();
        if (!json.found) {
            dbg("Server decode: no barcode found");
            return null;
        }
        dbg(`Server decode OK: type=${json.type} bytes=${(json.raw_bytes_b64?.length ?? 0)}`);
        if (json.raw_bytes_b64) {
            const apiData = await decodeViaAPI({ aztecBase64: json.raw_bytes_b64 }, dbg);
            if (hasUsefulFields(apiData)) return apiData;
        }
        if (json.raw_string) {
            const plain = parsePlainTextQR(json.raw_string);
            if (hasUsefulFields(plain)) return plain;
        }
        return null;
    } catch (err: any) {
        dbg(`Server decode error: ${err?.message ?? err}`);
        return null;
    }
}

/**
 * Capture the current frame of a <video> element as a JPEG Blob, POST it to
 * the backend /decode-barcode (which runs zxing-cpp with multiple binarizers),
 * and return the decoded DecodedVehicleData if the barcode was recognised.
 *
 * This is the "heavy artillery" fallback for when in-browser ZXing can't lock
 * on to the Aztec — e.g. phone camera pointed at a laptop screen, moiré, glare.
 */
async function decodeCurrentFrameOnBackend(
    video: HTMLVideoElement,
    dbg: (s: string) => void,
): Promise<DecodedVehicleData | null> {
    try {
        const BASE_URL = process.env.NEXT_PUBLIC_API_URL;
        if (!BASE_URL) return null;
        if (!video || video.readyState < 2) return null;

        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) return null;

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(video, 0, 0, w, h);

        const blob: Blob | null = await new Promise(resolve =>
            canvas.toBlob(b => resolve(b), "image/jpeg", 0.92),
        );
        if (!blob) return null;

        dbg(`Frame → backend: ${w}x${h}, ${(blob.size / 1024).toFixed(0)} KB`);

        const form = new FormData();
        form.append("file", blob, "frame.jpg");
        const res = await fetch(`${BASE_URL}/decode-barcode`, { method: "POST", body: form });
        if (!res.ok) {
            dbg(`Backend frame decode HTTP ${res.status}`);
            return null;
        }
        const json = await res.json();
        if (!json.found) return null;
        dbg(`Backend frame decode OK: ${json.type}${json.variant ? ` via ${json.variant}` : ""}`);

        if (json.raw_bytes_b64) {
            const apiData = await decodeViaAPI({ aztecBase64: json.raw_bytes_b64 }, dbg);
            if (hasUsefulFields(apiData)) return apiData;
        }
        if (json.raw_string) {
            const plain = parsePlainTextQR(json.raw_string);
            if (hasUsefulFields(plain)) return plain;
        }
        return null;
    } catch (err: any) {
        dbg(`Backend frame decode error: ${err?.message ?? err}`);
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
    const [debugLines, setDebugLines] = useState<string[]>([]);
    const [showDebug, setShowDebug] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const controlsRef = useRef<any>(null);
    const doneRef = useRef(false);

    const dbg = useCallback((line: string) => {
        const stamp = new Date().toLocaleTimeString();
        const entry = `${stamp} ${line}`;
        console.log("[QR-DBG]", entry);
        setDebugLines(prev => {
            const next = [...prev, entry];
            return next.length > 40 ? next.slice(-40) : next;
        });
    }, []);

    /* ── Core: take anything ZXing gave us, hand every interpretation to the API ── */
    const handleSuccess = useCallback(
        async (decodedText: string, rawBytes?: Uint8Array) => {
            if (doneRef.current) return;
            doneRef.current = true;

            dbg(`Detected! textLen=${decodedText.length} rawBytes=${rawBytes?.length ?? "none"}`);

            // Stop camera immediately so it doesn't keep firing callbacks while we decode.
            try { controlsRef.current?.stop(); } catch { /* ok */ }

            setStatus("scanning");
            setMessage("Dekodowanie danych...");

            let data: DecodedVehicleData | null = null;

            // Strategy A — call the API with every form of the payload we have.
            // The server tries each interpretation and returns the first that
            // produces a real VIN/make/plate.
            const apiPayload: { aztecBase64?: string; rawText?: string; rawBytes?: number[] } = {};
            if (decodedText) apiPayload.rawText = decodedText;
            if (rawBytes && rawBytes.length > 4) {
                apiPayload.rawBytes = Array.from(rawBytes);
                apiPayload.aztecBase64 = bytesToBase64(rawBytes);
            }
            dbg(`Sending to API — keys: ${Object.keys(apiPayload).join(",")}`);
            data = await decodeViaAPI(apiPayload, dbg);
            if (hasUsefulFields(data)) {
                dbg(`A:api OK — VIN=${data.vin ?? "?"} make=${data.make ?? "?"} plate=${data.registrationPlates ?? "?"}`);
            } else {
                data = null;
                dbg("A:api — no useful fields");
            }

            // Strategy B — plain-text parser (JSON / VIN regex / plate regex).
            if (!data) {
                const plain = parsePlainTextQR(decodedText);
                if (hasUsefulFields(plain)) {
                    data = plain;
                    dbg(`B:plain OK — VIN=${plain.vin ?? "?"}`);
                } else {
                    dbg("B:plain — no match");
                }
            }

            // Strategy C — if the text itself is already base64-ish, ask the API to decode it as aztecBase64.
            if (!data && /^[A-Za-z0-9+/=]{20,}$/.test(decodedText.trim())) {
                const cleaned = decodedText.trim();
                const direct = await decodeViaAPI({ aztecBase64: cleaned }, dbg);
                if (hasUsefulFields(direct)) {
                    data = direct;
                    dbg("C:base64 OK");
                }
            }

            if (!data) {
                dbg(`No structured data — showing rawText preview: "${decodedText.slice(0, 80)}"`);
                data = { rawText: decodedText.slice(0, 200) };
            }

            setDecoded(data);
            setStatus("success");
            setMessage(
                data.rawText && !data.vin && !data.make
                    ? "Zeskanowano \u2014 sprawdź dane poniżej"
                    : "Dane odczytane pomyślnie!",
            );

            setTimeout(() => { onData(data!); onClose(); }, 2500);
        },
        [onData, onClose, dbg],
    );

    /* ── manual text submit ── */
    const handleManualSubmit = useCallback(() => {
        const text = manualText.trim();
        if (!text) return;
        doneRef.current = false;
        handleSuccess(text);
    }, [manualText, handleSuccess]);

    /* ── scan from image file ── */
    const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = "";

        setFileScanning(true);
        dbg(`File: ${file.name} (${file.type}, ${(file.size / 1024).toFixed(0)} KB)`);

        // Path 1 — dedicated Aztec reader first (Polish registration certs are Aztec).
        try {
            dbg("Try: BrowserAztecCodeReader");
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
                    await handleSuccess(text, rawBytes ? new Uint8Array(rawBytes) : undefined);
                    URL.revokeObjectURL(imgUrl);
                    return;
                }
            } catch (err: any) {
                dbg(`Aztec reader miss: ${err?.message ?? err}`);
            } finally {
                URL.revokeObjectURL(imgUrl);
            }
        } catch (err: any) {
            dbg(`Aztec reader load error: ${err?.message ?? err}`);
        }

        // Path 1b — generic multi-format with hints (QR, DataMatrix, etc.).
        try {
            dbg("Try: BrowserMultiFormatReader");
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
                    await handleSuccess(text, rawBytes ? new Uint8Array(rawBytes) : undefined);
                    return;
                }
            } catch (err: any) {
                dbg(`MultiFormat file miss: ${err?.message ?? err}`);
            } finally {
                URL.revokeObjectURL(imgUrl);
            }
        } catch (err: any) {
            dbg(`MultiFormat file load error: ${err?.message ?? err}`);
        }

        // Path 2 — native BarcodeDetector.
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
                    await handleSuccess(codes[0].rawValue);
                    return;
                }
                dbg("File BarcodeDetector: no code found");
            } catch (err: any) {
                dbg(`File BarcodeDetector error: ${err.message ?? err}`);
            }
        }

        // Path 3 — server-side decode (zxing-cpp on backend if available).
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

        // All paths failed.
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
                dbg(`Host: ${proto}//${host} secure=${isSecure}`);
                if (!isSecure) {
                    throw Object.assign(new Error("HTTPS required"), { _httpsError: true });
                }

                dbg("Loading @zxing/browser...");
                const { BrowserMultiFormatReader } = await import("@zxing/browser");
                const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");
                if (!alive) return;

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

                // Prefer rear camera for sharper Aztec decoding.
                let deviceId: string | undefined;
                try {
                    const devices = await (BrowserMultiFormatReader as any).listVideoInputDevices?.();
                    if (Array.isArray(devices) && devices.length > 0) {
                        const rear = devices.find((d: any) =>
                            /back|rear|environment|tył|tyl/i.test(d.label || "")
                        );
                        deviceId = (rear ?? devices[devices.length - 1]).deviceId;
                        dbg(`Cameras: ${devices.length}, using ${rear ? "rear" : "last"}: "${(rear ?? devices[devices.length - 1]).label}"`);
                    }
                } catch (err: any) {
                    dbg(`listVideoInputDevices err: ${err?.message ?? err}`);
                }

                dbg("Starting camera via ZXing (HD constraints)...");
                // Request HD+ resolution — default SD (480x640) is too low for
                // Aztec codes shot from a laptop screen or phone distance.
                const videoConstraints: MediaTrackConstraints = {
                    width: { ideal: 1920, min: 1280 },
                    height: { ideal: 1080, min: 720 },
                    frameRate: { ideal: 30, min: 15 },
                };
                if (deviceId) {
                    (videoConstraints as any).deviceId = { exact: deviceId };
                } else {
                    (videoConstraints as any).facingMode = { ideal: "environment" };
                }
                const mediaConstraints: MediaStreamConstraints = { video: videoConstraints, audio: false };

                const controls = await reader.decodeFromConstraints(
                    mediaConstraints,
                    videoEl,
                    (result /*, error*/) => {
                        if (!alive || doneRef.current) return;
                        if (result) {
                            const text = result.getText();
                            const rawBytes = result.getRawBytes();
                            dbg(`ZXing camera detected: textLen=${text.length} rawBytes=${rawBytes?.length ?? 0}`);
                            handleSuccess(text, rawBytes ? new Uint8Array(rawBytes) : undefined);
                        }
                    },
                );
                controlsRef.current = controls;

                // Log the actual negotiated resolution so we can see in debug
                // overlay whether the browser honoured the HD request.
                setTimeout(() => {
                    const vw = videoEl.videoWidth;
                    const vh = videoEl.videoHeight;
                    dbg(`Camera ready — negotiated ${vw}x${vh}`);
                    try {
                        const track = (videoEl.srcObject as MediaStream)?.getVideoTracks?.()[0];
                        const settings: any = track?.getSettings?.();
                        if (settings) dbg(`Track settings: ${settings.width}x${settings.height}@${settings.frameRate}fps`);
                    } catch { /* ignore */ }
                }, 500);

                // Backend frame-decode fallback — if ZXing-JS hasn't caught
                // anything after a couple of seconds, capture the current
                // video frame and POST it to the backend (which runs
                // zxing-cpp with multiple binarizers + preprocessing).
                const BACKEND_POLL_MS = 2500;
                const backendFallback = async () => {
                    if (!alive || doneRef.current) return;
                    const data = await decodeCurrentFrameOnBackend(videoEl, dbg);
                    if (!alive || doneRef.current) return;
                    if (data && hasUsefulFields(data)) {
                        doneRef.current = true;
                        try { controlsRef.current?.stop(); } catch { /* ok */ }
                        setDecoded(data);
                        setStatus("success");
                        setMessage("Dane odczytane pomyślnie!");
                        setTimeout(() => { onData(data); onClose(); }, 2500);
                        return;
                    }
                    if (alive && !doneRef.current) setTimeout(backendFallback, BACKEND_POLL_MS);
                };
                // First attempt after 3s — gives ZXing the first shot.
                setTimeout(backendFallback, 3000);

                // Run native BarcodeDetector in parallel (faster on Android Chrome).
                const BDClass = (window as any).BarcodeDetector as any;
                if (typeof BDClass !== "undefined") {
                    dbg("BarcodeDetector: available — parallel loop");
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
                    dbg("BarcodeDetector: NOT available (Safari/iOS expected)");
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
                        setMessage(`B\u0142\u0105d kamery: ${msg}`);
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
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setShowDebug(v => !v)}
                        className={cn(
                            "p-2 rounded-xl active:scale-95 transition-all",
                            showDebug ? "bg-amber-500/30 text-amber-300" : "bg-white/10 text-white hover:bg-white/20",
                        )}
                        aria-label="Diagnostyka"
                        title="Diagnostyka"
                    >
                        <Bug size={18} />
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2 bg-white/10 text-white rounded-xl hover:bg-white/20 active:scale-95 transition-all"
                        aria-label="Zamknij skaner"
                    >
                        <X size={20} />
                    </button>
                </div>
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
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="w-64 h-64 border-2 border-primary/70 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                </div>

                {/* on-screen debug overlay */}
                {showDebug && (
                    <div className="absolute top-2 left-2 right-2 max-h-[40%] overflow-y-auto bg-black/80 text-green-300 text-[10px] font-mono p-2 rounded-lg border border-green-500/30 z-10">
                        {debugLines.length === 0
                            ? <div className="text-white/40">Log diagnostyczny pusty...</div>
                            : debugLines.map((l, i) => <div key={i} className="whitespace-pre-wrap break-all">{l}</div>)
                        }
                    </div>
                )}
            </div>

            {/* bottom bar */}
            <div className="flex-shrink-0 px-4 pb-6 pt-3 space-y-3 bg-black/80">
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
