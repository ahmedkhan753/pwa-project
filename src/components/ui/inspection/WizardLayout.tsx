"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { api } from "@/lib/api";
import { ProgressBar } from "./ProgressBar";
import { Logo } from "@/components/ui/Logo";
import { ChevronLeft, ChevronRight, Send, LogOut, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

const STEPS = [
    { num: 1, short: "Dane", label: "Dane Pojazdu" },
    { num: 2, short: "Kompl.", label: "Kompletność" },
    { num: 3, short: "Wypos.", label: "Wyposażenie" },
    { num: 4, short: "Lakier", label: "Pomiar Lakieru" },
    { num: 5, short: "Opony", label: "Opony" },
    { num: 6, short: "Zdjęcia", label: "Zdjęcia" },
    { num: 7, short: "Zewn.", label: "Uszkodz. Zewn." },
    { num: 8, short: "Wewn.", label: "Uszkodz. Wewn." },
    { num: 9, short: "Mech.", label: "Mechanika" },
    { num: 10, short: "Uwagi", label: "Uwagi i Wycena" },
    { num: 11, short: "Sprawdź", label: "Weryfikacja" },
    { num: 12, short: "Podpis", label: "Podsumowanie" },
];

export function WizardLayout({ children }: { children: React.ReactNode }) {
    const { currentStep, maxVisitedStep, setStep, logout, selectJob, syncStepWithBitrix } = useInspectionStore();
    const totalSteps = STEPS.length;
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [submitError, setSubmitError] = useState<string>('');

    // Bitrix Auto-Sync (Anti-Oops) — debounced, disabled while submitting
    useEffect(() => {
        if (isSubmitting) return;

        const timer = setTimeout(async () => {
            if ((window as any).__submitInProgress) return;
            await syncStepWithBitrix(currentStep);
        }, 2000);

        return () => clearTimeout(timer);
    }, [currentStep, syncStepWithBitrix, isSubmitting]);


    const next = () => {
        if (currentStep < totalSteps) setStep(currentStep + 1);
    };

    const prev = () => {
        if (currentStep > 1) setStep(currentStep - 1);
    };

    const goToStep = (step: number) => {
        if (step <= maxVisitedStep || step === currentStep + 1) {
            setStep(step);
        }
    };

// Compress a base64 image — tries progressively harder until under MAX_B64_BYTES
const MAX_B64_BYTES = 150 * 1024; // 150KB base64 ≈ ~110KB binary

async function compressImage(base64: string): Promise<string> {
    return new Promise((resolve) => {
        const img = new Image()
        img.onload = () => {
            // Try progressively smaller/lower quality until under limit
            const attempts = [
                { max: 800, quality: 0.60 },
                { max: 600, quality: 0.50 },
                { max: 400, quality: 0.40 },
            ];
            for (const { max, quality } of attempts) {
                const ratio = Math.min(max / img.width, max / img.height, 1)
                const canvas = document.createElement('canvas')
                canvas.width = Math.round(img.width * ratio)
                canvas.height = Math.round(img.height * ratio)
                const ctx = canvas.getContext('2d')!
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
                const result = canvas.toDataURL('image/jpeg', quality)
                if (result.length <= MAX_B64_BYTES || quality === 0.40) {
                    resolve(result)
                    return
                }
            }
            resolve('') // give up — skip this photo
        }
        img.onerror = () => resolve('') // can't load — skip, don't send original
        img.src = base64
    })
}

// Convert a base64 data URL directly to a Blob — avoids fetch(dataUrl) which
// can produce a Blob with wrong/empty Content-Type on some mobile browsers,
// causing Starlette's multipart parser to reject the request with 400 before
// the route handler even runs.
function dataUrlToBlob(dataUrl: string): Blob {
    const [header, b64] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bytes = atob(b64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
}

    const handleSubmit = async (e?: React.MouseEvent) => {
        console.log('[handleSubmit] FIRED — isSubmitting:', isSubmitting);
        e?.preventDefault();
        e?.stopPropagation();

        // Guard: prevent double-submit
        if (isSubmitting) return;

        // Kill any in-flight auto-sync before submitting
        if (typeof window !== 'undefined') {
            (window as any).__submitInProgress = true;
        }

        setIsSubmitting(true);
        setSubmitStatus('idle');
        setSubmitError('');

        // Read from store synchronously — before any awaits
        const store = useInspectionStore.getState();
        const dealId = store.jobs?.currentJobId;

        if (!dealId) {
            setSubmitError('Brak ID zlecenia — odśwież stronę');
            setSubmitStatus('error');
            setIsSubmitting(false);
            return;
        }

        const token = store.auth?.token;
        if (!token) {
            window.location.replace('/');
            return;
        }

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        console.log('[Submit] apiUrl:', apiUrl);

        // Compress and upload photos before submit
        const rawPhotos = store.data?.photos || [];
        const photoArray = Array.isArray(rawPhotos) ? rawPhotos : [];
        const photosWithData = (photoArray as Array<{id: string; base64: string}>)
            .filter(slot => slot?.base64?.startsWith('data:image'));

        // Photo upload phase (non-blocking — entire phase is guarded)
        // NOTE: No setSubmitError calls inside the loop — React re-renders during the
        // animated spinner cause insertBefore DOM crashes. Use console.log only.
        // Collect compressed data URLs for PDF generation (avoids re-downloading from Bitrix).
        const uploadedPhotoData: Record<string, string> = {};
        try {
            if (photosWithData.length > 0) {
                console.log(`[Submit] Uploading ${photosWithData.length} photos...`);
                let uploaded = 0;
                for (const slot of photosWithData) {
                    try {
                        const compressed = await compressImage(slot.base64);
                        const b64 = compressed.split(',')[1]; // strip data URL prefix
                        if (!b64) {
                            console.warn(`[Photo] ${slot.id}: skipped (empty after compression)`);
                            continue;
                        }
                        console.log(`[Photo] ${slot.id}: ${(b64.length * 0.75 / 1024).toFixed(0)}KB (b64 ${(b64.length/1024).toFixed(0)}KB)`);

                        // Retry once — first TCP connection can fail with cold-start disconnect
                        let uploadOk = false;
                        for (let attempt = 0; attempt < 2 && !uploadOk; attempt++) {
                            if (attempt > 0) {
                                console.log(`[Photo] ${slot.id}: retrying after 2s...`);
                                await new Promise(r => setTimeout(r, 2000));
                            }
                            const controller = new AbortController();
                            const timeout = setTimeout(() => controller.abort(), 30000);
                            try {
                                const uploadRes = await fetch(`${apiUrl}/files/upload-json`, {
                                    method: 'POST',
                                    signal: controller.signal,
                                    headers: {
                                        'Authorization': `Bearer ${token}`,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        deal_id: Number(dealId),
                                        field_key: slot.id,
                                        file_base64: b64,
                                        filename: `${slot.id}.jpg`
                                    })
                                });
                                clearTimeout(timeout);
                                if (uploadRes.ok) {
                                    uploadOk = true;
                                    uploaded++;
                                    // Keep compressed data URL for PDF (avoids downloading from Bitrix)
                                    uploadedPhotoData[slot.id] = compressed;
                                    console.log(`[Photo] ${slot.id}: uploaded OK (${uploaded}/${photosWithData.length})`);
                                } else {
                                    const errBody = await uploadRes.text().catch(() => '<unreadable>');
                                    console.warn(`[Photo] Upload failed for ${slot.id} (attempt ${attempt+1}): ${uploadRes.status} — ${errBody.slice(0, 200)}`);
                                }
                            } catch(fetchErr) {
                                clearTimeout(timeout);
                                console.warn(`[Photo] Fetch error for ${slot.id} (attempt ${attempt+1}):`, fetchErr);
                            }
                        }
                    } catch(e) {
                        console.warn(`[Photo] Error for ${slot.id}:`, e);
                    }
                }
                console.log(`[Submit] Photo upload done: ${uploaded}/${photosWithData.length} succeeded`);
            }
        } catch (photoErr) {
            console.warn('[Submit] Photo upload phase failed:', photoErr);
        }

        // ALWAYS reaches here regardless of photo upload outcome
        console.log('[Submit] Starting submit POST via api.submitInspection...');

        // Collect signatures from store before submitting
        const storeData = useInspectionStore.getState().data;
        const finalSummary = storeData?.finalSummary || {};
        const sigPayload = {
            signatureAppraiser: finalSummary.signatureAppraiser || '',
            signatureClient: finalSummary.signatureClient || '',
            signatureYard: finalSummary.signatureYard || '',
            vinConfirmed: finalSummary.vinConfirmed || false,
        };
        console.log('[Submit] Signatures:', Object.entries(sigPayload).filter(([, v]) => v).map(([k]) => k));

        try {
            // Use the shared api client (same BASE_URL + authFetch as all working calls)
            await api.submitInspection(String(dealId), {
                deal_id: dealId,
                photos: uploadedPhotoData,  // pass compressed data URLs for PDF generation
                finalSummary: sigPayload
            });

            // SUCCESS — clear job from store so dashboard doesn't re-open wizard
            console.log('[handleSubmit] SUCCESS — navigating to dashboard');
            if (typeof window !== 'undefined') (window as any).__submitInProgress = false;
            useInspectionStore.getState().selectJob(null);
            setSubmitStatus('success');
            setIsSubmitting(false);
            setTimeout(() => {
                window.location.replace('/dashboard');
            }, 1500);

        } catch (err: any) {
            console.error('[Submit] ERROR:', err?.name, err?.message, err);
            if (typeof window !== 'undefined') (window as any).__submitInProgress = false;
            setSubmitError(err.message || 'Nieznany błąd');
            setSubmitStatus('error');
            setIsSubmitting(false);
        }
    };

    console.log('[WizardLayout] currentStep:', currentStep, 'totalSteps:', totalSteps, 'isSubmitting:', isSubmitting);

    return (
        <div className="flex flex-col min-h-[100dvh] max-w-lg mx-auto bg-background overflow-x-hidden transition-colors duration-300">
            {/* ── Header ─────────────────────────────────────── */}
            <header className="sticky top-0 z-30 bg-surface dark:bg-background/80 backdrop-blur-lg text-foreground px-4 pt-3 pb-2 shadow-lg transition-colors border-b border-border/50">
                <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-3 overflow-visible">
                        <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '8px',
                            overflow: 'visible',
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: '#000000',
                            padding: '2px'
                        }}>
                            <img
                                src="/images/logo.png"
                                alt="R"
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'contain',
                                    display: 'block'
                                }}
                            />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold tracking-tight text-foreground leading-tight">
                                {STEPS[currentStep - 1]?.label || 'Podsumowanie'}
                            </h2>
                            <p className="text-[10px] text-primary font-black uppercase tracking-widest">
                                Krok {currentStep} / {totalSteps}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="scale-90 origin-right">
                            <ThemeToggle />
                        </div>
                        <button
                            onClick={() => selectJob(null)}
                            className="p-1.5 hover:bg-surface-raised rounded-lg transition-colors text-muted hover:text-foreground"
                            title="Dashboard"
                        >
                            <Home size={18} />
                        </button>
                        <button
                            onClick={logout}
                            className="p-1.5 hover:bg-danger-light rounded-lg transition-colors text-danger/70 hover:text-danger"
                            title="Wyloguj"
                        >
                            <LogOut size={18} />
                        </button>
                    </div>
                </div>

                {/* Step Dots */}
                <div className="flex items-center gap-1 justify-between mb-2 overflow-x-auto py-1 no-scrollbar">
                    {STEPS.map((step) => (
                        <button
                            key={step.num}
                            onClick={() => goToStep(step.num)}
                            aria-label={`Go to step ${step.num}: ${step.label}`}
                            className={cn(
                                "step-dot",
                                step.num === currentStep && "active",
                                step.num < currentStep && "completed",
                                step.num > currentStep && "upcoming",
                                step.num > maxVisitedStep && step.num !== currentStep + 1 && "opacity-40 cursor-not-allowed"
                            )}
                        >
                            {step.num}
                        </button>
                    ))}
                </div>

                <ProgressBar currentStep={currentStep} totalSteps={totalSteps} />
            </header>

            {/* ── Main Content ───────────────────────────────── */}
            <main className="flex-1 p-4 overflow-y-auto pb-28 animate-fade-in" key={currentStep}>
                {children}
            </main>

            {/* ── Bottom Navigation ──────────────────────────── */}
            <footer className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto glass-card border-t border-border z-30 p-4 safe-area-bottom shadow-[0_-10px_20px_rgba(0,0,0,0.05)]">
                <div className="flex gap-4">
                <button
                    onClick={prev}
                    disabled={currentStep === 1}
                    aria-label="Previous step"
                    className={cn(
                        "flex-1 py-5 px-6 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-all duration-300 active:scale-[0.95]",
                        currentStep === 1
                            ? "bg-muted/10 text-muted/30 cursor-not-allowed"
                            : "bg-surface border-2 border-border text-foreground hover:border-primary/50 shadow-sm"
                    )}
                >
                    <ChevronLeft size={20} className="stroke-[3]" />
                    Wstecz
                </button>

                {currentStep === totalSteps ? (
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || submitStatus === 'success'}
                        aria-label="Submit inspection"
                        className={`flex-[1.5] py-5 px-6 rounded-2xl font-black text-sm tracking-widest text-white flex items-center justify-center gap-2 shadow-xl active:scale-[0.95] uppercase ${
                            isSubmitting ? 'bg-gray-400 cursor-wait' :
                            submitStatus === 'success' ? 'bg-green-500 cursor-default' :
                            submitStatus === 'error' ? 'bg-red-500' :
                            'bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500'
                        }`}
                    >
                        {/* Stable DOM: both spans always mounted, CSS-toggled.
                            Conditional rendering swaps SVG↔div causing React insertBefore crash. */}
                        <span style={{display: isSubmitting ? 'none' : 'flex', alignItems: 'center', gap: '8px'}}>
                            <Send size={20} className="stroke-[3]" />
                            {submitStatus === 'success' ? '✅ Raport wysłany pomyślnie!' :
                             submitStatus === 'error' ? '❌ Błąd — spróbuj ponownie' :
                             'WYŚLIJ RAPORT'}
                        </span>
                        <span style={{display: isSubmitting ? 'flex' : 'none', alignItems: 'center', gap: '8px'}}>
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            WYSYŁANIE...
                        </span>
                    </button>
                ) : (
                    <button
                        onClick={next}
                        aria-label="Next step"
                        className="flex-[1.5] py-5 px-6 rounded-2xl font-black text-sm tracking-widest bg-primary text-white flex items-center justify-center gap-2 shadow-xl shadow-primary/20 hover:bg-primary-hover active:scale-[0.95] uppercase ring-4 ring-primary/10"
                    >
                        Dalej
                        <ChevronRight size={20} className="stroke-[3]" />
                    </button>
                )}
                </div>

                {/* Upload progress feedback */}
                {isSubmitting && submitError && (
                    <p className="mt-2 text-center text-xs text-muted font-medium">{submitError}</p>
                )}

                {/* Submit error feedback */}
                {submitStatus === 'error' && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-center">
                        <p className="text-red-700 font-bold text-sm">❌ Błąd wysyłania</p>
                        <p className="text-red-600 text-xs mt-1">{submitError}</p>
                        <button onClick={handleSubmit} className="mt-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold">
                            Spróbuj ponownie
                        </button>
                    </div>
                )}
            </footer>
        </div>
    );
}
