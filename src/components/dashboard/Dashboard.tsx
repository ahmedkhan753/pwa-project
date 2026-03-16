'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useInspectionStore } from '@/store/useInspectionStore';
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
import { Logo } from '@/components/ui/Logo';
import { registerPushNotifications } from "@/lib/push-notifications";
import { ThemeToggle } from '@/components/theme-toggle';

export const Dashboard: React.FC = () => {
    const {
        auth,
        jobs,
        calendar,
        logout,
        fetchDealsForCalendar,
        fetchMe,
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
        fetchMe();
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

    // Unified fetch logic

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
                <div className="flex items-center justify-between max-w-2xl mx-auto w-full px-6 py-4">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className="w-12 h-12 rounded-2xl bg-black flex items-center justify-center border border-border/50 shadow-sm p-1 overflow-visible">
                                <Logo variant="icon" size="md" className="!overflow-visible" />
                            </div>
                        </div>
                        <div>
                            <h2 className="font-black text-lg tracking-tight leading-none mb-0.5">
                                {auth.currentUserName || 'Rzeczoznawca'}
                            </h2>
                            <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                                <span className="text-[10px] text-muted font-bold uppercase tracking-wider">Plan dnia: {jobs.totalInBitrix} zleceń</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <ThemeToggle />
                        <button
                            onClick={logout}
                            className="p-2.5 bg-danger-light hover:bg-danger/20 rounded-xl border border-danger/20 transition-all active:scale-95 text-danger ml-2"
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
                    <h3 className="text-xl font-black tracking-tight flex items-center gap-3 text-foreground uppercase">
                        Zlecenia na dziś
                        <span className="text-[12px] bg-primary text-white px-2 py-0.5 rounded-lg border border-primary/20">
                            {(jobs.scheduled || []).length}
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

                {/* Scheduled Jobs */}
                <div className="space-y-4">
                    {jobs.loading ? (
                        <>
                            <SkeletonCard />
                            <SkeletonCard />
                        </>
                    ) : (jobs.scheduled || []).length === 0 ? (
                        <div className="bg-surface-raised/30 border border-dashed border-border rounded-2xl py-8 flex flex-col items-center justify-center text-center px-6">
                            <p className="text-xs text-muted font-bold uppercase tracking-widest">Brak zaplanowanych misji</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-5 animate-fade-in [animation-delay:200ms]">
                            {(jobs.scheduled || []).map((job) => (
                                <MissionCard key={job.id} job={job} />
                            ))}
                        </div>
                    )}
                </div>

                {/* Unscheduled / Waiting Section */}
                <div className="pt-8">
                    <h3 className="text-xl font-black tracking-tight flex items-center gap-3 text-foreground uppercase px-1 mb-6">
                        Oczekujące / Inne
                        <span className="text-[12px] bg-muted/20 text-muted px-2 py-0.5 rounded-lg border border-border">
                            {(jobs.unscheduled || []).length}
                        </span>
                    </h3>
                    <div className="space-y-4">
                        {jobs.loading ? (
                            <SkeletonCard />
                        ) : (jobs.unscheduled || []).length === 0 ? (
                            <div className="bg-surface-raised/10 border border-dashed border-border/50 rounded-2xl py-8 flex flex-col items-center justify-center text-center px-6 grayscale">
                                <p className="text-[10px] text-muted/50 font-bold uppercase tracking-widest">Wszystkie misje są przypisane</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-5 animate-fade-in [animation-delay:300ms]">
                                {(jobs.unscheduled || []).map((job) => (
                                    <MissionCard key={job.id} job={job} />
                                ))}
                            </div>
                        )}
                    </div>
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
                <div className="w-10" /> {/* Spacer instead of settings */}
            </footer>
        </div>
    );
};
