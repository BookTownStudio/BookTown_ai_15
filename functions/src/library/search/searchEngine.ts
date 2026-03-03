import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

export interface SearchOptions {
  ebookOnly?: boolean;
  language?: string;
  cursor?: string;
  limit?: number;
}

export type SearchResultType = "canonical" | "external";
export type SearchSource = "booktown" | "googleBooks" | "openLibrary";

export interface UnifiedSearchResult {
  id: string;
  editionId: string;
  bookId: string;
  externalId: string;
  source: SearchSource;
  resultType: SearchResultType;
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
      ? 0.9
      : 0.3
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
    authors: string[];
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
  const titleNorm = normalizeSearchText(params.title);
  const authorNorm = normalizeSearchText((params.authors || []).join(" "));

  const queryIsbn = parseIsbnQuery(queryNorm);
  const isIsbnExact =
    (queryIsbn.isbn13.length > 0 && queryIsbn.isbn13 === (params.isbn13 || "")) ||
    (queryIsbn.isbn10.length > 0 && queryIsbn.isbn10 === (params.isbn10 || ""));

  if (isIsbnExact) {
    return { confidence: 1, rankTier: 0, computedScore: 1, tokenCoverageRatio: 1 };
  }

  const titleExact = titleNorm.length > 0 && titleNorm === queryNorm;
  const authorExact = authorNorm.length > 0 && authorNorm === queryNorm;

  const titleTokenSet = new Set(tokenize(titleNorm));
  const authorTokenSet = new Set(tokenize(authorNorm));

  let titleHits = 0;
  let authorHits = 0;
  let matchedTokenCount = 0;

  for (const token of queryTokens) {
    const matchedInTitle = titleTokenSet.has(token);
    const matchedInAuthor = authorTokenSet.has(token);
    if (matchedInTitle) titleHits += 1;
    if (matchedInAuthor) authorHits += 1;
    if (matchedInTitle || matchedInAuthor) matchedTokenCount += 1;
  }

  const tokenCount = Math.max(queryTokens.length, 1);
  const titleCoverage = titleHits / tokenCount;
  const authorCoverage = authorHits / tokenCount;
  const tokenCoverageRatio = matchedTokenCount / tokenCount;

