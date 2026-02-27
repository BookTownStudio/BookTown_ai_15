import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { v4 as uuidv4 } from "uuid";
import { Buffer } from "buffer";

import { buildCanonicalKey } from "./persistence/canonicalKey";

type SupportedSource = "googleBooks" | "openLibrary";

type IngestionRequest = {
  providerExternalId?: string;
  bookId?: string;
  source: SupportedSource;
  rawBook: Record<string, unknown>;
};

type IdentityType =
  | "isbn13"
  | "isbn10"
  | "canonical"
  | "provider";

type IdentityRecord = {
  identityKey: string;
  identityType: IdentityType;
  value: string;
  precedence: number;
  bookId: string;
  createdAt?: FirebaseFirestore.FieldValue;
  updatedAt: FirebaseFirestore.FieldValue;
};

type CoverJobStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";

const db = admin.firestore();

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

function tokenizeSearch(value?: string | null): string[] {
  const normalized = normalizeSearchText(value);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .filter((token) => token.length > 1 && !SEARCH_STOPWORDS.has(token));
}

function normalizeIsbn(value: unknown, length: 10 | 13): string {
  if (typeof value !== "string") return "";
  const digits = value.replace(/[^0-9Xx]/g, "").toUpperCase();
  if (length === 10) {
    return /^\d{9}[\dX]$/.test(digits) ? digits : "";
  }
  return /^\d{13}$/.test(digits) ? digits : "";
}

function extractExternalId(
  providerExternalId: string,
  source: SupportedSource,
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

  const isbnCandidates = asStringArray(rawBook.isbn);
  for (const candidate of isbnCandidates) {
    if (!isbn13) isbn13 = normalizeIsbn(candidate, 13);
    if (!isbn10) isbn10 = normalizeIsbn(candidate, 10);
    if (isbn13 && isbn10) break;
  }

  return { isbn13, isbn10 };
}

function normalizeSource(input: unknown): SupportedSource | null {
  const raw = String(input || "").trim();
  if (["googleBooks", "google_books", "googlebooks"].includes(raw)) {
    return "googleBooks";
  }
  if (["openLibrary", "open_library", "openlibrary"].includes(raw)) {
    return "openLibrary";
  }
  return null;
}

