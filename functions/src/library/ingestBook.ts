import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { Buffer } from "buffer";

import { admin } from "../firebaseAdmin";
import { getOrBuildReaderManifest } from "../reader/readerManifestService";
import {
  assertProviderCanEnterCanonicalBookWritePath,
  canProviderEnrichExistingCanonicalBook,
  isDirectAuthorityProvider,
} from "./providerRoleRegistry";
import {
  materializeBookAuthority,
  type BookAuthorityState,
} from "./materializeBookAuthority";
import {
  buildAlternateProviderCoverCandidates,
  normalizeCanonicalIngestPayload,
} from "./normalization/canonicalIngest";
import { fetchOpenLibraryCanonicalMetadata } from "./providers/openLibrary";

export type SupportedSource = "googleBooks" | "openLibrary";
type IngestSource = SupportedSource | "worldcat";

type IdentityType = "isbn13" | "isbn10" | "canonical" | "provider";

type IngestionRequest = {
  providerExternalId?: string;
  bookId?: string;
  source?: IngestSource;
  rawBook?: Record<string, unknown>;
};

type SeedFallbackMaterializationResult = {
  canonicalBookId: string;
  bookId: string;
  primaryEditionId: string | null;
  editionId: string | null;
  status: string;
};

import { normalizeSearchText, normalizeIsbn } from "./normalization/bookSearchNormalization";

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
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((entry) => entry.length > 0)));
}

function tokenizeSearch(value?: string | null): string[] {
  const normalized = normalizeSearchText(value);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .filter((token) => token.length > 1 && !SEARCH_STOPWORDS.has(token));
}

