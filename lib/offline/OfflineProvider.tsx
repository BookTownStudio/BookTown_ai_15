
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { offlineQueue, QueueItem } from './offlineQueue.ts';
import { useToast } from '../../store/toast.tsx';

interface OfflineContextType {
    isOffline: boolean;
    isSyncing: boolean;
    pendingCount: number;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

export const OfflineProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isOffline, setIsOffline] = useState(!navigator.onLine);
    const [isSyncing, setIsSyncing] = useState(false);
    const [pendingCount, setPendingCount] = useState(0);
    const { showToast } = useToast();

    useEffect(() => {
        const updateCount = () => setPendingCount(offlineQueue.getAll().length);
        updateCount();
        const interval = setInterval(updateCount, 2000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const handleOnline = () => {
            setIsOffline(false);
            processQueue();
        };
        const handleOffline = () => {
            setIsOffline(true);
            showToast("You are offline. Changes will be saved locally.");
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const processQueue = async () => {
        if (isSyncing) return;
        
        const queue = offlineQueue.getAll();
        if (queue.length === 0) return;

        setIsSyncing(true);
        showToast("Back online. Syncing changes...");

        await offlineQueue.process(async (item: QueueItem) => {
            console.log(`[Sync] Processing ${item.type} for ${item.entity}`, item.payload);
            await new Promise(resolve => setTimeout(resolve, 500)); // Simulate sync
        });

        setIsSyncing(false);
        setPendingCount(0);
        showToast("Sync complete.");
    };

    return (
        <OfflineContext.Provider value={{ isOffline, isSyncing, pendingCount }}>
            {children}
        </OfflineContext.Provider>
    );
};

export const useOffline = () => {
    const context = useContext(OfflineContext);
    if (!context) throw new Error("useOffline must be used within OfflineProvider");
    return context;
};