function toCoverCandidates(
  source: SupportedSource,
  rawBook: Record<string, unknown>,
  externalId: string
): string[] {
  if (source === "googleBooks") {
    return upgradeGoogleCoverCandidates(rawBook);
  }
  return upgradeOpenLibraryCandidates(rawBook, externalId);
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

  const providerExternalId =
    asNonEmptyString(payload?.providerExternalId || "") ||
    asNonEmptyString(payload?.bookId || "");
  const source = normalizeSource(payload?.source);
  const rawBook = asRecord(payload?.rawBook);

  if (!providerExternalId || !source || !rawBook) {
    throw new HttpsError("invalid-argument", "Missing or invalid parameters.");
  }

  const externalId = extractExternalId(providerExternalId, source, rawBook);
  if (!externalId) {
    throw new HttpsError("invalid-argument", "Unable to resolve provider external id.");
  }

  const title = extractTitle(rawBook);
  const authors = extractAuthors(rawBook);
  const primaryAuthor = authors[0] || "Unknown";
  const canonicalKey = buildCanonicalKey({ title, author: primaryAuthor });
  const normalizedTitle = normalizeSearchText(title);
  const authorNamesNormalized = authors.map((entry) => normalizeSearchText(entry)).filter(Boolean);
  const description = resolveDescription(rawBook);
  const { isbn13, isbn10 } = extractIsbns(rawBook);
  const language = extractLanguage(rawBook);
  const publicationYear = resolvePublicationYear(rawBook);
  const downloadable = computeServerVerifiedDownloadable(rawBook);
  const hasEbook = downloadable;

  const searchTokens = Array.from(
    new Set<string>([
      ...tokenizeSearch(title),
      ...authors.flatMap((entry) => tokenizeSearch(entry)),
      ...(isbn13 ? [isbn13] : []),
      ...(isbn10 ? [isbn10] : []),
    ])
  ).slice(0, 80);

  const identityCandidates = buildIdentityCandidates({
    isbn13,
    isbn10,
    canonicalKey,
    source,
    externalId,
  });

  const ingestionKey = `${source}:${externalId}`;
  const ingestionRef = db.collection("book_ingestions").doc(ingestionKey);

  const coverCandidates = toCoverCandidates(source, rawBook, externalId);

  logger.info("BOOK_INGEST_V2_TRACE", {
    phase: "identity_built",
    ingestionKey,
    source,
    externalId,
    identityKeys: identityCandidates.map((entry) => entry.key),
    coverCandidates: coverCandidates.length,
  });

  const transactionResult = await db.runTransaction(async (tx) => {
    const ingestionSnap = await tx.get(ingestionRef);
    const existingIngestion = asRecord(ingestionSnap.data() || null);
    const ingestedBookId = asNonEmptyString(existingIngestion?.bookId);
    const ingestedState = asNonEmptyString(existingIngestion?.state);

    if (ingestedBookId && ingestedState === "COMPLETE") {
      tx.set(
        ingestionRef,
        {
          updatedAt: FieldValue.serverTimestamp(),
          lastSeenAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      logger.info("BOOK_INGEST_V2_TRACE", {
        phase: "already_complete",
        ingestionKey,
        bookId: ingestedBookId,
        editionId: `${source}:${externalId}`,
        outcome: "ALREADY_COMPLETE",
      });

      return {
        canonicalBookId: ingestedBookId,
        bookId: ingestedBookId,
        editionId: `${source}:${externalId}`,
        status: "ALREADY_COMPLETE",
      };
    }

    let resolvedBookId = ingestedBookId || "";
    let resolvedByKey = ingestedBookId ? `ingestion:${ingestionKey}` : "";
    const conflictingBookIds = new Set<string>();

    for (const candidate of identityCandidates) {
      const identitySnap = await tx.get(db.collection("book_identity").doc(candidate.key));
      const identityData = asRecord(identitySnap.data() || null);
      const mappedBookId = asNonEmptyString(identityData?.bookId);
      if (!mappedBookId) continue;

      conflictingBookIds.add(mappedBookId);
      if (!resolvedBookId) {
        resolvedBookId = mappedBookId;
        resolvedByKey = candidate.key;
      }
    }

    const bookId = resolvedBookId || uuidv4();
    const bookRef = db.collection("books").doc(bookId);
    const bookSnap = await tx.get(bookRef);
    const existingBook = asRecord(bookSnap.data() || null);

    if (conflictingBookIds.size > 1) {
      logger.warn("[INGEST_V2][IDENTITY_CONFLICT_COLLAPSED]", {
        ingestionKey,
        resolvedBookId: bookId,
        candidates: Array.from(conflictingBookIds),
      });
    }

    const existingCover = asRecord(existingBook?.cover);
    const existingCoverState = asNonEmptyString(existingBook?.coverState) ||
      asNonEmptyString(existingCover?.state);

    const nextCoverState =
      existingCoverState === "READY"
        ? "READY"
        : coverCandidates.length > 0
        ? "PENDING"
        : "FAILED";

    logger.info("BOOK_INGEST_V2_TRACE", {
      phase: "identity_resolved",
      ingestionKey,
      resolvedBy: resolvedByKey || "new_book",
      bookId,
      coverCandidates: coverCandidates.length,
      coverState: nextCoverState,
    });

    const now = FieldValue.serverTimestamp();

    tx.set(
      bookRef,
      {
        id: bookId,
        title,
        titleEn: asNonEmptyString(rawBook.titleEn) || title,
        titleAr: asNonEmptyString(rawBook.titleAr) || "",
        author: primaryAuthor,
        authorEn: asNonEmptyString(rawBook.authorEn) || primaryAuthor,
        authorAr: asNonEmptyString(rawBook.authorAr) || "",
        authors,
        description,
        descriptionEn: asNonEmptyString(rawBook.descriptionEn) || description,
        descriptionAr: asNonEmptyString(rawBook.descriptionAr) || "",
        language,
        publicationYear,
        isbn13: isbn13 || null,
        isbn10: isbn10 || null,
        canonicalKey,
        normalizedTitle,
        authorNamesNormalized,
        searchableTitleAuthor: `${normalizedTitle} ${authorNamesNormalized.join(" ")}`.trim(),
        search: {
          tokens: searchTokens,
        },
        hasEbook,
        downloadable,
        isEbookAvailable: hasEbook,
        providerExternalIds: FieldValue.arrayUnion(`${source}:${externalId}`),
        sourcePriority: "canonical",
        coverState: nextCoverState,
        cover: {
          state: nextCoverState,
          original: asNonEmptyString(existingCover?.original) || "",
          large: asNonEmptyString(existingCover?.large) || "",
          medium: asNonEmptyString(existingCover?.medium) || "",
          small: asNonEmptyString(existingCover?.small) || "",
        },
        coverUrl: "",
        popularityScore: Number(existingBook?.popularityScore || 0),
        engagementScore: Number(existingBook?.engagementScore || 0),
        recentActivityAt:
          existingBook?.recentActivityAt ||
          FieldValue.serverTimestamp(),
        createdAt: existingBook?.createdAt || now,
        updatedAt: now,
      },
      { merge: true }
    );

    const editionDocId = `${source}:${externalId}`;
    tx.set(
      db.collection("editions").doc(editionDocId),
      {
        id: editionDocId,
        editionId: editionDocId,
        bookId,
        canonicalKey,
        source,
        externalId,
        title,
        titleEn: asNonEmptyString(rawBook.titleEn) || title,
        titleAr: asNonEmptyString(rawBook.titleAr) || "",
        authors,
        authorEn: asNonEmptyString(rawBook.authorEn) || primaryAuthor,
        authorAr: asNonEmptyString(rawBook.authorAr) || "",
        language,
        description,
        descriptionEn: asNonEmptyString(rawBook.descriptionEn) || description,
        descriptionAr: asNonEmptyString(rawBook.descriptionAr) || "",
        publicationYear,
        isbn13: isbn13 || null,
        isbn10: isbn10 || null,
        hasEbook,
        downloadable,
        isEbookAvailable: hasEbook,
        searchTitleNormalized: normalizedTitle,
        searchAuthorNormalized: authorNamesNormalized.join(" "),
        searchTokens,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    for (const candidate of identityCandidates) {
      const ref = db.collection("book_identity").doc(candidate.key);
      const snap = await tx.get(ref);
      const existing = asRecord(snap.data() || null);

      const identityRecord: IdentityRecord = {
        identityKey: candidate.key,
        identityType: candidate.type,
        value: candidate.value,
        precedence: candidate.precedence,
        bookId,
        updatedAt: now,
      };

      if (!existing) {
        identityRecord.createdAt = now;
      }

      tx.set(ref, identityRecord, { merge: true });
    }

    tx.set(
      ingestionRef,
      {
        ingestionKey,
        source,
        externalId,
        externalBookId: providerExternalId,
        canonicalKey,
        identityKeys: identityCandidates.map((entry) => entry.key),
        bookId,
        editionId: `${source}:${externalId}`,
        state: "COMPLETE",
        coverState: nextCoverState,
        createdAt: existingIngestion?.createdAt || now,
        updatedAt: now,
      },
      { merge: true }
    );

    const coverJobRef = db.collection("cover_jobs").doc(bookId);
    const coverJobSnap = await tx.get(coverJobRef);
    const existingCoverJob = asRecord(coverJobSnap.data() || null);
    const existingCandidateUrls = Array.isArray(existingCoverJob?.candidateUrls)
      ? existingCoverJob?.candidateUrls.filter((entry): entry is string => typeof entry === "string")
      : [];

    const mergedCandidates = Array.from(
      new Set<string>([...existingCandidateUrls, ...coverCandidates])
    ).slice(0, 30);

    if (nextCoverState !== "READY") {
      const existingStatus = asNonEmptyString(existingCoverJob?.status) as CoverJobStatus | null;
      const status: CoverJobStatus =
        existingStatus === "PROCESSING" ? "PROCESSING" : "PENDING";

      tx.set(
        coverJobRef,
        {
          bookId,
          source,
          externalId,
          status,
          attempts: Number(existingCoverJob?.attempts || 0),
          candidateUrls: mergedCandidates,
          lastError: null,
          createdAt: existingCoverJob?.createdAt || now,
          updatedAt: now,
        },
        { merge: true }
      );
    }

    return {
      canonicalBookId: bookId,
      bookId,
      editionId: `${source}:${externalId}`,
      status: resolvedBookId ? "MERGED" : "CREATED",
    };
  });

  logger.info("BOOK_INGEST_V2_TRACE", {
    phase: "complete",
    ingestionKey,
    outcome: transactionResult.status,
    bookId: transactionResult.bookId,
    editionId: transactionResult.editionId,
  });

  return transactionResult;
});