function extractExternalId(
  providerExternalId: string,
  source: IngestSource,
  rawBook: Record<string, unknown>
): string {
  const providerIdFromPayload =
    asNonEmptyString(rawBook.externalId) ||
    asNonEmptyString(rawBook.providerId) ||
    asNonEmptyString(rawBook.id) ||
    asNonEmptyString(rawBook.key);

  const fallback = providerIdFromPayload || providerExternalId;

  if (source === "googleBooks") {
    return fallback.replace(/^gb_/i, "").trim();
  }

  if (source === "worldcat") {
    return fallback.replace(/^(oclc|worldcat)[:\s-]*/i, "").trim();
  }

  return fallback
    .replace(/^ol_/i, "")
    .replace(/^\/works\//i, "")
    .replace(/^\/books\//i, "")
    .trim();
}

function extractTitle(rawBook: Record<string, unknown>): string {
  return (
    asNonEmptyString(rawBook.titleEn) ||
    asNonEmptyString(rawBook.title) ||
    "Untitled"
  );
}

function extractAuthors(rawBook: Record<string, unknown>): string[] {
  const authorFromArray =
    asStringArray(rawBook.authors).length > 0
      ? asStringArray(rawBook.authors)
      : asStringArray(rawBook.author_name);

  if (authorFromArray.length > 0) {
    return authorFromArray;
  }

  const single =
    asNonEmptyString(rawBook.authorEn) ||
    asNonEmptyString(rawBook.author) ||
    "Unknown";

  return [single];
}

function extractLanguage(rawBook: Record<string, unknown>): string {
  const direct = asNonEmptyString(rawBook.language);
  if (direct) return direct.toLowerCase();

  const langArray = asStringArray(rawBook.languages || rawBook.language_code);
  if (langArray.length > 0) {
    return langArray[0].toLowerCase();
  }

  return "en";
}

function sanitizeProviderAuthorityPayload(
  rawBook: Record<string, unknown>
): Record<string, unknown> {
  const sanitized = { ...rawBook };
  delete sanitized.authorId;
  delete sanitized.authorCanonicalKey;
  delete sanitized.canonicalAuthorIds;
  delete sanitized.authorNamesNormalized;
  return sanitized;
}

function readSeedAuthorLock(rawBook: Record<string, unknown>): {
  author: string;
  authorEn: string;
  authors: string[];
  authorCanonicalKey: string;
} | null {
  const record = asRecord(rawBook.seedAuthorLock);
  if (!record) {
    return null;
  }

  const author = asNonEmptyString(record.author) || asNonEmptyString(rawBook.authorEn) || asNonEmptyString(rawBook.author);
  const authorEn = asNonEmptyString(record.authorEn) || author;
  const authors = uniqueStrings([
    ...asStringArray(record.authors),
    ...[author, authorEn].filter((value): value is string => typeof value === "string" && value.length > 0),
  ]);
  const authorCanonicalKey =
    asNonEmptyString(record.authorCanonicalKey) || asNonEmptyString(rawBook.authorCanonicalKey);

  if (!author || !authorEn || authors.length === 0 || !authorCanonicalKey) {
    return null;
  }

  return {
    author,
    authorEn,
    authors,
    authorCanonicalKey,
  };
}

function buildSeedFallbackAuthorityRawBook(
  rawBook: Record<string, unknown>
): Record<string, unknown> {
  const title = extractTitle(rawBook);
  const titleEn = asNonEmptyString(rawBook.titleEn) || title;
  const titleAr = asNonEmptyString(rawBook.titleAr);
  const seedAuthorLock = readSeedAuthorLock(rawBook);
  const fallbackAuthor =
    seedAuthorLock?.author ||
    asNonEmptyString(rawBook.authorEn) ||
    asNonEmptyString(rawBook.author) ||
    extractAuthors(rawBook)[0] ||
    "Unknown";
  const fallbackAuthorEn = seedAuthorLock?.authorEn || fallbackAuthor;
  const fallbackAuthors =
    seedAuthorLock?.authors.length
      ? seedAuthorLock.authors
      : uniqueStrings([
          ...extractAuthors(rawBook),
          fallbackAuthor,
          fallbackAuthorEn,
        ]);
  const fallbackAuthorCanonicalKey =
    seedAuthorLock?.authorCanonicalKey || asNonEmptyString(rawBook.authorCanonicalKey);

  return {
    ...rawBook,
    title,
    titleEn,
    ...(titleAr ? { titleAr } : {}),
    author: fallbackAuthor,
    authorEn: fallbackAuthorEn,
    authors: fallbackAuthors.length > 0 ? fallbackAuthors : [fallbackAuthor],
    ...(fallbackAuthorCanonicalKey ? { authorCanonicalKey: fallbackAuthorCanonicalKey } : {}),
    ...(fallbackAuthorCanonicalKey
      ? {
          seedAuthorLock: {
            author: fallbackAuthor,
            authorEn: fallbackAuthorEn,
            authors: fallbackAuthors.length > 0 ? fallbackAuthors : [fallbackAuthor],
            authorCanonicalKey: fallbackAuthorCanonicalKey,
            source: "canonical_seed",
          },
        }
      : {}),
    language: extractLanguage(rawBook),
    canonicalLocked: true,
    authorityStatus: "canonical",
    workType: "canonical",
    rightsMode: asNonEmptyString(rawBook.rightsMode) || "public_free",
    visibility: asNonEmptyString(rawBook.visibility) || "public",
    publicationState: asNonEmptyString(rawBook.publicationState) || "published",
  };
}

export async function materializeSeedOnlyCanonicalFallback(params: {
  preferredBookId?: string;
  rawBook: Record<string, unknown>;
  ingestionKey?: string | null;
}): Promise<SeedFallbackMaterializationResult> {
  const authorityRawBook = buildSeedFallbackAuthorityRawBook(params.rawBook);
  const transactionResult = await materializeBookAuthority({
    source: "canonical_seed",
    authorityStatus: "canonical",
    preferredBookId: params.preferredBookId,
    rawBook: authorityRawBook,
    createEdition: false,
    ingestionKey: asNonEmptyString(params.ingestionKey) || undefined,
    literaryAuthorityClass: asNonEmptyString(authorityRawBook.literaryAuthorityClass),
  });

  return {
    canonicalBookId: transactionResult.canonicalBookId,
    bookId: transactionResult.bookId,
    primaryEditionId: transactionResult.primaryEditionId,
    editionId: transactionResult.editionId,
    status: transactionResult.status,
  };
}

export async function fetchGoogleBooksCanonicalMetadata(
  providerExternalId: string
): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  const url = new URL(
    `https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(providerExternalId)}`
  );
  if (apiKey) {
    url.searchParams.set("key", apiKey);
  }

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "BookTownBot/2.0",
      Accept: "application/json,text/plain,*/*",
    },
  });

  if (!response.ok) {
    logger.warn("[INGEST_V2][GOOGLE_METADATA_UNAVAILABLE]", {
      providerExternalId,
      status: response.status,
    });
    return null;
  }

  const payload = asRecord(await response.json());
  const volumeInfo = asRecord(payload?.volumeInfo);
  if (!payload || !volumeInfo) {
    return null;
  }

  return {
    ...volumeInfo,
    id: providerExternalId,
    externalId: providerExternalId,
    source: "googleBooks",
  };
}

