import express from "express";
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { unifiedSearch } from "./library/search/searchEngine";
import crypto from "crypto";
import { admin } from "./firebaseAdmin";
import { getSignedUrl } from "./attachments/storageSignedUrl";

type SearchBookResponse = {
  id: string;
  editionId: string;
  bookId: string;
  externalId: string;
  source: "booktown" | "googleBooks" | "openLibrary";
  resultType: "canonical" | "external";
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
  rawBook?: Record<string, unknown>;
};

const INTERNAL_BOOK_COVER_PATH_RE = /^books\/[^/]+\/covers\/[^?#]+$/i;
const DEFAULT_STORAGE_BUCKET = admin.storage().bucket().name;
const ENABLE_SEARCH_TELEMETRY = process.env.ENABLE_SEARCH_TELEMETRY === "true";
const QUERY_INTENT_VALUES = ["ISBN", "AUTHOR_INTENT", "TITLE_INTENT", "MIXED_INTENT"] as const;
type QueryIntent = (typeof QUERY_INTENT_VALUES)[number];

type SearchQueryTelemetryPayload = {
  normalizedQuery: string;
  intentType: QueryIntent;
  canonicalResultCount: number;
  externalResultCount: number;
  totalReturned: number;
  latencyMs: number;
  internalSearchDurationMs: number;
  externalFallbackTriggered: boolean;
  timestamp: string;
  topCoverageScore: number;
  topCoverageScores: number[];
  lowConfidenceTopThree: boolean;
};

type SearchClickTelemetryPayload = {
  normalizedQuery: string;
  intentType: QueryIntent;
  clickedRank: number;
  bookId: string;
  wasCanonical: boolean;
  timestamp: string;
};

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

function parseIsbnQuery(queryNorm: string): { isbn13: string; isbn10: string } {
  const digits = queryNorm.replace(/[^0-9Xx]/g, "").toUpperCase();
  return {
    isbn13: /^\d{13}$/.test(digits) ? digits : "",
    isbn10: /^\d{9}[\dX]$/.test(digits) ? digits : "",
  };
}

function classifyIntentForTelemetry(normalizedQuery: string): QueryIntent {
  const isbn = parseIsbnQuery(normalizedQuery);
  if (isbn.isbn13 || isbn.isbn10) {
    return "ISBN";
  }

  const tokens = normalizedQuery.split(" ").filter((token) => token.length > 1);
  if (tokens.length === 1) {
    return "AUTHOR_INTENT";
  }
  if (tokens.length >= 2) {
    return "TITLE_INTENT";
  }
  return "MIXED_INTENT";
}

function parseIntentValue(value: unknown): QueryIntent | null {
  if (typeof value !== "string") return null;
  return QUERY_INTENT_VALUES.includes(value as QueryIntent)
    ? (value as QueryIntent)
    : null;
}

function runAfterResponse(res: any, cb: () => Promise<void>): void {
  res.once("finish", () => {
    void cb().catch((error) => {
      logger.warn("SEARCH_V2_TELEMETRY_WRITE_FAILED", {
        error: String(error),
      });
    });
  });
}

async function writeSearchQueryTelemetry(payload: SearchQueryTelemetryPayload): Promise<void> {
  if (!ENABLE_SEARCH_TELEMETRY) return;

  const db = admin.firestore();
  const queryHash = crypto.createHash("sha256").update(payload.normalizedQuery).digest("hex");
  const batch = db.batch();
  const searchLogRef = db.collection("search_logs").doc();
  const latencyLogRef = db.collection("search_logs").doc();
  const eventBase = {
    normalizedQuery: payload.normalizedQuery,
    queryHash,
    intentType: payload.intentType,
    timestamp: payload.timestamp,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  batch.set(searchLogRef, {
    eventName: "SEARCH_V2_QUERY",
    ...eventBase,
    canonicalResultCount: payload.canonicalResultCount,
    externalResultCount: payload.externalResultCount,
    totalReturned: payload.totalReturned,
    latencyMs: payload.latencyMs,
  });

  batch.set(latencyLogRef, {
    eventName: "SEARCH_V2_LATENCY",
    ...eventBase,
    internalSearchDurationMs: payload.internalSearchDurationMs,
    externalFallbackTriggered: payload.externalFallbackTriggered,
    totalDurationMs: payload.latencyMs,
  });

  if (payload.lowConfidenceTopThree || payload.topCoverageScore < 0.6) {
    const flagRef = db.collection("search_quality_flags").doc();
    batch.set(flagRef, {
      eventName: "SEARCH_V2_LOW_CONFIDENCE",
      ...eventBase,
      topCoverageScore: payload.topCoverageScore,
      topCoverageScores: payload.topCoverageScores.slice(0, 3),
    });
  }

  await batch.commit();
}

async function writeSearchClickTelemetry(payload: SearchClickTelemetryPayload): Promise<void> {
  if (!ENABLE_SEARCH_TELEMETRY) return;

  const db = admin.firestore();
  await db.collection("search_clicks").add({
    eventName: "SEARCH_V2_CLICK",
    normalizedQuery: payload.normalizedQuery,
    queryHash: crypto.createHash("sha256").update(payload.normalizedQuery).digest("hex"),
    intentType: payload.intentType,
    clickedRank: payload.clickedRank,
    bookId: payload.bookId,
    wasCanonical: payload.wasCanonical,
    timestamp: payload.timestamp,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

function toSearchBookResponse(raw: any): SearchBookResponse | null {
  const sourceRaw = String(raw?.source || "").trim();
  const source =
    sourceRaw === "booktown"
      ? "booktown"
      : sourceRaw === "googleBooks"
      ? "googleBooks"
      : sourceRaw === "openLibrary"
      ? "openLibrary"
      : null;
  if (!source) return null;

  const title = String(raw?.title || raw?.titleEn || "").trim();
  if (!title) return null;

  const editionId = String(raw?.editionId || raw?.id || "").trim();
  const bookId = String(raw?.bookId || raw?.id || "").trim();
  if (!editionId || !bookId) return null;

  const authors = Array.isArray(raw?.authors)
    ? raw.authors.filter((v: unknown) => typeof v === "string" && v.trim().length > 0)
    : [];
  const authorEn = String(raw?.authorEn || authors[0] || "Unknown");
  const normalizedAuthors = authors.length > 0 ? authors : [authorEn];
  const externalId = String(raw?.externalId || "").trim();
  const hasEbook = Boolean(raw?.hasEbook);
  const downloadable = Boolean(raw?.downloadable);
  const ebookAvailable = Boolean(raw?.isEbookAvailable ?? hasEbook);
  const resultType =
    String(raw?.resultType || "").trim() === "external"
      ? "external"
      : "canonical";
  const confidenceRaw = Number(raw?.confidence);
  const rankRaw = Number(raw?.rank);

  return {
    id: String(raw?.id || editionId),
    editionId,
    bookId,
    externalId,
    source,
    resultType,
    title,
    titleEn: String(raw?.titleEn || title),
    titleAr: String(raw?.titleAr || ""),
    authors: normalizedAuthors,
    authorEn,
    authorAr: String(raw?.authorAr || ""),
    description: String(raw?.description || raw?.descriptionEn || ""),
    descriptionEn: String(raw?.descriptionEn || raw?.description || ""),
    descriptionAr: String(raw?.descriptionAr || ""),
    coverUrl: String(raw?.coverUrl || ""),
    language: String(raw?.language || "en"),
    hasEbook,
    downloadable,
    isEbookAvailable: ebookAvailable,
    confidence: Number.isFinite(confidenceRaw) ? confidenceRaw : 0,
    rank: Number.isFinite(rankRaw) ? rankRaw : 999,
    rawBook:
      raw?.rawBook && typeof raw.rawBook === "object"
        ? (raw.rawBook as Record<string, unknown>)
        : undefined,
  };
}

function extractInternalBookCoverPath(candidate: string, expectedBucket: string): string {
  const raw = candidate.trim();
  if (!raw) {
    return "";
  }

  if (INTERNAL_BOOK_COVER_PATH_RE.test(raw)) {
    return raw;
  }

  try {
    const parsed = new URL(raw);
    if (parsed.hostname === "storage.googleapis.com") {
      const segments = parsed.pathname.split("/").filter(Boolean);
      if (segments.length >= 4 && segments[0] === expectedBucket && segments[1] === "books") {
        const path = segments.slice(1).join("/");
        return INTERNAL_BOOK_COVER_PATH_RE.test(path) ? path : "";
      }
      if (segments.length >= 3 && segments[0] === "books") {
        const path = segments.join("/");
        return INTERNAL_BOOK_COVER_PATH_RE.test(path) ? path : "";
      }
      return "";
    }

    if (parsed.hostname === "firebasestorage.googleapis.com") {
      const marker = "/o/";
      const markerIndex = parsed.pathname.indexOf(marker);
      if (markerIndex === -1) {
        return "";
      }
      const encodedObjectPath = parsed.pathname.slice(markerIndex + marker.length);
      const objectPath = decodeURIComponent(encodedObjectPath);
      return INTERNAL_BOOK_COVER_PATH_RE.test(objectPath) ? objectPath : "";
    }
  } catch {
    return "";
  }

  return "";
}

const app = express();
// FIX: Cast app to any to resolve middleware overload mismatch.
(app as any).use(express.json());

/**
 * --------------------------------------------------
 * Root (debug-friendly)
 * --------------------------------------------------
 */
// FIX: Cast req and res to any to avoid property existence errors.
app.get("/", (_req: any, res: any) => {
  res.status(200).json({
    ok: true,
    service: "booktown-api",
    hint: "Use /api/* endpoints",
    timestamp: Date.now(),
  });
});

/**
 * --------------------------------------------------
 * API Router (mounted at /api)
 * --------------------------------------------------
 */
const apiRouter = express.Router();

/**
 * Health Check
 */
// FIX: Cast req and res to any.
apiRouter.get("/health", (_req: any, res: any) => {
  res.status(200).json({
    ok: true,
    service: "booktown-api",
    timestamp: Date.now(),
  });
});

/**
 * GET /api/search/books
 * Authoritative Unified Search
 */
apiRouter.get("/search/books", async (req: any, res: any) => {
  const startTime = Date.now();

  try {
    const q = req.query.q as string | undefined;
    const ebookOnly = req.query.ebookOnly === "true";
    const lang = req.query.lang as string | undefined;
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const limitRaw =
      typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const limit =
      typeof limitRaw === "number" && Number.isFinite(limitRaw)
        ? Math.max(1, Math.min(30, Math.trunc(limitRaw)))
        : undefined;
    const queryPreview = (q || "").trim().slice(0, 80);

    logger.info("BOOK_SEARCH_V2_API", {
      phase: "request",
      q: queryPreview,
      ebookOnly,
      lang: lang || "auto",
      limit: limit ?? null,
      hasCursor: Boolean(cursor),
    });

    if (!q || q.trim().length < 2) {
      const normalizedQuery = normalizeSearchText(q || "");
      const timestamp = new Date().toISOString();

      runAfterResponse(res, async () => {
        await writeSearchQueryTelemetry({
          normalizedQuery,
          intentType: classifyIntentForTelemetry(normalizedQuery),
          canonicalResultCount: 0,
          externalResultCount: 0,
          totalReturned: 0,
          latencyMs: Date.now() - startTime,
          internalSearchDurationMs: 0,
          externalFallbackTriggered: false,
          timestamp,
          topCoverageScore: 0,
          topCoverageScores: [],
          lowConfidenceTopThree: false,
        });
      });

      logger.info("BOOK_SEARCH_V2_API", {
        phase: "response",
        q: queryPreview,
        canonicalCount: 0,
        externalCount: 0,
        hasMore: false,
        cursorUsed: false,
        reason: "short_query",
      });
      return res.status(200).json({
        results: [],
        nextCursor: null,
        hasMore: false,
        cursorUsed: false,
      });
    }

    console.log(
      `[API][SEARCH] Query="${q}" ebookOnly=${ebookOnly} lang=${lang}`
    );

    const searchResponse = await unifiedSearch(q, {
      ebookOnly,
      language: lang,
      cursor,
      limit,
    });
    const parsedResults = searchResponse.results
      .map((row: any) => toSearchBookResponse(row))
      .filter((row: SearchBookResponse | null): row is SearchBookResponse => row !== null);
    const signedCoverByBookId = new Map<string, string>();
    const results = await Promise.all(
      parsedResults.map(async (row) => {
        const internalCoverPath = extractInternalBookCoverPath(
          row.coverUrl,
          DEFAULT_STORAGE_BUCKET
        );
        if (!internalCoverPath) {
          return row;
        }

        const coverKey = row.bookId || internalCoverPath;
        if (signedCoverByBookId.has(coverKey)) {
          return {
            ...row,
            coverUrl: signedCoverByBookId.get(coverKey) || "",
          };
        }

        try {
          const signedCoverUrl = await getSignedUrl({
            bucket: DEFAULT_STORAGE_BUCKET,
            path: internalCoverPath,
            intent: "cover",
          });
          signedCoverByBookId.set(coverKey, signedCoverUrl);
          return {
            ...row,
            coverUrl: signedCoverUrl,
          };
        } catch (error) {
          console.warn("[API][SEARCH][COVER_SIGN_FAILED]", {
            bookId: row.bookId,
            path: internalCoverPath,
            error: String(error),
          });
          return {
            ...row,
            coverUrl: "",
          };
        }
      })
    );

    const latencyMs = Date.now() - startTime;
    const normalizedQuery = normalizeSearchText(q);
    const telemetry = searchResponse.telemetry;
    const intentType =
      parseIntentValue(telemetry?.intentType) ||
      classifyIntentForTelemetry(normalizedQuery);
    const topCoverageScores = Array.isArray(telemetry?.topCoverageScores)
      ? telemetry.topCoverageScores
          .filter((score) => typeof score === "number" && Number.isFinite(score))
          .slice(0, 3)
      : [];

    runAfterResponse(res, async () => {
      await writeSearchQueryTelemetry({
        normalizedQuery,
        intentType,
        canonicalResultCount: searchResponse.canonicalCount,
        externalResultCount: searchResponse.externalCount,
        totalReturned: results.length,
        latencyMs,
        internalSearchDurationMs:
          typeof telemetry?.internalSearchDurationMs === "number" &&
          Number.isFinite(telemetry.internalSearchDurationMs)
            ? telemetry.internalSearchDurationMs
            : latencyMs,
        externalFallbackTriggered: Boolean(telemetry?.externalFallbackTriggered),
        timestamp: telemetry?.timestamp || new Date().toISOString(),
        topCoverageScore:
          typeof telemetry?.topCoverageScore === "number" &&
          Number.isFinite(telemetry.topCoverageScore)
            ? telemetry.topCoverageScore
            : 0,
        topCoverageScores,
        lowConfidenceTopThree: Boolean(telemetry?.lowConfidenceTopThree),
      });
    });

    logger.info("BOOK_SEARCH_V2_API", {
      phase: "response",
      q: queryPreview,
      normalizedQuery,
      intentType,
      canonicalCount: searchResponse.canonicalCount,
      externalCount: searchResponse.externalCount,
      hasMore: searchResponse.hasMore,
      cursorUsed: searchResponse.cursorUsed,
      resultCount: results.length,
      latencyMs,
      internalSearchDurationMs:
        typeof telemetry?.internalSearchDurationMs === "number" &&
        Number.isFinite(telemetry.internalSearchDurationMs)
          ? telemetry.internalSearchDurationMs
          : latencyMs,
      externalFallbackTriggered: Boolean(telemetry?.externalFallbackTriggered),
    });

    return res.status(200).json({
      results,
      nextCursor: searchResponse.nextCursor,
      hasMore: searchResponse.hasMore,
      cursorUsed: searchResponse.cursorUsed,
    });
  } catch (error) {
    console.error("[API][SEARCH_BOOKS_ERROR]", error);
    logger.error("BOOK_SEARCH_V2_API", {
      phase: "error",
      error: String(error),
    });
    return res.status(200).json({
      results: [],
      nextCursor: null,
      hasMore: false,
      cursorUsed: false,
    });
  }
});

/**
 * POST /api/search/click
 * Search click telemetry (non-blocking, privacy-safe)
 */
apiRouter.post("/search/click", async (req: any, res: any) => {
  const payload = req?.body && typeof req.body === "object" ? req.body : {};
  const normalizedQuery = normalizeSearchText(String(payload.normalizedQuery || ""));
  const intentType =
    parseIntentValue(payload.intentType) ||
    classifyIntentForTelemetry(normalizedQuery);
  const clickedRankRaw = Number(payload.clickedRank);
  const clickedRank =
    Number.isFinite(clickedRankRaw) && clickedRankRaw > 0
      ? Math.trunc(clickedRankRaw)
      : 1;
  const bookId = String(payload.bookId || "").trim().slice(0, 128);
  const wasCanonical = Boolean(payload.wasCanonical);
  const timestamp = new Date().toISOString();

  runAfterResponse(res, async () => {
    if (!bookId || !normalizedQuery) {
      return;
    }
    await writeSearchClickTelemetry({
      normalizedQuery,
      intentType,
      clickedRank,
      bookId,
      wasCanonical,
      timestamp,
    });
  });

  logger.info("SEARCH_V2_CLICK", {
    normalizedQuery: normalizedQuery.slice(0, 80),
    intentType,
    clickedRank,
    bookId,
    wasCanonical,
  });

  return res.status(202).json({ ok: true });
});

/**
 * POST /api/ai/chat
 * Deterministic stub (safe)
 */
// FIX: Cast req and res to any.
apiRouter.post("/ai/chat", async (_req: any, res: any) => {
  return res.status(200).json({
    text: "The librarian is getting ready. Book recommendations will appear here soon.",
  });
});

/**
 * Mount API router
 */
app.use("/api", apiRouter);

/**
 * --------------------------------------------------
 * Export v2 HTTPS Function
 * --------------------------------------------------
 */
export const api = onRequest(
  {
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 60,
  },
  app
);
