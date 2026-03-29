import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { isBookVisibleToPublic } from "../../rights/bookRights";

export interface SearchOptions {
  ebookOnly?: boolean;
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
  hasEbook: boolean;
  downloadable: boolean;
  isEbookAvailable: boolean;
  confidence: number;
  rank: number;
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
};

type CursorPayload = {
  offset: number;
  fingerprint: string;
};

type QueryIntent = "ISBN" | "AUTHOR_INTENT" | "TITLE_INTENT" | "MIXED_INTENT";

const INTERNAL_FETCH_POOL = 100;
const DEFAULT_RETURN_COUNT = 15;
const MAX_RETURN_COUNT = 30;
const EXTERNAL_FALLBACK_TRIGGER = 5;
const CONFIDENCE_THRESHOLD = 0.72;
const EXTERNAL_PROVIDER_TIMEOUT_MS = 3000;
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

function computeCanonicalEbookClass(data: Record<string, unknown>): SearchEbookClass {
  const hasVerifiedAttachment =
    asNonEmptyString(data.ebookAttachmentId).length > 0 ||
    asNonEmptyString(data.ebookStoragePath).length > 0 ||
    Boolean(data.downloadable);
  return hasVerifiedAttachment ? "in_app" : "unavailable";
}

function computeExternalEbookClass(hasExternalEbookSignal: boolean): SearchEbookClass {
  return hasExternalEbookSignal ? "external_link" : "unavailable";
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
  queryNorm: string,
  queryTokens: string[],
  candidates: Array<{ title: string; authors: string[] }>
): QueryIntent {
  const isbnQuery = parseIsbnQuery(queryNorm);
  if (isbnQuery.isbn13 || isbnQuery.isbn10) {
    return "ISBN";
  }

  if (queryTokens.length === 0) {
    return "MIXED_INTENT";
  }

  let authorPrefixMatches = 0;
  let titleTokenHits = 0;
  let authorTokenHits = 0;

  const singleToken = queryTokens.length === 1 ? queryTokens[0] : "";

  for (const candidate of candidates) {
    const titleNorm = normalizeSearchText(candidate.title);
    const authorNorm = normalizeSearchText((candidate.authors || []).join(" "));
    const titleTokenSet = new Set(tokenize(titleNorm));
    const authorTokenSet = new Set(tokenize(authorNorm));

    if (singleToken) {
      let matchedAuthorPrefix = false;
      for (const token of authorTokenSet) {
        if (token.startsWith(singleToken)) {
          matchedAuthorPrefix = true;
          break;
        }
      }
      if (matchedAuthorPrefix) {
        authorPrefixMatches += 1;
      }
    }

    for (const token of queryTokens) {
      if (titleTokenSet.has(token)) titleTokenHits += 1;
      if (authorTokenSet.has(token)) authorTokenHits += 1;
    }
  }

  if (singleToken) {
    const authorPrefixThreshold = Math.max(2, Math.ceil(candidates.length * 0.35));
    if (authorPrefixMatches >= authorPrefixThreshold) {
      return "AUTHOR_INTENT";
    }
    return "MIXED_INTENT";
  }

  if (titleTokenHits > authorTokenHits) {
    return "TITLE_INTENT";
  }

  return "MIXED_INTENT";
}

