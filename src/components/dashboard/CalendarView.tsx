'use client';

import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, ArrowLeft, Calendar } from 'lucide-react';
import { useInspectionStore } from '@/store/useInspectionStore';
import { MissionCard } from './MissionCard';
import { cn } from '@/lib/utils';

const MONTHS_PL = [
    'Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec',
    'Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień',
];
const DAYS_PL = ['Pn','Wt','Śr','Cz','Pt','So','Nd'];
const FINISHED = ['completed', 'in_valuation', 'closed', 'lost'];

interface CalendarViewProps {
    onClose: () => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ onClose }) => {
    const { jobs, submissionStatuses } = useInspectionStore();
    const allDeals = jobs.allDeals || [];

    const today = new Date().toISOString().split('T')[0];
    const [viewDate, setViewDate] = useState(() => new Date());
    const [selectedDay, setSelectedDay] = useState<string>(today);

    // Group deal counts by date for dot rendering
    const dealsByDate = useMemo(() => {
        const map: Record<string, { planned: number; done: number }> = {};
        for (const job of allDeals) {
            const date = job.scheduledDate?.split('T')[0];
            if (!date) continue;
            if (!map[date]) map[date] = { planned: 0, done: 0 };
            const isDone = FINISHED.includes(job.status) || submissionStatuses?.[job.id] === 'done';
            if (isDone) map[date].done++;
            else map[date].planned++;
        }
        return map;
    }, [allDeals, submissionStatuses]);

    // Build calendar grid for current view month
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Monday-based: 0=Mon … 6=Sun
    let startDow = new Date(year, month, 1).getDay() - 1;
    if (startDow < 0) startDow = 6;

    const cells: (number | null)[] = [
        ...Array(startDow).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];

    const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
    const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

    const toISO = (day: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // Jobs for the selected day
    const dayJobs = useMemo(() => {
        return allDeals.filter(j => j.scheduledDate?.startsWith(selectedDay));
    }, [allDeals, selectedDay]);

    const newJobs = allDeals.filter(j => !j.scheduledDate);

    return (
        <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
            {/* ── Header ── */}
            <header className="sticky top-0 z-10 bg-surface/80 backdrop-blur-xl border-b border-border px-4 py-3">
                <div className="flex items-center justify-between max-w-lg mx-auto">
                    <button
                        onClick={onClose}
                        className="flex items-center gap-2 text-sm font-bold text-muted hover:text-foreground transition-colors p-1"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        Dashboard
                    </button>
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-primary" />
                        <span className="text-sm font-black text-foreground uppercase tracking-wide">Kalendarz</span>
                    </div>
                    <div className="w-24" />
                </div>
            </header>

            <div className="flex-1 overflow-y-auto pb-12">
                <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">

                    {/* ── Month navigation ── */}
                    <div className="flex items-center justify-between bg-surface rounded-2xl px-4 py-3 border border-border">
                        <button
                            onClick={prevMonth}
                            className="p-2 hover:bg-surface-raised rounded-xl transition-colors active:scale-95"
                        >
                            <ChevronLeft className="w-5 h-5 text-foreground" />
                        </button>
                        <span className="font-black text-base text-foreground uppercase tracking-tight">
                            {MONTHS_PL[month]} {year}
                        </span>
                        <button
                            onClick={nextMonth}
                            className="p-2 hover:bg-surface-raised rounded-xl transition-colors active:scale-95"
                        >
                            <ChevronRight className="w-5 h-5 text-foreground" />
                        </button>
                    </div>

                    {/* ── Calendar grid ── */}
                    <div className="bg-surface rounded-2xl border border-border p-3">
                        {/* Day headers */}
                        <div className="grid grid-cols-7 mb-1">
                            {DAYS_PL.map(d => (
                                <div key={d} className="text-[9px] font-black text-muted/50 text-center py-1 uppercase tracking-wider">
                                    {d}
                                </div>
                            ))}
                        </div>
                        {/* Day cells */}
                        <div className="grid grid-cols-7 gap-0.5">
                            {cells.map((day, i) => {
                                if (!day) return <div key={i} />;
                                const iso = toISO(day);
                                const info = dealsByDate[iso];
                                const isToday = iso === today;
                                const isSelected = iso === selectedDay;
                                const total = info ? info.planned + info.done : 0;

                                return (
                                    <button
                                        key={i}
                                        onClick={() => setSelectedDay(iso)}
                                        className={cn(
                                            'flex flex-col items-center justify-center rounded-xl py-1.5 transition-all relative',
                                            isSelected
                                                ? 'bg-primary text-white shadow-lg shadow-primary/30'
                                                : isToday
                                                    ? 'ring-2 ring-primary text-primary font-black'
                                                    : 'text-foreground hover:bg-surface-raised',
                                        )}
                                    >
                                        <span className="text-xs font-bold leading-none">{day}</span>

                                        {/* Count badge */}
                                        {total > 0 && (
                                            <span className={cn(
                                                'text-[7px] font-black leading-none mt-0.5',
                                                isSelected ? 'text-white/80' : 'text-muted'
                                            )}>
                                                {total}
                                            </span>
                                        )}

                                        {/* Color dots */}
                                        {info && (info.planned > 0 || info.done > 0) && (
                                            <div className="flex gap-0.5 mt-0.5">
                                                {info.planned > 0 && (
                                                    <span className={cn('w-1 h-1 rounded-full', isSelected ? 'bg-white/70' : 'bg-blue-500')} />
                                                )}
                                                {info.done > 0 && (
                                                    <span className={cn('w-1 h-1 rounded-full', isSelected ? 'bg-white/70' : 'bg-green-500')} />
                                                )}
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Legend ── */}
                    <div className="flex items-center gap-4 px-1">
                        <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-blue-500" />
                            <span className="text-[10px] font-bold text-muted uppercase">Zaplanowane</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-green-500" />
                            <span className="text-[10px] font-bold text-muted uppercase">Zakończone</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-orange-400" />
                            <span className="text-[10px] font-bold text-muted uppercase">Nowe</span>
                        </div>
                    </div>

                    {/* ── Day detail ── */}
                    <div>
                        <h3 className="text-xs font-black text-foreground uppercase tracking-widest px-1 mb-3">
                            {new Date(selectedDay + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}
                            <span className="ml-2 text-primary">({dayJobs.length})</span>
                        </h3>
                        {dayJobs.length === 0 ? (
                            <div className="border-2 border-dashed border-border rounded-2xl py-8 text-center">
                                <p className="text-xs font-bold text-muted uppercase">Brak zleceń w tym dniu</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {dayJobs.map(job => <MissionCard key={job.id} job={job} />)}
                            </div>
                        )}
                    </div>

                    {/* ── Unscheduled (NOWE) ── */}
                    {newJobs.length > 0 && (
                        <div>
                            <h3 className="text-xs font-black text-orange-500 uppercase tracking-widest px-1 mb-3 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-orange-400" />
                                Nowe — bez daty ({newJobs.length})
                            </h3>
                            <div className="space-y-4">
                                {newJobs.map(job => <MissionCard key={job.id} job={job} />)}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
