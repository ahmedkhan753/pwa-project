"use client";

import { useState, useEffect } from "react";

interface TireSpec {
    width: string;
    profile: string;
    diameter: string;
    index: string;
}

interface TireSpecLockProps {
    value: string; // The full string: "205/55 R16 91V" or similar
    onChange: (value: string) => void;
    label: string;
}

export function TireSpecLock({ value, onChange, label }: TireSpecLockProps) {
    // Parse the initial value
    // expected format: "205 / 55 / R / 16 / 91V"
    const parts = value.split(" / ");
    
    const [spec, setSpec] = useState<TireSpec>({
        width: parts[0] || "",
        profile: parts[1] || "",
        diameter: parts[3] || "",
        index: parts[4] || ""
    });

    useEffect(() => {
        const parts = value.split(" / ");
        setSpec({
            width: parts[0] || "",
            profile: parts[1] || "",
            diameter: parts[3] || "",
            index: parts[4] || ""
        });
    }, [value]);

    const updateSpec = (field: keyof TireSpec, val: string) => {
        const newSpec = { ...spec, [field]: val };
        setSpec(newSpec);
        
        // Construct the locked string: "Width / Profile / R / Diameter / Index"
        const fullString = `${newSpec.width || "?"} / ${newSpec.profile || "?"} / R / ${newSpec.diameter || "?"} / ${newSpec.index || "?"}`;
        onChange(fullString);
    };

    return (
        <div className="col-span-2 space-y-2">
            <label className="text-[10px] font-black text-muted uppercase tracking-widest block px-1">
                {label}
            </label>
            
            <div className="flex items-center gap-1 bg-surface-raised p-1.5 rounded-2xl border-2 border-border shadow-inner">
                {/* Width */}
                <input
                    type="text"
                    inputMode="numeric"
                    placeholder="205"
                    value={spec.width}
                    onChange={(e) => updateSpec("width", e.target.value)}
                    className="w-14 py-2 text-center bg-surface rounded-xl text-sm font-black text-primary focus:ring-2 focus:ring-primary outline-none shadow-sm"
                />
                <span className="text-muted/40 font-black">/</span>
                
                {/* Profile */}
                <input
                    type="text"
                    inputMode="numeric"
                    placeholder="55"
                    value={spec.profile}
                    onChange={(e) => updateSpec("profile", e.target.value)}
                    className="w-12 py-2 text-center bg-surface rounded-xl text-sm font-black text-primary focus:ring-2 focus:ring-primary outline-none shadow-sm"
                />
                <span className="text-muted/40 font-black">/</span>
                
                {/* R (Locked) */}
                <div className="w-8 py-2 text-center bg-surface-raised rounded-xl text-sm font-black text-muted/40 cursor-not-allowed">
                    R
                </div>
                <span className="text-muted/40 font-black">/</span>
                
                {/* Diameter */}
                <input
                    type="text"
                    inputMode="numeric"
                    placeholder="16"
                    value={spec.diameter}
                    onChange={(e) => updateSpec("diameter", e.target.value)}
                    className="w-12 py-2 text-center bg-surface rounded-xl text-sm font-black text-primary focus:ring-2 focus:ring-primary outline-none shadow-sm"
                />
                <span className="text-muted/40 font-black">/</span>
                
                {/* Index */}
                <input
                    type="text"
                    placeholder="91V"
                    value={spec.index}
                    onChange={(e) => updateSpec("index", e.target.value.toUpperCase())}
                    className="flex-1 min-w-0 py-2 text-center bg-surface rounded-xl text-sm font-black text-primary focus:ring-2 focus:ring-primary outline-none shadow-sm"
                />
            </div>
        </div>
    );
}
