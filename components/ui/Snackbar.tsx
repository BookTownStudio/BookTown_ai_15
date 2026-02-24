import React from 'react';
import { cn } from '../../lib/utils.ts';

interface SnackbarProps {
    isVisible: boolean;
    message: string;
    actionLabel?: string;
    onAction?: () => void;
}

const Snackbar: React.FC<SnackbarProps> = ({
    isVisible,
    message,
    actionLabel,
    onAction,
}) => {
    return (
        <div
            className={cn(
                'fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] transition-all duration-300 ease-in-out',
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'
            )}
            role="status"
            aria-live="polite"
        >
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-900/95 px-4 py-2.5 text-white shadow-xl backdrop-blur">
                <span className="text-sm font-medium">{message}</span>
                {actionLabel && onAction && (
                    <button
                        type="button"
                        onClick={onAction}
                        className="text-sm font-semibold text-accent hover:text-accent/80 transition-colors"
                    >
                        {actionLabel}
                    </button>
                )}
            </div>
        </div>
    );
};

export default Snackbar;
