export type BookSearchSource = "booktown" | "googleBooks" | "openLibrary";
export type BookSearchResultType = "canonical" | "external";

export interface SearchResultDTO {
  id: string;
  editionId: string;
  bookId: string;
  externalId: string;
  source: BookSearchSource;
  resultType: BookSearchResultType;
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
  hasEbook: boolean;
  downloadable: boolean;
  isEbookAvailable: boolean;
  confidence: number;
  rank: number;
  rawBook?: Record<string, unknown>;
}

export interface SearchResponseDTO {
  results: SearchResultDTO[];
  nextCursor: string | null;
  hasMore: boolean;
  cursorUsed: boolean;
}
