"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { InspectionToggle } from "../InspectionToggle";
import { Wrench, CarFront } from "lucide-react";
import type { ToggleValue } from "@/store/useInspectionStore";

const MECH_GROUPS = [
    {
        title: "🔧 Silnik",
        items: [
            { key: "engineCondition", label: "Stan silnika — ogólny" },
            { key: "engineOilLevel", label: "Poziom oleju silnikowego" },
            { key: "coolantLevel", label: "Poziom płynu chłodniczego" },
            { key: "engineNoises", label: "Nietypowe odgłosy silnika" },
            { key: "engineSmoke", label: "Dymienie z wydechu" },
        ],
    },
    {
        title: "⚙️ Układ napędowy",
        items: [
            { key: "transmission", label: "Skrzynia biegów" },
            { key: "clutch", label: "Sprzęgło" },
            { key: "driveShaft", label: "Wał napędowy / półosie" },
        ],
    },
    {
        title: "🔩 Zawieszenie i hamulce",
        items: [
            { key: "frontSuspension", label: "Zawieszenie przednie" },
            { key: "rearSuspension", label: "Zawieszenie tylne" },
            { key: "shockAbsorbers", label: "Amortyzatory" },
            { key: "frontBrakes", label: "Hamulce przednie" },
            { key: "rearBrakes", label: "Hamulce tylne" },
            { key: "handbrake", label: "Hamulec ręczny / postojowy" },
        ],
    },
    {
        title: "🎯 Układ kierowniczy",
        items: [
            { key: "steeringPlay", label: "Luzy w układzie kierowniczym" },
            { key: "steeringPump", label: "Pompa / wspomaganie" },
        ],
    },
    {
        title: "💡 Elektryka i inne",
        items: [
            { key: "exhaustSystem", label: "Układ wydechowy" },
            { key: "airConditioning", label: "Klimatyzacja" },
            { key: "heatingSystem", label: "Ogrzewanie" },
            { key: "electricalSystem", label: "Instalacja elektryczna" },
            { key: "batteryCondition", label: "Akumulator" },
            { key: "lightsAll", label: "Oświetlenie — wszystkie" },
            { key: "wipers", label: "Wycieraczki" },
            { key: "horn", label: "Klakson" },
        ],
    },
];

const MECH_OPTIONS = [
    { label: 'OK', value: 'TAK', colorClass: 'bg-emerald-500', activeColor: 'text-white' },
    { label: 'NOK', value: 'NIE', colorClass: 'bg-rose-500', activeColor: 'text-white' },
    { label: 'ND', value: 'ND', colorClass: 'bg-slate-500', activeColor: 'text-white' },
];

const VIN_OPTIONS: Array<{ val: '' | 'NIE BADANO' | 'OK' | 'NIEZGODNE'; label: string; color: string }> = [
    { val: 'NIE BADANO', label: 'Nie badano', color: 'bg-surface-raised text-muted' },
    { val: 'OK', label: 'OK', color: 'bg-success text-white' },
    { val: 'NIEZGODNE', label: 'Niezgodne', color: 'bg-danger text-white' },
];

export function MechanicalStep() {
    const { data, updateField } = useInspectionStore();
    const mech = data.mechanical;

    return (
        <div className="space-y-4 animate-fade-in">
            <div className="flex items-center gap-2 mb-2">
                <Wrench size={18} className="text-primary" />
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                    Kontrola Mechaniczna
                </h3>
            </div>

            {MECH_GROUPS.map((group) => (
                <div key={group.title} className="bg-surface rounded-3xl border border-border p-6 shadow-sm mb-4">
                    <h4 className="text-sm font-black text-foreground mb-6 uppercase tracking-tight">{group.title}</h4>
                    <div className="space-y-2">
                        {group.items.map((item) => (
                            <InspectionToggle
                                key={item.key}
                                label={item.label}
                                value={mech[item.key as keyof typeof mech] as ToggleValue}
                                onChange={(val) => updateField('mechanical', item.key, val)}
                                options={MECH_OPTIONS}
                                compact
                            />
                        ))}
                    </div>
                </div>
            ))}

            {/* Test Drive Section */}
            <div className="section-card border-l-4 border-l-accent">
                <div className="flex items-center gap-2 mb-3">
                    <CarFront size={18} className="text-accent" />
                    <h4 className="text-sm font-bold text-foreground">Jazda próbna</h4>
                </div>

                <InspectionToggle
                    label="Jazda próbna przeprowadzona"
                    value={mech.testDriveConducted}
                    onChange={(val) => updateField('mechanical', 'testDriveConducted', val)}
                    options={[
                        { label: 'TAK', value: 'TAK', colorClass: 'bg-emerald-500', activeColor: 'text-white' },
                        { label: 'NIE', value: 'NIE', colorClass: 'bg-rose-500', activeColor: 'text-white' },
                    ]}
                />
                <InspectionToggle
                    label="Jazda próbna niemożliwa"
                    value={mech.testDriveImpossible}
                    onChange={(val) => updateField('mechanical', 'testDriveImpossible', val)}
                    options={[
                        { label: 'TAK', value: 'TAK', colorClass: 'bg-emerald-500', activeColor: 'text-white' },
                        { label: 'NIE', value: 'NIE', colorClass: 'bg-rose-500', activeColor: 'text-white' },
                    ]}
                />

                <div className="mt-3">
                    <label className="text-xs font-bold text-secondary uppercase tracking-wider mb-1 block">
                        Komentarz do jazdy próbnej
                    </label>
                    <textarea
                        value={mech.testDriveComment}
                        onChange={(e) => updateField('mechanical', 'testDriveComment', e.target.value)}
                        placeholder="Uwagi z jazdy próbnej..."
                        aria-label="Test drive comments"
                        rows={3}
                        className="w-full py-3 px-4 rounded-xl border-2 border-border bg-surface text-foreground text-sm resize-none"
                    />
                </div>
            </div>
        </div>
    );
}