async function hydrateRawBookFromProvider(
  source: IngestSource,
  providerExternalId: string
): Promise<Record<string, unknown> | null> {
  if (source === "openLibrary") {
    return fetchOpenLibraryCanonicalMetadata(providerExternalId);
  }

  if (source === "worldcat") {
    return null;
  }

  return fetchGoogleBooksCanonicalMetadata(providerExternalId);
}

function extractIsbns(rawBook: Record<string, unknown>): {
  isbn13: string;
  isbn10: string;
} {
  const directIsbn13 = normalizeIsbn(rawBook.isbn13, 13);
  const directIsbn10 = normalizeIsbn(rawBook.isbn10, 10);

  if (directIsbn13 || directIsbn10) {
    return {
      isbn13: directIsbn13,
      isbn10: directIsbn10,
    };
  }

  const fromIndustryIds = Array.isArray(rawBook.industryIdentifiers)
    ? rawBook.industryIdentifiers
    : [];

  let isbn13 = "";
  let isbn10 = "";

  for (const entry of fromIndustryIds) {
    const record = asRecord(entry);
    if (!record) continue;

    const type = asNonEmptyString(record.type)?.toUpperCase();
    const identifier = asNonEmptyString(record.identifier);
    if (!type || !identifier) continue;

    if (type.includes("ISBN_13")) {
      isbn13 = normalizeIsbn(identifier, 13) || isbn13;
    }

    if (type.includes("ISBN_10")) {
      isbn10 = normalizeIsbn(identifier, 10) || isbn10;
    }
  }

  if (isbn13 || isbn10) {
    return { isbn13, isbn10 };
  }

  const isbn13Array = asStringArray(rawBook.isbn_13);
  const isbn10Array = asStringArray(rawBook.isbn_10);
  for (const candidate of [...isbn13Array, ...isbn10Array]) {
    if (!isbn13) isbn13 = normalizeIsbn(candidate, 13);
    if (!isbn10) isbn10 = normalizeIsbn(candidate, 10);
    if (isbn13 && isbn10) break;
  }

  if (isbn13 || isbn10) {
    return { isbn13, isbn10 };
  }

  const isbnCandidates = asStringArray(rawBook.isbn);
  for (const candidate of isbnCandidates) {
    if (!isbn13) isbn13 = normalizeIsbn(candidate, 13);
    if (!isbn10) isbn10 = normalizeIsbn(candidate, 10);
    if (isbn13 && isbn10) break;
  }

  return { isbn13, isbn10 };
}

export function hasMinimumCanonicalIdentity(
  rawBook: Record<string, unknown>
): boolean {
  const title =
    asNonEmptyString(rawBook.titleEn) ||
    asNonEmptyString(rawBook.title);
  const authorFromArray =
    asStringArray(rawBook.authors).length > 0
      ? asStringArray(rawBook.authors)
      : asStringArray(rawBook.author_name);
  const author =
    authorFromArray[0] ||
    asNonEmptyString(rawBook.authorEn) ||
    asNonEmptyString(rawBook.author);
  const { isbn13, isbn10 } = extractIsbns(rawBook);

  return Boolean(title && (author || isbn13 || isbn10));
}

function normalizeSource(input: unknown): IngestSource | null {
  const raw = String(input || "").trim();
  if (["googleBooks", "google_books", "googlebooks"].includes(raw)) {
    return "googleBooks";
  }
  if (["openLibrary", "open_library", "openlibrary"].includes(raw)) {
    return "openLibrary";
  }
  if (["worldcat", "WorldCat", "world_cat"].includes(raw)) {
    return "worldcat";
  }
  if (isDirectAuthorityProvider(raw)) {
    return raw as IngestSource;
  }
  return null;
}

