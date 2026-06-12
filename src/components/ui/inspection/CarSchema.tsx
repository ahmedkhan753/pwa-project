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
    // Client-confirmed order: front → left (with sill after B-column) → rear → right (with sill after B-column) → roof
    { id: "hood", label: "Pokrywa przednia", x: 30, y: 6, w: 40, h: 18 },         // 1
    { id: "leftFrontFender", label: "Błotnik P.L", x: 10, y: 5, w: 18, h: 18 },   // 2
    { id: "leftAColumn", label: "Słupek P.L", x: 28, y: 24, w: 4, h: 6 },         // 3
    { id: "leftFrontDoor", label: "Drzwi P.L", x: 10, y: 24, w: 18, h: 22 },      // 4
    { id: "leftBColumn", label: "Słupek Śr.L", x: 28, y: 44, w: 4, h: 6 },        // 5
    { id: "leftSill", label: "Próg L", x: 5, y: 25, w: 4, h: 45 },                // 6  ← moved here
    { id: "leftRearDoor", label: "Drzwi T.L", x: 10, y: 47, w: 18, h: 22 },       // 7
    { id: "leftCColumn", label: "Słupek T.L", x: 28, y: 56, w: 4, h: 6 },         // 8
    { id: "leftRearFender", label: "Błotnik T.L", x: 10, y: 70, w: 18, h: 18 },   // 9
    { id: "trunk", label: "Pokrywa tylna", x: 30, y: 64, w: 40, h: 15 },           // 10
    { id: "rightRearFender", label: "Błotnik T.P", x: 72, y: 70, w: 18, h: 18 },  // 11
    { id: "rightCColumn", label: "Słupek T.P", x: 68, y: 56, w: 4, h: 6 },        // 12
    { id: "rightRearDoor", label: "Drzwi T.P", x: 72, y: 47, w: 18, h: 22 },      // 13
    { id: "rightBColumn", label: "Słupek Śr.P", x: 68, y: 44, w: 4, h: 6 },       // 14
    { id: "rightSill", label: "Próg P", x: 91, y: 25, w: 4, h: 45 },              // 15 ← moved here
    { id: "rightFrontDoor", label: "Drzwi P.P", x: 72, y: 24, w: 18, h: 22 },     // 16
    { id: "rightAColumn", label: "Słupek P.P", x: 68, y: 24, w: 4, h: 6 },        // 17
    { id: "rightFrontFender", label: "Błotnik P.P", x: 72, y: 5, w: 18, h: 18 },  // 18
    { id: "roof", label: "Dach", x: 32, y: 25, w: 36, h: 36 },                     // 19
];

const PAINT_RANGES = [
    "0-150µm",
    "150-200µm",
    "200-300µm",
    "300-500µm",
    "500-1000µm",
    "1000-2000µm"
];

function autoStatusFromNumber(num: number): 'ok' | 'repainted' | 'putty' {
    if (num <= 150) return 'ok';
    if (num <= 300) return 'repainted';
    return 'putty';
}

function getZoneColor(zone: PaintZone): string {
    if (!zone.value) return "fill-surface-raised stroke-border";
    const val = zone.value;
    
    // Range-based status logic
    if (val.includes('500-') || val.includes('1000-')) return "fill-danger stroke-danger-hover";
    if (val.includes('150-') || val.includes('200-') || val.includes('300-')) return "fill-warning stroke-warning-hover";
    if (val === '0-150µm') return "fill-success stroke-success-hover";
    
    // Exact numeric value — use status field
    // Explicit status check (covers both exact values and manual override)
    if (zone.status === 'putty') return "fill-danger stroke-danger-hover";
    if (zone.status === 'repainted') return "fill-warning stroke-warning-hover";
    if (zone.status === 'ok') return "fill-success stroke-success-hover";
    
    return "fill-success stroke-success-hover";
}

