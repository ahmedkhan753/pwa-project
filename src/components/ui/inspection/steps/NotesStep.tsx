"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { InspectionToggle } from "../InspectionToggle";
import { FileText, Search } from "lucide-react";
import type { ToggleValue } from "@/store/useInspectionStore";
import { cn } from "@/lib/utils";

const UWAGI_ITEMS: { key: string; label: string }[] = [
    { key: "registrationDocPresented", label: "Podczas oględzin przedstawiono dowód rej. zdj w zał." },
    { key: "vehicleCardPresented", label: "Podczas oględzin przedstawiono kartę pojazdu" },
    { key: "purchaseInvoicePresented", label: "Podczas oględzin przedstawiono FV zakupową" },
    { key: "serviceBookPresented", label: "Podczas oględzin przedstawiono książkę serwisową" },
    { key: "antiTheftSecurityPresented", label: "Zabezpieczenie antykradzieżowe" },
    { key: "immobilizerWorking", label: "Immobilizer sprawny" },
    { key: "testDrivePossible", label: "Jazda próbna przeprowadzona na odcinku" },
    { key: "testDriveImpossibleReason", label: "Jazda próbna niemożliwa (brak dokumentów)" },
];

const VIN_OPTIONS: Array<{ val: '' | 'NIE BADANO' | 'OK' | 'NIEZGODNE'; label: string; color: string }> = [
    { val: 'NIE BADANO', label: 'Nie badano', color: 'bg-gray-100 text-gray-600' },
    { val: 'OK', label: 'OK', color: 'bg-green-500 text-white' },
    { val: 'NIEZGODNE', label: 'Niezgodne', color: 'bg-red-500 text-white' },
];

export function NotesStep() {
    const { data, updateField } = useInspectionStore();
    const notes = data.notesValuation;

    return (
        <div className="space-y-4 animate-fade-in">
            {/* UWAGI WYCENA */}
            <div className="section-card">
                <div className="flex items-center gap-2 mb-4">
                    <FileText size={18} className="text-primary" />
                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                        Uwagi Wycena
                    </h3>
                </div>

                {UWAGI_ITEMS.map((item) => (
                    <InspectionToggle
                        key={item.key}
                        label={item.label}
                        value={notes[item.key as keyof typeof notes] as ToggleValue}
                        onChange={(val) => updateField('notesValuation', item.key, val)}
                    />
                ))}

                {/* Test drive impossible comment */}
                {notes.testDriveImpossibleReason === 'TAK' && (
                    <div className="ml-4 mb-4 animate-fade-in">
                        <label className="text-xs font-bold text-secondary uppercase tracking-wider mb-1 block">
                            Komentarz — jazda niemożliwa
                        </label>
                        <input
                            type="text"
                            value={notes.testDriveImpossibleText}
                            onChange={(e) => updateField('notesValuation', 'testDriveImpossibleText', e.target.value)}
                            placeholder="Jeśli nie to komentarz obowiązkowy"
                            aria-label="Test drive impossible comment"
                            className="w-full py-2.5 px-3 rounded-xl border-2 border-border bg-surface text-foreground text-sm"
                        />
                    </div>
                )}
            </div>

            {/* VIN Verification */}
            <div className="section-card border-l-4 border-l-accent">
                <div className="flex items-center gap-2 mb-3">
                    <Search size={18} className="text-accent" />
                    <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">
                        Badanie poprawności numerów identyfikacyjnych
                    </h4>
                </div>

                <div className="flex gap-2">
                    {VIN_OPTIONS.map((opt) => (
                        <button
                            key={opt.val}
                            onClick={() => updateField('notesValuation', 'vinVerification', opt.val)}
                            className={cn(
                                "flex-1 py-2.5 rounded-lg font-bold text-xs transition-all active:scale-95",
                                notes.vinVerification === opt.val
                                    ? `${opt.color} shadow-md`
                                    : "bg-gray-100 text-gray-500 dark:bg-gray-800"
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Professional Summary */}
            <div className="section-card">
                <h4 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">
                    📝 Uwagi ogólne
                </h4>
                <textarea
                    value={notes.generalComments}
                    onChange={(e) => updateField('notesValuation', 'generalComments', e.target.value)}
                    placeholder="Uwagi ogólne dotyczące pojazdu..."
                    aria-label="General comments"
                    rows={4}
                    className="w-full py-3 px-4 rounded-xl border-2 border-border bg-surface text-foreground text-sm resize-none mb-3"
                />

                <h4 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">
                    💰 Notatki wyceny
                </h4>
                <textarea
                    value={notes.valuationNotes}
                    onChange={(e) => updateField('notesValuation', 'valuationNotes', e.target.value)}
                    placeholder="Notatki dotyczące wyceny..."
                    aria-label="Valuation notes"
                    rows={4}
                    className="w-full py-3 px-4 rounded-xl border-2 border-border bg-surface text-foreground text-sm resize-none mb-3"
                />

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs font-bold text-secondary uppercase tracking-wider mb-1 block">
                            Szacunkowa wartość (PLN)
                        </label>
                        <input
                            type="text"
                            value={notes.estimatedValue}
                            onChange={(e) => updateField('notesValuation', 'estimatedValue', e.target.value)}
                            placeholder="np. 45 000"
                            aria-label="Estimated value"
                            className="w-full py-2.5 px-3 rounded-xl border-2 border-border bg-surface text-foreground text-lg font-bold"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-secondary uppercase tracking-wider mb-1 block">
                            Porównanie rynkowe
                        </label>
                        <input
                            type="text"
                            value={notes.marketComparison}
                            onChange={(e) => updateField('notesValuation', 'marketComparison', e.target.value)}
                            placeholder="np. Otomoto avg"
                            aria-label="Market comparison"
                            className="w-full py-2.5 px-3 rounded-xl border-2 border-border bg-surface text-foreground text-sm"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
