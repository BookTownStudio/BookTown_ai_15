import { useQuery } from '../react-query.ts';
import { quoteService } from '../../services/quoteService.ts';
import { useAuth } from '../auth.tsx';
import { Quote } from '../../types/entities.ts';
import { queryKeys } from '../queryKeys.ts';

interface UseQuotesFilters {
    bookId?: string;
    authorId?: string;
    query?: string;
    limit?: number;
    cursor?: string;
}

export const useQuotes = (filters: UseQuotesFilters = {}) => {
    const { user } = useAuth();
    const uid = user?.uid;

    return useQuery<Quote[]>({
        queryKey: [
            ...queryKeys.user.quotes(uid),
            {
                bookId: filters.bookId ?? null,
                authorId: filters.authorId ?? null,
                query: filters.query ?? null,
                limit: filters.limit ?? null,
                cursor: filters.cursor ?? null,
            }
        ],
        queryFn: async () => {
            const response = await quoteService.listUserQuotes({
                ownerId: uid,
                bookId: filters.bookId,
                authorId: filters.authorId,
                query: filters.query,
                limit: filters.limit,
                cursor: filters.cursor,
            });
            return response.quotes;
        },
        enabled: !!uid,
    });
};
