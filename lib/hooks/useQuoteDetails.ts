import { useQuery } from '../react-query.ts';
import { quoteService } from '../../services/quoteService.ts';
import { Quote } from '../../types/entities.ts';

export const useQuoteDetails = (quoteId: string | undefined, ownerId?: string) => {
    const resolvedOwnerId =
        typeof ownerId === 'string' && ownerId.trim().length > 0 ? ownerId.trim() : undefined;
    
    return useQuery<Quote>({
        queryKey: ['quoteDetails', quoteId ?? null, resolvedOwnerId ?? null],
        queryFn: () => quoteService.getQuoteById({ quoteId: quoteId!, ...(resolvedOwnerId ? { ownerId: resolvedOwnerId } : {}) }),
        enabled: !!quoteId,
    });
};
