"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { ProgressBar } from "./ProgressBar";
import { Logo } from "@/components/ui/Logo";
import { ChevronLeft, ChevronRight, Send, Save, LogOut, Home, Cloud, CloudOff, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
    const { currentStep, maxVisitedStep, setStep, logout, selectJob, syncStepWithBitrix, clearInspection, data: currentOrder } = useInspectionStore();
    const router = useRouter();
    const totalSteps = STEPS.length;
    const [showSaved, setShowSaved] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncError, setSyncError] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

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
            <footer className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto glass-card border-t border-border z-30 p-4 flex gap-4 safe-area-bottom shadow-[0_-10px_20px_rgba(0,0,0,0.05)]">
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
                        onClick={async () => {
                            if (isSubmitting) return;

                            try {
                                setIsSubmitting(true);
                                setSubmitError(null);

                                // Get deal ID safely
                                const dealId = currentOrder?.vehicleData?.basicInfo?.companyName ? (useInspectionStore.getState().jobs.currentJobId) : null;
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
                                    return localStorage.getItem('token') || localStorage.getItem('access_token');
                                })();

                                if (!token) {
                                    alert("Sesja wygasła. Zaloguj się ponownie.");
                                    router.push('/login');
                                    return;
                                }

                                // Build photos map safely
                                const photoSlots = useInspectionStore.getState().data?.photos || [];
                                const photoMap: Record<string, string> = {};
                                photoSlots.forEach((slot: any) => {
                                    if (slot?.base64 && slot.base64.startsWith('data:')) {
                                        photoMap[slot.id] = slot.base64;
                                    }
                                });

                                // Submit to backend
                                const response = await fetch(
                                    `${process.env.NEXT_PUBLIC_API_URL}/inspection/submit`,
                                    {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                            'Authorization': `Bearer ${token}`
                                        },
                                        body: JSON.stringify({
                                            ...useInspectionStore.getState().data,
                                            deal_id: finalDealId,
                                            photos: photoMap,
                                            job_id: finalDealId
                                        })
                                    }
                                );

                                if (!response.ok) {
                                    const error = await response.json().catch(() => ({}));
                                    throw new Error(error.detail || `HTTP ${response.status}`);
                                }

                                const result = await response.json();
                                console.log("Submit success — navigating immediately:", result);

                                // IMMEDIATE NAVIGATION BEFORE ANY STATE UPDATES
                                window.location.replace('/dashboard');
                                return;

                            } catch (error: any) {
                                console.error("Submit error:", error);
                                setSubmitError(error.message);
                                alert(`Błąd wysyłania: ${error.message}`);
                            } finally {
                                try {
                                    setIsSubmitting(false);
                                } catch (e) {
                                    // ignore — component might be unmounting
                                }
                            }
                        }}
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
                            <>
                                <RefreshCcw size={20} className="stroke-[3] animate-spin" />
                                WYSYŁANIE...
                            </>
                        ) : (
                            <>
                                <Send size={20} className="stroke-[3]" />
                                WYŚLIJ RAPORT
                            </>
                        )}
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
            </footer>
        </div>
    );
}
