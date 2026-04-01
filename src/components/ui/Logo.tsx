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

    // The logo PNG is black + red on white — always render on a white background
    // so the black "Z" and text remain visible on any page background (dark or light).
    return (
        <div
            className={cn(
                "relative flex items-center justify-center mx-auto overflow-visible",
                className
            )}
            style={{
                height: variant === 'icon' ? dimensions.height : 'auto',
                width: variant === 'icon' ? dimensions.width : dimensions.width
            }}
        >
            <div
                className="relative w-full h-full overflow-visible rounded-xl"
                style={{
                    aspectRatio: variant === 'icon' ? '1/1' : '2.5/1',
                    backgroundColor: '#ffffff',
                    padding: variant === 'icon' ? '2px' : '4px',
                }}
            >
                <Image
                    src="/images/logo.png"
                    alt="RZeczoznawcy Logo"
                    width={variant === 'icon' ? 40 : 140}
                    height={variant === 'icon' ? 40 : 56}
                    className={cn(
                        "object-contain w-full h-full",
                        variant === 'icon' ? "object-left" : "object-center"
                    )}
                    style={variant === 'icon' ? {
                        objectPosition: '0% 50%',
                        transform: 'scale(1.8)',
                        transformOrigin: 'left center'
                    } : {}}
                />
            </div>
        </div>
    );
};
