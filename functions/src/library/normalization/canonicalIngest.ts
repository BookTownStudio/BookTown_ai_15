import { FieldValue } from "firebase-admin/firestore";

import { normalizeSearchText } from "../../search/normalization";
import {
  buildBookOntology,
  normalizeBookForm,
  normalizeCanonicalTradition,
  type BookForm,
} from "../ontology/bookOntology";

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

const REJECTED_CONTRIBUTOR_PATTERNS = [
  /\bsummary\b/u,
  /\bnotes?\b/u,
  /\bedited\b/u,
  /\bintroduction\b/u,
  /\btranslated\b/u,
  /\btranslator\b/u,
  /\bpublic\b/u,
  /\bcompanion\b/u,
  /\bguide\b/u,
];

const REJECTED_TITLE_PATTERNS = [
  /\bnotes?\b/u,
  /\bsummary\b/u,
  /\bstudy\s+guide\b/u,
  /\bcommentary\b/u,
  /\bcompanion\b/u,
  /\bguide\b/u,
];

const KNOWN_CANONICAL_SEED_AUTHOR_OVERRIDES = new Map<string, string>([
  ["macbeth", "William Shakespeare"],
  ["hamlet", "William Shakespeare"],
  ["the divine comedy", "Dante Alighieri"],
  ["one hundred years of solitude", "Gabriel Garcia Marquez"],
  ["war and peace", "Leo Tolstoy"],
]);

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

function normalizeCanonicalPersonDisplayName(value: string): string {
  const normalized = normalizeSearchText(value);
  if (!normalized) {
    return "";
  }

  if (
    normalized.includes("tolstoy") &&
    (normalized.includes("leo") || normalized.includes("lev") || normalized.includes("graf"))
  ) {
    return "Leo Tolstoy";
  }

  if (normalized === "gabriel garcia marquez" || normalized === "gabriel garcia marquez") {
    return "Gabriel Garcia Marquez";
  }

  return value.trim();
}

function extractAuthorFamilyTokens(value: string): string[] {
  const normalized = normalizeSearchText(value);
  if (!normalized) {
    return [];
  }
  return normalized
    .split(" ")
    .filter((token) => token.length > 2)
    .slice(-2);
}

