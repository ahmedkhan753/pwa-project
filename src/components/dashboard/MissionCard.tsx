'use client';

import React from 'react';
import { Phone, Navigation, Play, CheckCircle2, Clock, Car, MapPin } from 'lucide-react';
import { InspectionJob, useInspectionStore } from '@/store/useInspectionStore';
import { cn } from '@/lib/utils';

interface MissionCardProps {
    job: InspectionJob;
}

export const MissionCard: React.FC<MissionCardProps> = ({ job }) => {
    const { drafts, selectJob } = useInspectionStore();
    
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
        selectJob(job.id);
    };

    return (
        <div 
            onClick={handleStart}
            className="group relative bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-800 rounded-[2rem] p-5 shadow-xl dark:shadow-2xl hover:border-blue-500/30 transition-all duration-300 active:scale-[0.98] cursor-pointer overflow-hidden"
        >
            {/* Glossy overlay effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/50 dark:from-white/5 to-transparent pointer-events-none" />
            
            {/* Status & Time */}
            <div className="flex justify-between items-start mb-4 relative z-10">
                <div className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase border",
                    getStatusStyles()
                )}>
                    {getStatusLabel()}
                </div>
                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-mono text-xs bg-slate-100 dark:bg-slate-800/50 px-2.5 py-1 rounded-lg">
                    <Clock className="w-3 h-3" />
                    {job.appointmentTime}
                </div>
            </div>

            {/* License Plate & Vehicle */}
            <div className="mb-4 relative z-10">
                <h3 className="text-2xl font-black tracking-tight text-slate-800 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors uppercase">
                    {job.plates}
                </h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                    {job.make} {job.model}
                </p>
            </div>

            {/* Location & VIN */}
            <div className="grid grid-cols-1 gap-2 mb-6 relative z-10">
                <div className="flex items-center gap-2 text-slate-500 text-xs">
                    <MapPin className="w-3.5 h-3.5 text-blue-500/70" />
                    <span className="truncate">{job.city || 'Lokalizacja nieznana'}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500 text-xs text-pretty">
                    <Car className="w-3.5 h-3.5 text-blue-500/70" />
                    <span className="font-mono tracking-tighter uppercase">{job.vin}</span>
                </div>
            </div>

            {/* Action Bar */}
            <div className="grid grid-cols-3 gap-2 relative z-10">
                <button
                    onClick={handleCall}
                    className="flex flex-col items-center justify-center gap-1 bg-slate-100/50 dark:bg-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-800 py-3 rounded-2xl transition-all active:bg-slate-300 dark:active:bg-slate-700"
                    aria-label="Zadzwoń do klienta"
                >
                    <Phone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <span className="text-[9px] font-bold uppercase text-slate-500">Zadzwoń</span>
                </button>
                <button
                    onClick={handleNavigate}
                    className="flex flex-col items-center justify-center gap-1 bg-slate-100/50 dark:bg-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-800 py-3 rounded-2xl transition-all active:bg-slate-300 dark:active:bg-slate-700"
                    aria-label="Nawiguj do celu"
                >
                    <Navigation className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <span className="text-[9px] font-bold uppercase text-slate-500">Nawiguj</span>
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); handleStart(); }}
                    className={cn(
                        "flex flex-col items-center justify-center gap-1 py-3 rounded-2xl transition-all shadow-lg active:scale-95",
                        isInProgress ? "bg-orange-500 hover:bg-orange-600 shadow-orange-900/20" : "bg-blue-600 hover:bg-blue-500 shadow-blue-900/20"
                    )}
                >
                    {isInProgress ? <Play className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                    <span className="text-[9px] font-black uppercase">
                        {isInProgress ? 'Wznów' : 'Start'}
                    </span>
                </button>
            </div>
        </div>
    );
};
