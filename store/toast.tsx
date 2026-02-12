import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';
import { cn } from '../lib/utils.ts';

interface ToastContextType {
    showToast: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

interface ToastProviderProps {
    children: React.ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
    const [message, setMessage] = useState<string | null>(null);
    const [isVisible, setIsVisible] = useState(false);

    const showToast = useCallback((msg: string) => {
        setMessage(msg);
        setIsVisible(true);
        setTimeout(() => {
            setIsVisible(false);
        }, 2500); // Fade out after 2.5s
        setTimeout(() => {
            setMessage(null);
        }, 3000); // Remove from DOM after fade out
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            {message && (
                <div
                    className={cn(
                        'fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-slate-800 text-white text-sm shadow-lg transition-all duration-300 ease-in-out',
                        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                    )}
                >
                    {message}
                </div>
            )}
        </ToastContext.Provider>
    );
};

export const useToast = (): ToastContextType => {
    const context = useContext(ToastContext);
    if (context === undefined) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};
