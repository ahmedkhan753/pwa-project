"use client";

import { useState, useRef, useEffect } from "react";
import { Search, ChevronDown, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Option {
    label: string;
    value: string;
}

interface SmartDropdownProps {
    label: string;
    value: string;
    options: Option[];
    onChange: (value: string) => void;
    placeholder?: string;
    allowCustom?: boolean;
}

export function SmartDropdown({
    label,
    value,
    options,
    onChange,
    placeholder = "Wybierz...",
    allowCustom = true
}: SmartDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const containerRef = useRef<HTMLDivElement>(null);

    const filteredOptions = options.filter(opt =>
        opt.label.toLowerCase().includes(search.toLowerCase())
    );

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelect = (val: string) => {
        onChange(val);
        setIsOpen(false);
        setSearch("");
    };

    return (
        <div className="relative" ref={containerRef}>
            <label className="text-xs font-bold text-muted uppercase tracking-widest mb-1 block px-1">
                {label}
            </label>
            
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "w-full py-4 px-4 pr-10 rounded-2xl border-2 transition-all flex items-center justify-between text-left",
                    isOpen 
                        ? "border-primary bg-surface shadow-lg shadow-primary/10" 
                        : "border-border bg-surface"
                )}
            >
                <span className={cn(
                    "font-bold truncate",
                    value ? "text-foreground" : "text-muted/40"
                )}>
                    {value || placeholder}
                </span>
                <ChevronDown size={18} className={cn("text-muted/40 transition-transform", isOpen && "rotate-180")} />
            </button>

            {isOpen && (
                <div className="absolute z-[110] w-full mt-2 bg-surface border border-border rounded-2xl shadow-2xl animate-fade-in overflow-hidden">
                    {/* Search Input */}
                    <div className="p-3 border-b border-surface-raised sticky top-0 bg-surface z-10">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted/40" size={16} />
                            <input
                                autoFocus
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Szukaj..."
                                className="w-full py-2.5 pl-10 pr-4 bg-surface-raised border-none rounded-xl text-sm focus:ring-0 outline-none"
                            />
                        </div>
                    </div>

                    {/* Options List */}
                    <div className="max-h-60 overflow-y-auto p-1 py-2">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => handleSelect(opt.value)}
                                    className={cn(
                                        "w-full py-3 px-4 text-left text-sm transition-colors",
                                        value === opt.value
                                            ? "bg-primary-light text-primary font-bold" 
                                            : "hover:bg-surface-raised text-muted"
                                    )}
                                >
                                    <span>{opt.label}</span>
                                    {value === opt.value && <Check size={16} />}
                                </button>
                            ))
                        ) : (
                            <div className="p-8 text-center">
                                <p className="text-muted/40 text-sm">Brak wyników</p>
                                {allowCustom && search && (
                                    <button
                                        type="button"
                                        onClick={() => handleSelect(search)}
                                        className="mt-2 text-primary font-bold text-sm hover:underline"
                                    >
                                        Dodaj "{search}"
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
