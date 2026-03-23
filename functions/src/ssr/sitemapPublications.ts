import { onRequest } from "firebase-functions/v2/https";
import type { Request } from "express";
import { admin } from "../firebaseAdmin";

type PublicationSitemapEntry = {
  loc: string;
  lastmod: string | null;
  sortEpochMs: number;
};

const db = admin.firestore();
const MAX_PUBLICATION_SITEMAP_ITEMS = 1000;

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");

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

const toIsoString = (value: unknown): string | null => {
  if (!value) return null;

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
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

const asNonEmptyString = (value: unknown, max = 512): string => {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
};

const slugifyPublicationTitle = (title: string): string =>
  title
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{Script=Arabic}a-z0-9\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);

const buildPublicationSlugPath = (
  title: string,
  publicationId: string,
  canonicalSlug?: string
): string => {
  const normalizedId = publicationId.trim();
  if (!normalizedId) {
    return "/blog";
  }

  const lockedSlug = asNonEmptyString(canonicalSlug, 120);
  const slug = lockedSlug || slugifyPublicationTitle(title) || `publication-${normalizedId}`;
  return `/blog/${slug}-${normalizedId}`;
};

const isPublicPublishedLongform = (data: Record<string, unknown>): boolean => {
  const visibility = asNonEmptyString(data.visibility, 32).toLowerCase();
  const status = asNonEmptyString(data.status, 32).toLowerCase();
  const publicationType = asNonEmptyString(data.publicationType, 64).toLowerCase();

  return (
    visibility === "public" &&
    status === "published" &&
    publicationType === "blog_longform" &&
    data.isDeleted !== true &&
    !data.deletedAt
  );
};

const resolveLastmod = (data: Record<string, unknown>): string | null =>
  toIsoString(data.lastPublishedAt) ||
  toIsoString(data.updatedAt) ||
  toIsoString(data.createdAt) ||
  null;

const buildSitemapXml = (entries: PublicationSitemapEntry[]): string => {
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

export const sitemapPublications = onRequest(
  { region: "us-central1" },
  async (req, res) => {
    if (req.method !== "GET") {
      res.status(405);
      res.set("Allow", "GET");
      res.set("Content-Type", "application/xml; charset=utf-8");
      res.send('<?xml version="1.0" encoding="UTF-8"?><error>Method Not Allowed</error>');
      return;
    }

    const origin = resolveOrigin(req);
    const snap = await db
      .collection("longform_publications")
      .where("visibility", "==", "public")
      .limit(MAX_PUBLICATION_SITEMAP_ITEMS)
      .get();

    const entries = snap.docs
      .map((docSnap) => {
        const data = (docSnap.data() ?? {}) as Record<string, unknown>;
        if (!isPublicPublishedLongform(data)) {
          return null;
        }

        const publicationId = asNonEmptyString(data.publicationId, 256) || docSnap.id;
        const title = asNonEmptyString(data.title, 180) || "BookTown Publication";
        const canonicalSlug = asNonEmptyString(data.canonicalSlug, 120);
        const path = buildPublicationSlugPath(title, publicationId, canonicalSlug);
        const lastmod = resolveLastmod(data);

        return {
          loc: buildAbsoluteUrl(origin, path),
          lastmod,
          sortEpochMs: toEpochMs(lastmod),
        } satisfies PublicationSitemapEntry;
      })
      .filter((entry): entry is PublicationSitemapEntry => entry !== null)
      .sort((a, b) => {
        if (b.sortEpochMs !== a.sortEpochMs) {
          return b.sortEpochMs - a.sortEpochMs;
        }
        return a.loc.localeCompare(b.loc);
      });

    const xml = buildSitemapXml(entries);

    res.status(200);
    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=0, s-maxage=300");
    res.send(xml);
  }
);
