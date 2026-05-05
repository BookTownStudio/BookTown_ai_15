import { LibraryEdition } from '../types/library.types';
import * as logger from 'firebase-functions/logger';
import { buildCanonicalKey } from '../persistence/canonicalKey';

const GOOGLE_BOOKS_API = "https://www.googleapis.com/books/v1/volumes";

export async function fetchFromGoogleBooks(query: string): Promise<LibraryEdition[]> {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  const url = new URL(GOOGLE_BOOKS_API);
  url.searchParams.append("q", query);
  url.searchParams.append("maxResults", "10");
  if (apiKey) url.searchParams.append("key", apiKey);

  logger.info('[SEARCH][GOOGLE][FETCH]', { query });

  try {
    const response = await fetch(url.toString());
    logger.info('[SEARCH][GOOGLE][HTTP]', { status: response.status });
    if (!response.ok) return [];

  const data = (await response.json()) as any;

    if (!data?.items) {
      logger.info('[SEARCH][GOOGLE][RESULTS]', { count: 0 });
      return [];
  }
    logger.info('[SEARCH][GOOGLE][RESULTS]', { count: data.items.length });

    return data.items.map((item: any) => {
      const info = item.volumeInfo;
      const industryIdentifiers = info.industryIdentifiers || [];
      const isbn13 = industryIdentifiers.find((id: any) => id.type === "ISBN_13")?.identifier;
      const primaryAuthor = Array.isArray(info.authors) && info.authors.length > 0
        ? info.authors[0]
        : null;
      const canonicalKey = buildCanonicalKey({
        title: info.title || 'unknown',
        author: primaryAuthor
      });

      return {
        bookId: `work_${item.id}`,
        editionId: `gb_${item.id}`,
        title: info.title,
        authors: info.authors || [],
        language: info.language || 'en',
        coverUrl: info.imageLinks?.thumbnail?.replace('http:', 'https:'),
        ebookAvailable:
          item.saleInfo?.isEbook === true ||
          item.accessInfo?.epub?.isAvailable === true ||
          item.accessInfo?.pdf?.isAvailable === true,
        source: 'googleBooks',
        isbn13: isbn13,
        publishedDate: info.publishedDate,
        pageCount: info.pageCount,
        description: info.description,
        imageLinks: info.imageLinks, // Preserved for backend normalization
        canonicalKey
      } as any;
    });
  } catch (error) {
    console.error("[LIBRARY][GOOGLE_BOOKS] Fetch failed:", error);
    return [];
  }
}
