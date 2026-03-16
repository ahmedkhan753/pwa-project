'use client';

import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface LogoProps {
    variant?: 'full' | 'icon';
    size?: 'sm' | 'md' | 'lg';
    className?: string;
    onLightBackground?: boolean;
}

export const Logo: React.FC<LogoProps> = ({
    variant = 'full',
    size = 'md',
    className,
    onLightBackground = false
}) => {
    // Size guide based on requirements:
    // sm: icon=24px height, full=80px width
    // md: icon=32px height, full=140px width
    // lg: icon=48px height, full=220px width
    
    const dimensions = {
        sm: variant === 'icon' ? { height: 24, width: 24 } : { width: 80, height: 32 },
        md: variant === 'icon' ? { height: 32, width: 32 } : { width: 140, height: 56 },
        lg: variant === 'icon' ? { height: 48, width: 48 } : { width: 220, height: 88 },
    }[size];

    return (
        <div 
            className={cn(
                "relative flex items-center justify-center",
                onLightBackground && "bg-black rounded-lg p-1.5",
                className
            )}
            style={{ 
                height: variant === 'icon' ? dimensions.height : 'auto',
                width: variant === 'icon' ? dimensions.width : dimensions.width
            }}
        >
            <div 
                className="relative w-full h-full"
                style={{ 
                    aspectRatio: variant === 'icon' ? '1/1' : '2.5/1', // Approximate aspect ratio from the logo image
                }}
            >
                <Image
                    src="/images/logo.png"
                    alt="RZeczoznawcy Logo"
                    fill
                    className={cn(
                        "object-contain",
                        variant === 'icon' ? "object-left" : "object-center"
                    )}
                    // Crop logic for 'icon' variant:
                    // The "R" is on the left. We can use object-fit and absolute positioning
                    // to show only the "R" part if we want to avoid multiple files.
                    // But for a cleaner look, full logo is easier.
                    // Since it's a PNG on black, object-left with fixed width works for "R" icon.
                    style={variant === 'icon' ? {
                        objectPosition: '0% 50%',
                        transform: 'scale(1.8)', // Zoom into the 'R'
                        transformOrigin: 'left center'
                    } : {}}
                />
            </div>
        </div>
    );
};
