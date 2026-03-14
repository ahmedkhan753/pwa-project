"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { AlertCircle, Camera, CheckCircle2, Paintbrush, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SummaryReviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    onContinue: () => void;
}

export function SummaryReviewModal({ isOpen, onClose, onContinue }: SummaryReviewModalProps) {
    const { data } = useInspectionStore();

    if (!isOpen) return null;

    // Validation Logic
    const missingMainPhotos = data.photos.filter(p => p.required && !p.base64);
    const missingPaint = Object.values(data.paintMeasurement).filter(p => !p.value);

    const exteriorDamageErrors = data.exteriorDamage.filter(d => d.photos.length < 2);
    const interiorDamageErrors = data.interiorDamage.filter(d => d.photos.length < 2);

    const hasErrors = missingMainPhotos.length > 0 ||
        missingPaint.length > 0 ||
        exteriorDamageErrors.length > 0 ||
        interiorDamageErrors.length > 0;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in transition-all">
            <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-2xl animate-scale-up border border-slate-200 dark:border-slate-800">
                <div className="p-6 border-b border-border flex items-center justify-between bg-primary/5 dark:bg-primary/10">
                    <div className="flex items-center gap-2">
                        <AlertCircle className="text-primary" size={22} />
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Przegląd Raportu</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-black/5 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 rounded-xl transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4 bg-white dark:bg-slate-900">
                    {!hasErrors ? (
                        <div className="text-center py-4">
                            <CheckCircle2 size={48} className="mx-auto text-green-500 mb-2" />
                            <p className="text-sm text-foreground font-bold">Wszystko wygląda poprawnie!</p>
                            <p className="text-xs text-secondary">Możesz przejść do podpisów i wysyłki.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-xs font-bold text-secondary uppercase tracking-widest">Wymagane uzupełnienie:</p>

                            {missingMainPhotos.length > 0 && (
                                <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-950/20 rounded-2xl border border-red-100 dark:border-red-900/30">
                                    <Camera size={18} className="text-red-500 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-sm font-bold text-red-600 dark:text-red-400">Brakujące zdjęcia główne ({missingMainPhotos.length})</p>
                                        <p className="text-[10px] text-red-500/80">{missingMainPhotos.map(p => p.label).join(', ')}</p>
                                    </div>
                                </div>
                            )}

                            {missingPaint.length > 0 && (
                                <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-2xl border border-amber-100 dark:border-amber-900/30">
                                    <Paintbrush size={18} className="text-amber-500 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-sm font-bold text-amber-600 dark:text-amber-400">Niekompletny pomiar lakieru</p>
                                        <p className="text-[10px] text-amber-500/80">Brak pomiarów dla {missingPaint.length} elementów.</p>
                                    </div>
                                </div>
                            )}

                            {(exteriorDamageErrors.length > 0 || interiorDamageErrors.length > 0) && (
                                <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-950/20 rounded-2xl border border-red-100 dark:border-red-900/30">
                                    <AlertCircle size={18} className="text-red-500 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-sm font-bold text-red-600 dark:text-red-400">Zdjęcia uszkodzeń</p>
                                        <p className="text-[10px] text-red-500/80">
                                            Każde uszkodzenie musi posiadać minimum 2 zdjęcia.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-6 bg-gray-50 dark:bg-gray-900/50 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3.5 px-4 bg-white dark:bg-gray-800 border-2 border-border text-foreground font-bold rounded-2xl text-sm transition-transform active:scale-95"
                    >
                        Wróć i popraw
                    </button>
                    <button
                        onClick={onContinue}
                        className={cn(
                            "flex-1 py-3.5 px-4 font-bold rounded-2xl text-sm transition-all active:scale-95 shadow-lg",
                            hasErrors
                                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                : "bg-primary text-white hover:bg-primary-dark"
                        )}
                        disabled={hasErrors}
                    >
                        Kontynuuj
                    </button>
                </div>
            </div>
        </div>
    );
}
