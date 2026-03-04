import { devLog } from '../logging/devLog';

export type QueueItem = {
    id: string;
    type: 'create' | 'update' | 'delete';
    entity: 'post' | 'shelf' | 'project' | 'review' | 'bookmark' | 'quote' | 'venue';
    payload: any;
    timestamp: number;
};

const QUEUE_KEY = 'booktown_offline_queue';

export const offlineQueue = {
    add: (item: Omit<QueueItem, 'id' | 'timestamp'>) => {
        const queue = offlineQueue.getAll();
        const newItem: QueueItem = {
            ...item,
            id: `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
        };
        queue.push(newItem);
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
        return newItem;
    },

    getAll: (): QueueItem[] => {
        try {
            const stored = localStorage.getItem(QUEUE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            return [];
        }
    },

    remove: (id: string) => {
        const queue = offlineQueue.getAll();
        const newQueue = queue.filter(item => item.id !== id);
        localStorage.setItem(QUEUE_KEY, JSON.stringify(newQueue));
    },

    clear: () => {
        localStorage.removeItem(QUEUE_KEY);
    },
    
    process: async (processItem: (item: QueueItem) => Promise<void>) => {
        const queue = offlineQueue.getAll();
        if (queue.length === 0) return;

        devLog(`[OfflineQueue] Processing ${queue.length} items...`);
        
        for (const item of queue) {
            try {
                await processItem(item);
                offlineQueue.remove(item.id);
            } catch (error) {
                console.error(`[OfflineQueue] Failed to process item ${item.id}`, error);
            }
        }
    }
};