function computeFingerprint(queryNorm: string, options: SearchOptions): string {
  return [
    queryNorm,
    options.ebookOnly ? "1" : "0",
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

function mapCanonicalBook(
  docId: string,
  data: Record<string, unknown>,
  queryNorm: string,
  queryTokens: string[],
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
  const ebookClass = computeCanonicalEbookClass(data);
  const downloadable = ebookClass === "in_app";
  const hasEbook = downloadable;
  if (options.ebookOnly && !downloadable) {
    return null;
  }

  const isbn13 = normalizeIsbn(asNonEmptyString(data.isbn13), 13);
  const isbn10 = normalizeIsbn(asNonEmptyString(data.isbn10), 10);

  const rank = computeRank(queryNorm, queryTokens, {
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
    hasEbook,
    downloadable,
    isEbookAvailable: downloadable,
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
  };
}

async function collectCanonicalCandidates(
  queryNorm: string,
  queryTokens: string[],
  options: SearchOptions
): Promise<RankedResult[]> {
  const db = getFirestore();
  const books = db.collection("books");
  const dedup = new Map<string, RankedResult>();

  const isbnQuery = parseIsbnQuery(queryNorm);

  const snapshots: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>[] = [];

  if (isbnQuery.isbn13) {
    snapshots.push(await books.where("isbn13", "==", isbnQuery.isbn13).limit(5).get());
  }

  if (isbnQuery.isbn10) {
    snapshots.push(await books.where("isbn10", "==", isbnQuery.isbn10).limit(5).get());
  }

  if (queryTokens.length > 0) {
    snapshots.push(
      await books
        .where("search.tokens", "array-contains-any", queryTokens.slice(0, 10))
        .limit(INTERNAL_FETCH_POOL)
        .get()
    );
  }

  if (queryNorm.length >= 2) {
    try {
      snapshots.push(
        await books
          .orderBy("normalizedTitle")
          .startAt(queryNorm)
          .endAt(`${queryNorm}\uf8ff`)
          .limit(INTERNAL_FETCH_POOL)
          .get()
      );
    } catch {
      // If prefix index is not deployed yet, token-query remains authoritative.
    }
  }

  for (const snapshot of snapshots) {
    snapshot.forEach((doc) => {
      const mapped = mapCanonicalBook(
        doc.id,
        doc.data() as Record<string, unknown>,
        queryNorm,
        queryTokens,
        options
      );
      if (!mapped) return;
      if (!isLikelyBook(mapped.title, "book")) return;
      dedup.set(doc.id, mapped);
    });
  }

  return Array.from(dedup.values());
}

async function fetchGoogleExternal(
  query: string,
  queryNorm: string,
  queryTokens: string[],
  queryIntent: QueryIntent,
  requestedLanguage?: string
): Promise<RankedResult[]> {
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
  const mapped: RankedResult[] = [];

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

    const rank = computeRank(queryNorm, queryTokens, {
      title,
      authors: normalizedAuthors,
      isbn13,
      isbn10,
      queryIntent,
    });

    if (rank.rankTier > 0 && rank.confidence < CONFIDENCE_THRESHOLD) {
      continue;
    }
    if (rank.rankTier === 3 && rank.tokenCoverageRatio < 0.5) {
      continue;
    }

    const externalId = asNonEmptyString(item.id);
    if (!externalId) continue;

    const imageLinks = asRecord(volumeInfo.imageLinks);
    const thumbnail = asNonEmptyString(imageLinks?.thumbnail).replace(/^http:\/\//i, "https://");

    const language = asNonEmptyString(volumeInfo.language) || "en";
    const hasExternalEbookSignal =
      Boolean(asRecord(item.saleInfo)?.isEbook) ||
      Boolean(asRecord(asRecord(item.accessInfo)?.epub)?.isAvailable) ||
      Boolean(asRecord(asRecord(item.accessInfo)?.pdf)?.isAvailable);
    const languageTruth = resolveLanguageTruth(language, requestedLanguage);

    mapped.push({
      id: `gb_${externalId}`,
      editionId: `gb_${externalId}`,
      bookId: `gb_${externalId}`,
      workId: null,
      externalId,
      source: "googleBooks",
      resultType: "external",
      workType: "edition",
      editionPresence: "edition",
      ebookClass: computeExternalEbookClass(hasExternalEbookSignal),
      sourceClass: "external_provider",
      languageTruth,
      title,
      titleEn: title,
      titleAr: "",
      authors: normalizedAuthors,
      authorEn: normalizedAuthors[0],
      authorAr: "",
      description: asNonEmptyString(volumeInfo.description) || "",
      descriptionEn: asNonEmptyString(volumeInfo.description) || "",
      descriptionAr: "",
      coverUrl: thumbnail,
      language,
      hasEbook: false,
      downloadable: false,
      isEbookAvailable: false,
      confidence: rank.confidence,
      rank: rank.rankTier,
      rankTier: rank.rankTier,
      computedScore: rank.computedScore,
      tokenCoverageRatio: rank.tokenCoverageRatio,
      popularityScore: 0,
      engagementScore: 0,
      recentActivityMs: 0,
      normalizedTitle: normalizeSearchText(title),
      languageMatchScore: toLanguageMatchScore(languageTruth),
      isbn13: isbn13 || undefined,
      isbn10: isbn10 || undefined,
      canonicalKey: `${normalizeSearchText(normalizedAuthors[0])}::${normalizeSearchText(title)}`,
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

async function fetchOpenLibraryExternal(
  query: string,
  queryNorm: string,
  queryTokens: string[],
  queryIntent: QueryIntent,
  requestedLanguage?: string
): Promise<RankedResult[]> {
  const baseUrl = new URL("https://openlibrary.org/search.json");
  baseUrl.searchParams.set("q", query);
  baseUrl.searchParams.set("limit", "20");

  const payload = (await fetchJsonWithTimeout({
    url: baseUrl.toString(),
    provider: "openLibrary",
  })) as { docs?: Array<Record<string, unknown>> } | null;
  if (!payload) return [];

  const docs = Array.isArray(payload.docs) ? payload.docs : [];
  const mapped: RankedResult[] = [];

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

    const rank = computeRank(queryNorm, queryTokens, {
      title,
      authors: normalizedAuthors,
      isbn13,
      isbn10,
      queryIntent,
    });

    if (rank.rankTier > 0 && rank.confidence < CONFIDENCE_THRESHOLD) {
      continue;
    }
    if (rank.rankTier === 3 && rank.tokenCoverageRatio < 0.5) {
      continue;
    }

    const key = asNonEmptyString(doc.key).replace(/^\/works\//, "");
    if (!key) continue;

    const coverId = asNonEmptyString(doc.cover_i);
    const coverUrl = coverId
      ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
      : "";

    const language = asStringArray(doc.language)[0] || "en";
    const hasExternalEbookSignal = Number(doc.ebook_count_i || 0) > 0;
    const languageTruth = resolveLanguageTruth(language, requestedLanguage);

    mapped.push({
      id: `ol_${key}`,
      editionId: `ol_${key}`,
      bookId: `ol_${key}`,
      workId: null,
      externalId: key,
      source: "openLibrary",
      resultType: "external",
      workType: "edition",
      editionPresence: "edition",
      ebookClass: computeExternalEbookClass(hasExternalEbookSignal),
      sourceClass: "external_provider",
      languageTruth,
      title,
      titleEn: title,
      titleAr: "",
      authors: normalizedAuthors,
      authorEn: normalizedAuthors[0],
      authorAr: "",
      description: "",
      descriptionEn: "",
      descriptionAr: "",
      coverUrl,
      language,
      hasEbook: false,
      downloadable: false,
      isEbookAvailable: false,
      confidence: rank.confidence,
      rank: rank.rankTier,
      rankTier: rank.rankTier,
      computedScore: rank.computedScore,
      tokenCoverageRatio: rank.tokenCoverageRatio,
      popularityScore: 0,
      engagementScore: 0,
      recentActivityMs: 0,
      normalizedTitle: normalizeSearchText(title),
      languageMatchScore: toLanguageMatchScore(languageTruth),
      isbn13: isbn13 || undefined,
      isbn10: isbn10 || undefined,
      canonicalKey: `${normalizeSearchText(normalizedAuthors[0])}::${normalizeSearchText(title)}`,
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

function rerankWithIntent(
  result: RankedResult,
  queryNorm: string,
  queryTokens: string[],
  queryIntent: QueryIntent
): RankedResult | null {
  const rank = computeRank(queryNorm, queryTokens, {
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
        ? Math.round((rank.computedScore + computeCanonicalTitleAdjustment(queryNorm, result.title)) * 1_000_000) /
          1_000_000
        : rank.computedScore,
    tokenCoverageRatio: rank.tokenCoverageRatio,
  };
}

function rankCanonicalResults(
  canonicalCandidates: RankedResult[],
  queryNorm: string,
  queryTokens: string[],
  queryIntent: QueryIntent
): RankedResult[] {
  return canonicalCandidates
    .map((entry) => rerankWithIntent(entry, queryNorm, queryTokens, queryIntent))
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

function filterAndDedupExternal(
  rankedExternal: RankedResult[],
  canonicalResults: RankedResult[]
): RankedResult[] {
  const canonicalIdentity = new Set<string>();
  for (const canonical of canonicalResults) {
    canonicalIdentity.add(canonicalIdentityKey(canonical));
    if (canonical.isbn13) canonicalIdentity.add(`isbn13:${canonical.isbn13}`);
    if (canonical.isbn10) canonicalIdentity.add(`isbn10:${canonical.isbn10}`);
  }

  const accepted: RankedResult[] = [];
  const seen = new Set<string>();

  for (const result of rankedExternal.sort(compareRanked)) {
    const identities = [
      result.isbn13 ? `isbn13:${result.isbn13}` : "",
      result.isbn10 ? `isbn10:${result.isbn10}` : "",
      result.canonicalKey ? `canonical:${result.canonicalKey}` : "",
      `provider:${result.source}:${result.externalId}`,
    ].filter((entry) => entry.length > 0);

    if (identities.some((entry) => canonicalIdentity.has(entry))) {
      continue;
    }

    if (identities.some((entry) => seen.has(entry))) {
      continue;
    }

    identities.forEach((entry) => seen.add(entry));
    accepted.push(result);
  }

  return accepted;
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

  const queryTokens = tokenize(queryNorm);
  const limit = normalizeLimit(options.limit);
  const fingerprint = computeFingerprint(queryNorm, options);
  const decodedCursor = decodeCursor(options.cursor);
  const startOffset =
    decodedCursor && decodedCursor.fingerprint === fingerprint
      ? decodedCursor.offset
      : 0;

  const canonicalPhaseIds = {
    isbn: new Set<string>(),
    tokens: new Set<string>(),
    prefix: new Set<string>(),
  };

  phaseOrder.push("canonical_isbn");
  const db = getFirestore();
  const books = db.collection("books");
  const isbnQuery = parseIsbnQuery(queryNorm);
  const canonicalDedup = new Map<string, RankedResult>();

  if (isbnQuery.isbn13) {
    const isbn13Snap = await books.where("isbn13", "==", isbnQuery.isbn13).limit(5).get();
    isbn13Snap.forEach((doc) => {
      const mapped = mapCanonicalBook(
        doc.id,
        doc.data() as Record<string, unknown>,
        queryNorm,
        queryTokens,
        options
      );
      if (!mapped) return;
      if (!isLikelyBook(mapped.title, "book")) return;
      canonicalDedup.set(doc.id, mapped);
      canonicalPhaseIds.isbn.add(doc.id);
    });
  }

  if (isbnQuery.isbn10) {
    const isbn10Snap = await books.where("isbn10", "==", isbnQuery.isbn10).limit(5).get();
    isbn10Snap.forEach((doc) => {
      const mapped = mapCanonicalBook(
        doc.id,
        doc.data() as Record<string, unknown>,
        queryNorm,
        queryTokens,
        options
      );
      if (!mapped) return;
      if (!isLikelyBook(mapped.title, "book")) return;
      canonicalDedup.set(doc.id, mapped);
      canonicalPhaseIds.isbn.add(doc.id);
    });
  }

  phaseOrder.push("canonical_tokens");
  if (queryTokens.length > 0) {
    const tokenSnap = await books
      .where("search.tokens", "array-contains-any", queryTokens.slice(0, 10))
      .limit(INTERNAL_FETCH_POOL)
      .get();
    tokenSnap.forEach((doc) => {
      const mapped = mapCanonicalBook(
        doc.id,
        doc.data() as Record<string, unknown>,
        queryNorm,
        queryTokens,
        options
      );
      if (!mapped) return;
      if (!isLikelyBook(mapped.title, "book")) return;
      canonicalDedup.set(doc.id, mapped);
      canonicalPhaseIds.tokens.add(doc.id);
    });
  }

  phaseOrder.push("canonical_prefix");
  if (queryNorm.length >= 2) {
    try {
      const prefixSnap = await books
        .orderBy("normalizedTitle")
        .startAt(queryNorm)
        .endAt(`${queryNorm}\uf8ff`)
        .limit(INTERNAL_FETCH_POOL)
        .get();
      prefixSnap.forEach((doc) => {
        const mapped = mapCanonicalBook(
          doc.id,
          doc.data() as Record<string, unknown>,
          queryNorm,
          queryTokens,
          options
        );
        if (!mapped) return;
        if (!isLikelyBook(mapped.title, "book")) return;
        canonicalDedup.set(doc.id, mapped);
        canonicalPhaseIds.prefix.add(doc.id);
      });
    } catch {
      // If prefix index is not deployed yet, token-query remains authoritative.
    }
  }

  const canonicalCandidates = Array.from(canonicalDedup.values());
  const queryIntent = detectQueryIntent(
    queryNorm,
    queryTokens,
    canonicalCandidates.map((entry) => ({
      title: entry.title,
      authors: entry.authors,
    }))
  );

  const rerankedCanonical = rankCanonicalResults(
    canonicalCandidates,
    queryNorm,
    queryTokens,
    queryIntent
  );
  const internalSearchDurationMs = Date.now() - totalStartMs;

  let externalCandidates: RankedResult[] = [];
  const externalFallbackEnabled = process.env.NODE_ENV !== 'test';
  let googleCount = 0;
  let openLibraryCount = 0;

  const shouldUseExternalFallback =
    externalFallbackEnabled &&
    !options.ebookOnly &&
    rerankedCanonical.length < EXTERNAL_FALLBACK_TRIGGER;

  if (shouldUseExternalFallback) {
    phaseOrder.push("external_fallback");
    const [google, openLibrary] = await Promise.all([
      fetchGoogleExternal(queryNorm, queryNorm, queryTokens, queryIntent, options.language),
      fetchOpenLibraryExternal(queryNorm, queryNorm, queryTokens, queryIntent, options.language),
    ]);

    externalCandidates = filterAndDedupExternal(
      [...google, ...openLibrary],
      rerankedCanonical
    );
    googleCount = externalCandidates.filter((entry) => entry.source === "googleBooks").length;
    openLibraryCount = externalCandidates.filter((entry) => entry.source === "openLibrary").length;
  }

  const merged = [...rerankedCanonical, ...externalCandidates].sort(compareRanked);
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
  const topCoverageScores = merged
    .slice(0, 3)
    .map((entry) => Math.round(entry.tokenCoverageRatio * 1_000_000) / 1_000_000);
  const topCoverageScore = topCoverageScores[0] ?? 0;
  const lowConfidenceTopThree =
    topCoverageScores.length === 3 && topCoverageScores.every((score) => score < 0.6);

  logger.info("BOOK_SEARCH_V2_ENGINE_TRACE", {
    query: queryNorm.slice(0, 80),
    phaseOrder,
    canonicalPhaseCounts: {
      isbn: canonicalPhaseIds.isbn.size,
      tokens: canonicalPhaseIds.tokens.size,
      prefix: canonicalPhaseIds.prefix.size,
      canonical: rerankedCanonical.length,
    },
    externalFallbackCalled:
      shouldUseExternalFallback,
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
        ...publicResult
      } = entry;
      void rankTier;
      void computedScore;
      void tokenCoverageRatio;
      void popularityScore;
      void engagementScore;
      void recentActivityMs;
      void normalizedTitle;
      return publicResult;
    }),
    nextCursor,
    hasMore,
    cursorUsed: startOffset > 0,
    canonicalCount: rerankedCanonical.length,
    externalCount: externalCandidates.length,
    telemetry: {
      normalizedQuery: queryNorm,
      intentType: queryIntent,
      internalSearchDurationMs,
      totalDurationMs,
      externalFallbackTriggered:
        shouldUseExternalFallback,
      topCoverageScore,
      topCoverageScores,
      lowConfidenceTopThree,
      timestamp: new Date().toISOString(),
    },
  };
}
