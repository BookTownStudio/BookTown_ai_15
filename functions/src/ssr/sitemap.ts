import { onRequest } from "firebase-functions/v2/https";
import type { Request } from "express";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";

type SitemapCollectionConfig = {
  collection: "books" | "authors" | "posts";
  pathPrefix: "/book" | "/author" | "/post";
  requirePublicVisibility: boolean;
};

type SitemapEntry = {
  loc: string;
  lastmod: string | null;
  sortEpochMs: number;
};

const db = admin.firestore();
const MAX_COLLECTION_BATCH = 500;

const COLLECTION_CONFIGS: SitemapCollectionConfig[] = [
  {
    collection: "books",
    pathPrefix: "/book",
    requirePublicVisibility: false,
  },
  {
    collection: "authors",
    pathPrefix: "/author",
    requirePublicVisibility: false,
  },
  {
    collection: "posts",
    pathPrefix: "/post",
    requirePublicVisibility: true,
  },
];

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");

const toIsoString = (value: unknown): string | null => {
  if (!value) return null;

  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
    return null;
  }

  if (typeof value === "object") {
    const maybeTimestamp = value as { toDate?: () => Date };
    if (typeof maybeTimestamp.toDate === "function") {
      const date = maybeTimestamp.toDate();
      if (date instanceof Date && !Number.isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
  }

  return null;
};

const toEpochMs = (iso: string | null): number => {
  if (!iso) return 0;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : 0;
};

const resolvePreferredLastmod = (data: Record<string, unknown>): string | null => {
  const timestamps =
    data.timestamps && typeof data.timestamps === "object"
      ? (data.timestamps as Record<string, unknown>)
      : undefined;

  return (
    toIsoString(data.updatedAt) ||
    toIsoString(timestamps?.updatedAt) ||
    toIsoString(data.createdAt) ||
    toIsoString(timestamps?.createdAt) ||
    null
  );
};

const isNotDeleted = (data: Record<string, unknown>): boolean => data.isDeleted !== true;

const isPublicPost = (data: Record<string, unknown>): boolean => {
  const rawVisibility = data.visibility;
  if (typeof rawVisibility === "string") {
    return rawVisibility.trim().toLowerCase() === "public";
  }

  if (rawVisibility && typeof rawVisibility === "object") {
    const scope = (rawVisibility as Record<string, unknown>).scope;
    if (typeof scope === "string") {
      return scope.trim().toLowerCase() === "public";
    }
  }

  return false;
};

const resolveOrigin = (req: Request): string => {
  const forwardedProtoRaw = String(req.get("x-forwarded-proto") || "").trim();
  const forwardedHostRaw = String(req.get("x-forwarded-host") || "").trim();
  const protocol =
    (forwardedProtoRaw.split(",")[0] || "").trim() ||
    String(req.protocol || "").trim() ||
    "https";
  const host =
    (forwardedHostRaw.split(",")[0] || "").trim() ||
    String(req.get("host") || "").trim() ||
    "localhost";
  return `${protocol}://${host}`;
};

const buildAbsoluteUrl = (origin: string, path: string): string => {
  try {
    return new URL(path, origin).toString();
  } catch {
    return `${origin}${path}`;
  }
};

const fetchCollectionDocs = async (
  config: SitemapCollectionConfig
): Promise<FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]> => {
  const ref = db.collection(config.collection);

  // Primary path: apply required filters directly.
  try {
    let query: FirebaseFirestore.Query = ref.where("isDeleted", "!=", true);
    if (config.requirePublicVisibility) {
      query = query.where("visibility", "==", "public");
    }
    const snap = await query.limit(MAX_COLLECTION_BATCH).get();
    return snap.docs;
  } catch (error) {
    logger.warn("[SITEMAP][PRIMARY_QUERY_FAILED] Falling back to safe filtered query", {
      collection: config.collection,
      error: String(error),
    });

    // Fallback path retains visibility filter for posts and enforces all filters in memory.
    let fallbackQuery: FirebaseFirestore.Query = ref;
    if (config.requirePublicVisibility) {
      fallbackQuery = fallbackQuery.where("visibility", "==", "public");
    }

    const fallbackSnap = await fallbackQuery.limit(MAX_COLLECTION_BATCH).get();
    return fallbackSnap.docs;
  }
};

const toSitemapEntries = (
  docs: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[],
  config: SitemapCollectionConfig,
  origin: string
): SitemapEntry[] => {
  const filtered = docs
    .map((docSnap) => ({
      id: docSnap.id,
      data: (docSnap.data() ?? {}) as Record<string, unknown>,
    }))
    .filter((entry) => isNotDeleted(entry.data))
    .filter((entry) => (config.requirePublicVisibility ? isPublicPost(entry.data) : true));

  const entries = filtered.map((entry) => {
    const lastmod = resolvePreferredLastmod(entry.data);
    const encodedId = encodeURIComponent(entry.id);
    const loc = buildAbsoluteUrl(origin, `${config.pathPrefix}/${encodedId}`);

    return {
      loc,
      lastmod,
      sortEpochMs: toEpochMs(lastmod),
    } satisfies SitemapEntry;
  });

  entries.sort((a, b) => {
    if (b.sortEpochMs !== a.sortEpochMs) {
      return b.sortEpochMs - a.sortEpochMs;
    }
    return a.loc.localeCompare(b.loc);
  });

  return entries.slice(0, MAX_COLLECTION_BATCH);
};

const buildSitemapXml = (entries: SitemapEntry[]): string => {
  const xmlItems = entries
    .map((entry) => {
      const loc = `    <loc>${escapeXml(entry.loc)}</loc>`;
      const lastmod = entry.lastmod
        ? `    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`
        : "";
      return ["  <url>", loc, lastmod, "  </url>"]
        .filter((line) => line.length > 0)
        .join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    xmlItems,
    "</urlset>",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
};

/**
 * /sitemap.xml
 * Public discovery sitemap for authority entities.
 */
export const sitemap = onRequest({ region: "us-central1" }, async (req, res) => {
  if (req.method !== "GET") {
    res.status(405);
    res.set("Allow", "GET");
    res.set("Content-Type", "application/xml; charset=utf-8");
    res.send('<?xml version="1.0" encoding="UTF-8"?><error>Method Not Allowed</error>');
    return;
  }

  const origin = resolveOrigin(req);

  const collectionEntries = await Promise.all(
    COLLECTION_CONFIGS.map(async (config) => {
      const docs = await fetchCollectionDocs(config);
      return toSitemapEntries(docs, config, origin);
    })
  );

  const entries = collectionEntries.flat();
  const xml = buildSitemapXml(entries);

  res.status(200);
  res.set("Content-Type", "application/xml; charset=utf-8");
  res.set("Cache-Control", "public, max-age=0, s-maxage=300");
  res.send(xml);
});
