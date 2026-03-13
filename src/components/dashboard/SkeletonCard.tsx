'use client';

import React from 'react';

export const SkeletonCard: React.FC = () => {
    return (
        <div className="bg-slate-900/40 border border-slate-800/50 rounded-3xl p-5 shadow-xl shimmer">
            <div className="flex justify-between items-start mb-4">
                <div className="h-6 w-20 bg-slate-800 rounded-full" />
                <div className="h-4 w-12 bg-slate-800/50 rounded" />
            </div>

            <div className="h-7 w-3/4 bg-slate-800 rounded mb-2" />
            
            <div className="grid grid-cols-2 gap-y-3 mb-6">
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-slate-800" />
                    <div className="h-4 w-24 bg-slate-800 rounded" />
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-slate-800" />
                    <div className="h-4 w-20 bg-slate-800 rounded" />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="h-12 bg-slate-800/50 rounded-2xl" />
                <div className="h-12 bg-slate-800/50 rounded-2xl" />
            </div>
        </div>
    );
};
