import { useMemo } from 'react';
import { Quote } from '../../types/entities.ts';
import { useQuotes } from './useQuotes.ts';

export const useSearchUserQuotes = (query: string, bookId?: string, authorId?: string) => {
    const quotesQuery = useQuotes({
        bookId,
        authorId,
        limit: 100,
    });

    const data = useMemo<Quote[]>(() => {
        const allQuotes = quotesQuery.data ?? [];
        const normalizedQuery = query.trim().toLowerCase();

        if (!normalizedQuery) {
            return allQuotes;
        }

        return allQuotes.filter((quote) =>
            quote.textEn.toLowerCase().includes(normalizedQuery) ||
            quote.textAr.toLowerCase().includes(normalizedQuery) ||
            quote.sourceEn.toLowerCase().includes(normalizedQuery) ||
            quote.sourceAr.toLowerCase().includes(normalizedQuery)
        );
    }, [quotesQuery.data, query]);

    return {
        ...quotesQuery,
        data,
    };
};
