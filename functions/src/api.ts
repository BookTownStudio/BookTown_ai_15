import express from "express";
import { onRequest } from "firebase-functions/v2/https";
import { unifiedSearch } from "./library/search/searchEngine";
import crypto from "crypto";

type SearchBookResponse = {
  id: string;
  editionId: string;
  bookId: string;
  externalId: string;
  source: "googleBooks" | "openLibrary";
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
};

function toSearchBookResponse(raw: any): SearchBookResponse | null {
  const sourceRaw = String(raw?.source || "").trim();
  const source =
    sourceRaw === "googleBooks"
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
  const ebookAvailable = hasEbook && downloadable;

  return {
    id: String(raw?.id || editionId),
    editionId,
    bookId,
    externalId,
    source,
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
    hasEbook: ebookAvailable,
    downloadable: ebookAvailable,
    isEbookAvailable: ebookAvailable,
  };
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

    if (!q || q.trim().length < 2) {
      return res.status(200).json({ results: [] });
    }

    console.log(
      `[API][SEARCH] Query="${q}" ebookOnly=${ebookOnly} lang=${lang}`
    );

    const resultsRaw = await unifiedSearch(q, {
      ebookOnly,
      language: lang,
    });
    const results = resultsRaw
      .map((row: any) => toSearchBookResponse(row))
      .filter((row: SearchBookResponse | null): row is SearchBookResponse => row !== null);

    const latencyMs = Date.now() - startTime;

    // --------------------------------------------------
    // B1.7 — SEARCH OBSERVABILITY (NON-BLOCKING)
    // --------------------------------------------------
    try {
      const providerMix: Record<string, number> = {
        googleBooks: 0,
        openLibrary: 0,
        other: 0,
      };

      for (const r of results) {
        if (r?.source && providerMix[r.source] !== undefined) {
          providerMix[r.source]++;
        } else {
          providerMix.other++;
        }
      }

      const orderingHash = crypto
        .createHash("sha256")
        .update(
          results
            .map((r: any) => r.id || r.editionId || "")
            .join("|")
        )
        .digest("hex");

      const observabilityEvent = {
        event: "SEARCH_QUERY_EXECUTED_V1",
        normalizedQuery: q.trim().toLowerCase(),
        queryHash: crypto
          .createHash("sha256")
          .update(`${q}|${ebookOnly}|${lang}`)
          .digest("hex"),
        filters: {
          ebookOnly,
          language: lang,
        },
        resultCount: results.length,
        latencyMs,
        providerMix,
        orderingHash,
        page: 1,
        cursorUsed: false,
        partial: false,
        timestamp: new Date().toISOString(),
      };

      console.info("[SEARCH_OBSERVABILITY]", observabilityEvent);
    } catch (obsErr) {
      console.warn("[SEARCH_OBSERVABILITY_FAILED]", obsErr);
    }

    return res.status(200).json({ results });
  } catch (error) {
    console.error("[API][SEARCH_BOOKS_ERROR]", error);
    return res.status(200).json({ results: [] });
  }
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
