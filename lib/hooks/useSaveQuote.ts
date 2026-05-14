
import { useMutation, useQueryClient } from '../react-query.ts';
import { quoteService } from '../../services/quoteService.ts';
import { useAuth } from '../auth.tsx';
import { BookmarkType } from '../../types/entities.ts';
import { queryKeys } from '../queryKeys.ts';
import { dataService } from '../../services/dataService.ts';
import { invalidateBookmarkConvergence } from '../socialCacheReconciliation.ts';

export const useSaveQuote = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: async ({ quoteId, ownerId }: { quoteId: string; ownerId: string }) => {
            if (!uid) throw new Error("Not authenticated");
            return quoteService.saveQuoteFromReference({
                sourceOwnerId: ownerId,
                sourceQuoteId: quoteId,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.user.quotes(uid),
            });
        }
    });
};

interface SaveBookmarkParams {
    entityId: string;
    type: BookmarkType;
    quoteOwnerId?: string;
}

export const useSaveBookmark = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;
    
    return useMutation({
        mutationFn: async (params: SaveBookmarkParams) => {
            if (!uid) throw new Error("Not authenticated");

            if (params.type === 'attachment') {
                throw new Error("Unsupported bookmark type");
            }

            await dataService.social.toggleBookmark(
                uid,
                params.entityId,
                params.type,
                true,
                params.quoteOwnerId
            );
        },
        onSuccess: async (_result, params) => {
            await invalidateBookmarkConvergence(queryClient, uid, params.type, params.entityId);
        }
    });
};
