import { normalizeSearchText } from "../../search/normalization";

type SupportedCanonicalIngestSource = "googleBooks" | "openLibrary" | "worldcat";

const CONTRIBUTOR_ROLE_PATTERNS = [
  /\bedited\b/u,
  /\beditor\b/u,
  /\btranslator\b/u,
  /\btranslated\b/u,
  /\bintroduction\b/u,
  /\bintro\b/u,
  /\bnotes?\b/u,
  /\bannotat(?:ed|ion|or)\b/u,
  /\bcommentary\b/u,
  /\bcommentator\b/u,
  /\bforeword\b/u,
  /\bafterword\b/u,
  /\bpreface\b/u,
];

const TITLE_DECORATION_PATTERNS = [
  /\s*[:,-]?\s+(?:edited by|editor(?:ial)? by|translated by|translation by|with introduction by|introduction by|intro by|notes by|annotated by|commentary by|foreword by|afterword by|preface by)\b.*$/iu,
  /\s+\b(?:unabridged|annotated|illustrated)\b.*$/iu,
];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function uniqueStrings(values: readonly string[]): string[] {
  const dedup = new Set<string>();
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    dedup.add(normalized);
  }
  return Array.from(dedup);
}

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    const normalized = asNonEmptyString(value);
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function hasContributorRoleSignal(value: string): boolean {
  const normalized = normalizeSearchText(value);
  return CONTRIBUTOR_ROLE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function extractProviderAuthors(rawBook: Record<string, unknown>): string[] {
  const arrayAuthors = uniqueStrings([
    ...asStringArray(rawBook.providerAuthors),
    ...asStringArray(rawBook.rawProviderAuthors),
    ...asStringArray(rawBook.authors),
    ...asStringArray(rawBook.author_name),
  ]);
  if (arrayAuthors.length > 0) {
    return arrayAuthors;
  }

  return uniqueStrings([
    asNonEmptyString(rawBook.author),
    asNonEmptyString(rawBook.authorEn),
    asNonEmptyString(rawBook.authorAr),
  ]);
}

function selectPrimaryCreator(params: {
  requestedAuthor?: string;
  providerAuthors: string[];
}): string {
  const requestedAuthor = asNonEmptyString(params.requestedAuthor);
  if (requestedAuthor) {
    return requestedAuthor;
  }

  const primary = params.providerAuthors.find((author) => !hasContributorRoleSignal(author));
  return primary || params.providerAuthors[0] || "Unknown";
}

function stripDecoratedTitle(params: {
  providerTitle: string;
  requestedTitle?: string;
  requestedAuthor?: string;
}): string {
  const requestedTitle = asNonEmptyString(params.requestedTitle);
  const providerTitle = asNonEmptyString(params.providerTitle);
  if (!providerTitle) {
    return requestedTitle || "";
  }

  const providerTitleNorm = normalizeSearchText(providerTitle);
  const requestedTitleNorm = normalizeSearchText(requestedTitle);
  const requestedAuthorNorm = normalizeSearchText(params.requestedAuthor || "");

  if (requestedTitleNorm && providerTitleNorm.startsWith(requestedTitleNorm)) {
    const trailingNorm = providerTitleNorm.slice(requestedTitleNorm.length).trim();
    const contaminatedTrailing =
      trailingNorm.length > 0 &&
      (TITLE_DECORATION_PATTERNS.some((pattern) => pattern.test(trailingNorm)) ||
        CONTRIBUTOR_ROLE_PATTERNS.some((pattern) => pattern.test(trailingNorm)) ||
        (requestedAuthorNorm.length > 0 &&
          (trailingNorm.includes(`by ${requestedAuthorNorm}`) ||
            trailingNorm.includes(requestedAuthorNorm))));
    if (contaminatedTrailing) {
      return requestedTitle;
    }
  }

  let cleaned = providerTitle;
  for (const pattern of TITLE_DECORATION_PATTERNS) {
    cleaned = cleaned.replace(pattern, "").trim();
  }

  return cleaned || requestedTitle || providerTitle;
}

function inferLiteraryForm(rawBook: Record<string, unknown>): string {
  const direct = asNonEmptyString(rawBook.literaryForm).toLowerCase();
  if (direct) {
    return direct;
  }

  const normalizedSignals = [
    asNonEmptyString(rawBook.type),
    asNonEmptyString(rawBook.subtitle),
    asNonEmptyString(rawBook.description),
    asNonEmptyString(rawBook.descriptionEn),
    ...asStringArray(rawBook.subjects),
    ...asStringArray(rawBook.subject),
    ...asStringArray(rawBook.subject_facet),
  ]
    .map((entry) => normalizeSearchText(entry))
    .filter(Boolean);

  if (normalizedSignals.some((entry) => /\b(play|plays|drama|dramatic|traged(?:y|ies)|comedy)\b/u.test(entry))) {
    return "play";
  }
  if (normalizedSignals.some((entry) => /\b(poetry|poems?|verse)\b/u.test(entry))) {
    return "poetry";
  }
  if (normalizedSignals.some((entry) => /\b(novel|novels|fiction)\b/u.test(entry))) {
    return "novel";
  }

  return "";
}

function hasTrustedWorkLevelSource(
  source: SupportedCanonicalIngestSource,
  rawBook: Record<string, unknown>
): boolean {
  if (rawBook.workLevelSource === true) {
    return true;
  }

  if (source !== "openLibrary") {
    return false;
  }

  const key = asNonEmptyString(rawBook.key);
  const workId = firstNonEmptyString(rawBook.openLibraryWorkId, rawBook.workId, rawBook.externalId);
  return key.startsWith("/works/") || /^OL\d+W$/iu.test(workId);
}

function buildOpenLibraryIsbnCoverCandidates(rawBook: Record<string, unknown>): string[] {
  const candidates = uniqueStrings([
    asNonEmptyString(rawBook.isbn13),
    asNonEmptyString(rawBook.isbn10),
    ...asStringArray(rawBook.isbn_13),
    ...asStringArray(rawBook.isbn_10),
    ...asStringArray(rawBook.isbn),
  ]);

  return candidates.flatMap((isbn) => [
    `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg`,
    `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-M.jpg`,
  ]);
}

export function buildAlternateProviderCoverCandidates(params: {
  source: SupportedCanonicalIngestSource;
  rawBook: Record<string, unknown>;
}): string[] {
  if (params.source !== "googleBooks") {
    return [];
  }

  return buildOpenLibraryIsbnCoverCandidates(params.rawBook);
}

export function normalizeCanonicalIngestPayload(params: {
  source: SupportedCanonicalIngestSource;
  rawBook: Record<string, unknown>;
  requestedTitle?: string;
  requestedAuthor?: string;
}): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...params.rawBook };
  const providerAuthors = extractProviderAuthors(normalized);
  const primaryAuthor = selectPrimaryCreator({
    requestedAuthor: params.requestedAuthor,
    providerAuthors,
  });
  const providerTitle = firstNonEmptyString(normalized.title, normalized.titleEn, params.requestedTitle);
  const canonicalTitle = stripDecoratedTitle({
    providerTitle,
    requestedTitle: params.requestedTitle,
    requestedAuthor: primaryAuthor,
  });
  const literaryForm = inferLiteraryForm(normalized);
  const description = firstNonEmptyString(
    normalized.descriptionEn,
    normalized.description,
    normalized.summary
  );
  const trustedWorkLevelSource = hasTrustedWorkLevelSource(params.source, normalized);
  const contributorNames = providerAuthors.filter((author) => author !== primaryAuthor);
  const needsEnrichment =
    !description ||
    (!literaryForm && !trustedWorkLevelSource);

  if (canonicalTitle) {
    const providerTitleNorm = normalizeSearchText(providerTitle);
    const canonicalTitleNorm = normalizeSearchText(canonicalTitle);
    if (providerTitleNorm && canonicalTitleNorm && providerTitleNorm !== canonicalTitleNorm) {
      normalized.titleAliases = uniqueStrings([
        ...asStringArray(normalized.titleAliases),
        providerTitle,
      ]);
    }

    normalized.title = canonicalTitle;
    normalized.titleEn = canonicalTitle;
  }

  if (primaryAuthor) {
    normalized.author = primaryAuthor;
    normalized.authorEn = primaryAuthor;
    normalized.authors = [primaryAuthor];
  }

  if (contributorNames.length > 0) {
    normalized.editionContributors = contributorNames;
  }

  if (literaryForm) {
    normalized.literaryForm = literaryForm;
  }

  if (description) {
    normalized.description = description;
    normalized.descriptionEn = description;
  } else {
    delete normalized.description;
    delete normalized.descriptionEn;
    delete normalized.descriptionAr;
  }

  if (needsEnrichment) {
    normalized.needsEnrichment = true;
  }

  return normalized;
}

export function normalizeBatchCanonicalSeedPayload(params: {
  rawBook: Record<string, unknown>;
  requestedTitle: string;
  requestedAuthor: string;
}): Record<string, unknown> {
  return normalizeCanonicalIngestPayload({
    source:
      asNonEmptyString(params.rawBook.source) === "openLibrary" ? "openLibrary" : "googleBooks",
    rawBook: params.rawBook,
    requestedTitle: params.requestedTitle,
    requestedAuthor: params.requestedAuthor,
  });
}
