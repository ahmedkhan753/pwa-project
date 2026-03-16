"use client";

import { cn } from "@/lib/utils";
import type { ToggleValue } from "@/store/useInspectionStore";

interface ToggleOption {
    label: string;
    value: string;
    colorClass: string;
    activeColor: string;
}

interface InspectionToggleProps {
    value: ToggleValue;
    onChange: (value: any) => void;
    label: string;
    options?: ToggleOption[];
    compact?: boolean;
}

const DEFAULT_OPTIONS: ToggleOption[] = [
    { label: 'TAK', value: 'TAK', colorClass: 'bg-success', activeColor: 'text-white' },
    { label: 'NIE', value: 'NIE', colorClass: 'bg-danger', activeColor: 'text-white' },
    { label: 'ND', value: 'ND', colorClass: 'bg-muted', activeColor: 'text-white' },
];

export function InspectionToggle({ value, onChange, label, options = DEFAULT_OPTIONS, compact }: InspectionToggleProps) {
    return (
        <div className={cn("flex flex-col gap-2", compact ? "mb-4" : "mb-6")}>
            <span className={cn(
                "font-black text-muted uppercase tracking-widest px-1",
                compact ? "text-[10px]" : "text-xs"
            )}>
                {label}
            </span>
            <div className="flex bg-surface-raised p-1.5 rounded-2xl gap-1.5 w-full">
                {options.map((opt) => (
                    <button
                        key={opt.value}
                        onClick={() => onChange(opt.value)}
                        aria-label={`${label}: ${opt.label}`}
                        className={cn(
                            "flex-1 rounded-xl font-black transition-all duration-200 active:scale-95 py-3.5 px-2 text-sm",
                            value === opt.value
                                ? `${opt.colorClass} ${opt.activeColor} shadow-lg shadow-black/10`
                                : "text-muted/40 hover:text-muted"
                        )}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
