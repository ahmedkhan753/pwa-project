"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { InspectionToggle } from "../InspectionToggle";
import { ClipboardCheck } from "lucide-react";
import type { ToggleValue } from "@/store/useInspectionStore";

const TAK_NIE: { label: string; value: string; colorClass: string; activeColor: string }[] = [
    { label: 'TAK', value: 'TAK', colorClass: 'bg-emerald-500', activeColor: 'text-white' },
    { label: 'NIE', value: 'NIE', colorClass: 'bg-rose-500', activeColor: 'text-white' },
];

const TAK_NIE_ELEKTR = [
    ...TAK_NIE,
    { label: 'ELEKTR.', value: 'ELEKTRONICZNA', colorClass: 'bg-blue-500', activeColor: 'text-white' },
];

// Items shown BEFORE the keysCount number input (items 1-4)
const ITEMS_BEFORE_KEYS: { key: string; label: string; options?: typeof TAK_NIE }[] = [
    { key: "registrationDocPresented", label: "Dowód rejestracyjny" },
    { key: "vehicleCardPresented",     label: "Karta pojazdu" },
    { key: "registrationPlates",       label: "Tablice rejestracyjne" },
    { key: "keys",                     label: "Kluczyki" },
];

// Items shown AFTER the keysCount number input (items 6-20)
const ITEMS_AFTER_KEYS: { key: string; label: string; options?: typeof TAK_NIE_ELEKTR }[] = [
    { key: "spareWheel",                      label: "Dodatkowy komplet kół" },
    { key: "fireExtinguisher",               label: "Gaśnica" },
    { key: "airConditioningWorking",         label: "Klimatyzacja sprawna" },
    { key: "wheelWrench",                    label: "Klucz do kół" },
    { key: "serviceBookPresented",           label: "Książka serwisowa", options: TAK_NIE_ELEKTR },
    { key: "navigationCardWorking",          label: "Nawigacja satelitarna (karta) sprawna" },
    { key: "jackAndTools",                   label: "Podnośnik" },
    { key: "tractionBatteryChargingCable",   label: "Przewód ładowania baterii trakcyjnej" },
    { key: "tractionBatteryChargingStation", label: "Stacja ładowania baterii trakcyjnej" },
    { key: "triangular",                     label: "Trójkąt ostrzegawczy" },
    { key: "tractionBatteryChargeIndicator", label: "Wskaźnik naładowania baterii trakcyjnej" },
    { key: "repairKit",                      label: "Zestaw naprawczy koła" },
    { key: "chargingCables",                 label: "Kable do ładowania" },
    { key: "vinMatchesDocs",                 label: "VIN zgodny z dokumentami" },
    { key: "ownerManual",                    label: "Instrukcja obsługi" },
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

                {/* Items 1–4 */}
                {ITEMS_BEFORE_KEYS.map((item) => (
                    <InspectionToggle
                        key={item.key}
                        label={item.label}
                        value={(eq[item.key as keyof typeof eq] || null) as ToggleValue}
                        onChange={(val) => updateField('equipmentCompleteness', item.key, val)}
                        options={item.options || TAK_NIE}
                    />
                ))}

                {/* Item 5 — Kluczyki (ilość) */}
                <div className="bg-surface rounded-3xl border border-border p-6 shadow-sm mb-6">
                    <h4 className="text-xs font-black text-muted uppercase tracking-widest mb-4">Kluczyki (ilość)</h4>
                    <input
                        type="number"
                        value={eq.keysCount}
                        min={1}
                        onChange={(e) => {
                            let val = e.target.value.replace('-', '');
                            if (/^0+$/.test(val)) val = '';
                            updateField('equipmentCompleteness', 'keysCount', val);
                        }}
                        placeholder="np. 2"
                        aria-label="Keys count"
                        className="w-24 py-2.5 px-4 rounded-xl border-2 border-border bg-surface text-foreground text-lg font-bold text-center"
                    />
                </div>

                {/* Items 6–20 */}
                {ITEMS_AFTER_KEYS.map((item) => (
                    <InspectionToggle
                        key={item.key}
                        label={item.label}
                        value={(eq[item.key as keyof typeof eq] || null) as ToggleValue}
                        onChange={(val) => updateField('equipmentCompleteness', item.key, val)}
                        options={item.options || TAK_NIE}
                    />
                ))}

                {/* Item 21 — Dodatkowe wyposażenie (text) */}
                <div className="bg-surface rounded-3xl border border-border p-6 shadow-sm">
                    <h4 className="text-xs font-black text-muted uppercase tracking-widest mb-4">Dodatkowe wyposażenie</h4>
                    <textarea
                        value={eq.additionalEquipment}
                        onChange={(e) => updateField('equipmentCompleteness', 'additionalEquipment', e.target.value)}
                        placeholder="Wpisz dodatkowe wyposażenie..."
                        rows={3}
                        className="w-full py-3 px-4 rounded-xl border-2 border-border bg-surface text-foreground text-sm font-medium resize-none focus:border-primary outline-none transition-colors"
                    />
                </div>
            </div>
        </div>
    );
}
