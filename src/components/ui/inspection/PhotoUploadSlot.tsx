"use client";
import { Camera, X, Image as ImageIcon, Cloud, CloudOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { compressImage } from "@/lib/image-utils";
import { useRef, useState } from "react";
import { api } from "@/lib/api";

interface PhotoUploadSlotProps {
    id: string; // Add id to identify the slot
    label: string;
    base64: string; // We'll keep this name, but it might hold a URL now
    dealId: string | null;
    required: boolean;
    onCapture: (value: string) => void;
    onClear: () => void;
}

export function PhotoUploadSlot({ id, label, base64, dealId, required, onCapture, onClear }: PhotoUploadSlotProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>(
        base64.startsWith('http') ? 'success' : base64 ? 'idle' : 'idle'
    );

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            // 1. Aggressive Compression (0.6 quality per senior dev task)
            const compressedBase64 = await compressImage(file, 1280, 1280, 0.6);
            
            // Immediately store locally for UI & Persistence (Zustand -> IndexedDB)
            onCapture(compressedBase64);
            setUploadStatus('uploading');

            // 2. Immediate Upload to Bitrix (if dealId exists)
            if (dealId) {
                try {
                    // Convert base64 to File object for FormData
                    const res = await fetch(compressedBase64);
                    const blob = await res.blob();
                    const uploadFile = new File([blob], `${id}.jpg`, { type: 'image/jpeg' });

                    const result = await api.uploadFile(dealId, id, uploadFile);
                    if (result.success && result.url) {
                        // Store the URL instead of base64 to keep request sizes small
                        onCapture(result.url);
                        setUploadStatus('success');
                    } else {
                        throw new Error('Upload failed');
                    }
                } catch (uploadError) {
                    console.error("[Upload] Immediate upload failed:", uploadError);
                    setUploadStatus('error');
                    // Base64 is already in store, so it's "Retry Ready" for final Submit
                }
            } else {
                setUploadStatus('idle'); // Just kept as base64
            }
        } catch (error) {
            console.error("[Capture] Processing error:", error);
            setUploadStatus('error');
        } finally {
            e.target.value = '';
        }
    };

    const isUrl = base64.startsWith('http');

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
                <div className={cn(
                    "photo-slot filled relative overflow-hidden transition-all duration-300",
                    uploadStatus === 'error' && "ring-2 ring-danger/50"
                )}>
                    <img
                        src={base64}
                        alt={label}
                        className="w-full h-full object-cover rounded-[inherit]"
                    />
                    
                    {/* Status Icons */}
                    <div className="absolute top-1 left-1 flex gap-1">
                        {uploadStatus === 'uploading' && <Loader2 className="text-white animate-spin drop-shadow-md" size={12} />}
                        {uploadStatus === 'success' && <Cloud className="text-green-400 drop-shadow-md" size={12} />}
                        {uploadStatus === 'error' && <CloudOff className="text-warning drop-shadow-md" size={12} />}
                    </div>

                    <button
                        onClick={onClear}
                        className="absolute top-1 right-1 bg-danger text-white rounded-full p-1 shadow-md hover:scale-110 active:scale-95 transition-transform"
                        aria-label={`Remove ${label}`}
                    >
                        <X size={14} />
                    </button>
                    
                    <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] text-center py-0.5 font-black uppercase tracking-tighter">
                        {label}
                    </span>
                    
                    {uploadStatus === 'error' && (
                        <div className="absolute inset-0 bg-danger/10 pointer-events-none flex items-center justify-center">
                            <span className="bg-danger text-[8px] text-white px-1 rounded font-bold">RETRY LATER</span>
                        </div>
                    )}
                </div>
            ) : (
                <button
                    onClick={() => inputRef.current?.click()}
                    disabled={uploadStatus === 'uploading'}
                    className={cn(
                        "photo-slot w-full flex-col gap-1 transition-all hover:border-primary/50 group",
                        required && "border-warning bg-warning-light"
                    )}
                >
                    <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                        <Camera size={22} className={cn("transition-colors", required ? "text-warning" : "text-muted")} />
                    </div>
                    <span className="text-[10px] font-black text-secondary text-center leading-tight px-1 uppercase tracking-tight">
                        {label}
                    </span>
                    {required && (
                        <div className="flex items-center gap-0.5 mt-1">
                            <div className="w-1 h-1 rounded-full bg-amber-500 animate-pulse" />
                            <span className="text-[8px] text-amber-600 font-black tracking-widest leading-none">WYMAGANE</span>
                        </div>
                    )}
                </button>
            )}
        </div>
    );
}
