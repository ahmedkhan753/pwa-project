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
    // Top-down view coordinates (percentage based)
    { id: "hood", label: "Maska", x: 35, y: 2, w: 30, h: 14 },
    { id: "frontBumper", label: "Zderzak przód", x: 30, y: 0, w: 40, h: 3 },
    { id: "leftFrontFender", label: "Błotnik LP", x: 10, y: 4, w: 24, h: 12 },
    { id: "rightFrontFender", label: "Błotnik PP", x: 66, y: 4, w: 24, h: 12 },
    { id: "leftFrontDoor", label: "Drzwi LP", x: 10, y: 18, w: 24, h: 15 },
    { id: "rightFrontDoor", label: "Drzwi PP", x: 66, y: 18, w: 24, h: 15 },
    { id: "leftAColumn", label: "Słupek A L", x: 6, y: 16, w: 5, h: 4 },
    { id: "rightAColumn", label: "Słupek A P", x: 89, y: 16, w: 5, h: 4 },
    { id: "leftBColumn", label: "Słupek B L", x: 6, y: 33, w: 5, h: 4 },
    { id: "rightBColumn", label: "Słupek B P", x: 89, y: 33, w: 5, h: 4 },
    { id: "roof", label: "Dach", x: 35, y: 20, w: 30, h: 25 },
    { id: "leftRearDoor", label: "Drzwi LT", x: 10, y: 35, w: 24, h: 15 },
    { id: "rightRearDoor", label: "Drzwi PT", x: 66, y: 35, w: 24, h: 15 },
    { id: "leftCColumn", label: "Słupek C L", x: 6, y: 50, w: 5, h: 4 },
    { id: "rightCColumn", label: "Słupek C P", x: 89, y: 50, w: 5, h: 4 },
    { id: "leftRearFender", label: "Błotnik LT", x: 10, y: 52, w: 24, h: 14 },
    { id: "rightRearFender", label: "Błotnik PT", x: 66, y: 52, w: 24, h: 14 },
    { id: "leftSill", label: "Próg L", x: 5, y: 22, w: 5, h: 38 },
    { id: "rightSill", label: "Próg P", x: 90, y: 22, w: 5, h: 38 },
    { id: "trunk", label: "Klapa bagażnika", x: 35, y: 68, w: 30, h: 14 },
    { id: "rearBumper", label: "Zderzak tył", x: 30, y: 82, w: 40, h: 3 },
];

function getZoneColor(zone: PaintZone): string {
    if (!zone.value) return "fill-gray-200 dark:fill-gray-700 stroke-gray-400";
    const val = parseInt(zone.value);
    if (zone.status === 'putty') return "paint-putty";
    if (zone.status === 'repainted') return "paint-repainted";
    if (val > 0 && val <= 200) return "paint-ok";
    if (val > 200 && val <= 500) return "paint-repainted";
    if (val > 500) return "paint-putty";
    return "paint-ok";
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
            <div className="relative bg-surface rounded-2xl border border-border p-4 overflow-hidden">
                <svg viewBox="0 0 100 88" className="w-full" style={{ maxHeight: '420px' }}>
                    {/* Car body outline */}
                    <rect x="8" y="1" width="84" height="85" rx="12" ry="12"
                        fill="none" stroke="var(--border)" strokeWidth="0.5" />
                    {/* Clickable zones */}
                    {ZONES.map((zone) => {
                        const zoneData = paint[zone.id] || { value: '', status: '' };
                        return (
                            <g key={zone.id} onClick={() => openModal(zone.id)} className="cursor-pointer">
                                <rect
                                    x={zone.x} y={zone.y}
                                    width={zone.w} height={zone.h}
                                    rx="1.5" ry="1.5"
                                    className={cn(
                                        "transition-all duration-200 stroke-[0.4]",
                                        getZoneColor(zoneData)
                                    )}
                                    opacity={0.85}
                                />
                                <text
                                    x={zone.x + zone.w / 2} y={zone.y + zone.h / 2 - 1}
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    className="fill-foreground text-[2px] font-bold pointer-events-none select-none"
                                >
                                    {zone.label}
                                </text>
                                {zoneData.value && (
                                    <text
                                        x={zone.x + zone.w / 2} y={zone.y + zone.h / 2 + 2.5}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        className="fill-foreground text-[2.5px] font-bold pointer-events-none select-none"
                                    >
                                        {zoneData.value} µm
                                    </text>
                                )}
                            </g>
                        );
                    })}
                </svg>

                {/* Legend */}
                <div className="flex gap-3 mt-3 justify-center flex-wrap">
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-sm bg-green-500" />
                        <span className="text-[10px] text-secondary">OK (≤200µm)</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-sm bg-amber-500" />
                        <span className="text-[10px] text-secondary">Lakierowane</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-sm bg-red-500" />
                        <span className="text-[10px] text-secondary">Szpachlowane</span>
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
