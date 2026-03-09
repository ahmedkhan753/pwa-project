"use client";

import { cn } from "@/lib/utils";
import type { PaintMeasurement, PaintZone } from "@/store/useInspectionStore";
import { useState } from "react";
import { X } from "lucide-react";

interface CarSchemaProps {
    paint: PaintMeasurement;
    onZoneUpdate: (zone: string, data: PaintZone) => void;
}

const ZONES: { id: string; label: string; x: number; y: number; w: number; h: number; path?: string }[] = [
    // Top-down view coordinates (percentage based)
    { id: "frontBumper", label: "Zderzak przód", x: 30, y: 0, w: 40, h: 5 },
    { id: "hood", label: "Maska", x: 30, y: 6, w: 40, h: 18 },
    { id: "leftFrontFender", label: "Błotnik LP", x: 10, y: 5, w: 18, h: 18 },
    { id: "rightFrontFender", label: "Błotnik PP", x: 72, y: 5, w: 18, h: 18 },
    { id: "leftFrontDoor", label: "Drzwi LP", x: 10, y: 24, w: 18, h: 22 },
    { id: "rightFrontDoor", label: "Drzwi PP", x: 72, y: 24, w: 18, h: 22 },
    { id: "leftAColumn", label: "Słup A L", x: 28, y: 24, w: 4, h: 6 },
    { id: "rightAColumn", label: "Słup A P", x: 68, y: 24, w: 4, h: 6 },
    { id: "roof", label: "Dach", x: 32, y: 25, w: 36, h: 36 },
    { id: "leftBColumn", label: "Słup B L", x: 28, y: 44, w: 4, h: 6 },
    { id: "rightBColumn", label: "Słup B P", x: 68, y: 44, w: 4, h: 6 },
    { id: "leftRearDoor", label: "Drzwi LT", x: 10, y: 47, w: 18, h: 22 },
    { id: "rightRearDoor", label: "Drzwi PT", x: 72, y: 47, w: 18, h: 22 },
    { id: "leftCColumn", label: "Słup C L", x: 28, y: 64, w: 4, h: 6 },
    { id: "rightCColumn", label: "Słup C P", x: 68, y: 64, w: 4, h: 6 },
    { id: "leftRearFender", label: "Błotnik LT", x: 10, y: 70, w: 18, h: 18 },
    { id: "rightRearFender", label: "Błotnik PT", x: 72, y: 70, w: 18, h: 18 },
    { id: "leftSill", label: "Próg L", x: 5, y: 25, w: 4, h: 45 },
    { id: "rightSill", label: "Próg P", x: 91, y: 25, w: 4, h: 45 },
    { id: "trunk", label: "Klapa tył", x: 30, y: 64, w: 40, h: 15 },
    { id: "rearBumper", label: "Zderzak tył", x: 30, y: 80, w: 40, h: 5 },
];

