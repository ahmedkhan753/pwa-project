'use client';

import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface LogoProps {
    variant?: 'full' | 'icon';
    size?: 'sm' | 'md' | 'lg';
    className?: string;
    /**
     * Set to true when the logo sits on an always-dark background
     * (e.g. splash screen). Applies the invert filter unconditionally
     * instead of only in dark-mode.
     */
    darkBg?: boolean;
}

/**
 * Original brand PNG, never modified.
 * On dark backgrounds the CSS filter `invert(1) hue-rotate(180deg)`:
 *   white bg  → black  (blends into dark surface, invisible)
 *   black Z   → white  (fully visible)
 *   red R     → red    (hue-rotate cancels the invert on reds)
 * In light mode no filter is applied — the PNG shows exactly as designed.
 */
export const Logo: React.FC<LogoProps> = ({
    variant = 'full',
    size = 'md',
    className,
    darkBg = false,
}) => {
    const dims = {
        sm: variant === 'icon' ? { w: 32,  h: 32  } : { w: 100, h: 40  },
        md: variant === 'icon' ? { w: 40,  h: 40  } : { w: 150, h: 60  },
        lg: variant === 'icon' ? { w: 52,  h: 52  } : { w: 220, h: 88  },
    }[size];

    return (
        <Image
            src="/images/logo.png"
            alt="Zaufaj Rzeczoznawcy"
            width={dims.w}
            height={dims.h}
            priority
            className={cn(
                'object-contain block shrink-0',
                // logo-img → filtered only inside .dark (theme-adaptive)
                // logo-img-dark-bg → always filtered (splash / forced dark bg)
                darkBg ? 'logo-img-dark-bg' : 'logo-img',
                className,
            )}
        />
    );
};
