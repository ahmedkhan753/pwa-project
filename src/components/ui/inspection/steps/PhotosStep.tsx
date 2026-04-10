import { useState, useRef, useCallback, useEffect } from "react";
import { useInspectionStore, PhotoSlot } from "@/store/useInspectionStore";
import { PhotoUploadSlot } from "../PhotoUploadSlot";
import { Camera, CheckCircle2, ChevronDown, Plus, Video, RotateCcw, Check, X, CloudUpload, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { photoQueue } from "@/lib/photoUploadQueue";

// ── Video Record Slot: 6-second auto-stop with countdown ──────────────
function VideoRecordSlot({
    slot,
    onCapture,
    onClear,
    onFallbackCapture,
}: {
    slot: PhotoSlot;
    onCapture: (b64: string) => void;
    onClear: () => void;
    onFallbackCapture: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [state, setState] = useState<'idle' | 'recording' | 'preview' | 'fallback'>('idle');
    const [countdown, setCountdown] = useState(6);
    const [recordedUrl, setRecordedUrl] = useState<string>('');

    const stopAll = useCallback(() => {
        if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; }
        if (stopTimerRef.current) { clearTimeout(stopTimerRef.current); stopTimerRef.current = null; }
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
    }, []);

    // FIX 1: Black screen — video element doesn't exist until state='recording'.
    // Set srcObject here, after React has rendered the <video ref={videoRef}>.
    useEffect(() => {
        if (state === 'recording' && videoRef.current && streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
            videoRef.current.play().catch(() => {});
        }
    }, [state]);

    // Cleanup on unmount
    useEffect(() => () => {
        stopAll();
        if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    }, [stopAll, recordedUrl]);

    const startRecording = async () => {
        try {
            if (!navigator?.mediaDevices?.getUserMedia) throw new Error('getUserMedia not supported');
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: true,
            });
            streamRef.current = stream;
            // Do NOT touch videoRef here — element not in DOM yet (renders on state change below)

            chunksRef.current = [];
            const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus'
                : MediaRecorder.isTypeSupported('video/webm') ? 'video/webm'
                : MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : '';
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            mediaRecorderRef.current = recorder;

            // FIX 2: timeslice=100ms ensures ondataavailable fires regularly,
            // not only on stop() — prevents empty blob on some browsers/devices.
            recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
            recorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
                const url = URL.createObjectURL(blob);
                setRecordedUrl(url);
                setState('preview');
                stopAll();
            };

            recorder.start(100);
            setState('recording');
            setCountdown(6);

            // FIX 3: Hard stop via setTimeout — not subject to setInterval drift.
            // This guarantees exactly 6 s of recording regardless of JS timer jitter.
            stopTimerRef.current = setTimeout(() => {
                if (recorder.state === 'recording') recorder.stop();
            }, 6000);

            // Countdown display only — does NOT control when recording stops.
            let remaining = 6;
            countdownTimerRef.current = setInterval(() => {
                remaining--;
                setCountdown(remaining);
                if (remaining <= 0) {
                    clearInterval(countdownTimerRef.current!);
                    countdownTimerRef.current = null;
                }
            }, 1000);

        } catch (err) {
            console.warn('MediaRecorder unavailable, falling back to file input:', err);
            stopAll();
            setState('fallback');
            setTimeout(() => fileInputRef.current?.click(), 100);
        }
    };

    const handleRetake = () => {
        if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        setRecordedUrl('');
        setState('idle');
    };

    const handleConfirm = () => {
        if (!recordedUrl) return;
        fetch(recordedUrl)
            .then(r => r.blob())
            .then(blob => {
                const reader = new FileReader();
                reader.onload = () => { onCapture(reader.result as string); };
                reader.readAsDataURL(blob);
            });
        setState('idle');
    };

    const handleFallbackInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        onFallbackCapture(e);
        setState('idle');
    };

    // Already captured — show thumbnail
    if (slot.base64) {
        return (
            <div className="flex flex-col gap-2 col-span-2">
                <label className="text-xs font-bold uppercase text-gray-500">{slot.label}</label>
                <div className="relative rounded-2xl overflow-hidden border-2 border-success bg-black">
                    <video src={slot.base64} controls playsInline className="w-full rounded-xl" style={{ maxHeight: '200px' }} />
                    <button
                        onClick={(e) => { e.stopPropagation(); onClear(); }}
                        className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full shadow-lg"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2 col-span-2">
            <label className="text-xs font-bold uppercase text-gray-500">{slot.label}</label>

            {state === 'idle' && (
                <button
                    onClick={startRecording}
                    className="flex flex-col items-center justify-center gap-2 py-6 bg-surface-raised border-2 border-dashed border-border rounded-2xl hover:border-primary transition-all active:scale-95"
                >
                    <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/30">
                        <Video size={20} className="text-white" />
                    </div>
                    <span className="text-xs font-black uppercase text-muted">Nagraj video (6 sek)</span>
                </button>
            )}

            {state === 'recording' && (
                <div className="relative rounded-2xl overflow-hidden border-2 border-red-500 bg-black">
                    <video ref={videoRef} muted playsInline autoPlay className="w-full" style={{ maxHeight: '240px' }} />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-20 h-20 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center border-4 border-white/50">
                            <span className="text-4xl font-black text-white">{countdown}</span>
                        </div>
                    </div>
                    <div className="absolute top-3 left-3 flex items-center gap-2 bg-red-500 px-3 py-1 rounded-full">
                        <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        <span className="text-[10px] font-black text-white uppercase">REC</span>
                    </div>
                </div>
            )}

            {state === 'preview' && recordedUrl && (
                <div className="space-y-2">
                    <div className="relative rounded-2xl overflow-hidden border-2 border-primary bg-black">
                        {/* playsInline required on iOS for inline playback */}
                        <video src={recordedUrl} controls playsInline className="w-full" style={{ maxHeight: '240px' }} />
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleRetake}
                            className="flex-1 flex items-center justify-center gap-2 py-3 bg-surface-raised border-2 border-border rounded-xl text-xs font-black uppercase text-muted active:scale-95 transition-all"
                        >
                            <RotateCcw size={14} /> Ponów
                        </button>
                        <button
                            onClick={handleConfirm}
                            className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary text-white rounded-xl text-xs font-black uppercase shadow-lg shadow-primary/20 active:scale-95 transition-all"
                        >
                            <Check size={14} /> Zatwierdź
                        </button>
                    </div>
                </div>
            )}

            {state === 'fallback' && (
                <label className="flex flex-col items-center justify-center gap-2 py-6 bg-surface-raised border-2 border-dashed border-border rounded-2xl cursor-pointer hover:border-primary transition-colors">
                    <Video size={24} className="text-primary" />
                    <span className="text-xs font-black uppercase text-muted">Nagraj video (max 6 sek)</span>
                    <input ref={fileInputRef} type="file" accept="video/*" capture="environment" onChange={handleFallbackInput} className="hidden" />
                </label>
            )}
        </div>
    );
}
export function PhotosStep() {
    const { data, setPhotoSlot, clearPhotoSlot, jobs, auth } = useInspectionStore();
    const photoSlots = data.photos;
    const [showExtra, setShowExtra] = useState(false);

    // ── Upload queue status (IndexedDB ground truth) ─────────────────
    const [pendingCount, setPendingCount] = useState(0);
    const [failedCount, setFailedCount] = useState(0);
    const [uploadedSlots, setUploadedSlots] = useState<Set<string>>(new Set());

    const requiredSlots = photoSlots.slice(0, 34);
    const optionalSlots = photoSlots.slice(34);

    const required = requiredSlots.filter((p) => p.required);
    // Count a slot as "filled" if it has local base64 OR is confirmed uploaded
    const filledCount = photoSlots.filter((p) => p.base64 || uploadedSlots.has(p.id)).length;
    const requiredFilledCount = required.filter((p) => p.base64 || uploadedSlots.has(p.id)).length;

    const dealId = jobs?.currentJobId;
    const token = auth?.token;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    // ── On mount: fetch which slots are already in the DB ────────────
    // This restores the "uploaded" markers after an iOS crash/reload
    // where Zustand base64 was wiped but the backend has the photos.
    useEffect(() => {
        if (!dealId || !token) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`${apiUrl}/files/list/${dealId}`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                if (!res.ok || cancelled) return;
                const json = await res.json();
                const slots: string[] = json.uploaded_slots || [];
                if (!cancelled) setUploadedSlots(new Set(slots));
            } catch {
                // network error — non-fatal, slots will just show as empty
            }
        })();
        return () => { cancelled = true; };
    }, [dealId, token, apiUrl]);

    // ── Subscribe to IndexedDB queue changes (debounced) ───────────
    useEffect(() => {
        if (!dealId) return;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let prevQueueSize = -1;

        const refresh = () => {
            // Debounce: collapse rapid-fire notifications into one check
            if (timer) clearTimeout(timer);
            timer = setTimeout(async () => {
                const items = await photoQueue.getByDeal(dealId);
                const pending = items.filter(i => i.status === 'pending' || i.status === 'uploading').length;
                const failed = items.filter(i => i.status === 'failed').length;
                setPendingCount(pending);
                setFailedCount(failed);

                // Only re-fetch the backend list when queue shrank (an upload finished)
                const currentSize = items.length;
                if (currentSize < prevQueueSize || prevQueueSize === -1) {
                    try {
                        const res = await fetch(`${apiUrl}/files/list/${dealId}`, {
                            headers: { 'Authorization': `Bearer ${token || ''}` },
                        });
                        if (res.ok) {
                            const json = await res.json();
                            setUploadedSlots(new Set(json.uploaded_slots || []));
                        }
                    } catch { /* ignore */ }
                }
                prevQueueSize = currentSize;
            }, 1500);
        };

        refresh();
        const unsub = photoQueue.subscribe(refresh);
        return () => { unsub(); if (timer) clearTimeout(timer); };
    }, [dealId, token, apiUrl]);

    // ── Enqueue to IndexedDB instead of fire-and-forget ──────────────
    const updatePhotoSlot = (slotId: string, base64: string) => {
        setPhotoSlot(slotId, base64);
        if (!dealId) return;
        const isVideo = base64.startsWith('data:video');
        const ext = isVideo ? 'mp4' : 'jpg';
        photoQueue.enqueue({
            id: `${dealId}__${slotId}`,
            dealId,
            slotId,
            base64,
            filename: `${slotId}.${ext}`,
        }).catch((err) => {
            console.error(`[PhotosStep] queue enqueue failed for ${slotId}:`, err);
        });
    };

    const handleVideoCapture = (e: React.ChangeEvent<HTMLInputElement>, slotId: string) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const url = URL.createObjectURL(file);
        const videoEl = document.createElement('video');
        videoEl.src = url;
        videoEl.onloadedmetadata = () => {
            if (videoEl.duration > 6) {
                alert('Film nie może być dłuższy niż 6 sekund. Nagraj krótszy film.');
                URL.revokeObjectURL(url);
                return;
            }
            const reader = new FileReader();
            reader.onload = (ev) => {
                updatePhotoSlot(slotId, ev.target?.result as string);
            };
            reader.readAsDataURL(file);
            URL.revokeObjectURL(url);
        };
    };

    return (
        <div className="space-y-4 animate-fade-in pb-10">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <Camera size={20} className="text-primary" />
                    <h3 className="text-base font-black text-foreground uppercase tracking-tight">
                        Dokumentacja Fotograficzna
                    </h3>
                </div>
                <div className="flex items-center gap-1.5 bg-surface px-3 py-1 rounded-full border border-border">
                    <CheckCircle2 size={14} className={requiredFilledCount === required.length ? "text-success" : "text-muted"} />
                    <span className="text-[10px] font-black text-secondary uppercase tracking-widest">
                        {requiredFilledCount}/{required.length} Wymagane
                    </span>
                </div>
            </div>

            {/* Progress */}
            <div className="bg-surface rounded-2xl p-4 border border-border shadow-sm">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-black text-muted uppercase tracking-widest">Postęp całkowity</span>
                    <span className="text-xs font-black text-primary">{Math.round((filledCount / photoSlots.length) * 100)}%</span>
                </div>
                <div className="w-full bg-surface-raised h-2.5 rounded-full overflow-hidden border border-border/50">
                    <div
                        className="h-full bg-gradient-to-r from-primary to-success rounded-full transition-all duration-700 ease-out"
                        style={{ width: `${(filledCount / photoSlots.length) * 100}%` }}
                    />
                </div>
            </div>

            {/* Upload Queue Status Banner */}
            {(pendingCount > 0 || failedCount > 0) && (
                <div className={cn(
                    "rounded-2xl p-4 flex items-center gap-3 border shadow-sm",
                    failedCount > 0
                        ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
                        : "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800"
                )}>
                    {failedCount > 0 ? (
                        <AlertTriangle size={20} className="text-red-500 flex-shrink-0" />
                    ) : (
                        <CloudUpload size={20} className="text-blue-500 flex-shrink-0 animate-pulse" />
                    )}
                    <div className="flex-1 min-w-0">
                        {pendingCount > 0 && (
                            <p className="text-[11px] font-bold text-blue-700 dark:text-blue-300">
                                Wysyłanie {pendingCount} {pendingCount === 1 ? 'pliku' : 'plików'}... Nie zamykaj aplikacji.
                            </p>
                        )}
                        {failedCount > 0 && (
                            <p className="text-[11px] font-bold text-red-600 dark:text-red-400">
                                {failedCount} {failedCount === 1 ? 'plik' : 'plików'} nie udało się wysłać — ponawiam automatycznie.
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Photo Grid — first 34 slots */}
            <div className="grid grid-cols-2 xs:grid-cols-3 gap-3">
                {requiredSlots.map((slot) => (
                    slot.isVideo ? (
                        <VideoRecordSlot
                            key={slot.id}
                            slot={slot}
                            onCapture={(b64) => updatePhotoSlot(slot.id, b64)}
                            onClear={() => clearPhotoSlot(slot.id)}
                            onFallbackCapture={(e) => handleVideoCapture(e, slot.id)}
                        />
                    ) : (
                        <PhotoUploadSlot
                            key={slot.id}
                            label={slot.label}
                            base64={slot.base64}
                            required={slot.required}
                            uploaded={uploadedSlots.has(slot.id)}
                            onCapture={(b64) => updatePhotoSlot(slot.id, b64)}
                            onClear={() => clearPhotoSlot(slot.id)}
                        />
                    )
                ))}
            </div>

            {/* Extra Expandable Section */}
            <div className="mt-6 pt-6 border-t border-border">
                <button
                    onClick={() => setShowExtra(!showExtra)}
                    className={cn(
                        "w-full flex items-center justify-between p-5 rounded-2xl border-2 transition-all",
                        showExtra
                            ? "bg-surface border-primary text-primary shadow-lg shadow-primary/5"
                            : "bg-surface-raised/50 border-dashed border-border text-muted hover:border-border-hover"
                    )}
                >
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "w-8 h-8 rounded-xl flex items-center justify-center transition-colors",
                            showExtra ? "bg-primary text-white" : "bg-border text-muted"
                        )}>
                            <Plus size={18} />
                        </div>
                        <div className="text-left">
                            <span className="text-xs font-black uppercase tracking-tight block">Dodatkowe zdjęcia</span>
                            <p className="text-[10px] font-medium opacity-60">Opcjonalne ujęcia detali i uszkodzeń</p>
                        </div>
                    </div>
                    <ChevronDown size={20} className={cn("transition-transform duration-300", showExtra && "rotate-180")} />
                </button>

                {showExtra && (
                    <div className="grid grid-cols-2 xs:grid-cols-3 gap-3 mt-4 animate-slide-down">
                        {optionalSlots.map((slot) => (
                            <PhotoUploadSlot
                                key={slot.id}
                                label={slot.label}
                                base64={slot.base64}
                                required={false}
                                uploaded={uploadedSlots.has(slot.id)}
                                onCapture={(b64) => updatePhotoSlot(slot.id, b64)}
                                onClear={() => clearPhotoSlot(slot.id)}
                            />
                        ))}
                    </div>
                )}
            </div>

            <div className="bg-primary-light p-4 rounded-2xl flex items-start gap-3 border border-primary/10 mt-4">
                <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[10px] text-white font-black">!</span>
                </div>
                <p className="text-[10px] text-primary-hover font-bold leading-relaxed">
                    Upewnij się, że zdjęcia są wyraźne i dobrze doświetlone. Zdjęcia oznaczone czerwoną gwiazdką są wymagane do zakończenia inspekcji.
                </p>
            </div>
        </div>
    );
}
