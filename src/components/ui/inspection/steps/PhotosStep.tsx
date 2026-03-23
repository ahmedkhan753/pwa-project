import { useState } from "react";
import { useInspectionStore } from "@/store/useInspectionStore";
import { PhotoUploadSlot } from "../PhotoUploadSlot";
import { Camera, CheckCircle2, ChevronDown, Plus, Cloud, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

export function PhotosStep() {
    const { data, setPhotoSlot, clearPhotoSlot, jobs } = useInspectionStore();
    const dealId = jobs.currentJobId;
    const photoSlots = data.photos;
    const [showExtra, setShowExtra] = useState(false);
    const [videoUploading, setVideoUploading] = useState(false);

    const requiredSlots = photoSlots.slice(0, 34);
    const optionalSlots = photoSlots.slice(34);

    const required = requiredSlots.filter((p) => p.required);
    const filledCount = photoSlots.filter((p) => p.base64).length;
    const requiredFilledCount = required.filter((p) => p.base64).length;

    const handleVideoCapture = async (e: React.ChangeEvent<HTMLInputElement>, slotId: string) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const url = URL.createObjectURL(file);
        const videoEl = document.createElement('video');
        videoEl.src = url;
        videoEl.onloadedmetadata = async () => {
            if (videoEl.duration > 8) {
                alert('Film nie może być dłuższy niż 8 sekund!');
                URL.revokeObjectURL(url);
                return;
            }
            try {
                setVideoUploading(true);
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    const b64 = ev.target?.result as string;
                    setPhotoSlot(slotId, b64); // Save locally first

                    if (dealId) {
                        try {
                            const result = await api.uploadFile(dealId, slotId, file);
                            if (result.success && result.url) {
                                setPhotoSlot(slotId, result.url);
                            }
                        } catch (err) {
                            console.error("Video upload failed:", err);
                        }
                    }
                };
                reader.readAsDataURL(file);
            } finally {
                setVideoUploading(false);
                URL.revokeObjectURL(url);
            }
        };
    };

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
                    <span className="text-xs font-black text-primary">{Math.round((filledCount / photoSlots.length) * 100)}%</span>
                </div>
                <div className="w-full bg-surface-raised h-2.5 rounded-full overflow-hidden border border-border/50">
                    <div
                        className="h-full bg-gradient-to-r from-primary to-success rounded-full transition-all duration-700 ease-out"
                        style={{ width: `${(filledCount / photoSlots.length) * 100}%` }}
                    />
                </div>
            </div>

            {/* Photo Grid — first 34 slots */}
            <div className="grid grid-cols-2 xs:grid-cols-3 gap-3">
                {requiredSlots.map((slot) => (
                    slot.isVideo ? (
                        <div key={slot.id} className="flex flex-col gap-2 relative">
                            <label className="text-[10px] font-black uppercase text-muted tracking-tight">{slot.label}</label>
                            <div className={cn(
                                "photo-slot w-full relative h-[100px]",
                                slot.base64 && "filled",
                                videoUploading && "opacity-50"
                            )}>
                                {!slot.base64 ? (
                                    <div className="flex flex-col items-center justify-center h-full w-full">
                                        <input
                                            type="file"
                                            accept="video/*"
                                            capture="environment"
                                            onChange={(e) => handleVideoCapture(e, slot.id)}
                                            className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                        />
                                        <Camera size={20} className="text-primary mb-1" />
                                        <span className="text-[8px] font-bold text-primary tracking-widest leading-none">NAGRAJ FILM</span>
                                    </div>
                                ) : (
                                    <div className="relative w-full h-full">
                                        <video
                                            src={slot.base64}
                                            className="w-full h-full object-cover rounded-[inherit]"
                                        />
                                        <button
                                            onClick={() => clearPhotoSlot(slot.id)}
                                            className="absolute top-1 right-1 bg-danger text-white rounded-full p-1 z-20 shadow-md"
                                        >
                                            <X size={12} />
                                        </button>
                                        {slot.base64.startsWith('http') && (
                                            <Cloud className="absolute top-1 left-1 text-green-400 drop-shadow-md z-20" size={12} />
                                        )}
                                    </div>
                                )}
                                {videoUploading && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-[inherit] z-30">
                                        <Loader2 className="text-white animate-spin" size={24} />
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <PhotoUploadSlot
                            key={slot.id}
                            id={slot.id}
                            label={slot.label}
                            base64={slot.base64}
                            dealId={dealId}
                            required={slot.required}
                            onCapture={(val) => setPhotoSlot(slot.id, val)}
                            onClear={() => clearPhotoSlot(slot.id)}
                        />
                    )
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
                        {optionalSlots.map((slot) => (
                            <PhotoUploadSlot
                                key={slot.id}
                                id={slot.id}
                                label={slot.label}
                                base64={slot.base64}
                                dealId={dealId}
                                required={false}
                                onCapture={(val) => setPhotoSlot(slot.id, val)}
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
