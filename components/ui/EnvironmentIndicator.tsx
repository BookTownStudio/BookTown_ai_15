import React from 'react';
import { cn } from '../../lib/utils.ts';

const EnvironmentIndicator: React.FC = () => {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocal) return null;

    return (
        <div className={cn(
            "fixed bottom-2 right-2 z-[60] px-2 py-1 rounded text-[10px] font-bold shadow-lg opacity-70 hover:opacity-100 pointer-events-none select-none uppercase tracking-wider",
            "bg-blue-500 text-white"
        )}>
            LOCAL DEV
        </div>
    );
};

export default EnvironmentIndicator;