export function hasContributorRoleSignal(value: string): boolean {
  const normalized = normalizeSearchText(value);
  return CONTRIBUTOR_ROLE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function hasRejectedContributorCandidateSignal(value: string): boolean {
  const normalized = normalizeSearchText(value);
  return REJECTED_CONTRIBUTOR_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function hasRejectedCandidateTitleSignal(value: string): boolean {
  const normalized = normalizeSearchText(value);
  return REJECTED_TITLE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function resolveCanonicalSeedAuthorityAuthor(params: {
  title?: string;
  fallbackAuthor?: string;
}): string {
  const titleNorm = normalizeSearchText(params.title || "");
  const override = titleNorm ? KNOWN_CANONICAL_SEED_AUTHOR_OVERRIDES.get(titleNorm) || "" : "";
  const selected = override || params.fallbackAuthor || "";
  return normalizeCanonicalPersonDisplayName(selected);
}

export function authorMatchesCanonicalSeedAuthority(params: {
  title?: string;
  author?: string;
}): boolean {
  const expectedAuthor = resolveCanonicalSeedAuthorityAuthor({
    title: params.title,
  });
  const candidateAuthor = normalizeCanonicalPersonDisplayName(params.author || "");
  if (!expectedAuthor || !candidateAuthor) {
    return false;
  }

  const expectedNorm = normalizeSearchText(expectedAuthor);
  const candidateNorm = normalizeSearchText(candidateAuthor);
  if (expectedNorm === candidateNorm) {
    return true;
  }

  const expectedFamilyTokens = extractAuthorFamilyTokens(expectedAuthor);
  const candidateFamilyTokens = extractAuthorFamilyTokens(candidateAuthor);
  if (expectedFamilyTokens.length === 0 || candidateFamilyTokens.length === 0) {
    return false;
  }

  return expectedFamilyTokens.some((token) => candidateFamilyTokens.includes(token));
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

function readSeedAuthorLock(rawBook: Record<string, unknown>): {
  author: string;
  authorEn: string;
  authors: string[];
  authorCanonicalKey: string;
} | null {
  const record = asRecord(rawBook.seedAuthorLock);
  if (!record) {
    return null;
  }

  const author = asNonEmptyString(record.author);
  const authorEn = asNonEmptyString(record.authorEn) || author;
  const authors = uniqueStrings([
    ...asStringArray(record.authors),
    author,
    authorEn,
  ]);
  const authorCanonicalKey = asNonEmptyString(record.authorCanonicalKey);

  if (!author || !authorEn || authors.length === 0 || !authorCanonicalKey) {
    return null;
  }

  return {
    author,
    authorEn,
    authors,
    authorCanonicalKey,
  };
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

function mapLegacyLiteraryFormToForm(value: string): BookForm | null {
  const form = normalizeBookForm(value);
  return form === "unknown" && value !== "unknown" ? null : form;
}

function ensureOntologyPayload(params: {
  normalized: Record<string, unknown>;
  form: BookForm;
  source: "seed" | "provider";
  confidence: "mapped" | "unknown";
  canonicalTradition?: unknown;
}): void {
  const ontology = asRecord(params.normalized.ontology);
  const ontologyForm = asNonEmptyString(ontology?.form);
  if (ontologyForm) {
    params.normalized.literaryForm = normalizeBookForm(ontologyForm);
    const canonicalTradition = normalizeCanonicalTradition(params.canonicalTradition);
    if (canonicalTradition && !normalizeCanonicalTradition(ontology?.canonicalTradition)) {
      params.normalized.ontology = {
        ...ontology,
        canonicalTradition,
      };
    }
    return;
  }

  params.normalized.literaryForm = params.form;
  params.normalized.ontology = buildBookOntology({
    literaryForm: params.form,
    source: params.source,
    confidence: params.confidence,
    updatedAt: FieldValue.serverTimestamp(),
    canonicalTradition: params.canonicalTradition,
  });
}

export function normalizeCanonicalIngestPayload(params: {
  source: SupportedCanonicalIngestSource;
  rawBook: Record<string, unknown>;
  requestedTitle?: string;
  requestedAuthor?: string;
}): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...params.rawBook };
  const seedAuthorLock = readSeedAuthorLock(normalized);
  const providerAuthors = extractProviderAuthors(normalized);
  const primaryAuthor =
    seedAuthorLock?.author ||
    selectPrimaryCreator({
      requestedAuthor: params.requestedAuthor,
      providerAuthors,
    });
  const providerTitle = firstNonEmptyString(normalized.title, normalized.titleEn, params.requestedTitle);
  const canonicalTitle = stripDecoratedTitle({
    providerTitle,
    requestedTitle: params.requestedTitle,
    requestedAuthor: primaryAuthor,
  });
  const isCanonicalSeedPayload = Boolean(
    seedAuthorLock || (params.requestedTitle && params.requestedAuthor)
  );
  const direct = asNonEmptyString(params.rawBook.literaryForm).toLowerCase();
  const mapped = direct ? mapLegacyLiteraryFormToForm(direct) : null;
  const form = mapped || "unknown";
  const description = firstNonEmptyString(
    normalized.descriptionEn,
    normalized.description,
    normalized.summary
  );
  const trustedWorkLevelSource = hasTrustedWorkLevelSource(params.source, normalized);
  const primaryAuthorNorm = normalizeSearchText(primaryAuthor);
  const contributorNames = providerAuthors.filter(
    (author) => normalizeSearchText(author) !== primaryAuthorNorm
  );
  const needsEnrichment =
    !description ||
    (!direct && !trustedWorkLevelSource);

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

  if (seedAuthorLock) {
    normalized.author = seedAuthorLock.author;
    normalized.authorEn = seedAuthorLock.authorEn;
    normalized.authors = seedAuthorLock.authors;
    normalized.authorCanonicalKey = seedAuthorLock.authorCanonicalKey;
    normalized.seedAuthorLock = seedAuthorLock;
  } else if (primaryAuthor) {
    normalized.author = primaryAuthor;
    normalized.authorEn = primaryAuthor;
    normalized.authors = [primaryAuthor];
  }

  if (contributorNames.length > 0) {
    normalized.editionContributors = contributorNames;
  }

  ensureOntologyPayload({
    normalized,
    form,
    source: isCanonicalSeedPayload ? "seed" : "provider",
    confidence: direct ? "mapped" : "unknown",
    canonicalTradition: params.rawBook.canonicalTradition,
  });

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
  } else {
    delete normalized.needsEnrichment;
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
