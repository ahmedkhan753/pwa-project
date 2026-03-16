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
            <div className="w-full max-w-md bg-surface rounded-3xl overflow-hidden shadow-2xl animate-scale-up border border-border">
                <div className="p-6 border-b border-border flex items-center justify-between bg-primary/5 dark:bg-primary/10">
                    <div className="flex items-center gap-2">
                        <AlertCircle className="text-primary" size={22} />
                        <h2 className="text-lg font-bold text-foreground">Przegląd Raportu</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-surface-raised text-muted rounded-xl transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4 bg-surface">
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
                                <div className="flex items-start gap-3 p-3 bg-danger-light rounded-2xl border border-danger/10">
                                    <Camera size={18} className="text-danger mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-sm font-bold text-danger">Brakujące zdjęcia główne ({missingMainPhotos.length})</p>
                                        <p className="text-[10px] text-danger/80">{missingMainPhotos.map(p => p.label).join(', ')}</p>
                                    </div>
                                </div>
                            )}

                            {missingPaint.length > 0 && (
                                <div className="flex items-start gap-3 p-3 bg-warning-light rounded-2xl border border-warning/10">
                                    <Paintbrush size={18} className="text-warning mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-sm font-bold text-warning">Niekompletny pomiar lakieru</p>
                                        <p className="text-[10px] text-warning/80">Brak pomiarów dla {missingPaint.length} elementów.</p>
                                    </div>
                                </div>
                            )}

                            {(exteriorDamageErrors.length > 0 || interiorDamageErrors.length > 0) && (
                                <div className="flex items-start gap-3 p-3 bg-danger-light rounded-2xl border border-danger/10">
                                    <AlertCircle size={18} className="text-danger mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-sm font-bold text-danger">Zdjęcia uszkodzeń</p>
                                        <p className="text-[10px] text-danger/80">
                                            Każde uszkodzenie musi posiadać minimum 2 zdjęcia.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-6 bg-surface-raised/30 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3.5 px-4 bg-surface border-2 border-border text-foreground font-bold rounded-2xl text-sm transition-transform active:scale-95"
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
