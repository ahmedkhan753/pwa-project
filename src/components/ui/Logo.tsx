'use client';

import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface LogoProps {
    variant?: 'full' | 'icon';
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

/**
 * Original brand logo (PNG) preserved exactly as designed.
 * The PNG is black + red on white, so we wrap it in a white
 * rounded container — this makes it visible on any background
 * (dark or light) without altering the brand mark at all.
 */
export const Logo: React.FC<LogoProps> = ({
    variant = 'full',
    size = 'md',
    className,
}) => {
    const imgSizes = {
        sm: variant === 'icon' ? { w: 28, h: 28 } : { w: 90,  h: 36  },
        md: variant === 'icon' ? { w: 36, h: 36 } : { w: 150, h: 60  },
        lg: variant === 'icon' ? { w: 52, h: 52 } : { w: 220, h: 88  },
    }[size];

    return (
        <div
            className={cn('inline-flex items-center justify-center shrink-0', className)}
            style={{
                backgroundColor: '#ffffff',
                borderRadius: variant === 'icon' ? '10px' : '14px',
                padding: variant === 'icon' ? '4px' : '6px 10px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
            }}
        >
            <Image
                src="/images/logo.png"
                alt="Zaufaj Rzeczoznawcy"
                width={imgSizes.w}
                height={imgSizes.h}
                style={{ objectFit: 'contain', display: 'block' }}
                priority
            />
        </div>
    );
};
