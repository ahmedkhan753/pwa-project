"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { TireSpecLock } from "../TireSpecLock";
import { Copy, CircleDot, Info } from "lucide-react";
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
                    <CircleDot size={20} className="text-blue-500" />
                    <h3 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-tight">
                        Stan Ogumienia
                    </h3>
                </div>
            </div>

            {/* Copy Buttons */}
            <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                    <button
                        onClick={() => copyTiresToAxle('frontLeft', 'front')}
                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-2xl font-black text-[10px] uppercase shadow-sm border border-blue-100 dark:border-blue-800/50 active:scale-95 transition-all"
                    >
                        <Copy size={14} />
                        <span>Oś Przednia</span>
                    </button>
                    <button
                        onClick={() => copyTiresToAxle('rearLeft', 'rear')}
                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-2xl font-black text-[10px] uppercase shadow-sm border border-indigo-100 dark:border-indigo-800/50 active:scale-95 transition-all"
                    >
                        <Copy size={14} />
                        <span>Oś Tylna</span>
                    </button>
                </div>
                <button
                    onClick={() => copyTiresToAxle('frontLeft', 'all')}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-slate-900 dark:bg-blue-600 text-white rounded-2xl font-black text-[11px] uppercase shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all"
                >
                    <Copy size={16} />
                    <span>Kopiuj na wszystkie 4 koła</span>
                </button>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-2xl flex items-start gap-3 border border-amber-100 dark:border-amber-800/50 -mt-2">
                <Info size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-800 dark:text-amber-200 font-bold leading-tight">
                    Kopiowanie przenosi Markę, Rozmiar (Format Lock) oraz DOT. Głębokość bieżnika i zdjęcia są unikalne dla koła.
                </p>
            </div>

            {/* Wheel Cards */}
            <div className="grid grid-cols-1 gap-6">
                {WHEELS.map((wheel) => {
                    const w = tires[wheel.key];
                    return (
                        <div key={wheel.key} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-lg">
                            <div className="flex items-center gap-3 mb-6">
                                <span className="w-10 h-10 bg-slate-900 dark:bg-blue-600 text-white rounded-2xl flex items-center justify-center text-sm font-black shadow-lg">
                                    {wheel.position}
                                </span>
                                <div>
                                    <h4 className="font-black text-sm text-slate-900 dark:text-white uppercase tracking-tight">{wheel.label}</h4>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Weryfikacja parametrów</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-1">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block px-1">
                                        Marka Opony
                                    </label>
                                    <input
                                        type="text"
                                        value={w.brand}
                                        onChange={(e) => handleTireChange(wheel.key, 'brand', e.target.value)}
                                        placeholder="np. Michelin"
                                        className="w-full py-3 px-4 rounded-xl border-2 border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm font-bold placeholder:text-slate-300 focus:border-blue-500 transition-all"
                                    />
                                </div>
                                
                                <div className="col-span-1">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block px-1">
                                        DOT (Rok/Tydzień)
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={4}
                                        value={w.dot}
                                        onChange={(e) => handleTireChange(wheel.key, 'dot', e.target.value)}
                                        placeholder="2520"
                                        className="w-full py-3 px-4 rounded-xl border-2 border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm font-bold placeholder:text-slate-300 focus:border-blue-500 transition-all"
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
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 block px-1">
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
                                                    ? "bg-blue-600 border-blue-600 text-white shadow-blue-500/20 scale-[1.02]"
                                                    : "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:border-blue-200"
                                            )}
                                        >
                                            <span className="block text-base mb-1">{t.icon}</span>
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Deferred Tread Depth */}
                            <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                                <div className="bg-slate-50 dark:bg-slate-800/30 rounded-2xl p-4 border border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-between opacity-60">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                                            <Info size={14} className="text-slate-400" />
                                        </div>
                                        <span className="text-xs font-black text-slate-400 uppercase tracking-tight">Głębokość bieżnika</span>
                                    </div>
                                    <span className="text-[8px] font-black bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded-md text-slate-500 uppercase">Coming in Phase 2</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
