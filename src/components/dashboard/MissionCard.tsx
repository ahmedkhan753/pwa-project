'use client';

import React from 'react';
import { Phone, Navigation, Play, CheckCircle2, Clock, Car, MapPin, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { InspectionJob, useInspectionStore } from '@/store/useInspectionStore';
import { cn, formatLocaleDate } from '@/lib/utils';

interface MissionCardProps {
    job: InspectionJob;
}

export const MissionCard: React.FC<MissionCardProps> = ({ job }) => {
    const router = useRouter();
    const { drafts, selectJob, scheduleJob } = useInspectionStore();
    const fetchFullDeal = useInspectionStore(state => state.fetchFullDeal);
    const setStep = useInspectionStore(state => state.setStep);

    // Bug 2 Fix: Date/Time defaults
    const getTodayDate = () => new Date().toISOString().split('T')[0];
    const getNextHour = () => {
        const now = new Date();
        now.setHours(now.getHours() + 1);
        now.setMinutes(0);
        return now.toTimeString().slice(0, 5); // "11:00"
    };

    const [isScheduling, setIsScheduling] = React.useState(!job.scheduledDate);
    const [selectedDate, setSelectedDate] = React.useState(job.scheduledDate?.split('T')[0] || getTodayDate());
    const [selectedTime, setSelectedTime] = React.useState(job.scheduledDate?.split('T')[1]?.substring(0, 5) || getNextHour());
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [isScheduledSuccessfully, setIsScheduledSuccessfully] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    
    // Check if progress exists in drafts
    const isInProgress = !!drafts[job.id] || job.status === 'in_progress';
    const isCompleted = job.status === 'completed';

    const getStatusStyles = () => {
        if (isCompleted) return 'bg-success-light text-success border-success/20';
        if (isInProgress) return 'bg-warning-light text-warning border-warning/20 shadow-lg shadow-warning/5';
        return 'bg-primary-light text-primary border-primary/20';
    };

    const getStatusLabel = () => {
        if (isCompleted) return 'Ukończono';
        if (isInProgress) return 'W toku';
        return 'Gotowe';
    };

    const handleCall = (e: React.MouseEvent) => {
        e.stopPropagation();
        window.location.href = `tel:${job.phone}`;
    };

    const handleNavigate = (e: React.MouseEvent) => {
        e.stopPropagation();
        const address = job.location || `${job.city || ''} ${job.plates}`;
        const query = encodeURIComponent(address);
        window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
    };

    const handleStart = async () => {
        if (!job.scheduledDate) {
            setIsScheduling(true);
            return;
        }

        if (isInProgress && drafts[job.id]) {
            // If already in drafts, just select it and go to Step 1 (or wherever they were)
            selectJob(job.id);
            setStep(1); // Force Step 1 as requested for pre-fill verification
            return;
        }

        // Fresh Start: Fetch full data from Bitrix
        setIsSubmitting(true);
        try {
            await fetchFullDeal(job.id);
            // navigate is handled by the component that renders MissionCard or we can rely on store state change
        } catch (err) {
            setError("Błąd pobierania danych deala");
        } finally {
            setIsSubmitting(false);
        }
    };

    const onConfirmSchedule = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!selectedDate || !selectedTime) {
            setError("Wybierz datę i godzinę");
            return;
        }
        
        try {
            // 1. Set saving state
            setIsSubmitting(true);
            setError(null);
            const fullIso = `${selectedDate}T${selectedTime}:00`;

            // 2. Call store action with timeout protection
            console.log(`[Schedule] Attempting to schedule deal ${job.id} for ${fullIso}`);
            const res: any = await Promise.race([
                scheduleJob(job.id, fullIso),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Przekroczono czas oczekiwania (timeout 5s)')), 5000)
                )
            ]);
            
            if (res.success) {
                // 3. Success — update UI
                setIsScheduledSuccessfully(true);
                // Wait small delay to show success "Zaplanowano ✓"
                await new Promise(resolve => setTimeout(resolve, 800));
                
                setIsScheduling(false);
                setIsSubmitting(false);

                // 4. Open Wizard by fetching deal data (which sets currentJobId)
                // This is the SPA equivalent of router.push in this project
                await handleStart();
            } else {
                setError(res.message || "Błąd zapisu");
                setIsSubmitting(false);
            }
        } catch (err: any) {
            // 5. Error — show message, stop spinner
            console.error('Critical Schedule Error:', err);
            setError(err.message || "Błąd zapisu. Spróbuj ponownie.");
            setIsSubmitting(false);
            alert(`Błąd zapisu: ${err.message}. Spróbuj ponownie.`);
        }
    };

    return (
        <div 
            onClick={!isScheduling ? handleStart : undefined}
            className={cn(
                "group relative bg-surface-glass backdrop-blur-xl border-2 rounded-[2.5rem] p-6 shadow-xl dark:shadow-2xl transition-all duration-500",
                !isScheduling && "hover:border-primary/30 active:scale-[0.98] cursor-pointer",
                job.hasConflict ? "border-danger/50 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.2)]" : "border-border"
            )}
        >
            {/* Conflict Warning Badge */}
            {job.hasConflict && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-danger text-white text-[10px] font-black px-4 py-1 rounded-full shadow-lg shadow-danger/40 z-20 flex items-center gap-1.5 uppercase tracking-widest animate-pulse-soft">
                    <AlertCircle className="w-3 h-3" />
                    Kolizja terminów
                </div>
            )}

            {/* Status & Time */}
            <div className="flex justify-between items-start mb-6">
                <div className="flex gap-2">
                    <div className={cn("px-3 py-1 rounded-full text-[10px] font-bold uppercase border", getStatusStyles())}>
                        {getStatusLabel()}
                    </div>
                    <div className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-black uppercase border shadow-lg",
                        job.jobType === 'CFM' ? "bg-primary-light text-primary border-primary/30" : "bg-primary text-white border-primary shadow-lg shadow-primary/20"
                    )}>
                        {job.jobType || 'WYCENA'}
                    </div>
                </div>
                <div className={cn(
                    "flex items-center gap-1.5 font-mono text-[10px] px-3 py-1.5 rounded-xl border transition-colors",
                    job.hasConflict 
                        ? "bg-danger-light text-danger border-danger/30" 
                        : "text-muted bg-surface-raised border-border/50"
                )}>
                    <Clock className="w-3 h-3" />
                    {job.scheduledDate ? formatLocaleDate(job.scheduledDate) : '??:??'}
                </div>
            </div>

            {/* Vehicle Info */}
            <div className="mb-6">
                <h3 className="text-3xl font-black tracking-tighter text-foreground group-hover:text-primary transition-colors uppercase leading-none mb-2">
                    {job.plates}
                </h3>
                <div className="flex items-center gap-2">
                    <Car className="w-4 h-4 text-primary" />
                    <p className="text-muted text-sm font-bold uppercase tracking-tight">
                        {job.make} {job.model}
                    </p>
                </div>
            </div>

            {/* Scheduling UI OR Info */}
            {isScheduling ? (
                <div className="bg-primary-light/50 rounded-[1.5rem] p-4 border border-primary/20 mb-6 space-y-4 animate-in fade-in slide-in-from-bottom-2" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2 mb-1">
                        <Clock className="w-4 h-4 text-primary" />
                        <h4 className="text-[10px] font-black text-primary uppercase tracking-widest">Zaplanuj Oględziny</h4>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Data</label>
                            <input 
                                type="date" 
                                value={selectedDate}
                                onChange={e => setSelectedDate(e.target.value)}
                                className="w-full bg-background border-2 border-border rounded-xl px-3 py-2 text-xs font-bold focus:border-primary outline-none"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Godzina</label>
                            <input 
                                type="time" 
                                value={selectedTime}
                                onChange={e => setSelectedTime(e.target.value)}
                                className="w-full bg-background border-2 border-border rounded-xl px-3 py-2 text-xs font-bold focus:border-primary outline-none"
                            />
                        </div>
                    </div>

                    <div className="space-y-1 pt-1">
                        <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Limit czasu</label>
                        <p className="text-[8px] text-muted italic ml-1">Automatyczny timeout po 5s</p>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-danger bg-danger-light p-2 rounded-lg border border-danger/10">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-bold">{error}</span>
                        </div>
                    )}

                    <button
                        onClick={onConfirmSchedule}
                        disabled={isSubmitting}
                        className={cn(
                            "w-full py-3 rounded-xl font-black text-xs uppercase shadow-lg transition-all active:scale-[0.98] disabled:opacity-50",
                            isScheduledSuccessfully ? "bg-success text-white shadow-success/20" : "bg-primary hover:bg-primary-hover text-white shadow-primary/20"
                        )}
                    >
                        {isSubmitting ? 'Zapisywanie...' : (isScheduledSuccessfully ? 'Zaplanowano ✓' : 'Zatwierdź i Rozpocznij')}
                    </button>
                    
                    {job.scheduledDate && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); setIsScheduling(false); }}
                            className="w-full text-[10px] font-black text-muted uppercase hover:text-foreground"
                        >
                            Anuluj
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-3 mb-6">
                    <div className="flex items-start gap-3 text-muted text-xs bg-surface-raised p-3 rounded-2xl border border-border/50">
                        <MapPin className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="font-black text-foreground uppercase text-[10px] mb-0.5">Lokalizacja</p>
                            <span className="font-medium">{job.city || 'Lokalizacja nieznana'}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Action Bar */}
            {!isScheduling && (
                <div className="grid grid-cols-3 gap-2">
                    <button
                        onClick={handleCall}
                        className="flex flex-col items-center justify-center gap-1.5 bg-surface-raised/50 hover:bg-surface-raised py-4 rounded-3xl transition-all"
                    >
                        <Phone className="w-5 h-5 text-primary" />
                        <span className="text-[9px] font-black uppercase text-muted tracking-widest">Dzwoń</span>
                    </button>
                    <button
                        onClick={handleNavigate}
                        className="flex flex-col items-center justify-center gap-1.5 bg-surface-raised/50 hover:bg-surface-raised py-4 rounded-3xl transition-all"
                    >
                        <Navigation className="w-5 h-5 text-primary" />
                        <span className="text-[9px] font-black uppercase text-muted tracking-widest">Jedź</span>
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); handleStart(); }}
                        className={cn(
                            "flex flex-col items-center justify-center gap-1.5 py-4 rounded-3xl transition-all shadow-xl active:scale-95",
                            isInProgress ? "bg-accent hover:bg-accent-hover shadow-accent/30" : "bg-primary hover:bg-primary-hover shadow-primary/30"
                        )}
                    >
                        <Play className="w-5 h-5 fill-current text-white" />
                        <span className="text-[9px] font-black uppercase text-white tracking-widest">
                            {isSubmitting ? 'Czekaj...' : (isInProgress ? 'Wznów' : 'Start')}
                        </span>
                    </button>
                </div>
            )}
        </div>
    );
};
