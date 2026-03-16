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
    // 1. Mask
    { id: "hood", label: "Pokrywa przednia", x: 30, y: 6, w: 40, h: 18 },
    // 2. Roof
    { id: "roof", label: "Dach", x: 32, y: 25, w: 36, h: 36 },
    // 3. Trunk
    { id: "trunk", label: "Pokrywa tylna", x: 30, y: 64, w: 40, h: 15 },
    // 4. LF Fender
    { id: "leftFrontFender", label: "Błotnik P.L", x: 10, y: 5, w: 18, h: 18 },
    // 5. LR Fender
    { id: "leftRearFender", label: "Błotnik T.L", x: 10, y: 70, w: 18, h: 18 },
    // 6. RF Fender
    { id: "rightFrontFender", label: "Błotnik P.P", x: 72, y: 5, w: 18, h: 18 },
    // 7. RR Fender
    { id: "rightRearFender", label: "Błotnik T.P", x: 72, y: 70, w: 18, h: 18 },
    // 8. Doors
    { id: "leftFrontDoor", label: "Drzwi P.L", x: 10, y: 24, w: 18, h: 22 },
    { id: "leftRearDoor", label: "Drzwi T.L", x: 10, y: 47, w: 18, h: 22 },
    { id: "rightFrontDoor", label: "Drzwi P.P", x: 72, y: 24, w: 18, h: 22 },
    { id: "rightRearDoor", label: "Drzwi T.P", x: 72, y: 47, w: 18, h: 22 },
    // 9. Sills
    { id: "leftSill", label: "Próg L", x: 5, y: 25, w: 4, h: 45 },
    { id: "rightSill", label: "Próg P", x: 91, y: 25, w: 4, h: 45 },
    // 10. Pillars
    { id: "leftAColumn", label: "Słupek P.L", x: 28, y: 24, w: 4, h: 6 },
    { id: "leftBColumn", label: "Słupek Śr.L", x: 28, y: 44, w: 4, h: 6 },
    { id: "leftCColumn", label: "Słupek T.L", x: 28, y: 56, w: 4, h: 6 },
    { id: "rightAColumn", label: "Słupek P.P", x: 68, y: 24, w: 4, h: 6 },
    { id: "rightBColumn", label: "Słupek Śr.P", x: 68, y: 44, w: 4, h: 6 },
    { id: "rightCColumn", label: "Słupek T.P", x: 68, y: 56, w: 4, h: 6 },
];

const PAINT_RANGES = [
    "0-150µm",
    "150-200µm",
    "200-300µm",
    "300-500µm",
    "500-1000µm",
    "1000-2000µm"
];

