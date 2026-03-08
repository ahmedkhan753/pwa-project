"use client";

import { useRef, useCallback } from "react";
import SignatureCanvas from "react-signature-canvas";
import { RotateCcw } from "lucide-react";

interface SignaturePadProps {
    label: string;
    value: string;
    onSave: (base64: string) => void;
}

export function SignaturePad({ label, value, onSave }: SignaturePadProps) {
    const sigRef = useRef<SignatureCanvas>(null);

    const handleEnd = useCallback(() => {
        if (sigRef.current && !sigRef.current.isEmpty()) {
            const data = sigRef.current.getTrimmedCanvas().toDataURL("image/png");
            onSave(data);
        }
    }, [onSave]);

    const handleClear = () => {
        sigRef.current?.clear();
        onSave('');
    };

    return (
        <div className="section-card">
            <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-bold text-foreground">{label}</label>
                <button
                    onClick={handleClear}
                    className="flex items-center gap-1 text-xs text-secondary hover:text-danger transition-colors"
                    aria-label={`Clear ${label}`}
                >
                    <RotateCcw size={14} />
                    Wyczyść
                </button>
            </div>

            <div className="signature-canvas-wrapper">
                {value ? (
                    <div className="relative">
                        <img
                            src={value}
                            alt={`Signature: ${label}`}
                            className="w-full h-[120px] object-contain bg-white rounded-[inherit]"
                        />
                        <button
                            onClick={handleClear}
                            className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/10 transition-colors rounded-[inherit]"
                        >
                            <span className="text-xs text-gray-400 opacity-0 hover:opacity-100">
                                Kliknij aby zmienić
                            </span>
                        </button>
                    </div>
                ) : (
                    <SignatureCanvas
                        ref={sigRef}
                        penColor="#0f172a"
                        canvasProps={{
                            className: "w-full rounded-[inherit]",
                            height: 120,
                            style: { width: '100%', height: '120px' },
                        }}
                        onEnd={handleEnd}
                    />
                )}
            </div>

            {!value && (
                <p className="text-[10px] text-muted mt-1 text-center">
                    Podpis palcem lub rysikiem
                </p>
            )}
        </div>
    );
}
