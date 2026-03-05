import { WizardLayout } from "@/components/ui/inspection/WizardLayout";
import { StepDispatcher } from "@/components/ui/inspection/StepDispatcher";

export default function Home() {
    return (
        <WizardLayout>
            <StepDispatcher />
        </WizardLayout>
    );
}
