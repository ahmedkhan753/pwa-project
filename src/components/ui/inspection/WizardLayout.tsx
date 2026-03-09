"use client";

import { SummaryReviewModal } from "./SummaryReviewModal";

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
    { num: 11, short: "Wyślij", label: "Podsumowanie" },
];

export function WizardLayout({ children }: { children: React.ReactNode }) {
    const { currentStep, maxVisitedStep, setStep, logout, selectJob } = useInspectionStore();
    const totalSteps = STEPS.length;
    const [showSaved, setShowSaved] = useState(false);
    const [showReviewModal, setShowReviewModal] = useState(false);

    // Auto-save indicator
    useEffect(() => {
        const handleStorage = () => {
            setShowSaved(true);
            setTimeout(() => setShowSaved(false), 1500);
        };
        window.addEventListener("storage", handleStorage);
        // Also show on any store update
        const timer = setInterval(() => {
            const saved = localStorage.getItem("inspection-storage");
            if (saved) {
                setShowSaved(true);
                setTimeout(() => setShowSaved(false), 1500);
            }
        }, 30000);
        return () => {
            window.removeEventListener("storage", handleStorage);
            clearInterval(timer);
        };
    }, []);

    const next = () => {
        if (currentStep === 10) {
            setShowReviewModal(true);
            return;
        }
        if (currentStep < totalSteps) setStep(currentStep + 1);
    };

    const prev = () => {
        if (currentStep > 1) setStep(currentStep - 1);
    };

    const goToStep = (step: number) => {
        if (step === 11 && currentStep < 11) {
            setShowReviewModal(true);
            return;
        }
        if (step <= maxVisitedStep || step === currentStep + 1) {
            setStep(step);
        }
    };

    const handleConfirmReview = () => {
        setShowReviewModal(false);
        setStep(11);
    };

    return (
        <div className="flex flex-col min-h-[100dvh] max-w-lg mx-auto bg-background overflow-x-hidden">
            {/* ── Header ─────────────────────────────────────── */}
            <header className="sticky top-0 z-30 bg-[#0f172a] text-white px-4 pt-3 pb-2 shadow-lg">
                <div className="flex justify-between items-center mb-2">
                    <div>
                        <h2 className="text-base font-bold tracking-tight">
                            {STEPS[currentStep - 1].label}
                        </h2>
                        <p className="text-xs text-blue-300 font-medium">
                            Krok {currentStep} z {totalSteps}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {showSaved && (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-400 animate-fade-in bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                <Save size={10} />
                                Zapisano
                            </span>
                        )}
                        <button
                            onClick={() => selectJob(null)}
                            className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors text-slate-400"
                            title="Dashboard"
                        >
                            <Home size={18} />
                        </button>
                        <button
                            onClick={logout}
                            className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors text-red-400"
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
            <footer className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto glass-card border-t border-border z-30 p-3 flex gap-3 safe-area-bottom">
                <button
                    onClick={prev}
                    disabled={currentStep === 1}
                    aria-label="Previous step"
                    className={cn(
                        "flex-1 py-3.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98]",
                        currentStep === 1
                            ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                            : "bg-surface border-2 border-border text-foreground hover:bg-gray-50 active:bg-gray-100"
                    )}
                >
                    <ChevronLeft size={18} />
                    Wstecz
                </button>

                {currentStep === totalSteps ? (
                    <button
                        onClick={() => { }}
                        aria-label="Submit inspection"
                        className="flex-1 py-3.5 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-orange-500 text-white flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all duration-200 active:scale-[0.98]"
                    >
                        <Send size={18} />
                        WYŚLIJ
                    </button>
                ) : (
                    <button
                        onClick={next}
                        aria-label="Next step"
                        className="flex-1 py-3.5 px-4 rounded-xl font-bold text-sm bg-primary text-white flex items-center justify-center gap-2 shadow-md hover:bg-primary-hover transition-all duration-200 active:scale-[0.98]"
                    >
                        Dalej
                        <ChevronRight size={18} />
                    </button>
                )}
            </footer>

            <SummaryReviewModal
                isOpen={showReviewModal}
                onClose={() => setShowReviewModal(false)}
                onContinue={handleConfirmReview}
            />
        </div>
    );
}
