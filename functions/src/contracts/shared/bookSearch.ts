export type BookSearchSource = "booktown" | "googleBooks" | "openLibrary";
export type BookSearchResultType = "canonical" | "external";
export type BookSearchWorkType = "work" | "edition";
export type BookSearchEditionPresence = "single" | "grouped" | "edition";
export type BookSearchEbookClass = "in_app" | "external_link" | "unavailable";
export type BookSearchSourceClass = "canonical_catalog" | "external_provider";
export type BookSearchLanguageTruth = "match" | "mismatch" | "unknown";
export type BookSearchReadAccess = "none" | "in_app" | "trusted_external";
export type BookSearchReadProvider =
  | "booktown"
  | "openLibrary"
  | "gutenberg"
  | "hindawi"
  | "gallica"
  | null;

export interface ExternalReadableSourceDTO {
  provider: Exclude<BookSearchReadProvider, "booktown" | null>;
  providerExternalId: string;
  lendingEditionId?: string;
  lendingIdentifier?: string;
  trust: "trusted";
}

export interface SearchReaderAuthorityProjectionDTO {
  hasReadableAttachment: boolean;
  attachmentId?: string | null;
  source?: string | null;
  updatedAt?: string | null;
}

export interface SearchReadingProgressProjectionDTO {
  exists: boolean;
  status_state?: "reading" | "paused" | "abandoned" | "completed" | "rereading" | null;
  updatedAt?: string | null;
}

export interface SearchResultDTO {
  id: string;
  editionId: string;
  bookId: string;
  workId: string | null;
  externalId: string;
  source: BookSearchSource;
  resultType: BookSearchResultType;
  workType: BookSearchWorkType;
  editionPresence: BookSearchEditionPresence;
  ebookClass: BookSearchEbookClass;
  sourceClass: BookSearchSourceClass;
  languageTruth: BookSearchLanguageTruth;
  title: string;
  titleEn: string;
  titleAr: string;
  authors: string[];
  authorEn: string;
  authorAr: string;
  description: string;
  descriptionEn: string;
  descriptionAr: string;
  coverUrl: string;
  language: string;
  /** Derived response projection; not a persistence authority. */
  available: boolean;
  /** Derived response projection; not a persistence authority. */
  acquired: boolean;
  readAccess: BookSearchReadAccess;
  readProvider: BookSearchReadProvider;
  /** Canonical catalog classification owned by materializeBookAuthority. */
  hasEbook: boolean;
  /** Derived compatibility projection; not an authority. */
  downloadable: boolean;
  /** Derived compatibility projection for in-app readability. */
  isEbookAvailable: boolean;
  confidence: number;
  rank: number;
  canonicalTradition?: string;
  form?: string;
  subForm?: string;
  isbn13?: string;
  isbn10?: string;
  canonicalKey?: string;
  /** Acquisition-owned trusted external readability sources. */
  externalReadableSources?: ExternalReadableSourceDTO[];
  /** Server-owned readability projection for search UI decisions. */
  readerAuthority?: SearchReaderAuthorityProjectionDTO;
  /** Server-owned continuity projection for search UI decisions. */
  readingProgressProjection?: SearchReadingProgressProjectionDTO;
  rawBook?: Record<string, unknown>;
}

export interface SearchResponseDTO {
  results: SearchResultDTO[];
  nextCursor: string | null;
  hasMore: boolean;
  cursorUsed: boolean;
}
