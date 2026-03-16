"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { VehicleDataStep } from "./steps/VehicleDataStep";
import { EquipmentStep } from "./steps/EquipmentStep";
import { FullEquipmentStep } from "./steps/FullEquipmentStep";
import { PaintStep } from "./steps/PaintStep";
import { TiresStep } from "./steps/TiresStep";
import { PhotosStep } from "./steps/PhotosStep";
import { ExteriorDamageStep } from "./steps/ExteriorDamageStep";
import { InteriorDamageStep } from "./steps/InteriorDamageStep";
import { MechanicalStep } from "./steps/MechanicalStep";
import { NotesStep } from "./steps/NotesStep";
import { ValidationStep } from "./steps/ValidationStep";
import { SummaryStep } from "./steps/SummaryStep";

export function StepDispatcher() {
    const { currentStep } = useInspectionStore();

    switch (currentStep) {
        case 1: return <VehicleDataStep />;
        case 2: return <EquipmentStep />;
        case 3: return <FullEquipmentStep />;
        case 4: return <PaintStep />;
        case 5: return <TiresStep />;
        case 6: return <PhotosStep />;
        case 7: return <ExteriorDamageStep />;
        case 8: return <InteriorDamageStep />;
        case 9: return <MechanicalStep />;
        case 10: return <NotesStep />;
        case 11: return <ValidationStep />;
        case 12: return <SummaryStep />;
        default: return <VehicleDataStep />;
    }
}
