import type { Book } from "../../types/entities.ts";

type LegacyBookSeed = Partial<Book> & {
  id?: unknown;
};

export function buildLegacyBookView(seed: LegacyBookSeed): Book {
  const id =
    typeof seed.id === "string" && seed.id.trim().length > 0
      ? seed.id.trim()
      : "unknown_book";

  const titleEn =
    typeof seed.titleEn === "string" && seed.titleEn.trim().length > 0
      ? seed.titleEn.trim()
      : "Unknown Title";

  const titleAr =
    typeof seed.titleAr === "string" && seed.titleAr.trim().length > 0
      ? seed.titleAr.trim()
      : titleEn;

  const authorEn =
    typeof seed.authorEn === "string" && seed.authorEn.trim().length > 0
      ? seed.authorEn.trim()
      : "Unknown Author";

  const authorAr =
    typeof seed.authorAr === "string" && seed.authorAr.trim().length > 0
      ? seed.authorAr.trim()
      : authorEn;

  return {
    id,
    authorId:
      typeof seed.authorId === "string" && seed.authorId.trim().length > 0
        ? seed.authorId.trim()
        : "",
    titleEn,
    titleAr,
    authorEn,
    authorAr,
    coverUrl:
      typeof seed.coverUrl === "string" && seed.coverUrl.trim().length > 0
        ? seed.coverUrl.trim()
        : "",
    descriptionEn:
      typeof seed.descriptionEn === "string" ? seed.descriptionEn : "",
    descriptionAr:
      typeof seed.descriptionAr === "string" ? seed.descriptionAr : "",
    genresEn: Array.isArray(seed.genresEn) ? seed.genresEn : [],
    genresAr: Array.isArray(seed.genresAr) ? seed.genresAr : [],
    rating:
      typeof seed.rating === "number" && Number.isFinite(seed.rating)
        ? seed.rating
        : 0,
    ratingsCount:
      typeof seed.ratingsCount === "number" && Number.isFinite(seed.ratingsCount)
        ? Math.max(0, Math.trunc(seed.ratingsCount))
        : 0,
    isEbookAvailable: seed.isEbookAvailable === true,
    ...(typeof seed.title === "string" && seed.title.trim().length > 0
      ? { title: seed.title.trim() }
      : {}),
    ...(Array.isArray(seed.authors) ? { authors: seed.authors } : {}),
    ...(Array.isArray(seed.bookCovers) ? { bookCovers: seed.bookCovers } : {}),
    ...(typeof seed.description === "string" ? { description: seed.description } : {}),
    ...(typeof seed.reviewCount === "number" && Number.isFinite(seed.reviewCount)
      ? { reviewCount: Math.max(0, Math.trunc(seed.reviewCount)) }
      : {}),
    ...(typeof seed.publicationDate === "string" && seed.publicationDate.trim().length > 0
      ? { publicationDate: seed.publicationDate.trim() }
      : {}),
    ...(typeof seed.pageCount === "number" && Number.isFinite(seed.pageCount)
      ? { pageCount: Math.max(0, Math.trunc(seed.pageCount)) }
      : {}),
    ...(typeof seed.createdAt === "number" && Number.isFinite(seed.createdAt)
      ? { createdAt: seed.createdAt }
      : {}),
    ...(seed.rawBook ? { rawBook: seed.rawBook } : {}),
    ...(typeof seed.ebookAttachmentId === "string" && seed.ebookAttachmentId.trim().length > 0
      ? { ebookAttachmentId: seed.ebookAttachmentId.trim() }
      : {}),
  };
}
