import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { isBookVisibleToPublic } from "../../rights/bookRights";
import { resolveOpenLibraryReadableCandidate } from "../providers/openLibrary";
import { resolveGutenbergReadableCandidate } from "../providers/gutenberg";
import { resolveHindawiReadableCandidate } from "../providers/hindawi";
import { resolveGallicaReadableCandidate } from "../providers/gallica";
import type {
  AcquisitionProvider,
  ExternalReadableSourceRecord,
  ProviderLookupContext,
} from "../providers/types";

export interface SearchOptions {
  ebookOnly?: boolean;
  availabilityOnly?: boolean;
  language?: string;
  cursor?: string;
  limit?: number;
}

export type SearchResultType = "canonical" | "external";
export type SearchSource = "booktown" | "googleBooks" | "openLibrary";
export type SearchWorkType = "work" | "edition";
export type SearchEditionPresence = "single" | "grouped" | "edition";
export type SearchEbookClass = "in_app" | "external_link" | "unavailable";
export type SearchSourceClass = "canonical_catalog" | "external_provider";
export type SearchLanguageTruth = "match" | "mismatch" | "unknown";
export type SearchReadAccess = "none" | "in_app" | "trusted_external";
export type SearchReadProvider =
  | "booktown"
  | "openLibrary"
  | "gutenberg"
  | "hindawi"
  | "gallica"
  | null;

export interface UnifiedSearchResult {
  id: string;
  editionId: string;
  bookId: string;
  workId: string | null;
  externalId: string;
  source: SearchSource;
  resultType: SearchResultType;
  workType: SearchWorkType;
  editionPresence: SearchEditionPresence;
  ebookClass: SearchEbookClass;
  sourceClass: SearchSourceClass;
  languageTruth: SearchLanguageTruth;
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
  readAccess: SearchReadAccess;
  readProvider: SearchReadProvider;
  hasEbook: boolean;
  downloadable: boolean;
  isEbookAvailable: boolean;
  confidence: number;
  rank: number;
  externalReadableSources?: ExternalReadableSourceRecord[];
  isbn13?: string;
  isbn10?: string;
  canonicalKey?: string;
  rawBook?: Record<string, unknown>;
}

export interface UnifiedSearchResponse {
  results: UnifiedSearchResult[];
  nextCursor: string | null;
  hasMore: boolean;
  cursorUsed: boolean;
  canonicalCount: number;
  externalCount: number;
  telemetry?: {
    normalizedQuery: string;
    intentType: QueryIntent;
    internalSearchDurationMs: number;
    totalDurationMs: number;
    externalFallbackTriggered: boolean;
    topCoverageScore: number;
    topCoverageScores: number[];
    lowConfidenceTopThree: boolean;
    timestamp: string;
  };
}

type RankedResult = UnifiedSearchResult & {
  rankTier: number;
  computedScore: number;
  tokenCoverageRatio: number;
  popularityScore: number;
  engagementScore: number;
  recentActivityMs: number;
  normalizedTitle: string;
  languageMatchScore: number;
  canonicalProviderExternalIds: string[];
  };

type CursorPayload = {
  offset: number;
  fingerprint: string;
};

type QueryIntent = "ISBN" | "AUTHOR_INTENT" | "TITLE_INTENT" | "MIXED_INTENT";

type QueryCandidate = {
  normalized: string;
  tokens: string[];
  source: "original" | "corrected";
};

type RankComputation = {
  confidence: number;
  rankTier: number;
  computedScore: number;
  tokenCoverageRatio: number;
  query: QueryCandidate;
};

type CanonicalDoc = {
  id: string;
  data: Record<string, unknown>;
};

type CanonicalRetrievalArtifacts = {
  candidates: RankedResult[];
  rawDocs: CanonicalDoc[];
  phaseCounts: {
    isbn: number;
    tokens: number;
    prefix: number;
    author: number;
    titleAuthor: number;
  };
};

type ExternalSeedCandidate = {
  source: SearchSource;
  externalId: string;
  title: string;
  authors: string[];
  description: string;
  coverUrl: string;
  language: string;
  isbn13?: string;
  isbn10?: string;
  hasExternalEbookSignal: boolean;
  externalReadableSources?: ExternalReadableSourceRecord[];
  rawBook?: Record<string, unknown>;
};

const INTERNAL_FETCH_POOL = 100;
const DEFAULT_RETURN_COUNT = 15;
const MAX_RETURN_COUNT = 30;
const EXTERNAL_FALLBACK_TRIGGER = 5;
const CONFIDENCE_THRESHOLD = 0.72;
const EXTERNAL_PROVIDER_TIMEOUT_MS = 3000;
const AVAILABILITY_PROBE_LIMIT = 10;
const MAX_CORRECTED_QUERY_BRANCHES = 2;
const MIN_TYPO_TOKEN_LENGTH = 4;
const MAX_TYPO_EDIT_DISTANCE = 2;
const MAX_LONG_TYPO_EDIT_DISTANCE = 3;
const MIN_PREFIX_SEED_LENGTH = 4;
const LOW_CONFIDENCE_COVERAGE_THRESHOLD = 0.6;
const EXCLUDED_TYPE_PATTERN =
  /\b(academic journal|research paper|conference proceedings?|technical manual|whitepaper|government report|report|reports|thesis|magazine issue|in re|\bvs\b|hearing|hearings)\b/i;

const SEARCH_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "في",
  "من",
  "على",
  "الى",
  "إلى",
  "عن",
  "مع",
]);

const DERIVATIVE_TITLE_KEYWORDS = new Set([
  "coloring",
  "colouring",
  "cookbook",
  "guide",
  "workbook",
  "summary",
  "analysis",
  "companion",
  "journal",
  "notebook",
  "study",
  "quiz",
  "trivia",
]);

const AUTHOR_BIOGRAPHY_CRITICISM_PATTERNS = [
  /\blife\b/u,
  /\bromance\b/u,
  /\bcritical\b/u,
  /\bcriticism\b/u,
  /\bexamination\b/u,
  /\bbiography\b/u,
  /\bstudy\b/u,
  /\breader\b/u,
  /\bintroduction\b/u,
  /\bcompanion\b/u,
  /\bessays\b/u,
  /\bwriter\b/u,
  /\bat\b/u,
  /\bcombat\b/u,
  /\bletters\b/u,
];

const AUTHOR_ANTHOLOGY_PATTERNS = [
  /\bcomplete works\b/u,
  /\bcollected works\b/u,
  /\bselected works\b/u,
  /\bcollected novels\b/u,
  /\bcomplete novels\b/u,
  /\bcurated works\b/u,
  /\bbooks set\b/u,
  /\bnovels of\b/u,
  /\bstories of\b/u,
  /\bworks of\b/u,
  /\bcollection\b/u,
];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function asExternalReadableSources(
  value: unknown
): ExternalReadableSourceRecord[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const provider =
        record.provider === "openLibrary" ||
        record.provider === "gutenberg" ||
        record.provider === "hindawi" ||
        record.provider === "gallica"
          ? record.provider
          : null;
      const providerExternalId = asNonEmptyString(record.providerExternalId);
      const trust = record.trust === "trusted" ? "trusted" : null;
      if (!provider || !providerExternalId || !trust) return null;

      const lendingEditionId = asNonEmptyString(record.lendingEditionId);
      const lendingIdentifier = asNonEmptyString(record.lendingIdentifier);

      return {
        provider,
        providerExternalId,
        ...(lendingEditionId ? { lendingEditionId } : {}),
        ...(lendingIdentifier ? { lendingIdentifier } : {}),
        trust,
      } satisfies ExternalReadableSourceRecord;
    })
    .filter((entry): entry is ExternalReadableSourceRecord => entry !== null);
}

function normalizeSearchText(value?: string | null): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value?: string | null): string[] {
  const normalized = normalizeSearchText(value);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .filter((token) => token.length > 1 && !SEARCH_STOPWORDS.has(token));
}

function toQueryCandidate(
  value: string,
  source: QueryCandidate["source"]
): QueryCandidate | null {
  const normalized = normalizeSearchText(value);
  if (!normalized) return null;
  return {
    normalized,
    tokens: tokenize(normalized),
    source,
  };
}

function dedupeQueryCandidates(candidates: QueryCandidate[]): QueryCandidate[] {
  const deduped = new Map<string, QueryCandidate>();
  for (const candidate of candidates) {
    if (!deduped.has(candidate.normalized)) {
      deduped.set(candidate.normalized, candidate);
    }
  }
  return Array.from(deduped.values());
}

function commonPrefixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let index = 0;
  while (index < limit && a[index] === b[index]) {
    index += 1;
  }
  return index;
}

