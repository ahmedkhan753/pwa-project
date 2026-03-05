"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { VehicleDataStep } from "./steps/VehicleDataStep";
import { TiresStep } from "./steps/TiresStep";
import {
    EquipmentStep, PaintStep, PhotosStep, ExteriorStep,
    InteriorStep, Mech1Step, Mech2Step, NotesStep, SummaryStep
} from "./steps/Placeholders";

export function StepDispatcher() {
    const { currentStep } = useInspectionStore();

    switch (currentStep) {
        case 1: return <VehicleDataStep />;
        case 2: return <EquipmentStep />;
        case 3: return <PaintStep />;
        case 4: return <TiresStep />;
        case 5: return <PhotosStep />;
        case 6: return <ExteriorStep />;
        case 7: return <InteriorStep />;
        case 8: return <Mech1Step />;
        case 9: return <Mech2Step />;
        case 10: return <NotesStep />;
        case 11: return <SummaryStep />;
        default: return <VehicleDataStep />;
    }
}
