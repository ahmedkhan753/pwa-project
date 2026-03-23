"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { ProgressBar } from "./ProgressBar";
import { Logo } from "@/components/ui/Logo";
import { ChevronLeft, ChevronRight, Send, Save, LogOut, Home, Cloud, CloudOff, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { api } from "@/lib/api";

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
    const { currentStep, maxVisitedStep, setStep, logout, selectJob, syncStepWithBitrix, clearInspection, data: currentOrder } = useInspectionStore();
    const router = useRouter();
    const totalSteps = STEPS.length;
    const [showSaved, setShowSaved] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncError, setSyncError] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [submitError, setSubmitError] = useState<string>('');

    // Bitrix Auto-Sync (Anti-Oops)
    useEffect(() => {
        let cancelled = false;
        const performSync = async () => {
            setIsSyncing(true);
            setSyncError(false);
            try {
                await syncStepWithBitrix(currentStep);
                if (cancelled) return;
                setShowSaved(true);
                setTimeout(() => { if (!cancelled) setShowSaved(false); }, 2000);
            } catch (err) {
                if (cancelled) return;
                setSyncError(true);
            } finally {
                if (cancelled) return;
                setIsSyncing(false);
            }
        };

        performSync();
        return () => { cancelled = true; };
    }, [currentStep, syncStepWithBitrix]);

    // Local Persistence indicator (storage events)
    useEffect(() => {
        const handleStorage = () => {
            setShowSaved(true);
            setTimeout(() => setShowSaved(false), 1500);
        };
        window.addEventListener("storage", handleStorage);
        return () => window.removeEventListener("storage", handleStorage);
    }, []);

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

    const handleSubmit = async () => {
        try {
            // Immediately disable button and show spinner
            setIsSubmitting(true);
            setSubmitStatus('idle');
            setSubmitError('');

            // Stop background sync
            useInspectionStore.getState().setIsSubmitting(true);

            // Wait 100ms for in-flight syncs
            await new Promise(resolve => setTimeout(resolve, 100));

            // Get deal ID
            const finalDealId = useInspectionStore.getState().jobs.currentJobId;
            if (!finalDealId) throw new Error("Brak ID zlecenia");

            // Get token safely
            const token = (() => {
                try {
                    const stored = localStorage.getItem('inspection-storage');
                    if (stored) {
                        const parsed = JSON.parse(stored);
                        if (parsed?.state?.auth?.token) return parsed.state.auth.token;
                    }
                } catch {}
                return localStorage.getItem('token') ||
                       localStorage.getItem('access_token') || null;
            })();

            if (!token) {
                // Clear corrupted state and redirect to login
                localStorage.clear();
                window.location.replace('/login');
                return;
            }

            // 1. Mandatory Photo Retry Loop (Upload any remaining base64/local photos)
            const slots = useInspectionStore.getState().data?.photos || [];
            const pendingSlots = slots.filter((s: any) => s.base64 && s.base64.startsWith('data:'));
            
            if (pendingSlots.length > 0) {
                console.log(`[Submit] Retrying ${pendingSlots.length} pending uploads...`);
                for (const slot of pendingSlots) {
                    try {
                        const res = await fetch(slot.base64);
                        const blob = await res.blob();
                        const file = new File([blob], `${slot.id}.webp`, { type: 'image/webp' });
                        const result = await api.uploadFile(finalDealId, slot.id, file);
                        if (result.success && result.url) {
                            useInspectionStore.getState().setPhotoSlot(slot.id, result.url);
                        }
                    } catch (e) {
                        console.warn(`[Submit] Retry failed for slot ${slot.id}:`, e);
                    }
                }
            }

            // 2. Build collection for submission (prefer URLs, send base64 as absolute fallback)
            const finalPhotos = useInspectionStore.getState().data.photos;
            const photoCollection: Record<string, string> = {};
            finalPhotos.forEach((s: any) => {
                if (s.base64) photoCollection[s.id] = s.base64;
            });

            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

            // 3. Final Submit
            const response = await fetch(`${apiUrl}/inspection/submit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    ...useInspectionStore.getState().data,
                    deal_id: finalDealId,
                    photos: photoCollection, // This will mostly contain URLs now!
                })
            });

            if (response.status === 401) {
                // Token expired — clear and redirect to login
                localStorage.clear();
                window.location.replace('/login');
                return;
            }

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || `Błąd serwera (${response.status})`);
            }

            // SUCCESS
            setSubmitStatus('success');

            // Clear store safely
            try {
                useInspectionStore.getState().clearInspection?.();
            } catch (e) {
                console.warn('Store clear error:', e);
            }

            // Wait 2 seconds to show success message then redirect
            setTimeout(() => {
                window.location.replace('/dashboard');
            }, 2000);

        } catch (error: any) {
            console.error('Submit error:', error);
            setSubmitStatus('error');
            setSubmitError(error.message || 'Nieznany błąd');
            setIsSubmitting(false);
            useInspectionStore.getState().setIsSubmitting(false);
        }
    };

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
                    submitStatus === 'idle' ? (
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        aria-label="Submit inspection"
                        className={cn(
                            "flex-[1.5] py-5 px-6 rounded-2xl font-black text-sm tracking-widest text-white flex items-center justify-center gap-2 shadow-xl shadow-orange-500/20 active:scale-[0.95] uppercase ring-2 ring-orange-400 ring-offset-2",
                            isSubmitting
                                ? "bg-gray-400 cursor-wait"
                                : "bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500"
                        )}
                    >
                        {isSubmitting ? (
                            <div className="flex items-center justify-center gap-3">
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                <span>Wysyłanie raportu...</span>
                            </div>
                        ) : (
                            <>
                                <Send size={20} className="stroke-[3]" />
                                WYŚLIJ RAPORT
                            </>
                        )}
                    </button>
                    ) : null
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

                {/* Submit status feedback — shown below nav buttons on Step 12 */}
                {currentStep === totalSteps && submitStatus === 'success' && (
                    <div className="mt-4 w-full py-4 rounded-2xl bg-green-500 text-white text-center font-bold text-lg">
                        <div className="flex items-center justify-center gap-2">
                            <span>✅</span>
                            <span>Raport wysłany pomyślnie!</span>
                        </div>
                        <p className="text-sm font-normal mt-1 opacity-80">
                            Przekierowywanie do dashboardu...
                        </p>
                    </div>
                )}

                {currentStep === totalSteps && submitStatus === 'error' && (
                    <div className="mt-4 space-y-3">
                        <div className="w-full py-4 rounded-2xl bg-red-50 border-2 border-red-200 text-center">
                            <p className="font-bold text-red-700">❌ Błąd wysyłania</p>
                            <p className="text-sm text-red-600 mt-1">{submitError}</p>
                        </div>
                        <button
                            onClick={handleSubmit}
                            className="w-full py-4 rounded-2xl bg-blue-600 text-white font-bold text-lg hover:bg-blue-700 active:scale-95 transition-all"
                        >
                            Spróbuj ponownie
                        </button>
                    </div>
                )}
            </footer>
        </div>
    );
}