function boundedEditDistance(a: string, b: string, maxDistance: number): number | null {
  const aLength = a.length;
  const bLength = b.length;
  if (Math.abs(aLength - bLength) > maxDistance) {
    return null;
  }

  const previous = new Array<number>(bLength + 1);
  const current = new Array<number>(bLength + 1);

  for (let j = 0; j <= bLength; j += 1) {
    previous[j] = j;
  }

  for (let i = 1; i <= aLength; i += 1) {
    current[0] = i;
    let rowMin = current[0];
    for (let j = 1; j <= bLength; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost
      );
      rowMin = Math.min(rowMin, current[j]);
    }

    if (rowMin > maxDistance) {
      return null;
    }

    for (let j = 0; j <= bLength; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[bLength] <= maxDistance ? previous[bLength] : null;
}

function normalizeIsbn(value: unknown, length: 10 | 13): string {
  if (typeof value !== "string") return "";
  const digits = value.replace(/[^0-9Xx]/g, "").toUpperCase();
  if (length === 10) {
    return /^\d{9}[\dX]$/.test(digits) ? digits : "";
  }
  return /^\d{13}$/.test(digits) ? digits : "";
}

function resolveLanguageTruth(
  resultLanguage: string,
  requestedLanguage?: string | null
): SearchLanguageTruth {
  const normalizedResult = normalizeSearchText(resultLanguage);
  const normalizedRequested = normalizeSearchText(requestedLanguage || "");

  if (!normalizedRequested) return "unknown";
  if (!normalizedResult) return "unknown";
  return normalizedResult === normalizedRequested ? "match" : "mismatch";
}

function toLanguageMatchScore(languageTruth: SearchLanguageTruth): number {
  return languageTruth === "match" ? 1 : 0;
}

function hasCanonicalLegacyStoragePath(
  bookId: string,
  data: Record<string, unknown>
): boolean {
  const storagePath = asNonEmptyString(data.storagePath);
  if (!storagePath) return false;

  return (
    storagePath.startsWith(`books/${bookId}/original/`) ||
    storagePath.startsWith(`ebooks/${bookId}/`)
  );
}

function computeCanonicalEbookClass(
  bookId: string,
  data: Record<string, unknown>
): SearchEbookClass {
  const hasVerifiedAttachment =
    asNonEmptyString(data.ebookAttachmentId).length > 0 ||
    asNonEmptyString(data.ebookStoragePath).length > 0 ||
    hasCanonicalLegacyStoragePath(bookId, data) ||
    Boolean(data.downloadable);
  return hasVerifiedAttachment ? "in_app" : "unavailable";
}

function computeExternalEbookClass(hasExternalEbookSignal: boolean): SearchEbookClass {
  return hasExternalEbookSignal ? "external_link" : "unavailable";
}

function hasOpenLibraryReadableAvailability(doc: Record<string, unknown>): boolean {
  const hasFulltext = doc.has_fulltext === true;
  const lendingEditionId = asNonEmptyString(doc.lending_edition_s);
  const lendingIdentifier = asNonEmptyString(doc.lending_identifier_s);

  return hasFulltext && Boolean(lendingEditionId || lendingIdentifier);
}

function getProviderPriority(
  provider: SearchReadProvider
): number {
  switch (provider) {
    case "booktown":
      return 0;
    case "openLibrary":
      return 1;
    case "gutenberg":
      return 2;
    case "hindawi":
      return 3;
    case "gallica":
      return 4;
    default:
      return 99;
  }
}

function buildOwnershipReadSignals(isOwned: boolean): Pick<
  UnifiedSearchResult,
  "available" | "acquired" | "readAccess" | "readProvider" | "hasEbook" | "downloadable" | "isEbookAvailable"
> {
  if (isOwned) {
    return {
      available: true,
      acquired: true,
      readAccess: "in_app",
      readProvider: "booktown",
      hasEbook: true,
      downloadable: true,
      isEbookAvailable: true,
    };
  }

  return {
    available: false,
    acquired: false,
    readAccess: "none",
    readProvider: null,
    hasEbook: false,
    downloadable: false,
    isEbookAvailable: false,
  };
}

function hasTrustedExternalAvailability(
  result: UnifiedSearchResult
): boolean {
  return (
    result.available === true &&
    result.acquired === false &&
    result.readAccess === "trusted_external" &&
    result.readProvider !== null
  );
}

function mergeExternalReadableSources(
  existing: ExternalReadableSourceRecord[] | undefined,
  next: ExternalReadableSourceRecord[] | undefined
): ExternalReadableSourceRecord[] | undefined {
  const merged = [...(existing || []), ...(next || [])].filter(Boolean);
  if (merged.length === 0) return undefined;

  const deduped = new Map<string, ExternalReadableSourceRecord>();
  for (const entry of merged) {
    const key = `${entry.provider}:${entry.providerExternalId}`;
    if (!deduped.has(key)) {
      deduped.set(key, entry);
    }
  }
  return Array.from(deduped.values());
}

function applyTrustedExternalAvailability<T extends UnifiedSearchResult>(
  result: T,
  provider: AcquisitionProvider,
  externalReadableSources?: ExternalReadableSourceRecord[]
): T {
  if (result.acquired) {
    return result;
  }

  if (
    result.readProvider &&
    getProviderPriority(result.readProvider) <= getProviderPriority(provider)
  ) {
    return result;
  }

  return {
    ...result,
    ebookClass: "external_link",
    available: true,
    acquired: false,
    readAccess: "trusted_external",
    readProvider: provider,
    hasEbook: false,
    downloadable: false,
    isEbookAvailable: false,
    ...(mergeExternalReadableSources(result.externalReadableSources, externalReadableSources)
      ? {
          externalReadableSources: mergeExternalReadableSources(
            result.externalReadableSources,
            externalReadableSources
          ),
        }
      : {}),
  };
}

function computeCanonicalEditionPresence(data: Record<string, unknown>): SearchEditionPresence {
  const providerExternalIds = asStringArray(data.providerExternalIds);
  return providerExternalIds.length > 1 ? "grouped" : "single";
}

function toWorkTypePriority(workType: SearchWorkType): number {
  return workType === "work" ? 0 : 1;
}

function resolveTitleVariants(values: Array<string | null | undefined>): string[] {
  const variants: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    variants.push(trimmed);
  }

  return variants;
}

function computeBestTitleSignals(
  queryNorm: string,
  queryTokens: string[],
  titleVariants: string[]
): {
  titleNorm: string;
  titleExact: boolean;
  titlePrefix: boolean;
  titleHits: number;
  titleCoverage: number;
  adjacencyBonus: number;
} {
  const tokenCount = Math.max(queryTokens.length, 1);
  let best = {
    titleNorm: "",
    titleExact: false,
    titlePrefix: false,
    titleHits: 0,
    titleCoverage: 0,
    adjacencyBonus: 0,
    score: -1,
  };

  for (const variant of titleVariants) {
    const titleNorm = normalizeSearchText(variant);
    if (!titleNorm) continue;

    const titleTokenSet = new Set(tokenize(titleNorm));
    let titleHits = 0;
    for (const token of queryTokens) {
      if (titleTokenSet.has(token)) titleHits += 1;
    }

    const titleCoverage = titleHits / tokenCount;
    const adjacencyBonus = computeAdjacencyBonus(queryTokens, tokenize(titleNorm));
    const titleExact = titleNorm === queryNorm;
    const titlePrefix = queryNorm.length > 1 && titleNorm.startsWith(queryNorm);
    const score =
      (titleExact ? 100 : 0) +
      (titlePrefix ? 10 : 0) +
      titleCoverage * 5 +
      adjacencyBonus;

    if (score > best.score) {
      best = {
        titleNorm,
        titleExact,
        titlePrefix,
        titleHits,
        titleCoverage,
        adjacencyBonus,
        score,
      };
    }
  }

  return {
    titleNorm: best.titleNorm,
    titleExact: best.titleExact,
    titlePrefix: best.titlePrefix,
    titleHits: best.titleHits,
    titleCoverage: best.titleCoverage,
    adjacencyBonus: best.adjacencyBonus,
  };
}

