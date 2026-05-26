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
import {
  SEARCH_STOPWORDS,
  normalizeSearchText,
  normalizeIsbn,
  tokenizeSearchText,
} from "../normalization/bookSearchNormalization";
import { buildCanonicalKey } from "../persistence/canonicalKey";
import { hasTransliteration, lookupPrimary } from "./transliterationMap";
import { readBookOntology, resolveBookOntologyForm } from "../ontology/bookOntology";

export interface SearchOptions {
  ebookOnly?: boolean;
  availabilityOnly?: boolean;
  language?: string;
  cursor?: string;
  limit?: number;
  __skipTransliteration?: boolean;
  __includeCognitionDiagnostics?: boolean;
  __includeInternalRankFields?: boolean;
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

type LiteraryAuthorityClass = "classic_work";

export type ProvisionalSearchRoleCategory =
  | "primary_work"
  | "secondary_literature"
  | "edition_variant"
  | "anthology_collection"
  | "study_guide"
  | "biography"
  | "external_manifestation"
  | "provider_noise"
  | "unknown";

export type SearchCognitionSuppressionReason =
  | "intent_gate_filtered"
  | "rank_confidence_filtered"
  | "canonical_identity_merge"
  | "fuzzy_canonical_duplicate"
  | "duplicate_external_identity"
  | "short_canonical_visible_authority"
  | "none";

export interface SearchResultCognitionTrace {
  resultId: string;
  resultType: SearchResultType;
  source: SearchSource;
  title: string;
  author: string;
  provisionalRole: ProvisionalSearchRoleCategory;
  humanSummary: string;
  ranking: {
    rankTier: number;
    confidence: number;
    computedScore: number;
    tokenCoverageRatio: number;
    languageMatchScore: number;
    popularityScore: number;
    recentActivityMs: number;
    workTypePriority: number;
  };
  canonical: {
    resultTypePriority: "canonical_first" | "external_after_canonical";
    workType: SearchWorkType;
    editionPresence: SearchEditionPresence;
    canonicalKeyPresent: boolean;
    literaryAuthorityClass: LiteraryAuthorityClass | null;
  };
  heuristics: {
    canonicalTitleAdjustment: number;
    literaryCorrection: number;
    derivativeSignals: string[];
    exactClassicAuthority: boolean;
    likelySecondaryTitle: boolean;
  };
  provider: {
    sourceClass: SearchSourceClass;
    readProvider: SearchReadProvider;
    availabilityMergedFromProvider: boolean;
    suppressionReason: SearchCognitionSuppressionReason;
  };
  manifestation: {
    collapseModel: "canonical_work_row" | "external_provider_manifestation";
    groupedCanonicalEditions: boolean;
    editionId: string;
    workId: string | null;
  };
}

export interface SearchCognitionDiagnostics {
  schemaVersion: 1;
  mode: "read_only_observability";
  behaviorImpact: "none";
  normalizedQuery: string;
  queryIntent: QueryIntent;
  phaseOrder: string[];
  provisionalRoleCategories: ProvisionalSearchRoleCategory[];
  canonicalPrioritization: {
    comparator: "resultType -> workType -> rankTier -> computedScore -> language -> popularity -> recency -> series -> year -> title";
    canonicalCount: number;
    externalCount: number;
  };
  providerBlending: {
    externalFallbackTriggered: boolean;
    googleBooksAcceptedCount: number;
    openLibraryAcceptedCount: number;
    visibleExternalCount: number;
    suppressedExternalCount: number;
    suppressionEvents: Array<{
      resultId: string;
      source: SearchSource;
      title: string;
      reason: SearchCognitionSuppressionReason;
    }>;
  };
  dominantFamily: {
    kind: "author" | "title" | null;
    confirmed: boolean;
  };
  resultTraces: SearchResultCognitionTrace[];
}

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
  canonicalTradition?: string;
  form?: string;
  subForm?: string;
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
  cognitionDiagnostics?: SearchCognitionDiagnostics;
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
  literaryAuthorityClass?: LiteraryAuthorityClass | null;
  seriesName?: string;
  seriesPosition?: number;
  publishedYear?: number;
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
const DOMINANT_FAMILY_MIN_CLUSTER = 2;
const DOMINANT_FAMILY_MIN_SCORE_GAP = 0.85;
const DOMINANT_FAMILY_DERIVATIVE_PATTERNS = [
  /\bselected\b/u,
  /\banthology\b/u,
  /\bcomplete works\b/u,
  /\bcollected\b/u,
  /\bmasterpieces\b/u,
  /\bbest of\b/u,
  /\bessays on\b/u,
  /\bintroduction to\b/u,
  /\bunderstanding\b/u,
  /\bin context\b/u,
];
const EXACT_TITLE_FAMILY_VARIANT_PATTERNS = [
  /\bannotated\b/u,
  /\billustrated\b/u,
  /\btranslated\b/u,
  /\btranslation\b/u,
  /\bnotes?\b/u,
  /\bcommentary\b/u,
  /\bcompanion\b/u,
  /\bintroduction\b/u,
  /\bedition\b/u,
];
const EXCLUDED_TYPE_PATTERN =
  /\b(academic journal|research paper|conference proceedings?|technical manual|whitepaper|government report|report|reports|thesis|magazine issue|in re|\bvs\b|hearing|hearings)\b/i;

const DERIVATIVE_TITLE_KEYWORDS = new Set([
  "coloring",
  "colouring",
  "cookbook",
  "dictionary",
  "encyclopedia",
  "glossary",
  "guide",
  "lexicon",
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

function readSearchOntologyMetadata(data: Record<string, unknown>): {
  canonicalTradition?: string;
  form?: string;
  subForm?: string;
} {
  const ontology = readBookOntology(data.ontology);
  const rawOntology = asRecord(data.ontology);
  const form = resolveBookOntologyForm(data);
  const subForm = asNonEmptyString(ontology?.subForm || rawOntology?.subForm);
  const canonicalTradition = asNonEmptyString(
    ontology?.canonicalTradition || rawOntology?.canonicalTradition
  );

  return {
    ...(canonicalTradition ? { canonicalTradition } : {}),
    ...(form ? { form } : {}),
    ...(subForm ? { subForm } : {}),
  };
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

function asNumber(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Detects if a string contains Arabic script characters.
 * Returns true if any character in the string is from the Arabic Unicode block.
 */
function hasArabicScript(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

/**
 * Detects if a normalized query should trigger transliteration lookup.
 * Returns true if:
 *   - Query contains NO Arabic script
 *   - At least one token in the query has a transliteration mapping
 */
function shouldEnableTransliteration(rawQuery: string, normalizedQuery: string): boolean {
  if (hasArabicScript(rawQuery)) {
    return false;
  }

  const tokens = tokenize(normalizedQuery);
  return tokens.some((token) => hasTransliteration(token));
}

/**
 * Builds a single transliteration-expanded query from tokens.
 * For each token, if a transliteration mapping exists, replaces with primary Arabic form.
 * Non-mapped tokens are kept unchanged.
 *
 * @param tokens — Array of normalized query tokens
 * @returns Single expanded query string, or empty string if input is empty
 *
 * @example
 * buildTransliterationQuery(["mahfouz", "cairo"]) → "محفوظ cairo"
 * buildTransliterationQuery(["unknown", "query"]) → "unknown query" (no mappings)
 * buildTransliterationQuery(["naguib", "mahfouz"]) → "naguib محفوظ"
 */
function buildTransliterationQuery(tokens: string[]): string {
  if (tokens.length === 0) return "";

  const expandedTokens = tokens.map((token) => {
    const arabicForm = lookupPrimary(token);
    return arabicForm || token;
  });

  return expandedTokens.join(" ");
}

/**
 * Determines if primary results are below the threshold for transliteration fallback.
 * Returns true if canonical count is very low (0-2) and external results are minimal.
 */
function shouldTriggerTransliterationFallback(
  visibleCanonicalCount: number,
  visibleExternalCount: number
): boolean {
  return visibleCanonicalCount < 3 && (visibleCanonicalCount + visibleExternalCount) < 5;
}

/**
 * Merges transliteration-derived results with primary results using canonicalKey deduplication.
 * When duplicates are found (same canonicalKey), keeps the canonical result.
 * Applies a ranking penalty to transliteration-derived results to ensure primary results rank higher.
 *
 * @param primaryResults — Original search results
 * @param translitResults — Results from transliteration fallback search
 * @returns Merged result list with duplicates removed and ranking penalty applied
 */
function mergeTransliterationResults(
  primaryResults: RankedResult[],
  translitResults: RankedResult[]
): RankedResult[] {
  const primaryByCanonicalKey = new Map<string, RankedResult>();
  const primaryIds = new Set<string>();

  for (const result of primaryResults) {
    const key = result.canonicalKey || `${result.source}:${result.id}`;
    primaryByCanonicalKey.set(key, result);
    primaryIds.add(result.id);
  }

  const TRANSLITERATION_PENALTY_MULTIPLIER = 0.85;
  const newResults: RankedResult[] = [];

  for (const translitResult of translitResults) {
    const key = translitResult.canonicalKey || `${translitResult.source}:${translitResult.id}`;

    if (primaryByCanonicalKey.has(key)) {
      continue;
    }

    if (!primaryIds.has(translitResult.id)) {
      const resultWithPenalty = translitResult as RankedResult;
      if (typeof resultWithPenalty.computedScore === "number") {
        resultWithPenalty.computedScore = Math.round(
          resultWithPenalty.computedScore * TRANSLITERATION_PENALTY_MULTIPLIER
        );
      }
      newResults.push(resultWithPenalty);
    }
  }

  return newResults;
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

function tokenize(value?: string | null): string[] {
  return tokenizeSearchText(value);
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
    hasCanonicalLegacyStoragePath(bookId, data);
  return hasVerifiedAttachment ? "in_app" : "unavailable";
}

function computeExternalEbookClass(hasExternalEbookSignal: boolean): SearchEbookClass {
  return hasExternalEbookSignal ? "external_link" : "unavailable";
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

function hasAuthoritativeEbookReadSignal(
  result: Pick<UnifiedSearchResult, "available" | "acquired" | "readAccess">
): boolean {
  return (
    result.readAccess === "in_app" ||
    result.readAccess === "trusted_external" ||
    result.acquired === true ||
    (result.available === true && result.readAccess !== "none")
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

  if (queryNorm === titleNorm && titleWords.length >= 1) {
    adjustment += 8.5;
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

  if (
    queryNorm !== titleNorm &&
    queryWords.length >= 2 &&
    titleWords.length > queryWords.length &&
    (titleNorm.startsWith(`${queryNorm} `) ||
      titleNorm.endsWith(` ${queryNorm}`) ||
      titleNorm.includes(` ${queryNorm} `))
  ) {
    adjustment -= 4.25;
  }

  if (titleWords.some((word) => DERIVATIVE_TITLE_KEYWORDS.has(word))) {
    adjustment -= 6;
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
  const shortAuthorQueryPresent = dedupedQueries.some(
    (entry) => entry.tokens.length > 0 && entry.tokens.length <= 2
  );

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

  if (shortAuthorQueryPresent && bestAuthorLikeStrength >= 4) {
    return "AUTHOR_INTENT";
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

// ── Circuit Breaker ────────────────────────────────────────────────────────
// Module-level state persists across warm Cloud Function invocations within
// the same container, providing protection without Firestore writes.
// Cold starts reset state automatically (safe default: CLOSED).

const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_RESET_WINDOW_MS = 60_000;   // failure counter resets after 1 min
const CIRCUIT_OPEN_DURATION_MS = 30_000;  // circuit stays open 30 s before probing

type ProviderKey = "googleBooks" | "openLibrary";

type ProviderCircuitState = {
  failureCount: number;
  windowStart: number;     // epoch ms when the current failure window began
  openUntil: number;       // epoch ms until which circuit remains OPEN (0 = CLOSED)
  halfOpenPending: boolean; // a probe call is already in flight
};

const circuitState: Record<ProviderKey, ProviderCircuitState> = {
  googleBooks: { failureCount: 0, windowStart: 0, openUntil: 0, halfOpenPending: false },
  openLibrary: { failureCount: 0, windowStart: 0, openUntil: 0, halfOpenPending: false },
};

/**
 * Returns whether a call to the given provider should be allowed through.
 *
 * - "allow"  – circuit is CLOSED; proceed normally.
 * - "probe"  – circuit is OPEN but the reset window has elapsed; one probe
 *              call is permitted to test recovery (half-open state).
 * - "reject" – circuit is OPEN and a probe is already in flight; skip call
 *              and return empty results immediately.
 */
function checkCircuit(provider: ProviderKey): "allow" | "probe" | "reject" {
  const state = circuitState[provider];
  const now = Date.now();
  if (state.openUntil > now) {
    if (!state.halfOpenPending) {
      state.halfOpenPending = true;
      return "probe";
    }
    return "reject";
  }
  return "allow";
}

function recordCircuitSuccess(provider: ProviderKey): void {
  const state = circuitState[provider];
  state.failureCount = 0;
  state.openUntil = 0;
  state.halfOpenPending = false;
}

function recordCircuitFailure(provider: ProviderKey): void {
  const state = circuitState[provider];
  const now = Date.now();
  // Always clear half-open probe flag so the next window can try again.
  state.halfOpenPending = false;
  // Roll the failure window if it has expired.
  if (now - state.windowStart > CIRCUIT_RESET_WINDOW_MS) {
    state.failureCount = 0;
    state.windowStart = now;
  }
  state.failureCount += 1;
  if (state.failureCount >= CIRCUIT_FAILURE_THRESHOLD) {
    state.openUntil = now + CIRCUIT_OPEN_DURATION_MS;
    logger.warn("[CIRCUIT_BREAKER][OPEN]", {
      provider,
      failureCount: state.failureCount,
      openUntilMs: state.openUntil,
    });
  }
}

async function fetchJsonWithTimeout(params: {
  url: string;
  provider: "googleBooks" | "openLibrary";
}): Promise<Record<string, unknown> | null> {
  const circuitDecision = checkCircuit(params.provider);
  if (circuitDecision === "reject") {
    return null;
  }

  // Timeout behavior is unchanged — circuit breaker wraps it, not replaces it.
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), EXTERNAL_PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch(params.url, { signal: controller.signal });
    if (!response.ok) {
      recordCircuitFailure(params.provider);
      return null;
    }
    const payload = (await response.json()) as Record<string, unknown>;
    recordCircuitSuccess(params.provider);
    return payload;
  } catch (error) {
    recordCircuitFailure(params.provider);
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
  if (authorExact) confidence += params.queryIntent === "AUTHOR_INTENT" ? 0.72 : 0.56;
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

  if (
    queryTokens.length === 1 &&
    params.queryIntent !== "AUTHOR_INTENT" &&
    titlePrefix &&
    titleHits >= 1
  ) {
    const broadTitleScore = tierSubScore + synopsisSignal;
    return {
      confidence: Math.max(confidence, 0.73),
      rankTier: 2,
      computedScore: unknownAuthor ? broadTitleScore - 1.25 : broadTitleScore,
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
  const titleEnNorm = normalizeSearchText(params.result.titleEn || "");
  const titleArNorm = normalizeSearchText(params.result.titleAr || "");
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
  const queriedSurname = queryTokens[queryTokens.length - 1] || "";
  const titleStartsWithFullQuery =
    titleNorm === params.query.normalized ||
    titleNorm.startsWith(`${params.query.normalized} `);
  const titleStartsWithQueriedSurname =
    Boolean(queriedSurname) &&
    titleTokens[0] === queriedSurname &&
    titleTokens.length > 1;
  const trailingAfterQuery = titleStartsWithFullQuery
    ? titleNorm.slice(params.query.normalized.length).trim()
    : titleStartsWithQueriedSurname
      ? titleTokens.slice(1).join(" ").trim()
      : "";
  const titleLeadingHardSecondary =
    (titleLeadingSurname || titleStartsWithFullQuery || titleStartsWithQueriedSurname) &&
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
      /\b(reader|companion|introduction|letters?|essays?|writer|guide|study|analysis|summary|set|dictionary|encyclopedia|glossary|lexicon)\b/u.test(
        trailingAfterQuery || titleNorm
      ));
  const exactTitleSuperstring =
    params.queryIntent === "TITLE_INTENT" &&
    queryTokens.length >= 2 &&
    titleNorm !== params.query.normalized &&
    titleNorm.startsWith(`${params.query.normalized} `);
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
    [titleNorm, titleEnNorm, titleArNorm].includes(params.query.normalized) &&
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
      adjustment -= 2.45;
    }

    if (titleLeadingSurname && !strongCanonicalPrimaryWork) {
      adjustment -= 1.8;
    }

    if (titleLeadingHardSecondary) {
      adjustment -= 2.85;
    }

    if (!strongCanonicalPrimaryWork && titleDominatedByAuthorName && strongAuthorMatch) {
      adjustment -= 0.9;
    }

    if (strongSecondaryCanonicalRow) {
      adjustment -= anthologyPattern ? 0.95 : 0.55;
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
    adjustment += params.result.resultType === "canonical" ? 5.4 : 4.4;
  }

  if (exactTitleSuperstring) {
    adjustment -= 3.6;
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

  return `canonical:${buildCanonicalKey({ title: result.title, author: result.authors[0] || result.authorEn || "unknown" })}`;
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

/**
 * Fuzzy dedup fallback for ISBN-less books.
 * Returns true if external result appears to be a duplicate of canonical result
 * based on title and author similarity.
 *
 * Conservative: only matches when title tokens are identical and author surnames match.
 * Avoids false positives for books with similar titles by different authors.
 */
function isLikelyFuzzyDuplicate(
  externalResult: UnifiedSearchResult,
  canonicalResult: UnifiedSearchResult
): boolean {
  const extTitleNorm = normalizeSearchText(externalResult.title);
  const canTitleNorm = normalizeSearchText(canonicalResult.title);

  if (!extTitleNorm || !canTitleNorm) return false;

  const extTitleTokens = new Set(tokenize(extTitleNorm));
  const canTitleTokens = new Set(tokenize(canTitleNorm));

  if (extTitleTokens.size === 0 || canTitleTokens.size === 0) return false;

  const sharedTokens = Array.from(extTitleTokens).filter((token) =>
    canTitleTokens.has(token)
  ).length;
  const totalTokens = Math.max(extTitleTokens.size, canTitleTokens.size);

  const titleSimilarity = sharedTokens / totalTokens;

  if (titleSimilarity < 0.8) return false;

  const extAuthors = externalResult.authors
    .map((author) => normalizeSearchText(author))
    .filter((author) => author.length > 0);
  const canAuthors = canonicalResult.authors
    .map((author) => normalizeSearchText(author))
    .filter((author) => author.length > 0);

  if (extAuthors.length === 0 || canAuthors.length === 0) return false;

  const extSurname = extAuthors[0]?.split(" ").pop() || "";
  const canSurname = canAuthors[0]?.split(" ").pop() || "";

  if (!extSurname || !canSurname) return false;

  const surnameMatch =
    extSurname === canSurname ||
    boundedEditDistance(extSurname, canSurname, 1) !== null;

  return surnameMatch;
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
  if (asNonEmptyString(data.mergedInto)) {
    return null;
  }

  const title =
    asNonEmptyString(data.title) ||
    asNonEmptyString(data.titleEn) ||
    "";
  if (!title) return null;
  const normalizedTitle = asNonEmptyString(data.normalizedTitle) || normalizeSearchText(title);
  const literaryAuthorityClass =
    asNonEmptyString(data.literaryAuthorityClass) === "classic_work"
      ? "classic_work"
      : null;
  const canonicalStandaloneWork = asNonEmptyString(data.workType) === "canonical";
  const exactClassicTitleAdmission = Boolean(
    literaryAuthorityClass === "classic_work" &&
      canonicalStandaloneWork &&
      queryCandidates.some((queryCandidate) => {
        const wordCount = splitNormalizedWords(queryCandidate.normalized).length;
        if (wordCount < 2 || wordCount > 3) return false;
        return resolveTitleVariants([title, asNonEmptyString(data.titleEn), asNonEmptyString(data.titleAr)])
          .map((entry) => normalizeSearchText(entry))
          .some((entry) => entry === queryCandidate.normalized);
      })
  );

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
  if (options.ebookOnly && !hasAuthoritativeEbookReadSignal(ownedReadSignals)) {
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

  if (!exactClassicTitleAdmission && rank.rankTier > 0 && rank.confidence < CONFIDENCE_THRESHOLD) {
    return null;
  }
  if (!exactClassicTitleAdmission && rank.rankTier === 3 && rank.tokenCoverageRatio < 0.5) {
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

  const seriesName = asNonEmptyString(data.seriesName);
  const seriesPosition = asNumber(data.seriesPosition);
  const publishedYear = asNumber(data.publishedYear);

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
    ...readSearchOntologyMetadata(data),
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
    ...(literaryAuthorityClass ? { literaryAuthorityClass } : {}),
    ...(seriesName ? { seriesName } : {}),
    ...(seriesPosition ? { seriesPosition } : {}),
    ...(publishedYear ? { publishedYear } : {}),
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
  const COMPACT_CLASSIC_LEADING_TOKENS = new Set(["the", "a", "an", "la", "le", "el"]);
  const correctedAuthorPhraseBySurname = new Map<string, string[]>();
  const authorAliasByQuery = new Map<string, Set<string>>();
  const exactCompactTitleMatchByQuery = new Set<string>();
  const exactAliasAdmittedByQuery = new Set<string>();
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
  const resolveDocAuthors = (rawData: Record<string, unknown>): string[] =>
    asStringArray(rawData.authors).length > 0
      ? asStringArray(rawData.authors)
      : [
          asNonEmptyString(rawData.authorEn) ||
            asNonEmptyString(rawData.author) ||
            asNonEmptyString(rawData.authorAr),
        ].filter(Boolean);
  const resolveNormalizedTitleVariants = (rawData: Record<string, unknown>): string[] =>
    Array.from(
      new Set(
        [
          asNonEmptyString(rawData.title),
          asNonEmptyString(rawData.titleEn),
          asNonEmptyString(rawData.titleAr),
        ]
          .map((entry) => normalizeSearchText(entry))
          .filter((entry) => entry.length > 0)
      )
    );
  const deriveAuthorLikeTitleAliases = (
    rawData: Record<string, unknown>,
    surname: string
  ): string[] => {
    if (!surname) return [];
    const aliases = new Set<string>();
    for (const titleNorm of resolveNormalizedTitleVariants(rawData)) {
      const words = splitNormalizedWords(titleNorm);
      if (words.length === 2 && words[1] === surname) {
        aliases.add(words.join(" "));
      } else if (words.length >= 3 && words[1] === surname) {
        aliases.add(words.slice(0, 2).join(" "));
      }
    }
    return Array.from(aliases);
  };
  const isLikelyAuthorQuery = (queryCandidate: QueryCandidate): boolean =>
    (queryCandidate.tokens.length === 1 && queryCandidate.normalized.length >= MIN_PREFIX_SEED_LENGTH) ||
    (queryCandidate.tokens.length === 2 &&
      queryCandidate.tokens.every((token) => token.length >= MIN_PREFIX_SEED_LENGTH));
  const isShortArticleLedTitleQuery = (queryCandidate: QueryCandidate): boolean => {
    const queryWords = splitNormalizedWords(queryCandidate.normalized);
    return (
      queryWords.length >= 2 &&
      queryWords.length <= 3 &&
      COMPACT_CLASSIC_LEADING_TOKENS.has(queryWords[0] || "")
    );
  };
  const isCompactTitleQuery = (queryCandidate: QueryCandidate): boolean =>
    splitNormalizedWords(queryCandidate.normalized).length === 2;
  const shouldPrioritizeAuthorBeforeCompact = (queryCandidate: QueryCandidate): boolean =>
    queryCandidate.tokens.length === 2 &&
    queryCandidate.tokens.every((token) => token.length >= MIN_PREFIX_SEED_LENGTH) &&
    !COMPACT_CLASSIC_LEADING_TOKENS.has(queryCandidate.tokens[0] || "");
  const isCompactClassicQuery = (queryCandidate: QueryCandidate): boolean =>
    isCompactTitleQuery(queryCandidate) &&
    COMPACT_CLASSIC_LEADING_TOKENS.has(queryCandidate.tokens[0] || "");
  const matchesAuthorPhrase = (authorNorm: string, queryCandidate: QueryCandidate): boolean => {
    if (!authorNorm) return false;
    const surname = queryCandidate.tokens[queryCandidate.tokens.length - 1] || "";
    if (authorNorm === queryCandidate.normalized) return true;
    if (authorNorm.startsWith(`${queryCandidate.normalized} `)) return true;
    if (
      surname &&
      (authorNorm === surname || authorNorm.endsWith(` ${surname}`))
    ) {
      return true;
    }
    return false;
  };
  const collectAuthorPhraseExpansions = (surname: string): string[] => {
    if (!surname) return [];
    const expansions = new Set(correctedAuthorPhraseBySurname.get(surname) || []);
    for (const doc of rawDocs.values()) {
      const authors = resolveDocAuthors(doc.data);
      for (const author of authors) {
        const normalizedAuthor = normalizeSearchText(author);
        const authorTokens = tokenize(normalizedAuthor);
        if (
          authorTokens.length >= 2 &&
          authorTokens[authorTokens.length - 1] === surname
        ) {
          expansions.add(normalizedAuthor);
        }
      }
      deriveAuthorLikeTitleAliases(doc.data, surname).forEach((alias) => expansions.add(alias));
    }
    return Array.from(expansions).slice(0, 4);
  };
  const safeSnapshotDocs = async (
    run: () => Promise<{ docs: Array<{ id: string; data: () => Record<string, unknown> }> }>
  ): Promise<Array<{ id: string; data: () => Record<string, unknown> }>> => {
    try {
      const snapshot = await run();
      return snapshot.docs as Array<{ id: string; data: () => Record<string, unknown> }>;
    } catch (error) {
      logger.warn("BOOK_SEARCH_V2_CANONICAL_QUERY_FAILED", {
        error: String(error),
      });
      return [];
    }
  };
  const getAuthorAliasesForQuery = (queryCandidate: QueryCandidate): string[] =>
    Array.from(authorAliasByQuery.get(queryCandidate.normalized) || []);
  const hasExactCompactAliasMatch = (
    queryCandidate: QueryCandidate,
    titleVariantsNorm: string[]
  ): boolean =>
    isCompactTitleQuery(queryCandidate) &&
    titleVariantsNorm.some((entry) => entry === queryCandidate.normalized);
  const isExactClassicCanonicalMatch = (
    rawData: Record<string, unknown>,
    queryCandidate: QueryCandidate,
    titleVariantsNorm: string[]
  ): boolean =>
    asNonEmptyString(rawData.workType) === "canonical" &&
    asNonEmptyString(rawData.literaryAuthorityClass) === "classic_work" &&
    (asNonEmptyString(rawData.normalizedTitle) || titleVariantsNorm[0] || "") === queryCandidate.normalized;
  const isSecondaryAuthorTitleShape = (
    queryCandidate: QueryCandidate,
    titleNorm: string
  ): boolean => {
    if (!titleNorm) return false;
    const surname = queryCandidate.tokens[queryCandidate.tokens.length - 1] || "";
    if (titleNorm === queryCandidate.normalized) return true;
    if (titleNorm.startsWith(`${queryCandidate.normalized} `)) return true;
    if (surname && titleNorm.startsWith(`${surname} `)) return true;
    return false;
  };
  const isLexicalNeighborForCompactTitle = (
    queryCandidate: QueryCandidate,
    titleVariantsNorm: string[]
  ): boolean => {
    if (!isCompactTitleQuery(queryCandidate)) return false;
    if (titleVariantsNorm.some((entry) => entry === queryCandidate.normalized)) return false;
    return titleVariantsNorm.some((entry) => {
      const entryTokens = new Set(tokenize(entry));
      return (
        entry.startsWith(`${queryCandidate.normalized} `) ||
        queryCandidate.tokens.every((token) => entryTokens.has(token))
      );
    });
  };

  const registerSnapshot = (
    docs: Array<{ id: string; data: () => Record<string, unknown> }>,
    phase: keyof CanonicalRetrievalArtifacts["phaseCounts"],
    queryCandidate: QueryCandidate,
    optionsOverride: {
      exactAliasOnly?: boolean;
      exactClassicCanonicalOnly?: boolean;
      suppressCompactNeighborSkip?: boolean;
    } = {}
  ) => {
    const shortArticleLedTitleQuery = isShortArticleLedTitleQuery(queryCandidate);
    const preprocessed = docs.map((doc) => {
      const rawData = doc.data() as Record<string, unknown>;
      const authors = resolveDocAuthors(rawData);
      const normalizedAuthors = authors
        .map((entry) => normalizeSearchText(entry))
        .filter((entry) => entry.length > 0);
      const titleVariantsNorm = resolveNormalizedTitleVariants(rawData);
      return {
        doc,
        rawData,
        normalizedAuthors,
        titleVariantsNorm,
      };
    });

    const queryAliases =
      authorAliasByQuery.get(queryCandidate.normalized) || new Set<string>();
    for (const entry of preprocessed) {
      if (
        entry.normalizedAuthors.some((authorNorm) => matchesAuthorPhrase(authorNorm, queryCandidate))
      ) {
        entry.normalizedAuthors.forEach((authorNorm) => queryAliases.add(authorNorm));
      }
      if (queryCandidate.tokens.length === 1 && !shortArticleLedTitleQuery) {
        const surname = queryCandidate.tokens[queryCandidate.tokens.length - 1] || "";
        deriveAuthorLikeTitleAliases(entry.rawData, surname).forEach((alias) =>
          queryAliases.add(alias)
        );
      }
      if (hasExactCompactAliasMatch(queryCandidate, entry.titleVariantsNorm)) {
        exactCompactTitleMatchByQuery.add(queryCandidate.normalized);
      }
    }
    if (queryAliases.size > 0) {
      authorAliasByQuery.set(queryCandidate.normalized, queryAliases);
    }

    for (const doc of docs) {
      const rawData = doc.data() as Record<string, unknown>;
      rawDocs.set(doc.id, {
        id: doc.id,
        data: rawData,
      });
      const normalizedAuthors = resolveDocAuthors(rawData)
        .map((entry) => normalizeSearchText(entry))
        .filter((entry) => entry.length > 0);
      const titleVariantsNorm = resolveNormalizedTitleVariants(rawData);
      const primaryTitleNorm = titleVariantsNorm[0] || "";
      const authorAliases = getAuthorAliasesForQuery(queryCandidate);
      const hasAuthorAliasEvidence = authorAliases.length > 0;
      const authorMatchesAlias = normalizedAuthors.some((authorNorm) =>
        authorAliases.includes(authorNorm)
      );
      const exactClassicCanonicalRow = isExactClassicCanonicalMatch(
        rawData,
        queryCandidate,
        titleVariantsNorm
      );
      const titleLooksLikeSecondaryAuthorRow = isSecondaryAuthorTitleShape(
        queryCandidate,
        primaryTitleNorm
      );
      if (
        isLikelyAuthorQuery(queryCandidate) &&
        !shortArticleLedTitleQuery &&
        !exactClassicCanonicalRow &&
        hasAuthorAliasEvidence &&
        titleLooksLikeSecondaryAuthorRow &&
        !authorMatchesAlias
      ) {
        continue;
      }
      if (
        !optionsOverride.suppressCompactNeighborSkip &&
        exactCompactTitleMatchByQuery.has(queryCandidate.normalized) &&
        isLexicalNeighborForCompactTitle(queryCandidate, titleVariantsNorm)
      ) {
        continue;
      }
      if (
        optionsOverride.exactAliasOnly &&
        !titleVariantsNorm.some((entry) => entry === queryCandidate.normalized)
      ) {
        continue;
      }
      if (
        optionsOverride.exactClassicCanonicalOnly &&
        !isExactClassicCanonicalMatch(rawData, queryCandidate, titleVariantsNorm)
      ) {
        continue;
      }
      const mapped = mapCanonicalBook(doc.id, rawData, candidates, options);
      if (!mapped) continue;
      if (!isLikelyBook(mapped.title, "book")) continue;
      if (
        (optionsOverride.exactAliasOnly &&
          titleVariantsNorm.some((entry) => entry === queryCandidate.normalized)) ||
        optionsOverride.exactClassicCanonicalOnly
      ) {
        exactAliasAdmittedByQuery.add(queryCandidate.normalized);
      }
      dedup.set(doc.id, mapped);
      phaseCounts[phase] += 1;
    }
  };

  for (const queryCandidate of candidates) {
    const isbnQuery = parseIsbnQuery(queryCandidate.normalized);
    const shortArticleLedTitleQuery = isShortArticleLedTitleQuery(queryCandidate);
    const authorLikeQuery =
      !shortArticleLedTitleQuery && isLikelyAuthorQuery(queryCandidate);
    const compactTitleQuery = isCompactTitleQuery(queryCandidate);
    const prioritizeAuthorBeforeCompact = shouldPrioritizeAuthorBeforeCompact(queryCandidate);
    const compactClassicQuery = isCompactClassicQuery(queryCandidate);
    const shortCanonicalTitleQuery =
      splitNormalizedWords(queryCandidate.normalized).length >= 2 &&
      splitNormalizedWords(queryCandidate.normalized).length <= 3;
    const singleTokenAuthorQuery =
      authorLikeQuery && queryCandidate.tokens.length === 1;

    if (isbnQuery.isbn13) {
      registerSnapshot(
        await safeSnapshotDocs(() =>
          books.where("isbn13", "==", isbnQuery.isbn13).limit(5).get()
        ),
        "isbn",
        queryCandidate
      );
    }

    if (isbnQuery.isbn10) {
      registerSnapshot(
        await safeSnapshotDocs(() =>
          books.where("isbn10", "==", isbnQuery.isbn10).limit(5).get()
        ),
        "isbn",
        queryCandidate
      );
    }

    if (compactTitleQuery && !prioritizeAuthorBeforeCompact) {
      if (shortCanonicalTitleQuery) {
        registerSnapshot(
          await safeSnapshotDocs(() =>
            books
              .where("normalizedTitle", "==", queryCandidate.normalized)
              .limit(INTERNAL_FETCH_POOL)
              .get()
          ),
          "prefix",
          queryCandidate,
          {
            exactClassicCanonicalOnly: true,
            suppressCompactNeighborSkip: true,
          }
        );
      }
      registerSnapshot(
        await safeSnapshotDocs(() =>
          books
            .where("normalizedTitle", "==", queryCandidate.normalized)
            .limit(INTERNAL_FETCH_POOL)
            .get()
        ),
        "prefix",
        queryCandidate
      );
      registerSnapshot(
        await safeSnapshotDocs(() =>
          books
            .where("search.tokens", "array-contains-any", queryCandidate.tokens.slice(0, 10))
            .limit(INTERNAL_FETCH_POOL)
            .get()
        ),
        "tokens",
        queryCandidate,
        {
          exactAliasOnly: true,
          suppressCompactNeighborSkip: true,
        }
      );
    }

    if (singleTokenAuthorQuery && queryCandidate.tokens.length > 0) {
      registerSnapshot(
        await safeSnapshotDocs(() =>
          books
            .where("search.tokens", "array-contains-any", queryCandidate.tokens.slice(0, 10))
            .limit(INTERNAL_FETCH_POOL)
            .get()
        ),
        "tokens",
        queryCandidate
      );
    }

    if (authorLikeQuery && queryCandidate.normalized.length >= MIN_PREFIX_SEED_LENGTH) {
      const authorQueryValues =
        queryCandidate.tokens.length === 1
          ? Array.from(
              new Set([
                queryCandidate.normalized,
                ...collectAuthorPhraseExpansions(queryCandidate.normalized),
              ])
            ).slice(0, 10)
          : [queryCandidate.normalized];
      const authorDocs =
        authorQueryValues.length > 1
          ? await safeSnapshotDocs(() =>
              books
                .where("authorNamesNormalized", "array-contains-any", authorQueryValues)
                .limit(INTERNAL_FETCH_POOL)
                .get()
            )
          : await safeSnapshotDocs(() =>
              books
                .where("authorNamesNormalized", "array-contains", queryCandidate.normalized)
                .limit(INTERNAL_FETCH_POOL)
                .get()
            );
      registerSnapshot(authorDocs, "author", queryCandidate);
    }

    if (compactTitleQuery && prioritizeAuthorBeforeCompact) {
      if (shortCanonicalTitleQuery) {
        registerSnapshot(
          await safeSnapshotDocs(() =>
            books
              .where("normalizedTitle", "==", queryCandidate.normalized)
              .limit(INTERNAL_FETCH_POOL)
              .get()
          ),
          "prefix",
          queryCandidate,
          {
            exactClassicCanonicalOnly: true,
            suppressCompactNeighborSkip: true,
          }
        );
      }
      registerSnapshot(
        await safeSnapshotDocs(() =>
          books
            .where("normalizedTitle", "==", queryCandidate.normalized)
            .limit(INTERNAL_FETCH_POOL)
            .get()
        ),
        "prefix",
        queryCandidate
      );
      registerSnapshot(
        await safeSnapshotDocs(() =>
          books
            .where("search.tokens", "array-contains-any", queryCandidate.tokens.slice(0, 10))
            .limit(INTERNAL_FETCH_POOL)
            .get()
        ),
        "tokens",
        queryCandidate,
        {
          exactAliasOnly: true,
          suppressCompactNeighborSkip: true,
        }
      );
    }

    const exactCompactResolved =
      compactClassicQuery && exactAliasAdmittedByQuery.has(queryCandidate.normalized);
    if (exactCompactResolved) {
      continue;
    }

    if (!singleTokenAuthorQuery && queryCandidate.tokens.length > 0) {
      registerSnapshot(
        await safeSnapshotDocs(() =>
          books
            .where("search.tokens", "array-contains-any", queryCandidate.tokens.slice(0, 10))
            .limit(INTERNAL_FETCH_POOL)
            .get()
        ),
        "tokens",
        queryCandidate
      );
    }

    if (queryCandidate.normalized.length >= 2) {
      registerSnapshot(
        await safeSnapshotDocs(() =>
          books
            .orderBy("normalizedTitle")
            .startAt(queryCandidate.normalized)
            .endAt(`${queryCandidate.normalized}\uf8ff`)
            .limit(INTERNAL_FETCH_POOL)
            .get()
        ),
        "prefix",
        queryCandidate
      );

      if (queryCandidate.normalized.length >= MIN_PREFIX_SEED_LENGTH) {
        const canUseTitleAuthorPrefix =
          !authorLikeQuery || getAuthorAliasesForQuery(queryCandidate).length > 0;
        if (canUseTitleAuthorPrefix) {
          registerSnapshot(
            await safeSnapshotDocs(() =>
              books
                .orderBy("searchableTitleAuthor")
                .startAt(queryCandidate.normalized)
                .endAt(`${queryCandidate.normalized}\uf8ff`)
                .limit(INTERNAL_FETCH_POOL)
                .get()
            ),
            "titleAuthor",
            queryCandidate
          );
        }

        if (!authorLikeQuery) {
          registerSnapshot(
            await safeSnapshotDocs(() =>
              books
                .where("authorNamesNormalized", "array-contains", queryCandidate.normalized)
                .limit(INTERNAL_FETCH_POOL)
                .get()
            ),
            "author",
            queryCandidate
          );
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

    mapped.push({
      externalId: key,
      source: "openLibrary",
      title,
      authors: normalizedAuthors,
      description: "",
      coverUrl,
      language,
      isbn13: isbn13 || undefined,
      isbn10: isbn10 || undefined,
      hasExternalEbookSignal: false,
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

  const broadProviderRescue =
    rank.query.tokens.length === 1 &&
    rank.query.normalized.length >= MIN_PREFIX_SEED_LENGTH &&
    normalizeSearchText(candidate.title).startsWith(rank.query.normalized);
  if (
    rank.rankTier > 0 &&
    rank.confidence < CONFIDENCE_THRESHOLD &&
    !(rank.rankTier === 3 && rank.tokenCoverageRatio >= 0.5) &&
    !broadProviderRescue
  ) {
    return null;
  }
  if (rank.rankTier === 3 && rank.tokenCoverageRatio < 0.5 && !broadProviderRescue) {
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
    canonicalKey: buildCanonicalKey({ title: candidate.title, author: authors[0] }),
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

  const aSeriesName = a.seriesName || "";
  const bSeriesName = b.seriesName || "";
  
  if (aSeriesName && bSeriesName && aSeriesName === bSeriesName) {
    const aPosition = a.seriesPosition || 0;
    const bPosition = b.seriesPosition || 0;
    if (aPosition !== bPosition) {
      return aPosition - bPosition;
    }
  }
  
  if ((a.publishedYear || 0) !== (b.publishedYear || 0)) {
    return (b.publishedYear || 0) - (a.publishedYear || 0);
  }
  return a.normalizedTitle.localeCompare(b.normalizedTitle);
}

const PROVISIONAL_ROLE_CATEGORIES: ProvisionalSearchRoleCategory[] = [
  "primary_work",
  "secondary_literature",
  "edition_variant",
  "anthology_collection",
  "study_guide",
  "biography",
  "external_manifestation",
  "provider_noise",
  "unknown",
];

function collectDerivativeSignals(result: RankedResult): string[] {
  const titleNorm = normalizeSearchText(result.title);
  const signals: string[] = [];

  if (!titleNorm) {
    return signals;
  }

  if (hasBiographyCriticismPattern(titleNorm)) {
    signals.push("biography_or_criticism_pattern");
  }
  if (hasAnthologyPattern(titleNorm)) {
    signals.push("anthology_or_collection_pattern");
  }
  if (splitNormalizedWords(titleNorm).some((word) => DERIVATIVE_TITLE_KEYWORDS.has(word))) {
    signals.push("derivative_title_keyword");
  }
  if (EXACT_TITLE_FAMILY_VARIANT_PATTERNS.some((pattern) => pattern.test(titleNorm))) {
    signals.push("edition_or_commentary_variant_pattern");
  }
  if (isIntentGateSecondaryTitle(titleNorm)) {
    signals.push("intent_gate_secondary_title");
  }
  if (result.resultType === "external") {
    signals.push("external_provider_manifestation");
  }
  if (result.literaryAuthorityClass === "classic_work") {
    signals.push("classic_work_authority");
  }

  return signals;
}

function classifyProvisionalSearchRole(result: RankedResult): ProvisionalSearchRoleCategory {
  const titleNorm = normalizeSearchText(result.title);
  const titleWords = splitNormalizedWords(titleNorm);

  if (result.resultType === "external") {
    return isLikelyBook(result.title, result.description || "")
      ? "external_manifestation"
      : "provider_noise";
  }

  if (!titleNorm) {
    return "unknown";
  }

  if (hasAnthologyPattern(titleNorm)) {
    return "anthology_collection";
  }

  if (/\bbiography\b/u.test(titleNorm) || /\blife\b/u.test(titleNorm)) {
    return "biography";
  }

  if (/\b(study|guide|summary|analysis)\b/u.test(titleNorm)) {
    return "study_guide";
  }

  if (hasBiographyCriticismPattern(titleNorm) || isIntentGateSecondaryTitle(titleNorm)) {
    return "secondary_literature";
  }

  if (
    result.workType === "edition" ||
    result.editionPresence === "edition" ||
    EXACT_TITLE_FAMILY_VARIANT_PATTERNS.some((pattern) => pattern.test(titleNorm))
  ) {
    return "edition_variant";
  }

  if (
    result.resultType === "canonical" &&
    result.workType === "work" &&
    titleWords.length > 0
  ) {
    return "primary_work";
  }

  return "unknown";
}

function isExactClassicAuthorityResult(
  result: RankedResult,
  queryCandidates: QueryCandidate[]
): boolean {
  if (result.literaryAuthorityClass !== "classic_work") {
    return false;
  }
  const titleVariants = resolveIntentGateTitleVariants(result);
  return queryCandidates.some((query) => titleVariants.includes(query.normalized));
}

function summarizeCognitionTrace(params: {
  result: RankedResult;
  role: ProvisionalSearchRoleCategory;
  literaryCorrection: number;
  canonicalTitleAdjustment: number;
  suppressionReason: SearchCognitionSuppressionReason;
}): string {
  const result = params.result;
  const priority =
    result.resultType === "canonical"
      ? "canonical catalog result"
      : "external provider manifestation";
  const roleText = params.role.replace(/_/gu, " ");
  const correctionParts = [
    params.canonicalTitleAdjustment !== 0
      ? `canonical title adjustment ${params.canonicalTitleAdjustment}`
      : "",
    params.literaryCorrection !== 0
      ? `literary correction ${params.literaryCorrection}`
      : "",
    params.suppressionReason !== "none"
      ? `provider handling ${params.suppressionReason}`
      : "",
  ].filter(Boolean);
  const correctionText =
    correctionParts.length > 0 ? ` Signals: ${correctionParts.join(", ")}.` : "";

  return `${priority}; inferred role ${roleText}; rank tier ${result.rankTier}; score ${result.computedScore}.${correctionText}`;
}

function buildProviderSuppressionEvents(params: {
  beforeMerge: RankedResult[];
  afterMerge: RankedResult[];
  canonicalResults: RankedResult[];
  visibleExternalResults: RankedResult[];
}): Array<{
  resultId: string;
  source: SearchSource;
  title: string;
  reason: SearchCognitionSuppressionReason;
}> {
  const events: Array<{
    resultId: string;
    source: SearchSource;
    title: string;
    reason: SearchCognitionSuppressionReason;
  }> = [];
  const afterMergeIds = new Set(params.afterMerge.map((entry) => entry.id));
  const visibleIds = new Set(params.visibleExternalResults.map((entry) => entry.id));
  const seen = new Set<string>();

  for (const result of params.beforeMerge) {
    if (afterMergeIds.has(result.id)) {
      continue;
    }

    let reason: SearchCognitionSuppressionReason = "duplicate_external_identity";
    if (
      params.canonicalResults.some((canonical) =>
        buildIdentityKeys(result).some((identity) => buildIdentityKeys(canonical).includes(identity))
      )
    ) {
      reason = "canonical_identity_merge";
    } else if (params.canonicalResults.some((canonical) => isLikelyFuzzyDuplicate(result, canonical))) {
      reason = "fuzzy_canonical_duplicate";
    }

    if (!seen.has(result.id)) {
      events.push({
        resultId: result.id,
        source: result.source,
        title: result.title,
        reason,
      });
      seen.add(result.id);
    }
  }

  for (const result of params.afterMerge) {
    if (visibleIds.has(result.id) || seen.has(result.id)) {
      continue;
    }
    events.push({
      resultId: result.id,
      source: result.source,
      title: result.title,
      reason: "short_canonical_visible_authority",
    });
    seen.add(result.id);
  }

  return events;
}

function buildSearchCognitionDiagnostics(params: {
  normalizedQuery: string;
  queryCandidates: QueryCandidate[];
  queryIntent: QueryIntent;
  phaseOrder: string[];
  results: RankedResult[];
  canonicalCount: number;
  externalCount: number;
  externalFallbackTriggered: boolean;
  googleCount: number;
  openLibraryCount: number;
  externalCandidatesBeforeAvailabilityMerge: RankedResult[];
  externalCandidatesAfterAvailabilityMerge: RankedResult[];
  canonicalResultsForResponse: RankedResult[];
  visibleExternalCandidates: RankedResult[];
  dominantFamily: DominantEntityFamily;
  providerSuppressionEvents?: Array<{
    resultId: string;
    source: SearchSource;
    title: string;
    reason: SearchCognitionSuppressionReason;
  }>;
}): SearchCognitionDiagnostics {
  const queryForCorrection = params.queryCandidates[0];
  const suppressionEvents =
    params.providerSuppressionEvents ||
    buildProviderSuppressionEvents({
      beforeMerge: params.externalCandidatesBeforeAvailabilityMerge,
      afterMerge: params.externalCandidatesAfterAvailabilityMerge,
      canonicalResults: params.canonicalResultsForResponse,
      visibleExternalResults: params.visibleExternalCandidates,
    });
  const suppressionReasonById = new Map<string, SearchCognitionSuppressionReason>();
  suppressionEvents.forEach((event) => {
    suppressionReasonById.set(event.resultId, event.reason);
  });

  return {
    schemaVersion: 1,
    mode: "read_only_observability",
    behaviorImpact: "none",
    normalizedQuery: params.normalizedQuery,
    queryIntent: params.queryIntent,
    phaseOrder: params.phaseOrder.slice(),
    provisionalRoleCategories: PROVISIONAL_ROLE_CATEGORIES.slice(),
    canonicalPrioritization: {
      comparator:
        "resultType -> workType -> rankTier -> computedScore -> language -> popularity -> recency -> series -> year -> title",
      canonicalCount: params.canonicalCount,
      externalCount: params.externalCount,
    },
    providerBlending: {
      externalFallbackTriggered: params.externalFallbackTriggered,
      googleBooksAcceptedCount: params.googleCount,
      openLibraryAcceptedCount: params.openLibraryCount,
      visibleExternalCount: params.visibleExternalCandidates.length,
      suppressedExternalCount: suppressionEvents.length,
      suppressionEvents,
    },
    dominantFamily: {
      kind: params.dominantFamily?.kind || null,
      confirmed: Boolean(params.dominantFamily),
    },
    resultTraces: params.results.map((result) => {
      const role = classifyProvisionalSearchRole(result);
      const correctionQuery = queryForCorrection || toQueryCandidate(params.normalizedQuery, "original");
      const literaryCorrection = correctionQuery
        ? computeLiteraryCorrection({
            result,
            query: correctionQuery,
            queryIntent: params.queryIntent,
          })
        : 0;
      const canonicalTitleAdjustment = correctionQuery
        ? computeCanonicalTitleAdjustment(correctionQuery.normalized, result.title)
        : 0;
      const suppressionReason = suppressionReasonById.get(result.id) || "none";

      return {
        resultId: result.id,
        resultType: result.resultType,
        source: result.source,
        title: result.title,
        author: result.authors[0] || result.authorEn || "Unknown",
        provisionalRole: role,
        humanSummary: summarizeCognitionTrace({
          result,
          role,
          literaryCorrection,
          canonicalTitleAdjustment,
          suppressionReason,
        }),
        ranking: {
          rankTier: result.rankTier,
          confidence: result.confidence,
          computedScore: result.computedScore,
          tokenCoverageRatio: result.tokenCoverageRatio,
          languageMatchScore: result.languageMatchScore,
          popularityScore: result.popularityScore,
          recentActivityMs: result.recentActivityMs,
          workTypePriority: toWorkTypePriority(result.workType),
        },
        canonical: {
          resultTypePriority:
            result.resultType === "canonical"
              ? "canonical_first"
              : "external_after_canonical",
          workType: result.workType,
          editionPresence: result.editionPresence,
          canonicalKeyPresent: Boolean(result.canonicalKey),
          literaryAuthorityClass: result.literaryAuthorityClass || null,
        },
        heuristics: {
          canonicalTitleAdjustment,
          literaryCorrection,
          derivativeSignals: collectDerivativeSignals(result),
          exactClassicAuthority: isExactClassicAuthorityResult(result, params.queryCandidates),
          likelySecondaryTitle: isIntentGateSecondaryTitle(normalizeSearchText(result.title)),
        },
        provider: {
          sourceClass: result.sourceClass,
          readProvider: result.readProvider,
          availabilityMergedFromProvider: hasTrustedExternalAvailability(result),
          suppressionReason,
        },
        manifestation: {
          collapseModel:
            result.resultType === "canonical"
              ? "canonical_work_row"
              : "external_provider_manifestation",
          groupedCanonicalEditions: result.editionPresence === "grouped",
          editionId: result.editionId,
          workId: result.workId,
        },
      };
    }),
  };
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
          if (
            !candidate?.trust?.availabilityTrust ||
            !candidate.trust.acquisitionTrust
          ) {
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
    let canonicalIndex = identities
      .map((entry) => canonicalIdentity.get(entry))
      .find((entry): entry is number => typeof entry === "number");

    if (typeof canonicalIndex !== "number") {
      for (let i = 0; i < nextCanonical.length; i++) {
        if (isLikelyFuzzyDuplicate(result, nextCanonical[i])) {
          canonicalIndex = i;
          break;
        }
      }
    }

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

type IntentGateEntry = {
  title: string;
  authors: string[];
  titleEn?: string;
  titleAr?: string;
  computedScore?: number;
  rankTier?: number;
};

type DominantEntityFamily =
  | {
      kind: "author";
      authorAliases: Set<string>;
    }
  | {
      kind: "title";
    }
  | null;

function looksLikeFullPersonNameQuery(query: QueryCandidate): boolean {
  return (
    query.tokens.length >= 2 &&
    query.tokens.length <= 4 &&
    query.tokens.every((token) => token.length >= 2 && !SEARCH_STOPWORDS.has(token))
  );
}

function resolveIntentGateTitleVariants(entry: IntentGateEntry): string[] {
  return resolveTitleVariants([entry.title, entry.titleEn || "", entry.titleAr || ""]).map(
    (value) => normalizeSearchText(value)
  );
}

function trimLiterarySubtitle(value: string): string {
  return value
    .split(/\s[:;|]\s| - | – | — |\(|\[/u)[0]
    ?.trim() || value;
}

function stripLeadingArticles(value: string): string {
  return value.replace(/^(the|a|an|le|la|les|el|los|las|il|lo|gli)\s+/u, "").trim();
}

function normalizeLiteraryFamilyText(value: string): string {
  if (!value) return "";
  const normalized = normalizeSearchText(trimLiterarySubtitle(value));
  if (!normalized) return "";
  return normalized.replace(/\s+/g, " ").trim();
}

function resolveLiteraryFamilyForms(value: string): string[] {
  const base = normalizeLiteraryFamilyText(value);
  if (!base) return [];
  const articleStripped = stripLeadingArticles(base);
  const forms = [base];
  if (articleStripped && articleStripped !== base && splitNormalizedWords(articleStripped).length >= 2) {
    forms.push(articleStripped);
  }
  return Array.from(new Set(forms));
}

function normalizeFamilyToken(token: string): string {
  return token.replace(/ph/gu, "f").replace(/ck/gu, "k");
}

function familyTokenEquivalent(left: string, right: string): boolean {
  const normalizedLeft = normalizeFamilyToken(left);
  const normalizedRight = normalizeFamilyToken(right);
  if (normalizedLeft === normalizedRight) return true;
  if (normalizedLeft.length < 5 || normalizedRight.length < 5) return false;
  if (boundedEditDistance(normalizedLeft, normalizedRight, 1) !== null) return true;
  return (
    commonPrefixLength(normalizedLeft, normalizedRight) >= 4 &&
    Math.abs(normalizedLeft.length - normalizedRight.length) <= 1
  );
}

function familyWordsCoverQuery(queryWords: string[], candidateWords: string[]): boolean {
  if (queryWords.length === 0 || candidateWords.length === 0) return false;
  const remaining = candidateWords.slice();
  for (const queryWord of queryWords) {
    const matchIndex = remaining.findIndex((candidateWord) =>
      queryWord.length < 5 || candidateWord.length < 5
        ? queryWord === candidateWord
        : familyTokenEquivalent(queryWord, candidateWord)
    );
    if (matchIndex === -1) {
      return false;
    }
    remaining.splice(matchIndex, 1);
  }
  return true;
}

function hasExactAuthorAnchor(authors: string[], queryCandidates: QueryCandidate[]): boolean {
  const authorQueries = queryCandidates.filter(looksLikeFullPersonNameQuery);
  if (authorQueries.length === 0) return false;

  return authors.some((author) => {
    const authorForms = resolveLiteraryFamilyForms(author);
    return authorQueries.some((query) => {
      const queryWords = splitNormalizedWords(query.normalized).sort();
      return authorForms.some((form) => {
        const authorWords = splitNormalizedWords(form).sort();
        return (
          authorWords.length >= queryWords.length &&
          familyWordsCoverQuery(queryWords, authorWords)
        );
      });
    });
  });
}

function matchesTitleFamily(entry: IntentGateEntry, queryCandidates: QueryCandidate[]): boolean {
  const titleForms = resolveTitleVariants([entry.title, entry.titleEn || "", entry.titleAr || ""]).flatMap(
    (value) => resolveLiteraryFamilyForms(value)
  );
  if (titleForms.length === 0) return false;

  return queryCandidates.some((query) => {
    const queryForms = resolveLiteraryFamilyForms(query.normalized);
    return queryForms.some((queryForm) => {
      const queryWords = splitNormalizedWords(queryForm);
      return titleForms.some((titleForm) => {
        const titleWords = splitNormalizedWords(titleForm);
        return familyWordsCoverQuery(queryWords, titleWords);
      });
    });
  });
}

function hasExactTitleAnchor(entries: IntentGateEntry[], queryCandidates: QueryCandidate[]): boolean {
  const queryNorms = new Set(queryCandidates.map((entry) => entry.normalized));
  return entries.some((entry) =>
    resolveTitleVariants([entry.title, entry.titleEn || "", entry.titleAr || ""])
      .map((value) => normalizeSearchText(value))
      .some((titleNorm) => queryNorms.has(titleNorm))
  );
}

function compareDominantEntries(left: IntentGateEntry, right: IntentGateEntry): number {
  const leftRankTier = typeof left.rankTier === "number" ? left.rankTier : Number.MAX_SAFE_INTEGER;
  const rightRankTier = typeof right.rankTier === "number" ? right.rankTier : Number.MAX_SAFE_INTEGER;
  if (leftRankTier !== rightRankTier) {
    return leftRankTier - rightRankTier;
  }
  const leftScore = typeof left.computedScore === "number" ? left.computedScore : Number.NEGATIVE_INFINITY;
  const rightScore = typeof right.computedScore === "number" ? right.computedScore : Number.NEGATIVE_INFINITY;
  return rightScore - leftScore;
}

function hasDominantScoreSeparation(
  leader: IntentGateEntry | undefined,
  outsider: IntentGateEntry | undefined
): boolean {
  if (!leader) return false;
  if (!outsider) return true;

  const leaderRankTier = typeof leader.rankTier === "number" ? leader.rankTier : Number.MAX_SAFE_INTEGER;
  const outsiderRankTier =
    typeof outsider.rankTier === "number" ? outsider.rankTier : Number.MAX_SAFE_INTEGER;
  if (leaderRankTier < outsiderRankTier) return true;

  const leaderScore = typeof leader.computedScore === "number" ? leader.computedScore : Number.NEGATIVE_INFINITY;
  const outsiderScore =
    typeof outsider.computedScore === "number" ? outsider.computedScore : Number.NEGATIVE_INFINITY;
  return leaderScore >= outsiderScore + DOMINANT_FAMILY_MIN_SCORE_GAP;
}

function dominantEntityFamily(params: {
  entries: IntentGateEntry[];
  queryCandidates: QueryCandidate[];
  queryIntent: QueryIntent;
}): DominantEntityFamily {
  if (params.entries.length === 0) return null;

  if (params.queryIntent === "AUTHOR_INTENT") {
    const authorQueries = params.queryCandidates.filter(looksLikeFullPersonNameQuery);
    if (authorQueries.length === 0) return null;

    const exactAnchorExists = params.entries.some((entry) =>
      hasExactAuthorAnchor(entry.authors, params.queryCandidates)
    );
    if (!exactAnchorExists) return null;

    const familyEntries = params.entries.filter((entry) =>
      matchesStrongAuthorIntentEntry(entry.authors, params.queryCandidates)
    );
    if (familyEntries.length < DOMINANT_FAMILY_MIN_CLUSTER) return null;

    const outsiderEntries = params.entries.filter(
      (entry) => !matchesStrongAuthorIntentEntry(entry.authors, params.queryCandidates)
    );
    const leader = familyEntries.slice().sort(compareDominantEntries)[0];
    const outsider = outsiderEntries.slice().sort(compareDominantEntries)[0];
    if (!hasDominantScoreSeparation(leader, outsider)) return null;

    const authorAliases = new Set<string>();
    familyEntries.forEach((entry) => {
      entry.authors
        .map((author) => normalizeSearchText(author))
        .filter((author) => author.length > 0)
        .forEach((author) => authorAliases.add(author));
    });
    return authorAliases.size > 0 ? { kind: "author", authorAliases } : null;
  }

  if (params.queryIntent === "TITLE_INTENT") {
    if (!hasExactTitleAnchor(params.entries, params.queryCandidates)) return null;

    const familyEntries = params.entries.filter((entry) =>
      matchesTitleFamily(entry, params.queryCandidates)
    );
    if (familyEntries.length < DOMINANT_FAMILY_MIN_CLUSTER) return null;

    const outsiderEntries = params.entries.filter(
      (entry) => !matchesTitleFamily(entry, params.queryCandidates)
    );
    const leader = familyEntries.slice().sort(compareDominantEntries)[0];
    const outsider = outsiderEntries.slice().sort(compareDominantEntries)[0];
    if (!hasDominantScoreSeparation(leader, outsider)) return null;

    return { kind: "title" };
  }

  return null;
}

function applyDominantFamilyToCanonicalCandidates(params: {
  candidates: RankedResult[];
  queryCandidates: QueryCandidate[];
  dominantFamily: DominantEntityFamily;
}): RankedResult[] {
  const { dominantFamily } = params;
  if (!dominantFamily) return params.candidates;

  const filtered = params.candidates.filter((entry) => {
    if (dominantFamily.kind === "author") {
      return entry.authors.some((author) =>
        dominantFamily.authorAliases.has(normalizeSearchText(author))
      );
    }
    return matchesTitleFamily(entry, params.queryCandidates);
  });

  return filtered.length > 0 ? filtered : params.candidates;
}

function applyDominantFamilyToExternalSeeds(params: {
  seeds: ExternalSeedCandidate[];
  queryCandidates: QueryCandidate[];
  dominantFamily: DominantEntityFamily;
}): ExternalSeedCandidate[] {
  const { dominantFamily } = params;
  if (!dominantFamily) return params.seeds;

  const filtered = params.seeds.filter((entry) => {
    if (dominantFamily.kind === "author") {
      return entry.authors.some((author) =>
        dominantFamily.authorAliases.has(normalizeSearchText(author))
      );
    }
    return matchesTitleFamily(entry, params.queryCandidates);
  });

  return filtered.length > 0 ? filtered : params.seeds;
}

function isDominantFamilyDerivativeTitle(titleNorm: string): boolean {
  if (!titleNorm) return false;
  if (isIntentGateSecondaryTitle(titleNorm)) return true;
  return DOMINANT_FAMILY_DERIVATIVE_PATTERNS.some((pattern) => pattern.test(titleNorm));
}

function applyDominantFamilyOrderingToRanked(params: {
  results: RankedResult[];
  queryCandidates: QueryCandidate[];
  dominantFamily: DominantEntityFamily;
}): RankedResult[] {
  const { dominantFamily } = params;
  if (!dominantFamily || params.results.length === 0) return params.results;

  const queryNorms = new Set(params.queryCandidates.map((entry) => entry.normalized));
  const shortCanonicalTitleAuthority =
    dominantFamily.kind === "title" &&
    params.queryCandidates.some((entry) => splitNormalizedWords(entry.normalized).length <= 3) &&
    params.results.some((entry) =>
      resolveIntentGateTitleVariants(entry).some((variant) => queryNorms.has(variant))
    );
  const exactClassicWorkLeaderExists =
    dominantFamily.kind === "title" &&
    params.queryCandidates.some((entry) => {
      const wordCount = splitNormalizedWords(entry.normalized).length;
      return wordCount >= 2 && wordCount <= 3;
    }) &&
    params.results.some((entry) => {
      const titleVariants = resolveIntentGateTitleVariants(entry);
      const exactTitle = titleVariants.some((variant) => queryNorms.has(variant));
      return exactTitle && entry.literaryAuthorityClass === "classic_work";
    });

  return params.results
    .map((entry) => {
      const titleNorm = normalizeSearchText(entry.title);
      const titleVariants = resolveIntentGateTitleVariants(entry);
      const exactTitle = titleVariants.some((variant) => queryNorms.has(variant));
      const derivative = isDominantFamilyDerivativeTitle(titleNorm);
      const exactTitleVariant =
        exactClassicWorkLeaderExists &&
        exactTitle &&
        (entry.workType !== "work" ||
          EXACT_TITLE_FAMILY_VARIANT_PATTERNS.some((pattern) => pattern.test(titleNorm)) ||
          derivative);
      const exactShortCanonicalBoost =
        shortCanonicalTitleAuthority && exactTitle ? 3.4 : 0;
      const nonExactShortCanonicalPenalty =
        shortCanonicalTitleAuthority && !exactTitle ? 0.8 : 0;
      let nextRankTier = entry.rankTier;
      let nextScore = entry.computedScore;

      if (exactClassicWorkLeaderExists && exactTitle) {
        if (entry.literaryAuthorityClass === "classic_work") {
          nextRankTier = Math.min(nextRankTier, 0);
          nextScore = Math.round((nextScore + 2.8) * 1_000_000) / 1_000_000;
        } else if (exactTitleVariant) {
          nextRankTier = Math.min(3, nextRankTier + 1);
          nextScore = Math.round((nextScore - 2.4) * 1_000_000) / 1_000_000;
        }
      }

      if (exactShortCanonicalBoost > 0) {
        nextRankTier = Math.min(nextRankTier, 1);
        nextScore = Math.round((nextScore + exactShortCanonicalBoost) * 1_000_000) / 1_000_000;
      } else if (nonExactShortCanonicalPenalty > 0) {
        nextScore = Math.round((nextScore - nonExactShortCanonicalPenalty) * 1_000_000) / 1_000_000;
      }

      if (!derivative || exactTitle) {
        if (nextRankTier === entry.rankTier && nextScore === entry.computedScore) {
          return entry;
        }
        return {
          ...entry,
          rankTier: nextRankTier,
          rank: nextRankTier,
          computedScore: nextScore,
        };
      }

      const adjustedRankTier = Math.min(3, entry.rankTier + 1);
      const adjustedScore = Math.round((nextScore - 2.1) * 1_000_000) / 1_000_000;
      return {
        ...entry,
        rankTier: adjustedRankTier,
        rank: adjustedRankTier,
        computedScore: adjustedScore,
      };
    })
    .sort(compareRanked);
}

function isIntentGateSecondaryTitle(titleNorm: string): boolean {
  if (!titleNorm) return false;
  if (AUTHOR_BIOGRAPHY_CRITICISM_PATTERNS.some((pattern) => pattern.test(titleNorm))) {
    return true;
  }
  if (AUTHOR_ANTHOLOGY_PATTERNS.some((pattern) => pattern.test(titleNorm))) {
    return true;
  }
  if (
    /\b(dictionary|encyclopedia|glossary|lexicon|commentary|commentaries|companion|reader|introduction|adaptation|adapted|retold|guide)\b/u.test(
      titleNorm
    )
  ) {
    return true;
  }
  return splitNormalizedWords(titleNorm).some((word) => DERIVATIVE_TITLE_KEYWORDS.has(word));
}

function matchesStrongAuthorIntentEntry(
  authors: string[],
  queryCandidates: QueryCandidate[]
): boolean {
  const authorValues = authors
    .map((author) => normalizeSearchText(author))
    .filter((author) => author.length > 0);
  if (authorValues.length === 0) return false;

  return queryCandidates.some((query) => {
    const surname = query.tokens[query.tokens.length - 1] || "";
    return authorValues.some((authorNorm) => {
      if (authorNorm === query.normalized || authorNorm.startsWith(`${query.normalized} `)) {
        return true;
      }
      if (!surname) return false;
      const authorTokens = tokenize(authorNorm);
      const sharedTokens = query.tokens.filter((token) => authorTokens.includes(token)).length;
      return (
        (authorNorm === surname || authorNorm.endsWith(` ${surname}`)) &&
        sharedTokens >= Math.min(query.tokens.length, 2)
      );
    });
  });
}

function deriveIntentGateSignals(
  entries: IntentGateEntry[],
  queryCandidates: QueryCandidate[],
  queryIntent: QueryIntent
): {
  authorLike: boolean;
  exactTitleAuthority: boolean;
  authorAliases: Set<string>;
} {
  const authorLike =
    queryIntent === "AUTHOR_INTENT" || queryCandidates.some(looksLikeFullPersonNameQuery);
  const queryNorms = new Set(queryCandidates.map((entry) => entry.normalized));
  const exactTitleAuthority =
    queryIntent === "TITLE_INTENT" &&
    entries.some((entry) =>
      resolveIntentGateTitleVariants(entry).some((titleNorm) => queryNorms.has(titleNorm))
    );
  const authorAliases = new Set<string>();

  if (authorLike) {
    for (const entry of entries) {
      if (!matchesStrongAuthorIntentEntry(entry.authors, queryCandidates)) continue;
      entry.authors
        .map((author) => normalizeSearchText(author))
        .filter((author) => author.length > 0)
        .forEach((author) => authorAliases.add(author));
    }
  }

  return {
    authorLike,
    exactTitleAuthority,
    authorAliases,
  };
}

function gateCanonicalCandidatesForIntent(params: {
  candidates: RankedResult[];
  queryCandidates: QueryCandidate[];
  queryIntent: QueryIntent;
  authorityEntries?: IntentGateEntry[];
}): RankedResult[] {
  if (params.candidates.length === 0) return params.candidates;

  const authorityEntries = params.authorityEntries || params.candidates;
  const signals = deriveIntentGateSignals(
    authorityEntries,
    params.queryCandidates,
    params.queryIntent
  );
  const authorQueries = params.queryCandidates.filter(looksLikeFullPersonNameQuery);
  const queryNorms = new Set(params.queryCandidates.map((entry) => entry.normalized));

  const filtered = params.candidates.filter((entry) => {
    const titleNorm = normalizeSearchText(entry.title);
    const titleVariants = resolveIntentGateTitleVariants(entry);
    const exactTitle = titleVariants.some((variant) => queryNorms.has(variant));
    const authorMatch =
      signals.authorAliases.size > 0
        ? entry.authors.some((author) => signals.authorAliases.has(normalizeSearchText(author)))
        : matchesStrongAuthorIntentEntry(entry.authors, params.queryCandidates);

    if (signals.authorLike && signals.authorAliases.size > 0 && !authorMatch) {
      const titleLedSecondary = authorQueries.some((query) => {
        const surname = query.tokens[query.tokens.length - 1] || "";
        const startsWithQuery =
          titleNorm === query.normalized || titleNorm.startsWith(`${query.normalized} `);
        const startsWithSurname =
          Boolean(surname) && (titleNorm === surname || titleNorm.startsWith(`${surname} `));
        if (!startsWithQuery && !startsWithSurname) return false;

        const trailing = startsWithQuery
          ? titleNorm.slice(query.normalized.length).trim()
          : titleNorm.slice(surname.length).trim();
        return (
          trailing.length === 0 ||
          /^[,\d]/u.test(trailing) ||
          isIntentGateSecondaryTitle(trailing || titleNorm)
        );
      });

      if (titleLedSecondary) {
        return false;
      }
    }

    if (signals.exactTitleAuthority && !exactTitle) {
      const contaminatingSuperstring = params.queryCandidates.some((query) => {
        const queryWordCount = splitNormalizedWords(query.normalized).length;
        if (queryWordCount !== 2) return false;
        return titleVariants.some((variant) => {
          if (variant === query.normalized) return false;
          const containsQuery =
            variant.startsWith(`${query.normalized} `) ||
            variant.endsWith(` ${query.normalized}`) ||
            variant.includes(` ${query.normalized} `);
          if (!containsQuery) return false;
          return true;
        });
      });

      if (contaminatingSuperstring) {
        return false;
      }
    }

    return true;
  });

  return filtered.length > 0 ? filtered : params.candidates;
}

function gateExternalSeedsForIntent(params: {
  seeds: ExternalSeedCandidate[];
  queryCandidates: QueryCandidate[];
  queryIntent: QueryIntent;
  authorityEntries: IntentGateEntry[];
}): ExternalSeedCandidate[] {
  if (params.seeds.length === 0) return params.seeds;

  const signals = deriveIntentGateSignals(
    params.authorityEntries,
    params.queryCandidates,
    params.queryIntent
  );
  const authorQueries = params.queryCandidates.filter(looksLikeFullPersonNameQuery);
  const queryNorms = new Set(params.queryCandidates.map((entry) => entry.normalized));

  const filtered = params.seeds.filter((entry) => {
    const titleNorm = normalizeSearchText(entry.title);
    const exactTitle = queryNorms.has(titleNorm);
    const authorMatch =
      signals.authorAliases.size > 0
        ? entry.authors.some((author) => signals.authorAliases.has(normalizeSearchText(author)))
        : matchesStrongAuthorIntentEntry(entry.authors, params.queryCandidates);

    if (signals.authorLike && signals.authorAliases.size > 0 && !authorMatch) {
      const titleLedSecondary = authorQueries.some((query) => {
        const surname = query.tokens[query.tokens.length - 1] || "";
        const startsWithQuery =
          titleNorm === query.normalized || titleNorm.startsWith(`${query.normalized} `);
        const startsWithSurname =
          Boolean(surname) && (titleNorm === surname || titleNorm.startsWith(`${surname} `));
        if (!startsWithQuery && !startsWithSurname) return false;

        const trailing = startsWithQuery
          ? titleNorm.slice(query.normalized.length).trim()
          : titleNorm.slice(surname.length).trim();
        return (
          trailing.length === 0 ||
          /^[,\d]/u.test(trailing) ||
          isIntentGateSecondaryTitle(trailing || titleNorm)
        );
      });

      if (titleLedSecondary) {
        return false;
      }
    }

    if (signals.exactTitleAuthority && !exactTitle) {
      const contaminatingSuperstring = params.queryCandidates.some((query) => {
        const queryWordCount = splitNormalizedWords(query.normalized).length;
        if (queryWordCount !== 2) return false;
        const containsQuery =
          titleNorm.startsWith(`${query.normalized} `) ||
          titleNorm.endsWith(` ${query.normalized}`) ||
          titleNorm.includes(` ${query.normalized} `);
        if (!containsQuery) return false;
        return true;
      });

      if (contaminatingSuperstring) {
        return false;
      }
    }

    return true;
  });

  return filtered.length > 0 ? filtered : params.seeds;
}

function selectShortExactTitleAuthorityQuery(
  queryCandidates: QueryCandidate[]
): QueryCandidate | null {
  const deduped = dedupeQueryCandidates(queryCandidates);
  return (
    deduped.find((entry) => {
      const wordCount = splitNormalizedWords(entry.normalized).length;
      return entry.source === "original" && wordCount >= 2 && wordCount <= 3;
    }) ||
    deduped.find((entry) => {
      const wordCount = splitNormalizedWords(entry.normalized).length;
      return wordCount >= 2 && wordCount <= 3;
    }) ||
    null
  );
}

function hasExactShortCanonicalTitleAuthority(
  canonicalResults: RankedResult[],
  query: QueryCandidate
): boolean {
  return canonicalResults.some((entry) =>
    entry.literaryAuthorityClass === "classic_work" &&
    resolveIntentGateTitleVariants(entry).some((variant) => variant === query.normalized)
  );
}

function isShortTitleLexicalExternalContaminant(
  result: RankedResult,
  query: QueryCandidate
): boolean {
  const titleVariants = resolveIntentGateTitleVariants(result);
  if (titleVariants.some((variant) => variant === query.normalized)) {
    return false;
  }

  const queryWords = splitNormalizedWords(query.normalized);
  if (queryWords.length < 2 || queryWords.length > 3) {
    return false;
  }

  const titleNorm = normalizeSearchText(result.title);
  if (!titleNorm) return false;

  if (
    titleNorm.startsWith(`${query.normalized} `) ||
    titleNorm.endsWith(` ${query.normalized}`) ||
    titleNorm.includes(` ${query.normalized} `)
  ) {
    return true;
  }

  if (query.tokens.length === 0) return false;
  const titleTokens = new Set(tokenize(titleNorm));
  return query.tokens.every((token) => titleTokens.has(token));
}

function applyShortCanonicalVisibleAuthority(params: {
  canonicalResults: RankedResult[];
  externalResults: RankedResult[];
  queryCandidates: QueryCandidate[];
}): RankedResult[] {
  if (params.externalResults.length === 0) return params.externalResults;

  const authorityQuery = selectShortExactTitleAuthorityQuery(params.queryCandidates);
  if (!authorityQuery) return params.externalResults;

  if (!hasExactShortCanonicalTitleAuthority(params.canonicalResults, authorityQuery)) {
    return params.externalResults;
  }

  return params.externalResults.filter(
    (entry) => !isShortTitleLexicalExternalContaminant(entry, authorityQuery)
  );
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
  const transliterationEnabled =
    !options.__skipTransliteration && shouldEnableTransliteration(query, queryNorm);
  if (transliterationEnabled) {
    phaseOrder.push("transliteration_detected");
  }
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
  const retrievalOptions = options.ebookOnly ? { ...options, ebookOnly: false } : options;
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
  let canonicalArtifacts = await collectCanonicalCandidates(queryCandidates, retrievalOptions);

  const correctedFromCanonical = deriveCorrectedQueryCandidates({
    originalQuery,
    canonicalDocs: canonicalArtifacts.rawDocs,
    existingQueries: queryCandidates,
  });
  if (correctedFromCanonical.length > 0) {
    queryCandidates = dedupeQueryCandidates([...queryCandidates, ...correctedFromCanonical]);
    phaseOrder.push("canonical_corrected_local");
    canonicalArtifacts = await collectCanonicalCandidates(queryCandidates, retrievalOptions);
  }

  let queryIntent = detectQueryIntent(
    queryCandidates,
    canonicalArtifacts.candidates.map((entry) => ({
      title: entry.title,
      authors: entry.authors,
    }))
  );
  canonicalArtifacts = {
    ...canonicalArtifacts,
    candidates: gateCanonicalCandidatesForIntent({
      candidates: canonicalArtifacts.candidates,
      queryCandidates,
      queryIntent,
    }),
  };
  const initialDominantFamily = dominantEntityFamily({
    entries: canonicalArtifacts.candidates,
    queryCandidates,
    queryIntent,
  });
  let activeDominantFamily: DominantEntityFamily = initialDominantFamily;
  if (initialDominantFamily) {
    canonicalArtifacts = {
      ...canonicalArtifacts,
      candidates: applyDominantFamilyToCanonicalCandidates({
        candidates: canonicalArtifacts.candidates,
        queryCandidates,
        dominantFamily: initialDominantFamily,
      }),
    };
  }

  let rerankedCanonical = rankCanonicalResults(
    canonicalArtifacts.candidates,
    queryCandidates,
    queryIntent
  );
  if (initialDominantFamily) {
    rerankedCanonical = applyDominantFamilyOrderingToRanked({
      results: rerankedCanonical,
      queryCandidates,
      dominantFamily: initialDominantFamily,
    });
  }
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
  let externalCandidatesBeforeAvailabilityMerge: RankedResult[] = [];
  let externalCandidatesAfterAvailabilityMerge: RankedResult[] = [];
  let providerSuppressionEvents: Array<{
    resultId: string;
    source: SearchSource;
    title: string;
    reason: SearchCognitionSuppressionReason;
  }> = [];

  const isbnQuery = parseIsbnQuery(queryNorm);
  const isIsbnLookup = Boolean(isbnQuery.isbn13 || isbnQuery.isbn10);
  const canonicalAvailabilityCount = canonicalAvailability.filter((entry) => entry.available).length;
  const shouldUseExternalFallback =
    externalFallbackEnabled &&
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
      canonicalArtifacts = await collectCanonicalCandidates(queryCandidates, retrievalOptions);
      queryIntent = detectQueryIntent(
        queryCandidates,
        canonicalArtifacts.candidates.map((entry) => ({
          title: entry.title,
          authors: entry.authors,
        }))
      );
      canonicalArtifacts = {
        ...canonicalArtifacts,
        candidates: gateCanonicalCandidatesForIntent({
          candidates: canonicalArtifacts.candidates,
          queryCandidates,
          queryIntent,
        }),
      };
      const correctedDominantFamily = dominantEntityFamily({
        entries: canonicalArtifacts.candidates,
        queryCandidates,
        queryIntent,
      });
      activeDominantFamily = correctedDominantFamily;
      if (correctedDominantFamily) {
        canonicalArtifacts = {
          ...canonicalArtifacts,
          candidates: applyDominantFamilyToCanonicalCandidates({
            candidates: canonicalArtifacts.candidates,
            queryCandidates,
            dominantFamily: correctedDominantFamily,
          }),
        };
      }
      rerankedCanonical = rankCanonicalResults(
        canonicalArtifacts.candidates,
        queryCandidates,
        queryIntent
      );
      if (correctedDominantFamily) {
        rerankedCanonical = applyDominantFamilyOrderingToRanked({
          results: rerankedCanonical,
          queryCandidates,
          dominantFamily: correctedDominantFamily,
        });
      }
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
    const combinedIntentCandidates = [
      ...canonicalArtifacts.candidates.map((entry) => ({
        title: entry.title,
        authors: entry.authors,
        titleEn: entry.titleEn,
        titleAr: entry.titleAr,
        computedScore: entry.computedScore,
        rankTier: entry.rankTier,
      })),
      ...mergedExternalSeeds.map((entry) => ({
        title: entry.title,
        authors: entry.authors,
      })),
    ];
    queryIntent = detectQueryIntent(queryCandidates, combinedIntentCandidates);
    canonicalArtifacts = {
      ...canonicalArtifacts,
      candidates: gateCanonicalCandidatesForIntent({
        candidates: canonicalArtifacts.candidates,
        queryCandidates,
        queryIntent,
        authorityEntries: combinedIntentCandidates,
      }),
    };
    const mergedDominantFamily = dominantEntityFamily({
      entries: canonicalArtifacts.candidates,
      queryCandidates,
      queryIntent,
    });
    activeDominantFamily = mergedDominantFamily;
    if (mergedDominantFamily) {
      canonicalArtifacts = {
        ...canonicalArtifacts,
        candidates: applyDominantFamilyToCanonicalCandidates({
          candidates: canonicalArtifacts.candidates,
          queryCandidates,
          dominantFamily: mergedDominantFamily,
        }),
      };
    }
    rerankedCanonical = rankCanonicalResults(
      canonicalArtifacts.candidates,
      queryCandidates,
      queryIntent
    );
    if (mergedDominantFamily) {
      rerankedCanonical = applyDominantFamilyOrderingToRanked({
        results: rerankedCanonical,
        queryCandidates,
        dominantFamily: mergedDominantFamily,
      });
    }
    canonicalAvailability = options.availabilityOnly
      ? await enrichCanonicalAvailability(rerankedCanonical, limit)
      : rerankedCanonical.slice();
    lowConfidenceTopThree = hasWeakCanonicalQuality(rerankedCanonical);
    const gatedExternalSeeds = gateExternalSeedsForIntent({
      seeds: mergedExternalSeeds,
      queryCandidates,
      queryIntent,
      authorityEntries: combinedIntentCandidates,
    });
    if (options.__includeCognitionDiagnostics) {
      const gatedSeedKeys = new Set(
        gatedExternalSeeds.map((entry) => `${entry.source}:${entry.externalId}`)
      );
      for (const seed of mergedExternalSeeds) {
        const seedKey = `${seed.source}:${seed.externalId}`;
        if (!gatedSeedKeys.has(seedKey)) {
          providerSuppressionEvents.push({
            resultId: `${seed.source === "googleBooks" ? "gb" : "ol"}_${seed.externalId}`,
            source: seed.source,
            title: seed.title,
            reason: "intent_gate_filtered",
          });
        }
      }
    }
    const dominantExternalSeeds = mergedDominantFamily
      ? applyDominantFamilyToExternalSeeds({
          seeds: gatedExternalSeeds,
          queryCandidates,
          dominantFamily: mergedDominantFamily,
        })
      : gatedExternalSeeds;
    const mappedExternalCandidates = dominantExternalSeeds.map((entry) => ({
      seed: entry,
      ranked: mapExternalCandidateToRanked(entry, queryCandidates, queryIntent, options.language),
    }));
    if (options.__includeCognitionDiagnostics) {
      for (const mapped of mappedExternalCandidates) {
        if (!mapped.ranked) {
          providerSuppressionEvents.push({
            resultId: `${mapped.seed.source === "googleBooks" ? "gb" : "ol"}_${mapped.seed.externalId}`,
            source: mapped.seed.source,
            title: mapped.seed.title,
            reason: "rank_confidence_filtered",
          });
        }
      }
    }
    externalCandidates = mappedExternalCandidates
      .map((entry) => entry.ranked)
      .filter((entry): entry is RankedResult => Boolean(entry));
    if (mergedDominantFamily) {
      externalCandidates = applyDominantFamilyOrderingToRanked({
        results: externalCandidates,
        queryCandidates,
        dominantFamily: mergedDominantFamily,
      });
    }

    externalCandidatesBeforeAvailabilityMerge = externalCandidates.slice();
    const mergedAvailability = mergeCanonicalAvailability(
      externalCandidates,
      canonicalAvailability
    );
    canonicalAvailability = mergedAvailability.canonicalResults;
    externalCandidates = mergedAvailability.externalResults;
    externalCandidatesAfterAvailabilityMerge = externalCandidates.slice();
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
  const visibleExternalCandidates = applyShortCanonicalVisibleAuthority({
    canonicalResults: canonicalResultsForResponse,
    externalResults: externalCandidates,
    queryCandidates,
  });
  let merged = [...canonicalResultsForResponse, ...visibleExternalCandidates].sort(compareRanked);
  if (options.ebookOnly) {
    merged = merged.filter(hasAuthoritativeEbookReadSignal);
  }
  const visibleCanonicalCount = merged.filter((entry) => entry.resultType === "canonical").length;
  const visibleExternalCount = merged.filter((entry) => entry.resultType === "external").length;

  if (
    transliterationEnabled &&
    shouldTriggerTransliterationFallback(visibleCanonicalCount, visibleExternalCount)
  ) {
    phaseOrder.push("transliteration_fallback");
    const translitTokens = tokenize(queryNorm);
    const translitQuery = buildTransliterationQuery(translitTokens);
    if (translitQuery && translitQuery !== queryNorm) {
      const translitResults = await unifiedSearch(translitQuery, {
        ...options,
        __skipTransliteration: true,
        __includeCognitionDiagnostics: false,
        __includeInternalRankFields: true,
      });

      const newTranslitResults = mergeTransliterationResults(
        merged as RankedResult[],
        translitResults.results as RankedResult[]
      );

      if (newTranslitResults.length > 0) {
        merged = [
          ...merged,
          ...newTranslitResults.map((result: UnifiedSearchResult) => ({
            ...(result as any),
            _transliterationDerived: true,
          })),
        ].sort(compareRanked);
      }
    }
  }

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
  const mergeSuppressionEvents = options.__includeCognitionDiagnostics
    ? buildProviderSuppressionEvents({
        beforeMerge: externalCandidatesBeforeAvailabilityMerge,
        afterMerge: externalCandidatesAfterAvailabilityMerge,
        canonicalResults: canonicalResultsForResponse,
        visibleExternalResults: visibleExternalCandidates,
      })
    : [];
  providerSuppressionEvents = [...providerSuppressionEvents, ...mergeSuppressionEvents];
  const cognitionDiagnostics = options.__includeCognitionDiagnostics
    ? buildSearchCognitionDiagnostics({
        normalizedQuery: queryNorm,
        queryCandidates,
        queryIntent,
        phaseOrder,
        results: paginated as RankedResult[],
        canonicalCount: visibleCanonicalCount,
        externalCount: visibleExternalCount,
        externalFallbackTriggered: shouldUseExternalFallback,
        googleCount,
        openLibraryCount,
        externalCandidatesBeforeAvailabilityMerge,
        externalCandidatesAfterAvailabilityMerge,
        canonicalResultsForResponse,
        visibleExternalCandidates,
        dominantFamily: activeDominantFamily,
        providerSuppressionEvents,
      })
    : undefined;

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

  if (cognitionDiagnostics) {
    logger.info("BOOK_SEARCH_V2_COGNITION_TRACE", {
      query: queryNorm.slice(0, 80),
      queryIntent,
      resultCount: cognitionDiagnostics.resultTraces.length,
      roleCounts: cognitionDiagnostics.resultTraces.reduce<Record<string, number>>((acc, trace) => {
        acc[trace.provisionalRole] = (acc[trace.provisionalRole] || 0) + 1;
        return acc;
      }, {}),
      suppressedExternalCount: cognitionDiagnostics.providerBlending.suppressedExternalCount,
      dominantFamily: cognitionDiagnostics.dominantFamily,
    });
  }

  return {
    results: paginated.map((entry) => {
      if (options.__includeInternalRankFields) {
        return entry;
      }
      const {
        rankTier,
        computedScore,
        tokenCoverageRatio,
        popularityScore,
        engagementScore,
        recentActivityMs,
        normalizedTitle,
        canonicalProviderExternalIds,
        literaryAuthorityClass,
        seriesName,
        seriesPosition,
        publishedYear,
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
      void literaryAuthorityClass;
      void seriesName;
      void seriesPosition;
      void publishedYear;
      return publicResult;
    }),
    nextCursor,
    hasMore,
    cursorUsed: startOffset > 0,
    canonicalCount: visibleCanonicalCount,
    externalCount: visibleExternalCount,
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
    ...(cognitionDiagnostics ? { cognitionDiagnostics } : {}),
  };
}
