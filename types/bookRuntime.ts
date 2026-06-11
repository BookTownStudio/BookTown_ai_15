import type { Book, BookOntology, CanonicalFallbackCover, CanonicalCoverMode } from "./entities.ts";
import type { ExternalReadableSourceDTO, SearchResultDTO } from "./bookSearch.ts";

export interface BookPublicViewDTO {
  id: string;
  titleEn: string;
  titleAr: string;
  authorEn: string;
  authorAr: string;
  coverUrl: string;
  coverMode?: CanonicalCoverMode;
  fallbackCover?: CanonicalFallbackCover;
  descriptionEn: string;
  descriptionAr: string;
  rating: number;
  ratingsCount: number;
  semanticGraphEligible?: boolean;
  isEbookAvailable: boolean;
}

export interface BookDetailsRuntimeDTO extends BookPublicViewDTO {
  ebookAttachmentId?: string;
  ebookStoragePath?: string;
  downloadable?: boolean;
  readerAuthority?: Book["readerAuthority"];
  providerExternalIds?: string[];
  externalReadableSources?: ExternalReadableSourceDTO[];
}

export const BOOK_VIEW_DEFAULT_ONTOLOGY: BookOntology = {
  schemaVersion: 1,
  form: "unknown",
  subForm: null,
  source: "migration",
  confidence: "unknown",
  updatedAt: null,
};

export function toBookPublicViewDTO(book: Book): BookPublicViewDTO {
  return {
    id: book.id,
    titleEn: book.titleEn,
    titleAr: book.titleAr,
    authorEn: book.authorEn,
    authorAr: book.authorAr,
    coverUrl: book.coverUrl,
    ...(book.coverMode ? { coverMode: book.coverMode } : {}),
    ...(book.fallbackCover ? { fallbackCover: book.fallbackCover } : {}),
    descriptionEn: book.descriptionEn,
    descriptionAr: book.descriptionAr,
    rating: book.rating,
    ratingsCount: book.ratingsCount,
    ...(typeof book.semanticGraphEligible === "boolean"
      ? { semanticGraphEligible: book.semanticGraphEligible }
      : {}),
    isEbookAvailable: book.isEbookAvailable,
  };
}

export function toBookDetailsRuntimeDTO(book: Book): BookDetailsRuntimeDTO {
  return {
    ...toBookPublicViewDTO(book),
    ...(book.ebookAttachmentId ? { ebookAttachmentId: book.ebookAttachmentId } : {}),
    ...(book.ebookStoragePath ? { ebookStoragePath: book.ebookStoragePath } : {}),
    ...(book.downloadable === true ? { downloadable: true } : {}),
    ...(book.readerAuthority ? { readerAuthority: book.readerAuthority } : {}),
    ...(book.providerExternalIds ? { providerExternalIds: book.providerExternalIds } : {}),
    ...(book.externalReadableSources ? { externalReadableSources: book.externalReadableSources } : {}),
  };
}

export function buildPendingSearchBookView(
  result: SearchResultDTO,
  fallbackBookId: string | undefined
): BookDetailsRuntimeDTO {
  return {
    id: fallbackBookId || result.bookId || result.id,
    titleEn: result.titleEn || result.title,
    titleAr: result.titleAr || "",
    authorEn: result.authorEn || result.authors[0] || "Unknown",
    authorAr: result.authorAr || "",
    coverUrl: result.coverUrl || "",
    coverMode: "uploaded",
    descriptionEn: result.descriptionEn || result.description || "",
    descriptionAr: result.descriptionAr || "",
    rating: 0,
    ratingsCount: 0,
    isEbookAvailable: result.ebookClass === "in_app",
    downloadable: result.downloadable === true,
    ...(result.externalReadableSources ? { externalReadableSources: result.externalReadableSources } : {}),
  };
}
