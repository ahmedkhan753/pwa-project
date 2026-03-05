"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { ProgressBar } from "./ProgressBar";
import { useRouter } from "next/navigation";

const STEPS = [
    "Vehicle Data", "Equipment", "Paint", "Tires", "Photos",
    "Exterior", "Interior", "Mech 1", "Mech 2", "Notes", "Summary"
];

export function WizardLayout({ children }: { children: React.ReactNode }) {
    const { currentStep, setStep, data } = useInspectionStore();
    const totalSteps = STEPS.length;

    const isStepValid = () => {
        if (currentStep === 1) {
            return !!data.vehicleData?.vin && !!data.vehicleData?.model;
        }
        // For other steps, we can add more validation
        return true;
    };

    const next = () => {
        if (currentStep < totalSteps) setStep(currentStep + 1);
    };

    const prev = () => {
        if (currentStep > 1) setStep(currentStep - 1);
    };

    return (
        <div className="flex flex-col min-h-screen max-w-lg mx-auto bg-white shadow-lg overflow-x-hidden">
            <header className="sticky top-0 z-10 bg-white p-4 border-b">
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-lg font-bold">Step {currentStep}: {STEPS[currentStep - 1]}</h2>
                    <span className="text-sm font-medium text-gray-500">{currentStep} / {totalSteps}</span>
                </div>
                <ProgressBar currentStep={currentStep} totalSteps={totalSteps} />
            </header>

            <main className="flex-1 p-4 overflow-y-auto pb-24">
                {children}
            </main>

            <footer className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white/80 backdrop-blur-md p-4 border-t flex justify-between gap-4">
                <button
                    onClick={prev}
                    disabled={currentStep === 1}
                    className="flex-1 py-3 px-4 rounded-xl font-semibold border border-gray-300 disabled:opacity-30 active:bg-gray-100 transition-colors"
                >
                    Previous
                </button>
                <button
                    onClick={next}
                    disabled={!isStepValid()}
                    className="flex-1 py-3 px-4 rounded-xl font-semibold bg-blue-600 text-white disabled:bg-gray-300 disabled:text-gray-500 active:bg-blue-700 transition-colors"
                >
                    {currentStep === totalSteps ? "Finish" : "Next"}
                </button>
            </footer>
        </div>
    );
}
