import { Book } from '../types/entities.ts';

export interface SearchResult {
    source: 'GOOGLE_BOOKS' | 'OPEN_LIBRARY';
    book: Book;
}

/**
 * 🔒 AUTHORITATIVE FEDERATED SEARCH
 * - Backend is the source of truth
 * - ebookOnly is enforced server-side
 */
export const performFederatedSearch = async (
    query: string,
    ebookOnly: boolean = false
): Promise<SearchResult[]> => {
    if (!query || query.trim().length < 2) return [];

    try {
        const url =
            `/api/search/books?q=${encodeURIComponent(query)}` +
            `&ebookOnly=${ebookOnly ? 'true' : 'false'}`;

        const response = await fetch(url);

        if (!response.ok) {
            console.warn(`[FederatedSearch] API Error: ${response.status}`);
            return [];
        }

        /**
         * 🔒 AUTHORITATIVE CONTRACT
         * Cloud Function returns Book[] or { results: Book[] }
         */
        const data = await response.json();
        const books: Book[] = Array.isArray(data)
            ? data
            : Array.isArray(data?.results)
            ? data.results
            : [];

        return books.map(book => ({
            source:
                (book as any)?.source === 'googleBooks' ||
                (book.id || (book as any)?.editionId || '').startsWith('gb_')
                ? 'GOOGLE_BOOKS'
                : 'OPEN_LIBRARY',
            book
        }));

    } catch (e) {
        console.error('[FederatedSearch] JSON parse or network failure', e);
        return [];
    }
};
