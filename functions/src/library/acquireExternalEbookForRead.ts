import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { createHash } from "crypto";
import JSZip from "jszip";
import { admin } from "../firebaseAdmin";
import { resolveBookToEbookAttachment } from "../attachments/resolveBookToEbookAttachment";
import { getOrBuildReaderManifest } from "../reader/readerManifestService";
import { canUserReadBook, normalizeBookRightsMode } from "../rights/bookRights";
import {
  hasMinimumCanonicalIdentity,
  ingestBookServerSide,
  type SupportedSource,
} from "./ingestBook";
import {
  areAuthorityAuthorsEquivalent,
  extractAuthorityAuthorReference,
} from "./authorityAuthorLock";
import {
  fetchOpenLibraryCanonicalMetadata,
  resolveOpenLibraryReadableCandidate,
} from "./providers/openLibrary";
import { resolveGutenbergReadableCandidate } from "./providers/gutenberg";
import { resolveHindawiReadableCandidate } from "./providers/hindawi";
import { resolveGallicaReadableCandidate } from "./providers/gallica";
import type {
  AcquisitionFormat,
  AcquisitionProvider,
  DownloadCandidate,
  ExternalReadableSourceRecord,
  ExternalReadableCandidate,
  ProviderLookupContext,
  SourceHint,
} from "./providers/types";

const db = admin.firestore();
const storage = admin.storage();
const MAX_DOWNLOAD_BYTES = 80 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 25_000;
const ACQUISITION_COLLECTION = "ebook_acquisitions";
const ACQUISITION_BOOK_WRITE_ALLOWLIST = new Set([
  "externalReadableSources",
  "ebookAttachmentId",
  "ebookStoragePath",
  "epubStoragePath",
  "acquiredFromProvider",
  "providerExternalIds",
  "readerAuthority",
  "updatedAt",
]);
const ACQUISITION_EDITION_WRITE_ALLOWLIST = new Set([
  "externalReadableSources",
  "ebookAttachmentId",
  "ebookStoragePath",
  "epubStoragePath",
  "providerExternalIds",
  "updatedAt",
]);

type AcquisitionState = "idle" | "acquiring" | "acquired" | "failed";

type AcquireRequest = {
  bookId?: string;
  source?: SupportedSource;
  providerExternalId?: string;
};

type AcquireResponse = {
  bookId: string;
  editionId?: string;
  status: "already_available" | "acquired";
  provider: "booktown" | AcquisitionProvider;
  format: AcquisitionFormat | "unknown";
};

type DownloadedAsset = {
  buffer: Buffer;
  format: AcquisitionFormat;
  mimeType: string;
  checksum: string;
};

type AcquisitionLock = {
  docId: string;
};

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
    .filter(Boolean);
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function assertAllowedAcquisitionPatch(
  patch: Record<string, unknown>,
  allowedFields: Set<string>,
  context: string
): void {
  const unexpectedFields = Object.keys(patch).filter((field) => !allowedFields.has(field));
  if (unexpectedFields.length > 0) {
    logger.error("[ACQUIRE][DISALLOWED_MUTATION_FIELDS]", {
      context,
      unexpectedFields,
    });
    throw new HttpsError(
      "internal",
      "Acquisition attempted to mutate fields outside its authority."
    );
  }
}

function inferFormatFromPath(path: string): AcquisitionFormat | "unknown" {
  const normalized = path.toLowerCase();
  if (normalized.endsWith(".epub")) return "epub";
  if (normalized.endsWith(".pdf")) return "pdf";
  return "unknown";
}

function isCanonicalStoragePath(bookId: string, path: string): boolean {
  return path.startsWith(`books/${bookId}/original/`) || path.startsWith(`ebooks/${bookId}/`);
}

function sanitizeStorageSegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized.slice(0, 120) || "asset";
}

function buildAcquisitionDocId(
  bookId: string,
  provider: AcquisitionProvider
): string {
  return `${bookId}__${provider}`;
}

function normalizeAcquisitionState(value: unknown): AcquisitionState {
  if (
    value === "idle" ||
    value === "acquiring" ||
    value === "acquired" ||
    value === "failed"
  ) {
    return value;
  }
  return "idle";
}

