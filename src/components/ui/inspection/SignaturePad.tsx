"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface SignaturePadProps {
    label: string;
    value: string;
    onSave: (base64: string) => void;
    disabled?: boolean;
}

export function SignaturePad({ label, value, onSave, disabled }: SignaturePadProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [lastPos, setLastPos] = useState({ x: 0, y: 0 });

    // DPI Scaling — set once on mount.
    // ResizeObserver was removed: setting canvas.width inside the callback
    // changes element layout, causing an infinite loop on iOS Safari.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || value) return;

        const setupCanvas = () => {
            const rect = canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.round(rect.width * dpr);
            canvas.height = Math.round(rect.height * dpr);
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.scale(dpr, dpr);
                ctx.lineCap = 'round';
                ctx.lineWidth = 2;
                ctx.strokeStyle = window.matchMedia('(prefers-color-scheme: dark)').matches ? "#6366f1" : "#0f172a";
            }
        };

        // Small delay so the layout is settled before we read getBoundingClientRect
        const raf = requestAnimationFrame(setupCanvas);
        window.addEventListener('resize', setupCanvas);

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', setupCanvas);
        };
    }, [value]);

    const getPos = (e: any) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    const startDrawing = (e: any) => {
        if (disabled) return;
        if (e.type === 'touchstart') e.preventDefault();
        const pos = getPos(e);
        setIsDrawing(true);
        setLastPos(pos);
    };

    const draw = (e: any) => {
        if (!isDrawing || disabled) return;
        if (e.type === 'touchmove') e.preventDefault();
        
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        const pos = getPos(e);
        ctx.beginPath();
        ctx.moveTo(lastPos.x, lastPos.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        setLastPos(pos);
    };

    const stopDrawing = (e: any) => {
        if (isDrawing) {
            setIsDrawing(false);
            saveCanvas();
        }
    };

    const saveCanvas = () => {
        const canvas = canvasRef.current;
        if (canvas) {
            // Check if canvas is empty (simplified check)
            const data = canvas.toDataURL("image/png");
            onSave(data);
        }
    };

    const handleClear = () => {
        if (disabled) return;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (ctx && canvas) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        onSave('');
    };

    return (
        <div className={cn("section-card", disabled && "opacity-60 pointer-events-none")}>
            <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-bold text-foreground">{label}</label>
                {!disabled && (
                    <button
                        onClick={handleClear}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-raised hover:bg-danger/10 text-xs font-black text-muted hover:text-danger rounded-xl border border-border transition-all active:scale-95"
                    >
                        <RotateCcw size={14} />
                        Wyczyść
                    </button>
                )}
            </div>

            <div className="relative w-full bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-inner cursor-crosshair" style={{ height: '220px' }}>
                {value ? (
                    <div className="absolute inset-0 flex items-center justify-center p-4">
                        <img
                            src={value}
                            alt={label}
                            className="max-w-full max-h-full object-contain filter dark:invert"
                        />
                    </div>
                ) : (
                    <canvas
                        ref={canvasRef}
                        className="block w-full h-full touch-none"
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing}
                        onTouchMove={draw}
                        onTouchEnd={stopDrawing}
                    />
                )}
                
                {!value && !isDrawing && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Podpisz się tutaj</p>
                    </div>
                )}
            </div>

            {!value && (
                <p className="text-[10px] text-muted mt-2 text-center font-bold uppercase tracking-wider">
                    Użyj palca lub rysika do złożenia podpisu
                </p>
            )}
        </div>
    );
}
