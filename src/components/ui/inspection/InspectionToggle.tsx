"use client";

import { cn } from "@/lib/utils";
import type { ToggleValue } from "@/store/useInspectionStore";

interface InspectionToggleProps {
    value: ToggleValue;
    onChange: (value: 'TAK' | 'NIE' | 'ND') => void;
    label: string;
    compact?: boolean;
}

export function InspectionToggle({ value, onChange, label, compact }: InspectionToggleProps) {
    const options: Array<{ val: 'TAK' | 'NIE' | 'ND'; color: string }> = [
        { val: 'TAK', color: 'toggle-tak' },
        { val: 'NIE', color: 'toggle-nie' },
        { val: 'ND', color: 'toggle-nd' },
    ];

    return (
        <div className={cn("flex items-center gap-3", compact ? "mb-2" : "mb-4")}>
            <span className={cn(
                "font-semibold text-foreground flex-1 min-w-0",
                compact ? "text-xs" : "text-sm"
            )}>
                {label}
            </span>
            <div className="flex bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg gap-0.5 flex-shrink-0">
                {options.map((opt) => (
                    <button
                        key={opt.val}
                        onClick={() => onChange(opt.val)}
                        aria-label={`${label}: ${opt.val}`}
                        className={cn(
                            "rounded-md font-bold transition-all duration-200 active:scale-95",
                            compact ? "py-1.5 px-2.5 text-xs" : "py-2 px-3 text-sm",
                            value === opt.val
                                ? opt.color
                                : "text-gray-400 hover:text-gray-600"
                        )}
                    >
                        {opt.val}
                    </button>
                ))}
            </div>
        </div>
    );
}
