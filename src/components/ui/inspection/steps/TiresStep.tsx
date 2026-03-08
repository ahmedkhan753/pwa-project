"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { TireMaskInput } from "../TireMaskInput";
import { Copy, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";

const WHEELS: { key: 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight'; label: string; position: string }[] = [
    { key: "frontLeft", label: "Przednie Lewe", position: "PL" },
    { key: "frontRight", label: "Przednie Prawe", position: "PP" },
    { key: "rearLeft", label: "Tylne Lewe", position: "TL" },
    { key: "rearRight", label: "Tylne Prawe", position: "TP" },
];

const TIRE_TYPES = [
    { val: 'summer', label: 'Letnie', icon: '☀️' },
    { val: 'winter', label: 'Zimowe', icon: '❄️' },
    { val: 'all-season', label: 'Całoroczne', icon: '🔄' },
];

export function TiresStep() {
    const { data, updateField, copyTiresToAxle } = useInspectionStore();
    const tires = data.tires;

    const handleTireChange = (wheel: string, field: string, value: string) => {
        const wheelData = tires[wheel as keyof typeof tires];
        if (typeof wheelData === 'object' && wheelData !== null && 'brand' in wheelData) {
            updateField('tires', wheel, { ...wheelData, [field]: value });
        }
    };

    return (
        <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <CircleDot size={18} className="text-primary" />
                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                        Opony
                    </h3>
                </div>
            </div>

            {/* Copy Buttons */}
            <div className="flex gap-2 mb-4">
                <button
                    onClick={() => copyTiresToAxle('frontLeft', 'front')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-primary-light text-primary rounded-xl font-bold text-xs active:scale-95 transition-transform"
                    aria-label="Copy front left to front axle"
                >
                    <Copy size={14} />
                    Kopiuj na oś przednią
                </button>
                <button
                    onClick={() => copyTiresToAxle('rearLeft', 'rear')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-primary-light text-primary rounded-xl font-bold text-xs active:scale-95 transition-transform"
                    aria-label="Copy rear left to rear axle"
                >
                    <Copy size={14} />
                    Kopiuj na oś tylną
                </button>
            </div>

            <p className="text-[10px] text-muted text-center -mt-2 mb-4">
                ⚠️ Kopiuje markę, rozmiar i DOT — NIE kopiuje głębokości bieżnika
            </p>

            {/* Wheel Cards */}
            <div className="grid grid-cols-1 gap-4">
                {WHEELS.map((wheel) => {
                    const w = tires[wheel.key];
                    return (
                        <div key={wheel.key} className="section-card">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold">
                                    {wheel.position}
                                </span>
                                <h4 className="font-bold text-sm text-foreground">{wheel.label}</h4>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-secondary uppercase tracking-wider mb-1 block">
                                        Marka
                                    </label>
                                    <input
                                        type="text"
                                        value={w.brand}
                                        onChange={(e) => handleTireChange(wheel.key, 'brand', e.target.value)}
                                        placeholder="np. Michelin"
                                        aria-label={`${wheel.label} brand`}
                                        className="w-full py-2.5 px-3 rounded-xl border-2 border-border bg-surface text-foreground text-sm font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-secondary uppercase tracking-wider mb-1 block">
                                        Rozmiar
                                    </label>
                                    <input
                                        type="text"
                                        value={w.size}
                                        onChange={(e) => handleTireChange(wheel.key, 'size', e.target.value)}
                                        placeholder="225/45 R17"
                                        aria-label={`${wheel.label} size`}
                                        className="w-full py-2.5 px-3 rounded-xl border-2 border-border bg-surface text-foreground text-sm font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-secondary uppercase tracking-wider mb-1 block">
                                        DOT
                                    </label>
                                    <input
                                        type="text"
                                        value={w.dot}
                                        onChange={(e) => handleTireChange(wheel.key, 'dot', e.target.value)}
                                        placeholder="2520"
                                        aria-label={`${wheel.label} DOT`}
                                        className="w-full py-2.5 px-3 rounded-xl border-2 border-border bg-surface text-foreground text-sm font-medium"
                                    />
                                </div>
                                <TireMaskInput
                                    label="Głębokość bieżnika"
                                    value={w.treadDepth}
                                    onChange={(val) => handleTireChange(wheel.key, 'treadDepth', val)}
                                />
                            </div>

                            {/* Tire Type */}
                            <div className="mt-3">
                                <label className="text-xs font-bold text-secondary uppercase tracking-wider mb-2 block">
                                    Sezon
                                </label>
                                <div className="flex gap-2">
                                    {TIRE_TYPES.map((t) => (
                                        <button
                                            key={t.val}
                                            onClick={() => handleTireChange(wheel.key, 'type', t.val)}
                                            className={cn(
                                                "flex-1 py-2 rounded-lg font-bold text-xs transition-all",
                                                w.type === t.val
                                                    ? "bg-primary text-white shadow-md"
                                                    : "bg-gray-100 text-gray-500 dark:bg-gray-800"
                                            )}
                                        >
                                            {t.icon} {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
