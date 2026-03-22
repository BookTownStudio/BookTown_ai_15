import { onRequest } from "firebase-functions/v2/https";
import type { Request } from "express";

type SitemapIndexEntry = {
  loc: string;
  lastmod: string | null;
};

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

const buildSitemapIndexXml = (entries: SitemapIndexEntry[]): string => {
  const xmlItems = entries
    .map((entry) => {
      const loc = `    <loc>${escapeXml(entry.loc)}</loc>`;
      const lastmod = entry.lastmod
        ? `    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`
        : "";

      return ["  <sitemap>", loc, lastmod, "  </sitemap>"]
        .filter((line) => line.length > 0)
        .join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    xmlItems,
    "</sitemapindex>",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
};

/**
 * /sitemap.xml
 * Root sitemap index. Child sitemaps are added here as separate entries.
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
  const entries: SitemapIndexEntry[] = [
    {
      loc: buildAbsoluteUrl(origin, "/sitemap-publications.xml"),
      lastmod: null,
    },
  ];
  const xml = buildSitemapIndexXml(entries);

  res.status(200);
  res.set("Content-Type", "application/xml; charset=utf-8");
  res.set("Cache-Control", "public, max-age=0, s-maxage=300");
  res.send(xml);
});