async function resolveAuthoritativeBookId(
  bookId: string,
  bookData: Record<string, unknown>
): Promise<string> {
  const candidates = new Set<string>();

  for (const identityKey of asStringArray(bookData.identityKeys)) {
    candidates.add(identityKey);
  }

  const isbn13 = asNonEmptyString(bookData.isbn13);
  const isbn10 = asNonEmptyString(bookData.isbn10);
  const canonicalKey = asNonEmptyString(bookData.canonicalKey);
  if (isbn13) candidates.add(`isbn13:${isbn13}`);
  if (isbn10) candidates.add(`isbn10:${isbn10}`);
  if (canonicalKey) candidates.add(`canonical:${canonicalKey}`);

  for (const providerExternalId of asStringArray(bookData.providerExternalIds)) {
    if (/^(googleBooks|openLibrary):/i.test(providerExternalId)) {
      candidates.add(`provider:${providerExternalId}`);
    }
  }

  for (const candidate of candidates) {
    const identitySnap = await db.collection("book_identity").doc(candidate).get();
    const mappedBookId = asNonEmptyString(identitySnap.data()?.bookId);
    if (mappedBookId === bookId) {
      return mappedBookId;
    }
    if (!mappedBookId) {
      continue;
    }

    const mappedBookSnap = await db.collection("books").doc(mappedBookId).get();
    const mappedBookData = (mappedBookSnap.data() || null) as Record<string, unknown> | null;
    if (!mappedBookData) {
      continue;
    }

    if (!areAuthorityAuthorsEquivalent(bookData, mappedBookData)) {
      logger.warn("[ACQUIRE][AUTHOR_LOCK_REJECTED_IDENTITY_REDIRECT]", {
        identityKey: candidate,
        requestedBookId: bookId,
        mappedBookId,
        requestedAuthor: extractAuthorityAuthorReference(bookData),
        mappedAuthor: extractAuthorityAuthorReference(mappedBookData),
      });
      continue;
    }

    if (mappedBookId) {
      return mappedBookId;
    }
  }

  return bookId;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function readExternalReadableSources(
  book: Record<string, unknown>
): ExternalReadableSourceRecord[] {
  const raw = Array.isArray(book.externalReadableSources)
    ? book.externalReadableSources
    : [];

  return raw
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .map((entry) => {
      const provider =
        entry.provider === "openLibrary" ||
        entry.provider === "gutenberg" ||
        entry.provider === "hindawi" ||
        entry.provider === "gallica"
          ? entry.provider
          : null;
      const providerExternalId = asNonEmptyString(entry.providerExternalId);
      const trust = entry.trust === "trusted" ? "trusted" : null;
      if (!provider || !providerExternalId || !trust) {
        return null;
      }

      const lendingEditionId = asNonEmptyString(entry.lendingEditionId);
      const lendingIdentifier = asNonEmptyString(entry.lendingIdentifier);

      return {
        provider,
        providerExternalId,
        ...(lendingEditionId ? { lendingEditionId } : {}),
        ...(lendingIdentifier ? { lendingIdentifier } : {}),
        trust,
      } satisfies ExternalReadableSourceRecord;
    })
    .filter((entry): entry is ExternalReadableSourceRecord => entry !== null);
}

/**
 * Availability ownership:
 * - externalReadableSources is owned by this acquisition flow.
 * - ebookAttachmentId / ebookStoragePath are readable-copy pointers finalized
 *   here only for acquired external assets; createEbookAttachment owns admin
 *   attachment finalization for uploaded in-app ebooks.
 * - hasEbook, downloadable, and isEbookAvailable remain outside acquisition
 *   ownership; readers must derive availability from attachment pointers.
 */
function mergeExternalReadableSources(
  existing: ExternalReadableSourceRecord[],
  incoming: ExternalReadableSourceRecord
): ExternalReadableSourceRecord[] {
  const merged = [...existing];
  const key = `${incoming.provider}:${incoming.providerExternalId}`;
  const index = merged.findIndex(
    (entry) => `${entry.provider}:${entry.providerExternalId}` === key
  );

  if (index === -1) {
    merged.push(incoming);
    return merged;
  }

  merged[index] = {
    ...merged[index],
    ...incoming,
  };
  return merged;
}

async function persistExternalReadableSource(params: {
  bookId: string;
  editionId: string | null;
  source: ExternalReadableSourceRecord;
}): Promise<void> {
  const { bookId, editionId, source } = params;
  const bookRef = db.collection("books").doc(bookId);
  const editionRef = editionId ? db.collection("editions").doc(editionId) : null;

  await db.runTransaction(async (tx) => {
    // Firestore requires every transaction read to complete before the first write.
    // Keep optional edition reads in this prewrite phase; do not move tx.get calls
    // into conditionals below any tx.set/update/delete.
    const [bookSnap, editionSnap] = await Promise.all([
      tx.get(bookRef),
      editionRef ? tx.get(editionRef) : Promise.resolve(null),
    ]);
    if (!bookSnap.exists) {
      throw new HttpsError("not-found", "Book not found.");
    }

    const existingBook = (bookSnap.data() || {}) as Record<string, unknown>;
    const existingEdition = (editionSnap?.data() || {}) as Record<string, unknown>;
    const nextBookSources = mergeExternalReadableSources(
      readExternalReadableSources(existingBook),
      source
    );
    const nextEditionSources = editionRef
      ? mergeExternalReadableSources(readExternalReadableSources(existingEdition), source)
      : null;

    const bookPatch: Record<string, unknown> = {
      externalReadableSources: nextBookSources,
      providerExternalIds: FieldValue.arrayUnion(
        `${source.provider}:${source.providerExternalId}`
      ),
      updatedAt: FieldValue.serverTimestamp(),
    };
    assertAllowedAcquisitionPatch(
      bookPatch,
      ACQUISITION_BOOK_WRITE_ALLOWLIST,
      "persistExternalReadableSource.book"
    );

    // This transaction mutates only the acquisition-owned external readability
    // source list plus provider index projection.
    tx.set(
      bookRef,
      bookPatch,
      { merge: true }
    );

    if (!editionRef) return;
    const editionPatch: Record<string, unknown> = {
      externalReadableSources: nextEditionSources,
      providerExternalIds: FieldValue.arrayUnion(
        `${source.provider}:${source.providerExternalId}`
      ),
      updatedAt: FieldValue.serverTimestamp(),
    };
    assertAllowedAcquisitionPatch(
      editionPatch,
      ACQUISITION_EDITION_WRITE_ALLOWLIST,
      "persistExternalReadableSource.edition"
    );

    // Edition projection of acquisition-owned external readability sources.
    tx.set(
      editionRef,
      editionPatch,
      { merge: true }
    );
  });
}

function assertTrustedCandidate(candidate: ExternalReadableCandidate): void {
  if (!candidate.trust?.availabilityTrust || !candidate.trust?.acquisitionTrust) {
    throw new HttpsError(
      "failed-precondition",
      "Provider candidate is not trusted for acquisition."
    );
  }
}

function resolveSourceHint(data: AcquireRequest): SourceHint | null {
  if (!data.source || !data.providerExternalId) return null;
  return {
    source: data.source,
    providerExternalId: data.providerExternalId,
  };
}

function assertPublicAcquisitionAllowed(book: Record<string, unknown>): void {
  const rightsMode = normalizeBookRightsMode(book.rightsMode);
  const visibility = asNonEmptyString(book.visibility).toLowerCase();
  if (rightsMode !== "public_free" || visibility === "private") {
    throw new HttpsError(
      "failed-precondition",
      "Book rights do not allow public acquisition."
    );
  }
}

function hasTrustedExternalReadabilityAuthority(book: Record<string, unknown>): boolean {
  const readability = asRecord(book.readability);
  if (readability?.status === "trusted_external") {
    return true;
  }

  return readExternalReadableSources(book).length > 0;
}

function assertPreparationAuthority(bookId: string, book: Record<string, unknown>): void {
  if (hasTrustedExternalReadabilityAuthority(book)) {
    return;
  }

  logger.warn("[ACQUIRE][READABILITY_AUTHORITY_REJECTED]", {
    bookId,
    readabilityStatus: asRecord(book.readability)?.status || null,
    externalReadableSourceCount: readExternalReadableSources(book).length,
    providerExternalIdCount: Array.isArray(book.providerExternalIds)
      ? book.providerExternalIds.length
      : 0,
  });

  throw new HttpsError(
    "failed-precondition",
    "No validated readability authority permits ebook preparation."
  );
}

async function buildCanonicalMetadataFromSource(
  source: SupportedSource,
  providerExternalId: string
): Promise<Record<string, unknown>> {
  if (source === "openLibrary") {
    const rawBook = await fetchOpenLibraryCanonicalMetadata(providerExternalId);
    if (rawBook) return rawBook;
    throw new HttpsError("not-found", "OpenLibrary metadata unavailable.");
  }

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
    throw new HttpsError("not-found", "Google Books metadata unavailable.");
  }

  const payload = asRecord(await response.json());
  const volumeInfo = asRecord(payload?.volumeInfo);
  if (!payload || !volumeInfo) {
    throw new HttpsError("not-found", "Google Books metadata unavailable.");
  }

  return {
    ...volumeInfo,
    id: providerExternalId,
    externalId: providerExternalId,
    source: "googleBooks",
  };
}

