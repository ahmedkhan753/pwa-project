"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { PhotoUploadSlot } from "../PhotoUploadSlot";
import { Camera, CheckCircle2 } from "lucide-react";

export function PhotosStep() {
    const { data, setPhotoSlot, clearPhotoSlot } = useInspectionStore();
    const photos = data.photos;

    const required = photos.filter((p) => p.required);
    const optional = photos.filter((p) => !p.required);
    const filledCount = photos.filter((p) => p.base64).length;
    const requiredFilledCount = required.filter((p) => p.base64).length;

    return (
        <div className="space-y-4 animate-fade-in">
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
            <div className="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
                <div
                    className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all duration-500"
                    style={{ width: `${(filledCount / photos.length) * 100}%` }}
                />
            </div>
            <p className="text-[10px] text-center text-muted">
                {requiredFilledCount}/{required.length} wymaganych • {filledCount - requiredFilledCount}/{optional.length} opcjonalnych
            </p>

            {/* Required Photos */}
            <div className="section-card">
                <h4 className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-3">
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

            {/* Optional Photos */}
            <div className="section-card">
                <h4 className="text-xs font-bold text-secondary uppercase tracking-wider mb-3">
                    📷 Opcjonalne
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
        </div>
    );
}
