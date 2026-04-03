import * as logger from "firebase-functions/logger";
import type {
  ExternalReadableCandidate,
  ProviderLookupContext,
} from "./types";

const GUTENBERG_TIMEOUT_MS = 15_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
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

function normalizeSearchText(value: unknown): string {
  const text = asNonEmptyString(value).toLowerCase();
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractProviderIds(book: Record<string, unknown>, prefix: string): string[] {
  const providerExternalIds = asStringArray(book.providerExternalIds);
  return providerExternalIds
    .filter((entry) => entry.startsWith(`${prefix}:`))
    .map((entry) => entry.slice(prefix.length + 1))
    .filter((entry) => entry.length > 0);
}

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GUTENBERG_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "BookTownBot/2.0",
        Accept: "application/json,text/plain,*/*",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn("[ACQUIRE][GUTENBERG][FETCH_FAILED]", {
        url,
        status: response.status,
      });
      return null;
    }

    return asRecord(await response.json());
  } catch (error) {
    logger.warn("[ACQUIRE][GUTENBERG][FETCH_ERROR]", {
      url,
      error: String(error),
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchBookById(id: string): Promise<Record<string, unknown> | null> {
  return fetchJson(`https://gutendex.com/books/${encodeURIComponent(id)}`);
}

async function searchBooks(query: string): Promise<Record<string, unknown>[]> {
  const payload = await fetchJson(
    `https://gutendex.com/books?search=${encodeURIComponent(query)}`
  );
  return Array.isArray(payload?.results)
    ? payload.results
        .map((entry) => asRecord(entry))
        .filter((entry): entry is Record<string, unknown> => entry !== null)
    : [];
}

function scoreCandidate(
  item: Record<string, unknown>,
  expectedTitle: string,
  expectedAuthor: string
): number {
  const normalizedTitle = normalizeSearchText(item.title);
  const authorName = Array.isArray(item.authors)
    ? asNonEmptyString(asRecord(item.authors[0])?.name)
    : "";
  const normalizedAuthor = normalizeSearchText(authorName);
  let score = 0;

  if (normalizedTitle === expectedTitle) score += 6;
  else if (normalizedTitle.includes(expectedTitle) || expectedTitle.includes(normalizedTitle)) {
    score += 3;
  }

  if (normalizedAuthor === expectedAuthor) score += 4;
  else if (
    normalizedAuthor.includes(expectedAuthor) ||
    expectedAuthor.includes(normalizedAuthor)
  ) {
    score += 2;
  }

  if (item.copyright === false) score += 2;
  return score;
}

function toCandidate(item: Record<string, unknown>): ExternalReadableCandidate | null {
  const idValue = item.id;
  const providerExternalId =
    typeof idValue === "number" && Number.isFinite(idValue)
      ? String(Math.trunc(idValue))
      : asNonEmptyString(idValue);
  if (!providerExternalId) return null;

  const formats = asRecord(item.formats);
  const epubUrl =
    asNonEmptyString(formats?.["application/epub+zip"]) ||
    asNonEmptyString(formats?.["application/epub+zip; charset=binary"]);
  if (!epubUrl) return null;

  return {
    provider: "gutenberg",
    providerExternalId,
    title: asNonEmptyString(item.title),
    language: asStringArray(item.languages)[0] || "en",
    trust: {
      availabilityTrust: true,
      acquisitionTrust: true,
    },
    candidates: [
      {
        format: "epub",
        url: epubUrl.replace(/^http:\/\//i, "https://"),
        mimeType: "application/epub+zip",
      },
    ],
  };
}

export async function resolveGutenbergReadableCandidate(
  ctx: ProviderLookupContext
): Promise<ExternalReadableCandidate | null> {
  const explicitIds = extractProviderIds(ctx.book, "gutenberg");
  for (const id of explicitIds) {
    const item = await fetchBookById(id);
    if (!item) continue;
    const candidate = toCandidate(item);
    if (candidate) return candidate;
  }

  const title = asNonEmptyString(ctx.book.titleEn) || asNonEmptyString(ctx.book.title);
  const author = asNonEmptyString(ctx.book.authorEn) || asNonEmptyString(ctx.book.author);
  if (!title) return null;

  const expectedTitle = normalizeSearchText(title);
  const expectedAuthor = normalizeSearchText(author);
  const results = await searchBooks(author ? `${title} ${author}` : title);

  const ranked = results
    .filter((entry) => entry.media_type === "Text")
    .map((entry) => ({ entry, score: scoreCandidate(entry, expectedTitle, expectedAuthor) }))
    .sort((a, b) => b.score - a.score);

  for (const item of ranked) {
    if (item.score < 4) continue;
    const candidate = toCandidate(item.entry);
    if (candidate) return candidate;
  }

  return null;
}
