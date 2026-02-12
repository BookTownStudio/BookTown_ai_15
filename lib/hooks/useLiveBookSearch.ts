// lib/hooks/useLiveBookSearch.ts
import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { Book, BookEdition } from '../../types/entities.ts';
import { useDebounce } from 'use-debounce';
// import { useNavigation } from '../../store/navigation.tsx'; // ✅ decoupled from view state
// import { fetchBookRecommendations } from '../../services/geminiService.ts'; // ⛔ TEMP DISABLED

/**
 * bridges Edition to Book UI type for backward compatibility
 * CONTRACT V1: Preserves the FULL raw provider object.
 */
const mapEditionToBook = (edition: BookEdition): Book => ({
    id: edition.editionId,
    authorId: 'external_author',
    titleEn: edition.title,
    titleAr: edition.title,
    authorEn: edition.authors.join(', '),
    authorAr: edition.authors.join(', '),
    coverUrl: edition.coverImages?.medium || '',
    descriptionEn: edition.description || 'Bibliographic record.',
    descriptionAr: 'سجل ببليوغرافي.',
    genresEn: edition.categories || [],
    genresAr: [],
    rating: 0,
    ratingsCount: 0,
    isEbookAvailable: edition.ebookAvailable,
    publicationDate: edition.publishedDate || undefined,
    pageCount: edition.pageCount || undefined,
    rawBook: edition // Preserving the raw provider data
});

/**
 * 🔒 PRODUCTION-GRADE SEARCH (Phase 2A)
 * - Single authoritative source
 * - No AI calls
 * - No fallback loops
 * - Deterministic & cacheable
 */
const searchBooks = async (
    query: string,
    showOnlyEbooks: boolean
): Promise<Book[]> => {
    if (!query || query.length < 2) return [];

    let results: Book[] = [];

    /* -----------------------------
       1. Authoritative Library Search
       ----------------------------- */
    try {
        const editions = await dataService.librarySearch.search(query, {
            limit: 10,
            ebookOnly: showOnlyEbooks // ✅ forward to backend
        });

        results = editions.map(mapEditionToBook);

        /* -----------------------------
           2. Safety Filter (Client Guard)
           Ensures correctness even if backend ignores flag
           ----------------------------- */
        if (showOnlyEbooks) {
            results = results.filter(
                (book) => book.isEbookAvailable === true
            );
        }

    } catch (err) {
        console.error('[SEARCH][LIBRARY_FAILED]', err);
        return []; // 🔒 HARD STOP — no fallbacks
    }

    console.log('[SEARCH][FRONTEND][RENDERING_RESULTS]', results);

    return results;
};

export const useLiveBookSearch = (
    query: string,
    showOnlyEbooks: boolean
) => {
    const [debouncedQuery] = useDebounce(query, 800);

    // ✅ Search is a utility, not a view: never gate it by navigation state.
    const enabled = debouncedQuery.length >= 2;

    return useQuery<Book[]>({
        queryKey: ['liveSearch', debouncedQuery, showOnlyEbooks],
        queryFn: () => searchBooks(debouncedQuery, showOnlyEbooks),
        enabled,
        staleTime: 30_000,
        retry: false // 🔒 no retry storms
    });
};
