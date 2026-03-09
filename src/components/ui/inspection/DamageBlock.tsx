"use client";

import { Trash2, Camera, ChevronDown } from "lucide-react";
import { PhotoUploadSlot } from "./PhotoUploadSlot";
import type { DamageEntry } from "@/store/useInspectionStore";
import { useState } from "react";

interface DamageBlockProps {
    entry: DamageEntry;
    index: number;
    parts: string[];
    types: string[];
    onUpdate: (data: Partial<DamageEntry>) => void;
    onRemove: () => void;
    onAddPhoto: (base64: string) => void;
}

export function DamageBlock({ entry, index, parts, types, onUpdate, onRemove, onAddPhoto }: DamageBlockProps) {
    const [expanded, setExpanded] = useState(true);

    return (
        <div className="section-card animate-slide-up">
            <div className="flex items-center justify-between mb-3">
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="flex items-center gap-2 font-bold text-sm text-foreground"
                >
                    <span className="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold">
                        {index + 1}
                    </span>
                    {entry.part || `Uszkodzenie ${index + 1}`}
                    <ChevronDown
                        size={16}
                        className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
                    />
                </button>
                <button
                    onClick={onRemove}
                    className="p-2 text-danger hover:bg-danger-light rounded-lg transition-colors"
                    aria-label={`Remove damage ${index + 1}`}
                >
                    <Trash2 size={16} />
                </button>
            </div>

            {expanded && (
                <div className="space-y-3 animate-fade-in">
                    {/* Part Select */}
                    <div>
                        <label className="text-xs font-bold text-secondary uppercase tracking-wider mb-1 block">
                            Element
                        </label>
                        <select
                            value={entry.part}
                            onChange={(e) => onUpdate({ part: e.target.value })}
                            aria-label="Damage part"
                            className="w-full py-3 px-4 rounded-xl border-2 border-border bg-surface text-foreground font-medium appearance-none"
                        >
                            <option value="">Wybierz element...</option>
                            {parts.map((p) => (
                                <option key={p} value={p}>{p}</option>
                            ))}
                        </select>
                    </div>

                    {/* Type Select */}
                    <div>
                        <label className="text-xs font-bold text-secondary uppercase tracking-wider mb-1 block">
                            Typ uszkodzenia
                        </label>
                        <select
                            value={entry.type}
                            onChange={(e) => onUpdate({ type: e.target.value })}
                            aria-label="Damage type"
                            className="w-full py-3 px-4 rounded-xl border-2 border-border bg-surface text-foreground font-medium appearance-none"
                        >
                            <option value="">Wybierz typ...</option>
                            {types.map((t) => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </div>

                    {/* Action Select */}
                    <div>
                        <label className="text-xs font-bold text-secondary uppercase tracking-wider mb-1 block">
                            Działanie
                        </label>
                        <select
                            value={entry.action}
                            onChange={(e) => onUpdate({ action: e.target.value as any })}
                            aria-label="Damage action"
                            className="w-full py-3 px-4 rounded-xl border-2 border-border bg-surface text-foreground font-medium appearance-none"
                        >
                            <option value="">Wybierz działanie...</option>
                            <option value="Naprawa">Naprawa</option>
                            <option value="Wymiana">Wymiana</option>
                            <option value="Polerowanie">Polerowanie</option>
                        </select>
                    </div>

                    {/* Size */}
                    <div>
                        <label className="text-xs font-bold text-secondary uppercase tracking-wider mb-1 block">
                            Rozmiar (cm)
                        </label>
                        <input
                            type="text"
                            value={entry.size}
                            onChange={(e) => onUpdate({ size: e.target.value })}
                            placeholder="np. 5x3 cm"
                            aria-label="Damage size"
                            className="w-full py-3 px-4 rounded-xl border-2 border-border bg-surface text-foreground font-medium"
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="text-xs font-bold text-secondary uppercase tracking-wider mb-1 block">
                            Opis
                        </label>
                        <textarea
                            value={entry.description}
                            onChange={(e) => onUpdate({ description: e.target.value })}
                            placeholder="Dodatkowy opis..."
                            aria-label="Damage description"
                            rows={2}
                            className="w-full py-3 px-4 rounded-xl border-2 border-border bg-surface text-foreground font-medium resize-none"
                        />
                    </div>

                    {/* Damage Photos */}
                    <div>
                        <label className="text-xs font-bold text-secondary uppercase tracking-wider mb-2 flex items-center justify-between">
                            <span>Zdjęcia uszkodzenia</span>
                            {entry.photos.length < 2 && (
                                <span className="text-[10px] text-danger font-bold animate-pulse">
                                    Min. 2 zdjęcia wymagane
                                </span>
                            )}
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {entry.photos.map((photo, i) => (
                                <PhotoUploadSlot
                                    key={i}
                                    label={`Zdjęcie ${i + 1}`}
                                    base64={photo}
                                    required={false}
                                    onCapture={(b64) => {
                                        const newPhotos = [...entry.photos];
                                        newPhotos[i] = b64;
                                        onUpdate({ photos: newPhotos });
                                    }}
                                    onClear={() => {
                                        const newPhotos = entry.photos.filter((_, idx) => idx !== i);
                                        onUpdate({ photos: newPhotos });
                                    }}
                                />
                            ))}
                            <PhotoUploadSlot
                                label="Dodaj"
                                base64=""
                                required={false}
                                onCapture={onAddPhoto}
                                onClear={() => { }}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
