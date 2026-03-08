"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { InspectionToggle } from "../InspectionToggle";
import { ClipboardCheck } from "lucide-react";
import type { ToggleValue } from "@/store/useInspectionStore";

const CHECKLIST_ITEMS: { key: string; label: string }[] = [
    { key: "registrationDocPresented", label: "Przedstawiono dowód rejestracyjny / zdj. w zał." },
    { key: "vehicleCardPresented", label: "Przedstawiono kartę pojazdu" },
    { key: "purchaseInvoicePresented", label: "Przedstawiono FV zakupową" },
    { key: "serviceBookPresented", label: "Przedstawiono książkę serwisową" },
    { key: "antiTheftSystem", label: "Zabezpieczenie antykradzieżowe" },
    { key: "immobilizerWorking", label: "Immobilizer sprawny" },
    { key: "spareTire", label: "Koło zapasowe" },
    { key: "jackAndTools", label: "Podnośnik i narzędzia" },
    { key: "warningTriangle", label: "Trójkąt ostrzegawczy" },
    { key: "firstAidKit", label: "Apteczka" },
    { key: "fireExtinguisher", label: "Gaśnica" },
    { key: "ownerManual", label: "Instrukcja obsługi" },
];

export function EquipmentStep() {
    const { data, updateField } = useInspectionStore();
    const eq = data.equipmentCompleteness;

    return (
        <div className="space-y-4 animate-fade-in">
            <div className="section-card">
                <div className="flex items-center gap-2 mb-4">
                    <ClipboardCheck size={18} className="text-primary" />
                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                        Kompletność Wyposażenia
                    </h3>
                </div>

                {CHECKLIST_ITEMS.map((item) => (
                    <InspectionToggle
                        key={item.key}
                        label={item.label}
                        value={eq[item.key as keyof typeof eq] as ToggleValue}
                        onChange={(val) => updateField('equipmentCompleteness', item.key, val)}
                    />
                ))}

                {/* Keys Count */}
                <div className="mt-4 pt-4 border-t border-border">
                    <label className="text-xs font-bold text-secondary uppercase tracking-wider mb-1 block">
                        Ilość kluczyków
                    </label>
                    <input
                        type="number"
                        value={eq.keysCount}
                        onChange={(e) => updateField('equipmentCompleteness', 'keysCount', e.target.value)}
                        placeholder="np. 2"
                        aria-label="Keys count"
                        className="w-24 py-2.5 px-4 rounded-xl border-2 border-border bg-surface text-foreground text-lg font-bold text-center"
                    />
                </div>
            </div>
        </div>
    );
}
