"use client";

import { useRef, useCallback } from "react";
import SignatureCanvas from "react-signature-canvas";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface SignaturePadProps {
    label: string;
    value: string;
    onSave: (base64: string) => void;
    disabled?: boolean;
}

export function SignaturePad({ label, value, onSave, disabled }: SignaturePadProps) {
    const sigRef = useRef<SignatureCanvas>(null);

    const handleEnd = useCallback(() => {
        if (sigRef.current && !sigRef.current.isEmpty()) {
            const data = sigRef.current.getTrimmedCanvas().toDataURL("image/png");
            onSave(data);
        }
    }, [onSave]);

    const handleClear = () => {
        if (disabled) return;
        sigRef.current?.clear();
        onSave('');
    };

    return (
        <div className={cn("section-card", disabled && "opacity-60 pointer-events-none")}>
            <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-bold text-foreground">{label}</label>
                {!disabled && (
                    <button
                        onClick={handleClear}
                        className="flex items-center gap-1 text-xs text-secondary hover:text-danger transition-colors"
                        aria-label={`Clear ${label}`}
                    >
                        <RotateCcw size={14} />
                        Wyczyść
                    </button>
                )}
            </div>

            <div className="signature-canvas-wrapper border-2 border-border rounded-[2rem] overflow-hidden bg-surface relative group">
                {/* Background Grid for better UX */}
                {!value && (
                    <div className="absolute inset-0 grid grid-cols-12 grid-rows-6 opacity-[0.05] pointer-events-none">
                        {Array.from({ length: 72 }).map((_, i) => (
                            <div key={i} className="border-[0.5px] border-foreground"></div>
                        ))}
                    </div>
                )}

                {value ? (
                    <div className="relative h-[220px] flex items-center justify-center p-4">
                        <img
                            src={value}
                            alt={`Signature: ${label}`}
                            className="max-w-full max-h-full object-contain filter dark:invert"
                        />
                        {!disabled && (
                            <div className="absolute inset-0 bg-background/0 group-hover:bg-background/5 transition-colors flex items-center justify-center pointer-events-none">
                                <span className="text-[10px] font-black uppercase text-muted opacity-0 group-hover:opacity-100 transition-opacity">
                                    Kliknij "Wyczyść" aby zmienić
                                </span>
                            </div>
                        )}
                    </div>
                ) : (
                    <SignatureCanvas
                        ref={sigRef}
                        penColor={typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? "#6366f1" : "#0f172a"}
                        canvasProps={{
                            className: "w-full cursor-crosshair",
                            height: 220,
                        }}
                        onEnd={handleEnd}
                    />
                )}
            </div>

            {!value && (
                <p className="text-[10px] text-muted mt-1 text-center">
                    Podpis palcem lub rysikiem (min. 200px wys.)
                </p>
            )}
        </div>
    );
}
