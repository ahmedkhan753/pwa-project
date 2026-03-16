"use client";

import { useState } from "react";

interface TireMaskInputProps {
    value: string;
    onChange: (value: string) => void;
    label: string;
}

export function TireMaskInput({ value, onChange, label }: TireMaskInputProps) {
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.replace(/[^0-9]/g, '');
        if (val.length > 2) val = val.substring(0, 2);

        if (val.length >= 1) {
            const first = val[0];
            const second = val[1] || '';
            val = second ? `${first},${second}` : first;
        }

        onChange(val);
    };

    return (
        <div className="flex flex-col gap-1 mb-4">
            <label className="text-xs font-bold text-muted uppercase tracking-wider">{label}</label>
            <input
                type="text"
                inputMode="decimal"
                value={value}
                onChange={handleInputChange}
                placeholder="X,X"
                className="text-2xl font-mono py-3 px-4 rounded-xl border-2 border-border bg-surface text-foreground focus:border-primary outline-none transition-colors"
            />
            <p className="text-[10px] text-muted/40">Format: 5,4 (mm)</p>
        </div>
    );
}
