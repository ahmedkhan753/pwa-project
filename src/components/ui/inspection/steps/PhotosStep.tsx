"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { PhotoUploadSlot } from "../PhotoUploadSlot";
import { Camera, CheckCircle2 } from "lucide-react";

export function PhotosStep() {
    const { data, setPhotoSlot, clearPhotoSlot } = useInspectionStore();
    const photos = data.photos;

    const required = photos.filter((p) => p.required);
    const documents = photos.filter((p) => p.id.startsWith('doc_'));
    const optional = photos.filter((p) => !p.required && !p.id.startsWith('doc_') && !p.id.startsWith('extra_'));
    const extra = photos.filter((p) => p.id.startsWith('extra_'));
    
    const filledCount = photos.filter((p) => p.base64).length;
    const requiredFilledCount = required.filter((p) => p.base64).length;

    return (
        <div className="space-y-4 animate-fade-in pb-10">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <Camera size={18} className="text-primary" />
                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                        Galeria Zdjęć
                    </h3>
                </div>
                <div className="flex items-center gap-1.5">
                    <CheckCircle2 size={14} className={requiredFilledCount === required.length ? "text-success" : "text-muted"} />
                    <span className="text-xs font-bold text-secondary">
                        {filledCount}/{photos.length}
                    </span>
                </div>
            </div>

            {/* Progress */}
            <div className="w-full bg-surface-raised h-2 rounded-full overflow-hidden">
                <div
                    className="h-full bg-gradient-to-r from-primary to-success rounded-full transition-all duration-500"
                    style={{ width: `${(filledCount / photos.length) * 100}%` }}
                />
            </div>
            <p className="text-[10px] text-center text-muted">
                {requiredFilledCount}/{required.length} wymaganych • {filledCount - requiredFilledCount} opcjonalnych/dokumentów
            </p>

            {/* Required Photos */}
            <div className="section-card">
                <h4 className="text-xs font-bold text-warning uppercase tracking-wider mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                    📸 Wymagane ({requiredFilledCount}/{required.length})
                </h4>
                <div className="grid grid-cols-3 gap-2">
                    {required.map((slot) => (
                        <PhotoUploadSlot
                            key={slot.id}
                            label={slot.label}
                            base64={slot.base64}
                            required={true}
                            onCapture={(b64) => setPhotoSlot(slot.id, b64)}
                            onClear={() => clearPhotoSlot(slot.id)}
                        />
                    ))}
                </div>
            </div>

            {/* Documents Section (D1-D5) */}
            <div className="section-card border-l-4 border-l-primary/50">
                <h4 className="text-xs font-bold text-primary uppercase tracking-wider mb-3">
                    📄 Dokumenty (D1-D5)
                </h4>
                <div className="grid grid-cols-3 gap-2">
                    {documents.map((slot) => (
                        <PhotoUploadSlot
                            key={slot.id}
                            label={slot.label}
                            base64={slot.base64}
                            required={false}
                            onCapture={(b64) => setPhotoSlot(slot.id, b64)}
                            onClear={() => clearPhotoSlot(slot.id)}
                        />
                    ))}
                </div>
            </div>

            {/* Optional Photos */}
            {optional.length > 0 && (
                <div className="section-card opacity-80">
                    <h4 className="text-xs font-bold text-secondary uppercase tracking-wider mb-3">
                        📷 Opcjonalne detale
                    </h4>
                    <div className="grid grid-cols-3 gap-2">
                        {optional.map((slot) => (
                            <PhotoUploadSlot
                                key={slot.id}
                                label={slot.label}
                                base64={slot.base64}
                                required={false}
                                onCapture={(b64) => setPhotoSlot(slot.id, b64)}
                                onClear={() => clearPhotoSlot(slot.id)}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Extra Slots */}
            <div className="section-card opacity-60">
                <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-3">
                    ➕ Dodatkowe sloty
                </h4>
                <div className="grid grid-cols-3 gap-2">
                    {extra.map((slot) => (
                        <PhotoUploadSlot
                            key={slot.id}
                            label={slot.label}
                            base64={slot.base64}
                            required={false}
                            onCapture={(b64) => setPhotoSlot(slot.id, b64)}
                            onClear={() => clearPhotoSlot(slot.id)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
