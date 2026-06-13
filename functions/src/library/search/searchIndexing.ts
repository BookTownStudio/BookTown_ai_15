import { buildSearchFieldsFromTextParts, normalizeSearchText } from "../../search/normalization";
import { normalizeIsbn } from "../normalization/bookSearchNormalization";
import { readBookOntology, resolveBookOntologyForm } from "../ontology/bookOntology";

function asNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function resolveAuthors(data: Record<string, unknown>): string[] {
  const explicitAuthors = asStringArray(data.authors);
  if (explicitAuthors.length > 0) {
    return explicitAuthors;
  }

  const fallbackAuthor =
    asNonEmptyString(data.authorEn) ||
    asNonEmptyString(data.author) ||
    asNonEmptyString(data.authorAr);
  return fallbackAuthor ? [fallbackAuthor] : [];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((entry) => entry.length > 0)));
}

function resolveTitleAuthorities(data: Record<string, unknown>): string[] {
  return uniqueStrings([
    asNonEmptyString(data.title),
    asNonEmptyString(data.titleEn),
    asNonEmptyString(data.titleAr),
    ...asStringArray(data.aliases),
    ...asStringArray(data.titleAliases),
    ...asStringArray(data.alternateTitles),
    ...asStringArray(data.otherTitles),
  ]);
}

function resolvePrimaryVisibleTitle(data: Record<string, unknown>): string {
  return (
    asNonEmptyString(data.title) ||
    asNonEmptyString(data.titleEn) ||
    asNonEmptyString(data.titleAr)
  );
}

function resolvePrimaryRetrievalTitle(data: Record<string, unknown>): string {
  return (
    asNonEmptyString(data.titleEn) ||
    asNonEmptyString(data.title) ||
    asNonEmptyString(data.titleAr)
  );
}

function resolveSearchTokens(data: Record<string, unknown>): string[] {
  const titleAuthorities = resolveTitleAuthorities(data);
  const authors = resolveAuthors(data);
  const isbn13 = normalizeIsbn(data.isbn13, 13);
  const isbn10 = normalizeIsbn(data.isbn10, 10);
  const searchFields = buildSearchFieldsFromTextParts([
    ...titleAuthorities,
    ...authors,
    asNonEmptyString(data.authorEn),
    asNonEmptyString(data.authorAr),
    isbn13,
    isbn10,
  ]);

  return searchFields.tokens.slice(0, 80);
}

function resolveDownloadable(data: Record<string, unknown>): boolean {
  const availability = asRecord(data.manifestationAvailability);
  return availability?.hasReadableManifestation === true && availability?.canReadInApp === true;
}

function stringArrayEquals(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((entry, index) => entry === b[index]);
}

export function buildBookSearchPatch(data: Record<string, unknown>): Record<string, unknown> {
  const title = resolvePrimaryVisibleTitle(data);
  const retrievalTitle = resolvePrimaryRetrievalTitle(data);
  const titleAuthorities = resolveTitleAuthorities(data);
  const authors = resolveAuthors(data);
  const normalizedTitle = normalizeSearchText(retrievalTitle || title);
  const titleEnNormalized =
    normalizeSearchText(asNonEmptyString(data.titleEn)) || normalizedTitle;
  const authorNamesNormalized = authors.map((entry) => normalizeSearchText(entry)).filter(Boolean);
  const searchableTitleAuthor = `${normalizedTitle} ${authorNamesNormalized.join(" ")}`.trim();
  const tokens = resolveSearchTokens(data);
  const downloadable = resolveDownloadable(data);
  const canonicalTitleAuthorities = uniqueStrings(
    titleAuthorities.map((entry) => normalizeSearchText(entry))
  );
  const form = resolveBookOntologyForm(data);
  const ontology = readBookOntology(data.ontology);
  const rawOntology = asRecord(data.ontology);
  const subForm = asNonEmptyString(ontology?.subForm || rawOntology?.subForm);
  const canonicalTradition = asNonEmptyString(
    ontology?.canonicalTradition || rawOntology?.canonicalTradition
  );

  return {
    normalizedTitle,
    titleEnNormalized,
    canonicalTitleAuthorities,
    authorNamesNormalized,
    searchableTitleAuthor,
    search: {
      tokens,
      form,
      ontology: {
        form,
        subForm,
        canonicalTradition,
      },
    },
    downloadable,
    hasEbook: downloadable,
    isEbookAvailable: downloadable,
  };
}

export function buildEditionSearchPatch(data: Record<string, unknown>): Record<string, unknown> {
  const title =
    asNonEmptyString(data.title) ||
    asNonEmptyString(data.titleEn) ||
    asNonEmptyString(data.titleAr);
  const authors = resolveAuthors(data);
  const normalizedTitle = normalizeSearchText(title);
  const normalizedAuthor = authors.map((entry) => normalizeSearchText(entry)).filter(Boolean).join(" ");
  const tokens = resolveSearchTokens(data);
  const downloadable = resolveDownloadable(data);

  return {
    searchTitleNormalized: normalizedTitle,
    searchAuthorNormalized: normalizedAuthor,
    searchTokens: tokens,
    downloadable,
    hasEbook: downloadable,
    isEbookAvailable: downloadable,
  };
}

export function bookSearchPatchNeedsUpdate(
  data: Record<string, unknown>,
  patch: Record<string, unknown>
): boolean {
  const currentTokens = asStringArray((data.search as Record<string, unknown> | undefined)?.tokens);
  const nextTokens = asStringArray((patch.search as Record<string, unknown> | undefined)?.tokens);
  const currentSearch = asRecord(data.search);
  const nextSearch = asRecord(patch.search);
  const currentSearchOntology = asRecord(currentSearch?.ontology);
  const nextSearchOntology = asRecord(nextSearch?.ontology);
  const currentAuthorNames = asStringArray(data.authorNamesNormalized);
  const nextAuthorNames = asStringArray(patch.authorNamesNormalized);
  const currentCanonicalTitleAuthorities = asStringArray(data.canonicalTitleAuthorities);
  const nextCanonicalTitleAuthorities = asStringArray(patch.canonicalTitleAuthorities);

  return (
    asNonEmptyString(data.normalizedTitle) !== asNonEmptyString(patch.normalizedTitle) ||
    asNonEmptyString(data.titleEnNormalized) !== asNonEmptyString(patch.titleEnNormalized) ||
    !stringArrayEquals(currentCanonicalTitleAuthorities, nextCanonicalTitleAuthorities) ||
    asNonEmptyString(data.searchableTitleAuthor) !== asNonEmptyString(patch.searchableTitleAuthor) ||
    asNonEmptyString(currentSearch?.form) !== asNonEmptyString(nextSearch?.form) ||
    asNonEmptyString(currentSearchOntology?.form) !== asNonEmptyString(nextSearchOntology?.form) ||
    asNonEmptyString(currentSearchOntology?.subForm) !==
      asNonEmptyString(nextSearchOntology?.subForm) ||
    asNonEmptyString(currentSearchOntology?.canonicalTradition) !==
      asNonEmptyString(nextSearchOntology?.canonicalTradition) ||
    !stringArrayEquals(currentAuthorNames, nextAuthorNames) ||
    !stringArrayEquals(currentTokens, nextTokens) ||
    Boolean(data.downloadable) !== Boolean(patch.downloadable) ||
    Boolean(data.hasEbook) !== Boolean(patch.hasEbook) ||
    Boolean(data.isEbookAvailable) !== Boolean(patch.isEbookAvailable)
  );
}
