"use client";

import { cn } from "@/lib/utils";
import type { PaintMeasurement, PaintZone } from "@/store/useInspectionStore";
import { useState } from "react";
import { X } from "lucide-react";

interface CarSchemaProps {
    paint: PaintMeasurement;
    onZoneUpdate: (zone: string, data: PaintZone) => void;
}

const ZONES: { id: string; label: string; x: number; y: number; w: number; h: number }[] = [
    { id: "hood", label: "Pokrywa przednia", x: 30, y: 6, w: 40, h: 18 },
    { id: "leftFrontFender", label: "Błotnik P.L", x: 10, y: 5, w: 18, h: 18 },
    { id: "leftFrontDoor", label: "Drzwi P.L", x: 10, y: 24, w: 18, h: 22 },
    { id: "leftAColumn", label: "Słupek P.L", x: 28, y: 24, w: 4, h: 6 },
    { id: "leftBColumn", label: "Słupek Śr.L", x: 28, y: 44, w: 4, h: 6 },
    { id: "leftRearDoor", label: "Drzwi T.L", x: 10, y: 47, w: 18, h: 22 },
    { id: "leftRearFender", label: "Błotnik T.L", x: 10, y: 70, w: 18, h: 18 },
    { id: "leftSill", label: "Próg L", x: 5, y: 25, w: 4, h: 45 },
    { id: "trunk", label: "Pokrywa tylna", x: 30, y: 64, w: 40, h: 15 },
    { id: "rightSill", label: "Próg P", x: 91, y: 25, w: 4, h: 45 },
    { id: "rightRearFender", label: "Błotnik T.P", x: 72, y: 70, w: 18, h: 18 },
    { id: "rightRearDoor", label: "Drzwi T.P", x: 72, y: 47, w: 18, h: 22 },
    { id: "rightBColumn", label: "Słupek Śr.P", x: 68, y: 44, w: 4, h: 6 },
    { id: "rightAColumn", label: "Słupek P.P", x: 68, y: 24, w: 4, h: 6 },
    { id: "rightFrontDoor", label: "Drzwi P.P", x: 72, y: 24, w: 18, h: 22 },
    { id: "rightFrontFender", label: "Błotnik P.P", x: 72, y: 5, w: 18, h: 18 },
    { id: "roof", label: "Dach", x: 32, y: 25, w: 36, h: 36 },
];

const PAINT_RANGES = [
    "0-150µm",
    "150-200µm",
    "150-300µm",
    "500-1000µm",
    "500-2000µm"
];

function getZoneColor(zone: PaintZone): string {
    if (!zone.value) return "fill-slate-100 dark:fill-slate-800 stroke-slate-300";
    const val = zone.value;
    if (zone.status === 'putty' || val.includes('500-')) return "fill-rose-500 stroke-rose-600";
    if (zone.status === 'repainted' || val.includes('150-200') || val.includes('150-300')) return "fill-amber-500 stroke-amber-600";
    if (val === '0-150µm') return "fill-emerald-500 stroke-emerald-600";
    return "fill-emerald-500 stroke-emerald-600";
}

