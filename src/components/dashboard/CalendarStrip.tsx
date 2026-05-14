'use client';

import React from 'react';
import { useInspectionStore } from '@/store/useInspectionStore';
import { ChevronDown, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// Returns "YYYY-MM-DD" in LOCAL timezone (not UTC) to avoid midnight off-by-one
const toLocalISO = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const MONTHS_PL = [
    'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
    'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
];

export const CalendarStrip: React.FC = () => {
    const { calendar, setSelectedDate, toggleCalendarExpanded, jobs } = useInspectionStore();

    // Month shown in the expanded "Widok miesiąca" grid. Free to navigate to
    // any past/future month independently of the selected date. Re-anchors to
    // the selected date's month each time the month view is opened.
    const [viewMonth, setViewMonth] = React.useState<Date>(
        () => new Date(calendar.selectedDate + 'T12:00:00')
    );
    React.useEffect(() => {
        if (calendar.expanded) {
            setViewMonth(new Date(calendar.selectedDate + 'T12:00:00'));
        }
    }, [calendar.expanded]); // eslint-disable-line react-hooks/exhaustive-deps

    // Generate 7 days centered on the currently selected date
    const getDays = () => {
        const days = [];
        // Use noon to avoid DST/midnight edge cases
        const baseDate = new Date(calendar.selectedDate + 'T12:00:00');
        for (let i = -3; i <= 3; i++) {
            const date = new Date(baseDate);
            date.setDate(baseDate.getDate() + i);
            days.push(date);
        }
        return days;
    };

    const days = getDays();

    const isToday = (date: Date) => {
        const today = new Date();
        return date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();
    };

    const isSelected = (date: Date) => {
        return calendar.selectedDate === toLocalISO(date);
    };

    const hasTasks = (date: Date) => {
        const isoString = toLocalISO(date);
        return (jobs.allDeals || []).some(job => job.scheduledDate?.startsWith(isoString));
    };

    const formatDate = (date: Date) => {
        setSelectedDate(toLocalISO(date));
    };

    return (
        <div className="space-y-4">
            {/* Header / Week Toggle */}
            <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-primary" />
                    <span className="text-sm font-bold text-foreground">
                        {new Date(calendar.selectedDate).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })}
                    </span>
                </div>
                <button 
                    onClick={toggleCalendarExpanded}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-raised/50 hover:bg-surface-raised rounded-full transition-colors group"
                >
                    <span className="text-[10px] font-bold uppercase text-muted group-hover:text-primary">Widok miesiąca</span>
                    <ChevronDown className={cn("w-3.5 h-3.5 text-muted/40 transition-transform", calendar.expanded && "rotate-180")} />
                </button>
            </div>

            {/* Horizontal Strip */}
            {!calendar.expanded && (
                <div className="flex justify-between items-center gap-1 px-1 overflow-x-auto no-scrollbar py-2">
                    {days.map((date, idx) => {
                        const active = isSelected(date);
                        const today = isToday(date);
                        
                        return (
                            <button
                                key={idx}
                                onClick={() => formatDate(date)}
                                className={cn(
                                    "flex flex-col items-center min-w-[3.5rem] py-3 rounded-2xl transition-all duration-300 relative",
                                    active ? "bg-primary text-white shadow-lg shadow-primary/30 scale-110 z-10" : "bg-surface-raised text-muted hover:bg-surface-raised/80"
                                )}
                            >
                                <span className={cn(
                                    "text-[9px] font-black uppercase mb-1 tracking-tighter",
                                    active ? "text-primary-light" : "text-muted/40"
                                )}>
                                    {date.toLocaleDateString('pl-PL', { weekday: 'short' }).replace('.', '')}
                                </span>
                                <span className="text-lg font-bold leading-none">
                                    {date.getDate()}
                                </span>
                                
                                {today && !active && (
                                    <div className="absolute -top-1 w-1 h-1 bg-primary rounded-full" />
                                )}
                                
                                {hasTasks(date) && (
                                    <div className={cn(
                                        "absolute -bottom-1 w-1 h-1 rounded-full",
                                        active ? "bg-white" : "bg-primary/50"
                                    )} />
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Monthly View — full month grid with prev/next navigation */}
            {calendar.expanded && (() => {
                const vy = viewMonth.getFullYear();
                const vm = viewMonth.getMonth();
                const daysInMonth = new Date(vy, vm + 1, 0).getDate();
                // Monday-based weekday offset for the 1st of the month.
                let startDow = new Date(vy, vm, 1).getDay() - 1;
                if (startDow < 0) startDow = 6;
                const monthCells: (number | null)[] = [
                    ...Array(startDow).fill(null),
                    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
                ];
                const cellISO = (d: number) =>
                    `${vy}-${String(vm + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

                return (
                    <div className="bg-surface/80 backdrop-blur-2xl border border-border rounded-[2rem] p-4 animate-fade-in shadow-xl">
                        {/* Month navigation */}
                        <div className="flex items-center justify-between mb-3">
                            <button
                                onClick={() => setViewMonth(new Date(vy, vm - 1, 1))}
                                aria-label="Poprzedni miesiąc"
                                className="p-2 hover:bg-surface-raised rounded-xl transition-colors active:scale-95"
                            >
                                <ChevronLeft className="w-4 h-4 text-foreground" />
                            </button>
                            <button
                                onClick={() => setViewMonth(new Date())}
                                title="Przejdź do bieżącego miesiąca"
                                className="text-xs font-black text-foreground uppercase tracking-tight px-3 py-1.5 rounded-lg hover:bg-surface-raised transition-colors"
                            >
                                {MONTHS_PL[vm]} {vy}
                            </button>
                            <button
                                onClick={() => setViewMonth(new Date(vy, vm + 1, 1))}
                                aria-label="Następny miesiąc"
                                className="p-2 hover:bg-surface-raised rounded-xl transition-colors active:scale-95"
                            >
                                <ChevronRight className="w-4 h-4 text-foreground" />
                            </button>
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                            {['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'].map(d => (
                                <div key={d} className="text-[9px] font-bold text-muted/40 text-center py-2 uppercase">{d}</div>
                            ))}
                            {monthCells.map((d, i) => {
                                if (!d) return <div key={`blank-${i}`} />;
                                const iso = cellISO(d);
                                const isSel = calendar.selectedDate === iso;
                                const dayHasTasks = (jobs.allDeals || []).some(job => job.scheduledDate?.startsWith(iso));
                                return (
                                    <button
                                        key={iso}
                                        onClick={() => {
                                            setSelectedDate(iso);
                                            toggleCalendarExpanded();
                                        }}
                                        className={cn(
                                            "relative aspect-square flex items-center justify-center rounded-xl text-xs font-bold transition-all",
                                            isSel ? "bg-primary text-white shadow-glow" : "text-foreground hover:bg-surface-raised"
                                        )}
                                    >
                                        {d}
                                        {dayHasTasks && (
                                            <span className={cn(
                                                "absolute bottom-1 w-1 h-1 rounded-full",
                                                isSel ? "bg-white" : "bg-primary/50"
                                            )} />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};