  const titleTokens = tokenize(titleNorm);
  const adjacencyBonus = computeAdjacencyBonus(queryTokens, titleTokens);
  const titlePrefix = queryNorm.length > 1 && titleNorm.startsWith(queryNorm);
  const authorPrefix = queryNorm.length > 1 && authorNorm.startsWith(queryNorm);
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
    return {
      confidence: 0.84,
      rankTier: 2,
      computedScore: tierSubScore,
      tokenCoverageRatio,
    };
  }

  let confidence = 0;
  if (titleExact) confidence += 0.72;
  if (authorExact) confidence += 0.22;
  confidence += Math.min(0.2, titleCoverage * 0.2);
  confidence += Math.min(0.15, authorCoverage * 0.15);
  if (titlePrefix || authorPrefix) confidence += 0.08;

  confidence = Math.min(1, confidence);

  if (titleExact && (authorHits > 0 || authorExact)) {
    return {
      confidence: Math.max(confidence, 0.95),
      rankTier: 1,
      computedScore: Math.max(confidence, 0.95),
      tokenCoverageRatio,
    };
  }

  if (titlePrefix || (titleCoverage >= 0.8 && (authorHits > 0 || authorPrefix))) {
    return {
      confidence: Math.max(confidence, 0.75),
      rankTier: 2,
      computedScore: tierSubScore,
      tokenCoverageRatio,
    };
  }

  return {
    confidence,
    rankTier: 3,
    computedScore: tierSubScore,
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
  const title =
    asNonEmptyString(data.title) ||
    asNonEmptyString(data.titleEn) ||
    "";
  if (!title) return null;

  const authors =
    asStringArray(data.authors).length > 0
      ? asStringArray(data.authors)
      : [
          asNonEmptyString(data.authorEn) ||
            asNonEmptyString(data.author) ||
            "Unknown",
        ];

  const language = asNonEmptyString(data.language) || "en";
  if (options.language && options.language.trim().length > 0) {
    const requested = options.language.trim().toLowerCase();
    if (language.toLowerCase() !== requested) {
      return null;
    }
  }

  const hasEbook = Boolean(data.hasEbook || data.isEbookAvailable || data.downloadable);
  const downloadable = Boolean(data.downloadable || data.hasEbook || data.isEbookAvailable);
  if (options.ebookOnly && !downloadable) {
    return null;
  }

  const isbn13 = normalizeIsbn(asNonEmptyString(data.isbn13), 13);
  const isbn10 = normalizeIsbn(asNonEmptyString(data.isbn10), 10);

  const rank = computeRank(queryNorm, queryTokens, {
    title,
    authors,
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
    "";

  const canonicalKey =
    asNonEmptyString(data.canonicalKey) ||
    `${normalizeSearchText(authors[0] || "unknown")}::${normalizeSearchText(title)}`;

  return {
    id: docId,
    editionId: docId,
    bookId: docId,
    externalId: "",
    source: "booktown",
    resultType: "canonical",
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
    isEbookAvailable: hasEbook,
    confidence: rank.confidence,
    rank: rank.rankTier,
    rankTier: rank.rankTier,
    computedScore: rank.computedScore,
    tokenCoverageRatio: rank.tokenCoverageRatio,
    popularityScore: Number(data.popularityScore || 0),
    engagementScore: Number(data.engagementScore || 0),
    recentActivityMs: toEpochMillis(data.recentActivityAt || data.updatedAt),
    normalizedTitle:
      asNonEmptyString(data.normalizedTitle) || normalizeSearchText(title),
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
  queryIntent: QueryIntent
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

    mapped.push({
      id: `gb_${externalId}`,
      editionId: `gb_${externalId}`,
      bookId: `gb_${externalId}`,
      externalId,
      source: "googleBooks",
      resultType: "external",
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
      language: asNonEmptyString(volumeInfo.language) || "en",
      hasEbook:
        Boolean(asRecord(item.saleInfo)?.isEbook) ||
        Boolean(asRecord(asRecord(item.accessInfo)?.epub)?.isAvailable) ||
        Boolean(asRecord(asRecord(item.accessInfo)?.pdf)?.isAvailable),
      downloadable: false,
      isEbookAvailable:
        Boolean(asRecord(item.saleInfo)?.isEbook) ||
        Boolean(asRecord(asRecord(item.accessInfo)?.epub)?.isAvailable) ||
        Boolean(asRecord(asRecord(item.accessInfo)?.pdf)?.isAvailable),
      confidence: rank.confidence,
      rank: rank.rankTier,
      rankTier: rank.rankTier,
      computedScore: rank.computedScore,
      tokenCoverageRatio: rank.tokenCoverageRatio,
      popularityScore: 0,
      engagementScore: 0,
      recentActivityMs: 0,
      normalizedTitle: normalizeSearchText(title),
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
  queryIntent: QueryIntent
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

    mapped.push({
      id: `ol_${key}`,
      editionId: `ol_${key}`,
      bookId: `ol_${key}`,
      externalId: key,
      source: "openLibrary",
      resultType: "external",
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
      language: asStringArray(doc.language)[0] || "en",
      hasEbook: Number(doc.ebook_count_i || 0) > 0,
      downloadable: false,
      isEbookAvailable: Number(doc.ebook_count_i || 0) > 0,
      confidence: rank.confidence,
      rank: rank.rankTier,
      rankTier: rank.rankTier,
      computedScore: rank.computedScore,
      tokenCoverageRatio: rank.tokenCoverageRatio,
      popularityScore: 0,
      engagementScore: 0,
      recentActivityMs: 0,
      normalizedTitle: normalizeSearchText(title),
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
    computedScore: rank.computedScore,
    tokenCoverageRatio: rank.tokenCoverageRatio,
  };
}

function compareRanked(a: RankedResult, b: RankedResult): number {
  const typePriority = a.resultType === b.resultType ? 0 : a.resultType === "canonical" ? -1 : 1;
  if (typePriority !== 0) return typePriority;

  if (a.rankTier !== b.rankTier) return a.rankTier - b.rankTier;
  if (b.computedScore !== a.computedScore) return b.computedScore - a.computedScore;
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

  const rerankedCanonical = canonicalCandidates
    .map((entry) => rerankWithIntent(entry, queryNorm, queryTokens, queryIntent))
    .filter((entry): entry is RankedResult => Boolean(entry));
  rerankedCanonical.sort(compareRanked);
  const internalSearchDurationMs = Date.now() - totalStartMs;

  let externalCandidates: RankedResult[] = [];
  const externalFallbackEnabled = process.env.NODE_ENV !== 'test';
  let googleCount = 0;
  let openLibraryCount = 0;

  if (externalFallbackEnabled && rerankedCanonical.length < EXTERNAL_FALLBACK_TRIGGER) {
    phaseOrder.push("external_fallback");
    const [google, openLibrary] = await Promise.all([
      fetchGoogleExternal(queryNorm, queryNorm, queryTokens, queryIntent),
      fetchOpenLibraryExternal(queryNorm, queryNorm, queryTokens, queryIntent),
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
      externalFallbackEnabled && rerankedCanonical.length < EXTERNAL_FALLBACK_TRIGGER,
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
        externalFallbackEnabled && rerankedCanonical.length < EXTERNAL_FALLBACK_TRIGGER,
      topCoverageScore,
      topCoverageScores,
      lowConfidenceTopThree,
      timestamp: new Date().toISOString(),
    },
  };
}
