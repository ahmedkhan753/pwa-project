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

    // Wrapping in a keyed div forces React to fully unmount the previous
    // step's DOM tree before mounting the new one.  This avoids the iOS
    // WebKit "insertBefore / removeChild" crash that occurs when React
    // tries to patch the DOM in-place across very different component trees.
    let content: React.ReactNode;
    switch (currentStep) {
        case 1:  content = <VehicleDataStep />;      break;
        case 2:  content = <EquipmentStep />;        break;
        case 3:  content = <FullEquipmentStep />;    break;
        case 4:  content = <PaintStep />;            break;
        case 5:  content = <TiresStep />;            break;
        case 6:  content = <PhotosStep />;           break;
        case 7:  content = <ExteriorDamageStep />;   break;
        case 8:  content = <InteriorDamageStep />;   break;
        case 9:  content = <MechanicalStep />;       break;
        case 10: content = <NotesStep />;            break;
        case 11: content = <ValidationStep />;       break;
        case 12: content = <SummaryStep />;          break;
        default: content = <VehicleDataStep />;      break;
    }

    return <div key={`step-${currentStep}`}>{content}</div>;
}