function toCoverCandidates(
  source: IngestSource,
  rawBook: Record<string, unknown>,
  externalId: string
): string[] {
  const alternateCandidates = buildAlternateProviderCoverCandidates({
    source,
    rawBook,
  });

  if (source === "googleBooks") {
    return Array.from(
      new Set([...upgradeGoogleCoverCandidates(rawBook), ...alternateCandidates])
    );
  }
  if (source === "worldcat") {
    return alternateCandidates;
  }
  return Array.from(
    new Set([...upgradeOpenLibraryCandidates(rawBook, externalId), ...alternateCandidates])
  );
}

function buildIdentityCandidates(params: {
  isbn13: string;
  isbn10: string;
  canonicalKey: string;
  source: SupportedSource;
  externalId: string;
}): Array<{
  key: string;
  type: IdentityType;
  value: string;
  precedence: number;
}> {
  const entries: Array<{
    key: string;
    type: IdentityType;
    value: string;
    precedence: number;
  }> = [];

  if (params.isbn13) {
    entries.push({
      key: `isbn13:${params.isbn13}`,
      type: "isbn13",
      value: params.isbn13,
      precedence: 1,
    });
  }

  if (params.isbn10) {
    entries.push({
      key: `isbn10:${params.isbn10}`,
      type: "isbn10",
      value: params.isbn10,
      precedence: 2,
    });
  }

  entries.push({
    key: `canonical:${params.canonicalKey}`,
    type: "canonical",
    value: params.canonicalKey,
    precedence: 3,
  });

  entries.push({
    key: `provider:${params.source}:${params.externalId}`,
    type: "provider",
    value: `${params.source}:${params.externalId}`,
    precedence: 4,
  });

  return entries;
}

function resolveDescription(rawBook: Record<string, unknown>): string {
  return (
    asNonEmptyString(rawBook.descriptionEn) ||
    asNonEmptyString(rawBook.description) ||
    asNonEmptyString(rawBook.summary) ||
    ""
  );
}

function resolvePublicationYear(rawBook: Record<string, unknown>): number | null {
  const explicit = asNonEmptyString(rawBook.publicationYear);
  if (explicit && /^\d{4}$/.test(explicit)) {
    return Number(explicit);
  }

  const fromFirstPublishYear = rawBook.firstPublishYear;
  if (typeof fromFirstPublishYear === "number" && Number.isFinite(fromFirstPublishYear)) {
    return Math.trunc(fromFirstPublishYear);
  }

  const publishedDate = asNonEmptyString(rawBook.publishedDate);
  if (publishedDate && /^\d{4}/.test(publishedDate)) {
    return Number(publishedDate.slice(0, 4));
  }

  return null;
}

function computeServerVerifiedDownloadable(rawBook: Record<string, unknown>): boolean {
  const attachmentId = asNonEmptyString(rawBook.ebookAttachmentId) || "";
  const storagePath = asNonEmptyString(rawBook.ebookStoragePath) || "";
  return attachmentId.length > 0 || storagePath.length > 0;
}

