"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { TireSpecLock } from "../TireSpecLock";
import { SmartDropdown } from "../SmartDropdown";
import { Copy, CircleDot, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const TIRE_BRANDS = [
    "Bridgestone", "Continental", "Dunlop", "Falken",
    "Firestone", "Goodyear", "Hankook", "Kleber",
    "Kumho", "Michelin", "Nexen", "Nokian", "Pirelli",
    "Uniroyal", "Vredestein", "Yokohama", "Inne"
];

const WHEELS: { key: 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight'; label: string; position: string }[] = [
    { key: "frontLeft", label: "Przednie Lewe", position: "PL" },
    { key: "frontRight", label: "Przednie Prawe", position: "PP" },
    { key: "rearLeft", label: "Tylne Lewe", position: "TL" },
    { key: "rearRight", label: "Tylne Prawe", position: "TP" },
];

const TIRE_TYPES = [
    { val: 'summer', label: 'Letnie', icon: '☀️' },
    { val: 'winter', label: 'Zimowe', icon: '❄️' },
    { val: 'all-season', label: 'Wielosezonowe', icon: '🔄' },
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
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3 px-2">
                    <CircleDot size={20} className="text-primary" />
                    <h3 className="text-base font-black text-foreground uppercase tracking-tight">
                        Stan Ogumienia
                    </h3>
                </div>
            </div>

            {/* Copy Buttons */}
            <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                    <button
                        onClick={() => copyTiresToAxle('frontLeft', 'front')}
                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary-light text-primary rounded-2xl font-black text-[10px] uppercase shadow-sm border border-primary/20 active:scale-95 transition-all"
                    >
                        <Copy size={14} />
                        <span>Oś Przednia</span>
                    </button>
                    <button
                        onClick={() => copyTiresToAxle('rearLeft', 'rear')}
                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary-light text-primary rounded-2xl font-black text-[10px] uppercase shadow-sm border border-primary/20 active:scale-95 transition-all"
                    >
                        <Copy size={14} />
                        <span>Oś Tylna</span>
                    </button>
                </div>
                <button
                    onClick={() => copyTiresToAxle('frontLeft', 'all')}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-primary text-white rounded-2xl font-black text-[11px] uppercase shadow-lg shadow-primary/20 active:scale-[0.98] transition-all"
                >
                    <Copy size={16} />
                    <span>Kopiuj na wszystkie 4 koła</span>
                </button>
            </div>

            <div className="bg-warning-light p-4 rounded-2xl flex items-start gap-3 border border-warning/10 -mt-2">
                <Info size={16} className="text-warning flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-warning font-bold leading-tight">
                    Kopiowanie przenosi Markę, Rozmiar (Format Lock) oraz DOT. Głębokość bieżnika i zdjęcia są unikalne dla koła.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-6">
                {WHEELS.map((wheel) => {
                    const w = tires[wheel.key];
                    return (
                        <div key={wheel.key} className="bg-surface rounded-3xl border border-border p-6 shadow-lg">
                            <div className="flex items-center gap-3 mb-6">
                                <span className="w-10 h-10 bg-primary text-white rounded-2xl flex items-center justify-center text-sm font-black shadow-lg">
                                    {wheel.position}
                                </span>
                                <div>
                                    <h4 className="font-black text-sm text-foreground uppercase tracking-tight">{wheel.label}</h4>
                                    <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Weryfikacja parametrów</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <SmartDropdown
                                        label="Marka Opony"
                                        value={w.brand}
                                        options={TIRE_BRANDS}
                                        onChange={(val) => handleTireChange(wheel.key, 'brand', val)}
                                        placeholder="Wybierz lub wpisz markę"
                                    />
                                </div>

                                <div className="col-span-2">
                                    <label className="text-[10px] font-black text-muted uppercase tracking-widest mb-1.5 block px-1">
                                        Model
                                    </label>
                                    <input
                                        type="text"
                                        value={w.model || ''}
                                        onChange={(e) => handleTireChange(wheel.key, 'model', e.target.value)}
                                        placeholder="np. Pilot Sport 4"
                                        className="w-full py-3 px-4 rounded-xl border-2 border-border bg-background text-foreground text-sm font-bold placeholder:text-muted/30 focus:border-primary transition-all shadow-sm"
                                    />
                                </div>

                                <div className="col-span-1">
                                    <label className="text-[10px] font-black text-muted uppercase tracking-widest mb-1.5 block px-1">
                                        DOT (Rok/Tydzień)
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={4}
                                        value={w.dot}
                                        onChange={(e) => handleTireChange(wheel.key, 'dot', e.target.value)}
                                        placeholder="2520"
                                        className="w-full py-3 px-4 rounded-xl border-2 border-border bg-background text-foreground text-sm font-bold placeholder:text-muted/30 focus:border-primary transition-all shadow-sm"
                                    />
                                </div>

                                <TireSpecLock
                                    label="Rozmiar (Format Lock)"
                                    value={w.size}
                                    onChange={(val) => handleTireChange(wheel.key, 'size', val)}
                                />

                            </div>

                            {/* Tire Type */}
                            <div className="mt-6">
                                <label className="text-[10px] font-black text-muted uppercase tracking-widest mb-3 block px-1">
                                    Rodzaj Ogumienia (Sezon)
                                </label>
                                <div className="flex gap-2">
                                    {TIRE_TYPES.map((t) => (
                                        <button
                                            key={t.val}
                                            onClick={() => handleTireChange(wheel.key, 'type', t.val)}
                                            className={cn(
                                                "flex-1 py-4 rounded-2xl font-black text-[10px] uppercase transition-all shadow-sm border",
                                                w.type === t.val
                                                    ? "bg-primary border-primary text-white shadow-primary/20 scale-[1.02]"
                                                    : "bg-surface-raised border-border text-muted hover:border-primary/20"
                                            )}
                                        >
                                            <span className="block text-base mb-1">{t.icon}</span>
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Tread Depth */}
                            <div className="mt-6 pt-6 border-t border-border">
                                <label className="text-[10px] font-black text-muted uppercase tracking-widest mb-1.5 block px-1">
                                    Głębokość bieżnika (mm)
                                </label>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={w.treadDepth ?? ''}
                                    onChange={(e) => handleTireChange(wheel.key, 'treadDepth', e.target.value)}
                                    placeholder="np. 5,4"
                                    className="w-full py-3 px-4 rounded-xl border-2 border-border bg-background text-foreground text-sm font-bold placeholder:text-muted/30 focus:border-primary transition-all shadow-sm"
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
