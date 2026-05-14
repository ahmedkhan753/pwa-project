'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useInspectionStore } from '@/store/useInspectionStore';
import {
    LogOut,
    RefreshCcw,
    UserCircle,
    Play,
    Calendar,
    ChevronDown,
    ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CalendarStrip } from './CalendarStrip';
import { MissionCard } from './MissionCard';
import { SkeletonCard } from './SkeletonCard';
import { CalendarView } from './CalendarView';
import { ThemeToggle } from '@/components/theme-toggle';
import { registerPushNotifications } from "@/lib/push-notifications";
import { Logo } from '@/components/ui/Logo';

const FINISHED = ['completed', 'in_valuation', 'closed', 'lost'];

// Polish plural for "zlecenie": 1 → zlecenie, 2-4 → zlecenia, else → zleceń
// (with the 12-14 exception). Keeps the "Plan dnia" header grammatically correct.
const plZlecenie = (n: number): string => {
    if (n === 1) return 'zlecenie';
    const tens = n % 100;
    const ones = n % 10;
    if (ones >= 2 && ones <= 4 && !(tens >= 12 && tens <= 14)) return 'zlecenia';
    return 'zleceń';
};

export const Dashboard: React.FC = () => {
    const {
        auth,
        jobs,
        calendar,
        logout,
        fetchAllDeals,
        fetchDealsForCalendar,
        fetchMe,
        submissionStatuses,
    } = useInspectionStore();

    const [pulling, setPulling] = useState(false);
    const [pullDistance, setPullDistance] = useState(0);
    const [showCalendar, setShowCalendar] = useState(false);
    const [completedExpanded, setCompletedExpanded] = useState(false);
    const touchStartRef = useRef(0);
    const PULL_THRESHOLD = 80;

    // Force-refresh from network
    const fetchJobs = async () => {
        await fetchAllDeals();
    };

    // Re-filter when selected date changes (no network call if cache populated)
    useEffect(() => {
        fetchDealsForCalendar(calendar.selectedDate);
    }, [calendar.selectedDate]);

    useEffect(() => {
        registerPushNotifications();
        fetchMe();
        fetchAllDeals(); // Always fetch fresh on mount — picks up new Bitrix orders
    }, []);

    // Pull-to-refresh
    const handleTouchStart = (e: React.TouchEvent) => {
        if (window.scrollY === 0) touchStartRef.current = e.touches[0].clientY;
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
        if (pullDistance > PULL_THRESHOLD) fetchJobs();
        setPulling(false);
        setPullDistance(0);
        touchStartRef.current = 0;
    };

    // Derive completed jobs for selected date
    const completedJobs = React.useMemo(() => {
        const fromAllDeals = (jobs.allDeals || []).filter(j =>
            FINISHED.includes(j.status) && j.scheduledDate?.startsWith(calendar.selectedDate)
        );
        const locallyDone = [...(jobs.scheduled || []), ...(jobs.unscheduled || [])].filter(
            j => submissionStatuses?.[j.id] === 'done'
        );
        const merged = [...fromAllDeals, ...locallyDone];
        return merged.filter((j, idx, arr) => arr.findIndex(x => x.id === j.id) === idx);
    }, [jobs.allDeals, jobs.scheduled, jobs.unscheduled, calendar.selectedDate, submissionStatuses]);

    // Exclude locally-submitted jobs so they only appear in ZAKOŃCZONE
    const scheduledJobs = (jobs.scheduled || []).filter(j => submissionStatuses?.[j.id] !== 'done');
    const newJobs = (jobs.unscheduled || []).filter(j => submissionStatuses?.[j.id] !== 'done');

    // Single source of truth for the "Plan dnia" header counter — it MUST be
    // the exact value rendered in the Zaplanowane section badge below so the
    // header and body can never drift out of sync.
    const dailyScheduledCount = scheduledJobs.length;

    // NOWE (unscheduled) orders have no date — show them only when viewing today
    const todayISO = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; })();
    const isViewingToday = calendar.selectedDate === todayISO;

    if (showCalendar) {
        return <CalendarView onClose={() => setShowCalendar(false)} />;
    }

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
                <RefreshCcw className={cn("w-6 h-6 text-primary", pulling && "animate-spin")} />
            </div>

            {/* Header */}
            <header className="sticky top-0 z-50 bg-surface/80 backdrop-blur-2xl border-b border-border transition-colors duration-300">
                <div className="flex items-center justify-between max-w-2xl mx-auto w-full px-6 py-4">
                    <div className="flex items-center gap-4">
                        <Logo variant="icon" size="sm" />
                        <div>
                            <h2 className="font-black text-lg tracking-tight leading-none mb-0.5">
                                {auth.currentUserName || 'Rzeczoznawca'}
                            </h2>
                            <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                                <span className="text-[10px] text-muted font-bold uppercase tracking-wider">
                                    Plan dnia: {dailyScheduledCount} {plZlecenie(dailyScheduledCount)}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <ThemeToggle />
                        <button
                            onClick={() => setShowCalendar(true)}
                            className="p-2.5 bg-primary/10 hover:bg-primary/20 rounded-xl border border-primary/20 transition-all active:scale-95 text-primary"
                            title="Kalendarz"
                        >
                            <Calendar className="w-5 h-5" />
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

            <main className="max-w-2xl mx-auto px-6 pt-6 pb-32 space-y-6">
                {/* Date Strip */}
                <section>
                    <CalendarStrip />
                </section>

                {/* Sync button */}
                <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-black text-muted uppercase tracking-widest">
                        {new Date(calendar.selectedDate + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </span>
                    <button
                        onClick={fetchJobs}
                        disabled={jobs.loading}
                        className="text-[11px] font-bold text-primary uppercase tracking-widest hover:text-primary-hover transition-colors flex items-center gap-1.5"
                    >
                        <RefreshCcw className={cn("w-3 h-3", jobs.loading && "animate-spin")} />
                        Synchronizuj
                    </button>
                </div>

                {/* ── Section 1: ZAPLANOWANE (planned for selected date) ── */}
                <section className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />
                        <h3 className="text-sm font-black tracking-tight text-foreground uppercase flex items-center gap-2">
                            Zaplanowane
                            <span className="text-[11px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-lg border border-blue-200 dark:border-blue-700">
                                {dailyScheduledCount}
                            </span>
                        </h3>
                    </div>

                    {jobs.loading ? (
                        <><SkeletonCard /><SkeletonCard /></>
                    ) : scheduledJobs.length === 0 ? (
                        <div className="bg-surface-raised/30 border border-dashed border-border rounded-2xl py-6 flex flex-col items-center justify-center text-center px-6">
                            <p className="text-xs text-muted font-bold uppercase tracking-widest">Brak zaplanowanych misji na ten dzień</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {scheduledJobs.map(job => <MissionCard key={job.id} job={job} />)}
                        </div>
                    )}
                </section>

                {/* ── Section 2: NOWE (no date assigned) — only visible when viewing today ── */}
                {isViewingToday && <section className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-orange-400 flex-shrink-0" />
                        <h3 className="text-sm font-black tracking-tight text-foreground uppercase flex items-center gap-2">
                            Nowe
                            <span className="text-[11px] bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-lg border border-orange-200 dark:border-orange-700">
                                {newJobs.length}
                            </span>
                        </h3>
                    </div>

                    {jobs.loading ? (
                        <SkeletonCard />
                    ) : newJobs.length === 0 ? (
                        <div className="bg-surface-raised/30 border border-dashed border-border rounded-2xl py-6 flex flex-col items-center justify-center text-center px-6">
                            <p className="text-xs text-muted font-bold uppercase tracking-widest">Wszystkie misje są przypisane do dat</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {newJobs.map(job => <MissionCard key={job.id} job={job} />)}
                        </div>
                    )}
                </section>}

                {/* ── Section 3: ZAKOŃCZONE (completed, collapsed by default) ── */}
                {completedJobs.length > 0 && (
                    <section className="space-y-3">
                        <button
                            onClick={() => setCompletedExpanded(v => !v)}
                            className="flex items-center gap-2 px-1 w-full group"
                        >
                            <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
                            <h3 className="text-sm font-black tracking-tight text-foreground uppercase flex items-center gap-2">
                                Zakończone
                                <span className="text-[11px] bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-lg border border-green-200 dark:border-green-700">
                                    {completedJobs.length}
                                </span>
                            </h3>
                            <span className="ml-auto text-muted group-hover:text-foreground transition-colors">
                                {completedExpanded
                                    ? <ChevronUp className="w-4 h-4" />
                                    : <ChevronDown className="w-4 h-4" />
                                }
                            </span>
                        </button>

                        {completedExpanded && (
                            <div className="grid grid-cols-1 gap-4 animate-fade-in">
                                {completedJobs.map(job => <MissionCard key={job.id} job={job} />)}
                            </div>
                        )}
                    </section>
                )}
            </main>

            {/* Bottom gradient */}
            <div className="fixed bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-slate-50 dark:from-slate-950 via-slate-50/80 dark:via-slate-950/80 to-transparent pointer-events-none z-40 transition-opacity" />

            <footer className="fixed bottom-6 left-6 right-6 h-16 bg-surface/60 backdrop-blur-3xl border border-border rounded-2xl shadow-xl flex items-center justify-around z-50 transform transition-all hover:border-primary/20">
                <button className="flex flex-col items-center gap-1 text-primary bg-primary/10 border border-primary/20 px-4 py-1.5 rounded-xl transition-colors">
                    <UserCircle className="w-6 h-6" />
                    <span className="text-[9px] font-black uppercase">Dashboard</span>
                </button>
                <div
                    onClick={() => setShowCalendar(true)}
                    className="w-12 h-12 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/30 -mt-8 border-4 border-background active:scale-90 transition-transform cursor-pointer"
                >
                    <Calendar className="w-5 h-5 text-white" />
                </div>
                <div className="w-10" />
            </footer>
        </div>
    );
};
