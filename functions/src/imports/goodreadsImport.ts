import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { randomUUID } from "crypto";
import { FieldValue, Timestamp, Transaction } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { admin } from "../firebaseAdmin";
import { buildCanonicalKey } from "../library/persistence/canonicalKey";
import { iterateCsvCanonicalRows } from "./goodreads/adapters/csvLibraryAdapter";
import { iterateDsarCanonicalRows } from "./goodreads/adapters/dsarJsonAdapter";
import {
  mapReservedShelf,
  normalizeShelfToken,
  shelfIdFromName,
  sha256Hex,
  trimTo,
} from "./goodreads/normalization";
import { detectSourceKind, sha256ForBuffer } from "./goodreads/sourceDetection";
import type {
  CanonicalImportRow,
  DetectedSourceKind,
  ImportFileType,
  ParseIssue,
  ProcessingCounters,
  SessionStatus,
  SourceKind,
} from "./goodreads/types";

const db = admin.firestore();
const bucket = admin.storage().bucket();

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const SIGNED_UPLOAD_TTL_MS = 15 * 60 * 1000;
const WORKER_LEASE_MS = 2 * 60 * 1000;
const CHECKPOINT_INTERVAL = 25;
const MAX_ERRORS_PERSISTED = 500;
const MAX_SHELVES_PER_ROW = 24;
const MAX_LOGICAL_OPS_PER_ROW = 250;
const PARSER_VERSION = "gr_import_v2";
const STATE_MACHINE_VERSION = "gr_import_v2";

const FEATURE_FLAG_VALUE = (process.env.GOODREADS_IMPORT_V2_ENABLED || "true")
  .trim()
  .toLowerCase();
const GOODREADS_IMPORT_V2_ENABLED =
  FEATURE_FLAG_VALUE !== "0" && FEATURE_FLAG_VALUE !== "false";

type GoodreadsStartRequest = {
  fileName: string;
  fileSize: number;
  mimeType?: string;
  idempotencyKey: string;
  sourceKind?: SourceKind;
  contentSha256?: string;
};

type GoodreadsFinalizeRequest = {
  importId: string;
};

type GoodreadsStartResponse = {
  importId: string;
  status: "UPLOADING";
  uploadUrl: string;
  uploadMethod: "PUT";
  uploadHeaders: Record<string, string>;
  expiresAt: string;
  existingSession: boolean;
};

type GoodreadsFinalizeResponse = {
  importId: string;
  status: "QUEUED";
  detectedSourceKind: DetectedSourceKind;
  parserVersion: typeof PARSER_VERSION;
};

function ensureFeatureEnabled(): void {
  if (!GOODREADS_IMPORT_V2_ENABLED) {
    throw new HttpsError("failed-precondition", "Goodreads import v2 is disabled.");
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeSourceKind(raw: unknown): SourceKind {
  if (raw === undefined || raw === null || raw === "") return "AUTO";
  if (raw === "AUTO" || raw === "CSV" || raw === "DSAR_JSON") {
    return raw;
  }
  throw new HttpsError("invalid-argument", "sourceKind must be AUTO, CSV, or DSAR_JSON.");
}

function normalizeContentSha256(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") {
    throw new HttpsError("invalid-argument", "contentSha256 must be a string.");
  }
  const normalized = raw.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new HttpsError("invalid-argument", "contentSha256 must be 64 hex characters.");
  }
  return normalized;
}

function normalizeIdempotencyKey(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new HttpsError("invalid-argument", "idempotencyKey must be a string.");
  }
  const normalized = raw.trim();
  if (!/^[A-Za-z0-9_-]{8,96}$/.test(normalized)) {
    throw new HttpsError(
      "invalid-argument",
      "idempotencyKey must be 8-96 chars [A-Za-z0-9_-]."
    );
  }
  return normalized;
}

function normalizeFileName(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new HttpsError("invalid-argument", "fileName must be a string.");
  }

  const fileName = raw.trim();
  if (!fileName || fileName.length > 255) {
    throw new HttpsError("invalid-argument", "Invalid fileName.");
  }
  if (fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) {
    throw new HttpsError("invalid-argument", "Invalid fileName.");
  }
  return fileName;
}

function normalizeMimeType(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase();
}

function normalizeFileSize(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    throw new HttpsError("invalid-argument", "Invalid fileSize.");
  }
  if (raw > MAX_SOURCE_BYTES) {
    throw new HttpsError("resource-exhausted", "File exceeds import size limit.");
  }
  return Math.trunc(raw);
}

function toImportFileType(fileName: string): ImportFileType {
  const lowered = fileName.toLowerCase().trim();
  if (lowered.endsWith(".csv")) return "csv";
  if (lowered.endsWith(".zip")) return "zip";
  throw new HttpsError("invalid-argument", "Only .csv or .zip files are supported.");
}

function isAllowedMime(fileType: ImportFileType, mimeType: string): boolean {
  const value = mimeType.toLowerCase().trim();
  if (fileType === "csv") {
    return (
      value === "text/csv" ||
      value === "application/csv" ||
      value === "application/vnd.ms-excel" ||
      value === "text/plain"
    );
  }
  return (
    value === "application/zip" ||
    value === "application/x-zip-compressed" ||
    value === "multipart/x-zip" ||
    value === "application/octet-stream"
  );
}

