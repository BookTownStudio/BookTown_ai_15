import type { Book } from "../../types/entities.ts";

export interface AuthorCanonModel {
  readonly startHere: readonly Book[];
  readonly majorWorks: readonly Book[];
  readonly completeBibliography: readonly Book[];
  readonly publicationChronology: readonly Book[];
}

function publicationYear(book: Book): number | null {
  const source = book.publicationDate || book.rawBook?.first_publish_year || book.rawBook?.firstPublishedYear;
  if (typeof source === "number" && Number.isFinite(source)) return source;
  if (typeof source !== "string") return null;
  const match = source.match(/\d{4}/);
  return match ? Number(match[0]) : null;
}

function titleForSort(book: Book): string {
  return (book.titleEn || book.titleAr || book.title || book.id).trim().toLocaleLowerCase();
}

function byChronology(left: Book, right: Book): number {
  const leftYear = publicationYear(left);
  const rightYear = publicationYear(right);
  if (leftYear !== null && rightYear !== null && leftYear !== rightYear) {
    return leftYear - rightYear;
  }
  if (leftYear !== null && rightYear === null) return -1;
  if (leftYear === null && rightYear !== null) return 1;
  return titleForSort(left).localeCompare(titleForSort(right));
}

function byCanonicalProminence(left: Book, right: Book): number {
  const leftScore = (left.rating || 0) * 1000 + (left.ratingsCount || 0) + (left.reviewCount || 0);
  const rightScore = (right.rating || 0) * 1000 + (right.ratingsCount || 0) + (right.reviewCount || 0);
  if (leftScore !== rightScore) return rightScore - leftScore;
  return byChronology(left, right);
}

function uniqueBooks(books: readonly Book[]): Book[] {
  const seen = new Set<string>();
  const result: Book[] = [];
  for (const book of books) {
    if (!book.id || seen.has(book.id)) continue;
    seen.add(book.id);
    result.push(book);
  }
  return result;
}

export function buildAuthorCanonModel(canonicalWorks: readonly Book[]): AuthorCanonModel {
  const completeBibliography = uniqueBooks(canonicalWorks);
  const publicationChronology = [...completeBibliography].sort(byChronology);
  const prominent = [...completeBibliography].sort(byCanonicalProminence);
  const startHere = prominent.slice(0, 1);
  const majorWorks = prominent.filter((book) => book.id !== startHere[0]?.id).slice(0, 4);

  return {
    startHere,
    majorWorks,
    completeBibliography,
    publicationChronology,
  };
}

export function formatPublicationLabel(book: Book): string {
  const year = publicationYear(book);
  return year === null ? "Date unknown" : String(year);
}
