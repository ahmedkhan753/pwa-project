import { useState, useRef, useCallback, useEffect } from "react";
import { useInspectionStore, PhotoSlot } from "@/store/useInspectionStore";
import { useUploadedSlots } from "@/lib/useUploadedSlots";
import { PhotoUploadSlot } from "../PhotoUploadSlot";
import { Camera, CheckCircle2, ChevronDown, Plus, Video, RotateCcw, Check, X, CloudUpload, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { photoQueue } from "@/lib/photoUploadQueue";
import { MAX_UPLOAD_ATTEMPTS, subscribeVideoProgress } from "@/lib/uploadWorker";

/** Pick a sensible filename extension from a video Blob/File for the
 *  multipart upload. Bitrix uses the extension to set MIME on download. */
function videoFilenameFor(blob: Blob, slotId: string): string {
    const fileName = (blob as File).name;
    if (fileName) return fileName;
    const t = (blob.type || '').toLowerCase();
    if (t.includes('webm')) return `${slotId}.webm`;
    if (t.includes('mp4'))  return `${slotId}.mp4`;
    if (t.includes('quicktime') || t.includes('mov')) return `${slotId}.mov`;
    return `${slotId}.bin`;
}

// ── Video Record Slot: 6-second auto-stop with countdown ──────────────
function VideoRecordSlot({
    slot,
    onCapture,
    onClear,
    onFallbackCapture,
    uploadStatus,
    uploadProgress,
    uploaded,
    thumbnailUrl,
}: {
    slot: PhotoSlot;
    onCapture: (blob: Blob) => void;
    onClear: () => void;
    onFallbackCapture: (e: React.ChangeEvent<HTMLInputElement>) => void;
    /** 'idle' before capture, 'uploading' while bytes are in flight,
     *  'uploaded' once the queue entry is gone, 'failed' if the worker
     *  hit MAX_UPLOAD_ATTEMPTS — UI never blocks on either failure. */
    uploadStatus?: 'idle' | 'uploading' | 'uploaded' | 'failed';
    /** 0–100, only meaningful while uploadStatus === 'uploading'. */
    uploadProgress?: number;
    /** true if the backend DB confirmed this video was already uploaded.
     *  localStorage strips slot base64 on persist (iOS memory fix), so after
     *  a refresh this is the only signal the slot is actually filled. */
    uploaded?: boolean;
    /** GET /files/photo/... for this slot. Only used when the slot is
     *  `uploaded` but has no local blob (post-reload) — lets the appraiser
     *  re-watch the saved film instead of staring at a checkmark. Optional:
     *  undefined when we can't authenticate, which keeps the badge-only card. */
    thumbnailUrl?: string;
}) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // The assembled recording itself. This — not the blob: URL — is the source
    // of truth for confirm. An object URL can be revoked out from under us; a
    // Blob reference stays valid until it's dropped.
    const recordedBlobRef = useRef<Blob | null>(null);
    // Mirror of recordedUrl. Cleanup reads the ref instead of the state value so
    // the unmount effect doesn't need recordedUrl as a dependency (a dep there
    // makes the effect re-run — and revoke — on every URL change, not on unmount).
    const recordedUrlRef = useRef<string>('');

    const [state, setState] = useState<'idle' | 'recording' | 'preview' | 'fallback'>('idle');
    const [countdown, setCountdown] = useState(6);
    const [recordedUrl, setRecordedUrl] = useState<string>('');
    // True while handleConfirm hands the blob to the parent — disables the
    // confirm button so a double-tap can't double-submit.
    const [isConfirming, setIsConfirming] = useState(false);
    // Set if the server copy 404s / fails to load — falls back to the
    // badge-only ZAPISANO card so a broken player is never shown.
    const [remoteFailed, setRemoteFailed] = useState(false);

    // A new URL (different deal or a retake) deserves a fresh attempt.
    useEffect(() => { setRemoteFailed(false); }, [thumbnailUrl]);

    const stopAll = useCallback(() => {
        if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; }
        if (stopTimerRef.current) { clearTimeout(stopTimerRef.current); stopTimerRef.current = null; }
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
    }, []);

    /** Drop the current recording: revoke the preview URL and release the Blob.
     *  Called ONLY when the user explicitly discards / starts a new recording,
     *  and on unmount. Never on the confirm path. */
    const releaseRecording = useCallback(() => {
        if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current);
        recordedUrlRef.current = '';
        recordedBlobRef.current = null;
    }, []);

    // FIX 1: Black screen — video element doesn't exist until state='recording'.
    // Set srcObject here, after React has rendered the <video ref={videoRef}>.
    useEffect(() => {
        if (state === 'recording' && videoRef.current && streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
            videoRef.current.play().catch(() => {});
        }
    }, [state]);

    // Cleanup on unmount ONLY. Both deps are stable useCallback([]) identities,
    // so this never re-runs mid-session — which is what previously revoked the
    // preview URL as a side-effect of a recordedUrl state change.
    useEffect(() => () => {
        stopAll();
        releaseRecording();
    }, [stopAll, releaseRecording]);

    const startRecording = async () => {
        try {
            // Explicit user action to (re-)record — safe to free the previous take.
            releaseRecording();
            setRecordedUrl('');
            // iOS Safari's MediaRecorder is unreliable (empty blobs, no onstop firing).
            // Always use the native file input fallback on iOS — gives better quality and stability.
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            if (isIOS) throw new Error('iOS: use file input fallback');
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
                // Keep the Blob BEFORE minting the object URL. Confirm reads this
                // ref, so the recording survives even if the URL is revoked.
                recordedBlobRef.current = blob;
                console.log('[VideoRecordSlot] onstop blob:', {
                    size: blob.size,
                    type: blob.type,
                    chunks: chunksRef.current.length,
                });
                if (blob.size === 0) {
                    console.error('[VideoRecordSlot] onstop produced an empty blob', {
                        recorderMimeType: recorder.mimeType,
                        chunks: chunksRef.current.length,
                    });
                }
                // Object URL is for the <video> preview element only.
                const url = URL.createObjectURL(blob);
                recordedUrlRef.current = url;
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

    /** "Ponów" — the user discarded this take. One of the only two places
     *  allowed to revoke the preview URL (the other is unmount). */
    const handleRetake = () => {
        releaseRecording();
        setRecordedUrl('');
        setState('idle');
    };

    const handleConfirm = () => {
        if (isConfirming) return;
        // Hand the raw Blob up — the parent persists it to IndexedDB and
        // also generates a small object-URL preview for the slot. We
        // intentionally avoid FileReader.readAsDataURL here: a 30 MB
        // base64 string in JS memory can OOM iOS Safari.
        //
        // Read the Blob straight from the ref. The old code did
        // fetch(recordedUrl).then(r => r.blob()) instead, which throws on
        // Android Chrome once the blob: URL has been revoked — and the cleanup
        // effect revoked it on every recordedUrl change, so the recording was
        // lost and the inspector just got the failure alert (deal 2866).
        const blob = recordedBlobRef.current;
        if (!blob) {
            console.error('[VideoRecordSlot] confirm with no blob in recordedBlobRef', {
                state,
                hasUrl: Boolean(recordedUrlRef.current),
            });
            alert('Nie udało się zapisać nagranego filmu — spróbuj ponownie.');
            return;
        }

        setIsConfirming(true);
        try {
            console.log('[VideoRecordSlot] confirm blob:', { size: blob.size, type: blob.type });
            // onCapture → updateVideoSlot, which enqueues for background upload
            // and has its own .catch() alert if the enqueue fails.
            onCapture(blob);
            // Safe to change state now: nothing here revokes the URL or the ref.
            setState('idle');
        } catch (err) {
            // Stay in 'preview' on a synchronous throw so the inspector can
            // retry — Ponów / Zatwierdź are both still on screen.
            console.error('[VideoRecordSlot] onCapture threw during confirm:', err);
            alert('Nie udało się zapisać nagranego filmu — spróbuj ponownie.');
        } finally {
            setIsConfirming(false);
        }
    };

    const handleFallbackInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        onFallbackCapture(e);
        setState('idle');
    };

    // Already captured (local blob) OR confirmed uploaded on the server.
    // base64 is stripped from localStorage on persist, so after a refresh an
    // uploaded video has no local blob — fall through to the "saved" state
    // below rather than rendering an empty <video>.
    if (slot.base64 || uploaded) {
        const isUploading = uploadStatus === 'uploading';
        const isFailed    = uploadStatus === 'failed';
        const pct = Math.max(0, Math.min(100, uploadProgress ?? 0));
        const borderColor = isFailed ? 'border-red-500' : 'border-success';

        // Server has the video but we have no local blob to play (post-refresh).
        // Stream it back from the DB so the appraiser can actually re-watch the
        // saved film — same treatment PhotoUploadSlot gives an uploaded photo.
        if (!slot.base64 && thumbnailUrl && !remoteFailed) {
            return (
                <div className="flex flex-col gap-2 col-span-2">
                    <label className="text-xs font-bold uppercase text-gray-500">{slot.label}</label>
                    <div className="relative rounded-2xl overflow-hidden border-2 border-success bg-black">
                        {/* playsInline required on iOS for inline playback.
                            preload="metadata" keeps a 45 MB film off the wire
                            until the appraiser actually presses play. */}
                        <video
                            src={thumbnailUrl}
                            controls
                            playsInline
                            preload="metadata"
                            className="w-full rounded-xl"
                            style={{ maxHeight: '200px' }}
                            onError={() => setRemoteFailed(true)}
                        />
                        <span className="absolute top-2 left-2 bg-success text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full shadow-md">
                            ZAPISANO
                        </span>
                        <button
                            onClick={(e) => { e.stopPropagation(); onClear(); }}
                            className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full shadow-lg"
                            aria-label={`Usuń ${slot.label}`}
                        >
                            <X size={14} />
                        </button>
                    </div>
                    {/* The card itself is no longer tappable (the player owns
                        those taps), so re-recording gets its own button. */}
                    <button
                        onClick={startRecording}
                        className="flex items-center justify-center gap-2 py-2.5 bg-surface-raised border-2 border-border rounded-xl text-[10px] font-black uppercase text-muted active:scale-95 transition-all"
                    >
                        <RotateCcw size={12} /> Nagraj ponownie
                    </button>
                </div>
            );
        }

        // No local blob and no way to stream the server copy (no token, or the
        // player errored): the original reassuring "saved" badge, tappable to
        // re-record if the appraiser wants to replace it.
        if (!slot.base64) {
            return (
                <div className="flex flex-col gap-2 col-span-2">
                    <label className="text-xs font-bold uppercase text-gray-500">{slot.label}</label>
                    <button
                        onClick={startRecording}
                        className="photo-slot w-full flex-col gap-1 border-success/50 bg-success/5 py-6"
                    >
                        <CheckCircle2 size={20} className="text-success" />
                        <span className="text-[10px] font-medium text-secondary text-center leading-tight px-1">
                            {slot.label}
                        </span>
                        <span className="text-[8px] text-success font-bold">ZAPISANO</span>
                    </button>
                </div>
            );
        }

        return (
            <div className="flex flex-col gap-2 col-span-2">
                <label className="text-xs font-bold uppercase text-gray-500">{slot.label}</label>
                <div className={`relative rounded-2xl overflow-hidden border-2 ${borderColor} bg-black`}>
                    <video src={slot.base64} controls playsInline className="w-full rounded-xl" style={{ maxHeight: '200px' }} />
                    <button
                        onClick={(e) => { e.stopPropagation(); onClear(); }}
                        className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full shadow-lg"
                    >
                        <X size={14} />
                    </button>
                    {isUploading && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-3 py-2 flex items-center gap-2">
                            <CloudUpload size={14} className="text-white animate-pulse flex-shrink-0" />
                            <div className="flex-1 h-1.5 rounded-full bg-white/20 overflow-hidden">
                                <div
                                    className="h-full bg-blue-400 transition-all duration-200"
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                            <span className="text-[10px] font-black text-white tabular-nums">{pct}%</span>
                        </div>
                    )}
                    {isFailed && (
                        <div className="absolute bottom-0 left-0 right-0 bg-red-500/90 px-3 py-1.5 flex items-center gap-2">
                            <AlertTriangle size={12} className="text-white flex-shrink-0" />
                            <span className="text-[10px] font-black text-white">Wysyłka nie powiodła się — można wysłać raport mimo to.</span>
                        </div>
                    )}
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
                            disabled={isConfirming}
                            className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary text-white rounded-xl text-xs font-black uppercase shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-60 disabled:active:scale-100"
                        >
                            <Check size={14} /> {isConfirming ? 'Zapisywanie…' : 'Zatwierdź'}
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
    // pendingCount: actively trying to upload (status pending/uploading or
    //               failed but attempts < MAX → worker will retry).
    // deadCount   : permanently failed after MAX attempts. Inspector must
    //               re-take or accept the loss before submit will succeed.
    const [pendingCount, setPendingCount] = useState(0);
    const [deadCount, setDeadCount] = useState(0);
    const [deadSlots, setDeadSlots] = useState<string[]>([]);
    // Confirmed-upload markers live in a shared hook because ValidationStep
    // needs the same answer and only one step is mounted at a time.
    // `uploadedSlotsLoaded` is false until the /files/list fetch settles, which
    // gates the "X missing" counter so a refresh doesn't briefly show
    // already-uploaded slots as missing before the server list resolves.
    const {
        uploadedSlots,
        setUploadedSlots,
        loaded: uploadedSlotsLoaded,
        refresh: refreshUploadedSlots,
    } = useUploadedSlots();

    const requiredSlots = photoSlots.slice(0, 34);
    const optionalSlots = photoSlots.slice(34);

    const required = requiredSlots.filter((p) => p.required);
    // Count a slot as "filled" if it has local base64 OR is confirmed uploaded
    const filledCount = photoSlots.filter((p) => p.base64 || uploadedSlots.has(p.id)).length;
    const requiredFilledCount = required.filter((p) => p.base64 || uploadedSlots.has(p.id)).length;

    const dealId = jobs?.currentJobId;
    const token = auth?.token;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    // The mount-time /files/list fetch that used to live here now runs inside
    // useUploadedSlots — same request, same "settled" gate, shared with
    // ValidationStep.

    // ── Per-video upload status (separate from photo banner) ─────────
    // Banner counts photo uploads only — videos have their own progress
    // bar inside VideoRecordSlot and never block submit.
    const [videoUploadStatus, setVideoUploadStatus] = useState<Record<string, 'idle' | 'uploading' | 'uploaded' | 'failed'>>({});
    const [videoUploadProgress, setVideoUploadProgress] = useState<Record<string, number>>({});

    // ── Subscribe to IndexedDB queue changes (debounced) ───────────
    useEffect(() => {
        if (!dealId) return;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let prevQueueSize = -1;

        const refresh = () => {
            // Debounce: collapse rapid-fire notifications into one check
            if (timer) clearTimeout(timer);
            timer = setTimeout(async () => {
                // Meta-only — never loads base64 into memory. With 150 photos
                // the previous getByDeal() rehydrated ~18 MB on every poll,
                // crashing iOS WebKit at the stress-test threshold.
                const items = await photoQueue.getMetaByDeal(dealId);
                let pending = 0;
                const dead: string[] = [];
                const vidStatus: Record<string, 'idle' | 'uploading' | 'uploaded' | 'failed'> = {};
                for (const i of items) {
                    // Videos never count toward the photo banner / submit gate.
                    // Track them separately for the slot's own progress UI.
                    if (i.kind === 'video') {
                        if ((i.attempts || 0) >= MAX_UPLOAD_ATTEMPTS && i.status === 'failed') {
                            vidStatus[i.slotId] = 'failed';
                        } else if (i.status === 'uploading') {
                            vidStatus[i.slotId] = 'uploading';
                        } else {
                            vidStatus[i.slotId] = 'uploading';  // pending / failed-but-retrying
                        }
                        continue;
                    }
                    if (i.status === 'uploaded') continue;
                    if ((i.attempts || 0) >= MAX_UPLOAD_ATTEMPTS && i.status === 'failed') {
                        dead.push(i.slotId);
                    } else {
                        pending++;
                    }
                }
                setPendingCount(pending);
                setDeadCount(dead.length);
                setDeadSlots(dead);
                setVideoUploadStatus(vidStatus);

                // Only re-fetch the backend list when queue shrank (an upload finished)
                const currentSize = items.length;
                if (currentSize < prevQueueSize || prevQueueSize === -1) {
                    await refreshUploadedSlots();
                }
                prevQueueSize = currentSize;
            }, 1500);
        };

        refresh();
        const unsub = photoQueue.subscribe(refresh);
        return () => { unsub(); if (timer) clearTimeout(timer); };
    }, [dealId, refreshUploadedSlots]);

    // ── Subscribe to per-video upload progress events ────────────────
    // Worker reports progress only for the video that's currently in
    // flight; we register one listener per video slot id we know about.
    useEffect(() => {
        if (!dealId) return;
        const unsubs: Array<() => void> = [];
        for (const slot of photoSlots) {
            if (!slot.isVideo) continue;
            const id = `${dealId}__${slot.id}`;
            unsubs.push(
                subscribeVideoProgress(id, (pct) => {
                    setVideoUploadProgress((s) => ({ ...s, [slot.id]: pct }));
                }),
            );
        }
        return () => { unsubs.forEach((u) => u()); };
    }, [dealId, photoSlots]);

    // NOTE: a previous version of this file eagerly called
    // releaseUploadedPhotos(uploadedSlotIds) on every uploadedSlots change.
    // That worked for memory but caused a UX regression: as soon as the
    // backend confirmed the upload, PhotoUploadSlot's base64 prop went
    // empty and the slot swapped from a thumbnail of the inspector's
    // photo to a generic "ZAPISANO" badge. Inspectors reported photos
    // "disappearing" after upload. The actual OOM driver at high photo
    // counts was getByDeal/getAllPending loading the full base64 blobs
    // on every poll — that's already solved by getMetaByDeal /
    // getAllPendingMeta cursor walks, so we don't need to also wipe the
    // Zustand previews. They're capped at ~150 KB each by the preview
    // tier of compressImagePair, so 150 photos × 150 KB ≈ 22 MB in
    // React state — comfortably inside the iOS budget once the meta
    // queries stop allocating an extra 18 MB on every refresh.
    //
    // ── Enqueue to IndexedDB instead of fire-and-forget ──────────────
    // preview = small base64 (≤150 KB) safe for Zustand/localStorage.
    // full    = HQ base64 (~1.5 MB cap) for the upload queue → backend.
    // Photo-only path. Videos go through updateVideoSlot.
    const updatePhotoSlot = (slotId: string, preview: string, full?: string) => {
        setPhotoSlot(slotId, preview);
        if (!dealId) return;
        const upload = full || preview;
        const ext = 'jpg';
        photoQueue.enqueue({
            id: `${dealId}__${slotId}`,
            dealId,
            slotId,
            base64: upload,
            filename: `${slotId}.${ext}`,
        }).catch((err) => {
            console.error(`[PhotosStep] queue enqueue failed for ${slotId}:`, err);
        });
    };

    /** Video capture path — stores the raw Blob (no base64 inflation),
     *  surfaces a small object-URL preview to Zustand, and enqueues for
     *  background multipart upload. Videos never block submit. */
    const VIDEO_MAX_BYTES = 45 * 1024 * 1024;
    const updateVideoSlot = (slotId: string, blob: Blob) => {
        if (!dealId) return;
        if (blob.size > VIDEO_MAX_BYTES) {
            alert('Film jest za duży — nagraj ponownie krótszy / niższej jakości');
            return;
        }
        const previewUrl = URL.createObjectURL(blob);
        setPhotoSlot(slotId, previewUrl);
        photoQueue.enqueue({
            id: `${dealId}__${slotId}`,
            dealId,
            slotId,
            kind: 'video',
            bodyBlob: blob,
            filename: videoFilenameFor(blob, slotId),
        }).catch((err) => {
            console.error(`[PhotosStep] video enqueue failed for ${slotId}:`, err);
            // Enqueue failure means the video never reached the upload queue —
            // tell the inspector so a recording is never lost silently.
            alert('Nie udało się zapisać filmu do wysyłki — nagraj ponownie.');
        });
    };

    /** URL the slot can render as an <img>/thumbnail for an already-uploaded
     *  slot with no local base64. Token goes in the query string because an
     *  <img src> can't set an Authorization header — get_current_user accepts
     *  ?token= for exactly this case. undefined when we can't authenticate,
     *  which makes the slot fall back to the plain ZAPISANO card. */
    const uploadedUrlFor = (slotId: string): string | undefined =>
        dealId && token && uploadedSlots.has(slotId)
            ? `${apiUrl}/files/photo/${dealId}/${slotId}?token=${encodeURIComponent(token)}`
            : undefined;

    /** Clearing a slot has to remove the server copy too. Without this the DB
     *  row survives, /files/list keeps reporting the slot as uploaded, and the
     *  slot snaps back to ZAPISANO on the next reload — local and server state
     *  drift apart. Local state is cleared ONLY after the server confirms, so
     *  a failed delete leaves the slot exactly as it was. */
    const handleClearSlot = async (slotId: string) => {
        // Never uploaded (or no way to authenticate) → nothing on the server.
        if (!dealId || !token || !uploadedSlots.has(slotId)) {
            clearPhotoSlot(slotId);
            return;
        }
        try {
            const res = await fetch(`${apiUrl}/files/photo/${dealId}/${slotId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            // 404 means it's already gone server-side — that's the state we
            // wanted, so let the local clear proceed rather than trapping the
            // inspector with a slot they can't remove.
            if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);

            // Drop the marker so the slot goes back to empty/WYMAGANE and the
            // filled/required counters update immediately.
            setUploadedSlots((prev) => {
                const next = new Set(prev);
                next.delete(slotId);
                return next;
            });
            clearPhotoSlot(slotId);
        } catch (err) {
            console.error(`[PhotosStep] server delete failed for ${slotId}:`, err);
            alert('Nie udało się usunąć zdjęcia z serwera — spróbuj ponownie.');
            // Deliberately no clearPhotoSlot() here: the server still has the
            // photo, so wiping it locally would hide a row that still exists.
        }
    };

    const handleVideoCapture = (e: React.ChangeEvent<HTMLInputElement>, slotId: string) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const url = URL.createObjectURL(file);
        const videoEl = document.createElement('video');
        videoEl.src = url;
        videoEl.onloadedmetadata = () => {
            URL.revokeObjectURL(url);
            if (videoEl.duration > 6) {
                alert('Film nie może być dłuższy niż 6 sekund. Nagraj krótszy film.');
                return;
            }
            updateVideoSlot(slotId, file);
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
                    {!uploadedSlotsLoaded ? (
                        <>
                            <CloudUpload size={14} className="text-muted animate-pulse" />
                            <span className="text-[10px] font-black text-muted uppercase tracking-widest">
                                Sprawdzanie…
                            </span>
                        </>
                    ) : (
                        <>
                            <CheckCircle2 size={14} className={requiredFilledCount === required.length ? "text-success" : "text-muted"} />
                            <span className="text-[10px] font-black text-secondary uppercase tracking-widest">
                                {requiredFilledCount}/{required.length} Wymagane
                            </span>
                        </>
                    )}
                </div>
            </div>

            {/* Progress */}
            <div className="bg-surface rounded-2xl p-4 border border-border shadow-sm">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-black text-muted uppercase tracking-widest">Postęp całkowity</span>
                    <span className="text-xs font-black text-primary">
                        {uploadedSlotsLoaded ? `${Math.round((filledCount / photoSlots.length) * 100)}%` : '…'}
                    </span>
                </div>
                <div className="w-full bg-surface-raised h-2.5 rounded-full overflow-hidden border border-border/50">
                    <div
                        className="h-full bg-gradient-to-r from-primary to-success rounded-full transition-all duration-700 ease-out"
                        style={{ width: uploadedSlotsLoaded ? `${(filledCount / photoSlots.length) * 100}%` : '0%' }}
                    />
                </div>
            </div>

            {/* Upload Queue Status Banner */}
            {(pendingCount > 0 || deadCount > 0) && (
                <div className={cn(
                    "rounded-2xl p-4 flex items-start gap-3 border shadow-sm",
                    deadCount > 0
                        ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
                        : "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800"
                )}>
                    {deadCount > 0 ? (
                        <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
                    ) : (
                        <CloudUpload size={20} className="text-blue-500 flex-shrink-0 animate-pulse mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                        {pendingCount > 0 && (
                            <p className="text-[11px] font-bold text-blue-700 dark:text-blue-300">
                                Wysyłanie {pendingCount} {pendingCount === 1 ? 'pliku' : 'plików'}... Nie zamykaj aplikacji.
                            </p>
                        )}
                        {deadCount > 0 && (
                            <div className="mt-1">
                                <p className="text-[11px] font-bold text-red-600 dark:text-red-400">
                                    {deadCount} {deadCount === 1 ? 'plik nie został wysłany' : 'plików nie zostało wysłanych'} — kliknij ❌ na nieudanym zdjęciu i zrób je ponownie.
                                </p>
                                <p className="mt-1 text-[10px] font-medium text-red-500/80 break-words">
                                    {deadSlots.slice(0, 6).join(', ')}{deadSlots.length > 6 ? '…' : ''}
                                </p>
                            </div>
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
                            onCapture={(blob) => updateVideoSlot(slot.id, blob)}
                            onClear={() => handleClearSlot(slot.id)}
                            onFallbackCapture={(e) => handleVideoCapture(e, slot.id)}
                            uploadStatus={videoUploadStatus[slot.id] || 'idle'}
                            uploadProgress={videoUploadProgress[slot.id]}
                            uploaded={uploadedSlots.has(slot.id)}
                            thumbnailUrl={uploadedUrlFor(slot.id)}
                        />
                    ) : (
                        <PhotoUploadSlot
                            key={slot.id}
                            label={slot.label}
                            base64={slot.base64}
                            required={slot.required}
                            uploaded={uploadedSlots.has(slot.id)}
                            uploadedUrl={uploadedUrlFor(slot.id)}
                            onCapture={(preview, full) => updatePhotoSlot(slot.id, preview, full)}
                            onClear={() => handleClearSlot(slot.id)}
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
                                uploadedUrl={uploadedUrlFor(slot.id)}
                                onCapture={(preview, full) => updatePhotoSlot(slot.id, preview, full)}
                                onClear={() => handleClearSlot(slot.id)}
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
