"use client";

import { Camera, X, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { compressImage } from "@/lib/image-utils";
import { useRef } from "react";

interface PhotoUploadSlotProps {
    label: string;
    base64: string;
    required: boolean;
    onCapture: (base64: string) => void;
    onClear: () => void;
}

export function PhotoUploadSlot({ label, base64, required, onCapture, onClear }: PhotoUploadSlotProps) {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const compressed = await compressImage(file, 1024, 1024, 0.65);
        onCapture(compressed);
        e.target.value = '';
    };

    return (
        <div className="relative">
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFile}
                aria-label={`Upload ${label}`}
            />

            {base64 ? (
                <div className="photo-slot filled relative overflow-hidden">
                    <img
                        src={base64}
                        alt={label}
                        className="w-full h-full object-cover rounded-[inherit]"
                    />
                    <button
                        onClick={onClear}
                        className="absolute top-1 right-1 bg-danger text-white rounded-full p-1 shadow-md"
                        aria-label={`Remove ${label}`}
                    >
                        <X size={14} />
                    </button>
                    <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center py-0.5 font-medium">
                        {label}
                    </span>
                </div>
            ) : (
                <button
                    onClick={() => inputRef.current?.click()}
                    className={cn(
                        "photo-slot w-full flex-col gap-1",
                        required && "border-warning bg-warning-light"
                    )}
                >
                    <Camera size={20} className="text-muted" />
                    <span className="text-[10px] font-medium text-secondary text-center leading-tight px-1">
                        {label}
                    </span>
                    {required && (
                        <span className="text-[8px] text-amber-500 font-bold">WYMAGANE</span>
                    )}
                </button>
            )}
        </div>
    );
}
