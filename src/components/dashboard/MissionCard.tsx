'use client';

import React from 'react';
import { Phone, Navigation, Play, CheckCircle2, Clock, Car, MapPin, AlertCircle, Bell, Eye, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { InspectionJob, useInspectionStore } from '@/store/useInspectionStore';
import { cn, formatLocaleDate } from '@/lib/utils';

// ── Status display config ──
const STATUS_CONFIG: Record<string, { label: string; badge: string }> = {
    new: { label: 'Nowe', badge: 'bg-blue-100 text-blue-700 border-blue-200' },
    assigned: { label: 'Przypisane', badge: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    scheduled: { label: 'Zaplanowane', badge: 'bg-orange-100 text-orange-700 border-orange-200' },
    completed: { label: 'Zakończone', badge: 'bg-green-100 text-green-700 border-green-200' },
    in_valuation: { label: 'W wycenie', badge: 'bg-purple-100 text-purple-700 border-purple-200' },
    closed: { label: 'Zamknięte', badge: 'bg-gray-100 text-gray-500 border-gray-200' },
    lost: { label: 'Utracone', badge: 'bg-red-100 text-red-500 border-red-200' },
    ready: { label: 'Gotowe', badge: 'bg-primary-light text-primary border-primary/20' },
    in_progress: { label: 'W toku', badge: 'bg-warning-light text-warning border-warning/20' },
};

const FINISHED_STATUSES = ['completed', 'in_valuation', 'closed', 'lost'];

interface MissionCardProps {
    job: InspectionJob;
}

export const MissionCard: React.FC<MissionCardProps> = ({ job }) => {
    const router = useRouter();
    const { drafts, selectJob, scheduleJob } = useInspectionStore();
    const fetchFullDeal = useInspectionStore(state => state.fetchFullDeal);
    const setStep = useInspectionStore(state => state.setStep);

    // Date/Time defaults
    const getTodayDate = () => new Date().toISOString().split('T')[0];
    const getNextHour = () => {
        const now = new Date();
        now.setHours(now.getHours() + 1);
        now.setMinutes(0);
        return now.toTimeString().slice(0, 5);
    };

    const [isScheduling, setIsScheduling] = React.useState(false);
    const [selectedDate, setSelectedDate] = React.useState(job.scheduledDate?.split('T')[0] || getTodayDate());
    const [selectedTime, setSelectedTime] = React.useState(job.scheduledDate?.split('T')[1]?.substring(0, 5) || getNextHour());
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [isScheduledSuccessfully, setIsScheduledSuccessfully] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const isFinished = FINISHED_STATUSES.includes(job.status);
    const isInProgress = !!drafts[job.id] || job.status === 'in_progress';
    const statusConfig = STATUS_CONFIG[job.status] || STATUS_CONFIG['new'];

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
        // PART 4: Block re-entry into completed inspections
        if (isFinished) {
            alert('Ta inspekcja została już zakończona.');
            return;
        }

        if (!job.scheduledDate && job.status !== 'scheduled') {
            setIsScheduling(true);
            return;
        }

        if (isInProgress && drafts[job.id]) {
            selectJob(job.id);
            setStep(1);
            return;
        }

        // Fresh Start: Fetch full data from Bitrix
        setIsSubmitting(true);
        try {
            await fetchFullDeal(job.id);
        } catch (err) {
            setError("Błąd pobierania danych deala");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleViewReport = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const token = localStorage.getItem("token");
            if (!token) {
                alert("Brak autoryzacji. Zaloguj się ponownie.");
                return;
            }

            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const response = await fetch(
                `${apiUrl}/inspection/${job.id}/report`,
                {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            setTimeout(() => URL.revokeObjectURL(url), 10000);

        } catch (error) {
            console.error('Report error:', error);
            alert('Nie można otworzyć raportu. Spróbuj ponownie.');
        }
    };

    const onConfirmSchedule = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!selectedDate || !selectedTime) {
            setError("Wybierz datę i godzinę");
            return;
        }

        try {
            setIsSubmitting(true);
            setError(null);
            const fullIso = `${selectedDate}T${selectedTime}:00`;

            console.log(`[Schedule] Attempting to schedule deal ${job.id} for ${fullIso}`);
            const res: any = await Promise.race([
                scheduleJob(job.id, fullIso),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Przekroczono czas oczekiwania (timeout 5s)')), 5000)
                )
            ]);

            if (res.success) {
                setIsScheduledSuccessfully(true);
                await new Promise(resolve => setTimeout(resolve, 800));

                setIsScheduling(false);
                setIsSubmitting(false);

                await handleStart();
            } else {
                setError(res.message || "Błąd zapisu");
                setIsSubmitting(false);
            }
        } catch (err: any) {
            console.error('Critical Schedule Error:', err);
            setError(err.message || "Błąd zapisu. Spróbuj ponownie.");
            setIsSubmitting(false);
            alert(`Błąd zapisu: ${err.message}. Spróbuj ponownie.`);
        }
    };

    return (
        <div
            onClick={!isScheduling && !isFinished ? handleStart : undefined}
            className={cn(
                "group relative bg-surface-glass backdrop-blur-xl border-2 rounded-[2.5rem] p-6 shadow-xl dark:shadow-2xl transition-all duration-500",
                isFinished
                    ? "border-border/50 opacity-80"
                    : !isScheduling && "hover:border-primary/30 active:scale-[0.98] cursor-pointer",
                job.hasConflict ? "border-danger/50 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.2)]" : !isFinished && "border-border"
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
                <div className="flex gap-2 flex-wrap">
                    {/* Status badge from Bitrix stage */}
                    <div className={cn("px-3 py-1 rounded-full text-[10px] font-bold uppercase border", statusConfig.badge)}>
                        {isFinished && '✅ '}{statusConfig.label}
                    </div>
                    {/* Job type badge */}
                    <div className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-black uppercase border shadow-lg",
                        job.jobType === 'CFM' ? "bg-primary-light text-primary border-primary/30" : "bg-primary text-white border-primary shadow-lg shadow-primary/20"
                    )}>
                        {job.jobType || 'WYCENA'}
                    </div>
                    {/* In-progress badge */}
                    {isInProgress && !isFinished && (
                        <div className="px-3 py-1 rounded-full text-[10px] font-bold uppercase border bg-warning-light text-warning border-warning/20">
                            W toku
                        </div>
                    )}
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

            {/* Scheduling UI OR Location Info */}
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

                    <button
                        onClick={(e) => { e.stopPropagation(); setIsScheduling(false); }}
                        className="w-full text-[10px] font-black text-muted uppercase hover:text-foreground"
                    >
                        Anuluj
                    </button>
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

            {/* ── Action Bar — status-dependent ── */}
            {isFinished ? (
                /* Completed / Closed / Lost: show report button, no start/schedule */
                <div className="space-y-3">
                    <div className="flex items-center justify-center gap-2 py-3 bg-green-50 dark:bg-green-950/30 rounded-2xl border border-green-200 dark:border-green-800">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <span className="text-xs font-black text-green-700 dark:text-green-400 uppercase tracking-widest">
                            Oględziny zakończone
                        </span>
                    </div>
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
                            onClick={handleViewReport}
                            className="flex flex-col items-center justify-center gap-1.5 bg-green-50 dark:bg-green-950/30 hover:bg-green-100 dark:hover:bg-green-900/40 py-4 rounded-3xl transition-all border border-green-200 dark:border-green-800"
                        >
                            <Eye className="w-5 h-5 text-green-600" />
                            <span className="text-[9px] font-black uppercase text-green-700 dark:text-green-400 tracking-widest">Raport</span>
                        </button>
                    </div>
                </div>
            ) : job.status === 'scheduled' || job.scheduledDate ? (
                /* Scheduled: show Start button prominently */
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
            ) : (
                /* New / Assigned: show Schedule (bell) button */
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
                        onClick={(e) => { e.stopPropagation(); setIsScheduling(true); }}
                        className="flex flex-col items-center justify-center gap-1.5 bg-primary hover:bg-primary-hover py-4 rounded-3xl transition-all shadow-xl shadow-primary/30 active:scale-95"
                    >
                        <Bell className="w-5 h-5 text-white" />
                        <span className="text-[9px] font-black uppercase text-white tracking-widest">Zaplanuj</span>
                    </button>
                </div>
            )}
        </div>
    );
};
