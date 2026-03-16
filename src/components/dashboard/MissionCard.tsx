'use client';

import React from 'react';
import { Phone, Navigation, Play, CheckCircle2, Clock, Car, MapPin, AlertCircle } from 'lucide-react';
import { InspectionJob, useInspectionStore } from '@/store/useInspectionStore';
import { cn } from '@/lib/utils';

interface MissionCardProps {
    job: InspectionJob;
}

export const MissionCard: React.FC<MissionCardProps> = ({ job }) => {
    const { drafts, selectJob, scheduleJob } = useInspectionStore();
    const [isScheduling, setIsScheduling] = React.useState(!job.scheduledDate);
    const [selectedDate, setSelectedDate] = React.useState(job.scheduledDate?.split('T')[0] || '');
    const [selectedTime, setSelectedTime] = React.useState(job.scheduledDate?.split('T')[1]?.substring(0, 5) || '');
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    
    // Check if progress exists in drafts
    const isInProgress = !!drafts[job.id] || job.status === 'in_progress';
    const isCompleted = job.status === 'completed';

    const getStatusStyles = () => {
        if (isCompleted) return 'bg-green-500/10 text-green-400 border-green-500/20';
        if (isInProgress) return 'bg-orange-500/10 text-orange-400 border-orange-500/20 shadow-[0_0_15px_rgba(249,115,22,0.1)]';
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
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
        const query = encodeURIComponent(`${job.city || ''} ${job.plates}`);
        window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
    };

    const handleStart = () => {
        if (!job.scheduledDate) {
            setIsScheduling(true);
            return;
        }
        selectJob(job.id);
    };

    const onConfirmSchedule = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!selectedDate || !selectedTime) {
            setError("Wybierz datę i godzinę");
            return;
        }
        
        setIsSubmitting(true);
        setError(null);
        const fullIso = `${selectedDate}T${selectedTime}:00`;
        const res = await scheduleJob(job.id, fullIso);
        
        if (res.success) {
            setIsScheduling(false);
        } else {
            setError(res.message);
        }
        setIsSubmitting(false);
    };

    return (
        <div 
            onClick={!isScheduling ? handleStart : undefined}
            className={cn(
                "group relative bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border-2 rounded-[2.5rem] p-6 shadow-xl dark:shadow-2xl transition-all duration-500",
                !isScheduling && "hover:border-blue-500/30 active:scale-[0.98] cursor-pointer",
                job.hasConflict ? "border-red-500/50 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.2)]" : "border-slate-200 dark:border-slate-800"
            )}
        >
            {/* Conflict Warning Badge */}
            {job.hasConflict && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[10px] font-black px-4 py-1 rounded-full shadow-lg shadow-red-500/40 z-20 flex items-center gap-1.5 uppercase tracking-widest">
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
                        job.jobType === 'CFM' ? "bg-purple-500/20 text-purple-400 border-purple-500/30" : "bg-blue-600 text-white border-blue-500 shadow-blue-500/20"
                    )}>
                        {job.jobType || 'WYCENA'}
                    </div>
                </div>
                <div className={cn(
                    "flex items-center gap-1.5 font-mono text-xs px-3 py-1.5 rounded-xl border transition-colors",
                    job.hasConflict 
                        ? "bg-red-500/10 text-red-500 border-red-500/30" 
                        : "text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/50 border-slate-200/50 dark:border-slate-700/50"
                )}>
                    <Clock className="w-3.5 h-3.5" />
                    {job.scheduledDate ? new Date(job.scheduledDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '??:??'}
                </div>
            </div>

            {/* Vehicle Info */}
            <div className="mb-6">
                <h3 className="text-3xl font-black tracking-tighter text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors uppercase leading-none mb-2">
                    {job.plates}
                </h3>
                <div className="flex items-center gap-2">
                    <Car className="w-4 h-4 text-blue-500" />
                    <p className="text-slate-500 dark:text-slate-400 text-sm font-bold uppercase tracking-tight">
                        {job.make} {job.model}
                    </p>
                </div>
            </div>

            {/* Scheduling UI OR Info */}
            {isScheduling ? (
                <div className="bg-blue-50/50 dark:bg-blue-900/20 rounded-[1.5rem] p-4 border border-blue-100 dark:border-blue-800/50 mb-6 space-y-4 animate-in fade-in slide-in-from-bottom-2" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2 mb-1">
                        <Clock className="w-4 h-4 text-blue-600" />
                        <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Zaplanuj Oględziny</h4>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Data</label>
                            <input 
                                type="date" 
                                value={selectedDate}
                                onChange={e => setSelectedDate(e.target.value)}
                                className="w-full bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-bold focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Godzina</label>
                            <input 
                                type="time" 
                                value={selectedTime}
                                onChange={e => setSelectedTime(e.target.value)}
                                className="w-full bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-bold focus:border-blue-500 outline-none"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-red-500 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg border border-red-100 dark:border-red-800/50">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-bold">{error}</span>
                        </div>
                    )}

                    <button
                        onClick={onConfirmSchedule}
                        disabled={isSubmitting}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black text-xs uppercase shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98] disabled:opacity-50"
                    >
                        {isSubmitting ? 'Zapisywanie...' : 'Zatwierdź i Rozpocznij'}
                    </button>
                    
                    {job.scheduledDate && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); setIsScheduling(false); }}
                            className="w-full text-[10px] font-black text-slate-400 uppercase hover:text-slate-600"
                        >
                            Anuluj
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-3 mb-6">
                    <div className="flex items-start gap-3 text-slate-500 text-xs bg-slate-50 dark:bg-slate-800/20 p-3 rounded-2xl border border-slate-100 dark:border-slate-800/50">
                        <MapPin className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="font-black text-slate-900 dark:text-white uppercase text-[10px] mb-0.5">Lokalizacja</p>
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
                        className="flex flex-col items-center justify-center gap-1.5 bg-slate-100/50 dark:bg-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-800 py-4 rounded-3xl transition-all"
                    >
                        <Phone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Dzwoń</span>
                    </button>
                    <button
                        onClick={handleNavigate}
                        className="flex flex-col items-center justify-center gap-1.5 bg-slate-100/50 dark:bg-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-800 py-4 rounded-3xl transition-all"
                    >
                        <Navigation className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Jedź</span>
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); handleStart(); }}
                        className={cn(
                            "flex flex-col items-center justify-center gap-1.5 py-4 rounded-3xl transition-all shadow-xl active:scale-95",
                            isInProgress ? "bg-orange-500 hover:bg-orange-600 shadow-orange-500/30" : "bg-blue-600 hover:bg-blue-500 shadow-blue-500/30"
                        )}
                    >
                        <Play className="w-5 h-5 fill-current text-white" />
                        <span className="text-[9px] font-black uppercase text-white tracking-widest">
                            {isInProgress ? 'Wznów' : 'Start'}
                        </span>
                    </button>
                </div>
            )}
        </div>
    );
};
