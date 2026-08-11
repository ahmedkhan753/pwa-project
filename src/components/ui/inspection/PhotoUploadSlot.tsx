"use client";

import { Camera, X, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { compressImagePair } from "@/lib/image-utils";
import { useRef, useState, useEffect } from "react";

interface PhotoUploadSlotProps {
    label: string;
    base64: string;
    required: boolean;
    uploaded?: boolean;  // true if backend DB confirmed this slot
    /** GET /files/photo/... for this slot. Only used when the slot is
     *  `uploaded` but has no local base64 (post-reload). Optional so callers
     *  that don't have a deal id / token keep the old text-card behaviour. */
    uploadedUrl?: string;
    // preview = small base64 for Zustand/localStorage thumbnail.
    // full    = HQ base64 destined for the IndexedDB upload queue → backend.
    onCapture: (preview: string, full: string) => void;
    onClear: () => void;
}

export function PhotoUploadSlot({ label, base64, required, uploaded, uploadedUrl, onCapture, onClear }: PhotoUploadSlotProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    // Set if the server thumbnail 404s / errors — falls back to the original
    // text-only ZAPISANO card so a broken image icon is never shown.
    const [remoteFailed, setRemoteFailed] = useState(false);

    // A new URL (different deal or a retake) deserves a fresh attempt.
    useEffect(() => { setRemoteFailed(false); }, [uploadedUrl]);

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const { preview, full } = await compressImagePair(file);
        onCapture(preview, full);
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
            ) : uploaded && uploadedUrl && !remoteFailed ? (
                /* Slot has no local base64 (e.g. after crash/reload) but the DB
                   has the bytes — pull the real photo back so the inspector
                   sees what was actually shot, not a generic badge. Tapping
                   still re-opens the camera to replace it; onError falls back
                   to the text card below so a broken image is never rendered. */
                <button
                    onClick={() => inputRef.current?.click()}
                    className="photo-slot filled relative overflow-hidden w-full border-success/50"
                >
                    <img
                        src={uploadedUrl}
                        alt={label}
                        className="w-full h-full object-cover rounded-[inherit]"
                        onError={() => setRemoteFailed(true)}
                    />
                    <span
                        onClick={(e) => { e.stopPropagation(); onClear(); }}
                        role="button"
                        aria-label={`Remove ${label}`}
                        className="absolute top-1 right-1 bg-danger text-white rounded-full p-1 shadow-md flex items-center justify-center"
                    >
                        <X size={14} />
                    </span>
                    <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center py-0.5 font-medium">
                        {label}
                    </span>
                    <span className="absolute top-1 left-1 bg-success text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full shadow-md">
                        ZAPISANO
                    </span>
                </button>
            ) : uploaded ? (
                /* Uploaded, but we have no URL to fetch with (or the fetch
                   failed): the original reassuring "saved" badge. */
                <button
                    onClick={() => inputRef.current?.click()}
                    className="photo-slot w-full flex-col gap-1 border-success/50 bg-success/5"
                >
                    <ImageIcon size={20} className="text-success" />
                    <span className="text-[10px] font-medium text-secondary text-center leading-tight px-1">
                        {label}
                    </span>
                    <span className="text-[8px] text-success font-bold">ZAPISANO</span>
                </button>
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