export function upgradeGoogleCoverCandidates(rawBook: Record<string, unknown>): string[] {
  const imageLinks = asRecord(rawBook.imageLinks);
  const thumb =
    asNonEmptyString(imageLinks?.thumbnail) ||
    asNonEmptyString(rawBook.coverUrl) ||
    asNonEmptyString(rawBook.thumbnail) ||
    asNonEmptyString(asRecord(rawBook.coverImages)?.large) ||
    asNonEmptyString(asRecord(rawBook.coverImages)?.medium) ||
    asNonEmptyString(asRecord(rawBook.coverImages)?.small);

  if (!thumb) return [];

  const https = thumb.replace(/^http:\/\//i, "https://");

  const candidates = [
    https.replace(/zoom=\d/, "zoom=0"),
    `${https}&fife=w1600`,
    `${https}&fife=w1200`,
    `${https}&fife=w800`,
    https,
  ];

  return Array.from(new Set(candidates.filter(Boolean)));
}

export function upgradeOpenLibraryCandidates(
  rawBook: Record<string, unknown>,
  externalId: string
): string[] {
  const coverImages = asRecord(rawBook.coverImages);
  const explicitCover =
    asNonEmptyString(rawBook.coverUrl) ||
    asNonEmptyString(rawBook.thumbnail) ||
    asNonEmptyString(coverImages?.large) ||
    asNonEmptyString(coverImages?.medium) ||
    asNonEmptyString(coverImages?.small) ||
    null;

  const coverId =
    asNonEmptyString(rawBook.coverId) ||
    asNonEmptyString(rawBook.cover_i) ||
    null;

  const candidates = [
    explicitCover ? explicitCover.replace(/^http:\/\//i, "https://") : null,
    explicitCover && /-M\.(jpg|jpeg|png)$/i.test(explicitCover)
      ? explicitCover.replace(/-M(\.(jpg|jpeg|png))$/i, "-L$1")
      : null,
    coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : null,
    coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : null,
    coverId ? `https://covers.openlibrary.org/b/id/${coverId}-S.jpg` : null,
    `https://covers.openlibrary.org/b/olid/${externalId}-L.jpg`,
    `https://covers.openlibrary.org/b/olid/${externalId}-M.jpg`,
    `https://covers.openlibrary.org/b/olid/${externalId}-S.jpg`,
  ];

  return Array.from(new Set(candidates.filter(Boolean))) as string[];
}

export async function fetchFirstValid(urls: string[]): Promise<Buffer | null> {
  logger.info("[COVER_FETCH][START]", { count: urls.length });

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: {
          "User-Agent": "BookTownBot/2.0",
          Accept: "image/*,*/*",
        },
      });

      if (!res.ok) continue;

      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      if (!contentType.startsWith("image/")) continue;

      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length >= 1_000) {
        return buffer;
      }
    } catch (error) {
      logger.warn("[COVER_FETCH][CANDIDATE_FAILED]", {
        url,
        error: String(error),
      });
    }
  }

  return null;
}

export async function ingestBookServerSide(params: {
  uid: string;
  providerExternalId: string;
  source: IngestSource;
  preferredBookId?: string;
  rawBook?: Record<string, unknown>;
  trustedDescriptionAuthoritySource?: "manualAdmin";
}): Promise<{
  canonicalBookId: string;
  bookId: string;
  primaryEditionId: string | null;
  editionId: string | null;
  status: string;
}> {
  const providerExternalId = asNonEmptyString(params.providerExternalId);
  const source = params.source;
  if (
    !isDirectAuthorityProvider(source) &&
    !canProviderEnrichExistingCanonicalBook(source)
  ) {
    assertProviderCanEnterCanonicalBookWritePath(source);
  }
  const hydratedRawBook =
    asRecord(params.rawBook) ||
    (providerExternalId ? await hydrateRawBookFromProvider(source, providerExternalId) : null);
  const rawBook = asRecord(hydratedRawBook);
  if (!providerExternalId || !source || !rawBook) {
    throw new HttpsError("invalid-argument", "Missing or invalid parameters.");
  }
  const authorityRawBook = normalizeCanonicalIngestPayload({
    source,
    rawBook: sanitizeProviderAuthorityPayload(rawBook),
  });

  const externalId = extractExternalId(providerExternalId, source, authorityRawBook);
  if (!externalId) {
    throw new HttpsError("invalid-argument", "Unable to resolve provider external id.");
  }

  const coverCandidates = toCoverCandidates(source, authorityRawBook, externalId);
  const requestedAuthorityStatus: BookAuthorityState =
    authorityRawBook.canonicalLocked === true ||
    asNonEmptyString(authorityRawBook.authorityStatus) === "canonical" ||
    asNonEmptyString(authorityRawBook.workType) === "canonical"
      ? "canonical"
      : "provisional";

  logger.info("BOOK_INGEST_V2_TRACE", {
    phase: "materialize_start",
    source,
    externalId,
    coverCandidates: coverCandidates.length,
    authorityStatus: requestedAuthorityStatus,
  });

  const transactionResult = await materializeBookAuthority({
    source,
    authorityStatus: requestedAuthorityStatus,
    preferredBookId:
      !isDirectAuthorityProvider(source) && params.preferredBookId
        ? params.preferredBookId
        : undefined,
    providerExternalId: externalId,
    rawBook: authorityRawBook,
    descriptionAuthorityOverride: params.trustedDescriptionAuthoritySource,
    coverCandidates,
    createEdition: true,
    ingestionKey: `${source}:${externalId}`,
    literaryAuthorityClass: asNonEmptyString(authorityRawBook.literaryAuthorityClass),
  });

  logger.info("BOOK_INGEST_V2_TRACE", {
    phase: "complete",
    ingestionKey: `${source}:${externalId}`,
    outcome: transactionResult.status,
    bookId: transactionResult.bookId,
    editionId: transactionResult.editionId,
  });

  // Best-effort reader manifest preprocessing.
  // Ingestion must remain successful even if manifest generation cannot run.
  try {
    const bookSnap = await admin.firestore().collection("books").doc(transactionResult.bookId).get();
    const bookData = (bookSnap.data() || {}) as Record<string, unknown>;
    const hasAttachment =
      typeof bookData.ebookAttachmentId === "string" &&
      bookData.ebookAttachmentId.trim().length > 0;
    const hasStoragePath =
      typeof bookData.storagePath === "string" &&
      bookData.storagePath.trim().length > 0;

    if (hasAttachment || hasStoragePath) {
      await getOrBuildReaderManifest({
        uid: params.uid,
        bookId: transactionResult.bookId,
      });

      logger.info("[INGEST_V2][READER_MANIFEST_READY]", {
        bookId: transactionResult.bookId,
        ingestionKey: `${source}:${externalId}`,
      });
    }
  } catch (error) {
    logger.warn("[INGEST_V2][READER_MANIFEST_SKIPPED]", {
      bookId: transactionResult.bookId,
      ingestionKey: `${source}:${externalId}`,
      error: String(error),
    });
  }

  return {
    canonicalBookId: transactionResult.canonicalBookId,
    bookId: transactionResult.bookId,
    primaryEditionId: transactionResult.primaryEditionId,
    editionId: transactionResult.editionId,
    status: transactionResult.status,
  };
}

