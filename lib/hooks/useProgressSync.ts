import { useMutation, useQueryClient } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';

interface SyncProgressVariables {
    bookId: string;
    progress: {
        currentSegmentIndex: number;
        currentTime: number;
        totalProgressPercent: number;
        timestamp: string;
    };
}

export const useProgressSync = () => {
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: ({ bookId, progress }: SyncProgressVariables) => {
            if (!uid) return Promise.resolve(); // Silent fail if guest
            return dataService.users.saveReadingProgress(uid, bookId, progress);
        },
    });
};