function toIssue(
  rowIndex: number,
  rowKey: string,
  code: string,
  message: string,
  details?: Record<string, unknown>
): ParseIssue {
  return {
    rowIndex,
    rowKey,
    code,
    message,
    details,
  };
}

function isParseIssue(value: CanonicalImportRow | ParseIssue): value is ParseIssue {
  return "code" in value;
}

function canIssueUploadForStatus(status: unknown): boolean {
  return status === "RECEIVED" || status === "UPLOADING";
}

function toIdentityKeyFromRow(row: CanonicalImportRow): string {
  return row.identityKey;
}

async function resolveOrCreateBook(tx: Transaction, row: CanonicalImportRow): Promise<string> {
  const booksRef = db.collection("books");

  if (row.isbn13) {
    const byIsbn13 = await tx.get(booksRef.where("isbn13", "==", row.isbn13).limit(2));
    if (byIsbn13.size > 1) {
      throw new Error("AMBIGUOUS_ISBN13_MATCH");
    }
    if (!byIsbn13.empty) {
      return byIsbn13.docs[0].id;
    }
  }

  if (row.isbn10) {
    const byIsbn10 = await tx.get(booksRef.where("isbn10", "==", row.isbn10).limit(2));
    if (byIsbn10.size > 1) {
      throw new Error("AMBIGUOUS_ISBN10_MATCH");
    }
    if (!byIsbn10.empty) {
      return byIsbn10.docs[0].id;
    }
  }

  const canonicalKey = buildCanonicalKey({
    title: row.title,
    author: row.author,
  });

  const byCanonical = await tx.get(booksRef.where("canonicalKey", "==", canonicalKey).limit(2));
  if (byCanonical.size > 1 && !row.isbn13 && !row.isbn10) {
    throw new Error("LOW_CONFIDENCE_MATCH_REJECTED");
  }
  if (!byCanonical.empty) {
    return byCanonical.docs[0].id;
  }

  const bookId = `gr_${sha256Hex(toIdentityKeyFromRow(row)).slice(0, 24)}`;
  const bookRef = booksRef.doc(bookId);
  const editionRef = db.collection("editions").doc(bookId);
  const now = FieldValue.serverTimestamp();

  tx.set(
    bookRef,
    {
      id: bookId,
      source: "goodreads_import",
      canonicalKey,
      title: row.title,
      titleEn: row.title,
      titleAr: "",
      author: row.author,
      authorEn: row.author,
      authorAr: "",
      authors: [row.author],
      isbn10: row.isbn10,
      isbn13: row.isbn13,
      description: "",
      descriptionEn: "",
      descriptionAr: "",
      coverUrl: "",
      rating: 0,
      ratingsCount: 0,
      isEbookAvailable: false,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  tx.set(
    editionRef,
    {
      id: bookId,
      bookId,
      source: "goodreads_import",
      canonicalKey,
      title: row.title,
      titleEn: row.title,
      titleAr: "",
      authorEn: row.author,
      authorAr: "",
      authors: [row.author],
      description: "",
      descriptionEn: "",
      descriptionAr: "",
      isbn10: row.isbn10,
      isbn13: row.isbn13,
      coverUrl: "",
      language: "en",
      hasEbook: false,
      downloadable: false,
      visibility: "public",
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  return bookId;
}

function toSessionShelfDocs(uid: string, row: CanonicalImportRow): Array<{
  docId: string;
  shelfId: string;
  titleEn: string;
  isSystem: boolean;
}> {
  const collected = new Map<string, { shelfId: string; titleEn: string; isSystem: boolean }>();

  for (const shelf of row.shelfNames.slice(0, MAX_SHELVES_PER_ROW)) {
    const reserved = mapReservedShelf(shelf);
    if (reserved === "currently-reading") {
      continue;
    }

    if (reserved === "finished" || reserved === "want-to-read") {
      collected.set(reserved, {
        shelfId: reserved,
        titleEn: reserved === "finished" ? "Finished" : "Want to Read",
        isSystem: true,
      });
      continue;
    }

    const customId = shelfIdFromName(shelf);
    collected.set(customId, {
      shelfId: customId,
      titleEn: trimTo(shelf, 120),
      isSystem: false,
    });
  }

  return Array.from(collected.values())
    .sort((a, b) => a.shelfId.localeCompare(b.shelfId))
    .map((entry) => ({
      docId: `${uid}_${entry.shelfId}`,
      shelfId: entry.shelfId,
      titleEn: entry.titleEn,
      isSystem: entry.isSystem,
    }));
}

function estimateLogicalOps(params: {
  shelfCount: number;
  writesRating: boolean;
  writesReview: boolean;
  writesProgress: boolean;
}): number {
  const baseReadsAndWrites = 20;
  const perShelf = params.shelfCount * 4;
  const rating = params.writesRating ? 3 : 0;
  const review = params.writesReview ? 4 : 0;
  const progress = params.writesProgress ? 2 : 0;
  return baseReadsAndWrites + perShelf + rating + review + progress;
}

function deriveUserBookState(row: CanonicalImportRow): "completed" | "reading" | "want_to_read" | "unknown" {
  const exclusive = row.exclusiveShelf ? mapReservedShelf(row.exclusiveShelf) : null;
  if (row.dateRead || exclusive === "finished") {
    return "completed";
  }
  if (exclusive === "currently-reading") {
    return "reading";
  }
  const normalizedShelfIds = row.shelfNames.map((name) => normalizeShelfToken(name));
  if (normalizedShelfIds.includes("to-read") || normalizedShelfIds.includes("want-to-read")) {
    return "want_to_read";
  }
  return "unknown";
}

async function applyCanonicalRow(params: {
  uid: string;
  importId: string;
  row: CanonicalImportRow;
}): Promise<{ bookId: string; shelvesCreated: number; reviewCreated: boolean }> {
  const { uid, importId, row } = params;
  const sessionRef = db.doc(`imports/${uid}/sessions/${importId}`);
  const rowRef = sessionRef.collection("rows").doc(row.rowKey);
  const dedupeRef = db.doc(`imports/${uid}/rowUpserts/${row.rowKey}`);

  let result: { bookId: string; shelvesCreated: number; reviewCreated: boolean } | null = null;

  await db.runTransaction(async (tx) => {
    const rowSnap = await tx.get(rowRef);
    if (rowSnap.exists && rowSnap.data()?.state === "APPLIED") {
      result = {
        bookId: String(rowSnap.data()?.bookId || ""),
        shelvesCreated: Number(rowSnap.data()?.shelvesCreated || 0),
        reviewCreated: Boolean(rowSnap.data()?.reviewCreated),
      };
      return;
    }

    const writesRating = row.rating > 0;
    const writesReview = row.reviewText.length > 0;
    const exclusive = row.exclusiveShelf ? mapReservedShelf(row.exclusiveShelf) : null;
    const writesProgress = exclusive === "currently-reading" || row.dateRead !== null;

    const estimatedOps = estimateLogicalOps({
      shelfCount: row.shelfNames.length,
      writesRating,
      writesReview,
      writesProgress,
    });
    if (estimatedOps > MAX_LOGICAL_OPS_PER_ROW) {
      throw new Error("ROW_OPERATION_BUDGET_EXCEEDED");
    }

    const bookId = await resolveOrCreateBook(tx, row);
    const now = FieldValue.serverTimestamp();
    const addedAt = row.dateAdded || nowIso();
    const shelves = toSessionShelfDocs(uid, row);

    let shelvesCreated = 0;
    for (const shelf of shelves) {
      const shelfRef = db.collection("shelves").doc(shelf.docId);
      const shelfSnap = await tx.get(shelfRef);
      const titleAr =
        shelf.shelfId === "finished"
          ? "انتهيت من قراءته"
          : shelf.shelfId === "want-to-read"
            ? "أرغب في قراءته"
            : "";

      if (!shelfSnap.exists) {
        shelvesCreated += 1;
        tx.set(
          shelfRef,
          {
            id: shelf.shelfId,
            ownerId: uid,
            titleEn: shelf.titleEn,
            titleAr,
            isSystem: shelf.isSystem,
            entries: {},
            createdAt: now,
            updatedAt: now,
          },
          { merge: true }
        );
      }

      tx.set(
        shelfRef,
        {
          id: shelf.shelfId,
          ownerId: uid,
          updatedAt: now,
          [`entries.${bookId}`]: {
            bookId,
            addedAt,
            snapshot: {
              titleEn: row.title,
              titleAr: "",
              coverUrl: "",
            },
          },
        },
        { merge: true }
      );
    }

    if (writesRating) {
      const ratingRef = db.doc(`books/${bookId}/ratings/${uid}`);
      const ratingSnap = await tx.get(ratingRef);
      const ratingCreatedAt = ratingSnap.exists ? ratingSnap.data()?.createdAt || now : now;
      const ratingCreatedAtIso = (() => {
        const raw = ratingSnap.exists ? ratingSnap.data()?.createdAt || now : now;
        if (typeof raw === "string" && raw.trim()) {
          const parsed = new Date(raw);
          if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
        }
        if (raw && typeof raw.toDate === "function") {
          const parsed = raw.toDate();
          if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) {
            return parsed.toISOString();
          }
        }
        return nowIso();
      })();

      tx.set(
        ratingRef,
        {
          id: uid,
          domain: "book",
          bookId,
          bookTitleEn: trimTo(row.title, 300),
          bookTitleAr: "",
          bookAuthorEn: trimTo(row.author, 300),
          bookAuthorAr: "",
          bookCoverThumbUrl: "",
          bookCoverUrl: "",
          userId: uid,
          rating: row.rating,
          source: "goodreads_import",
          visibility: "private",
          parserVersion: PARSER_VERSION,
          updatedAtIso: nowIso(),
          updatedAt: now,
          createdAtIso: ratingCreatedAtIso,
          createdAt: ratingCreatedAt,
        },
        { merge: true }
      );
    }

    let reviewCreated = false;
    if (writesReview) {
      const reviewRef = db.doc(`books/${bookId}/reviews/${uid}`);
      const reviewSnap = await tx.get(reviewRef);
      const createdAt = reviewSnap.exists ? reviewSnap.data()?.createdAt || now : now;
      reviewCreated = !reviewSnap.exists;
      const createdAtIso = (() => {
        const raw = reviewSnap.exists ? reviewSnap.data()?.createdAt || now : now;
        if (typeof raw === "string" && raw.trim()) {
          const parsed = new Date(raw);
          if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
        }
        if (raw && typeof raw.toDate === "function") {
          const parsed = raw.toDate();
          if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) {
            return parsed.toISOString();
          }
        }
        return nowIso();
      })();

      tx.set(
        reviewRef,
        {
          id: uid,
          domain: "book",
          bookId,
          bookTitleEn: trimTo(row.title, 300),
          bookTitleAr: "",
          bookAuthorEn: trimTo(row.author, 300),
          bookAuthorAr: "",
          bookCoverThumbUrl: "",
          bookCoverUrl: "",
          userId: uid,
          rating: row.rating,
          text: row.reviewText,
          source: "goodreads_import",
          visibility: "private",
          parserVersion: PARSER_VERSION,
          updatedAtIso: nowIso(),
          updatedAt: now,
          createdAtIso,
          createdAt,
        },
        { merge: true }
      );
    }

    if (writesProgress) {
      const progressRef = db.doc(`reading_progress/${uid}_${bookId}`);
      const completed = Boolean(row.dateRead || exclusive === "finished");
      tx.set(
        progressRef,
        {
          uid,
          userId: uid,
          bookId,
          progress: completed ? 1 : 0,
          status_state: completed ? "completed" : "reading",
          startedAt: row.dateAdded || nowIso(),
          finishedAt: row.dateRead || null,
          updatedAt: now,
          source: "goodreads_import",
          parserVersion: PARSER_VERSION,
        },
        { merge: true }
      );
    }

    const userBookRef = db.doc(`users/${uid}/userBooks/${bookId}`);
    const userBookSnap = await tx.get(userBookRef);
    const existingCreatedAt = userBookSnap.exists ? userBookSnap.data()?.createdAt : null;
    const userBookShelfIds = Array.from(new Set(shelves.map((s) => s.shelfId))).sort();

    tx.set(
      userBookRef,
      {
        id: bookId,
        bookId,
        uid,
        userId: uid,
        source: "goodreads_import",
        parserVersion: PARSER_VERSION,
        titleEn: row.title,
        titleAr: "",
        authorEn: row.author,
        authorAr: "",
        rating: row.rating,
        reviewText: row.reviewText || null,
        shelfIds: userBookShelfIds,
        status_state: deriveUserBookState(row),
        dateAdded: row.dateAdded,
        dateRead: row.dateRead,
        updatedAt: now,
        createdAt: existingCreatedAt || now,
      },
      { merge: true }
    );

    tx.set(
      rowRef,
      {
        rowKey: row.rowKey,
        rowIndex: row.rowIndex,
        identityKey: row.identityKey,
        sourceKind: row.sourceKind,
        rawPointer: row.rawPointer,
        validationStatus: row.validationStatus,
        state: "APPLIED",
        bookId,
        shelvesCreated,
        reviewCreated,
        updatedAt: now,
      },
      { merge: true }
    );

    tx.set(
      dedupeRef,
      {
        rowKey: row.rowKey,
        identityKey: row.identityKey,
        sourceKind: row.sourceKind,
        bookId,
        lastImportId: importId,
        lastAppliedAt: now,
      },
      { merge: true }
    );

    result = {
      bookId,
      shelvesCreated,
      reviewCreated,
    };
  });

  if (!result) {
    throw new Error("ROW_APPLY_RESULT_MISSING");
  }
  return result;
}

async function persistIssue(params: {
  uid: string;
  importId: string;
  issue: ParseIssue;
  ordinal: number;
}): Promise<void> {
  const { uid, importId, issue, ordinal } = params;
  if (ordinal > MAX_ERRORS_PERSISTED) {
    return;
  }
  const errorRef = db.doc(
    `imports/${uid}/sessions/${importId}/errors/${String(ordinal).padStart(6, "0")}`
  );
  await errorRef.set(
    {
      ...issue,
      recordedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function cleanupImportSource(params: {
  uid: string;
  importId: string;
  sourcePath: string;
  terminalStatus: Extract<SessionStatus, "COMPLETE" | "FAILED">;
}): Promise<void> {
  const { uid, importId, sourcePath, terminalStatus } = params;
  if (!sourcePath) {
    return;
  }

  const sessionRef = db.doc(`imports/${uid}/sessions/${importId}`);

  try {
    const file = bucket.file(sourcePath);
    const [exists] = await file.exists();
    if (exists) {
      await file.delete();
    }

    await sessionRef.set(
      {
        source: {
          cleanup: {
            status: "DELETED",
            deletedAt: nowIso(),
            terminalStatus,
          },
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("[GOODREADS_IMPORT][SOURCE_CLEANUP_FAILED]", {
      uid,
      importId,
      sourcePath,
      terminalStatus,
      error: message,
    });

    await sessionRef.set(
      {
        source: {
          cleanup: {
            status: "DELETE_FAILED",
            error: trimTo(message, 500),
            attemptedAt: nowIso(),
            terminalStatus,
          },
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
}

async function updateSessionProgress(params: {
  uid: string;
  importId: string;
  counters: ProcessingCounters;
  lastCheckpoint: { rowIndex: number; rowKey: string } | null;
}): Promise<void> {
  const { uid, importId, counters, lastCheckpoint } = params;
  const sessionRef = db.doc(`imports/${uid}/sessions/${importId}`);
  await sessionRef.set(
    {
      status: "PROCESSING",
      progress: counters,
      heartbeatAt: FieldValue.serverTimestamp(),
      leaseExpiresAt: Timestamp.fromMillis(Date.now() + WORKER_LEASE_MS),
      lastCheckpoint:
        lastCheckpoint === null
          ? null
          : {
            ...lastCheckpoint,
            updatedAt: nowIso(),
          },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function writeImmutableSummary(params: {
  uid: string;
  importId: string;
  counters: ProcessingCounters;
  status: SessionStatus;
  booksImported: number;
  shelvesCreated: number;
  reviewsImported: number;
  detectedSourceKind: DetectedSourceKind;
}): Promise<string> {
  const {
    uid,
    importId,
    counters,
    status,
    booksImported,
    shelvesCreated,
    reviewsImported,
    detectedSourceKind,
  } = params;
  const summaryRef = db.doc(`imports/${uid}/summaries/${importId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(summaryRef);
    if (snap.exists) return;
    tx.set(summaryRef, {
      importId,
      uid,
      status,
      parserVersion: PARSER_VERSION,
      stateMachineVersion: STATE_MACHINE_VERSION,
      detectedSourceKind,
      processed: counters.processed,
      succeeded: counters.succeeded,
      failed: counters.failed,
      booksImported,
      shelvesCreated,
      reviewsImported,
      immutable: true,
      finalizedAt: FieldValue.serverTimestamp(),
      createdAt: nowIso(),
    });
  });
  return summaryRef.path;
}

async function claimSessionLease(uid: string, importId: string): Promise<boolean> {
  const sessionRef = db.doc(`imports/${uid}/sessions/${importId}`);
  const workerId = randomUUID();
  const now = Date.now();

  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(sessionRef);
    if (!snap.exists) return false;
    const data = snap.data() as Record<string, unknown>;
    const status = String(data.status || "");

    const leaseExpiresAtRaw = data.leaseExpiresAt;
    const leaseExpiresAt =
      leaseExpiresAtRaw instanceof Timestamp ? leaseExpiresAtRaw.toMillis() : 0;

    const isLeaseExpired = leaseExpiresAt > 0 && leaseExpiresAt < now;
    const canClaim = status === "QUEUED" || (status === "PROCESSING" && isLeaseExpired);
    if (!canClaim) return false;

    tx.set(
      sessionRef,
      {
        status: "PROCESSING",
        worker: {
          workerId,
          claimedAt: FieldValue.serverTimestamp(),
        },
        leaseExpiresAt: Timestamp.fromMillis(now + WORKER_LEASE_MS),
        startedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return true;
  });

  return claimed;
}

function classifyApplyFailure(message: string): string {
  if (message.includes("LOW_CONFIDENCE_MATCH_REJECTED")) {
    return "LOW_CONFIDENCE_MATCH_REJECTED";
  }
  if (message.includes("AMBIGUOUS_ISBN13_MATCH") || message.includes("AMBIGUOUS_ISBN10_MATCH")) {
    return "AMBIGUOUS_CANONICAL_MATCH";
  }
  if (message.includes("ROW_OPERATION_BUDGET_EXCEEDED")) {
    return "ROW_OPERATION_BUDGET_EXCEEDED";
  }
  return "ROW_APPLY_FAILED";
}

async function* iterateSourceRows(params: {
  sourcePath: string;
  fileType: ImportFileType;
  detectedSourceKind: DetectedSourceKind;
  csvEntryName?: string;
}): AsyncGenerator<CanonicalImportRow | ParseIssue> {
  if (params.detectedSourceKind === "CSV") {
    yield* iterateCsvCanonicalRows({
      bucket,
      sourcePath: params.sourcePath,
      fileType: params.fileType,
      preferredCsvEntryName: params.csvEntryName,
    });
    return;
  }

  yield* iterateDsarCanonicalRows({
    bucket,
    sourcePath: params.sourcePath,
  });
}

async function processQueuedSession(uid: string, importId: string): Promise<void> {
  const sessionRef = db.doc(`imports/${uid}/sessions/${importId}`);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    logger.warn("[GOODREADS_IMPORT][SESSION_MISSING]", { uid, importId });
    return;
  }

  const session = sessionSnap.data() as Record<string, unknown>;
  const source = session.source as Record<string, unknown> | undefined;
  const sourcePath = typeof source?.path === "string" ? source.path : "";
  const fileType = (source?.fileType as ImportFileType | undefined) || "csv";
  const detectedSourceKind = (source?.detectedKind as DetectedSourceKind | undefined) || "CSV";
  const csvEntryName = typeof source?.csvEntryName === "string" ? source.csvEntryName : undefined;

  if (!sourcePath) {
    await sessionRef.set(
      {
        status: "FAILED",
        failure: {
          code: "SOURCE_PATH_MISSING",
          message: "Import source path is missing.",
          at: nowIso(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }

  const counters: ProcessingCounters = {
    processed: 0,
    succeeded: 0,
    failed: 0,
  };
  const importedBookIds = new Set<string>();
  let shelvesCreated = 0;
  let reviewsImported = 0;
  let ambiguityFailures = 0;

  let checkpoint: { rowIndex: number; rowKey: string } | null = null;
  let persistedErrors = 0;

  logger.info("[GOODREADS_IMPORT][PROCESS_START]", {
    uid,
    importId,
    sourcePath,
    fileType,
    detectedSourceKind,
    parserVersion: PARSER_VERSION,
  });

  try {
    for await (const rowOrIssue of iterateSourceRows({
      sourcePath,
      fileType,
      detectedSourceKind,
      csvEntryName,
    })) {
      counters.processed += 1;

      if (isParseIssue(rowOrIssue)) {
        counters.failed += 1;
        persistedErrors += 1;
        await persistIssue({
          uid,
          importId,
          issue: rowOrIssue,
          ordinal: persistedErrors,
        });
      } else {
        try {
          const applied = await applyCanonicalRow({
            uid,
            importId,
            row: rowOrIssue,
          });
          checkpoint = {
            rowIndex: rowOrIssue.rowIndex,
            rowKey: rowOrIssue.rowKey,
          };
          importedBookIds.add(applied.bookId);
          shelvesCreated += applied.shelvesCreated;
          if (applied.reviewCreated) {
            reviewsImported += 1;
          }
          counters.succeeded += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const code = classifyApplyFailure(message);
          if (code === "AMBIGUOUS_CANONICAL_MATCH") {
            ambiguityFailures += 1;
          }
          counters.failed += 1;
          persistedErrors += 1;
          await persistIssue({
            uid,
            importId,
            issue: toIssue(rowOrIssue.rowIndex, rowOrIssue.rowKey, code, message),
            ordinal: persistedErrors,
          });
        }
      }

      if (counters.processed % CHECKPOINT_INTERVAL === 0) {
        await updateSessionProgress({
          uid,
          importId,
          counters,
          lastCheckpoint: checkpoint,
        });
      }
    }

    const summaryRefPath = await writeImmutableSummary({
      uid,
      importId,
      counters,
      status: "COMPLETE",
      booksImported: importedBookIds.size,
      shelvesCreated,
      reviewsImported,
      detectedSourceKind,
    });

    await sessionRef.set(
      {
        status: "COMPLETE",
        progress: counters,
        summary: {
          booksImported: importedBookIds.size,
          shelvesCreated,
          reviewsImported,
          parserVersion: PARSER_VERSION,
        },
        summaryImmutableRef: summaryRefPath,
        completedAt: FieldValue.serverTimestamp(),
        lastCheckpoint:
          checkpoint === null
            ? null
            : {
              ...checkpoint,
              updatedAt: nowIso(),
            },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await cleanupImportSource({
      uid,
      importId,
      sourcePath,
      terminalStatus: "COMPLETE",
    });

    logger.info("[GOODREADS_IMPORT][PROCESS_COMPLETE]", {
      uid,
      importId,
      ...counters,
      booksImported: importedBookIds.size,
      shelvesCreated,
      reviewsImported,
      ambiguityFailures,
      rowFailureRate: counters.processed > 0 ? counters.failed / counters.processed : 0,
      parserVersion: PARSER_VERSION,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failureCode = message.startsWith("SCHEMA_VALIDATION_FAILED")
      ? "SCHEMA_VALIDATION_FAILED"
      : message.startsWith("UNSUPPORTED_SOURCE_FORMAT")
        ? "UNSUPPORTED_SOURCE_FORMAT"
        : "IMPORT_PROCESSING_FAILED";

    const summaryRefPath = await writeImmutableSummary({
      uid,
      importId,
      counters,
      status: "FAILED",
      booksImported: importedBookIds.size,
      shelvesCreated,
      reviewsImported,
      detectedSourceKind,
    });

    await sessionRef.set(
      {
        status: "FAILED",
        progress: counters,
        failure: {
          code: failureCode,
          message,
          at: nowIso(),
        },
        summaryImmutableRef: summaryRefPath,
        failedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await cleanupImportSource({
      uid,
      importId,
      sourcePath,
      terminalStatus: "FAILED",
    });

    logger.error("[GOODREADS_IMPORT][PROCESS_FAILED]", {
      uid,
      importId,
      ...counters,
      error: message,
      failureCode,
      parserVersion: PARSER_VERSION,
    });
  }
}

export const startGoodreadsImport = onCall<GoodreadsStartRequest>(
  { cors: true, timeoutSeconds: 60, memory: "256MiB" },
  async (request): Promise<GoodreadsStartResponse> => {
    ensureFeatureEnabled();

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const uid = request.auth.uid;
    const fileName = normalizeFileName(request.data?.fileName);
    const fileType = toImportFileType(fileName);
    const fileSize = normalizeFileSize(request.data?.fileSize);
    const mimeType = normalizeMimeType(request.data?.mimeType);
    const idempotencyKey = normalizeIdempotencyKey(request.data?.idempotencyKey);
    const sourceKind = normalizeSourceKind(request.data?.sourceKind);
    const contentSha256 = normalizeContentSha256(request.data?.contentSha256);

    if (mimeType && !isAllowedMime(fileType, mimeType)) {
      throw new HttpsError("invalid-argument", "Unsupported MIME type for import.");
    }

    const idempotencyRef = db.doc(`imports/${uid}/idempotency/${idempotencyKey}`);
    const now = Date.now();

    const reservation = await db.runTransaction(async (tx) => {
      const existing = await tx.get(idempotencyRef);
      if (existing.exists) {
        const existingImportId = String(existing.data()?.importId || "");
        if (!existingImportId) {
          throw new HttpsError("failed-precondition", "Corrupted idempotency reservation.");
        }

        tx.set(
          idempotencyRef,
          {
            lastRequestedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        return {
          importId: existingImportId,
          existingSession: true,
        };
      }

      const importId = `gr_${randomUUID().replace(/-/g, "")}`;
      const sessionRef = db.doc(`imports/${uid}/sessions/${importId}`);
      const sourcePath = `imports/${uid}/${importId}/source.${fileType}`;
      const summaryRefPath = `imports/${uid}/summaries/${importId}`;

      tx.set(
        sessionRef,
        {
          importId,
          uid,
          idempotencyKey,
          stateMachineVersion: STATE_MACHINE_VERSION,
          parserVersion: PARSER_VERSION,
          summaryImmutableRef: summaryRefPath,
          status: "RECEIVED" as SessionStatus,
          source: {
            path: sourcePath,
            fileName,
            fileType,
            requestedKind: sourceKind,
            expectedSize: fileSize,
            expectedMimeType: mimeType || null,
            integrity: {
              clientSha256: contentSha256,
            },
          },
          progress: {
            processed: 0,
            succeeded: 0,
            failed: 0,
          },
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      tx.set(
        idempotencyRef,
        {
          idempotencyKey,
          importId,
          uid,
          createdAt: FieldValue.serverTimestamp(),
          lastRequestedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return {
        importId,
        existingSession: false,
      };
    });

    const sessionRef = db.doc(`imports/${uid}/sessions/${reservation.importId}`);
    const snap = await sessionRef.get();
    if (!snap.exists) {
      throw new HttpsError("internal", "Import session not found after reservation.");
    }
    const session = snap.data() as Record<string, unknown>;
    const sessionStatus = String(session.status || "");
    const source = session.source as Record<string, unknown>;
    const sourcePath = String(source?.path || "");
    if (!sourcePath) {
      throw new HttpsError("internal", "Import session missing source path.");
    }
    if (reservation.existingSession && !canIssueUploadForStatus(sessionStatus)) {
      throw new HttpsError(
        "failed-precondition",
        `Import session is immutable once it leaves upload stage. Current status: ${sessionStatus}.`
      );
    }

    const effectiveMimeType = mimeType || (fileType === "csv" ? "text/csv" : "application/zip");
    const [uploadUrl] = await bucket.file(sourcePath).getSignedUrl({
      action: "write",
      version: "v4",
      contentType: effectiveMimeType,
      expires: now + SIGNED_UPLOAD_TTL_MS,
    });

    await sessionRef.set(
      {
        status: "UPLOADING",
        upload: {
          urlIssuedAt: FieldValue.serverTimestamp(),
          expiresAt: Timestamp.fromMillis(now + SIGNED_UPLOAD_TTL_MS),
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    logger.info("[GOODREADS_IMPORT][SESSION_STARTED]", {
      uid,
      importId: reservation.importId,
      fileType,
      fileSize,
      existingSession: reservation.existingSession,
      parserVersion: PARSER_VERSION,
    });

    return {
      importId: reservation.importId,
      status: "UPLOADING",
      uploadUrl,
      uploadMethod: "PUT" as const,
      uploadHeaders: {
        "Content-Type": effectiveMimeType,
      },
      expiresAt: new Date(now + SIGNED_UPLOAD_TTL_MS).toISOString(),
      existingSession: reservation.existingSession,
    };
  }
);

export const finalizeGoodreadsImport = onCall<GoodreadsFinalizeRequest>(
  { cors: true, timeoutSeconds: 60, memory: "256MiB" },
  async (request): Promise<GoodreadsFinalizeResponse> => {
    ensureFeatureEnabled();

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const uid = request.auth.uid;
    const importId = typeof request.data?.importId === "string" ? request.data.importId.trim() : "";
    if (!importId) {
      throw new HttpsError("invalid-argument", "Missing importId.");
    }

    const sessionRef = db.doc(`imports/${uid}/sessions/${importId}`);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) {
      throw new HttpsError("not-found", "Import session not found.");
    }

    const session = sessionSnap.data() as Record<string, unknown>;
    const sessionStatus = String(session.status || "");
    const source = session.source as Record<string, unknown> | undefined;
    const sourcePath = typeof source?.path === "string" ? source.path : "";
    const fileType = (source?.fileType as ImportFileType | undefined) || "csv";
    const requestedKind = (source?.requestedKind as SourceKind | undefined) || "AUTO";
    const expectedSize = typeof source?.expectedSize === "number" ? Math.trunc(source.expectedSize) : 0;
    const expectedClientSha =
      source?.integrity && typeof (source.integrity as Record<string, unknown>).clientSha256 === "string"
        ? String((source.integrity as Record<string, unknown>).clientSha256)
        : null;

    if (!sourcePath) {
      throw new HttpsError("failed-precondition", "Import source path missing.");
    }
    if (
      (sessionStatus === "QUEUED" || sessionStatus === "PROCESSING") &&
      (source?.detectedKind === "CSV" || source?.detectedKind === "DSAR_JSON")
    ) {
      return {
        importId,
        status: "QUEUED",
        detectedSourceKind: source.detectedKind as DetectedSourceKind,
        parserVersion: PARSER_VERSION,
      };
    }
    if (sessionStatus === "COMPLETE" || sessionStatus === "FAILED") {
      throw new HttpsError(
        "failed-precondition",
        `Import session is immutable after terminal state. Current status: ${sessionStatus}.`
      );
    }
    if (!canIssueUploadForStatus(sessionStatus)) {
      throw new HttpsError(
        "failed-precondition",
        `Import session cannot be finalized from status ${sessionStatus}.`
      );
    }

    const file = bucket.file(sourcePath);
    const [exists] = await file.exists();
    if (!exists) {
      throw new HttpsError("failed-precondition", "Uploaded source file is missing.");
    }

    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size || 0);
    const contentType = String(metadata.contentType || "").toLowerCase();

    if (!Number.isFinite(size) || size <= 0) {
      throw new HttpsError("failed-precondition", "Uploaded source file is empty.");
    }
    if (size > MAX_SOURCE_BYTES) {
      throw new HttpsError("resource-exhausted", "Uploaded source exceeds limit.");
    }
    if (expectedSize > 0 && size !== expectedSize) {
      throw new HttpsError("failed-precondition", "Uploaded file size does not match request.");
    }
    if (contentType && !isAllowedMime(fileType, contentType)) {
      throw new HttpsError("failed-precondition", "Uploaded file MIME type is not allowed.");
    }

    const [sourceBuffer] = await file.download();
    const detection = detectSourceKind({
      fileType,
      buffer: sourceBuffer,
    });

    if (requestedKind === "CSV" && detection.detectedKind !== "CSV") {
      throw new HttpsError("failed-precondition", "Requested CSV source but uploaded file is not CSV-compatible.");
    }
    if (requestedKind === "DSAR_JSON" && detection.detectedKind !== "DSAR_JSON") {
      throw new HttpsError("failed-precondition", "Requested DSAR_JSON source but uploaded file is not DSAR-compatible.");
    }

    const serverSha256 = sha256ForBuffer(sourceBuffer);
    if (expectedClientSha && expectedClientSha !== serverSha256) {
      throw new HttpsError("failed-precondition", "Uploaded file digest does not match contentSha256.");
    }

    await sessionRef.set(
      {
        status: "QUEUED",
        source: {
          uploadedSize: size,
          uploadedMimeType: contentType || null,
          detectedKind: detection.detectedKind,
          csvEntryName: detection.csvEntryName || null,
          integrity: {
            clientSha256: expectedClientSha,
            serverSha256,
            digestMatched: expectedClientSha ? expectedClientSha === serverSha256 : null,
          },
        },
        queuedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    logger.info("[GOODREADS_IMPORT][SESSION_QUEUED]", {
      uid,
      importId,
      fileType,
      size,
      contentType,
      detectedSourceKind: detection.detectedKind,
      parserVersion: PARSER_VERSION,
    });

    return {
      importId,
      status: "QUEUED" as const,
      detectedSourceKind: detection.detectedKind,
      parserVersion: PARSER_VERSION,
    };
  }
);

export const processGoodreadsImportSessions = onDocumentWritten(
  {
    document: "imports/{uid}/sessions/{importId}",
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async (event) => {
    if (!GOODREADS_IMPORT_V2_ENABLED) {
      return;
    }

    const uid = event.params.uid;
    const importId = event.params.importId;
    const after = event.data?.after?.data() as Record<string, unknown> | undefined;

    if (!after) return;

    const status = String(after.status || "");
    if (status !== "QUEUED" && status !== "PROCESSING") {
      return;
    }

    const claimed = await claimSessionLease(uid, importId);
    if (!claimed) {
      return;
    }

    await processQueuedSession(uid, importId);
  }
);
