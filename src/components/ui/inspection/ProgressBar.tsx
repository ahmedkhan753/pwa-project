import { cn } from "@/lib/utils";

interface ProgressBarProps {
    currentStep: number;
    totalSteps: number;
}

export function ProgressBar({ currentStep, totalSteps }: ProgressBarProps) {
    const progress = (currentStep / totalSteps) * 100;

    return (
        <div className="w-full bg-gray-200 h-2.5 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
                className="bg-blue-600 h-2.5 transition-all duration-300 ease-in-out"
                style={{ width: `${progress}%` }}
            ></div>
        </div>
    );
}
