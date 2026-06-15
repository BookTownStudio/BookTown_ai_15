import type { Book } from "../../types/entities.ts";

export type AuthorBibliographyAuthoritySource =
  | "canonical_author_id"
  | "legacy_display_name_repair"
  | "mixed"
  | "none";

export interface AuthorBibliographyModel {
  readonly canonicalWorks: readonly Book[];
  readonly repairWorks: readonly Book[];
  readonly authoritySource: AuthorBibliographyAuthoritySource;
  readonly totalCanonicalCount: number;
  readonly totalRepairCount: number;
  readonly hasMore: boolean;
  readonly suppressedRepairCount: number;
}

export const AUTHOR_BIBLIOGRAPHY_PREVIEW_LIMIT = 12;

function readText(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function publicationSortKey(book: Book): string {
  const value = readText(book.publicationDate);
  return value || "9999-99-99";
}

function compareBooks(left: Book, right: Book): number {
  const publication = publicationSortKey(left).localeCompare(publicationSortKey(right));
  if (publication !== 0) return publication;

  const title = readText(left.titleEn || left.title).localeCompare(
    readText(right.titleEn || right.title)
  );
  if (title !== 0) return title;

  return left.id.localeCompare(right.id);
}

function uniqueById(books: readonly Book[]): readonly Book[] {
  const seen = new Set<string>();
  const output: Book[] = [];
  for (const book of books) {
    if (!book.id || seen.has(book.id)) continue;
    seen.add(book.id);
    output.push(book);
  }
  return output;
}

function authoritySource(params: {
  readonly canonicalCount: number;
  readonly repairCount: number;
}): AuthorBibliographyAuthoritySource {
  if (params.canonicalCount > 0 && params.repairCount > 0) return "mixed";
  if (params.canonicalCount > 0) return "canonical_author_id";
  if (params.repairCount > 0) return "legacy_display_name_repair";
  return "none";
}

export function buildAuthorBibliographyModel(params: {
  readonly canonicalWorks?: readonly Book[];
  readonly repairWorks?: readonly Book[];
  readonly previewLimit?: number;
}): AuthorBibliographyModel {
  const previewLimit = Math.max(
    0,
    Math.trunc(params.previewLimit ?? AUTHOR_BIBLIOGRAPHY_PREVIEW_LIMIT)
  );
  const canonicalWorks = [...uniqueById(params.canonicalWorks ?? [])].sort(compareBooks);
  const repairIds = new Set(canonicalWorks.map((book) => book.id));
  const repairWorks = [...uniqueById(params.repairWorks ?? [])]
    .filter((book) => !repairIds.has(book.id))
    .sort(compareBooks);
  const totalCanonicalCount = canonicalWorks.length;
  const totalRepairCount = repairWorks.length;

  return {
    canonicalWorks: canonicalWorks.slice(0, previewLimit),
    repairWorks: repairWorks.slice(0, previewLimit),
    authoritySource: authoritySource({ canonicalCount: totalCanonicalCount, repairCount: totalRepairCount }),
    totalCanonicalCount,
    totalRepairCount,
    hasMore: totalCanonicalCount + totalRepairCount > previewLimit,
    suppressedRepairCount: 0,
  };
}

export function enforceCanonicalAuthorBibliography(
  bibliography: AuthorBibliographyModel
): AuthorBibliographyModel {
  const canonicalCount = bibliography.totalCanonicalCount;
  return {
    canonicalWorks: bibliography.canonicalWorks,
    repairWorks: [],
    authoritySource: canonicalCount > 0 ? "canonical_author_id" : "none",
    totalCanonicalCount: canonicalCount,
    totalRepairCount: 0,
    hasMore: bibliography.totalCanonicalCount > bibliography.canonicalWorks.length,
    suppressedRepairCount:
      bibliography.suppressedRepairCount +
      bibliography.totalRepairCount,
  };
}

export function flattenAuthorBibliographyPreview(
  bibliography: AuthorBibliographyModel
): readonly Book[] {
  return [...bibliography.canonicalWorks, ...bibliography.repairWorks].slice(
    0,
    AUTHOR_BIBLIOGRAPHY_PREVIEW_LIMIT
  );
}
