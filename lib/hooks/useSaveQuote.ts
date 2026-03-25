
import { useMutation, useQueryClient } from '../react-query.ts';
import { quoteService } from '../../services/quoteService.ts';
import { useAuth } from '../auth.tsx';
import { socialActionRepository } from '../../services/socialActionRepository.ts';
import { BookmarkType } from '../../types/entities.ts';
import { queryKeys } from '../queryKeys.ts';

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

            if (params.type === 'quote') {
                await quoteService.toggleQuoteBookmark({
                    quoteId: params.entityId,
                    active: true,
                    ...(params.quoteOwnerId ? { quoteOwnerId: params.quoteOwnerId } : {}),
                });
                return;
            }

            await socialActionRepository.bookmark(params.entityId, uid, params.type);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.user.bookmarks(uid),
            });
        }
    });
};
