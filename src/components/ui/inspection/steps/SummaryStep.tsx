"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { SignaturePad } from "../SignaturePad";
import { Logo } from "@/components/ui/Logo";
import { CheckCircle2, UserCheck, ShieldCheck, AlertCircle, Info, Image as ImageIcon, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export function SummaryStep() {
    const { data, jobs, updateStepData, setSignature } = useInspectionStore();
    const summary = data.finalSummary;
    const allDamages = [...data.exteriorDamage, ...data.interiorDamage];
    
    // Lock logic: if appraiser has signed, lock everything
    const isLocked = !!summary.signatureAppraiser;

    const handleAbsentToggle = (val: boolean) => {
        if (isLocked) return;
        updateStepData('finalSummary', { isAbsentRep: val });
        if (val) setSignature('signatureClient', ''); 
    };

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            {/* ── Section: Damage Gallery ─────────────────── */}
            <div className="section-card bg-surface-raised border-border/50">
                <div className="flex items-center gap-2 mb-4">
                    <ImageIcon size={18} className="text-primary" />
                    <h4 className="text-xs font-black text-foreground uppercase tracking-tight">Galeria Uszkodzeń ({allDamages.length})</h4>
                </div>
                
                {allDamages.length > 0 ? (
                    <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar -mx-1 px-1">
                        {allDamages.map((d, i) => (
                            <div key={i} className="flex-shrink-0 w-24 space-y-2">
                                <div className="aspect-square rounded-2xl overflow-hidden border-2 border-surface shadow-sm relative group">
                                    {d.photos?.[0] ? (
                                        <img src={d.photos[0]} alt="damage" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full bg-surface-raised flex items-center justify-center">
                                            <ImageIcon size={16} className="text-muted/30" />
                                        </div>
                                    )}
                                    <div className="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-center">
                                        <span className="text-[8px] font-black text-white uppercase">{d.part || 'Element'}</span>
                                    </div>
                                </div>
                                <p className="text-[8px] font-bold text-muted truncate leading-tight">{d.description}</p>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-6 border-2 border-dashed border-border rounded-2xl opacity-50">
                        <ImageIcon size={24} className="text-muted/20 mb-2" />
                        <p className="text-[10px] font-black text-slate-400 uppercase">Brak zgłoszonych uszkodzeń</p>
                    </div>
                )}
            </div>

            {/* ── Section: Representative Absence ────────── */}
            <div className={cn("section-card border-l-4 border-amber-500 relative overflow-hidden", isLocked && "opacity-75 grayscale shadow-inner")}>
                {isLocked && (
                    <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 bg-slate-900/10 rounded-lg backdrop-blur-sm">
                        <ShieldCheck size={12} className="text-slate-500" />
                        <span className="text-[10px] font-black text-slate-500 uppercase">Zablokowano</span>
                    </div>
                )}
                
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <UserCheck size={18} className="text-amber-500" />
                        <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tight">Dysponent Pojazdu</h4>
                    </div>
                    <button
                        onClick={() => handleAbsentToggle(!summary.isAbsentRep)}
                        disabled={isLocked}
                        className={cn(
                            "px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all border",
                            summary.isAbsentRep 
                                ? "bg-accent border-accent text-white shadow-lg shadow-accent/20" 
                                : "bg-surface-raised border-border text-muted",
                            isLocked && "cursor-not-allowed opacity-50"
                        )}
                    >
                        {summary.isAbsentRep ? "NB: Nieobecny" : "Obecny"}
                    </button>
                </div>

                {summary.isAbsentRep ? (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-start gap-2 bg-warning-light p-3 rounded-xl border border-warning/10">
                            <Info size={14} className="text-warning flex-shrink-0 mt-0.5" />
                            <p className="text-[10px] text-warning font-bold leading-normal">
                                Wybrano brak dysponenta. Zamiast podpisu w raport zostanie wstawione: 
                                <span className="block mt-1 italic opacity-80">"Podpis niemożliwy - Dysponent nieobecny"</span>
                            </p>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Uwagi dot. nieobecności</label>
                            <div className="relative">
                                <MessageSquare size={14} className="absolute left-3 top-3 text-slate-400" />
                                <textarea
                                    value={summary.absentRepComment}
                                    disabled={isLocked}
                                    onChange={(e) => updateStepData('finalSummary', { absentRepComment: e.target.value })}
                                    className="w-full bg-background border-2 border-border rounded-2xl py-3 pl-10 pr-4 text-sm font-bold min-h-[80px]"
                                    placeholder="np. Pojazd pozostawiony na parkingu, kluczyki w skrzynce..."
                                />
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Damage context thumbnails row above representative signature */}
                        {allDamages.length > 0 && (
                            <div className="flex gap-2 overflow-x-auto py-2 no-scrollbar px-1 bg-background rounded-2xl border border-border">
                                {allDamages.slice(0, 8).map((d, idx) => (
                                    <div key={idx} className="flex-shrink-0 w-12 h-12 rounded-xl overflow-hidden border-2 border-surface shadow-sm">
                                        {d.photos?.[0] ? (
                                            <img src={d.photos[0]} alt="" className="w-full h-full object-cover grayscale-[0.5]" />
                                        ) : (
                                            <div className="w-full h-full bg-surface-raised flex items-center justify-center">
                                                <ImageIcon size={10} className="text-muted/30" />
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {allDamages.length > 8 && (
                                    <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center bg-surface-raised text-[8px] font-black text-muted">
                                        +{allDamages.length - 8}
                                    </div>
                                )}
                            </div>
                        )}
                        <SignaturePad
                            label="Podpis Dysponenta / Przedstawiciela"
                            value={summary.signatureClient}
                            onSave={(b64) => setSignature('signatureClient', b64)}
                            disabled={isLocked}
                        />
                    </div>
                )}
            </div>

            {/* ── Section: Inspector & Yard Signatures ──── */}
            <div className="section-card bg-surface border-border shadow-lg">
                <div className="flex flex-col items-center text-center mb-10 border-b border-border/50 pb-8">
                    <div className="bg-black p-4 rounded-2xl mb-4 shadow-xl">
                        <Logo variant="full" size="md" />
                    </div>
                    <h3 className="text-xl font-black uppercase tracking-tight text-foreground">Protokół Inspekcji Pojazdu</h3>
                    <div className="flex gap-4 mt-3 text-[10px] font-bold text-muted uppercase tracking-widest">
                        <span>Data: {new Date().toLocaleDateString('pl-PL')}</span>
                        <span>Zlecenie: #{jobs.currentJobId || 'BRAK ID'}</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-8">
                    <SignaturePad
                        label="Podpis Rzeczoznawcy"
                        value={summary.signatureAppraiser}
                        onSave={(b64) => setSignature('signatureAppraiser', b64)}
                        disabled={isLocked && !!summary.signatureAppraiser}
                    />
                    
                    <SignaturePad
                        label="Podpis Przedstawiciela Placu (Opcjonalnie)"
                        value={summary.signatureYard}
                        onSave={(b64) => setSignature('signatureYard', b64)}
                        disabled={isLocked}
                    />
                </div>

                <p className="text-[10px] text-muted mt-8 text-center italic font-medium">
                    Wygenerowano elektronicznie przez system Zaufaj Rzeczoznawcy
                </p>
            </div>

            {/* Final Verification */}
            <div className="bg-foreground text-background rounded-3xl p-6 shadow-xl shadow-primary/20">
                <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 bg-background/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
                        <ShieldCheck size={24} />
                    </div>
                    <div>
                        <h4 className="font-black text-sm uppercase tracking-tight">Zatwierdzenie Raportu</h4>
                        <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Ostatni etap inspekcji</p>
                    </div>
                </div>
                
                <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-white/10 rounded-xl">
                        <span className="text-[10px] font-black uppercase">VIN Potwierdzony</span>
                        <CheckCircle2 size={16} className="text-emerald-400" />
                    </div>
                    <div className="p-3 bg-white/10 rounded-xl">
                        <p className="text-[10px] font-bold leading-normal opacity-90 italic">
                            Oświadczam, że powyższy protokół został sporządzony zgodnie ze stanem faktycznym i rzetelnie odzwierciedla kondycję pojazdu w dniu oględzin.
                        </p>
                    </div>
                </div>
            </div>

            {/* Deferred Digital Sign Placeholder */}
            <div className="opacity-60 grayscale scale-95 origin-center">
                 <div className="bg-surface-raised rounded-2xl p-4 border border-dashed border-border flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                            <Info size={14} className="text-slate-400" />
                        </div>
                        <span className="text-xs font-black text-slate-400 uppercase tracking-tight">Pieczęć Elektroniczna</span>
                    </div>
                    <span className="text-[8px] font-black bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded-md text-slate-500 uppercase">Phase 2</span>
                </div>
            </div>
        </div>
    );
}
