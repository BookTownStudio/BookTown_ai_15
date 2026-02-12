import { LibraryEdition } from '../types/library.types';
import * as logger from 'firebase-functions/logger';
import { buildCanonicalKey } from '../persistence/canonicalKey';

const OPEN_LIBRARY_API = "https://openlibrary.org/search.json";

export async function fetchFromOpenLibrary(query: string): Promise<LibraryEdition[]> {
  const url = new URL(OPEN_LIBRARY_API);
  url.searchParams.append("q", query);
  url.searchParams.append("limit", "10");

  logger.info('[SEARCH][OPENLIB][FETCH]', { query });

  try {
    const response = await fetch(url.toString());
    if (!response.ok) return [];

    const data = await response.json();
    if (!data.docs) {
      logger.info('[SEARCH][OPENLIB][RESULTS]', { count: 0 });
      return [];
    }

    const results = data.docs.map((doc: any) => {
      const workId = doc.key?.replace('/works/', '');
      const coverId = doc.cover_i;
      const primaryAuthor = Array.isArray(doc.author_name) && doc.author_name.length > 0
        ? doc.author_name[0]
        : null;
      const canonicalKey = buildCanonicalKey({
        title: doc.title || 'unknown',
        author: primaryAuthor
      });
      
      return {
        bookId: workId || `olw_${Date.now()}`,
        editionId: `ol_${doc.edition_key?.[0] || Date.now()}`,
        title: doc.title,
        authors: doc.author_name || [],
        language: doc.language?.[0] || 'en',
        coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : undefined,
        ebookAvailable: !!doc.ebook_count_i && doc.ebook_count_i > 0,
        source: 'openLibrary',
        isbn13: doc.isbn?.[0],
        publishedDate: doc.first_publish_year?.toString(),
        pageCount: doc.number_of_pages_median,
        canonicalKey
      } as any;
    });

    logger.info('[SEARCH][OPENLIB][RESULTS]', { count: results.length });

    return results;
  } catch (error) {
    console.error("[LIBRARY][OPEN_LIBRARY] Fetch failed:", error);
    return [];
  }
}
