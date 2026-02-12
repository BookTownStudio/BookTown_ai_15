import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';
import { Quote } from '../../types/entities.ts';

export const useQuoteDetails = (quoteId: string | undefined, ownerId?: string) => {
    const { user } = useAuth();
    const loggedInUid = user?.uid;
    const finalUid = ownerId || loggedInUid;
    
    return useQuery<Quote>({
        queryKey: ['quoteDetails', finalUid, quoteId],
        queryFn: () => dataService.users.getQuote(finalUid!, quoteId!),
        enabled: !!finalUid && !!quoteId,
    });
};