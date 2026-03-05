"use client";

import { cn } from "@/lib/utils";

interface InspectionToggleProps {
    value: 'TAK' | 'NIE' | 'ND' | null;
    onChange: (value: 'TAK' | 'NIE' | 'ND') => void;
    label: string;
}

export function InspectionToggle({ value, onChange, label }: InspectionToggleProps) {
    const options = ['TAK', 'NIE', 'ND'] as const;

    return (
        <div className="flex flex-col gap-2 mb-4">
            <span className="text-sm font-semibold text-gray-700">{label}</span>
            <div className="flex bg-gray-100 p-1 rounded-xl">
                {options.map((option) => (
                    <button
                        key={option}
                        onClick={() => onChange(option)}
                        className={cn(
                            "flex-1 py-3 px-4 rounded-lg font-bold transition-all duration-200",
                            value === option
                                ? "bg-white shadow-sm text-blue-600 scale-[1.02]"
                                : "text-gray-500 hover:text-gray-700"
                        )}
                    >
                        {option}
                    </button>
                ))}
            </div>
        </div>
    );
}
