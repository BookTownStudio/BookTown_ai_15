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
  available: boolean;
  acquired: boolean;
  readAccess: BookSearchReadAccess;
  readProvider: BookSearchReadProvider;
  hasEbook: boolean;
  downloadable: boolean;
  isEbookAvailable: boolean;
  confidence: number;
  rank: number;
  externalReadableSources?: ExternalReadableSourceDTO[];
  rawBook?: Record<string, unknown>;
}

export interface SearchResponseDTO {
  results: SearchResultDTO[];
  nextCursor: string | null;
  hasMore: boolean;
  cursorUsed: boolean;
}
