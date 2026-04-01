'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface LogoProps {
    variant?: 'full' | 'icon';
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

// Red used for "R" and "RZECZOZNAWCY" — always visible on any bg
const RED = '#e53e3e';
// Heavy condensed font stack — Impact is the closest widely-available match
const FONT = "Impact, 'Arial Black', 'Helvetica Neue', sans-serif";

/**
 * Inline SVG logo — uses `currentColor` for Z / "ZAUFAJ" text so it
 * adapts automatically to any background via CSS `color` on the parent:
 *   dark bg  → set color:white  (text-white / style={{ color:'white' }})
 *   light bg → set color:#0f172a (text-foreground)
 * "R" and "RZECZOZNAWCY" are always red regardless.
 */
export const Logo: React.FC<LogoProps> = ({
    variant = 'full',
    size = 'md',
    className,
}) => {
    if (variant === 'icon') {
        const px = { sm: 30, md: 38, lg: 54 }[size];
        return (
            <svg
                width={px}
                height={px}
                viewBox="0 0 115 100"
                xmlns="http://www.w3.org/2000/svg"
                className={cn('shrink-0', className)}
                aria-label="Zaufaj Rzeczoznawcy"
            >
                <text x="3" y="88" fontFamily={FONT} fontSize="85" fill="currentColor">Z</text>
                <text x="57" y="88" fontFamily={FONT} fontSize="85" fill={RED}>R</text>
            </svg>
        );
    }

    const w = { sm: 120, md: 180, lg: 260 }[size];
    const h = { sm: 38, md: 56, lg: 82 }[size];

    return (
        <svg
            width={w}
            height={h}
            viewBox="0 0 320 100"
            xmlns="http://www.w3.org/2000/svg"
            className={cn('shrink-0', className)}
            aria-label="Zaufaj Rzeczoznawcy"
        >
            {/* ZR monogram */}
            <text x="5"  y="90" fontFamily={FONT} fontSize="90" fill="currentColor">Z</text>
            <text x="62" y="90" fontFamily={FONT} fontSize="90" fill={RED}>R</text>

            {/* Brand name — two lines right of the monogram */}
            <text x="132" y="44" fontFamily={FONT} fontSize="36" fill="currentColor">ZAUFAJ</text>
            <text x="132" y="92" fontFamily={FONT} fontSize="24" fill={RED}>RZECZOZNAWCY</text>
        </svg>
    );
};
