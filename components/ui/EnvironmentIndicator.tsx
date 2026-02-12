
import React, { useState, useEffect } from 'react';
import BilingualText from './BilingualText.tsx';
import { cn } from '../../lib/utils.ts';

const EnvironmentIndicator: React.FC = () => {
    // Detect environment
    const env = (import.meta && import.meta.env) ? import.meta.env : {} as any;
    const isMock = env.VITE_FORCE_MOCK === 'true';
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isDemo = window.location.hostname.includes('aistudio');
    
    // In strict production (real firebase, not forced mock), we usually don't show a badge,
    // unless we want to show "Beta".
    
    if (!isMock && !isLocal && !isDemo) return null;

    let label = '';
    let colorClass = '';

    if (isMock) {
        label = 'MOCK MODE';
        colorClass = 'bg-amber-500 text-black';
    } else if (isLocal) {
        label = 'LOCAL DEV';
        colorClass = 'bg-blue-500 text-white';
    } else if (isDemo) {
        label = 'AI STUDIO DEMO';
        colorClass = 'bg-purple-500 text-white';
    }

    return (
        <div className={cn(
            "fixed bottom-2 right-2 z-[60] px-2 py-1 rounded text-[10px] font-bold shadow-lg opacity-70 hover:opacity-100 pointer-events-none select-none uppercase tracking-wider",
            colorClass
        )}>
            {label}
        </div>
    );
};

export default EnvironmentIndicator;
