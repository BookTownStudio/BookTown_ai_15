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
  type RecoverySummary,
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

const PROJECTION_NAME = "user_library_books";
const DEFAULT_BATCH_SIZE = 100;
const HARD_MAX_BATCH_SIZE = 100;

type UserLibraryRecoveryScope =
  | "single_user"
  | "single_book"
  | "owner"
  | "collection_page"
  | "checkpointed_full";

type ReconciliationMode = "report_only" | "repair";

type UserLibraryRecoveryRequest = {
  mode?: RecoveryMode;
  scope: UserLibraryRecoveryScope;
  uid?: string;
  ownerId?: string;
  bookId?: string;
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
  uid: string;
  bookId: string;
  authorityPath: string;
};

type ExpectedLibraryProjection = {
  uid: string;
  bookId: string;
  shelfIds: string[];
  hasProgress: boolean;
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

function projectionDocId(uid: string, bookId: string): string {
  return `${uid}_${bookId}`;
}

function normalizeRequest(
  raw: unknown,
  fallbackUid: string
): Required<
  Pick<
    UserLibraryRecoveryRequest,
    "mode" | "scope" | "batchSize" | "maxDocs" | "verify" | "reconciliationMode" | "requestedBy" | "reason"
  >
> &
  Omit<
    UserLibraryRecoveryRequest,
    "mode" | "scope" | "batchSize" | "maxDocs" | "verify" | "reconciliationMode" | "requestedBy" | "reason"
  > {
  const input =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const scope = readString(input.scope, 40) as UserLibraryRecoveryScope;
  if (
    scope !== "single_user" &&
    scope !== "single_book" &&
    scope !== "owner" &&
    scope !== "collection_page" &&
    scope !== "checkpointed_full"
  ) {
    throw new HttpsError("invalid-argument", "Invalid user library recovery scope.");
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
    uid: readString(input.uid, 128) || undefined,
    ownerId: readString(input.ownerId, 128) || undefined,
    bookId: readString(input.bookId, 180) || undefined,
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

function toRecoveryScope(scope: UserLibraryRecoveryScope): RecoveryScope {
  if (scope === "single_user" || scope === "single_book") return "owner";
  return scope;
}

function buildRecoveryRequest(input: ReturnType<typeof normalizeRequest>): RecoveryRequest {
  return {
    projectionName: PROJECTION_NAME,
    mode: input.mode,
    scope: toRecoveryScope(input.scope),
    targetId: input.bookId,
    ownerId: input.ownerId || input.uid,
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

function addCandidate(map: Map<string, Candidate>, uid: string, bookId: string, authorityPath: string): void {
  if (!uid || !bookId) return;
  map.set(projectionDocId(uid, bookId), { uid, bookId, authorityPath });
}

async function candidatesFromShelfQuery(
  query: FirebaseFirestore.Query,
  limit: number
): Promise<{ candidates: Candidate[]; nextCursor: string | null; lastPath: string | null }> {
  const snap = await query.limit(limit).get();
  const map = new Map<string, Candidate>();
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    if (data.isVirtual === true) continue;
    addCandidate(
      map,
      readString(data.ownerId, 128),
      readString(data.bookId, 180),
      doc.ref.path
    );
  }
  return {
    candidates: [...map.values()],
    nextCursor: snap.size === limit ? snap.docs[snap.docs.length - 1].id : null,
    lastPath: snap.docs[snap.docs.length - 1]?.ref.path ?? null,
  };
}

async function candidatesFromProgressQuery(
  query: FirebaseFirestore.Query,
  limit: number
): Promise<{ candidates: Candidate[]; nextCursor: string | null; lastPath: string | null }> {
  const snap = await query.limit(limit).get();
  const map = new Map<string, Candidate>();
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    addCandidate(
      map,
      readString(data.uid, 128) || readString(data.userId, 128),
      readString(data.bookId, 180),
      doc.ref.path
    );
  }
  return {
    candidates: [...map.values()],
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
  const limit = Math.min(request.batchSize, request.maxDocs, HARD_MAX_BATCH_SIZE);
  const ownerId = request.ownerId || request.uid;

  if (request.scope === "single_user" || request.scope === "owner") {
    if (!ownerId) throw new HttpsError("invalid-argument", "ownerId or uid is required.");
    const rawCursor = request.cursor || "shelf:";
    const [phase, docId = ""] = rawCursor.split(":", 2);
    if (phase === "progressUserId") {
      const base = db.collection("reading_progress").where("userId", "==", ownerId).orderBy(FieldPath.documentId());
      const loaded = await candidatesFromProgressQuery(docId ? base.startAfter(docId) : base, limit);
      return {
        candidates: loaded.candidates,
        nextCursor: loaded.nextCursor ? `progressUserId:${loaded.nextCursor}` : null,
        checkpointId: null,
        lastProcessedPath: loaded.lastPath,
      };
    }
    if (phase === "progressUid") {
      const base = db.collection("reading_progress").where("uid", "==", ownerId).orderBy(FieldPath.documentId());
      const loaded = await candidatesFromProgressQuery(docId ? base.startAfter(docId) : base, limit);
      return {
        candidates: loaded.candidates,
        nextCursor: loaded.nextCursor ? `progressUid:${loaded.nextCursor}` : "progressUserId:",
        checkpointId: null,
        lastProcessedPath: loaded.lastPath,
      };
    }
    const base = db.collection("shelf_books").where("ownerId", "==", ownerId).orderBy(FieldPath.documentId());
    const loaded = await candidatesFromShelfQuery(docId ? base.startAfter(docId) : base, limit);
    return {
      candidates: loaded.candidates,
      nextCursor: loaded.nextCursor ? `shelf:${loaded.nextCursor}` : "progressUid:",
      checkpointId: null,
      lastProcessedPath: loaded.lastPath,
    };
  }

  if (request.scope === "single_book") {
    if (!request.bookId) throw new HttpsError("invalid-argument", "bookId is required.");
    const rawCursor = request.cursor || "shelf:";
    const [phase, docId = ""] = rawCursor.split(":", 2);
    if (phase === "progress") {
      const base = db.collection("reading_progress").where("bookId", "==", request.bookId).orderBy(FieldPath.documentId());
      const loaded = await candidatesFromProgressQuery(docId ? base.startAfter(docId) : base, limit);
      return {
        candidates: loaded.candidates,
        nextCursor: loaded.nextCursor ? `progress:${loaded.nextCursor}` : null,
        checkpointId: null,
        lastProcessedPath: loaded.lastPath,
      };
    }
    const base = db.collection("shelf_books").where("bookId", "==", request.bookId).orderBy(FieldPath.documentId());
    const loaded = await candidatesFromShelfQuery(docId ? base.startAfter(docId) : base, limit);
    return {
      candidates: loaded.candidates,
      nextCursor: loaded.nextCursor ? `shelf:${loaded.nextCursor}` : "progress:",
      checkpointId: null,
      lastProcessedPath: loaded.lastPath,
    };
  }

  let cursor = request.cursor;
  let checkpointId: string | null = null;
  if (request.scope === "checkpointed_full") {
    checkpointId =
      request.checkpointId ||
      buildRecoveryCheckpointId({ projectionName: PROJECTION_NAME, scope: "checkpointed_full" });
    const checkpoint = await readRecoveryCheckpoint(checkpointId);
    cursor = request.cursor || checkpoint?.cursor || "shelf:";
  }

  const rawCursor = cursor || "shelf:";
  const [phase, docId = ""] = rawCursor.split(":", 2);
  const collection = phase === "progress" ? "reading_progress" : "shelf_books";
  const baseQuery = db.collection(collection).orderBy(FieldPath.documentId());
  const query = docId ? baseQuery.startAfter(docId) : baseQuery;
  const loaded =
    collection === "shelf_books"
      ? await candidatesFromShelfQuery(query, limit)
      : await candidatesFromProgressQuery(query, limit);
  const nextCursor = loaded.nextCursor
    ? `${collection === "shelf_books" ? "shelf" : "progress"}:${loaded.nextCursor}`
    : collection === "shelf_books"
      ? "progress:"
      : null;
  return {
    candidates: loaded.candidates,
    nextCursor,
    checkpointId,
    lastProcessedPath: loaded.lastPath,
  };
}

async function computeExpected(uid: string, bookId: string): Promise<ExpectedLibraryProjection | null> {
  const [shelfSnap, progressSnap] = await Promise.all([
    db
      .collection("shelf_books")
      .where("ownerId", "==", uid)
      .where("bookId", "==", bookId)
      .limit(HARD_MAX_BATCH_SIZE)
      .get(),
    db.collection("reading_progress").doc(projectionDocId(uid, bookId)).get(),
  ]);
  const shelfIds = shelfSnap.docs
    .map((doc) => doc.data() as Record<string, unknown>)
    .filter((data) => data.isVirtual !== true)
    .map((data) => readString(data.shelfId, 180))
    .filter(Boolean)
    .sort();
  const hasProgress = progressSnap.exists;
  if (shelfIds.length === 0 && !hasProgress) return null;
  return { uid, bookId, shelfIds: [...new Set(shelfIds)], hasProgress };
}

function projectionMatches(expected: ExpectedLibraryProjection, actual: Record<string, unknown>): boolean {
  return (
    actual.uid === expected.uid &&
    actual.bookId === expected.bookId &&
    actual.hasProgress === expected.hasProgress &&
    JSON.stringify([...(Array.isArray(actual.shelfIds) ? actual.shelfIds : [])].sort()) ===
      JSON.stringify(expected.shelfIds)
  );
}

async function verifyCandidates(
  candidates: Candidate[],
  request: ReturnType<typeof normalizeRequest>,
  verificationId: string
): Promise<VerificationResult> {
  let scanned = 0;
  let matched = 0;
  let missingProjectionCount = 0;
  let staleProjectionCount = 0;
  let mismatchCount = 0;
  let extraProjectionCount = 0;
  const sampleFailures: VerificationResult["sampleFailures"] = [];

  for (const candidate of candidates) {
    scanned += 1;
    const expected = await computeExpected(candidate.uid, candidate.bookId);
    const ref = db.collection(PROJECTION_NAME).doc(projectionDocId(candidate.uid, candidate.bookId));
    const snap = await ref.get();
    if (expected && !snap.exists) {
      missingProjectionCount += 1;
      sampleFailures.push({ authorityPath: candidate.authorityPath, projectionPath: ref.path, reason: "missing_library_record" });
    } else if (expected && snap.exists && !projectionMatches(expected, snap.data() || {})) {
      staleProjectionCount += 1;
      mismatchCount += 1;
      sampleFailures.push({ authorityPath: candidate.authorityPath, projectionPath: ref.path, reason: "authority_drift" });
    } else if (!expected && snap.exists) {
      extraProjectionCount += 1;
      sampleFailures.push({ authorityPath: candidate.authorityPath, projectionPath: ref.path, reason: "orphan_library_record" });
    } else {
      matched += 1;
    }
  }

  const failed = missingProjectionCount + staleProjectionCount + extraProjectionCount;
  return createVerificationResult({
    verificationId,
    projectionName: PROJECTION_NAME,
    authorityQuery: `shelf_books + reading_progress scope=${request.scope}`,
    projectionQuery: PROJECTION_NAME,
    status: failed === 0 ? "passed" : "failed",
    scanned,
    matched,
    missingProjectionCount,
    staleProjectionCount,
    mismatchCount,
    extraProjectionCount,
    verificationSuccessRate: scanned > 0 ? Number((matched / scanned).toFixed(6)) : 1,
    sampleFailures: sampleFailures.slice(0, 20),
    nextCursor: null,
  });
}

export async function recoverUserLibraryBooksForRequest(
  rawRequest: UserLibraryRecoveryRequest,
  fallbackUid = "system"
) {
  const request = normalizeRequest(rawRequest, fallbackUid);
  let summary = await startRecoveryRun(buildRecoveryRequest(request));
  const failureLedgerIds: string[] = [];

  try {
    const { candidates, nextCursor, checkpointId, lastProcessedPath } = await loadCandidates(request);
    let eligible = 0;
    let wouldWrite = 0;
    let written = 0;
    let skipped = 0;
    let failed = 0;

    for (const candidate of candidates) {
      const ref = db.collection(PROJECTION_NAME).doc(projectionDocId(candidate.uid, candidate.bookId));
      try {
        const expected = await computeExpected(candidate.uid, candidate.bookId);
        const existing = await ref.get();
        eligible += expected ? 1 : 0;
        const needsWrite =
          (expected && (!existing.exists || !projectionMatches(expected, existing.data() || {}))) ||
          (!expected && existing.exists);
        if (needsWrite) wouldWrite += 1;
        if (request.mode === "write" && request.reconciliationMode === "repair" && needsWrite) {
          if (expected) {
            await ref.set(
              { ...expected, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
              { merge: true }
            );
          } else {
            await ref.delete();
          }
          written += 1;
        } else {
          skipped += needsWrite ? 1 : 0;
        }
      } catch (error) {
        failed += 1;
        const failure = await recordProjectionFailure({
          projectionName: PROJECTION_NAME,
          projectionCollection: PROJECTION_NAME,
          triggerName: "recoverUserLibraryBooks",
          sourcePath: candidate.authorityPath,
          sourceEventId: `recovery:${summary.runId}:${projectionDocId(candidate.uid, candidate.bookId)}`,
          operation: request.reconciliationMode === "repair" ? "reconcile" : "verify",
          failureClass: "write_failed",
          lastErrorMessage: error instanceof Error ? error.message : String(error),
          correlationId: request.correlationId,
        });
        failureLedgerIds.push(failure.failureId);
        await updateProjectionHealthFromFailure(failure);
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

    let verification: VerificationResult | null = null;
    let verificationFailures = 0;
    if (request.verify) {
      verification = await verifyCandidates(candidates, request, `${summary.runId}:verification`);
      await writeVerificationResult(verification);
      await updateProjectionHealthFromVerification(verification);
      verificationFailures =
        verification.missingProjectionCount +
        verification.staleProjectionCount +
        verification.extraProjectionCount;
    }

    summary = await completeRecoveryRun(summary, {
      status: failed > 0 ? "partial" : nextCursor ? "partial" : "completed",
      scanned: candidates.length,
      eligible,
      wouldWrite,
      written,
      skipped,
      failed,
      verified: verification?.scanned ?? 0,
      verificationFailures,
      nextCursor,
      checkpointUpdated: !!checkpointId,
      failureLedgerIds,
    });
    await updateProjectionHealthFromRecoverySummary(summary);

    const definition = getProjectionDefinition(PROJECTION_NAME);
    const certification = definition ? evaluateProjectionCertification(definition) : null;
    return {
      summary,
      verification,
      certification: {
        projectionName: PROJECTION_NAME,
        passed: certification?.passed ?? false,
        missingRequirements: certification?.missingRequirements ?? ["registered_definition"],
      },
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

export const recoverUserLibraryBooks = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  assertRoleFromClaims(caller, "superadmin");
  return recoverUserLibraryBooksForRequest(
    request.data as UserLibraryRecoveryRequest,
    caller.uid
  );
});