export function CarSchema({ paint, onZoneUpdate }: CarSchemaProps) {
    const [activeZone, setActiveZone] = useState<string | null>(null);
    const [modalValue, setModalValue] = useState('');
    const [modalStatus, setModalStatus] = useState<PaintZone['status']>('');

    const openModal = (zoneId: string) => {
        const zone = paint[zoneId];
        setModalValue(zone?.value || '');
        setModalStatus(zone?.status || '');
        setActiveZone(zoneId);
    };

    const saveAndNext = () => {
        if (!activeZone) return;
        
        // Save current
        onZoneUpdate(activeZone, { value: modalValue, status: modalStatus });
        
        // Find next zone in sequence
        const currentIndex = ZONES.findIndex(z => z.id === activeZone);
        if (currentIndex < ZONES.length - 1) {
            const nextZone = ZONES[currentIndex + 1];
            // Open next modal after a small delay for better UX
            const nextZoneData = paint[nextZone.id] || { value: '', status: '' };
            setModalValue(nextZoneData.value || '');
            setModalStatus(nextZoneData.status || '');
            setActiveZone(nextZone.id);
        } else {
            setActiveZone(null);
        }
    };

    const activeLabel = ZONES.find(z => z.id === activeZone)?.label || '';
    const currentIndex = ZONES.findIndex(z => z.id === activeZone);
    const hasNext = currentIndex < ZONES.length - 1;

    return (
        <div className="space-y-4">
            {/* Car Diagram */}
            <div className="relative bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xl transition-all overflow-hidden lg:max-w-xl mx-auto">
                <svg viewBox="0 0 100 90" className="w-full drop-shadow-sm" style={{ maxHeight: '420px' }}>
                    {/* Car silhouette background */}
                    <path
                        d="M30 2 Q30 0 50 0 Q70 0 70 2 L75 5 Q88 8 90 20 L92 70 Q90 85 75 88 L50 90 L25 88 Q10 85 8 70 L10 20 Q12 8 25 5 Z"
                        fill="none" stroke="currentColor" strokeWidth="0.2" className="text-slate-200 dark:text-slate-800"
                    />

                    {/* Clickable zones */}
                    {ZONES.map((zone) => {
                        const zoneData = paint[zone.id] || { value: '', status: '' };
                        const isFilled = !!zoneData.value;

                        return (
                            <g key={zone.id} onClick={() => openModal(zone.id)} className="cursor-pointer group">
                                <rect
                                    x={zone.x} y={zone.y}
                                    width={zone.w} height={zone.h}
                                    rx="2.5" ry="2.5"
                                    className={cn(
                                        "transition-all duration-300 stroke-[0.4]",
                                        getZoneColor(zoneData),
                                        "group-hover:opacity-80 group-active:scale-[0.98]"
                                    )}
                                    opacity={isFilled ? 1 : 0.6}
                                />
                                <text
                                    x={zone.x + zone.w / 2} y={zone.y + (isFilled ? zone.h / 2 - 2 : zone.h / 2)}
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    className={cn(
                                        "font-black pointer-events-none select-none drop-shadow-sm",
                                        isFilled ? "fill-white text-[2.2px]" : "fill-slate-500 dark:fill-slate-400 text-[2px]"
                                    )}
                                >
                                    {zone.label}
                                </text>
                                {isFilled && (
                                    <text
                                        x={zone.x + zone.w / 2} y={zone.y + zone.h / 2 + 3}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        className="fill-white text-[3.2px] font-black pointer-events-none select-none"
                                    >
                                        {zoneData.value.replace('µm', '')}
                                    </text>
                                )}
                            </g>
                        );
                    })}
                </svg>

                {/* Legend */}
                <div className="flex flex-wrap gap-4 mt-6 justify-center items-center">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 rounded-full border border-emerald-100 dark:border-emerald-900/30">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">Fabryczny</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 rounded-full border border-amber-100 dark:border-amber-900/30">
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                        <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400">Lakierowany</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 dark:bg-rose-900/20 rounded-full border border-rose-100 dark:border-rose-900/30">
                        <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                        <span className="text-[11px] font-bold text-rose-700 dark:text-rose-400">Szpachla</span>
                    </div>
                </div>
            </div>

            {/* Quick List */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-tight">Postęp Pomiarów</h4>
                    <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-1 rounded-md font-bold uppercase">
                        {Object.keys(paint).length} / {ZONES.length}
                    </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {ZONES.map((zone) => {
                        const zoneData = paint[zone.id] || { value: '', status: '' };
                        return (
                            <button
                                key={zone.id}
                                onClick={() => openModal(zone.id)}
                                className={cn(
                                    "flex flex-col items-start gap-1 p-3 rounded-2xl border transition-all text-left",
                                    zoneData.value 
                                        ? "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700" 
                                        : "bg-transparent border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600"
                                )}
                            >
                                <span className="text-[10px] font-semibold text-slate-400 uppercase leading-none">{zone.label}</span>
                                <span className={cn(
                                    "text-sm font-black leading-none",
                                    zoneData.value ? "text-slate-900 dark:text-white" : "text-slate-300 dark:text-slate-700"
                                )}>
                                    {zoneData.value || '—'}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Modal Overlay */}
            {activeZone && (
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/40 backdrop-blur-sm animate-fade-in" onClick={() => setActiveZone(null)}>
                    <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl animate-slide-up overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        {/* Modal Header */}
                        <div className="p-8 pb-4 flex items-center justify-between">
                            <div>
                                <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{activeLabel}</h3>
                                <p className="text-slate-500 text-sm font-medium mt-1">Wybierz zakres grubości powłoki</p>
                            </div>
                            <button onClick={() => setActiveZone(null)} className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-2xl transition-all active:scale-95">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="p-8 pt-4 space-y-8">
                            {/* Value Selector */}
                            <div className="grid grid-cols-1 gap-3">
                                {PAINT_RANGES.map((range) => (
                                    <button
                                        key={range}
                                        onClick={() => {
                                            setModalValue(range);
                                            // Auto-detect status based on range for efficiency
                                            if (range.includes('500-')) setModalStatus('putty');
                                            else if (range.includes('150-')) setModalStatus('repainted');
                                            else setModalStatus('ok');
                                        }}
                                        className={cn(
                                            "w-full py-5 rounded-2xl text-lg font-black transition-all border-2 flex items-center justify-between px-6",
                                            modalValue === range
                                                ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/30 scale-[1.02]"
                                                : "bg-slate-50 dark:bg-slate-800 border-transparent text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600"
                                        )}
                                    >
                                        <span>{range}</span>
                                        {modalValue === range && <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">✓</div>}
                                    </button>
                                ))}
                            </div>

                            {/* Status Override (Optional manual change if needed) */}
                            <div className="space-y-3">
                                <span className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">Dodatkowa Kwalifikacja</span>
                                <div className="flex gap-3">
                                    {([
                                        { v: 'ok', l: 'Fabryczny', c: 'bg-emerald-500 shadow-emerald-500/20' },
                                        { v: 'repainted', l: 'Lakierowany', c: 'bg-amber-500 shadow-amber-500/20' },
                                        { v: 'putty', l: 'Szpachla', c: 'bg-rose-500 shadow-rose-500/20' },
                                    ] as const).map((opt) => (
                                        <button
                                            key={opt.v}
                                            onClick={() => setModalStatus(opt.v)}
                                            className={cn(
                                                "flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-wider transition-all border-2",
                                                modalStatus === opt.v
                                                    ? `${opt.c} text-white border-transparent shadow-lg scale-105`
                                                    : "bg-slate-50 dark:bg-slate-800 border-transparent text-slate-400 dark:text-slate-500"
                                            )}
                                        >
                                            {opt.l}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-4 pt-2">
                                <button
                                    onClick={() => setActiveZone(null)}
                                    className="px-8 py-5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-black rounded-[1.5rem] hover:bg-slate-200 transition-all active:scale-95"
                                >
                                    Zamknij
                                </button>
                                <button
                                    onClick={saveAndNext}
                                    disabled={!modalValue}
                                    className={cn(
                                        "flex-1 py-5 bg-blue-600 text-white font-black rounded-[1.5rem] transition-all shadow-xl shadow-blue-500/20 active:scale-95 flex items-center justify-center gap-3",
                                        !modalValue && "opacity-50 grayscale cursor-not-allowed"
                                    )}
                                >
                                    {hasNext ? (
                                        <>
                                            <span>Zapisz i Dalej</span>
                                            <span className="text-xl">→</span>
                                        </>
                                    ) : (
                                        <span>Zakończ Pomiar ✓</span>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