function parseIsbnQuery(queryNorm: string): { isbn13: string; isbn10: string } {
  const digits = queryNorm.replace(/[^0-9Xx]/g, "").toUpperCase();
  return {
    isbn13: /^\d{13}$/.test(digits) ? digits : "",
    isbn10: /^\d{9}[\dX]$/.test(digits) ? digits : "",
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function computeAdjacencyBonus(queryTokens: string[], titleTokens: string[]): number {
  if (queryTokens.length < 2 || titleTokens.length < 2) return 0;

  const titleBigrams = new Set<string>();
  for (let i = 0; i < titleTokens.length - 1; i += 1) {
    titleBigrams.add(`${titleTokens[i]} ${titleTokens[i + 1]}`);
  }

  let matchedPairs = 0;
  for (let i = 0; i < queryTokens.length - 1; i += 1) {
    if (titleBigrams.has(`${queryTokens[i]} ${queryTokens[i + 1]}`)) {
      matchedPairs += 1;
    }
  }

  return matchedPairs / (queryTokens.length - 1);
}

function computeLengthNormalizationFactor(queryNorm: string, titleNorm: string): number {
  if (!queryNorm || !titleNorm) return 0.4;
  const ratio = queryNorm.length / Math.max(1, titleNorm.length);
  return clamp(ratio, 0.4, 1);
}

function splitNormalizedWords(value: string): string[] {
  return value
    .split(" ")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function computeTokenOverlapRatio(queryWords: string[], titleWords: string[]): number {
  if (queryWords.length === 0 || titleWords.length === 0) return 0;
  const titleWordSet = new Set(titleWords);
  let matched = 0;
  for (const word of queryWords) {
    if (titleWordSet.has(word)) matched += 1;
  }
  return matched / queryWords.length;
}

function computeCanonicalTitleAdjustment(queryNorm: string, title: string): number {
  const titleNorm = normalizeSearchText(title);
  if (!queryNorm || !titleNorm) return 0;

  let adjustment = 0;
  const queryWords = splitNormalizedWords(queryNorm);
  const titleWords = splitNormalizedWords(titleNorm);

  if (queryNorm === titleNorm && titleWords.length >= 3) {
    adjustment += 6;
  }

  if (
    queryNorm !== titleNorm &&
    queryWords.length >= 2 &&
    titleWords.length > queryWords.length &&
    titleNorm.endsWith(queryNorm) &&
    computeTokenOverlapRatio(queryWords, titleWords) >= 0.7
  ) {
    adjustment += 0.25;
  }

  if (titleWords.some((word) => DERIVATIVE_TITLE_KEYWORDS.has(word))) {
    adjustment -= 5;
  }

  return adjustment;
}

function computeTierSubScore(params: {
  titlePrefix: boolean;
  authorPrefix: boolean;
  tokenCoverageRatio: number;
  adjacencyBonus: number;
  queryNorm: string;
  titleNorm: string;
  queryIntent: QueryIntent;
}): number {
  const titlePrefixMatchWeight = params.titlePrefix ? 1.0 : 0;
  const authorPrefixWeight = params.authorPrefix
    ? params.queryIntent === "AUTHOR_INTENT"
      ? 0.8
      : 0.05
    : 0;

  const weightedSum =
    titlePrefixMatchWeight +
    authorPrefixWeight +
    params.tokenCoverageRatio +
    params.adjacencyBonus;

  const lengthNormalizationFactor = computeLengthNormalizationFactor(
    params.queryNorm,
    params.titleNorm
  );

  return Math.round(weightedSum * lengthNormalizationFactor * 1_000_000) / 1_000_000;
}

function detectQueryIntent(
  queryCandidates: QueryCandidate[],
  candidates: Array<{ title: string; authors: string[] }>
): QueryIntent {
  if (
    queryCandidates.some((entry) => {
      const isbnQuery = parseIsbnQuery(entry.normalized);
      return Boolean(isbnQuery.isbn13 || isbnQuery.isbn10);
    })
  ) {
    return "ISBN";
  }

  const dedupedQueries = dedupeQueryCandidates(queryCandidates);
  if (dedupedQueries.length === 0 || candidates.length === 0) {
    return "MIXED_INTENT";
  }

  let bestAuthorLikeStrength = 0;
  let bestTitleLikeStrength = 0;

  for (const queryCandidate of dedupedQueries) {
    if (queryCandidate.tokens.length === 0) continue;

    let authorPrefixMatches = 0;
    let titleTokenHits = 0;
    let authorTokenHits = 0;
    let authorPhraseEvidence = 0;
    const singleToken = queryCandidate.tokens.length === 1 ? queryCandidate.tokens[0] : "";
    const surnameToken = queryCandidate.tokens[queryCandidate.tokens.length - 1] || "";

    for (const candidate of candidates) {
      const titleNorm = normalizeSearchText(candidate.title);
      const authorNorm = normalizeSearchText((candidate.authors || []).join(" "));
      const titleTokenSet = new Set(tokenize(titleNorm));
      const authorTokenSet = new Set(tokenize(authorNorm));

      if (authorNorm) {
        if (authorNorm === queryCandidate.normalized) {
          authorPhraseEvidence += 6;
        } else if (authorNorm.startsWith(`${queryCandidate.normalized} `)) {
          authorPhraseEvidence += 5;
        } else if (
          surnameToken &&
          (authorNorm === surnameToken || authorNorm.endsWith(` ${surnameToken}`))
        ) {
          authorPhraseEvidence += queryCandidate.tokens.length >= 2 ? 4 : 3;
        }
      }

      if (singleToken) {
        let matchedAuthorPrefix = false;
        for (const token of authorTokenSet) {
          if (token === singleToken || token.startsWith(singleToken)) {
            matchedAuthorPrefix = true;
            break;
          }
        }
        if (matchedAuthorPrefix) {
          authorPrefixMatches += 1;
        }
      }

      for (const token of queryCandidate.tokens) {
        if (titleTokenSet.has(token)) titleTokenHits += 1;
        if (authorTokenSet.has(token)) authorTokenHits += 1;
      }
    }

    if (singleToken) {
      const authorPrefixThreshold = Math.max(1, Math.ceil(candidates.length * 0.25));
      if (
        authorPhraseEvidence >= 3 ||
        authorPrefixMatches >= authorPrefixThreshold ||
        authorTokenHits >= authorPrefixThreshold
      ) {
        bestAuthorLikeStrength = Math.max(
          bestAuthorLikeStrength,
          authorTokenHits + authorPrefixMatches + authorPhraseEvidence
        );
      }
      bestTitleLikeStrength = Math.max(bestTitleLikeStrength, titleTokenHits);
      continue;
    }

    if (
      authorPhraseEvidence >= 4 ||
      (authorTokenHits >= queryCandidate.tokens.length &&
        authorTokenHits >= titleTokenHits)
    ) {
      bestAuthorLikeStrength = Math.max(
        bestAuthorLikeStrength,
        authorTokenHits + authorPhraseEvidence
      );
    }
    bestTitleLikeStrength = Math.max(bestTitleLikeStrength, titleTokenHits);
  }

  if (bestAuthorLikeStrength > 0 && bestAuthorLikeStrength >= bestTitleLikeStrength) {
    return "AUTHOR_INTENT";
  }
  if (bestTitleLikeStrength > 0) {
    return "TITLE_INTENT";
  }
  return "MIXED_INTENT";
}

function computeFingerprint(queryNorm: string, options: SearchOptions): string {
  return [
    queryNorm,
    options.ebookOnly ? "1" : "0",
    options.availabilityOnly ? "1" : "0",
    options.language || "",
    String(normalizeLimit(options.limit)),
  ].join("|");
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): CursorPayload | null {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as Partial<CursorPayload>;
    if (
      typeof parsed.offset === "number" &&
      Number.isFinite(parsed.offset) &&
      parsed.offset >= 0 &&
      typeof parsed.fingerprint === "string" &&
      parsed.fingerprint.length > 0
    ) {
      return {
        offset: Math.floor(parsed.offset),
        fingerprint: parsed.fingerprint,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_RETURN_COUNT;
  }
  return Math.max(1, Math.min(MAX_RETURN_COUNT, Math.trunc(value)));
}

function toEpochMillis(value: unknown): number {
  if (!value) return 0;

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (typeof value === "object") {
    const maybeTimestamp = value as { toMillis?: () => number; toDate?: () => Date };
    if (typeof maybeTimestamp.toMillis === "function") {
      return maybeTimestamp.toMillis();
    }
    if (typeof maybeTimestamp.toDate === "function") {
      return maybeTimestamp.toDate().getTime();
    }
  }

  return 0;
}

function isLikelyBook(title: string, typeHint: string): boolean {
  const titleNorm = normalizeSearchText(title);
  if (!titleNorm) return false;

  const typeNorm = normalizeSearchText(typeHint);
  if (EXCLUDED_TYPE_PATTERN.test(titleNorm)) return false;
  if (EXCLUDED_TYPE_PATTERN.test(typeNorm)) return false;

  return true;
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const withName = error as { name?: unknown };
  return withName.name === "AbortError";
}

async function fetchJsonWithTimeout(params: {
  url: string;
  provider: "googleBooks" | "openLibrary";
}): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), EXTERNAL_PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch(params.url, { signal: controller.signal });
    if (!response.ok) return null;
    const payload = (await response.json()) as Record<string, unknown>;
    return payload;
  } catch (error) {
    if (isAbortError(error)) {
      logger.warn("[AI][LIBRARIAN][PROVIDER_TIMEOUT]", {
        provider: params.provider,
        timeoutMs: EXTERNAL_PROVIDER_TIMEOUT_MS,
      });
      return null;
    }
    logger.warn("BOOK_SEARCH_V2_PROVIDER_FAILED", {
      provider: params.provider,
      error: String(error),
    });
    return null;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function computeRank(
  queryNorm: string,
  queryTokens: string[],
  params: {
    title: string;
    titleVariants?: string[];
    authors: string[];
    synopsis?: string;
    isbn13?: string;
    isbn10?: string;
    queryIntent: QueryIntent;
  }
): {
  confidence: number;
  rankTier: number;
  computedScore: number;
  tokenCoverageRatio: number;
} {
  const titleVariants = resolveTitleVariants([params.title, ...(params.titleVariants || [])]);
  const titleSignals = computeBestTitleSignals(queryNorm, queryTokens, titleVariants);
  const titleNorm = titleSignals.titleNorm || normalizeSearchText(params.title);
  const authorNorm = normalizeSearchText((params.authors || []).join(" "));
  const synopsisNorm = normalizeSearchText(params.synopsis || "");

  const queryIsbn = parseIsbnQuery(queryNorm);
  const isIsbnExact =
    (queryIsbn.isbn13.length > 0 && queryIsbn.isbn13 === (params.isbn13 || "")) ||
    (queryIsbn.isbn10.length > 0 && queryIsbn.isbn10 === (params.isbn10 || ""));

  if (isIsbnExact) {
    return { confidence: 1, rankTier: 0, computedScore: 1, tokenCoverageRatio: 1 };
  }

  const titleExact = titleSignals.titleExact;
  const authorExact = authorNorm.length > 0 && authorNorm === queryNorm;
  const unknownAuthor = normalizeSearchText(params.authors[0] || "") === "unknown";

  const titleTokenSet = new Set(tokenize(titleNorm));
  const authorTokenSet = new Set(tokenize(authorNorm));
  const synopsisTokenSet = new Set(tokenize(synopsisNorm));

  const titleHits = titleSignals.titleHits;
  let authorHits = 0;
  let synopsisHits = 0;
  const matchedTokens = new Set<string>();

  for (const token of queryTokens) {
    const matchedInTitle = titleTokenSet.has(token);
    const matchedInAuthor = authorTokenSet.has(token);
    const matchedInSynopsis = synopsisTokenSet.has(token);
    if (matchedInAuthor) authorHits += 1;
    if (matchedInSynopsis) synopsisHits += 1;
    if (matchedInTitle || matchedInAuthor) matchedTokens.add(token);
  }

  const tokenCount = Math.max(queryTokens.length, 1);
  const titleCoverage = titleSignals.titleCoverage;
  const authorCoverage = authorHits / tokenCount;
  const synopsisCoverage = synopsisHits / tokenCount;
  const tokenCoverageRatio = matchedTokens.size / tokenCount;

  const adjacencyBonus = titleSignals.adjacencyBonus;
  const titlePrefix = titleSignals.titlePrefix;
  const authorPrefix = queryNorm.length > 1 && authorNorm.startsWith(queryNorm);
  const synopsisExact = synopsisNorm.length > 0 && synopsisNorm === queryNorm;
  const synopsisSignal =
    (synopsisExact ? 0.02 : 0) +
    Math.min(0.01, synopsisCoverage * 0.01);
  const tierSubScore = computeTierSubScore({
    titlePrefix,
    authorPrefix,
    tokenCoverageRatio,
    adjacencyBonus,
    queryNorm,
    titleNorm,
    queryIntent: params.queryIntent,
  });

  if (queryTokens.length === 1 && authorHits > 0) {
    const authorIntentScore = unknownAuthor ? tierSubScore - 1.25 : tierSubScore;
    return {
      confidence: 0.84,
      rankTier: 2,
      computedScore: authorIntentScore,
      tokenCoverageRatio,
    };
  }

  let confidence = 0;
  if (titleExact) confidence += 0.82;
  if (authorExact) confidence += 0.3;
  confidence += Math.min(0.16, titleCoverage * 0.16);
  confidence += Math.min(0.2, authorCoverage * 0.2);
  confidence += synopsisSignal;
  if (titlePrefix || authorPrefix) confidence += 0.04;

  if (unknownAuthor) {
    confidence -= 0.25;
  }

  confidence = clamp(confidence, 0, 1);

  if (titleExact) {
    const exactTitleScore = Math.max(
      confidence + (authorHits > 0 || authorExact ? 0.03 : 0),
      0.99
    );
    return {
      confidence: exactTitleScore,
      rankTier: 1,
      computedScore: unknownAuthor ? exactTitleScore - 1.25 : exactTitleScore,
      tokenCoverageRatio,
    };
  }

  if (titlePrefix || (titleCoverage >= 0.8 && (authorHits > 0 || authorPrefix))) {
    const tierTwoScore = tierSubScore + synopsisSignal;
    return {
      confidence: Math.max(confidence, 0.75),
      rankTier: 2,
      computedScore: unknownAuthor ? tierTwoScore - 1.25 : tierTwoScore,
      tokenCoverageRatio,
    };
  }

  const computedScore = tierSubScore + synopsisSignal;
  return {
    confidence,
    rankTier: 3,
    computedScore: unknownAuthor ? computedScore - 1.25 : computedScore,
    tokenCoverageRatio,
  };
}

function compareRankComputation(
  left: RankComputation,
  right: RankComputation
): number {
  if (left.rankTier !== right.rankTier) return left.rankTier - right.rankTier;
  if (right.confidence !== left.confidence) return right.confidence - left.confidence;
  if (right.tokenCoverageRatio !== left.tokenCoverageRatio) {
    return right.tokenCoverageRatio - left.tokenCoverageRatio;
  }
  if (right.computedScore !== left.computedScore) {
    return right.computedScore - left.computedScore;
  }
  if (left.query.source !== right.query.source) {
    return left.query.source === "original" ? -1 : 1;
  }
  return left.query.normalized.localeCompare(right.query.normalized);
}

function computeBestRankForQueries(
  queryCandidates: QueryCandidate[],
  params: {
    title: string;
    titleVariants?: string[];
    authors: string[];
    synopsis?: string;
    isbn13?: string;
    isbn10?: string;
    queryIntent: QueryIntent;
  }
): RankComputation {
  const fallbacks = dedupeQueryCandidates(queryCandidates);
  const [first] = fallbacks;
  if (!first) {
    throw new Error("BOOK_SEARCH_V2_QUERY_CANDIDATES_REQUIRED");
  }

  let best: RankComputation | null = null;
  for (const queryCandidate of fallbacks) {
    const rank = computeRank(queryCandidate.normalized, queryCandidate.tokens, params);
    const candidateRank: RankComputation = {
      ...rank,
      query: queryCandidate,
    };
    if (!best || compareRankComputation(candidateRank, best) < 0) {
      best = candidateRank;
    }
  }

  return best || {
    confidence: 0,
    rankTier: 3,
    computedScore: 0,
    tokenCoverageRatio: 0,
    query: first,
  };
}

function topCoverageScores(results: RankedResult[]): number[] {
  return results
    .slice(0, 3)
    .map((entry) => Math.round(entry.tokenCoverageRatio * 1_000_000) / 1_000_000);
}

function hasWeakCanonicalQuality(results: RankedResult[]): boolean {
  const scores = topCoverageScores(results);
  return scores.length === 3 && scores.every((score) => score < LOW_CONFIDENCE_COVERAGE_THRESHOLD);
}

function countTokenHits(queryTokens: string[], haystackTokens: Set<string>): number {
  let hits = 0;
  for (const token of queryTokens) {
    if (haystackTokens.has(token)) {
      hits += 1;
    }
  }
  return hits;
}

function countSharedTokens(left: Set<string>, right: Set<string>): number {
  let shared = 0;
  for (const token of left) {
    if (right.has(token)) {
      shared += 1;
    }
  }
  return shared;
}

function hasBiographyCriticismPattern(titleNorm: string): boolean {
  return AUTHOR_BIOGRAPHY_CRITICISM_PATTERNS.some((pattern) => pattern.test(titleNorm));
}

function hasAnthologyPattern(titleNorm: string): boolean {
  return AUTHOR_ANTHOLOGY_PATTERNS.some((pattern) => pattern.test(titleNorm));
}

function getPrimaryAuthorSurname(authorNorm: string): string {
  const authorTokens = tokenize(authorNorm);
  return authorTokens[authorTokens.length - 1] || "";
}

function startsWithQueriedSurname(params: {
  titleTokens: string[];
  queryTokens: string[];
  authorNorm: string;
}): boolean {
  const surname = getPrimaryAuthorSurname(params.authorNorm);
  if (!surname) return false;
  if (!params.queryTokens.some((token) => surname.startsWith(token) || token === surname)) {
    return false;
  }
  if (params.titleTokens[0] !== surname) {
    return false;
  }
  return params.titleTokens.length > 2;
}

function isCompactPrimaryLiteraryTitle(params: {
  titleTokens: string[];
  authorTokenSet: Set<string>;
  strongAuthorMatch: boolean;
  titleHits: number;
  queryTokens: string[];
  biographyCriticismPattern: boolean;
  anthologyPattern: boolean;
  titleLeadingSurname: boolean;
}): boolean {
  if (!params.strongAuthorMatch) return false;
  if (params.biographyCriticismPattern || params.anthologyPattern || params.titleLeadingSurname) {
    return false;
  }
  if (params.titleTokens.length === 0 || params.titleTokens.length > 6) return false;

  const sharedAuthorTokens = params.titleTokens.filter((token) => params.authorTokenSet.has(token));
  if (sharedAuthorTokens.length > 0) return false;

  if (params.queryTokens.length >= 2) {
    return params.titleHits >= Math.max(2, Math.ceil(params.queryTokens.length * 0.6));
  }

  return true;
}

function computeLiteraryCorrection(params: {
  result: RankedResult;
  query: QueryCandidate;
  queryIntent: QueryIntent;
}): number {
  const titleNorm = normalizeSearchText(params.result.title);
  const authorNorm = normalizeSearchText(
    params.result.authors.join(" ") || params.result.authorEn || ""
  );
  const titleTokens = tokenize(titleNorm);
  const titleTokenSet = new Set(titleTokens);
  const authorTokenSet = new Set(tokenize(authorNorm));
  const queryTokens = params.query.tokens;

  const authorHits = countTokenHits(queryTokens, authorTokenSet);
  const titleHits = countTokenHits(queryTokens, titleTokenSet);
  const sharedTitleAuthorTokens = countSharedTokens(titleTokenSet, authorTokenSet);
  const titleDominatedByAuthorName =
    sharedTitleAuthorTokens >= Math.min(2, authorTokenSet.size) &&
    sharedTitleAuthorTokens / Math.max(titleTokenSet.size, 1) >= 0.4;
  const strongAuthorMatch =
    queryTokens.length === 1
      ? authorHits >= 1 ||
        Array.from(authorTokenSet).some((token) => token.startsWith(queryTokens[0] || ""))
      : authorHits >= Math.max(1, Math.ceil(queryTokens.length * 0.6));
  const biographyCriticismPattern = hasBiographyCriticismPattern(titleNorm);
  const anthologyPattern = hasAnthologyPattern(titleNorm);
  const titleLeadingSurname = startsWithQueriedSurname({
    titleTokens,
    queryTokens,
    authorNorm,
  });
  const strongCanonicalPrimaryWork =
    params.result.resultType === "canonical" &&
    params.result.workType === "work" &&
    isCompactPrimaryLiteraryTitle({
      titleTokens,
      authorTokenSet,
      strongAuthorMatch,
      titleHits,
      queryTokens,
      biographyCriticismPattern,
      anthologyPattern,
      titleLeadingSurname,
    });
  const strongTitleFamilyMatch =
    queryTokens.length >= 2 &&
    titleHits >= Math.max(2, Math.ceil(queryTokens.length * 0.6));
  const titleStartsWithFullQuery =
    titleNorm === params.query.normalized ||
    titleNorm.startsWith(`${params.query.normalized} `);
  const trailingAfterQuery = titleStartsWithFullQuery
    ? titleNorm.slice(params.query.normalized.length).trim()
    : "";
  const titleLeadingHardSecondary =
    (titleLeadingSurname || titleStartsWithFullQuery) &&
    (trailingAfterQuery.length > 0 || titleTokens.length > queryTokens.length) &&
    (/^\d{3,4}\b/u.test(trailingAfterQuery) ||
      /^(?:\d{3,4}\b|reader\b|companion\b|introduction\b|letters?\b|essays?\b|writer\b|biography\b|life\b|study\b|critical\b|criticism\b|examination\b|at\b)/u.test(
        trailingAfterQuery
      ) ||
      (titleTokens.length > queryTokens.length &&
        [",", "reader", "companion", "introduction", "letters", "letter", "essays", "essay", "writer"]
          .some((token) => trailingAfterQuery.includes(token))));
  const derivativeQueryTail =
    titleNorm.includes(params.query.normalized) &&
    titleNorm !== params.query.normalized &&
    (biographyCriticismPattern ||
      anthologyPattern ||
      /\b(reader|companion|introduction|letters?|essays?|writer|guide|study|analysis|summary|set)\b/u.test(
        trailingAfterQuery || titleNorm
      ));
  const likelyPrimaryCompactWork =
    params.result.workType === "work" &&
    titleTokens.length > 0 &&
    titleTokens.length <= 5 &&
    !biographyCriticismPattern &&
    !anthologyPattern &&
    !titleLeadingSurname &&
    !titleDominatedByAuthorName;
  const exactShortClassicTitleMatch =
    params.queryIntent === "TITLE_INTENT" &&
    queryTokens.length >= 2 &&
    titleNorm === params.query.normalized &&
    likelyPrimaryCompactWork;
  const strongSecondaryCanonicalRow =
    params.result.resultType === "canonical" &&
    (biographyCriticismPattern ||
      anthologyPattern ||
      titleLeadingSurname ||
      titleLeadingHardSecondary ||
      (titleDominatedByAuthorName && strongAuthorMatch));

  let adjustment = 0;

  if (params.queryIntent === "AUTHOR_INTENT") {
    if (strongCanonicalPrimaryWork) {
      adjustment += 2.4;
    }

    if (biographyCriticismPattern) {
      adjustment -= 2.45;
    }

    if (anthologyPattern) {
      adjustment -= 2.05;
    }

    if (titleLeadingSurname && !strongCanonicalPrimaryWork) {
      adjustment -= 1.8;
    }

    if (titleLeadingHardSecondary) {
      adjustment -= 2.25;
    }

    if (!strongCanonicalPrimaryWork && titleDominatedByAuthorName && strongAuthorMatch) {
      adjustment -= 0.9;
    }

    if (strongSecondaryCanonicalRow) {
      adjustment -= 0.45;
    }
  } else if (
    strongTitleFamilyMatch &&
    !biographyCriticismPattern &&
    !anthologyPattern &&
    params.result.workType === "work"
  ) {
    adjustment += 0.65;
  }

  if (exactShortClassicTitleMatch) {
    adjustment += 3.4;
  }

  if (
    params.queryIntent === "TITLE_INTENT" &&
    titleNorm !== params.query.normalized &&
    (strongAuthorMatch || titleStartsWithFullQuery) &&
    (biographyCriticismPattern ||
      anthologyPattern ||
      titleLeadingSurname ||
      titleLeadingHardSecondary ||
      derivativeQueryTail)
  ) {
    adjustment -= anthologyPattern ? 2.2 : 2.7;
  }

  return Math.round(adjustment * 1_000_000) / 1_000_000;
}

function canonicalIdentityKey(result: UnifiedSearchResult): string {
  const isbn13 = normalizeIsbn(result.isbn13 || "", 13);
  if (isbn13) return `isbn13:${isbn13}`;

  const isbn10 = normalizeIsbn(result.isbn10 || "", 10);
  if (isbn10) return `isbn10:${isbn10}`;

  if (result.canonicalKey) {
    return `canonical:${result.canonicalKey}`;
  }

  const title = normalizeSearchText(result.title);
  const author = normalizeSearchText(result.authors[0] || result.authorEn || "unknown");
  return `canonical:${author}::${title}`;
}

function extractCanonicalSeedTexts(doc: CanonicalDoc): Array<string> {
  const title =
    asNonEmptyString(doc.data.title) ||
    asNonEmptyString(doc.data.titleEn) ||
    asNonEmptyString(doc.data.titleAr);
  const authors =
    asStringArray(doc.data.authors).length > 0
      ? asStringArray(doc.data.authors)
      : [
          asNonEmptyString(doc.data.authorEn) ||
            asNonEmptyString(doc.data.author) ||
            asNonEmptyString(doc.data.authorAr),
        ].filter(Boolean);

  return [title, ...authors].filter((entry) => entry.length > 0);
}

function extractExternalSeedTexts(candidate: ExternalSeedCandidate): Array<string> {
  return [candidate.title, ...candidate.authors].filter((entry) => entry.length > 0);
}

function deriveCorrectedQueryCandidates(params: {
  originalQuery: QueryCandidate;
  canonicalDocs: CanonicalDoc[];
  externalSeeds?: ExternalSeedCandidate[];
  existingQueries?: QueryCandidate[];
}): QueryCandidate[] {
  const candidateTokens = new Set<string>();
  const seenAuthorPhrases = new Set<string>();
  const seenSeedPhrases = new Set<string>();
  const isOrderedSubsequence = (needle: string, haystack: string): boolean => {
    let cursor = 0;
    for (const char of haystack) {
      if (char === needle[cursor]) {
        cursor += 1;
        if (cursor === needle.length) return true;
      }
    }
    return cursor === needle.length;
  };

  for (const doc of params.canonicalDocs) {
    const seeds = extractCanonicalSeedTexts(doc);
    const [titleSeed] = seeds;
    for (const seed of seeds) {
      const normalized = normalizeSearchText(seed);
      if (!normalized) continue;
       seenSeedPhrases.add(normalized);
      if (seed !== titleSeed) {
        seenAuthorPhrases.add(normalized);
      }
      for (const token of tokenize(normalized)) {
        if (token.length >= MIN_TYPO_TOKEN_LENGTH || token.length === 3) {
          candidateTokens.add(token);
        }
      }
    }
  }

  for (const seed of params.externalSeeds || []) {
    for (const entry of extractExternalSeedTexts(seed)) {
      const normalized = normalizeSearchText(entry);
      if (!normalized) continue;
      seenSeedPhrases.add(normalized);
      if (entry !== seed.title) {
        seenAuthorPhrases.add(normalized);
      }
      for (const token of tokenize(normalized)) {
        if (token.length >= MIN_TYPO_TOKEN_LENGTH || token.length === 3) {
          candidateTokens.add(token);
        }
      }
    }
  }

  const replacements: Array<{ index: number; replacement: string; distance: number; prefix: number }> = [];
  let shortTokenReplacementAdded = false;
  for (const [index, token] of params.originalQuery.tokens.entries()) {
    const anchoredShortToken =
      token.length === 3 &&
      !shortTokenReplacementAdded &&
      params.originalQuery.tokens.some(
        (entry, entryIndex) => entryIndex !== index && entry.length >= MIN_TYPO_TOKEN_LENGTH
      );
    if (token.length < MIN_TYPO_TOKEN_LENGTH && !anchoredShortToken) continue;
    const maxDistance = anchoredShortToken
      ? 1
      : token.length >= 9
        ? MAX_LONG_TYPO_EDIT_DISTANCE
        : MAX_TYPO_EDIT_DISTANCE;

    let bestReplacement: { replacement: string; distance: number; prefix: number } | null = null;
    for (const candidateToken of candidateTokens) {
      if (candidateToken === token) continue;
      if (!anchoredShortToken && Math.abs(candidateToken.length - token.length) > maxDistance) {
        continue;
      }

      const prefix = commonPrefixLength(token, candidateToken);
      if (!anchoredShortToken && prefix < 2) continue;

      const shortTokenMatch =
        anchoredShortToken &&
        candidateToken.length >= MIN_TYPO_TOKEN_LENGTH &&
        candidateToken.length <= 8 &&
        prefix >= 1 &&
        isOrderedSubsequence(token, candidateToken);
      const distance = shortTokenMatch
        ? candidateToken.length - token.length
        : boundedEditDistance(token, candidateToken, maxDistance);
      if (distance === null) continue;
      if (!shortTokenMatch && anchoredShortToken) continue;

      if (
        !bestReplacement ||
        distance < bestReplacement.distance ||
        (distance === bestReplacement.distance && prefix > bestReplacement.prefix) ||
        (distance === bestReplacement.distance &&
          prefix === bestReplacement.prefix &&
          candidateToken.length > bestReplacement.replacement.length)
      ) {
        bestReplacement = { replacement: candidateToken, distance, prefix };
      }
    }

    if (bestReplacement) {
      replacements.push({ index, ...bestReplacement });
      if (anchoredShortToken) {
        shortTokenReplacementAdded = true;
      }
    }
  }

  replacements.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    if (b.prefix !== a.prefix) return b.prefix - a.prefix;
    return b.replacement.length - a.replacement.length;
  });

  const nextQueries: QueryCandidate[] = [];
  const baseTokens = [...params.originalQuery.tokens];
  const uniqueExisting = new Set(
    dedupeQueryCandidates([params.originalQuery, ...(params.existingQueries || [])]).map(
      (entry) => entry.normalized
    )
  );

  const topReplacements = replacements.slice(0, MAX_CORRECTED_QUERY_BRANCHES);
  if (topReplacements.length > 0) {
    const combinedTokens = [...baseTokens];
    topReplacements.forEach((replacement) => {
      combinedTokens[replacement.index] = replacement.replacement;
    });
    const combinedCandidate = toQueryCandidate(combinedTokens.join(" "), "corrected");
    if (combinedCandidate && !uniqueExisting.has(combinedCandidate.normalized)) {
      nextQueries.push(combinedCandidate);
      uniqueExisting.add(combinedCandidate.normalized);
    }
  }

  for (const replacement of topReplacements) {
    if (nextQueries.length >= MAX_CORRECTED_QUERY_BRANCHES) break;
    const singleTokens = [...baseTokens];
    singleTokens[replacement.index] = replacement.replacement;
    const singleCandidate = toQueryCandidate(singleTokens.join(" "), "corrected");
    if (singleCandidate && !uniqueExisting.has(singleCandidate.normalized)) {
      nextQueries.push(singleCandidate);
      uniqueExisting.add(singleCandidate.normalized);
    }
  }

  if (
    nextQueries.length < MAX_CORRECTED_QUERY_BRANCHES &&
    params.originalQuery.tokens.length >= 2
  ) {
    const anchorTokens = params.originalQuery.tokens.filter(
      (token) => token.length >= MIN_TYPO_TOKEN_LENGTH
    );
    const shortTokens = params.originalQuery.tokens.filter((token) => token.length === 3);
    const phraseCandidates = Array.from(seenSeedPhrases).sort((left, right) => left.length - right.length);
    for (const phrase of phraseCandidates) {
      if (nextQueries.length >= MAX_CORRECTED_QUERY_BRANCHES) break;
      const phraseTokens = tokenize(phrase);
      const hasAnchor = anchorTokens.some((token) => phraseTokens.includes(token));
      const hasShortRescue = shortTokens.some(
        (token) =>
          !phraseTokens.includes(token) &&
          phraseTokens.some(
            (phraseToken) =>
              phraseToken.length >= MIN_TYPO_TOKEN_LENGTH &&
              phraseToken.length <= 8 &&
              commonPrefixLength(token, phraseToken) >= 1 &&
              isOrderedSubsequence(token, phraseToken)
          )
      );
      if (!hasAnchor || !hasShortRescue) continue;
      const phraseCandidate = toQueryCandidate(phrase, "corrected");
      if (phraseCandidate && !uniqueExisting.has(phraseCandidate.normalized)) {
        nextQueries.push(phraseCandidate);
        uniqueExisting.add(phraseCandidate.normalized);
      }
    }
  }

  const strongestReplacement = topReplacements[0];
  if (
    strongestReplacement &&
    params.originalQuery.tokens.length === 1 &&
    nextQueries.length < MAX_CORRECTED_QUERY_BRANCHES
  ) {
    for (const authorPhrase of seenAuthorPhrases) {
      if (nextQueries.length >= MAX_CORRECTED_QUERY_BRANCHES) break;
      if (!authorPhrase.includes(strongestReplacement.replacement)) continue;
      const authorCandidate = toQueryCandidate(authorPhrase, "corrected");
      if (authorCandidate && !uniqueExisting.has(authorCandidate.normalized)) {
        nextQueries.push(authorCandidate);
        uniqueExisting.add(authorCandidate.normalized);
      }
    }
  }

  if (
    params.originalQuery.tokens.length === 1 &&
    params.canonicalDocs.length === 0 &&
    nextQueries.length < MAX_CORRECTED_QUERY_BRANCHES
  ) {
    const surnameToken = params.originalQuery.tokens[0] || "";
    const matchingAuthorPhrase = Array.from(seenAuthorPhrases)
      .filter((phrase) => {
        const phraseTokens = tokenize(phrase);
        return (
          phraseTokens.length >= 2 &&
          phraseTokens[phraseTokens.length - 1] === surnameToken
        );
      })
      .sort((left, right) => left.length - right.length)[0];
    const surnameCandidate = matchingAuthorPhrase
      ? toQueryCandidate(matchingAuthorPhrase, "corrected")
      : null;
    if (surnameCandidate && !uniqueExisting.has(surnameCandidate.normalized)) {
      nextQueries.push(surnameCandidate);
      uniqueExisting.add(surnameCandidate.normalized);
    }
  }

  return nextQueries.slice(0, MAX_CORRECTED_QUERY_BRANCHES);
}

function buildIdentityKeys(result: UnifiedSearchResult): string[] {
  return [
    result.isbn13 ? `isbn13:${result.isbn13}` : "",
    result.isbn10 ? `isbn10:${result.isbn10}` : "",
    result.canonicalKey ? `canonical:${result.canonicalKey}` : "",
    result.resultType === "external" && result.externalId
      ? `provider:${result.source}:${result.externalId}`
      : "",
  ].filter((entry) => entry.length > 0);
}

function mapCanonicalBook(
  docId: string,
  data: Record<string, unknown>,
  queryCandidates: QueryCandidate[],
  options: SearchOptions,
  queryIntent: QueryIntent = "MIXED_INTENT"
): RankedResult | null {
  if (!isBookVisibleToPublic(data)) {
    return null;
  }

  const title =
    asNonEmptyString(data.title) ||
    asNonEmptyString(data.titleEn) ||
    "";
  if (!title) return null;
  const normalizedTitle = asNonEmptyString(data.normalizedTitle) || normalizeSearchText(title);

  const authors =
    asStringArray(data.authors).length > 0
      ? asStringArray(data.authors)
      : [
          asNonEmptyString(data.authorEn) ||
            asNonEmptyString(data.author) ||
            "Unknown",
        ];

  const language = asNonEmptyString(data.language) || "en";
  const languageTruth = resolveLanguageTruth(language, options.language);
  const ebookClass = computeCanonicalEbookClass(docId, data);
  const ownedReadSignals = buildOwnershipReadSignals(ebookClass === "in_app");
  if (options.ebookOnly && !ownedReadSignals.downloadable) {
    return null;
  }

  const isbn13 = normalizeIsbn(asNonEmptyString(data.isbn13), 13);
  const isbn10 = normalizeIsbn(asNonEmptyString(data.isbn10), 10);

  const rank = computeBestRankForQueries(queryCandidates, {
    title,
    titleVariants: [asNonEmptyString(data.titleEn), asNonEmptyString(data.titleAr)],
    authors,
    synopsis:
      asNonEmptyString(data.description) ||
      asNonEmptyString(data.descriptionEn) ||
      asNonEmptyString(data.synopsis) ||
      "",
    isbn13,
    isbn10,
    queryIntent,
  });

  if (rank.rankTier > 0 && rank.confidence < CONFIDENCE_THRESHOLD) {
    return null;
  }
  if (rank.rankTier === 3 && rank.tokenCoverageRatio < 0.5) {
    return null;
  }

  const coverObj = asRecord(data.cover);
  const coverUrl =
    asNonEmptyString(coverObj?.medium) ||
    asNonEmptyString(coverObj?.original) ||
    asNonEmptyString(data.coverUrl) ||
    "";

  const description =
    asNonEmptyString(data.description) ||
    asNonEmptyString(data.descriptionEn) ||
    asNonEmptyString(data.synopsis) ||
    "";

  const canonicalKey =
    asNonEmptyString(data.canonicalKey) ||
    `${normalizeSearchText(authors[0] || "unknown")}::${normalizedTitle}`;

  return {
    id: docId,
    editionId: asNonEmptyString(data.editionId) || docId,
    bookId: docId,
    workId: docId,
    externalId: "",
    source: "booktown",
    resultType: "canonical",
    workType: "work",
    editionPresence: computeCanonicalEditionPresence(data),
    ebookClass,
    sourceClass: "canonical_catalog",
    languageTruth,
    title,
    titleEn: asNonEmptyString(data.titleEn) || title,
    titleAr: asNonEmptyString(data.titleAr) || "",
    authors,
    authorEn: asNonEmptyString(data.authorEn) || authors[0] || "Unknown",
    authorAr: asNonEmptyString(data.authorAr) || "",
    description,
    descriptionEn: asNonEmptyString(data.descriptionEn) || description,
    descriptionAr: asNonEmptyString(data.descriptionAr) || "",
    coverUrl,
    language,
    available: ownedReadSignals.available,
    acquired: ownedReadSignals.acquired,
    readAccess: ownedReadSignals.readAccess,
    readProvider: ownedReadSignals.readProvider,
    hasEbook: ownedReadSignals.hasEbook,
    downloadable: ownedReadSignals.downloadable,
    isEbookAvailable: ownedReadSignals.isEbookAvailable,
    confidence: rank.confidence,
    rank: rank.rankTier,
    rankTier: rank.rankTier,
    computedScore: rank.computedScore,
    tokenCoverageRatio: rank.tokenCoverageRatio,
    popularityScore: Number(data.popularityScore || 0),
    engagementScore: Number(data.engagementScore || 0),
    recentActivityMs: toEpochMillis(data.recentActivityAt || data.updatedAt),
    normalizedTitle,
    languageMatchScore: toLanguageMatchScore(languageTruth),
    isbn13: isbn13 || undefined,
    isbn10: isbn10 || undefined,
    canonicalKey,
    ...(asExternalReadableSources(data.externalReadableSources).length > 0
      ? { externalReadableSources: asExternalReadableSources(data.externalReadableSources) }
      : {}),
    canonicalProviderExternalIds: asStringArray(data.providerExternalIds),
  };
}

async function collectCanonicalCandidates(
  queryCandidates: QueryCandidate[],
  options: SearchOptions
): Promise<CanonicalRetrievalArtifacts> {
  const db = getFirestore();
  const books = db.collection("books");
  const dedup = new Map<string, RankedResult>();
  const rawDocs = new Map<string, CanonicalDoc>();
  const phaseCounts = {
    isbn: 0,
    tokens: 0,
    prefix: 0,
    author: 0,
    titleAuthor: 0,
  };

  const candidates = dedupeQueryCandidates(queryCandidates);
  const correctedAuthorPhraseBySurname = new Map<string, string[]>();
  for (const candidate of candidates) {
    if (candidate.source !== "corrected" || candidate.tokens.length < 2) continue;
    const surname = candidate.tokens[candidate.tokens.length - 1] || "";
    if (!surname) continue;
    const current = correctedAuthorPhraseBySurname.get(surname) || [];
    if (!current.includes(candidate.normalized)) {
      current.push(candidate.normalized);
      correctedAuthorPhraseBySurname.set(surname, current.slice(0, 4));
    }
  }

  const registerSnapshot = (
    docs: Array<{ id: string; data: () => Record<string, unknown> }>,
    phase: keyof CanonicalRetrievalArtifacts["phaseCounts"]
  ) => {
    for (const doc of docs) {
      const rawData = doc.data() as Record<string, unknown>;
      rawDocs.set(doc.id, {
        id: doc.id,
        data: rawData,
      });
      const mapped = mapCanonicalBook(doc.id, rawData, candidates, options);
      if (!mapped) continue;
      if (!isLikelyBook(mapped.title, "book")) continue;
      dedup.set(doc.id, mapped);
      phaseCounts[phase] += 1;
    }
  };

  for (const queryCandidate of candidates) {
    const isbnQuery = parseIsbnQuery(queryCandidate.normalized);

    if (isbnQuery.isbn13) {
      const snapshot = await books.where("isbn13", "==", isbnQuery.isbn13).limit(5).get();
      registerSnapshot(snapshot.docs as Array<{ id: string; data: () => Record<string, unknown> }>, "isbn");
    }

    if (isbnQuery.isbn10) {
      const snapshot = await books.where("isbn10", "==", isbnQuery.isbn10).limit(5).get();
      registerSnapshot(snapshot.docs as Array<{ id: string; data: () => Record<string, unknown> }>, "isbn");
    }

    if (queryCandidate.tokens.length > 0) {
      const tokenSnapshot = await books
        .where("search.tokens", "array-contains-any", queryCandidate.tokens.slice(0, 10))
        .limit(INTERNAL_FETCH_POOL)
        .get();
      registerSnapshot(
        tokenSnapshot.docs as Array<{ id: string; data: () => Record<string, unknown> }>,
        "tokens"
      );
    }

    if (queryCandidate.normalized.length >= 2) {
      try {
        const prefixSnapshot = await books
          .orderBy("normalizedTitle")
          .startAt(queryCandidate.normalized)
          .endAt(`${queryCandidate.normalized}\uf8ff`)
          .limit(INTERNAL_FETCH_POOL)
          .get();
        registerSnapshot(
          prefixSnapshot.docs as Array<{ id: string; data: () => Record<string, unknown> }>,
          "prefix"
        );
      } catch {
        // If the prefix index is unavailable, token-query remains authoritative.
      }

      if (queryCandidate.normalized.length >= MIN_PREFIX_SEED_LENGTH) {
        try {
          const titleAuthorSnapshot = await books
            .orderBy("searchableTitleAuthor")
            .startAt(queryCandidate.normalized)
            .endAt(`${queryCandidate.normalized}\uf8ff`)
            .limit(INTERNAL_FETCH_POOL)
            .get();
          registerSnapshot(
            titleAuthorSnapshot.docs as Array<{ id: string; data: () => Record<string, unknown> }>,
            "titleAuthor"
          );
        } catch {
          // If the title-author prefix index is unavailable, canonical token retrieval remains authoritative.
        }

        try {
          const authorQueryValues =
            queryCandidate.tokens.length === 1 && queryCandidate.normalized.length >= MIN_PREFIX_SEED_LENGTH
              ? Array.from(
                  new Set([
                    queryCandidate.normalized,
                    ...(correctedAuthorPhraseBySurname.get(queryCandidate.normalized) || []),
                  ])
                ).slice(0, 10)
              : [queryCandidate.normalized];
          const authorSnapshot =
            authorQueryValues.length > 1
              ? await books
                  .where("authorNamesNormalized", "array-contains-any", authorQueryValues)
                  .limit(INTERNAL_FETCH_POOL)
                  .get()
              : await books
                  .where("authorNamesNormalized", "array-contains", queryCandidate.normalized)
                  .limit(INTERNAL_FETCH_POOL)
                  .get();
          registerSnapshot(
            authorSnapshot.docs as Array<{ id: string; data: () => Record<string, unknown> }>,
            "author"
          );
        } catch {
          // If the author normalized index is unavailable, token-query remains authoritative.
        }
      }
    }
  }

  return {
    candidates: Array.from(dedup.values()),
    rawDocs: Array.from(rawDocs.values()),
    phaseCounts,
  };
}

async function fetchGoogleExternalRaw(query: string): Promise<ExternalSeedCandidate[]> {
  const baseUrl = new URL("https://www.googleapis.com/books/v1/volumes");
  baseUrl.searchParams.set("q", query);
  baseUrl.searchParams.set("maxResults", "20");

  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  if (apiKey) {
    baseUrl.searchParams.set("key", apiKey);
  }

  const payload = (await fetchJsonWithTimeout({
    url: baseUrl.toString(),
    provider: "googleBooks",
  })) as { items?: Array<Record<string, unknown>> } | null;
  if (!payload) return [];

  const items = Array.isArray(payload.items) ? payload.items : [];
  const mapped: ExternalSeedCandidate[] = [];

  for (const item of items) {
    const volumeInfo = asRecord(item.volumeInfo);
    if (!volumeInfo) continue;

    const title = asNonEmptyString(volumeInfo.title);
    if (!title) continue;

    const printType = asNonEmptyString(volumeInfo.printType) || "BOOK";
    if (printType.toUpperCase() !== "BOOK") continue;

    const categories = asStringArray(volumeInfo.categories).join(" ");
    if (!isLikelyBook(title, categories)) continue;

    const authors = asStringArray(volumeInfo.authors);
    const normalizedAuthors = authors.length > 0 ? authors : ["Unknown"];

    const industryIdentifiers = Array.isArray(volumeInfo.industryIdentifiers)
      ? volumeInfo.industryIdentifiers
      : [];

    let isbn13 = "";
    let isbn10 = "";

    for (const identifierRaw of industryIdentifiers) {
      const identifier = asRecord(identifierRaw);
      if (!identifier) continue;
      const type = asNonEmptyString(identifier.type).toUpperCase();
      const value = asNonEmptyString(identifier.identifier);
      if (!type || !value) continue;
      if (!isbn13 && type.includes("ISBN_13")) isbn13 = normalizeIsbn(value, 13);
      if (!isbn10 && type.includes("ISBN_10")) isbn10 = normalizeIsbn(value, 10);
    }

    const externalId = asNonEmptyString(item.id);
    if (!externalId) continue;

    const imageLinks = asRecord(volumeInfo.imageLinks);
    const thumbnail = asNonEmptyString(imageLinks?.thumbnail).replace(/^http:\/\//i, "https://");

    const language = asNonEmptyString(volumeInfo.language) || "en";
    mapped.push({
      externalId,
      source: "googleBooks",
      title,
      description: asNonEmptyString(volumeInfo.description) || "",
      coverUrl: thumbnail,
      language,
      authors: normalizedAuthors,
      isbn13: isbn13 || undefined,
      isbn10: isbn10 || undefined,
      hasExternalEbookSignal: false,
      rawBook: {
        ...volumeInfo,
        id: externalId,
        externalId,
        source: "googleBooks",
      },
    });
  }

  return mapped;
}

async function fetchGoogleExternalByIsbnRaw(isbn: string): Promise<ExternalSeedCandidate[]> {
  return fetchGoogleExternalRaw(`isbn:${isbn}`);
}

async function fetchOpenLibraryExternalRaw(query: string): Promise<ExternalSeedCandidate[]> {
  const baseUrl = new URL("https://openlibrary.org/search.json");
  baseUrl.searchParams.set("q", query);
  baseUrl.searchParams.set("limit", "20");

  const payload = (await fetchJsonWithTimeout({
    url: baseUrl.toString(),
    provider: "openLibrary",
  })) as { docs?: Array<Record<string, unknown>> } | null;
  if (!payload) return [];

  const docs = Array.isArray(payload.docs) ? payload.docs : [];
  const mapped: ExternalSeedCandidate[] = [];

  for (const doc of docs) {
    const title = asNonEmptyString(doc.title);
    if (!title) continue;

    const typeHint = asNonEmptyString(doc.type) || asStringArray(doc.subject).join(" ");
    if (!isLikelyBook(title, typeHint)) continue;

    const authors = asStringArray(doc.author_name);
    const normalizedAuthors = authors.length > 0 ? authors : ["Unknown"];

    const isbnCandidates = asStringArray(doc.isbn);
    let isbn13 = "";
    let isbn10 = "";
    for (const candidate of isbnCandidates) {
      if (!isbn13) isbn13 = normalizeIsbn(candidate, 13);
      if (!isbn10) isbn10 = normalizeIsbn(candidate, 10);
      if (isbn13 && isbn10) break;
    }

    const key = asNonEmptyString(doc.key).replace(/^\/works\//, "");
    if (!key) continue;

    const coverId = asNonEmptyString(doc.cover_i);
    const coverUrl = coverId
      ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
      : "";

    const language = asStringArray(doc.language)[0] || "en";
    const hasExternalEbookSignal = hasOpenLibraryReadableAvailability(doc);
    const lendingEditionId = asNonEmptyString(doc.lending_edition_s);
    const lendingIdentifier = asNonEmptyString(doc.lending_identifier_s);

    mapped.push({
      externalId: key,
      source: "openLibrary",
      title,
      authors: normalizedAuthors,
      description: "",
      coverUrl,
      language,
      ...(hasExternalEbookSignal
        ? {
            externalReadableSources: [
              {
                provider: "openLibrary" as const,
                providerExternalId: key,
                ...(lendingEditionId ? { lendingEditionId } : {}),
                ...(lendingIdentifier ? { lendingIdentifier } : {}),
                trust: "trusted" as const,
              },
            ],
          }
        : {}),
      isbn13: isbn13 || undefined,
      isbn10: isbn10 || undefined,
      hasExternalEbookSignal,
      rawBook: {
        ...doc,
        id: key,
        externalId: key,
        source: "openLibrary",
      },
    });
  }

  return mapped;
}

async function fetchOpenLibraryExternalByIsbnRaw(isbn: string): Promise<ExternalSeedCandidate[]> {
  const payload = await fetchJsonWithTimeout({
    url: `https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`,
    provider: "openLibrary",
  });
  if (!payload) return [];

  const title = asNonEmptyString(payload.title);
  if (!title) return [];

  const coverIds = Array.isArray(payload.covers) ? payload.covers : [];
  const firstCoverId = coverIds.find((entry) => typeof entry === "number" || typeof entry === "string");
  const coverUrl =
    typeof firstCoverId === "number" || typeof firstCoverId === "string"
      ? `https://covers.openlibrary.org/b/id/${String(firstCoverId)}-L.jpg`
      : "";
  const byStatement = asNonEmptyString(payload.by_statement);
  const authors =
    Array.isArray(payload.authors) && payload.authors.length > 0
      ? payload.authors
          .map((entry) => asRecord(entry))
          .map((entry) => asNonEmptyString(entry?.name))
          .filter(Boolean)
      : [];

  const resolvedIsbn13 = normalizeIsbn(isbn, 13) || normalizeIsbn(asNonEmptyString(payload.isbn_13), 13);
  const resolvedIsbn10 = normalizeIsbn(isbn, 10) || normalizeIsbn(asNonEmptyString(payload.isbn_10), 10);
  const externalId =
    asNonEmptyString(payload.key).replace(/^\/books\//, "") ||
    asNonEmptyString(payload.ocaid) ||
    isbn;

  return [
    {
      source: "openLibrary",
      externalId,
      title,
      authors: authors.length > 0 ? authors : [byStatement || "Unknown"],
      description: "",
      coverUrl,
      language: asStringArray(payload.languages)[0] || "en",
      isbn13: resolvedIsbn13 || undefined,
      isbn10: resolvedIsbn10 || undefined,
      hasExternalEbookSignal: false,
      rawBook: {
        ...payload,
        id: externalId,
        externalId,
        source: "openLibrary",
      },
    },
  ];
}

function mapExternalCandidateToRanked(
  candidate: ExternalSeedCandidate,
  queryCandidates: QueryCandidate[],
  queryIntent: QueryIntent,
  requestedLanguage?: string
): RankedResult | null {
  const authors = candidate.authors.length > 0 ? candidate.authors : ["Unknown"];
  const rank = computeBestRankForQueries(queryCandidates, {
    title: candidate.title,
    authors,
    isbn13: candidate.isbn13,
    isbn10: candidate.isbn10,
    queryIntent,
  });

  if (rank.rankTier > 0 && rank.confidence < CONFIDENCE_THRESHOLD) {
    return null;
  }
  if (rank.rankTier === 3 && rank.tokenCoverageRatio < 0.5) {
    return null;
  }

  const languageTruth = resolveLanguageTruth(candidate.language, requestedLanguage);
  const externalReadSignals = candidate.hasExternalEbookSignal
    ? {
        available: true,
        acquired: false,
        readAccess: "trusted_external" as const,
        readProvider: candidate.source === "openLibrary" ? "openLibrary" as const : null,
      }
    : {
        available: false,
        acquired: false,
        readAccess: "none" as const,
        readProvider: null,
      };

  return {
    id: `${candidate.source === "googleBooks" ? "gb" : "ol"}_${candidate.externalId}`,
    editionId: `${candidate.source === "googleBooks" ? "gb" : "ol"}_${candidate.externalId}`,
    bookId: `${candidate.source === "googleBooks" ? "gb" : "ol"}_${candidate.externalId}`,
    workId: null,
    externalId: candidate.externalId,
    source: candidate.source,
    resultType: "external",
    workType: "edition",
    editionPresence: "edition",
    ebookClass: computeExternalEbookClass(candidate.hasExternalEbookSignal),
    sourceClass: "external_provider",
    languageTruth,
    title: candidate.title,
    titleEn: candidate.title,
    titleAr: "",
    authors,
    authorEn: authors[0] || "Unknown",
    authorAr: "",
    description: candidate.description,
    descriptionEn: candidate.description,
    descriptionAr: "",
    coverUrl: candidate.coverUrl,
    language: candidate.language,
    available: externalReadSignals.available,
    acquired: externalReadSignals.acquired,
    readAccess: externalReadSignals.readAccess,
    readProvider: externalReadSignals.readProvider,
    hasEbook: false,
    downloadable: false,
    isEbookAvailable: false,
    ...(candidate.externalReadableSources
      ? { externalReadableSources: candidate.externalReadableSources }
      : {}),
    confidence: rank.confidence,
    rank: rank.rankTier,
    rankTier: rank.rankTier,
    computedScore: rank.computedScore,
    tokenCoverageRatio: rank.tokenCoverageRatio,
    popularityScore: 0,
    engagementScore: 0,
    recentActivityMs: 0,
    normalizedTitle: normalizeSearchText(candidate.title),
    languageMatchScore: toLanguageMatchScore(languageTruth),
    isbn13: candidate.isbn13,
    isbn10: candidate.isbn10,
    canonicalKey: `${normalizeSearchText(authors[0])}::${normalizeSearchText(candidate.title)}`,
    canonicalProviderExternalIds: [],
    rawBook: candidate.rawBook,
  };
}

async function fetchGoogleExternal(
  query: string,
  queryCandidates: QueryCandidate[],
  queryIntent: QueryIntent,
  requestedLanguage?: string
): Promise<{ ranked: RankedResult[]; raw: ExternalSeedCandidate[] }> {
  const raw = await fetchGoogleExternalRaw(query);
  return {
    raw,
    ranked: raw
      .map((entry) => mapExternalCandidateToRanked(entry, queryCandidates, queryIntent, requestedLanguage))
      .filter((entry): entry is RankedResult => Boolean(entry)),
  };
}

async function fetchOpenLibraryExternal(
  query: string,
  queryCandidates: QueryCandidate[],
  queryIntent: QueryIntent,
  requestedLanguage?: string
): Promise<{ ranked: RankedResult[]; raw: ExternalSeedCandidate[] }> {
  const raw = await fetchOpenLibraryExternalRaw(query);
  return {
    raw,
    ranked: raw
      .map((entry) => mapExternalCandidateToRanked(entry, queryCandidates, queryIntent, requestedLanguage))
      .filter((entry): entry is RankedResult => Boolean(entry)),
  };
}

function rerankWithIntent(
  result: RankedResult,
  queryCandidates: QueryCandidate[],
  queryIntent: QueryIntent
): RankedResult | null {
  const rank = computeBestRankForQueries(queryCandidates, {
    title: result.title,
    titleVariants: [result.titleEn, result.titleAr],
    authors: result.authors,
    isbn13: result.isbn13,
    isbn10: result.isbn10,
    queryIntent,
  });

  if (rank.rankTier > 0 && rank.confidence < CONFIDENCE_THRESHOLD) {
    return null;
  }
  if (rank.rankTier === 3 && rank.tokenCoverageRatio < 0.5) {
    return null;
  }

  return {
    ...result,
    confidence: rank.confidence,
    rank: rank.rankTier,
    rankTier: rank.rankTier,
    computedScore:
      result.resultType === "canonical"
        ? Math.round((
            rank.computedScore +
            computeCanonicalTitleAdjustment(rank.query.normalized, result.title) +
            computeLiteraryCorrection({
              result,
              query: rank.query,
              queryIntent,
            })
          ) * 1_000_000) /
          1_000_000
        : Math.round((
            rank.computedScore +
            computeLiteraryCorrection({
              result,
              query: rank.query,
              queryIntent,
            })
          ) * 1_000_000) / 1_000_000,
    tokenCoverageRatio: rank.tokenCoverageRatio,
  };
}

function rankCanonicalResults(
  canonicalCandidates: RankedResult[],
  queryCandidates: QueryCandidate[],
  queryIntent: QueryIntent
): RankedResult[] {
  return canonicalCandidates
    .map((entry) => rerankWithIntent(entry, queryCandidates, queryIntent))
    .filter((entry): entry is RankedResult => Boolean(entry))
    .sort(compareRanked);
}

function compareRanked(a: RankedResult, b: RankedResult): number {
  const typePriority = a.resultType === b.resultType ? 0 : a.resultType === "canonical" ? -1 : 1;
  if (typePriority !== 0) return typePriority;

  const workTypePriority = toWorkTypePriority(a.workType) - toWorkTypePriority(b.workType);
  if (workTypePriority !== 0) return workTypePriority;

  if (a.rankTier !== b.rankTier) return a.rankTier - b.rankTier;
  if (b.computedScore !== a.computedScore) return b.computedScore - a.computedScore;
  if (b.languageMatchScore !== a.languageMatchScore) {
    return b.languageMatchScore - a.languageMatchScore;
  }
  if (b.popularityScore !== a.popularityScore) return b.popularityScore - a.popularityScore;
  if (b.recentActivityMs !== a.recentActivityMs) return b.recentActivityMs - a.recentActivityMs;
  if (a.bookId !== b.bookId) return a.bookId.localeCompare(b.bookId);
  return a.id.localeCompare(b.id);
}

async function enrichCanonicalAvailability(
  canonicalResults: RankedResult[],
  requestedCount: number
): Promise<RankedResult[]> {
  const probeCount = Math.min(
    canonicalResults.length,
    Math.max(requestedCount * 2, EXTERNAL_FALLBACK_TRIGGER),
    AVAILABILITY_PROBE_LIMIT
  );
  if (probeCount === 0) {
    return canonicalResults;
  }

  const providerResolvers = [
    resolveOpenLibraryReadableCandidate,
    resolveGutenbergReadableCandidate,
    resolveHindawiReadableCandidate,
    resolveGallicaReadableCandidate,
  ];

  const enrichedHead = await Promise.all(
    canonicalResults.slice(0, probeCount).map(async (result) => {
      if (result.acquired) {
        return result;
      }

      const lookupContext: ProviderLookupContext = {
        bookId: result.bookId,
        book: {
          ...result,
          providerExternalIds: result.canonicalProviderExternalIds,
        },
        editionId: result.editionId || null,
        sourceHint: null,
      };

      for (const resolveProvider of providerResolvers) {
        try {
          const candidate = await resolveProvider(lookupContext);
          if (!candidate?.trust?.availabilityTrust) {
            continue;
          }
          return applyTrustedExternalAvailability(
            result,
            candidate.provider,
            candidate.persistedSource ? [candidate.persistedSource] : undefined
          );
        } catch (error) {
          logger.warn("BOOK_SEARCH_V2_AVAILABILITY_PROVIDER_FAILED", {
            bookId: result.bookId,
            provider: resolveProvider.name || "unknown",
            error: String(error),
          });
        }
      }

      return result;
    })
  );

  return [...enrichedHead, ...canonicalResults.slice(probeCount)];
}

function mergeCanonicalAvailability(
  rankedExternal: RankedResult[],
  canonicalResults: RankedResult[]
): {
  canonicalResults: RankedResult[];
  externalResults: RankedResult[];
} {
  const canonicalIdentity = new Map<string, number>();
  const nextCanonical = canonicalResults.slice();
  canonicalResults.forEach((canonical, index) => {
    for (const identity of buildIdentityKeys(canonical)) {
      canonicalIdentity.set(identity, index);
    }
    canonicalIdentity.set(canonicalIdentityKey(canonical), index);
  });

  const accepted: RankedResult[] = [];
  const seen = new Set<string>();

  for (const result of rankedExternal.sort(compareRanked)) {
    const identities = buildIdentityKeys(result);
    const canonicalIndex = identities
      .map((entry) => canonicalIdentity.get(entry))
      .find((entry): entry is number => typeof entry === "number");

    if (typeof canonicalIndex === "number") {
      if (hasTrustedExternalAvailability(result)) {
        nextCanonical[canonicalIndex] = applyTrustedExternalAvailability(
          nextCanonical[canonicalIndex],
          result.readProvider as AcquisitionProvider,
          result.externalReadableSources
        );
      }
      continue;
    }

    if (identities.some((entry) => seen.has(entry))) {
      continue;
    }

    identities.forEach((entry) => seen.add(entry));
    accepted.push(result);
  }

  return {
    canonicalResults: nextCanonical,
    externalResults: accepted,
  };
}

function selectSecondaryExternalQuery(queryCandidates: QueryCandidate[]): QueryCandidate | null {
  return (
    queryCandidates.find(
      (entry) => entry.source === "corrected" && entry.normalized.length >= MIN_PREFIX_SEED_LENGTH
    ) || null
  );
}

function mergeExternalSeedCandidates(
  ...groups: Array<ExternalSeedCandidate[]>
): ExternalSeedCandidate[] {
  const deduped = new Map<string, ExternalSeedCandidate>();
  for (const group of groups) {
    for (const entry of group) {
      const key = `${entry.source}:${entry.externalId}`;
      if (!deduped.has(key)) {
        deduped.set(key, entry);
      }
    }
  }
  return Array.from(deduped.values());
}

/**
 * Canonical-first deterministic search engine.
 *
 * Contract:
 * - Internal Firestore (`books`) ranked first.
 * - External fallback only when canonical results are insufficient.
 * - Deterministic ordering and cursor pagination.
 */
export async function unifiedSearch(
  query: string,
  options: SearchOptions = {}
): Promise<UnifiedSearchResponse> {
  const totalStartMs = Date.now();
  const queryNorm = normalizeSearchText(query);
  const phaseOrder: string[] = ["normalize"];
  if (queryNorm.length < 2) {
    logger.info("BOOK_SEARCH_V2_ENGINE_TRACE", {
      query: queryNorm,
      phaseOrder,
      canonicalPhaseCounts: { isbn: 0, tokens: 0, prefix: 0, canonical: 0 },
      externalFallbackCalled: false,
      providers: { googleBooks: 0, openLibrary: 0, merged: 0 },
      reason: "short_query",
    });
    return {
      results: [],
      nextCursor: null,
      hasMore: false,
      cursorUsed: false,
      canonicalCount: 0,
      externalCount: 0,
      telemetry: {
        normalizedQuery: queryNorm,
        intentType: "MIXED_INTENT",
        internalSearchDurationMs: 0,
        totalDurationMs: Date.now() - totalStartMs,
        externalFallbackTriggered: false,
        topCoverageScore: 0,
        topCoverageScores: [],
        lowConfidenceTopThree: false,
        timestamp: new Date().toISOString(),
      },
    };
  }

  const limit = normalizeLimit(options.limit);
  const fingerprint = computeFingerprint(queryNorm, options);
  const decodedCursor = decodeCursor(options.cursor);
  const startOffset =
    decodedCursor && decodedCursor.fingerprint === fingerprint
      ? decodedCursor.offset
      : 0;
  const originalQuery = toQueryCandidate(queryNorm, "original");
  if (!originalQuery) {
    return {
      results: [],
      nextCursor: null,
      hasMore: false,
      cursorUsed: false,
      canonicalCount: 0,
      externalCount: 0,
    };
  }

  let queryCandidates = [originalQuery];
  phaseOrder.push("canonical_initial");
  let canonicalArtifacts = await collectCanonicalCandidates(queryCandidates, options);

  const correctedFromCanonical = deriveCorrectedQueryCandidates({
    originalQuery,
    canonicalDocs: canonicalArtifacts.rawDocs,
    existingQueries: queryCandidates,
  });
  if (correctedFromCanonical.length > 0) {
    queryCandidates = dedupeQueryCandidates([...queryCandidates, ...correctedFromCanonical]);
    phaseOrder.push("canonical_corrected_local");
    canonicalArtifacts = await collectCanonicalCandidates(queryCandidates, options);
  }

  let queryIntent = detectQueryIntent(
    queryCandidates,
    canonicalArtifacts.candidates.map((entry) => ({
      title: entry.title,
      authors: entry.authors,
    }))
  );

  let rerankedCanonical = rankCanonicalResults(
    canonicalArtifacts.candidates,
    queryCandidates,
    queryIntent
  );
  let canonicalAvailability = options.availabilityOnly
    ? await enrichCanonicalAvailability(rerankedCanonical, limit)
    : rerankedCanonical.slice();
  let lowConfidenceTopThree = hasWeakCanonicalQuality(rerankedCanonical);

  const externalFallbackEnabled = process.env.NODE_ENV !== "test";
  let externalCandidates: RankedResult[] = [];
  let googleCount = 0;
  let openLibraryCount = 0;
  let rawExternalPrimary: ExternalSeedCandidate[] = [];
  let rawExternalSecondary: ExternalSeedCandidate[] = [];

  const isbnQuery = parseIsbnQuery(queryNorm);
  const isIsbnLookup = Boolean(isbnQuery.isbn13 || isbnQuery.isbn10);
  const canonicalAvailabilityCount = canonicalAvailability.filter((entry) => entry.available).length;
  const shouldUseExternalFallback =
    externalFallbackEnabled &&
    !options.ebookOnly &&
    (options.availabilityOnly
      ? canonicalAvailabilityCount < limit || lowConfidenceTopThree
      : rerankedCanonical.length < EXTERNAL_FALLBACK_TRIGGER || lowConfidenceTopThree);

  if (shouldUseExternalFallback) {
    phaseOrder.push("external_primary");
    if (options.availabilityOnly) {
      rawExternalPrimary = await fetchOpenLibraryExternalRaw(originalQuery.normalized);
    } else if (isIsbnLookup) {
      const isbn = isbnQuery.isbn13 || isbnQuery.isbn10;
      const [googleIsbn, openLibraryIsbn] = await Promise.all([
        fetchGoogleExternalByIsbnRaw(isbn),
        fetchOpenLibraryExternalByIsbnRaw(isbn),
      ]);
      rawExternalPrimary = mergeExternalSeedCandidates(googleIsbn, openLibraryIsbn);
      if (rawExternalPrimary.length === 0) {
        const [googleGeneric, openLibraryGeneric] = await Promise.all([
          fetchGoogleExternalRaw(originalQuery.normalized),
          fetchOpenLibraryExternalRaw(originalQuery.normalized),
        ]);
        rawExternalPrimary = mergeExternalSeedCandidates(googleGeneric, openLibraryGeneric);
      }
    } else {
      const [googleGeneric, openLibraryGeneric] = await Promise.all([
        fetchGoogleExternalRaw(originalQuery.normalized),
        fetchOpenLibraryExternalRaw(originalQuery.normalized),
      ]);
      rawExternalPrimary = mergeExternalSeedCandidates(googleGeneric, openLibraryGeneric);
    }

    const correctedFromExternal = deriveCorrectedQueryCandidates({
      originalQuery,
      canonicalDocs: canonicalArtifacts.rawDocs,
      externalSeeds: rawExternalPrimary,
      existingQueries: queryCandidates,
    });
    if (correctedFromExternal.length > 0) {
      queryCandidates = dedupeQueryCandidates([...queryCandidates, ...correctedFromExternal]);
      phaseOrder.push("canonical_corrected_external");
      canonicalArtifacts = await collectCanonicalCandidates(queryCandidates, options);
      queryIntent = detectQueryIntent(
        queryCandidates,
        canonicalArtifacts.candidates.map((entry) => ({
          title: entry.title,
          authors: entry.authors,
        }))
      );
      rerankedCanonical = rankCanonicalResults(
        canonicalArtifacts.candidates,
        queryCandidates,
        queryIntent
      );
      canonicalAvailability = options.availabilityOnly
        ? await enrichCanonicalAvailability(rerankedCanonical, limit)
        : rerankedCanonical.slice();
      lowConfidenceTopThree = hasWeakCanonicalQuality(rerankedCanonical);
    }

    const secondaryQuery = selectSecondaryExternalQuery(queryCandidates);
    if (
      secondaryQuery &&
      secondaryQuery.normalized !== originalQuery.normalized &&
      !isIsbnLookup
    ) {
      phaseOrder.push("external_secondary");
      if (options.availabilityOnly) {
        rawExternalSecondary = await fetchOpenLibraryExternalRaw(secondaryQuery.normalized);
      } else {
        const [googleSecondary, openLibrarySecondary] = await Promise.all([
          fetchGoogleExternalRaw(secondaryQuery.normalized),
          fetchOpenLibraryExternalRaw(secondaryQuery.normalized),
        ]);
        rawExternalSecondary = mergeExternalSeedCandidates(
          googleSecondary,
          openLibrarySecondary
        );
      }
    }

    const mergedExternalSeeds = mergeExternalSeedCandidates(
      rawExternalPrimary,
      rawExternalSecondary
    );
    externalCandidates = mergedExternalSeeds
      .map((entry) =>
        mapExternalCandidateToRanked(entry, queryCandidates, queryIntent, options.language)
      )
      .filter((entry): entry is RankedResult => Boolean(entry));

    const mergedAvailability = mergeCanonicalAvailability(
      externalCandidates,
      canonicalAvailability
    );
    canonicalAvailability = mergedAvailability.canonicalResults;
    externalCandidates = mergedAvailability.externalResults;
    googleCount = externalCandidates.filter((entry) => entry.source === "googleBooks").length;
    openLibraryCount = externalCandidates.filter((entry) => entry.source === "openLibrary").length;
  }

  const internalSearchDurationMs = Date.now() - totalStartMs;

  if (options.availabilityOnly) {
    externalCandidates = externalCandidates.filter((entry) => entry.available);
  }

  const canonicalResultsForResponse = options.availabilityOnly
    ? canonicalAvailability.filter((entry) => entry.available)
    : canonicalAvailability;
  const merged = [...canonicalResultsForResponse, ...externalCandidates].sort(compareRanked);
  phaseOrder.push("merge_sort");
  const totalDurationMs = Date.now() - totalStartMs;

  const paginated = merged.slice(startOffset, startOffset + limit);
  const nextOffset = startOffset + paginated.length;
  const hasMore = nextOffset < merged.length;
  const nextCursor = hasMore
    ? encodeCursor({
        offset: nextOffset,
        fingerprint,
      })
    : null;
  const mergedTopCoverageScores = topCoverageScores(merged as RankedResult[]);
  const topCoverageScore = mergedTopCoverageScores[0] ?? 0;

  logger.info("BOOK_SEARCH_V2_ENGINE_TRACE", {
    query: queryNorm.slice(0, 80),
    phaseOrder,
    canonicalPhaseCounts: {
      ...canonicalArtifacts.phaseCounts,
      canonical: canonicalResultsForResponse.length,
    },
    externalFallbackCalled: shouldUseExternalFallback,
    queryIntent,
    providers: {
      googleBooks: googleCount,
      openLibrary: openLibraryCount,
      merged: externalCandidates.length,
    },
  });

  return {
    results: paginated.map((entry) => {
      const {
        rankTier,
        computedScore,
        tokenCoverageRatio,
        popularityScore,
        engagementScore,
        recentActivityMs,
        normalizedTitle,
        canonicalProviderExternalIds,
        ...publicResult
      } = entry;
      void rankTier;
      void computedScore;
      void tokenCoverageRatio;
      void popularityScore;
      void engagementScore;
      void recentActivityMs;
      void normalizedTitle;
      void canonicalProviderExternalIds;
      return publicResult;
    }),
    nextCursor,
    hasMore,
    cursorUsed: startOffset > 0,
    canonicalCount: canonicalResultsForResponse.length,
    externalCount: externalCandidates.length,
    telemetry: {
      normalizedQuery: queryNorm,
      intentType: queryIntent,
      internalSearchDurationMs,
      totalDurationMs,
      externalFallbackTriggered: shouldUseExternalFallback,
      topCoverageScore,
      topCoverageScores: mergedTopCoverageScores,
      lowConfidenceTopThree,
      timestamp: new Date().toISOString(),
    },
  };
}
