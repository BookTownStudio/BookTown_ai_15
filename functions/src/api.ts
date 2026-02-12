import express from "express";
import { onRequest } from "firebase-functions/v2/https";
import { unifiedSearch } from "./library/search/searchEngine";
import crypto from "crypto";

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

    const results = await unifiedSearch(q, {
      ebookOnly,
      language: lang,
    });

    const latencyMs = Date.now() - startTime;

    // --------------------------------------------------
    // B1.7 — SEARCH OBSERVABILITY (NON-BLOCKING)
    // --------------------------------------------------
    try {
      const providerMix: Record<string, number> = {
        booktown: 0,
        googleBooks: 0,
        openLibrary: 0,
      };

      for (const r of results) {
        if (r?.source && providerMix[r.source] !== undefined) {
          providerMix[r.source]++;
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
