
import { useMutation, useQueryClient } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';

export const useSaveQuote = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: async (quoteId: string) => {
            if (!uid) throw new Error("Not authenticated");
            const quote = await dataService.users.getQuote('alex_doe', quoteId); // Assuming public quotes logic
            return dataService.users.saveQuote(uid, { ...quote });
        },
        onSuccess: () => {
            // FIX: Use invalidateQueries instead of invalidate.
            queryClient.invalidateQueries(['userQuotes', uid]);
        }
    });
};

export const useSaveBookmark = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;
    
    return useMutation({
        mutationFn: async (entityId: string) => {
            if (!uid) throw new Error("Not authenticated");
            // Placeholder: Bookmark logic would usually require type info or a more generic bookmark service
             throw new Error("Use specialized hooks or update useSaveBookmark to accept type");
        },
        onSuccess: () => {
            // FIX: Use invalidateQueries instead of invalidate.
            queryClient.invalidateQueries(['bookmarks', uid]);
        }
    });
};
