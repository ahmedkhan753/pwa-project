'use client';

import React, { useEffect } from 'react';
import { useInspectionStore } from '@/store/useInspectionStore';
import { apiClient } from '@/api/client';
import {
    Phone,
    Play,
    Calendar,
    Car,
    ChevronRight,
    LogOut,
    RefreshCcw,
    MapPin,
    Clock,
    UserCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

export const Dashboard: React.FC = () => {
    const {
        auth,
        jobs,
        logout,
        setJobs,
        setJobsLoading,
        setJobsError,
        selectJob
    } = useInspectionStore();

    const fetchJobs = async () => {
        setJobsLoading(true);
        try {
            const data = await apiClient.fetchJobs();
            setJobs(data);
        } catch (err: any) {
            setJobsError(err.message || 'Nie udało się pobrać zleceń.');
        }
    };

    useEffect(() => {
        if (jobs.list.length === 0) {
            fetchJobs();
        }
    }, []);

    const handleCall = (phone: string) => {
        window.location.href = `tel:${phone}`;
    };

    const handleStart = (jobId: string) => {
        selectJob(jobId);
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-lg shadow-lg shadow-blue-900/40">
                        {auth.user?.name.charAt(0)}
                    </div>
                    <div>
                        <h2 className="font-bold text-sm leading-tight">{auth.user?.name}</h2>
                        <p className="text-[10px] text-slate-500 font-semibold tracking-wider uppercase">Appraiser Marek</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchJobs}
                        disabled={jobs.loading}
                        className="p-2 hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
                        title="Odśwież"
                    >
                        <RefreshCcw className={cn("w-5 h-5 text-slate-400", jobs.loading && "animate-spin")} />
                    </button>
                    <button
                        onClick={logout}
                        className="p-2 hover:bg-slate-800 rounded-xl transition-colors"
                        title="Wyloguj"
                    >
                        <LogOut className="w-5 h-5 text-red-400" />
                    </button>
                </div>
            </header>

            <main className="p-6 pb-24 max-w-2xl mx-auto space-y-6">
                {/* Stats / Welcome */}
                <div className="animate-fade-in">
                    <h1 className="text-2xl font-bold tracking-tight">Twoje Zlecenia</h1>
                    <p className="text-slate-400 text-sm">Masz {jobs.list.length} zaplanowanych inspekcji na dziś.</p>
                </div>

                {/* Job List */}
                <div className="space-y-4">
                    {jobs.loading && jobs.list.length === 0 ? (
                        <div className="py-20 flex flex-col items-center justify-center gap-4">
                            <RefreshCcw className="w-8 h-8 text-blue-500 animate-spin" />
                            <p className="text-slate-500 font-medium">Pobieranie zleceń...</p>
                        </div>
                    ) : jobs.error ? (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center">
                            <p className="text-red-200 mb-4">{jobs.error}</p>
                            <button
                                onClick={fetchJobs}
                                className="px-6 py-2 bg-red-500 hover:bg-red-600 rounded-xl font-bold transition-all"
                            >
                                Spróbuj ponownie
                            </button>
                        </div>
                    ) : jobs.list.length === 0 ? (
                        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-12 text-center text-slate-500">
                            Brak zaplanowanych inspekcji.
                        </div>
                    ) : (
                        jobs.list.map((job) => (
                            <div
                                key={job.id}
                                className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-xl hover:border-slate-700 transition-all duration-300 group"
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-2 bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase">
                                        <Clock className="w-3.5 h-3.5" />
                                        {job.appointmentTime}
                                    </div>
                                    <div className="text-[10px] text-slate-600 font-mono tracking-tighter uppercase px-2">
                                        #{job.id}
                                    </div>
                                </div>

                                <h3 className="text-xl font-bold mb-1 group-hover:text-blue-400 transition-colors uppercase">{job.clientName}</h3>

                                <div className="grid grid-cols-2 gap-y-3 mb-6">
                                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                                        <Car className="w-4 h-4" />
                                        <span className="font-mono">{job.vin}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                                        <MapPin className="w-4 h-4" />
                                        <span>{job.plates}</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => handleCall(job.phone)}
                                        className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 py-3 rounded-2xl font-bold transition-all active:scale-95"
                                    >
                                        <Phone className="w-4 h-4 text-blue-500" />
                                        Zadzwoń
                                    </button>
                                    <button
                                        onClick={() => handleStart(job.id)}
                                        className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 py-3 rounded-2xl font-bold shadow-lg shadow-blue-900/20 transition-all active:scale-95"
                                    >
                                        <Play className="w-4 h-4 fill-current" />
                                        Start
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </main>

            {/* Bottom Safe Area Helper */}
            <div className="fixed bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-slate-950 to-transparent pointer-events-none" />
        </div>
    );
};
