'use client';

import React, { useEffect, useState } from 'react';
import { useInspectionStore } from '@/store/useInspectionStore';
import { WizardLayout } from '@/components/ui/inspection/WizardLayout';
import { StepDispatcher } from '@/components/ui/inspection/StepDispatcher';
import { LoginForm } from '@/components/auth/LoginForm';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { Loader2 } from 'lucide-react';

export default function Home() {
    const { auth, jobs } = useInspectionStore();
    const [isClient, setIsClient] = useState(false);

    // Hydration fix for Persist middleware
    useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center transition-colors duration-300">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
        );
    }

    // 1. Authentication Layer (Gatekeeper)
    if (!auth.isAuthenticated) {
        return <LoginForm />;
    }

    // 2. Dashboard Layer (Job Selection)
    if (!jobs.currentJobId) {
        return <Dashboard />;
    }

    // 3. Inspection Wizard (The 11-Step Form)
    return (
        <WizardLayout>
            <StepDispatcher />
        </WizardLayout>
    );
}
