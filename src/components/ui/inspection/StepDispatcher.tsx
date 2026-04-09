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
import { useState, useEffect, useTransition } from "react";

function stepContent(step: number): React.ReactNode {
    switch (step) {
        case 1:  return <VehicleDataStep />;
        case 2:  return <EquipmentStep />;
        case 3:  return <FullEquipmentStep />;
        case 4:  return <PaintStep />;
        case 5:  return <TiresStep />;
        case 6:  return <PhotosStep />;
        case 7:  return <ExteriorDamageStep />;
        case 8:  return <InteriorDamageStep />;
        case 9:  return <MechanicalStep />;
        case 10: return <NotesStep />;
        case 11: return <ValidationStep />;
        case 12: return <SummaryStep />;
        default: return <VehicleDataStep />;
    }
}

/**
 * StepDispatcher — iOS WebKit crash-safe step switcher.
 *
 * WHY: iOS WebKit crashes when React mutates a large DOM tree in-place during
 * a single synchronous rendering pass (removeChild / insertBefore race).
 *
 * FIX: We decouple the *store* step (what Zustand says) from the *displayed*
 * step (what is actually in the DOM).  On each store change we schedule the
 * DOM switch via requestAnimationFrame, which pushes it to the NEXT paint
 * cycle.  Combined with React's useTransition this makes the swap non-blocking
 * and gives WebKit time to settle its internal layout state before we modify
 * the DOM.  The result: no more removeChild crash on step transitions.
 */
export function StepDispatcher() {
    const currentStep = useInspectionStore((s) => s.currentStep);
    const [displayStep, setDisplayStep] = useState(currentStep);
    const [, startTransition] = useTransition();

    useEffect(() => {
        if (displayStep === currentStep) return;

        // Defer the actual DOM tree swap to the next animation frame.
        // This breaks the synchronous React reconciliation path that triggers
        // the iOS WebKit DOM crash on step transitions.
        const raf = requestAnimationFrame(() => {
            startTransition(() => {
                setDisplayStep(currentStep);
            });
        });
        return () => cancelAnimationFrame(raf);
    }, [currentStep]); // eslint-disable-line react-hooks/exhaustive-deps

    return <div key={`step-${displayStep}`}>{stepContent(displayStep)}</div>;
}
