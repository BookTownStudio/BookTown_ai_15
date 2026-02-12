
/**
 * Library domain types for BookTown backend.
 * Isolated from specific database or API implementations.
 * Updated to support Phase 2 persistence schema.
 */

export interface LibraryBook {
  id: string; // Generated UID
  canonicalTitle: string;
  authors: string[];
  primarySubjects: string[];
  description: string;
  firstPublishedYear: number | null;
  sourceRefs: {
    googleBooksId?: string | null;
    openLibraryWorkId?: string | null;
  };
  createdAt: any; // Firestore Timestamp
  updatedAt: any; // Firestore Timestamp
}

export interface LibraryEdition {
  id: string; // Generated UID
  bookId: string; // Reference to LibraryBook.id
  language: string; // ISO 639-1
  title: string;
  subtitle?: string | null;
  translator?: string | null;
  publisher?: string | null;
  publishedDate?: string | null;
  isbn10?: string | null;
  isbn13?: string | null;
  pageCount?: number | null;
  categories: string[];
  coverImages: {
    small?: string | null;
    medium?: string | null;
    large?: string | null;
  };
  hasEbook: boolean;
  sourceRefs: {
    googleBooksVolumeId?: string | null;
    openLibraryEditionId?: string | null;
  };
  createdAt: any; // Firestore Timestamp
  updatedAt: any; // Firestore Timestamp

  // FIX: Added optional compatibility fields to support search results merging and filtering across local and external sources.
  editionId?: string;
  source?: string;
  ebookAvailable?: boolean;
  coverUrl?: string;
  description?: string;
}

export interface LibraryEbook {
  id: string; // Generated UID
  editionId: string;
  bookId: string;
  format: 'epub' | 'pdf';
  storagePath: string;
  source: 'google_books' | 'open_library' | 'app_database';
  publicDomain: boolean;
  downloadable: boolean;
  createdAt: any;
}

export interface LibrarySearchResponse {
  results: any[]; // Returning raw search result objects from sources
}
