import * as logger from "firebase-functions/logger";
import type {
  ExternalReadableCandidate,
  ProviderLookupContext,
} from "./types";

const GALLICA_TIMEOUT_MS = 15_000;

type ParsedEntry = {
  id: string;
  title: string;
  author: string;
  summary: string;
  links: Array<{
    href: string;
    type: string;
    rel: string;
  }>;
};

function asNonEmptyString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeSearchText(value: unknown): string {
  return asNonEmptyString(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'");
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GALLICA_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "BookTownBot/2.0",
        Accept: "application/atom+xml,application/xml,text/xml,*/*",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn("[ACQUIRE][GALLICA][FETCH_FAILED]", {
        url,
        status: response.status,
      });
      return "";
    }

    return await response.text();
  } catch (error) {
    logger.warn("[ACQUIRE][GALLICA][FETCH_ERROR]", {
      url,
      error: String(error),
    });
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

function parseEntries(xml: string): ParsedEntry[] {
  const entries = Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g));
  return entries.map((match) => {
    const body = match[1] || "";
    const title = decodeXml((body.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "").trim());
    const id = decodeXml((body.match(/<id>([\s\S]*?)<\/id>/)?.[1] || "").trim());
    const author = decodeXml((body.match(/<author>\s*<name>([\s\S]*?)<\/name>/)?.[1] || "").trim());
    const summary = decodeXml((body.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1] || "").trim());
    const links = Array.from(body.matchAll(/<link\s+([^>]+?)\/>/g)).map((linkMatch) => {
      const attrs = linkMatch[1] || "";
      const href = decodeXml((attrs.match(/href="([^"]+)"/)?.[1] || "").trim());
      const type = decodeXml((attrs.match(/type="([^"]+)"/)?.[1] || "").trim());
      const rel = decodeXml((attrs.match(/rel="([^"]+)"/)?.[1] || "").trim());
      return { href, type, rel };
    });

    return {
      id,
      title,
      author,
      summary,
      links,
    };
  });
}

function matchesBook(entry: ParsedEntry, expectedTitle: string, expectedAuthor: string): boolean {
  const normalizedTitle = normalizeSearchText(entry.title);
  const normalizedAuthor = normalizeSearchText(entry.author);
  if (!normalizedTitle) return false;
  const titleMatch =
    normalizedTitle === expectedTitle ||
    normalizedTitle.includes(expectedTitle) ||
    expectedTitle.includes(normalizedTitle);
  const authorMatch =
    !expectedAuthor ||
    !normalizedAuthor ||
    normalizedAuthor === expectedAuthor ||
    normalizedAuthor.includes(expectedAuthor) ||
    expectedAuthor.includes(normalizedAuthor);

  return titleMatch && authorMatch;
}

export async function resolveGallicaReadableCandidate(
  ctx: ProviderLookupContext
): Promise<ExternalReadableCandidate | null> {
  const title = asNonEmptyString(ctx.book.titleEn) || asNonEmptyString(ctx.book.title);
  const author = asNonEmptyString(ctx.book.authorEn) || asNonEmptyString(ctx.book.author);
  if (!title) return null;

  const expectedTitle = normalizeSearchText(title);
  const expectedAuthor = normalizeSearchText(author);
  const queries = [
    `dc.title all "${title}" and dc.creator all "${author}" and dc.formatspecific all "epub"`,
    `dc.title all "${title}" and dc.formatspecific all "epub"`,
    `dc.title all "${title}" and dc.creator all "${author}" and dc.formatspecific all "pdf"`,
    `dc.title all "${title}" and dc.formatspecific all "pdf"`,
  ];

  for (const query of queries) {
    const url =
      "https://gallica.bnf.fr/services/engine/search/opds" +
      `?operation=searchRetrieve&version=1.2&exactSearch=false&maximumRecords=5&query=${encodeURIComponent(query)}`;
    const xml = await fetchText(url);
    if (!xml) continue;

    const entries = parseEntries(xml);
    for (const entry of entries) {
      if (!matchesBook(entry, expectedTitle, expectedAuthor)) continue;

      const summary = entry.summary.toLowerCase();
      const acquisitionLinks = entry.links.filter((link) =>
        link.rel.includes("opds-spec.org/acquisition")
      );
      const candidates: Array<{
        format: "epub" | "pdf";
        url: string;
        mimeType: string;
      }> = [];

      for (const link of acquisitionLinks) {
        const href = link.href.replace(/^http:\/\//i, "https://");
        if (link.type === "application/epub+zip") {
          candidates.push({
            format: "epub",
            url: href,
            mimeType: "application/epub+zip",
          });
          continue;
        }
        if (link.type === "application/pdf" && summary.includes("mode texte")) {
          candidates.push({
            format: "pdf",
            url: href,
            mimeType: "application/pdf",
          });
        }
      }

      if (candidates.length === 0) continue;

      const providerExternalId = entry.id.split("ark:/").pop() || entry.id;
      return {
        provider: "gallica",
        providerExternalId,
        title: entry.title,
        language: asNonEmptyString(ctx.book.language) || "fr",
        trust: {
          availabilityTrust: true,
          acquisitionTrust: true,
        },
        candidates,
      };
    }
  }

  return null;
}
