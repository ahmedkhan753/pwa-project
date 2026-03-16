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
            className="min-h-screen bg-background text-foreground selection:bg-primary/30 transition-colors duration-300"
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
                    "w-6 h-6 text-primary", 
                    pulling && "animate-spin",
                    pullDistance >= PULL_THRESHOLD && "scale-125"
                )} />
            </div>

            {/* Premium Header */}
            <header className="sticky top-0 z-50 bg-surface/80 backdrop-blur-2xl border-b border-border transition-colors duration-300">
                <div className="flex items-center justify-between max-w-2xl mx-auto w-full">
                    <div className="flex items-center gap-4">
                        <div className="relative group">
                            <div className="absolute -inset-1 bg-gradient-to-r from-primary to-accent rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
                            <div className="relative w-12 h-12 rounded-2xl bg-surface flex items-center justify-center border border-border shadow-sm transition-colors">
                                <UserCircle className="w-8 h-8 text-primary" />
                            </div>
                        </div>
                        <div>
                            <h2 className="font-black text-lg tracking-tight leading-none mb-0.5">{auth.user?.name}</h2>
                            <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                                <span className="text-[10px] text-muted font-bold uppercase tracking-wider">Rzeczoznawca Online</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <ThemeToggle />
                        <button className="p-2.5 bg-surface-raised/50 hover:bg-surface-raised rounded-xl border border-border transition-all active:scale-95 relative">
                            <Bell className="w-5 h-5 text-muted" />
                            <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-primary rounded-full border-2 border-surface" />
                        </button>
                        <button
                            onClick={logout}
                            className="p-2.5 bg-danger-light hover:bg-danger/20 rounded-xl border border-danger/20 transition-all active:scale-95 text-danger"
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
                        <Search className="w-4 h-4 text-muted group-focus-within:text-primary transition-colors" />
                    </div>
                    <input 
                        type="search"
                        placeholder="Szukaj VIN, Tablic, Klienta..."
                        className="w-full bg-surface border border-border rounded-2xl py-4 pl-12 pr-4 text-sm font-medium focus:bg-surface-raised focus:border-primary/50 transition-all outline-none shadow-sm"
                    />
                </div>

                {/* Date Picker Section */}
                <section className="animate-fade-in [animation-delay:100ms]">
                    <CalendarStrip />
                </section>

                <div className="flex items-center justify-between px-1">
                    <h3 className="text-xl font-black tracking-tight flex items-center gap-3 text-foreground">
                        Twoje Misje
                        <span className="text-[10px] bg-primary-light text-primary px-2 py-0.5 rounded-full border border-primary/20">
                            {filteredJobs.length}
                        </span>
                    </h3>
                    <button 
                        onClick={fetchJobs}
                        disabled={jobs.loading}
                        className="text-[11px] font-bold text-primary uppercase tracking-widest hover:text-primary-hover transition-colors flex items-center gap-1.5"
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
                        <div className="glass-card p-10 text-center border-danger/20 bg-danger-light">
                            <p className="text-danger font-medium mb-6">{jobs.error}</p>
                            <button
                                onClick={fetchJobs}
                                className="px-8 py-3 bg-danger hover:bg-danger/90 text-white rounded-2xl font-black text-sm uppercase transition-all shadow-lg shadow-danger/20 active:scale-95"
                            >
                                Spróbuj ponownie
                            </button>
                        </div>
                    ) : filteredJobs.length === 0 ? (
                        <div className="bg-surface-raised/30 border-2 border-dashed border-border rounded-[2.5rem] py-20 flex flex-col items-center justify-center text-center px-10">
                            <div className="w-20 h-20 rounded-full bg-surface flex items-center justify-center mb-6 border border-border shadow-sm">
                                <Search className="w-10 h-10 text-muted/50" />
                            </div>
                            <h4 className="text-lg font-bold text-foreground mb-2">Brak zleceń</h4>
                            <p className="text-sm text-muted font-medium max-w-[200px]">
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
            
            <footer className="fixed bottom-6 left-6 right-6 h-16 bg-surface/60 backdrop-blur-3xl border border-border rounded-2xl shadow-xl flex items-center justify-around z-50 transform transition-all hover:border-primary/20">
                <button className="flex flex-col items-center gap-1 text-primary">
                    <UserCircle className="w-6 h-6" />
                    <span className="text-[9px] font-black uppercase">Dashboard</span>
                </button>
                <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/30 -mt-8 border-4 border-background active:scale-90 transition-transform">
                    <Play className="w-5 h-5 text-white fill-current translate-x-0.5" />
                </div>
                <button className="flex flex-col items-center gap-1 text-muted">
                    <Settings className="w-6 h-6" />
                    <span className="text-[9px] font-black uppercase">Ustawienia</span>
                </button>
            </footer>
        </div>
    );
};