export function CarSchema({ paint, onZoneUpdate }: CarSchemaProps) {
    const [activeZone, setActiveZone] = useState<string | null>(null);
    const [modalValue, setModalValue] = useState('');
    const [modalStatus, setModalStatus] = useState<PaintZone['status']>('');
    const [customInput, setCustomInput] = useState('');

    const openModal = (zoneId: string) => {
        const zone = paint[zoneId];
        const existingValue = zone?.value || '';
        setModalValue(existingValue);
        setModalStatus(zone?.status || '');
        // If the value is not a predefined range, populate the custom input
        if (existingValue && !PAINT_RANGES.includes(existingValue)) {
            setCustomInput(existingValue.replace('µm', '').trim());
        } else {
            setCustomInput('');
        }
        setActiveZone(zoneId);
    };

    // Move the modal on to the next zone in sequence (or close it if the
    // active zone is the last one). Shared by saveAndNext + the
    // "Brak danych" path so both produce identical UI feedback.
    const advanceToNext = () => {
        if (!activeZone) return;
        const currentIndex = ZONES.findIndex(z => z.id === activeZone);
        if (currentIndex < ZONES.length - 1) {
            const nextZone = ZONES[currentIndex + 1];
            const nextZoneData = paint[nextZone.id] || { value: '', status: '' };
            const nextValue = nextZoneData.value || '';
            setModalValue(nextValue);
            setModalStatus(nextZoneData.status || '');
            if (nextValue && !PAINT_RANGES.includes(nextValue)) {
                setCustomInput(nextValue.replace('µm', '').trim());
            } else {
                setCustomInput('');
            }
            setActiveZone(nextZone.id);
        } else {
            setActiveZone(null);
        }
    };

    const saveAndNext = () => {
        if (!activeZone) return;
        onZoneUpdate(activeZone, { value: modalValue, status: modalStatus });
        advanceToNext();
    };

    // "Brak danych" — persist the panel as explicitly not measured AND
    // advance, mirroring saveAndNext. Empty {value:'', status:''} is the
    // app-wide "no data" convention: routers.report.py treats a blank
    // panel as an intentional "no data" reading (status:"unknown" → the
    // report renders "Brak danych"), and getZoneColor()'s first guard
    // (!zone.value) already paints these tiles in the neutral surface
    // colour instead of green. So no new status literal is needed.
    const saveNoDataAndNext = () => {
        if (!activeZone) return;
        onZoneUpdate(activeZone, { value: '', status: '' });
        advanceToNext();
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
                    <div className="w-full max-w-lg max-h-[90dvh] bg-surface rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl animate-slide-up overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        {/* Modal Header */}
                        <div className="p-8 pb-4 flex items-center justify-between">
                            <div>
                                <h3 className="text-2xl font-black text-foreground tracking-tight">{activeLabel}</h3>
                                <p className="text-muted text-sm font-medium mt-1">Wybierz zakres lub wpisz dokładną wartość</p>
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
                                            setCustomInput(''); // clear custom input when range selected
                                            // Auto-detect status based on range for efficiency
                                            if (range.includes('500-') || range.includes('1000-')) setModalStatus('putty');
                                            else if (range.includes('150-') || range.includes('200-') || range.includes('300-')) setModalStatus('repainted');
                                            else setModalStatus('ok');
                                        }}
                                        className={cn(
                                            "w-full py-6 rounded-2xl text-base font-black transition-all border-2 flex flex-col items-center justify-center gap-1",
                                            modalValue === range && !customInput
                                                ? "bg-primary border-primary text-white shadow-lg shadow-primary/30 scale-[1.02]"
                                                : "bg-surface-raised border-transparent text-muted hover:border-border"
                                        )}
                                    >
                                        <span className="text-lg leading-none">{range.replace('µm', '')}</span>
                                        <span className="text-[9px] uppercase tracking-widest opacity-60">µm</span>
                                    </button>
                                ))}
                            </div>

                            {/* No-data option — saves the panel as {value:'', status:''}
                                (app-wide "no data" convention) AND advances to the next
                                zone, so the user gets the same feedback as a normal
                                save. Independent of the disabled-when-empty "Zapisz i
                                Dalej" button. */}
                            <button
                                type="button"
                                onClick={saveNoDataAndNext}
                                className={cn(
                                    "w-full py-4 rounded-2xl text-sm font-black transition-all border-2 flex items-center justify-center gap-2",
                                    (!modalValue && !customInput)
                                        ? "bg-muted/20 border-muted text-foreground shadow-lg scale-[1.02]"
                                        : "bg-surface-raised border-transparent text-muted hover:border-border"
                                )}
                            >
                                Brak danych
                            </button>

                            {/* Custom exact value input */}
                            <div className="space-y-2">
                                <span className="text-xs font-black text-muted/40 uppercase tracking-widest px-1">Lub wpisz dokładną wartość</span>
                                <div className="relative">
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        step="any"
                                        min="0"
                                        max="2000"
                                        placeholder="np. 187"
                                        value={customInput}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setCustomInput(val);
                                            if (val && !isNaN(parseFloat(val))) {
                                                let num = parseFloat(val);
                                                if (num > 2000) num = 2000;
                                                if (num < 0) num = 0;
                                                const clamped = String(num);
                                                if (clamped !== val) setCustomInput(clamped);
                                                setModalValue(clamped); // plain number, no µm suffix
                                                setModalStatus(autoStatusFromNumber(num));
                                            } else if (!val) {
                                                // If cleared, reset to no selection
                                                setModalValue('');
                                                setModalStatus('');
                                            }
                                        }}
                                        className={cn(
                                            "w-full py-4 px-5 pr-14 rounded-2xl bg-surface-raised text-foreground font-black text-lg",
                                            "border-2 transition-all outline-none",
                                            "placeholder:text-muted/30 placeholder:font-medium",
                                            customInput
                                                ? "border-primary shadow-lg shadow-primary/10"
                                                : "border-transparent focus:border-border"
                                        )}
                                    />
                                    <span className="absolute right-5 top-1/2 -translate-y-1/2 text-muted/40 font-black text-sm">µm</span>
                                </div>
                            </div>

                            {/* Status display */}
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