export const ingestBook = onCall<IngestionRequest>({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Auth required.");
  }

  const payload =
    request.data &&
    typeof request.data === "object" &&
    "data" in request.data
      ? (request.data as { data: IngestionRequest }).data
      : request.data;

  const providerExternalId = asNonEmptyString(payload?.providerExternalId || "");
  const incomingBookId = asNonEmptyString(payload?.bookId || "");
  const source = normalizeSource(payload?.source);
  const rawBook = asRecord(payload?.rawBook);

  if (providerExternalId && source) {
    return ingestBookServerSide({
      uid: request.auth.uid,
      providerExternalId,
      source,
      preferredBookId: incomingBookId || undefined,
      rawBook: rawBook || undefined,
    });
  }

  if (!incomingBookId) {
    throw new HttpsError("invalid-argument", "Missing or invalid parameters.");
  }

  const bookSnap = await admin.firestore().collection("books").doc(incomingBookId).get();
  if (!bookSnap.exists) {
    throw new HttpsError("not-found", "Book not found.");
  }

  const existingBook = (bookSnap.data() || {}) as Record<string, unknown>;
  const providerEntry = asStringArray(existingBook.providerExternalIds).find((entry) =>
    /^(googleBooks|openLibrary):/i.test(entry)
  );

  if (providerEntry) {
    const separatorIndex = providerEntry.indexOf(":");
    const providerSource = normalizeSource(providerEntry.slice(0, separatorIndex));
    const providerId = providerEntry.slice(separatorIndex + 1).trim();
    if (providerSource && providerId) {
      return ingestBookServerSide({
        uid: request.auth.uid,
        providerExternalId: providerId,
        source: providerSource,
        rawBook: existingBook,
      });
    }
  }

  return {
    canonicalBookId: incomingBookId,
    bookId: incomingBookId,
    primaryEditionId:
      asNonEmptyString(existingBook.primaryEditionId) ||
      asNonEmptyString(
        existingBook.canonicalRelations &&
          typeof existingBook.canonicalRelations === "object" &&
          !Array.isArray(existingBook.canonicalRelations)
          ? (existingBook.canonicalRelations as Record<string, unknown>).primaryEditionId
          : undefined
      ) ||
      asNonEmptyString(existingBook.editionId) ||
      undefined,
    editionId: asNonEmptyString(existingBook.editionId) || undefined,
    status: "ALREADY_CANONICAL",
  };
});
