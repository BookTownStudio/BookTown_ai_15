import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldPath } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import { assertActiveAuthenticatedUser, assertRoleFromClaims } from "../shared/auth";
import {
  evaluateProjectionCertification,
  MAX_RECOVERY_BATCH_SIZE,
  type RecoveryMode,
  type RecoveryRequest,
  type RecoveryScope,
  type VerificationResult,
} from "../operations/projectionRecoveryControlPlane";
import {
  completeRecoveryRun,
  failRecoveryRun,
  startRecoveryRun,
} from "../operations/recoveryRunManager";
import {
  buildRecoveryCheckpointId,
  readRecoveryCheckpoint,
  updateRecoveryCheckpointProgress,
} from "../operations/projectionCheckpointManager";
import { recordProjectionFailure } from "../operations/projectionFailureLedger";
import {
  createVerificationResult,
  writeVerificationResult,
} from "../operations/projectionVerificationReports";
import {
  updateProjectionHealthFromFailure,
  updateProjectionHealthFromRecoverySummary,
  updateProjectionHealthFromVerification,
} from "../operations/projectionHealthManager";
import { getProjectionDefinition } from "../operations/projectionRegistry";

const db = admin.firestore();

const PROJECTION_NAME = "book_stats";
const CATALOG_PROJECTION_NAME = "book_catalog_counter_projection";
const DEFAULT_BATCH_SIZE = 100;
const HARD_MAX_BATCH_SIZE = 100;
const AUTHORITY_PAGE_SIZE = 500;
const MAX_AUTHORITY_DOCS_PER_BOOK = 10000;

type BookStatsScope = "single_book" | "owner" | "collection_page" | "checkpointed_full";
type ReconciliationMode = "report_only" | "repair";

type BookStatsRecoveryRequest = {
  mode?: RecoveryMode;
  scope: BookStatsScope;
  bookId?: string;
  ownerId?: string;
  cursor?: string;
  checkpointId?: string;
  batchSize?: number;
  maxDocs?: number;
  verify?: boolean;
  reconciliationMode?: ReconciliationMode;
  requestedBy?: string;
  reason?: string;
  correlationId?: string;
};

type Candidate = {
  bookId: string;
  authorityPath: string;
};

export type ExpectedBookStatsCounters = {
  reviews: number;
  ratingsCount: number;
  ratingSum: number;
  averageRating: number;
};

function readString(value: unknown, maxLen: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLen) : "";
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readPositiveInt(value: unknown, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(max, Math.trunc(value)));
}

