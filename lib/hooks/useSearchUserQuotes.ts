
import { useQuery } from '../react-query.ts';
import { Quote } from '../../types/entities.ts';
import { useQuotes } from './useQuotes.ts';

const searchQuotes = async (allQuotes: Quote[] | undefined, query: string, bookId?: string, authorId?: string): Promise<Quote[]> => {
    let results = allQuotes || [];

    if (bookId) {
        results = results.filter(quote => quote.bookId === bookId);
    }

    if (authorId) {
        results = results.filter(quote => quote.authorId === authorId);
    }

    if (!query) {
        return results;
    }

    const lowerCaseQuery = query.toLowerCase();
    
    return results.filter(quote => 
        quote.textEn.toLowerCase().includes(lowerCaseQuery) ||
        quote.textAr.toLowerCase().includes(lowerCaseQuery) ||
        quote.sourceEn.toLowerCase().includes(lowerCaseQuery) ||
        quote.sourceAr.toLowerCase().includes(lowerCaseQuery)
    );
};

export const useSearchUserQuotes = (query: string, bookId?: string, authorId?: string) => {
    const { data: allQuotes } = useQuotes();

    return useQuery<Quote[]>({
        queryKey: ['searchUserQuotes', query, bookId, authorId, allQuotes?.length],
        queryFn: () => searchQuotes(allQuotes, query, bookId, authorId),
        enabled: true,
    });
};
