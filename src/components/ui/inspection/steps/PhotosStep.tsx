import { useState } from "react";
import { useInspectionStore } from "@/store/useInspectionStore";
import { PhotoUploadSlot } from "../PhotoUploadSlot";
import { Camera, CheckCircle2, ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function PhotosStep() {
    const { data, setPhotoSlot, clearPhotoSlot } = useInspectionStore();
    const photos = data.photos;
    const [showExtra, setShowExtra] = useState(false);

    // Main 27 items
    const mainPhotos = photos.slice(0, 27);
    // Extra 15 items
    const extraPhotos = photos.slice(27);
    
    const required = mainPhotos.filter((p) => p.required);
    const filledCount = photos.filter((p) => p.base64).length;
    const requiredFilledCount = required.filter((p) => p.base64).length;

    return (
        <div className="space-y-4 animate-fade-in pb-10">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <Camera size={20} className="text-primary" />
                    <h3 className="text-base font-black text-foreground uppercase tracking-tight">
                        Dokumentacja Fotograficzna
                    </h3>
                </div>
                <div className="flex items-center gap-1.5 bg-surface px-3 py-1 rounded-full border border-border">
                    <CheckCircle2 size={14} className={requiredFilledCount === required.length ? "text-success" : "text-muted"} />
                    <span className="text-[10px] font-black text-secondary uppercase tracking-widest">
                        {requiredFilledCount}/{required.length} Wymagane
                    </span>
                </div>
            </div>

            {/* Progress */}
            <div className="bg-surface rounded-2xl p-4 border border-border shadow-sm">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-black text-muted uppercase tracking-widest">Postęp całkowity</span>
                    <span className="text-xs font-black text-primary">{Math.round((filledCount / photos.length) * 100)}%</span>
                </div>
                <div className="w-full bg-surface-raised h-2.5 rounded-full overflow-hidden border border-border/50">
                    <div
                        className="h-full bg-gradient-to-r from-primary to-success rounded-full transition-all duration-700 ease-out"
                        style={{ width: `${(filledCount / photos.length) * 100}%` }}
                    />
                </div>
            </div>

            {/* Main 27 Photo Grid */}
            <div className="grid grid-cols-2 xs:grid-cols-3 gap-3">
                {mainPhotos.map((slot) => (
                    <PhotoUploadSlot
                        key={slot.id}
                        label={slot.label}
                        base64={slot.base64}
                        required={slot.required}
                        onCapture={(b64) => setPhotoSlot(slot.id, b64)}
                        onClear={() => clearPhotoSlot(slot.id)}
                    />
                ))}
            </div>

            {/* Extra Expandable Section */}
            <div className="mt-6 pt-6 border-t border-border">
                <button
                    onClick={() => setShowExtra(!showExtra)}
                    className={cn(
                        "w-full flex items-center justify-between p-5 rounded-2xl border-2 transition-all",
                        showExtra 
                            ? "bg-surface border-primary text-primary shadow-lg shadow-primary/5" 
                            : "bg-surface-raised/50 border-dashed border-border text-muted hover:border-border-hover"
                    )}
                >
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "w-8 h-8 rounded-xl flex items-center justify-center transition-colors",
                            showExtra ? "bg-primary text-white" : "bg-border text-muted"
                        )}>
                            <Plus size={18} />
                        </div>
                        <div className="text-left">
                            <span className="text-xs font-black uppercase tracking-tight block">Dodatkowe zdjęcia</span>
                            <p className="text-[10px] font-medium opacity-60">Opcjonalne ujęcia detali i uszkodzeń</p>
                        </div>
                    </div>
                    <ChevronDown size={20} className={cn("transition-transform duration-300", showExtra && "rotate-180")} />
                </button>

                {showExtra && (
                    <div className="grid grid-cols-2 xs:grid-cols-3 gap-3 mt-4 animate-slide-down">
                        {extraPhotos.map((slot) => (
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
                )}
            </div>

            <div className="bg-primary-light p-4 rounded-2xl flex items-start gap-3 border border-primary/10 mt-4">
                <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[10px] text-white font-black">!</span>
                </div>
                <p className="text-[10px] text-primary-hover font-bold leading-relaxed">
                    Upewnij się, że zdjęcia są wyraźne i dobrze doświetlone. Zdjęcia oznaczone czerwoną gwiazdką są wymagane do zakończenia inspekcji.
                </p>
            </div>
        </div>
    );
}
