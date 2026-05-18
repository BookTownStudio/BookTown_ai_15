import { devLog } from '../logging/devLog';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { offlineQueue, QueueItem } from './offlineQueue.ts';
import { useToast } from '../../store/toast.tsx';
import { readerSyncQueue } from '../reader/offline/readerSyncQueue.ts';
import { flushReaderOperations } from '../reader/offline/readerSyncClient.ts';
import { markReaderTelemetry, reportReaderDiagnostic } from '../reader/runtime/readerTelemetry.ts';

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
        const updateCount = () =>
            setPendingCount(offlineQueue.getAll().length + readerSyncQueue.count());
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
        const readerQueueSize = readerSyncQueue.count();
        markReaderTelemetry('offline_queue_size', {
            genericQueueSize: queue.length,
            readerQueueSize,
        });
        if (queue.length === 0 && readerQueueSize === 0) return;

        setIsSyncing(true);
        showToast("Back online. Syncing changes...");
        const startedAt = performance.now();

        try {
            if (queue.length > 0) {
                await offlineQueue.process(async (item: QueueItem) => {
                    devLog(`[Sync] Processing ${item.type} for ${item.entity}`, item.payload);
                    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate sync
                });
            }

            if (readerQueueSize > 0) {
                const result = await flushReaderOperations({
                    batchSize: 20,
                    maxBatches: 5,
                });
                markReaderTelemetry('sync_failure_rate', {
                    accepted: result.accepted,
                    rejected: result.rejected,
                    failureRate: result.accepted > 0 ? result.rejected / result.accepted : 0,
                });
                void reportReaderDiagnostic({
                    eventName: 'reader_replay_flush',
                    severity: result.rejected > 0 ? 'warn' : 'info',
                    payload: {
                        accepted: result.accepted,
                        applied: result.applied,
                        deduped: result.deduped,
                        rejected: result.rejected,
                        failureRate: result.accepted > 0 ? result.rejected / result.accepted : 0,
                        queueSize: readerQueueSize,
                        remainingQueueSize: readerSyncQueue.count(),
                    },
                });
            }
        } catch (error) {
            console.warn('[OfflineProvider][READER_SYNC_FAILED]', error);
            markReaderTelemetry('sync_failure_rate', {
                accepted: readerQueueSize,
                rejected: readerQueueSize,
                failureRate: readerQueueSize > 0 ? 1 : 0,
            });
            void reportReaderDiagnostic({
                eventName: 'reader_replay_failed',
                severity: 'error',
                payload: {
                    queueSize: readerQueueSize,
                    remainingQueueSize: readerSyncQueue.count(),
                    phase: 'offline_replay',
                },
            });
        } finally {
            markReaderTelemetry('offline_flush_time', {
                durationMs: Number((performance.now() - startedAt).toFixed(2)),
                remainingReaderQueueSize: readerSyncQueue.count(),
            });
            setIsSyncing(false);
            setPendingCount(offlineQueue.getAll().length + readerSyncQueue.count());
            showToast("Sync complete.");
        }
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
