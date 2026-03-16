'use client';

import React, { useEffect, useState } from 'react';
import { Logo } from './ui/Logo';
import { cn } from '@/lib/utils';

export const OfflineBanner: React.FC = () => {
    const [isOffline, setIsOffline] = useState(false);

    useEffect(() => {
        const updateStatus = () => setIsOffline(!navigator.onLine);
        window.addEventListener('online', updateStatus);
        window.addEventListener('offline', updateStatus);
        updateStatus();
        
        return () => {
            window.removeEventListener('online', updateStatus);
            window.removeEventListener('offline', updateStatus);
        };
    }, []);

    if (!isOffline) return null;

    return (
        <div className="fixed top-0 left-0 right-0 z-[70] bg-[#1F2937] text-white px-4 py-2 flex items-center justify-center gap-3 shadow-lg animate-slide-down">
            <Logo variant="icon" size="sm" />
            <span className="text-xs font-bold tracking-tight">
                Tryb offline — dane zostaną zsynchronizowane po przywróceniu połączenia.
            </span>
        </div>
    );
};
