import { useQuotes } from './useQuotes.ts';

export const useSearchUserQuotes = (
    query: string,
    bookId?: string,
    authorId?: string,
    enabled = true
) => {
    return useQuotes({
        bookId,
        authorId,
        query,
        limit: 50,
        enabled,
    });
};
