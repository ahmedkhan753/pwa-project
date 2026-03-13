'use client';

import React from 'react';
import { useInspectionStore } from '@/store/useInspectionStore';
import { ChevronDown, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export const CalendarStrip: React.FC = () => {
    const { calendar, setSelectedDate, toggleCalendarExpanded, jobs } = useInspectionStore();

    // Generate 7 days centered on today (or around the selected date)
    const getDays = () => {
        const days = [];
        const baseDate = new Date();
        // Shift to start 3 days ago to show a "strip"
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
        const isoString = date.toISOString().split('T')[0];
        return calendar.selectedDate === isoString;
    };

    const hasTasks = (date: Date) => {
        const isoString = date.toISOString().split('T')[0];
        // This is simplified; in a real app, we'd check a task map or cache
        return jobs.list.some(job => job.deadline === isoString);
    };

    const formatDate = (date: Date) => {
        const iso = date.toISOString().split('T')[0];
        setSelectedDate(iso);
    };

    return (
        <div className="space-y-4">
            {/* Header / Week Toggle */}
            <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-bold text-slate-200">
                        {new Date(calendar.selectedDate).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })}
                    </span>
                </div>
                <button 
                    onClick={toggleCalendarExpanded}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/50 hover:bg-slate-800 rounded-full transition-colors group"
                >
                    <span className="text-[10px] font-bold uppercase text-slate-400 group-hover:text-blue-400">Widok miesiąca</span>
                    <ChevronDown className={cn("w-3.5 h-3.5 text-slate-500 transition-transform", calendar.expanded && "rotate-180")} />
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
                                    active ? "bg-blue-600 text-white shadow-lg shadow-blue-900/40 scale-110 z-10" : "bg-slate-900/40 text-slate-500 hover:bg-slate-800/60"
                                )}
                            >
                                <span className={cn(
                                    "text-[9px] font-black uppercase mb-1 tracking-tighter",
                                    active ? "text-blue-100" : "text-slate-600"
                                )}>
                                    {date.toLocaleDateString('pl-PL', { weekday: 'short' }).replace('.', '')}
                                </span>
                                <span className="text-lg font-bold leading-none">
                                    {date.getDate()}
                                </span>
                                
                                {today && !active && (
                                    <div className="absolute -top-1 w-1 h-1 bg-blue-500 rounded-full" />
                                )}
                                
                                {hasTasks(date) && (
                                    <div className={cn(
                                        "absolute -bottom-1 w-1 h-1 rounded-full",
                                        active ? "bg-white" : "bg-blue-500/50"
                                    )} />
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Monthly View Placeholder (Minimal Implementation for Demo) */}
            {calendar.expanded && (
                <div className="bg-slate-900/80 backdrop-blur-2xl border border-slate-800 rounded-[2rem] p-4 animate-fade-in shadow-2xl">
                    <div className="grid grid-cols-7 gap-1">
                        {['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'].map(d => (
                            <div key={d} className="text-[9px] font-bold text-slate-600 text-center py-2 uppercase">{d}</div>
                        ))}
                        {/* Simplified Month Grid (only showing today's week + padding) */}
                        {Array.from({ length: 28 }).map((_, i) => {
                            const d = i + 1;
                            const isSel = parseInt(calendar.selectedDate.split('-')[2]) === d;
                            return (
                                <button 
                                    key={i} 
                                    onClick={() => {
                                        const date = new Date(calendar.selectedDate);
                                        date.setDate(d);
                                        formatDate(date);
                                        toggleCalendarExpanded();
                                    }}
                                    className={cn(
                                        "aspect-square flex items-center justify-center rounded-xl text-xs font-bold transition-all",
                                        isSel ? "bg-blue-600 text-white shadow-glow" : "text-slate-400 hover:bg-slate-800"
                                    )}
                                >
                                    {d}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
