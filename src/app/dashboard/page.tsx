'use client';

import React, { useEffect, useState } from 'react';
import { useInspectionStore } from '@/store/useInspectionStore';
import { WizardLayout } from '@/components/ui/inspection/WizardLayout';
import { StepDispatcher } from '@/components/ui/inspection/StepDispatcher';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { SplashScreen } from '@/components/SplashScreen';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
    const { auth, jobs, _hasHydrated } = useInspectionStore();
    const [isClient, setIsClient] = useState(false);
    const router = useRouter();

    useEffect(() => {
        setIsClient(true);
    }, []);

    useEffect(() => {
        // Only redirect AFTER hydration is complete — otherwise the token isn't loaded yet
        if (isClient && _hasHydrated && !auth.isAuthenticated) {
            router.push('/');
        }
    }, [isClient, _hasHydrated, auth.isAuthenticated, router]);

    // Show loading until client-side AND hydration are both ready
    if (!isClient || !_hasHydrated || !auth.isAuthenticated) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
        );
    }

    // 2. Dashboard Layer (Job Selection)
    if (!jobs.currentJobId) {
        return <Dashboard />;
    }

    // 3. Inspection Wizard (The 11-Step Form)
    return (
        <>
            <SplashScreen />
            <ErrorBoundary>
                <WizardLayout>
                    <StepDispatcher />
                </WizardLayout>
            </ErrorBoundary>
        </>
    );
}