function getZoneColor(zone: PaintZone): string {
    if (!zone.value) return "fill-gray-100 dark:fill-gray-800 stroke-gray-300";
    const val = parseInt(zone.value);
    if (zone.status === 'putty') return "fill-red-500 stroke-red-600";
    if (zone.status === 'repainted') return "fill-amber-500 stroke-amber-600";
    if (val > 0 && val < 150) return "fill-green-500 stroke-green-600";
    if (val >= 150 && val <= 300) return "fill-amber-500 stroke-amber-600";
    if (val > 300) return "fill-red-500 stroke-red-600";
    return "fill-green-500 stroke-green-600";
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

    const saveAndClose = () => {
        if (activeZone) {
            onZoneUpdate(activeZone, { value: modalValue, status: modalStatus });
        }
        setActiveZone(null);
    };

    const activeLabel = ZONES.find(z => z.id === activeZone)?.label || '';

    return (
        <div className="space-y-4">
            {/* Car Diagram */}
            <div className="relative bg-surface rounded-2xl border border-border p-4 overflow-hidden shadow-sm">
                <svg viewBox="0 0 100 90" className="w-full" style={{ maxHeight: '420px' }}>
                    {/* Car silhouette background */}
                    <path
                        d="M30 2 Q30 0 50 0 Q70 0 70 2 L75 5 Q88 8 90 20 L92 70 Q90 85 75 88 L50 90 L25 88 Q10 85 8 70 L10 20 Q12 8 25 5 Z"
                        fill="none" stroke="var(--border)" strokeWidth="0.5" strokeDasharray="2,2 opacity-20"
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
                                    rx="2" ry="2"
                                    className={cn(
                                        "transition-all duration-300 stroke-[0.3]",
                                        getZoneColor(zoneData),
                                        "group-active:scale-[0.98]"
                                    )}
                                    opacity={isFilled ? 0.9 : 0.4}
                                />
                                <text
                                    x={zone.x + zone.w / 2} y={zone.y + (isFilled ? zone.h / 2 - 1.5 : zone.h / 2)}
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    className={cn(
                                        "font-bold pointer-events-none select-none",
                                        isFilled ? "fill-white text-[2px]" : "fill-secondary text-[1.8px]"
                                    )}
                                >
                                    {zone.label}
                                </text>
                                {isFilled && (
                                    <text
                                        x={zone.x + zone.w / 2} y={zone.y + zone.h / 2 + 2}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        className="fill-white text-[2.5px] font-black pointer-events-none select-none"
                                    >
                                        {zoneData.value}
                                    </text>
                                )}
                            </g>
                        );
                    })}
                </svg>

                {/* Legend */}
                <div className="flex gap-4 mt-4 justify-center items-center">
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-green-500 shadow-sm" />
                        <span className="text-[10px] font-bold text-secondary tracking-tight"><150µm</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-amber-500 shadow-sm" />
                        <span className="text-[10px] font-bold text-secondary tracking-tight">150-300µm</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500 shadow-sm" />
                        <span className="text-[10px] font-bold text-secondary tracking-tight">>300µm</span>
                    </div>
                </div>
            </div>

            {/* Readings Table */}
            <div className="section-card">
                <h4 className="text-sm font-bold text-foreground mb-2">Odczyty</h4>
                <div className="grid grid-cols-2 gap-1">
                    {ZONES.map((zone) => {
                        const zoneData = paint[zone.id] || { value: '', status: '' };
                        return (
                            <button
                                key={zone.id}
                                onClick={() => openModal(zone.id)}
                                className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                            >
                                <span className="text-xs text-secondary truncate">{zone.label}</span>
                                <span className={cn(
                                    "text-xs font-bold",
                                    zoneData.value ? "text-foreground" : "text-muted"
                                )}>
                                    {zoneData.value ? `${zoneData.value} µm` : '—'}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Modal */}
            {activeZone && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 animate-fade-in" onClick={() => setActiveZone(null)}>
                    <div className="w-full max-w-sm bg-surface rounded-t-2xl sm:rounded-2xl p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-foreground">{activeLabel}</h3>
                            <button onClick={() => setActiveZone(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-secondary uppercase tracking-wider mb-1 block">
                                    Grubość lakieru (µm)
                                </label>
                                <input
                                    type="number"
                                    value={modalValue}
                                    onChange={(e) => setModalValue(e.target.value)}
                                    placeholder="np. 120"
                                    aria-label="Paint thickness"
                                    className="w-full py-3 px-4 text-xl font-mono rounded-xl border-2 border-border bg-surface text-foreground"
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-secondary uppercase tracking-wider mb-2 block">
                                    Stan
                                </label>
                                <div className="flex gap-2">
                                    {([
                                        { v: 'ok', l: 'OK', c: 'bg-green-500' },
                                        { v: 'repainted', l: 'Lakierowane', c: 'bg-amber-500' },
                                        { v: 'putty', l: 'Szpachla', c: 'bg-red-500' },
                                    ] as const).map((opt) => (
                                        <button
                                            key={opt.v}
                                            onClick={() => setModalStatus(opt.v)}
                                            className={cn(
                                                "flex-1 py-2.5 rounded-lg font-bold text-sm transition-all",
                                                modalStatus === opt.v
                                                    ? `${opt.c} text-white shadow-md`
                                                    : "bg-gray-100 text-gray-500 dark:bg-gray-800"
                                            )}
                                        >
                                            {opt.l}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={saveAndClose}
                                className="w-full py-3.5 bg-primary text-white font-bold rounded-xl active:scale-[0.98] transition-transform"
                            >
                                Zapisz
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
