"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { CarSchema } from "../CarSchema";
import { Paintbrush } from "lucide-react";
import type { PaintZone } from "@/store/useInspectionStore";

export function PaintStep() {
    const { data, updateField } = useInspectionStore();
    const paint = data.paintMeasurement;

    const handleZoneUpdate = (zone: string, zoneData: PaintZone) => {
        updateField('paintMeasurement', zone, zoneData);
    };

    return (
        <div className="space-y-4 animate-fade-in">
            <div className="flex items-center gap-2 mb-2">
                <Paintbrush size={18} className="text-primary" />
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                    Pomiar Lakieru
                </h3>
            </div>
            <p className="text-xs text-secondary mb-4">
                Kliknij na element nadwozia aby wprowadzić grubość lakieru w µm.
            </p>
            <CarSchema paint={paint} onZoneUpdate={handleZoneUpdate} />
        </div>
    );
}
