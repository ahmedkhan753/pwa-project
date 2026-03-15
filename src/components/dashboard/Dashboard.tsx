'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useInspectionStore } from '@/store/useInspectionStore';
import { apiClient } from '@/api/client';
import {
    LogOut,
    RefreshCcw,
    UserCircle,
    Bell,
    Settings,
    Search,
    Play
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CalendarStrip } from './CalendarStrip';
import { MissionCard } from './MissionCard';
import { SkeletonCard } from './SkeletonCard';
import { registerPushNotifications } from "@/lib/push-notifications";
import { ThemeToggle } from '@/components/theme-toggle';

export const Dashboard: React.FC = () => {
    const {
        auth,
        jobs,
        calendar,
        logout,
        fetchDealsForCalendar,
    } = useInspectionStore();

    const [pulling, setPulling] = useState(false);
    const [pullDistance, setPullDistance] = useState(0);
    const touchStartRef = useRef(0);
    const PULL_THRESHOLD = 80;

    const fetchJobs = async () => {
        await fetchDealsForCalendar(calendar.selectedDate);
    };

    // Re-fetch when selected date changes
    useEffect(() => {
        fetchJobs();
    }, [calendar.selectedDate]);

    useEffect(() => {
        registerPushNotifications();
    }, []);

    // Pull-to-refresh logic
    const handleTouchStart = (e: React.TouchEvent) => {
        if (window.scrollY === 0) {
            touchStartRef.current = e.touches[0].clientY;
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (touchStartRef.current > 0) {
            const distance = e.touches[0].clientY - touchStartRef.current;
            if (distance > 0) {
                setPullDistance(Math.min(distance * 0.5, PULL_THRESHOLD + 20));
                if (distance > PULL_THRESHOLD) setPulling(true);
            }
        }
    };

    const handleTouchEnd = () => {
        if (pullDistance > PULL_THRESHOLD) {
            fetchJobs();
        }
        setPulling(false);
        setPullDistance(0);
        touchStartRef.current = 0;
    };

    // Filter jobs by selected date (though API should handle it, client filter is safer)
    const filteredJobs = jobs.list.filter(job => job.deadline === calendar.selectedDate);

    return (
        <div 
            className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white selection:bg-blue-500/30 transition-colors duration-300"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* Pull-to-Refresh Indicator */}
            <div 
                className="fixed top-0 left-0 right-0 flex items-center justify-center transition-all duration-300 z-[60]"
                style={{ 
                    height: `${pullDistance}px`, 
                    opacity: pullDistance / PULL_THRESHOLD,
                    transform: `translateY(${Math.min(pullDistance - 40, 0)}px)`
                }}
            >
                <RefreshCcw className={cn(
                    "w-6 h-6 text-blue-500", 
                    pulling && "animate-spin",
                    pullDistance >= PULL_THRESHOLD && "scale-125"
                )} />
            </div>

            {/* Premium Header */}
            <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-2xl border-b border-slate-200 dark:border-white/[0.05] px-6 py-4 transition-colors duration-300">
                <div className="flex items-center justify-between max-w-2xl mx-auto w-full">
                    <div className="flex items-center gap-4">
                        <div className="relative group">
                            <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-cyan-500 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
                            <div className="relative w-12 h-12 rounded-2xl bg-white dark:bg-slate-900 flex items-center justify-center border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none transition-colors">
                                <UserCircle className="w-8 h-8 text-blue-500 dark:text-blue-400" />
                            </div>
                        </div>
                        <div>
                            <h2 className="font-black text-lg tracking-tight leading-none mb-0.5">{auth.user?.name}</h2>
                            <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Rzeczoznawca Online</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <ThemeToggle />
                        <button className="p-2.5 bg-slate-100 dark:bg-slate-900/50 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-white/5 transition-all active:scale-95 relative">
                            <Bell className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                            <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-blue-500 rounded-full border-2 border-white dark:border-slate-950" />
                        </button>
                        <button
                            onClick={logout}
                            className="p-2.5 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-xl border border-red-200 dark:border-red-500/10 transition-all active:scale-95 text-red-500 dark:text-red-400"
                        >
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-2xl mx-auto px-6 pt-6 pb-32 space-y-8">
                {/* Search Bar - One-Handed Focus */}
                <div className="relative group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                        <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 group-focus-within:text-blue-500 dark:group-focus-within:text-blue-400 transition-colors" />
                    </div>
                    <input 
                        type="search"
                        placeholder="Szukaj VIN, Tablic, Klienta..."
                        className="w-full bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-white/5 rounded-2xl py-4 pl-12 pr-4 text-sm font-medium focus:bg-slate-50 dark:focus:bg-slate-900 focus:border-blue-500/50 transition-all outline-none shadow-sm dark:shadow-none"
                    />
                </div>

                {/* Date Picker Section */}
                <section className="animate-fade-in [animation-delay:100ms]">
                    <CalendarStrip />
                </section>

                {/* Job List Header */}
                <div className="flex items-center justify-between px-1">
                    <h3 className="text-xl font-black tracking-tight flex items-center gap-3">
                        Twoje Misje
                        <span className="text-[10px] bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-500/20">
                            {filteredJobs.length}
                        </span>
                    </h3>
                    <button 
                        onClick={fetchJobs}
                        disabled={jobs.loading}
                        className="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest hover:text-blue-500 dark:hover:text-blue-300 transition-colors flex items-center gap-1.5"
                    >
                        <RefreshCcw className={cn("w-3 h-3", jobs.loading && "animate-spin")} />
                        Synchronizuj
                    </button>
                </div>

                {/* Job Feed */}
                <div className="space-y-4 min-h-[300px]">
                    {jobs.loading ? (
                        <>
                            <SkeletonCard />
                            <SkeletonCard />
                            <SkeletonCard />
                        </>
                    ) : jobs.error ? (
                        <div className="glass-card p-10 text-center border-red-500/20 bg-red-50 dark:bg-red-500/5">
                            <p className="text-red-600 dark:text-red-200 font-medium mb-6">{jobs.error}</p>
                            <button
                                onClick={fetchJobs}
                                className="px-8 py-3 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-black text-sm uppercase transition-all shadow-lg shadow-red-500/20 dark:shadow-red-900/20 active:scale-95"
                            >
                                Spróbuj ponownie
                            </button>
                        </div>
                    ) : filteredJobs.length === 0 ? (
                        <div className="bg-slate-100 dark:bg-slate-900/20 border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-[2.5rem] py-20 flex flex-col items-center justify-center text-center px-10">
                            <div className="w-20 h-20 rounded-full bg-white dark:bg-slate-900/80 flex items-center justify-center mb-6 border border-slate-200 dark:border-white/5 shadow-sm dark:shadow-none">
                                <Search className="w-10 h-10 text-slate-400 dark:text-slate-700" />
                            </div>
                            <h4 className="text-lg font-bold text-slate-800 dark:text-slate-400 mb-2">Brak zleceń</h4>
                            <p className="text-sm text-slate-500 dark:text-slate-600 font-medium max-w-[200px]">
                                Wygląda na to, że nie masz zaplanowanych misji na ten dzień.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-5 animate-fade-in [animation-delay:200ms]">
                            {filteredJobs.map((job) => (
                                <MissionCard key={job.id} job={job} />
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* Bottom Nav Mock / Safe Area */}
            <div className="fixed bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-slate-50 dark:from-slate-950 via-slate-50/80 dark:via-slate-950/80 to-transparent pointer-events-none z-40 transition-opacity" />
            
            <footer className="fixed bottom-6 left-6 right-6 h-16 bg-white/80 dark:bg-slate-900/60 backdrop-blur-3xl border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl flex items-center justify-around z-50 transform transition-all hover:border-slate-300 dark:hover:border-blue-500/20">
                <button className="flex flex-col items-center gap-1 text-blue-600 dark:text-blue-400">
                    <UserCircle className="w-6 h-6" />
                    <span className="text-[9px] font-black uppercase">Dashboard</span>
                </button>
                <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/30 dark:shadow-blue-900/40 -mt-8 border-4 border-slate-50 dark:border-slate-950 active:scale-90 transition-transform">
                    <Play className="w-5 h-5 text-white fill-current translate-x-0.5" />
                </div>
                <button className="flex flex-col items-center gap-1 text-slate-400 dark:text-slate-500">
                    <Settings className="w-6 h-6" />
                    <span className="text-[9px] font-black uppercase">Ustawienia</span>
                </button>
            </footer>
        </div>
    );
};
