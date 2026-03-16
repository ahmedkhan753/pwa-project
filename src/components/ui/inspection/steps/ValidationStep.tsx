"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { AlertTriangle, CheckCircle2, ChevronRight, Camera, FileText, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

export function ValidationStep() {
    const { data, setStep } = useInspectionStore();

    // Validation Logic
    const getValidationErrors = () => {
        const errors = [];

        // Step 1: Vehicle Data
        if (!data.vehicleData.vin) errors.push({ step: 1, label: "Brak numeru VIN", category: "Pojazd" });
        if (!data.vehicleData.make) errors.push({ step: 1, label: "Brak marki pojazdu", category: "Pojazd" });

        // Step 2 & 3: Equipment (Check if all nulls are gone)
        const equipmentNulls = Object.values(data.equipmentCompleteness).filter(v => v === null).length;
        if (equipmentNulls > 0) errors.push({ step: 2, label: `Nieupełna kompletność (${equipmentNulls} pól)`, category: "Dokumenty" });

        // Step 5: Tires
        const wheels = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'] as const;
        const missingTireData = wheels.some(w => !data.tires[w].brand || !data.tires[w].size);
        if (missingTireData) errors.push({ step: 5, label: "Brak danych opon (marka/rozmiar)", category: "Opony" });

        // Step 6: Photos (Required only)
        const requiredPhotosMissing = data.photos.filter(p => p.required && !p.base64).map(p => p.label);
        if (requiredPhotosMissing.length > 0) {
            errors.push({ 
                step: 6, 
                label: `Brak wymaganych zdjęć (${requiredPhotosMissing.length})`, 
                category: "Zdjęcia",
                details: requiredPhotosMissing.join(", ")
            });
        }

        // Step 9: Mechanical
        const mechanicalNulls = Object.values(data.mechanical).filter(v => v === null).length;
        if (mechanicalNulls > 5) errors.push({ step: 9, label: "Brak weryfikacji mechanicznej", category: "Mechanika" });

        return errors;
    };

    const errors = getValidationErrors();
    const isReady = errors.length === 0;

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <div className="text-center space-y-2 mb-8">
                <div className={cn(
                    "w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4 transition-all duration-500",
                    isReady ? "bg-emerald-500 shadow-lg shadow-emerald-500/20" : "bg-amber-500 shadow-lg shadow-amber-500/20"
                )}>
                    {isReady ? <CheckCircle2 size={32} className="text-white" /> : <AlertTriangle size={32} className="text-white" />}
                </div>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                    {isReady ? "Wszystko Gotowe!" : "Wykryto Braki"}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-[200px] mx-auto font-medium">
                    {isReady 
                        ? "Protokół jest kompletny i gotowy do podpisania." 
                        : "Uzupełnij poniższe dane przed wysłaniem raportu."}
                </p>
            </div>

            <div className="space-y-3">
                {errors.map((err, idx) => (
                    <button
                        key={idx}
                        onClick={() => setStep(err.step)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 flex items-center gap-4 text-left active:scale-[0.98] transition-all hover:border-amber-500/50 group"
                    >
                        <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-600 flex-shrink-0">
                            {err.step === 6 ? <Camera size={20} /> : err.step === 1 ? <ClipboardList size={20} /> : <FileText size={20} />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-0.5">{err.category}</p>
                            <h4 className="font-black text-sm text-slate-900 dark:text-white truncate">{err.label}</h4>
                            {err.details && <p className="text-[10px] text-slate-400 truncate font-bold">{err.details}</p>}
                        </div>
                        <ChevronRight size={18} className="text-slate-300 group-hover:text-amber-500" />
                    </button>
                ))}

                {isReady && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-8 text-center space-y-4">
                        <CheckCircle2 size={40} className="text-emerald-500 mx-auto" />
                        <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                            Walidacja przebiegła pomyślnie. Możesz przejść do składania podpisów.
                        </p>
                    </div>
                )}
            </div>

            {!isReady && (
                <div className="p-4 bg-slate-100 dark:bg-slate-800/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                    <p className="text-[10px] text-slate-400 font-bold text-center uppercase leading-normal">
                        Kliknij w brakujący element, aby szybko przejść do odpowiedniego kroku inspekcji.
                    </p>
                </div>
            )}
        </div>
    );
}
