"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { SignaturePad } from "../SignaturePad";
import { CheckCircle2, AlertCircle, Trash2, Send, Car } from "lucide-react";
import { cn } from "@/lib/utils";

export function SummaryStep() {
    const { data, updateField, setSignature, reset } = useInspectionStore();
    const summary = data.finalSummary;
    const v = data.vehicleData;

    const hasSignatures = !!(summary.signatureAppraiser && summary.signatureClient);

    const handleSubmit = () => {
        // Build JSON payload for Bitrix24
        const payload = {
            ...data,
            submittedAt: new Date().toISOString(),
        };
        console.log('Submission payload:', payload);
        updateField('finalSummary', 'submittedAt', new Date().toISOString());
        updateField('finalSummary', 'submissionStatus', 'submitted');
        alert('Inspekcja wysłana pomyślnie!');
    };

    const handleReset = () => {
        if (confirm('Czy na pewno chcesz usunąć wszystkie dane? Ta operacja jest nieodwracalna.')) {
            reset();
        }
    };

    return (
        <div className="space-y-4 animate-fade-in">
            {/* VIN Confirmation */}
            <div className="section-card border-l-4 border-l-primary">
                <div className="flex items-center gap-2 mb-3">
                    <Car size={18} className="text-primary" />
                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                        Potwierdzenie VIN
                    </h3>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 mb-3">
                    <p className="text-xs text-secondary mb-1">Numer VIN</p>
                    <p className="text-xl font-mono font-bold tracking-widest text-foreground">
                        {v.vin || '—'}
                    </p>
                    <p className="text-xs text-secondary mt-2">
                        {v.make} {v.model} • {v.year} • {v.registrationPlates}
                    </p>
                </div>

                <label className="flex items-center gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={summary.vinConfirmed}
                        onChange={(e) => updateField('finalSummary', 'vinConfirmed', e.target.checked)}
                        className="w-5 h-5 rounded accent-primary"
                        aria-label="Confirm VIN"
                    />
                    <span className="text-sm font-medium text-foreground">
                        Potwierdzam poprawność numeru VIN
                    </span>
                </label>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-2">
                <StatCard
                    label="Zdjęcia"
                    value={`${data.photos.filter(p => p.base64).length}/${data.photos.length}`}
                    ok={data.photos.filter(p => p.required && p.base64).length === data.photos.filter(p => p.required).length}
                />
                <StatCard
                    label="Uszk. zewn."
                    value={`${data.exteriorDamage.length}`}
                    ok={true}
                />
                <StatCard
                    label="Uszk. wewn."
                    value={`${data.interiorDamage.length}`}
                    ok={true}
                />
            </div>

            {/* Signatures */}
            <SignaturePad
                label="📝 Podpis — Rzeczoznawca"
                value={summary.signatureAppraiser}
                onSave={(b64) => setSignature('signatureAppraiser', b64)}
            />
            <SignaturePad
                label="📝 Podpis — Klient"
                value={summary.signatureClient}
                onSave={(b64) => setSignature('signatureClient', b64)}
            />
            <SignaturePad
                label="📝 Podpis — Przedstawiciel placu"
                value={summary.signatureYard}
                onSave={(b64) => setSignature('signatureYard', b64)}
            />

            {/* Submit */}
            <button
                onClick={handleSubmit}
                disabled={!summary.vinConfirmed || !hasSignatures}
                className={cn(
                    "w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98]",
                    summary.vinConfirmed && hasSignatures
                        ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg hover:shadow-xl"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                )}
                aria-label="Submit inspection"
            >
                <Send size={20} />
                WYŚLIJ INSPEKCJĘ
            </button>

            {!summary.vinConfirmed && (
                <p className="flex items-center gap-1 text-xs text-amber-500 justify-center">
                    <AlertCircle size={14} />
                    Potwierdź VIN i złóż podpisy aby wysłać
                </p>
            )}

            {summary.submissionStatus === 'submitted' && (
                <div className="flex items-center gap-2 justify-center text-success animate-fade-in">
                    <CheckCircle2 size={18} />
                    <span className="text-sm font-bold">Wysłano: {summary.submittedAt}</span>
                </div>
            )}

            {/* Clear All */}
            <div className="pt-6 border-t border-border">
                <button
                    onClick={handleReset}
                    className="w-full py-3 text-danger font-bold border-2 border-danger-light rounded-xl flex items-center justify-center gap-2 hover:bg-danger-light transition-colors active:scale-[0.98]"
                    aria-label="Clear all inspection data"
                >
                    <Trash2 size={16} />
                    Wyczyść wszystkie dane
                </button>
            </div>
        </div>
    );
}

function StatCard({ label, value, ok }: { label: string; value: string; ok: boolean }) {
    return (
        <div className="section-card text-center py-3">
            <p className="text-xs text-secondary font-medium mb-1">{label}</p>
            <p className={cn("text-lg font-bold", ok ? "text-foreground" : "text-amber-500")}>
                {value}
            </p>
        </div>
    );
}