function readCounter(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function readRating(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const rating = Math.trunc(numeric);
  return rating >= 1 && rating <= 5 ? rating : null;
}

function readFloat(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function normalizeRequest(
  raw: unknown,
  fallbackUid: string
): Required<
  Pick<
    BookStatsRecoveryRequest,
    "mode" | "scope" | "batchSize" | "maxDocs" | "verify" | "reconciliationMode" | "requestedBy" | "reason"
  >
> &
  Omit<
    BookStatsRecoveryRequest,
    "mode" | "scope" | "batchSize" | "maxDocs" | "verify" | "reconciliationMode" | "requestedBy" | "reason"
  > {
  const input =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const scope = readString(input.scope, 40) as BookStatsScope;
  if (
    scope !== "single_book" &&
    scope !== "owner" &&
    scope !== "collection_page" &&
    scope !== "checkpointed_full"
  ) {
    throw new HttpsError("invalid-argument", "Invalid book stats recovery scope.");
  }
  const mode: RecoveryMode = readString(input.mode, 20) === "write" ? "write" : "dry_run";
  const reconciliationRaw = readString(input.reconciliationMode, 20);
  const reconciliationMode: ReconciliationMode =
    reconciliationRaw === "repair" || (mode === "write" && reconciliationRaw !== "report_only")
      ? "repair"
      : "report_only";
  const reason = readString(input.reason, 500);
  if (!reason) throw new HttpsError("invalid-argument", "reason is required.");

  return {
    mode,
    scope,
    bookId: readString(input.bookId, 180) || undefined,
    ownerId: readString(input.ownerId, 128) || undefined,
    cursor: readString(input.cursor, 500) || undefined,
    checkpointId: readString(input.checkpointId, 500) || undefined,
    batchSize: readPositiveInt(input.batchSize, DEFAULT_BATCH_SIZE, HARD_MAX_BATCH_SIZE),
    maxDocs: readPositiveInt(input.maxDocs, DEFAULT_BATCH_SIZE, MAX_RECOVERY_BATCH_SIZE),
    verify: readBoolean(input.verify, true),
    reconciliationMode,
    requestedBy: readString(input.requestedBy, 128) || fallbackUid,
    reason,
    correlationId: readString(input.correlationId, 128) || undefined,
  };
}

function toRecoveryScope(scope: BookStatsScope): RecoveryScope {
  if (scope === "single_book") return "single_doc";
  return scope;
}

function buildRecoveryRequest(input: ReturnType<typeof normalizeRequest>): RecoveryRequest {
  return {
    projectionName: PROJECTION_NAME,
    mode: input.mode,
    scope: toRecoveryScope(input.scope),
    targetId: input.bookId,
    ownerId: input.ownerId,
    cursor: input.cursor,
    checkpointId: input.checkpointId,
    batchSize: input.batchSize,
    maxDocs: input.maxDocs,
    verify: input.verify,
    requestedBy: input.requestedBy,
    reason: input.reason,
    correlationId: input.correlationId,
  };
}

function addCandidate(map: Map<string, Candidate>, bookId: string, authorityPath: string): void {
  if (!bookId) return;
  map.set(bookId, { bookId, authorityPath });
}

async function loadReviewBookCandidates(
  query: FirebaseFirestore.Query,
  limit: number
): Promise<{ candidates: Candidate[]; nextCursor: string | null; lastPath: string | null }> {
  const snap = await query.limit(limit).get();
  const map = new Map<string, Candidate>();
  for (const doc of snap.docs) {
    addCandidate(map, readString(doc.get("bookId"), 180), doc.ref.path);
  }
  return {
    candidates: [...map.values()],
    nextCursor: snap.size === limit ? snap.docs[snap.docs.length - 1].id : null,
    lastPath: snap.docs[snap.docs.length - 1]?.ref.path ?? null,
  };
}

async function loadBookCandidates(
  query: FirebaseFirestore.Query,
  limit: number
): Promise<{ candidates: Candidate[]; nextCursor: string | null; lastPath: string | null }> {
  const snap = await query.limit(limit).get();
  return {
    candidates: snap.docs.map((doc) => ({ bookId: doc.id, authorityPath: doc.ref.path })),
    nextCursor: snap.size === limit ? snap.docs[snap.docs.length - 1].id : null,
    lastPath: snap.docs[snap.docs.length - 1]?.ref.path ?? null,
  };
}

async function loadCandidates(request: ReturnType<typeof normalizeRequest>): Promise<{
  candidates: Candidate[];
  nextCursor: string | null;
  checkpointId: string | null;
  lastProcessedPath: string | null;
}> {
  if (request.scope === "single_book") {
    if (!request.bookId) throw new HttpsError("invalid-argument", "bookId is required.");
    return {
      candidates: [{ bookId: request.bookId, authorityPath: `books/${request.bookId}` }],
      nextCursor: null,
      checkpointId: null,
      lastProcessedPath: `books/${request.bookId}`,
    };
  }

  const limit = Math.min(request.batchSize, request.maxDocs, HARD_MAX_BATCH_SIZE);
  let cursor = request.cursor;
  let checkpointId: string | null = null;
  if (request.scope === "checkpointed_full") {
    checkpointId =
      request.checkpointId ||
      buildRecoveryCheckpointId({ projectionName: PROJECTION_NAME, scope: "checkpointed_full" });
    const checkpoint = await readRecoveryCheckpoint(checkpointId);
    cursor = request.cursor || checkpoint?.cursor || undefined;
  }

  if (request.scope === "owner") {
    if (!request.ownerId) throw new HttpsError("invalid-argument", "ownerId is required.");
    const rawCursor = cursor || "uid:";
    const [phase, docId = ""] = rawCursor.split(":", 2);
    if (phase === "userId") {
      const base = db
        .collection("reviews")
        .where("userId", "==", request.ownerId)
        .orderBy(FieldPath.documentId());
      const loaded = await loadReviewBookCandidates(docId ? base.startAfter(docId) : base, limit);
      return {
        candidates: loaded.candidates,
        nextCursor: loaded.nextCursor ? `userId:${loaded.nextCursor}` : null,
        checkpointId: null,
        lastProcessedPath: loaded.lastPath,
      };
    }
    const base = db
      .collection("reviews")
      .where("uid", "==", request.ownerId)
      .orderBy(FieldPath.documentId());
    const loaded = await loadReviewBookCandidates(docId ? base.startAfter(docId) : base, limit);
    return {
      candidates: loaded.candidates,
      nextCursor: loaded.nextCursor ? `uid:${loaded.nextCursor}` : "userId:",
      checkpointId: null,
      lastProcessedPath: loaded.lastPath,
    };
  }

  if (request.scope === "collection_page") {
    const base = db.collection("book_stats").orderBy(FieldPath.documentId());
    const loaded = await loadBookCandidates(cursor ? base.startAfter(cursor) : base, limit);
    return {
      candidates: loaded.candidates.map((candidate) => ({
        ...candidate,
        authorityPath: `book_stats/${candidate.bookId}`,
      })),
      nextCursor: loaded.nextCursor,
      checkpointId: null,
      lastProcessedPath: loaded.lastPath,
    };
  }

  const base = db.collection("books").orderBy(FieldPath.documentId());
  const loaded = await loadBookCandidates(cursor ? base.startAfter(cursor) : base, limit);
  return {
    candidates: loaded.candidates,
    nextCursor: loaded.nextCursor,
    checkpointId,
    lastProcessedPath: loaded.lastPath,
  };
}

export async function computeExpectedBookStats(bookId: string): Promise<ExpectedBookStatsCounters> {
  let reviews = 0;
  let ratingsCount = 0;
  let ratingSum = 0;
  let cursor: string | null = null;
  let scanned = 0;

  while (true) {
    let query = db
      .collection("reviews")
      .where("bookId", "==", bookId)
      .where("status", "==", "active")
      .where("visibility", "==", "public")
      .orderBy(FieldPath.documentId())
      .limit(AUTHORITY_PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    scanned += snap.size;
    if (scanned > MAX_AUTHORITY_DOCS_PER_BOOK) {
      throw new HttpsError(
        "resource-exhausted",
        `Book review authority exceeds bounded recovery cap:${MAX_AUTHORITY_DOCS_PER_BOOK}`
      );
    }
    for (const doc of snap.docs) {
      reviews += 1;
      const rating = readRating(doc.get("rating"));
      if (rating !== null) {
        ratingsCount += 1;
        ratingSum += rating;
      }
    }
    if (snap.size < AUTHORITY_PAGE_SIZE) break;
    cursor = snap.docs[snap.docs.length - 1].id;
  }

  return {
    reviews,
    ratingsCount,
    ratingSum,
    averageRating: ratingsCount > 0 ? Number((ratingSum / ratingsCount).toFixed(4)) : 0,
  };
}

function nestedCounters(data: Record<string, unknown>): Record<string, unknown> {
  return data.counters && typeof data.counters === "object"
    ? (data.counters as Record<string, unknown>)
    : {};
}

export function bookStatsMatches(
  expected: ExpectedBookStatsCounters,
  stats: Record<string, unknown>
): boolean {
  const counters = nestedCounters(stats);
  return (
    readCounter(stats.reviews) === expected.reviews &&
    readCounter(stats.ratingsCount) === expected.ratingsCount &&
    Math.abs(readFloat(stats.ratingSum) - expected.ratingSum) <= 0.0001 &&
    Math.abs(readFloat(stats.averageRating) - expected.averageRating) <= 0.0001 &&
    readCounter(counters.reviews) === expected.reviews &&
    readCounter(counters.ratingsCount) === expected.ratingsCount &&
    Math.abs(readFloat(counters.ratingSum) - expected.ratingSum) <= 0.0001 &&
    Math.abs(readFloat(counters.averageRating) - expected.averageRating) <= 0.0001
  );
}

export function catalogCountersMatch(
  expected: ExpectedBookStatsCounters,
  book: Record<string, unknown>
): boolean {
  return (
    Math.abs(readFloat(book.rating) - expected.averageRating) <= 0.0001 &&
    readCounter(book.ratingsCount) === expected.ratingsCount &&
    readCounter(book.reviewCount) === expected.reviews &&
    readCounter(book.reviewsCount) === expected.reviews
  );
}

async function writeExactBookCounters(bookId: string, expected: ExpectedBookStatsCounters): Promise<void> {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(
    db.collection("book_stats").doc(bookId),
    {
      counters: {
        reviews: expected.reviews,
        ratingsCount: expected.ratingsCount,
        ratingSum: expected.ratingSum,
        averageRating: expected.averageRating,
      },
      reviews: expected.reviews,
      ratingsCount: expected.ratingsCount,
      ratingSum: expected.ratingSum,
      averageRating: expected.averageRating,
      lastRecoveredAt: now,
      lastUpdatedAt: now,
      updatedAt: now,
    },
    { merge: true }
  );
  batch.set(
    db.collection("books").doc(bookId),
    {
      rating: expected.averageRating,
      ratingsCount: expected.ratingsCount,
      reviewCount: expected.reviews,
      reviewsCount: expected.reviews,
      updatedAt: now,
    },
    { merge: true }
  );
  await batch.commit();
}

async function recordFailure(params: {
  candidate: Candidate;
  projectionName: string;
  projectionCollection: string;
  operation: "verify" | "reconcile";
  message: string;
  failureClass?: "validation_failed" | "write_failed" | "authority_missing";
  correlationId?: string;
}) {
  const failure = await recordProjectionFailure({
    projectionName: params.projectionName,
    projectionCollection: params.projectionCollection,
    triggerName: "recoverBookStats",
    sourcePath: params.candidate.authorityPath,
    sourceEventId: `book_stats:${params.candidate.bookId}`,
    operation: params.operation,
    failureClass: params.failureClass ?? "validation_failed",
    lastErrorMessage: params.message,
    correlationId: params.correlationId,
  });
  await updateProjectionHealthFromFailure(failure);
  return failure.failureId;
}

async function verifyCandidates(
  candidates: Candidate[],
  request: ReturnType<typeof normalizeRequest>,
  verificationId: string
): Promise<VerificationResult[]> {
  let scanned = 0;
  let matchedStats = 0;
  let matchedCatalog = 0;
  let missingStats = 0;
  let staleStats = 0;
  let statsMismatch = 0;
  let orphanStats = 0;
  let missingCatalog = 0;
  let staleCatalog = 0;
  let catalogMismatch = 0;
  const statsFailures: VerificationResult["sampleFailures"] = [];
  const catalogFailures: VerificationResult["sampleFailures"] = [];

  for (const candidate of candidates) {
    scanned += 1;
    const [bookSnap, statsSnap, expected] = await Promise.all([
      db.collection("books").doc(candidate.bookId).get(),
      db.collection("book_stats").doc(candidate.bookId).get(),
      computeExpectedBookStats(candidate.bookId),
    ]);
    if (!bookSnap.exists && statsSnap.exists) {
      orphanStats += 1;
      statsFailures.push({
        authorityPath: candidate.authorityPath,
        projectionPath: `book_stats/${candidate.bookId}`,
        reason: "orphan_book_stats",
      });
      catalogFailures.push({
        authorityPath: candidate.authorityPath,
        projectionPath: `books/${candidate.bookId}`,
        reason: "missing_book_for_catalog_counter_projection",
      });
      continue;
    }
    if (!statsSnap.exists) {
      missingStats += 1;
      statsFailures.push({
        authorityPath: candidate.authorityPath,
        projectionPath: `book_stats/${candidate.bookId}`,
        reason: "missing_book_stats",
      });
    } else if (bookStatsMatches(expected, statsSnap.data() || {})) {
      matchedStats += 1;
    } else {
      staleStats += 1;
      statsMismatch += 1;
      statsFailures.push({
        authorityPath: candidate.authorityPath,
        projectionPath: `book_stats/${candidate.bookId}`,
        reason: "book_stats_counter_drift",
      });
    }

    if (!bookSnap.exists) {
      missingCatalog += 1;
      catalogFailures.push({
        authorityPath: candidate.authorityPath,
        projectionPath: `books/${candidate.bookId}`,
        reason: "missing_book_catalog_doc",
      });
    } else if (catalogCountersMatch(expected, bookSnap.data() || {})) {
      matchedCatalog += 1;
    } else {
      staleCatalog += 1;
      catalogMismatch += 1;
      catalogFailures.push({
        authorityPath: candidate.authorityPath,
        projectionPath: `books/${candidate.bookId}`,
        reason: "book_catalog_counter_drift_or_missing_fields",
      });
    }
  }

  const statsFailed = missingStats + staleStats + orphanStats;
  const catalogFailed = missingCatalog + staleCatalog;
  return [
    createVerificationResult({
      verificationId: `${verificationId}:book_stats`,
      projectionName: PROJECTION_NAME,
      authorityQuery: `reviews/{reviewId}.where(bookId==bookId,status==active,visibility==public) scope=${request.scope}`,
      projectionQuery: "book_stats",
      status: statsFailed === 0 ? "passed" : "failed",
      scanned,
      matched: matchedStats,
      missingProjectionCount: missingStats,
      staleProjectionCount: staleStats,
      mismatchCount: statsMismatch,
      extraProjectionCount: orphanStats,
      verificationSuccessRate: scanned > 0 ? Number((matchedStats / scanned).toFixed(6)) : 1,
      sampleFailures: statsFailures.slice(0, 20),
      nextCursor: null,
    }),
    createVerificationResult({
      verificationId: `${verificationId}:book_catalog_counter_projection`,
      projectionName: CATALOG_PROJECTION_NAME,
      authorityQuery: `reviews/{reviewId}.where(bookId==bookId,status==active,visibility==public) scope=${request.scope}`,
      projectionQuery: "books.rating,books.ratingsCount,books.reviewCount,books.reviewsCount",
      status: catalogFailed === 0 ? "passed" : "failed",
      scanned,
      matched: matchedCatalog,
      missingProjectionCount: missingCatalog,
      staleProjectionCount: staleCatalog,
      mismatchCount: catalogMismatch,
      extraProjectionCount: 0,
      verificationSuccessRate: scanned > 0 ? Number((matchedCatalog / scanned).toFixed(6)) : 1,
      sampleFailures: catalogFailures.slice(0, 20),
      nextCursor: null,
    }),
  ];
}

export async function recoverBookStatsForRequest(
  rawRequest: BookStatsRecoveryRequest,
  fallbackUid = "system"
) {
  const request = normalizeRequest(rawRequest, fallbackUid);
  let summary = await startRecoveryRun(buildRecoveryRequest(request));
  const failureLedgerIds: string[] = [];

  try {
    const { candidates, nextCursor, checkpointId, lastProcessedPath } = await loadCandidates(request);
    let wouldWrite = 0;
    let written = 0;
    let skipped = 0;
    let failed = 0;

    for (const candidate of candidates) {
      try {
        const [bookSnap, statsSnap, expected] = await Promise.all([
          db.collection("books").doc(candidate.bookId).get(),
          db.collection("book_stats").doc(candidate.bookId).get(),
          computeExpectedBookStats(candidate.bookId),
        ]);
        const needsWrite =
          !statsSnap.exists ||
          !bookSnap.exists ||
          !bookStatsMatches(expected, statsSnap.data() || {}) ||
          !catalogCountersMatch(expected, bookSnap.data() || {});
        if (needsWrite) wouldWrite += 1;
        if (request.mode === "write" && request.reconciliationMode === "repair" && needsWrite && bookSnap.exists) {
          await writeExactBookCounters(candidate.bookId, expected);
          written += 1;
        } else {
          skipped += needsWrite ? 1 : 0;
        }
        if (!bookSnap.exists && statsSnap.exists) {
          failureLedgerIds.push(await recordFailure({
            candidate,
            projectionName: PROJECTION_NAME,
            projectionCollection: "book_stats",
            operation: request.reconciliationMode === "repair" ? "reconcile" : "verify",
            failureClass: "authority_missing",
            message: "book_stats exists for a missing book catalog document.",
            correlationId: request.correlationId,
          }));
        }
      } catch (error) {
        failed += 1;
        failureLedgerIds.push(await recordFailure({
          candidate,
          projectionName: PROJECTION_NAME,
          projectionCollection: "book_stats,books",
          operation: request.reconciliationMode === "repair" ? "reconcile" : "verify",
          failureClass: "write_failed",
          message: error instanceof Error ? error.message : String(error),
          correlationId: request.correlationId,
        }));
      }
    }

    if (checkpointId) {
      await updateRecoveryCheckpointProgress({
        checkpointId,
        projectionName: PROJECTION_NAME,
        scope: "checkpointed_full",
        cursor: nextCursor,
        lastProcessedPath,
        scannedDelta: candidates.length,
        writtenDelta: written,
        failedDelta: failed,
        status: nextCursor ? "partial" : "completed",
      });
    }

    let verifications: VerificationResult[] = [];
    let verificationFailures = 0;
    if (request.verify) {
      verifications = await verifyCandidates(candidates, request, `${summary.runId}:verification`);
      for (const verification of verifications) {
        await writeVerificationResult(verification);
        await updateProjectionHealthFromVerification(verification);
        verificationFailures +=
          verification.missingProjectionCount +
          verification.staleProjectionCount +
          verification.extraProjectionCount;
      }
    }

    summary = await completeRecoveryRun(summary, {
      status: failed > 0 ? "partial" : nextCursor ? "partial" : "completed",
      scanned: candidates.length,
      eligible: candidates.length,
      wouldWrite,
      written,
      skipped,
      failed,
      verified: verifications.reduce((sum, verification) => sum + verification.scanned, 0),
      verificationFailures,
      nextCursor,
      checkpointUpdated: !!checkpointId,
      failureLedgerIds,
    });
    await updateProjectionHealthFromRecoverySummary(summary);

    const projectionNames = [PROJECTION_NAME, CATALOG_PROJECTION_NAME];
    return {
      summary,
      verifications,
      certification: projectionNames.map((projectionName) => {
        const definition = getProjectionDefinition(projectionName);
        const result = definition ? evaluateProjectionCertification(definition) : null;
        return {
          projectionName,
          passed: result?.passed ?? false,
          missingRequirements: result?.missingRequirements ?? ["registered_definition"],
        };
      }),
    };
  } catch (error) {
    summary = await failRecoveryRun(summary, {
      failedCount: Math.max(1, summary.failed),
      failureLedgerIds,
    });
    await updateProjectionHealthFromRecoverySummary(summary);
    throw error;
  }
}

export const recoverBookStats = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  assertRoleFromClaims(caller, "superadmin");
  return recoverBookStatsForRequest(request.data as BookStatsRecoveryRequest, caller.uid);
});
