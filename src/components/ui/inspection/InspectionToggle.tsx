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
    /** Adds a red asterisk after the label. Purely visual — no behavior change. */
    required?: boolean;
    /** Renders the red ring + "To pole jest wymagane" error text below the toggle. */
    invalid?: boolean;
    /** Element id on the outer wrapper so callers can scrollIntoView() the field. */
    id?: string;
}

const DEFAULT_OPTIONS: ToggleOption[] = [
    { label: 'TAK', value: 'TAK', colorClass: 'bg-success', activeColor: 'text-white' },
    { label: 'NIE', value: 'NIE', colorClass: 'bg-danger', activeColor: 'text-white' },
    { label: 'ND', value: 'ND', colorClass: 'bg-muted', activeColor: 'text-white' },
];

export function InspectionToggle({ value, onChange, label, options = DEFAULT_OPTIONS, compact, required, invalid, id }: InspectionToggleProps) {
    return (
        <div id={id} className={cn("flex flex-col gap-2 scroll-mt-24", compact ? "mb-4" : "mb-6")}>
            <span className={cn(
                "font-black text-muted uppercase tracking-widest px-1",
                compact ? "text-[10px]" : "text-xs"
            )}>
                {label}
                {required && <span className="ml-1 text-danger" aria-hidden="true">*</span>}
            </span>
            <div className={cn(
                "flex bg-surface-raised p-1.5 rounded-2xl gap-1.5 w-full",
                invalid && "ring-2 ring-danger ring-offset-1 ring-offset-background",
            )}>
                {options.map((opt) => (
                    <button
                        key={opt.value}
                        onClick={() => onChange(opt.value)}
                        aria-label={`${label}: ${opt.label}`}
                        aria-invalid={invalid || undefined}
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
            {invalid && (
                <span className="text-danger text-xs font-bold px-1" role="alert">
                    To pole jest wymagane
                </span>
            )}
        </div>
    );
}
