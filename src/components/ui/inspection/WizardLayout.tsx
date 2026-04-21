"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { ProgressBar } from "./ProgressBar";
import { ChevronLeft, ChevronRight, Send, LogOut, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/ui/Logo";
import { startUploadWorker, stopUploadWorker } from "@/lib/uploadWorker";
import { photoQueue } from "@/lib/photoUploadQueue";

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
    const mainRef = useRef<HTMLElement>(null);
    const didMountRef = useRef(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [submitError, setSubmitError] = useState<string>('');

    // ── Start the IndexedDB-backed upload worker ──────────────────
    // Survives iOS crashes: on reload, the worker picks up any queued
    // photos from IndexedDB and resumes uploading automatically.
    useEffect(() => {
        const store = useInspectionStore.getState();
        const tok = store.auth?.token;
        const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        if (tok) {
            startUploadWorker(tok, url);
        }
        return () => { stopUploadWorker(); };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Scroll to top on step change — covers both the inner scroll container
    // and window/document for browsers where the page itself scrolls.
    useEffect(() => {
        if (mainRef.current) mainRef.current.scrollTop = 0;
        try {
            window.scrollTo(0, 0);
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
        } catch { /* ignore */ }
    }, [currentStep]);

    // Bitrix Auto-Sync (Anti-Oops) — fires on step CHANGE, syncs the PREVIOUS step.
    // When the user leaves step 4 (paint) for step 5, we sync step 4 with the
    // paint data they just filled in. Skipped on initial mount to avoid iOS loops.
    const prevStepRef = useRef(currentStep);
    useEffect(() => {
        if (!didMountRef.current) {
            didMountRef.current = true;
            return; // Skip sync on first render (mount / rehydration)
        }
        if (isSubmitting) return;

        const prevStep = prevStepRef.current;
        prevStepRef.current = currentStep;

        // Sync the step the user just LEFT (has filled data), not the one they entered
        if (prevStep !== currentStep && prevStep >= 1) {
            const timer = setTimeout(async () => {
                await syncStepWithBitrix(prevStep);
            }, 500);
            return () => clearTimeout(timer);
        }
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


    const handleSubmit = async (e?: React.MouseEvent) => {
        e?.preventDefault();
        e?.stopPropagation();

        if (isSubmitting) return;

        const store = useInspectionStore.getState();
        const dealId = store.jobs?.currentJobId;

        if (!dealId) {
            setSubmitError('Brak ID zlecenia — odśwież stronę');
            setSubmitStatus('error');
            return;
        }

        const token = store.auth?.token;
        if (!token) {
            window.location.replace('/');
            return;
        }

        setIsSubmitting(true);

        // Snapshot data before clearing
        const storeData = { ...store.data };
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

        // Persist a recovery draft for this deal BEFORE clearing the wizard.
        // If submit fails (network / server / oversized payload), the user can
        // re-open the deal from the dashboard and Zustand's selectJob() will
        // rehydrate from drafts[dealId] — nothing is lost. Without this, the
        // fire-and-forget clearInspection() below wiped state and a failed
        // submit meant the whole inspection had to be redone (Żuraw case).
        useInspectionStore.setState((s) => ({
            drafts: { ...s.drafts, [dealId]: storeData },
        }));

        // Mark uploading so dashboard card shows progress badge immediately
        useInspectionStore.getState().setSubmissionStatus(dealId, 'uploading');

        // Clear the IndexedDB upload queue for this deal — photos are already
        // in the backend DB (the worker uploaded them during step 6).
        photoQueue.clearDeal(dealId).catch(() => {});

        // Clear wizard — DashboardPage renders <Dashboard /> instantly.
        // This is a React state change (no URL navigation), so iOS WebKit
        // does NOT kill the background IIFE below.
        useInspectionStore.getState().clearInspection();

        // ── Fire-and-forget: runs after dashboard appears ──────────────
        (async () => {
            // Photos are already in DB from immediate step-6 uploads — no need to re-upload.
            // The backend reads photos directly from the DB when generating the PDF.

            // Submit — backend generates PDF in background, returns fast
            const finalSummary = storeData?.finalSummary || {};
            try {
                const res = await fetch(`${apiUrl}/inspection/submit`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        deal_id: dealId,
                        photos: {},
                        finalSummary: {
                            signatureAppraiser: finalSummary.signatureAppraiser || '',
                            signatureClient: finalSummary.signatureClient || '',
                            signatureYard: finalSummary.signatureYard || '',
                            vinConfirmed: (finalSummary as any).vinConfirmed || false,
                        },
                        vehicleData: storeData?.vehicleData || {},
                        equipmentCompleteness: storeData?.equipmentCompleteness || {},
                        fullEquipment: storeData?.fullEquipment || {},
                        paintMeasurement: storeData?.paintMeasurement || {},
                        tires: storeData?.tires || {},
                        exteriorDamage: storeData?.exteriorDamage || [],
                        interiorDamage: storeData?.interiorDamage || [],
                        mechanical: storeData?.mechanical || {},
                        notesValuation: storeData?.notesValuation || {},
                    }),
                });
                if (res.ok) {
                    // Submit confirmed — safe to discard the recovery draft.
                    useInspectionStore.setState((s) => {
                        const { [dealId]: _discard, ...remaining } = s.drafts;
                        return { drafts: remaining };
                    });
                    useInspectionStore.getState().setSubmissionStatus(dealId, 'pending');
                } else {
                    throw new Error(`HTTP ${res.status}`);
                }
            } catch {
                // Keep drafts[dealId] intact — user re-opens deal from dashboard to retry.
                useInspectionStore.getState().setSubmissionStatus(dealId, 'error');
            }
        })();
    };

    if (isSubmitting) return null;

    return (
        <div className="flex flex-col min-h-[100dvh] max-w-lg mx-auto bg-background overflow-x-hidden transition-colors duration-300">
            {/* ── Header ─────────────────────────────────────── */}
            <header className="sticky top-0 z-30 bg-surface dark:bg-background/80 backdrop-blur-lg text-foreground px-4 pt-3 pb-2 shadow-lg transition-colors border-b border-border/50">
                <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-3 overflow-visible">
                        <Logo variant="icon" size="sm" />
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
            <main ref={mainRef} className="flex-1 p-4 overflow-y-auto pb-28">
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

                {/* Validation error feedback (no dealId / no token) */}
                {submitStatus === 'error' && submitError && (
                    <p className="mt-2 text-center text-xs text-red-600 font-medium">{submitError}</p>
                )}
            </footer>
        </div>
    );
}