function getZoneColor(zone: PaintZone): string {
    if (!zone.value) return "fill-surface-raised stroke-border";
    const val = zone.value;
    
    // Auto-status logic
    if (val.includes('500-') || val.includes('1000-')) return "fill-danger stroke-danger-hover";
    if (val.includes('150-') || val.includes('200-') || val.includes('300-')) return "fill-warning stroke-warning-hover";
    if (val === '0-150µm') return "fill-success stroke-success-hover";
    
    // Explicit status check if manual override was used
    if (zone.status === 'putty') return "fill-danger stroke-danger-hover";
    if (zone.status === 'repainted') return "fill-warning stroke-warning-hover";
    
    return "fill-success stroke-success-hover";
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
            <div className="relative bg-surface rounded-3xl border border-border p-6 shadow-xl transition-all overflow-hidden lg:max-w-xl mx-auto">
                <svg viewBox="0 0 100 90" className="w-full drop-shadow-sm" style={{ maxHeight: '420px' }}>
                    {/* Car silhouette background */}
                    <path
                        d="M30 2 Q30 0 50 0 Q70 0 70 2 L75 5 Q88 8 90 20 L92 70 Q90 85 75 88 L50 90 L25 88 Q10 85 8 70 L10 20 Q12 8 25 5 Z"
                        fill="none" stroke="currentColor" strokeWidth="0.2" className="text-border"
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
                                        isFilled ? "fill-white text-[2.2px]" : "fill-muted text-[2px]"
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
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-success-light rounded-full border border-success/10">
                        <div className="w-2.5 h-2.5 rounded-full bg-success" />
                        <span className="text-[11px] font-bold text-success-hover">Fabryczny</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-warning-light rounded-full border border-warning/10">
                        <div className="w-2.5 h-2.5 rounded-full bg-warning" />
                        <span className="text-[11px] font-bold text-warning-hover">Lakierowany</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-danger-light rounded-full border border-danger/10">
                        <div className="w-2.5 h-2.5 rounded-full bg-danger" />
                        <span className="text-[11px] font-bold text-danger-hover">Szpachla</span>
                    </div>
                </div>
            </div>

            {/* Quick List */}
            <div className="bg-surface rounded-3xl border border-border p-6 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-bold text-foreground uppercase tracking-tight">Postęp Pomiarów</h4>
                    <span className="text-[10px] bg-surface-raised text-muted px-2 py-1 rounded-md font-bold uppercase">
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
                                        ? "bg-surface-raised/50 border-border" 
                                        : "bg-transparent border-border/40 hover:border-border"
                                )}
                            >
                                <span className="text-[10px] font-semibold text-muted/40 uppercase leading-none">{zone.label}</span>
                                <span className={cn(
                                    "text-sm font-black leading-none",
                                    zoneData.value ? "text-foreground" : "text-muted/20"
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
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-background/80 backdrop-blur-sm animate-fade-in" onClick={() => setActiveZone(null)}>
                    <div className="w-full max-w-lg bg-surface rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl animate-slide-up overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        {/* Modal Header */}
                        <div className="p-8 pb-4 flex items-center justify-between">
                            <div>
                                <h3 className="text-2xl font-black text-foreground tracking-tight">{activeLabel}</h3>
                                <p className="text-muted text-sm font-medium mt-1">Wybierz zakres grubości powłoki</p>
                            </div>
                            <button onClick={() => setActiveZone(null)} className="p-3 bg-surface-raised text-muted hover:text-foreground rounded-2xl transition-all active:scale-95">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="p-8 pt-4 space-y-8">
                            {/* Value Selector - PRIMARY INPUT */}
                            <div className="grid grid-cols-2 gap-3">
                                {PAINT_RANGES.map((range) => (
                                    <button
                                        key={range}
                                        onClick={() => {
                                            setModalValue(range);
                                            // Auto-detect status based on range for efficiency
                                            if (range.includes('500-') || range.includes('1000-')) setModalStatus('putty');
                                            else if (range.includes('150-') || range.includes('200-') || range.includes('300-')) setModalStatus('repainted');
                                            else setModalStatus('ok');
                                        }}
                                        className={cn(
                                            "w-full py-6 rounded-2xl text-base font-black transition-all border-2 flex flex-col items-center justify-center gap-1",
                                            modalValue === range
                                                ? "bg-primary border-primary text-white shadow-lg shadow-primary/30 scale-[1.02]"
                                                : "bg-surface-raised border-transparent text-muted hover:border-border"
                                        )}
                                    >
                                        <span className="text-lg leading-none">{range.replace('µm', '')}</span>
                                        <span className="text-[9px] uppercase tracking-widest opacity-60">µm</span>
                                    </button>
                                ))}
                            </div>

                            {/* Additional Info / Note (Optional) */}
                            <div className="space-y-3">
                                <span className="text-xs font-black text-muted/40 uppercase tracking-widest px-1">Status powłoki</span>
                                <div className="flex gap-3">
                                    <div className={cn(
                                        "flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase text-center border-2 transition-all",
                                        modalStatus === 'ok' ? "bg-success/10 border-success text-success" : 
                                        modalStatus === 'repainted' ? "bg-warning/10 border-warning text-warning" :
                                        modalStatus === 'putty' ? "bg-danger/10 border-danger text-danger" : "bg-surface-raised border-transparent text-muted"
                                    )}>
                                        {modalStatus === 'ok' ? 'FABRYCZNY' : modalStatus === 'repainted' ? 'LAKIEROWANY' : modalStatus === 'putty' ? 'SZPACHLA' : 'BRAK'}
                                    </div>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-4 pt-2">
                                <button
                                    onClick={() => setActiveZone(null)}
                                    className="px-8 py-5 bg-surface-raised text-muted font-black rounded-[1.5rem] hover:bg-surface-raised/80 transition-all active:scale-95"
                                >
                                    Zamknij
                                </button>
                                <button
                                    onClick={saveAndNext}
                                    disabled={!modalValue}
                                    className={cn(
                                        "flex-1 py-5 bg-primary text-white font-black rounded-[1.5rem] transition-all shadow-xl shadow-primary/20 active:scale-95 flex items-center justify-center gap-3",
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
