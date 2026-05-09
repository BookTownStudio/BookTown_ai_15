import express from "express";
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { z } from "zod";
import { unifiedSearch } from "./library/search/searchEngine";
import crypto from "crypto";
import { admin } from "./firebaseAdmin";
import { getSignedUrl } from "./attachments/storageSignedUrl";
import { getOrCreateAgentContextSnapshot } from "./intelligence/agentContextBuilder";
import { runLibrarianRecommendation } from "./ai/librarian";
import { enforceSearchRequestQuota } from "./utils/searchRequestQuota";
import { normalizeSearchText } from "./library/normalization/bookSearchNormalization";
import type { ExternalReadableSourceDTO, SearchResultDTO } from "./contracts/shared/bookSearch";

const INTERNAL_BOOK_COVER_PATH_RE = /^books\/[^/]+\/covers\/[^?#]+$/i;
const DEFAULT_STORAGE_BUCKET = admin.storage().bucket().name;
const ENABLE_SEARCH_TELEMETRY = process.env.ENABLE_SEARCH_TELEMETRY === "true";
const QUERY_INTENT_VALUES = ["ISBN", "AUTHOR_INTENT", "TITLE_INTENT", "MIXED_INTENT"] as const;
type QueryIntent = (typeof QUERY_INTENT_VALUES)[number];
const LIBRARIAN_INTENT_VALUES = [
  "Reinforcement",
  "AdjacentExpansion",
  "StructuredContrast",
  "HighConfidencePrecision",
  "ReReadingReflection",
] as const;

const librarianRequestSchema = z
  .object({
    normalizedQuery: z.string().min(1).max(280),
    intent: z.enum(LIBRARIAN_INTENT_VALUES).optional(),
  })
  .strict();

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

type AuthResolution =
  | { ok: true; uid: string }
  | { ok: false; status: 401; code: "missing_auth" | "invalid_auth" };

type AppCheckResolution =
  | { ok: true; appId: string }
  | { ok: false; status: 401; code: "missing_app_check" | "invalid_app_check" };

function shouldEnforceSearchAppCheck(): boolean {
  return process.env.NODE_ENV !== "test" && process.env.FUNCTIONS_EMULATOR !== "true";
}

function shouldEnforceSearchRateLimit(): boolean {
  return process.env.NODE_ENV !== "test" && process.env.FUNCTIONS_EMULATOR !== "true";
}

function normalizeLibrarianQuery(value: string): string {
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

function readBearerToken(req: any): string | null {
  const authHeader = req?.headers?.authorization;
  if (typeof authHeader !== "string") return null;
  const trimmed = authHeader.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return null;
  const token = trimmed.slice(7).trim();
  return token.length > 0 ? token : null;
}

async function resolveAuthenticatedUid(req: any): Promise<AuthResolution> {
  const token = readBearerToken(req);
  if (!token) {
    return { ok: false, status: 401, code: "missing_auth" };
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const uid =
      typeof decoded?.uid === "string" ? decoded.uid.trim().slice(0, 128) : "";
    if (!uid) {
      return { ok: false, status: 401, code: "invalid_auth" };
    }
    return { ok: true, uid };
  } catch (error) {
    logger.warn("[AI][CHAT][AUTH_VERIFY_FAILED]", { error: String(error) });
    return { ok: false, status: 401, code: "invalid_auth" };
  }
}

async function resolveOptionalAuthenticatedUid(req: any): Promise<string | null> {
  const token = readBearerToken(req);
  if (!token) {
    return null;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const uid =
      typeof decoded?.uid === "string" ? decoded.uid.trim().slice(0, 128) : "";
    return uid || null;
  } catch (error) {
    logger.warn("[BOOK_SEARCH_V2_API][AUTH_OPTIONAL_VERIFY_FAILED]", {
      error: String(error),
    });
    return null;
  }
}

async function resolveAppCheck(req: any): Promise<AppCheckResolution> {
  const headerRaw =
    req?.headers?.["x-firebase-appcheck"] ?? req?.headers?.["X-Firebase-AppCheck"];
  const token =
    typeof headerRaw === "string"
      ? headerRaw.trim()
      : Array.isArray(headerRaw) && typeof headerRaw[0] === "string"
      ? headerRaw[0].trim()
      : "";
  if (!token) {
    return { ok: false, status: 401, code: "missing_app_check" };
  }

  try {
    const decoded = await admin.appCheck().verifyToken(token);
    const appId = typeof decoded?.appId === "string" ? decoded.appId.trim() : "";
    if (!appId) {
      return { ok: false, status: 401, code: "invalid_app_check" };
    }
    return { ok: true, appId };
  } catch (error) {
    logger.warn("[AI][APP_CHECK_VERIFY_FAILED]", { error: String(error) });
    return { ok: false, status: 401, code: "invalid_app_check" };
  }
}

function resolveClientIp(req: any): string {
  const forwarded = req?.headers?.["x-forwarded-for"];
  const candidate = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === "string"
    ? forwarded.split(",")[0]
    : typeof req?.ip === "string"
    ? req.ip
    : "";
  return candidate.trim().slice(0, 128) || "unknown";
}

function buildSearchQuotaActorKey(params: {
  appId: string;
  uid: string | null;
  clientIp: string;
}): string {
  const scope = params.uid ? `uid:${params.uid}` : `ip:${params.clientIp}`;
  return crypto
    .createHash("sha256")
    .update(`${params.appId}::${scope}`)
    .digest("hex");
}

async function ensureAiConsent(uid: string): Promise<boolean> {
  const userSnap = await admin.firestore().collection("users").doc(uid).get();
  if (!userSnap.exists) return false;
  return userSnap.get("aiConsent") === true;
}

function toSearchResultDTO(raw: any): SearchResultDTO | null {
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
  const workIdRaw = typeof raw?.workId === "string" ? raw.workId.trim() : "";
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
  const workType =
    String(raw?.workType || "").trim() === "edition"
      ? "edition"
      : "work";
  const editionPresenceRaw = String(raw?.editionPresence || "").trim();
  const editionPresence =
    editionPresenceRaw === "grouped" || editionPresenceRaw === "edition"
      ? editionPresenceRaw
      : "single";
  const ebookClassRaw = String(raw?.ebookClass || "").trim();
  const ebookClass =
    ebookClassRaw === "in_app" ||
    ebookClassRaw === "external_link" ||
    ebookClassRaw === "unavailable"
      ? ebookClassRaw
      : downloadable
      ? "in_app"
      : "unavailable";
  const available = Boolean(raw?.available ?? (downloadable || ebookClass === "external_link"));
  const acquired = Boolean(raw?.acquired ?? downloadable);
  const sourceClassRaw = String(raw?.sourceClass || "").trim();
  const sourceClass =
    sourceClassRaw === "external_provider"
      ? "external_provider"
      : "canonical_catalog";
  const readAccessRaw = String(raw?.readAccess || "").trim();
  const readAccess =
    readAccessRaw === "none" ||
    readAccessRaw === "in_app" ||
    readAccessRaw === "trusted_external"
      ? readAccessRaw
      : acquired
      ? "in_app"
      : available
      ? "trusted_external"
      : "none";
  const readProviderRaw = String(raw?.readProvider || "").trim();
  const readProvider =
    readProviderRaw === "booktown" ||
    readProviderRaw === "openLibrary" ||
    readProviderRaw === "gutenberg" ||
    readProviderRaw === "hindawi" ||
    readProviderRaw === "gallica"
      ? readProviderRaw
      : acquired
      ? "booktown"
      : null;
  const languageTruthRaw = String(raw?.languageTruth || "").trim();
  const languageTruth =
    languageTruthRaw === "match" ||
    languageTruthRaw === "mismatch" ||
    languageTruthRaw === "unknown"
      ? languageTruthRaw
      : "unknown";
  const confidenceRaw = Number(raw?.confidence);
  const rankRaw = Number(raw?.rank);
  const canonicalTradition = String(raw?.canonicalTradition || "").trim();
  const form = String(raw?.form || "").trim();
  const subForm = String(raw?.subForm || "").trim();
  const externalReadableSources = Array.isArray(raw?.externalReadableSources)
    ? raw.externalReadableSources
        .map((entry: unknown) => toExternalReadableSource(entry))
        .filter(
          (
            entry: ExternalReadableSourceDTO | null
          ): entry is ExternalReadableSourceDTO =>
            Boolean(entry)
        )
    : [];

  return {
    id: String(raw?.id || editionId),
    editionId,
    bookId,
    workId: workIdRaw || null,
    externalId,
    source,
    resultType,
    workType,
    editionPresence,
    ebookClass,
    sourceClass,
    languageTruth,
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
    available,
    acquired,
    readAccess,
    readProvider,
    hasEbook,
    downloadable,
    isEbookAvailable: ebookAvailable,
    confidence: Number.isFinite(confidenceRaw) ? confidenceRaw : 0,
    rank: Number.isFinite(rankRaw) ? rankRaw : 999,
    ...(canonicalTradition ? { canonicalTradition } : {}),
    ...(form ? { form } : {}),
    ...(subForm ? { subForm } : {}),
    ...(externalReadableSources.length > 0 ? { externalReadableSources } : {}),
    rawBook:
      raw?.rawBook && typeof raw.rawBook === "object"
        ? (raw.rawBook as Record<string, unknown>)
        : undefined,
  };
}

function toExternalReadableSource(
  raw: unknown
): ExternalReadableSourceDTO | null {
  const record =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
  if (!record) return null;

  const providerRaw = String(record.provider || "").trim();
  const provider =
    providerRaw === "openLibrary" ||
    providerRaw === "gutenberg" ||
    providerRaw === "hindawi" ||
    providerRaw === "gallica"
      ? providerRaw
      : null;
  const providerExternalId = String(record.providerExternalId || "").trim();
  const trust = record.trust === "trusted" ? "trusted" : null;

  if (!provider || !providerExternalId || !trust) {
    return null;
  }

  const lendingEditionId = String(record.lendingEditionId || "").trim();
  const lendingIdentifier = String(record.lendingIdentifier || "").trim();

  return {
    provider,
    providerExternalId,
    ...(lendingEditionId ? { lendingEditionId } : {}),
    ...(lendingIdentifier ? { lendingIdentifier } : {}),
    trust,
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
  let searchQuotaUid: string | null = null;

  try {
    let resolvedAppId = "unknown";
    if (shouldEnforceSearchAppCheck()) {
      const appCheck = await resolveAppCheck(req);
      if (!appCheck.ok) {
        logger.warn("BOOK_SEARCH_V2_API", {
          phase: "rejected",
          reason: appCheck.code,
        });
        return res.status(appCheck.status).json({
          error: "APP_CHECK_REQUIRED",
          message: "App Check validation is required.",
        });
      }
      resolvedAppId = appCheck.appId;
    }

    if (shouldEnforceSearchRateLimit()) {
      searchQuotaUid = await resolveOptionalAuthenticatedUid(req);
      await enforceSearchRequestQuota({
        db: admin.firestore(),
        actorKey: buildSearchQuotaActorKey({
          appId: resolvedAppId,
          uid: searchQuotaUid,
          clientIp: resolveClientIp(req),
        }),
      });
    }

    const q = req.query.q as string | undefined;
    const ebookOnly = req.query.ebookOnly === "true";
    const availabilityOnly = req.query.availabilityOnly === "true";
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
      availabilityOnly,
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
      availabilityOnly,
      language: lang,
      cursor,
      limit,
    });
    const parsedResults = searchResponse.results
      .map((row: any) => toSearchResultDTO(row))
      .filter((row: SearchResultDTO | null): row is SearchResultDTO => row !== null);
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
    const sanitizedResults = results.map((row: any) => ({
      ...row,
      confidence:
        typeof row.confidence === "number"
          ? Math.max(0, Math.min(1, row.confidence))
          : row.confidence,
    }));

    const latencyMs = Date.now() - startTime;
    const normalizedQuery = normalizeSearchText(q);
    const telemetry = searchResponse.telemetry;
    const intentType =
      parseIntentValue(telemetry?.intentType) ||
      classifyIntentForTelemetry(normalizedQuery);
    const topCoverageScores = Array.isArray(telemetry?.topCoverageScores)
      ? telemetry.topCoverageScores
          .filter((score) => typeof score === "number" && Number.isFinite(score))
          .map((score) => Math.max(0, Math.min(1, score)))
          .slice(0, 3)
      : [];

    runAfterResponse(res, async () => {
      await writeSearchQueryTelemetry({
        normalizedQuery,
        intentType,
        canonicalResultCount: searchResponse.canonicalCount,
        externalResultCount: searchResponse.externalCount,
        totalReturned: sanitizedResults.length,
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
            ? Math.max(0, Math.min(1, telemetry.topCoverageScore))
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
      results: sanitizedResults,
      nextCursor: searchResponse.nextCursor,
      hasMore: searchResponse.hasMore,
      cursorUsed: searchResponse.cursorUsed,
    });
  } catch (error) {
    logger.error("[BOOK_SEARCH][FAILED_FULL]", {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
      uid: searchQuotaUid,
    });

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "INVALID_REQUEST",
        message: "Search request validation failed.",
      });
    }

    if (error instanceof Error && "code" in error && (error as { code?: unknown }).code === "resource-exhausted") {
      const details =
        (error as { details?: { retryAfterSeconds?: unknown } }).details || undefined;
      const retryAfterSeconds =
        typeof details?.retryAfterSeconds === "number" && Number.isFinite(details.retryAfterSeconds)
          ? Math.max(1, Math.trunc(details.retryAfterSeconds))
          : 60;
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        error: "BOOK_SEARCH_RATE_LIMIT_EXCEEDED",
        message: "Search rate limit exceeded. Please retry shortly.",
        retryAfterSeconds,
      });
    }

    return res.status(500).json({
      error: "SEARCH_INTERNAL_ERROR",
      message: "Search request failed.",
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
 * POST /api/ai/librarian
 * Tier-1 Librarian endpoint: structured, deterministic, server-owned recommendations.
 */
apiRouter.post("/ai/librarian", async (req: any, res: any) => {
  const auth = await resolveAuthenticatedUid(req);
  if (!auth.ok) {
    return res.status(auth.status).json({
      error: "AUTH_REQUIRED",
      message: "Authentication is required.",
    });
  }

  const appCheck = await resolveAppCheck(req);
  if (!appCheck.ok) {
    return res.status(appCheck.status).json({
      error: "APP_CHECK_REQUIRED",
      message: "App Check validation is required.",
    });
  }

  const consentGranted = await ensureAiConsent(auth.uid);
  if (!consentGranted) {
    return res.status(403).json({
      error: "CONSENT_REQUIRED",
      message: "AI consent is required before invoking Librarian.",
    });
  }

  const payloadRaw = req?.body && typeof req.body === "object" ? req.body : {};
  const parsed = librarianRequestSchema.safeParse(payloadRaw);
  if (!parsed.success) {
    return res.status(400).json({
      error: "INVALID_REQUEST",
      message: "Invalid request body.",
    });
  }

  const normalizedQuery = normalizeLibrarianQuery(parsed.data.normalizedQuery);
  if (!normalizedQuery || normalizedQuery.length > 280) {
    return res.status(400).json({
      error: "INVALID_REQUEST",
      message: "normalizedQuery must be 1-280 chars after normalization.",
    });
  }
  const intent = parsed.data.intent ?? "Reinforcement";

  let context = null;
  try {
    context = await getOrCreateAgentContextSnapshot(auth.uid);
  } catch (error) {
    logger.error("[AI][LIBRARIAN][CONTEXT_LOAD_FAILED]", {
      uid: auth.uid,
      error: String(error),
    });
    context = null;
  }

  if (!context) {
    return res.status(500).json({
      error: "ENGINE_FAILURE",
      message: "Agent context bootstrap failed.",
    });
  }

  try {
    const result = await runLibrarianRecommendation({
      uid: auth.uid,
      request: {
        normalizedQuery,
        intent,
      },
      context,
    });

    logger.info("[AI][LIBRARIAN][SUCCESS]", {
      uid: auth.uid,
      appId: appCheck.appId,
      profileVersion: context.profileVersion,
      schemaVersion: context.schemaVersion,
      fromCache: result.fromCache,
      recommendationCount: result.recommendations.length,
      remainingQuota: result.remainingQuota,
      normalizedQuery: result.normalizedQuery,
    });

    return res.status(200).json(result);
  } catch (error) {
    const message = String(error);
    if (message.includes("QUOTA_EXCEEDED")) {
      return res.status(429).json({
        error: "QUOTA_EXCEEDED",
        message: "Daily Librarian quota exceeded.",
      });
    }
    if (message.includes("INVALID_REQUEST")) {
      return res.status(400).json({
        error: "INVALID_REQUEST",
        message,
      });
    }
    logger.error("[AI][LIBRARIAN][FAILED]", {
      uid: auth.uid,
      appId: appCheck.appId,
      error: message,
    });
    return res.status(500).json({
      error: "ENGINE_FAILURE",
      message: "Librarian engine failed.",
    });
  }
});

/**
 * POST /api/ai/chat
 * Explicitly unavailable until this route has a production AI implementation.
 */
apiRouter.post("/ai/chat", async (req: any, res: any) => {
  const auth = await resolveAuthenticatedUid(req);
  if (!auth.ok) {
    return res.status(auth.status).json({
      error: auth.code,
      message: "Authentication is required.",
    });
  }

  logger.warn("[AI][CHAT][UNAVAILABLE]", {
    uid: auth.uid,
  });

  return res.status(503).json({
    error: "AI_CHAT_UNAVAILABLE",
    message: "AI chat is not available on this route.",
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
    maxInstances: 20,
    concurrency: 20,
    timeoutSeconds: 60,
  },
  app
);