async function validateEpub(buffer: Buffer): Promise<boolean> {
  if (buffer.length < 96 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    return false;
  }

  try {
    const zip = await JSZip.loadAsync(buffer);
    const mimetype = zip.file("mimetype");
    if (!mimetype) return false;
    const value = await mimetype.async("text");
    return value.trim() === "application/epub+zip";
  } catch {
    return false;
  }
}

function validatePdf(buffer: Buffer): boolean {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

async function epubContainsArabic(zip: JSZip): Promise<boolean> {
  const files = Object.values(zip.files)
    .filter((entry) => !entry.dir && /\.(xhtml|html|xml|opf|ncx|txt)$/i.test(entry.name))
    .slice(0, 8);

  for (const file of files) {
    const text = await file.async("text");
    if (/[\u0600-\u06FF]/u.test(text)) {
      return true;
    }
  }

  return false;
}

async function validateArabicIntegrity(
  provider: AcquisitionProvider,
  format: AcquisitionFormat,
  buffer: Buffer
): Promise<void> {
  if (provider !== "hindawi") return;

  if (format === "epub") {
    const zip = await JSZip.loadAsync(buffer);
    if (!(await epubContainsArabic(zip))) {
      throw new Error("HINDAWI_ARABIC_VALIDATION_FAILED");
    }
    return;
  }

  if (!/[\u0600-\u06FF]/u.test(buffer.toString("utf8"))) {
    throw new Error("HINDAWI_ARABIC_VALIDATION_FAILED");
  }
}

async function downloadCandidate(
  provider: AcquisitionProvider,
  candidate: DownloadCandidate
): Promise<DownloadedAsset | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(candidate.url, {
      headers: {
        "User-Agent": "BookTownBot/2.0",
        Accept: `${candidate.mimeType},*/*`,
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      logger.warn("[ACQUIRE][DOWNLOAD_FAILED]", {
        provider,
        url: candidate.url,
        status: response.status,
      });
      return null;
    }

    const contentLength = Number(response.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_DOWNLOAD_BYTES) {
      logger.warn("[ACQUIRE][DOWNLOAD_TOO_LARGE]", {
        provider,
        url: candidate.url,
        contentLength,
      });
      return null;
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_DOWNLOAD_BYTES) {
        logger.warn("[ACQUIRE][DOWNLOAD_EXCEEDED_LIMIT]", {
          provider,
          url: candidate.url,
          bytes: total,
        });
        return null;
      }
      chunks.push(value);
    }

    const buffer = Buffer.concat(chunks.map((entry) => Buffer.from(entry)), total);

    if (candidate.format === "epub") {
      if (!(await validateEpub(buffer))) return null;
    } else if (!validatePdf(buffer)) {
      return null;
    }

    await validateArabicIntegrity(provider, candidate.format, buffer);

    return {
      buffer,
      format: candidate.format,
      mimeType: candidate.mimeType,
      checksum: createHash("sha256").update(buffer).digest("hex"),
    };
  } catch (error) {
    logger.warn("[ACQUIRE][DOWNLOAD_ERROR]", {
      provider,
      url: candidate.url,
      error: String(error),
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveDownloadedAsset(
  candidate: ExternalReadableCandidate
): Promise<DownloadedAsset | null> {
  for (const candidateSpec of candidate.candidates) {
    const downloaded = await downloadCandidate(candidate.provider, candidateSpec);
    if (downloaded) {
      return downloaded;
    }
  }
  return null;
}

async function beginAcquisition(params: {
  bookId: string;
  provider: AcquisitionProvider;
  providerExternalId: string;
}): Promise<AcquisitionLock> {
  const { bookId, provider, providerExternalId } = params;
  const docId = buildAcquisitionDocId(bookId, provider);
  const acquisitionRef = db.collection(ACQUISITION_COLLECTION).doc(docId);

  await db.runTransaction(async (tx) => {
    // Firestore transaction ordering is strict: read lock state before writing
    // the acquisition lease so retries never fail with read-after-write errors.
    const snap = await tx.get(acquisitionRef);
    const existing = asRecord(snap.data() || null);
    const state = normalizeAcquisitionState(existing?.state);

    if (state === "acquiring") {
      throw new HttpsError(
        "failed-precondition",
        "A readable copy is already being prepared."
      );
    }

    if (state === "acquired") {
      throw new HttpsError(
        "failed-precondition",
        "Acquisition state is already acquired for this provider."
      );
    }

    const attempts = asFiniteNumber(existing?.attemptCount) || 0;
    const failures = asFiniteNumber(existing?.failureCount) || 0;
    const now = FieldValue.serverTimestamp();

    tx.set(
      acquisitionRef,
      {
        id: docId,
        bookId,
        provider,
        providerExternalId,
        state: "acquiring",
        trust: {
          availabilityTrust: true,
          acquisitionTrust: true,
        },
        attemptCount: attempts + 1,
        failureCount: failures,
        lastErrorMessage: null,
        lastAttemptAt: now,
        updatedAt: now,
        createdAt: existing?.createdAt || now,
      },
      { merge: true }
    );
  });

  return { docId };
}

async function completeAcquisition(params: {
  lock: AcquisitionLock;
  bookId: string;
  provider: AcquisitionProvider;
  providerExternalId: string;
  editionId: string | null;
  format: AcquisitionFormat;
}): Promise<void> {
  const { lock, bookId, provider, providerExternalId, editionId, format } = params;
  await db
    .collection(ACQUISITION_COLLECTION)
    .doc(lock.docId)
    .set(
      {
        id: lock.docId,
        bookId,
        provider,
        providerExternalId,
        state: "acquired",
        trust: {
          availabilityTrust: true,
          acquisitionTrust: true,
        },
        editionId,
        format,
        lastErrorMessage: null,
        acquiredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

async function failAcquisition(params: {
  lock: AcquisitionLock;
  bookId: string;
  provider: AcquisitionProvider;
  providerExternalId: string;
  error: unknown;
}): Promise<void> {
  const { lock, bookId, provider, providerExternalId, error } = params;
  const acquisitionRef = db.collection(ACQUISITION_COLLECTION).doc(lock.docId);

  await db.runTransaction(async (tx) => {
    // Read the current failure count before writing. Firestore does not allow
    // tx.get calls after this transaction records the failed acquisition state.
    const snap = await tx.get(acquisitionRef);
    const existing = asRecord(snap.data() || null);
    const failures = asFiniteNumber(existing?.failureCount) || 0;

    tx.set(
      acquisitionRef,
      {
        id: lock.docId,
        bookId,
        provider,
        providerExternalId,
        state: "failed",
        trust: {
          availabilityTrust: true,
          acquisitionTrust: true,
        },
        failureCount: failures + 1,
        lastErrorMessage: extractErrorMessage(error),
        failedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}

async function ensureExistingReadableAsset(params: {
  uid: string;
  bookId: string;
  book: Record<string, unknown>;
  editionId: string | null;
}): Promise<AcquireResponse | null> {
  const { uid, bookId, book, editionId } = params;
  const attachment = await resolveBookToEbookAttachment(bookId);

  if (attachment?.storagePath) {
    if (!canUserReadBook(book, uid) || attachment.visibility !== "public") {
      throw new HttpsError(
        "failed-precondition",
        "Book already has a non-public ebook asset."
      );
    }

    return {
      bookId,
      editionId: editionId || undefined,
      status: "already_available",
      provider: "booktown",
      format: inferFormatFromPath(attachment.storagePath),
    };
  }

  const legacyStoragePath = asNonEmptyString(book.storagePath);
  if (!legacyStoragePath) {
    return null;
  }

  if (!isCanonicalStoragePath(bookId, legacyStoragePath)) {
    throw new HttpsError(
      "failed-precondition",
      "Book storage path is outside canonical reader scope."
    );
  }

  if (!canUserReadBook(book, uid)) {
    throw new HttpsError(
      "failed-precondition",
      "Book already has a non-public ebook asset."
    );
  }

  return {
    bookId,
    editionId: editionId || undefined,
    status: "already_available",
    provider: "booktown",
    format: inferFormatFromPath(legacyStoragePath),
  };
}

async function storeDownloadedAsset(params: {
  bookId: string;
  provider: AcquisitionProvider;
  providerExternalId: string;
  asset: DownloadedAsset;
}): Promise<string> {
  const { bookId, provider, providerExternalId, asset } = params;
  const storagePath =
    `ebooks/${bookId}/${provider}/` +
    `${sanitizeStorageSegment(providerExternalId)}.${asset.format}`;
  const file = storage.bucket().file(storagePath);

  await file.save(asset.buffer, {
    resumable: false,
    contentType: asset.mimeType,
    metadata: {
      contentType: asset.mimeType,
      cacheControl: "public,max-age=31536000,immutable",
      metadata: {
        sourceProvider: provider,
        sourceExternalId: providerExternalId,
        checksum: asset.checksum,
      },
    },
  });

  return storagePath;
}

async function cleanupStoredAsset(storagePath: string): Promise<void> {
  try {
    await storage.bucket().file(storagePath).delete({ ignoreNotFound: true });
  } catch (error) {
    logger.warn("[ACQUIRE][STORAGE_CLEANUP_FAILED]", {
      storagePath,
      error: String(error),
    });
  }
}

async function finalizeAcquisition(params: {
  uid: string;
  bookId: string;
  editionId: string | null;
  provider: AcquisitionProvider;
  providerExternalId: string;
  asset: DownloadedAsset;
  storagePath: string;
}): Promise<AcquireResponse> {
  const {
    uid,
    bookId,
    editionId,
    provider,
    providerExternalId,
    asset,
    storagePath,
  } = params;
  const attachmentRef = db.collection("attachments").doc();
  const resolvedEditionId = editionId || `acquired:${bookId}`;
  const bookRef = db.collection("books").doc(bookId);
  const editionRef = db.collection("editions").doc(resolvedEditionId);
  const persistedSource: ExternalReadableSourceRecord = {
    provider,
    providerExternalId,
    trust: "trusted",
  };

  const result = await db.runTransaction(async (tx) => {
    // Firestore transactions reject reads after writes. All reads used by this
    // finalization branch must stay above the first tx.set, including reads added
    // by future idempotency or ownership checks.
    const [bookSnap, editionSnap] = await Promise.all([tx.get(bookRef), tx.get(editionRef)]);
    if (!bookSnap.exists) {
      throw new HttpsError("not-found", "Book not found.");
    }

    const book = (bookSnap.data() || {}) as Record<string, unknown>;
    const existingEdition = (editionSnap.data() || {}) as Record<string, unknown>;
    const existingAttachmentId = asNonEmptyString(book.ebookAttachmentId);
    const existingBookReadableSources = mergeExternalReadableSources(
      readExternalReadableSources(book),
      persistedSource
    );
    const existingEditionReadableSources = mergeExternalReadableSources(
      readExternalReadableSources(existingEdition),
      persistedSource
    );

    if (existingAttachmentId) {
      return {
        bookId,
        editionId: resolvedEditionId,
        status: "already_available" as const,
        provider: "booktown" as const,
        format: asset.format,
      };
    }

    assertPublicAcquisitionAllowed(book);
    const now = FieldValue.serverTimestamp();

    tx.set(
      attachmentRef,
      {
        id: attachmentRef.id,
        type: "ebook",
        format: asset.format,
        mimeType: asset.mimeType,
        storagePath,
        parentType: "editions",
        parentId: resolvedEditionId,
        editionId: resolvedEditionId,
        bookId,
        visibility: "public",
        status: "active",
        sourceProvider: provider,
        sourceExternalId: providerExternalId,
        checksum: asset.checksum,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    const editionPatch: Record<string, unknown> = {
      ebookAttachmentId: attachmentRef.id,
      ebookStoragePath: storagePath,
      ...(asset.format === "epub" ? { epubStoragePath: storagePath } : {}),
      providerExternalIds: FieldValue.arrayUnion(`${provider}:${providerExternalId}`),
      externalReadableSources: existingEditionReadableSources,
      updatedAt: now,
    };
    assertAllowedAcquisitionPatch(
      editionPatch,
      ACQUISITION_EDITION_WRITE_ALLOWLIST,
      "finalizeAcquisition.edition"
    );

    // Acquired readable copy finalization. Pointer fields identify the acquired
    // attachment; catalog availability booleans are intentionally excluded from
    // acquisition ownership.
    tx.set(
      editionRef,
      editionPatch,
      { merge: true }
    );

    const bookPatch: Record<string, unknown> = {
      ebookAttachmentId: attachmentRef.id,
      ebookStoragePath: storagePath,
      acquiredFromProvider: provider,
      providerExternalIds: FieldValue.arrayUnion(`${provider}:${providerExternalId}`),
      externalReadableSources: existingBookReadableSources,
      ...(asset.format === "epub" ? { epubStoragePath: storagePath } : {}),
      readerAuthority: {
        hasReadableAttachment: true,
        attachmentId: attachmentRef.id,
        source: "acquisition",
        updatedAt: now,
      },
      updatedAt: now,
    };
    assertAllowedAcquisitionPatch(
      bookPatch,
      ACQUISITION_BOOK_WRITE_ALLOWLIST,
      "finalizeAcquisition.book"
    );

    // Book projection mirrors the acquired readable copy. This must not be read
    // as taking over hasEbook ownership from materializeBookAuthority.
    tx.set(
      bookRef,
      bookPatch,
      { merge: true }
    );

    return {
      bookId,
      editionId: resolvedEditionId,
      status: "acquired" as const,
      provider,
      format: asset.format,
    };
  });

  if (result.status === "acquired") {
    try {
      await getOrBuildReaderManifest({
        uid,
        bookId,
      });
    } catch (error) {
      logger.warn("[ACQUIRE][MANIFEST_BUILD_SKIPPED]", {
        bookId,
        error: String(error),
      });
    }
  }

  return result;
}

async function resolveCanonicalBookAndEdition(params: {
  uid: string;
  data: AcquireRequest;
}): Promise<{ bookId: string; editionId: string | null; sourceHint: SourceHint | null }> {
  const { uid, data } = params;
  const sourceHint = resolveSourceHint(data);
  const bookId = asNonEmptyString(data.bookId);

  if (bookId) {
    const bookSnap = await db.collection("books").doc(bookId).get();
    if (!bookSnap.exists) {
      throw new HttpsError("not-found", "Book not found.");
    }
    const authoritativeBookId = await resolveAuthoritativeBookId(
      bookId,
      (bookSnap.data() || {}) as Record<string, unknown>
    );
    if (authoritativeBookId !== bookId) {
      const authoritativeSnap = await db.collection("books").doc(authoritativeBookId).get();
      return {
        bookId: authoritativeBookId,
        editionId: asNonEmptyString(authoritativeSnap.data()?.editionId) || null,
        sourceHint,
      };
    }
    return {
      bookId,
      editionId: asNonEmptyString(bookSnap.data()?.editionId) || null,
      sourceHint,
    };
  }

  if (!sourceHint) {
    throw new HttpsError(
      "invalid-argument",
      "Either bookId or source + providerExternalId is required."
    );
  }

  const rawBook = await buildCanonicalMetadataFromSource(
    sourceHint.source,
    sourceHint.providerExternalId
  );
  if (!hasMinimumCanonicalIdentity(rawBook)) {
    throw new HttpsError(
      "failed-precondition",
      "Canonical acquisition requires minimum title plus author or ISBN identity."
    );
  }
  const ingestion = await ingestBookServerSide({
    uid,
    providerExternalId: sourceHint.providerExternalId,
    source: sourceHint.source,
    rawBook,
  });

  return {
    bookId: ingestion.bookId,
    editionId: ingestion.editionId || null,
    sourceHint,
  };
}

async function loadBook(bookId: string): Promise<Record<string, unknown>> {
  const snap = await db.collection("books").doc(bookId).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Book not found.");
  }
  return (snap.data() || {}) as Record<string, unknown>;
}

export const acquireExternalEbookForReadHandler = async (
  request: { auth?: { uid?: string } | null; data?: AcquireRequest | null }
): Promise<AcquireResponse> => {
  const uid = asNonEmptyString(request.auth?.uid);
  if (!uid) {
    throw new HttpsError("unauthenticated", "Auth required.");
  }

  const data = request.data || {};
  const { bookId, editionId, sourceHint } = await resolveCanonicalBookAndEdition({
    uid,
    data,
  });

  const book = await loadBook(bookId);
  const existing = await ensureExistingReadableAsset({
    uid,
    bookId,
    book,
    editionId,
  });
  if (existing) return existing;

  assertPreparationAuthority(bookId, book);
  assertPublicAcquisitionAllowed(book);

  const lookupContext: ProviderLookupContext = {
    bookId,
    book,
    editionId,
    sourceHint,
  };

  logger.info("[ACQUIRE][INPUT_PROVIDERS]", {
    bookId,
    externalReadableSources: readExternalReadableSources(book),
    providerExternalIds: Array.isArray(book.providerExternalIds)
      ? book.providerExternalIds
      : [],
  });

  const providerResolvers = [
    resolveOpenLibraryReadableCandidate,
    resolveGutenbergReadableCandidate,
    resolveHindawiReadableCandidate,
    resolveGallicaReadableCandidate,
  ];

  for (const resolveProvider of providerResolvers) {
    const candidate = await resolveProvider(lookupContext);
    if (!candidate) continue;
    assertTrustedCandidate(candidate);

    if (candidate.persistedSource) {
      await persistExternalReadableSource({
        bookId,
        editionId,
        source: candidate.persistedSource,
      });
    }

    logger.info("[ACQUIRE][PROVIDER_CANDIDATE]", {
      bookId,
      provider: candidate.provider,
      providerExternalId: candidate.providerExternalId,
      candidateCount: candidate.candidates.length,
    });

    const lock = await beginAcquisition({
      bookId,
      provider: candidate.provider,
      providerExternalId: candidate.providerExternalId,
    });

    let storagePath = "";
    try {
      const downloaded = await resolveDownloadedAsset(candidate);
      if (!downloaded) {
        logger.warn("[ACQUIRE][PROVIDER_DISCARDED]", {
          bookId,
          provider: candidate.provider,
          providerExternalId: candidate.providerExternalId,
        });
        await failAcquisition({
          lock,
          bookId,
          provider: candidate.provider,
          providerExternalId: candidate.providerExternalId,
          error: new Error("No valid downloadable asset resolved."),
        });
        continue;
      }

      storagePath = await storeDownloadedAsset({
        bookId,
        provider: candidate.provider,
        providerExternalId: candidate.providerExternalId,
        asset: downloaded,
      });

      const result = await finalizeAcquisition({
        uid,
        bookId,
        editionId,
        provider: candidate.provider,
        providerExternalId: candidate.providerExternalId,
        asset: downloaded,
        storagePath,
      });

      if (result.status === "acquired") {
        await completeAcquisition({
          lock,
          bookId,
          provider: candidate.provider,
          providerExternalId: candidate.providerExternalId,
          editionId: result.editionId || null,
          format: downloaded.format,
        });
        return result;
      }

      await failAcquisition({
        lock,
        bookId,
        provider: candidate.provider,
        providerExternalId: candidate.providerExternalId,
        error: new Error("Book already became readable during acquisition."),
      });
      if (storagePath) {
        await cleanupStoredAsset(storagePath);
      }
      return result;
    } catch (error) {
      await failAcquisition({
        lock,
        bookId,
        provider: candidate.provider,
        providerExternalId: candidate.providerExternalId,
        error,
      });
      if (storagePath) {
        await cleanupStoredAsset(storagePath);
      }
      throw error;
    }
  }

  throw new HttpsError(
    "not-found",
    "No trusted external readable ebook could be acquired."
  );
};

export const acquireExternalEbookForRead = onCall<AcquireRequest>(
  { cors: true },
  async (request) => acquireExternalEbookForReadHandler(request)
);
