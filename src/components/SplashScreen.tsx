'use client';

import React, { useEffect, useState } from 'react';
import { Logo } from './ui/Logo';
import { cn } from '@/lib/utils';

export const SplashScreen: React.FC = () => {
    const [isVisible, setIsVisible] = useState(true);
    const [shouldRender, setShouldRender] = useState(true);

    useEffect(() => {
        // Show for 2 seconds then start fade out
        const timer = setTimeout(() => {
            setIsVisible(false);
        }, 2000);

        // Remove from DOM after fade out animation (0.5s)
        const removeTimer = setTimeout(() => {
            setShouldRender(false);
        }, 2500);

        return () => {
            clearTimeout(timer);
            clearTimeout(removeTimer);
        };
    }, []);

    if (!shouldRender) return null;

    return (
        <div
            className={cn(
                "fixed inset-0 z-[100] bg-black flex items-center justify-center transition-opacity duration-500 ease-in-out",
                isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
            )}
        >
            <div className="animate-fade-in flex items-center justify-center" style={{
                backgroundColor: '#ffffff',
                borderRadius: '24px',
                padding: '28px 36px',
                boxShadow: '0 0 60px rgba(255,255,255,0.15)',
            }}>
                <Logo variant="full" size="lg" />
            </div>
        </div>
    );
};
