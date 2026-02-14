import { useQuery } from '../react-query.ts';
import { quoteService } from '../../services/quoteService.ts';
import { useAuth } from '../auth.tsx';
import { Quote } from '../../types/entities.ts';

export const useQuoteDetails = (quoteId: string | undefined, ownerId?: string) => {
    const { user } = useAuth();
    const loggedInUid = user?.uid;
    const resolvedOwnerId = ownerId || loggedInUid;
    
    return useQuery<Quote>({
        queryKey: ['quoteDetails', resolvedOwnerId ?? null, quoteId ?? null],
        queryFn: () => quoteService.getQuoteById({ quoteId: quoteId!, ownerId: resolvedOwnerId }),
        enabled: !!quoteId && !!resolvedOwnerId,
    });
};
