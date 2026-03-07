import { useQuotes } from './useQuotes.ts';

export const useSearchUserQuotes = (query: string, bookId?: string, authorId?: string) => {
    return useQuotes({
        bookId,
        authorId,
        query,
        limit: 50,
    });
};
