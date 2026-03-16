"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { ProgressBar } from "./ProgressBar";
import { ChevronLeft, ChevronRight, Send, Save, LogOut, Home, Cloud, CloudOff, RefreshCcw } from "lucide-react";
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
    const [showSaved, setShowSaved] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncError, setSyncError] = useState(false);

    // Bitrix Auto-Sync (Anti-Oops)
    useEffect(() => {
        const performSync = async () => {
            setIsSyncing(true);
            setSyncError(false);
            try {
                await syncStepWithBitrix(currentStep);
                setShowSaved(true);
                setTimeout(() => setShowSaved(false), 2000);
            } catch (err) {
                setSyncError(true);
            } finally {
                setIsSyncing(false);
            }
        };

        performSync();
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
            <header className="sticky top-0 z-30 bg-white dark:bg-slate-950 text-foreground px-4 pt-3 pb-2 shadow-lg transition-colors border-b border-border/50">
                <div className="flex justify-between items-center mb-2">
                    <div>
                        <h2 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                            {STEPS[currentStep - 1].label}
                        </h2>
                        <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                            Krok {currentStep} z {totalSteps}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {isSyncing && (
                            <span className="flex items-center gap-1 text-[10px] text-blue-500 animate-pulse bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                                <RefreshCcw size={10} className="animate-spin" />
                                Bitrix...
                            </span>
                        )}
                        {syncError ? (
                            <span className="flex items-center gap-1 text-[10px] text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                                <CloudOff size={10} />
                                Offline
                            </span>
                        ) : !isSyncing && (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                <Cloud size={10} />
                                Synced
                            </span>
                        )}
                        <div className="scale-90 origin-right">
                            <ThemeToggle />
                        </div>
                        <button
                            onClick={() => selectJob(null)}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-500 dark:text-slate-400"
                            title="Dashboard"
                        >
                            <Home size={18} />
                        </button>
                        <button
                            onClick={logout}
                            className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors text-red-500 dark:text-red-400"
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
                            ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                            : "bg-white border-2 border-slate-200 text-slate-700 hover:border-primary/50 shadow-sm"
                    )}
                >
                    <ChevronLeft size={20} className="stroke-[3]" />
                    Wstecz
                </button>

                {currentStep === totalSteps ? (
                    <button
                        onClick={() => { }}
                        aria-label="Submit inspection"
                        className="flex-[1.5] py-5 px-6 rounded-2xl font-black text-sm tracking-widest bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 text-white flex items-center justify-center gap-2 shadow-xl shadow-orange-500/20 active:scale-[0.95] uppercase ring-2 ring-orange-400 ring-offset-2"
                    >
                        <Send size={20} className="stroke-[3]" />
                        WYŚLIJ RAPORT
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
