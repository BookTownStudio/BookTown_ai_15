import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldPath } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import { assertActiveAuthenticatedUser, assertRoleFromClaims } from "../shared/auth";
import {
  BOOK_REVIEW_PROJECTION_COLLECTION,
  SOCIAL_REVIEW_PROJECTION_COLLECTION,
  USER_REVIEW_PROJECTION_COLLECTION,
  buildReviewProjectionPayload,
  bookReviewProjectionId,
  socialReviewProjectionId,
  userReviewProjectionId,
  type ReviewProjectionPayload,
} from "../projections/reviewProjections";
import {
  MAX_RECOVERY_BATCH_SIZE,
  evaluateProjectionCertification,
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

const REVIEW_RECOVERY_BATCH_DEFAULT = 100;
const REVIEW_RECOVERY_BATCH_MAX = 100;
const REVIEW_PROJECTION_NAMES = [
  USER_REVIEW_PROJECTION_COLLECTION,
  BOOK_REVIEW_PROJECTION_COLLECTION,
  SOCIAL_REVIEW_PROJECTION_COLLECTION,
] as const;

type ReviewRecoveryScope =
  | "single_review"
  | "owner"
  | "book"
  | "collection_page"
  | "checkpointed_full";

type ReviewRecoveryRequest = {
  mode?: RecoveryMode;
  scope: ReviewRecoveryScope;
  reviewId?: string;
  ownerId?: string;
  bookId?: string;
  cursor?: string;
  checkpointId?: string;
  batchSize?: number;
  maxDocs?: number;
  verify?: boolean;
  requestedBy?: string;
  reason?: string;
  correlationId?: string;
};

type ReviewProjectionTarget = {
  projectionName: typeof REVIEW_PROJECTION_NAMES[number];
  ref: FirebaseFirestore.DocumentReference;
  expected: Record<string, unknown> | null;
  shouldExist: boolean;
};

type ReviewRecoveryResult = {
  summary: RecoverySummary;
  verification: VerificationResult | null;
  certification: Array<{
    projectionName: string;
    passed: boolean;
    missingRequirements: string[];
  }>;
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

function mapScope(scope: ReviewRecoveryScope): RecoveryScope {
  if (scope === "single_review") return "single_doc";
  if (scope === "book") return "collection_page";
  return scope;
}

function normalizeReviewRecoveryRequest(raw: unknown, fallbackUid: string): Required<
  Pick<ReviewRecoveryRequest, "mode" | "scope" | "batchSize" | "maxDocs" | "verify" | "requestedBy" | "reason">
> & Omit<ReviewRecoveryRequest, "mode" | "scope" | "batchSize" | "maxDocs" | "verify" | "requestedBy" | "reason"> {
  const input =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const scope = readString(input.scope, 40) as ReviewRecoveryScope;
  if (
    scope !== "single_review" &&
    scope !== "owner" &&
    scope !== "book" &&
    scope !== "collection_page" &&
    scope !== "checkpointed_full"
  ) {
    throw new HttpsError("invalid-argument", "Invalid review recovery scope.");
  }

  const modeRaw = readString(input.mode, 20);
  const mode: RecoveryMode = modeRaw === "write" ? "write" : "dry_run";
  const requestedBy = readString(input.requestedBy, 128) || fallbackUid;
  const reason = readString(input.reason, 500);
  if (!reason) {
    throw new HttpsError("invalid-argument", "reason is required.");
  }

  return {
    mode,
    scope,
    reviewId: readString(input.reviewId, 180) || undefined,
    ownerId: readString(input.ownerId, 128) || undefined,
    bookId: readString(input.bookId, 180) || undefined,
    cursor: readString(input.cursor, 500) || undefined,
    checkpointId: readString(input.checkpointId, 500) || undefined,
    batchSize: readPositiveInt(input.batchSize, REVIEW_RECOVERY_BATCH_DEFAULT, REVIEW_RECOVERY_BATCH_MAX),
    maxDocs: readPositiveInt(input.maxDocs, REVIEW_RECOVERY_BATCH_DEFAULT, MAX_RECOVERY_BATCH_SIZE),
    verify: readBoolean(input.verify, true),
    requestedBy,
    reason,
    correlationId: readString(input.correlationId, 128) || undefined,
  };
}

function buildRecoveryRequest(input: ReturnType<typeof normalizeReviewRecoveryRequest>): RecoveryRequest {
  return {
    projectionName: USER_REVIEW_PROJECTION_COLLECTION,
    mode: input.mode,
    scope: mapScope(input.scope),
    targetId: input.reviewId,
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

function buildTargets(
  reviewId: string,
  projection: ReviewProjectionPayload | null,
  ownerIdHint?: string,
  bookIdHint?: string
): ReviewProjectionTarget[] {
  const ownerId = projection?.uid || ownerIdHint || "";
  const bookId = projection?.bookId || bookIdHint || "";
  return [
    {
      projectionName: USER_REVIEW_PROJECTION_COLLECTION,
      ref: db
        .collection(USER_REVIEW_PROJECTION_COLLECTION)
        .doc(ownerId && bookId ? userReviewProjectionId(ownerId, bookId) : `unknown_${reviewId}`),
      expected: projection ? { ...projection, projectionSurface: "user" } : null,
      shouldExist: !!projection && !!ownerId && !!bookId,
    },
    {
      projectionName: BOOK_REVIEW_PROJECTION_COLLECTION,
      ref: db
        .collection(BOOK_REVIEW_PROJECTION_COLLECTION)
        .doc(ownerId && bookId ? bookReviewProjectionId(ownerId, bookId) : `unknown_${reviewId}`),
      expected: projection ? { ...projection, projectionSurface: "book" } : null,
      shouldExist: !!projection && !!ownerId && !!bookId,
    },
    {
      projectionName: SOCIAL_REVIEW_PROJECTION_COLLECTION,
      ref: db
        .collection(SOCIAL_REVIEW_PROJECTION_COLLECTION)
        .doc(ownerId && bookId ? socialReviewProjectionId(ownerId, bookId) : `unknown_${reviewId}`),
      expected: projection ? { ...projection, projectionSurface: "social" } : null,
      shouldExist: !!projection && !!ownerId && !!bookId,
    },
  ];
}

function projectionMatches(expected: Record<string, unknown>, actual: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(expected)) {
    if (JSON.stringify(actual[key] ?? null) !== JSON.stringify(value ?? null)) {
      return false;
    }
  }
  return true;
}

async function loadReviewDocs(
  request: ReturnType<typeof normalizeReviewRecoveryRequest>
): Promise<{
  docs: FirebaseFirestore.QueryDocumentSnapshot[];
  nextCursor: string | null;
  checkpointId: string | null;
}> {
  if (request.scope === "single_review") {
    if (!request.reviewId) {
      throw new HttpsError("invalid-argument", "reviewId is required for single_review recovery.");
    }
    const snap = await db.collection("reviews").doc(request.reviewId).get();
    return {
      docs: snap.exists ? [snap as FirebaseFirestore.QueryDocumentSnapshot] : [],
      nextCursor: null,
      checkpointId: null,
    };
  }

  let cursor = request.cursor;
  let checkpointId: string | null = null;
  if (request.scope === "checkpointed_full") {
    checkpointId = request.checkpointId || buildRecoveryCheckpointId({
      projectionName: USER_REVIEW_PROJECTION_COLLECTION,
      scope: "checkpointed_full",
    });
    const checkpoint = await readRecoveryCheckpoint(checkpointId);
    cursor = request.cursor || checkpoint?.cursor || undefined;
  }

  const limit = Math.min(request.batchSize, request.maxDocs);

  if (request.scope === "owner") {
    if (!request.ownerId) {
      throw new HttpsError("invalid-argument", "ownerId is required for owner recovery.");
    }
    const docsByPath = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    for (const field of ["uid", "userId"]) {
      let query = db
        .collection("reviews")
        .where(field, "==", request.ownerId)
        .orderBy(FieldPath.documentId())
        .limit(limit);
      if (cursor) query = query.startAfter(cursor);
      const snap = await query.get();
      for (const doc of snap.docs) docsByPath.set(doc.ref.path, doc);
    }
    const docs = [...docsByPath.values()].sort((a, b) => a.id.localeCompare(b.id)).slice(0, limit);
    return {
      docs,
      nextCursor: docs.length === limit ? docs[docs.length - 1].id : null,
      checkpointId,
    };
  }

  if (request.scope === "book") {
    if (!request.bookId) {
      throw new HttpsError("invalid-argument", "bookId is required for book recovery.");
    }
    let query = db
      .collection("reviews")
      .where("bookId", "==", request.bookId)
      .orderBy(FieldPath.documentId())
      .limit(limit);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    return {
      docs: snap.docs,
      nextCursor: snap.size === limit ? snap.docs[snap.docs.length - 1].id : null,
      checkpointId,
    };
  }

  let query = db
    .collection("reviews")
    .orderBy(FieldPath.documentId())
    .limit(limit);
  if (cursor) query = query.startAfter(cursor);
  const snap = await query.get();
  return {
    docs: snap.docs,
    nextCursor: snap.size === limit ? snap.docs[snap.docs.length - 1].id : null,
    checkpointId,
  };
}

async function verifyReviewDocs(
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
  request: ReturnType<typeof normalizeReviewRecoveryRequest>,
  verificationId: string
): Promise<VerificationResult> {
  let scanned = 0;
  let matched = 0;
  let missingProjectionCount = 0;
  let staleProjectionCount = 0;
  let mismatchCount = 0;
  let extraProjectionCount = 0;
  const sampleFailures: VerificationResult["sampleFailures"] = [];

  for (const doc of docs) {
    scanned += 1;
    const source = doc.data() as Record<string, unknown>;
    const projection = await buildReviewProjectionPayload(db, doc.id, source);
    const targets = buildTargets(
      doc.id,
      projection,
      readString(source.uid, 128) || readString(source.userId, 128),
      readString(source.bookId, 180)
    );
    const targetSnaps = await Promise.all(targets.map((target) => target.ref.get()));
    let docMatched = true;

    targets.forEach((target, index) => {
      const snap = targetSnaps[index];
      if (target.shouldExist && !snap.exists) {
        missingProjectionCount += 1;
        docMatched = false;
        if (sampleFailures.length < 20) {
          sampleFailures.push({
            authorityPath: doc.ref.path,
            projectionPath: target.ref.path,
            reason: "missing_projection",
          });
        }
        return;
      }
      if (target.shouldExist && target.expected && snap.exists) {
        const actual = snap.data() || {};
        if (!projectionMatches(target.expected, actual)) {
          staleProjectionCount += 1;
          mismatchCount += 1;
          docMatched = false;
          if (sampleFailures.length < 20) {
            sampleFailures.push({
              authorityPath: doc.ref.path,
              projectionPath: target.ref.path,
              reason: "stale_projection",
            });
          }
        }
        return;
      }
      if (!target.shouldExist && snap.exists) {
        extraProjectionCount += 1;
        docMatched = false;
        if (sampleFailures.length < 20) {
          sampleFailures.push({
            authorityPath: doc.ref.path,
            projectionPath: target.ref.path,
            reason: "extra_projection",
          });
        }
      }
    });

    if (docMatched) matched += 1;
  }

  const failed = missingProjectionCount + staleProjectionCount + extraProjectionCount;
  return createVerificationResult({
    verificationId,
    projectionName: USER_REVIEW_PROJECTION_COLLECTION,
    authorityQuery: `reviews scope=${request.scope}`,
    projectionQuery: `${USER_REVIEW_PROJECTION_COLLECTION},${BOOK_REVIEW_PROJECTION_COLLECTION},${SOCIAL_REVIEW_PROJECTION_COLLECTION}`,
    status: failed === 0 ? "passed" : "failed",
    scanned,
    matched,
    missingProjectionCount,
    staleProjectionCount,
    mismatchCount,
    extraProjectionCount,
    verificationSuccessRate:
      scanned > 0 ? Number((matched / scanned).toFixed(6)) : 1,
    sampleFailures,
    nextCursor: null,
  });
}

export async function recoverReviewProjectionsForRequest(
  rawRequest: ReviewRecoveryRequest,
  fallbackUid = "system"
): Promise<ReviewRecoveryResult> {
  const request = normalizeReviewRecoveryRequest(rawRequest, fallbackUid);
  const recoveryRequest = buildRecoveryRequest(request);
  let summary = await startRecoveryRun(recoveryRequest);
  const failureLedgerIds: string[] = [];

  try {
    const { docs, nextCursor, checkpointId } = await loadReviewDocs(request);
    let eligible = 0;
    let wouldWrite = 0;
    let written = 0;
    let skipped = 0;
    let failed = 0;

    for (const doc of docs) {
      try {
        const source = doc.data() as Record<string, unknown>;
        const projection = await buildReviewProjectionPayload(db, doc.id, source);
        const targets = buildTargets(
          doc.id,
          projection,
          readString(source.uid, 128) || readString(source.userId, 128),
          readString(source.bookId, 180)
        );
        eligible += projection ? 1 : 0;
        wouldWrite += targets.length;

        if (request.mode === "write") {
          const batch = db.batch();
          for (const target of targets) {
            if (target.shouldExist && target.expected) {
              batch.set(target.ref, target.expected, { merge: true });
            } else if (target.projectionName !== USER_REVIEW_PROJECTION_COLLECTION || projection?.uid) {
              batch.delete(target.ref);
            }
          }
          await batch.commit();
          written += targets.length;
        } else {
          skipped += targets.length;
        }
      } catch (error) {
        failed += 1;
        const failure = await recordProjectionFailure({
          projectionName: USER_REVIEW_PROJECTION_COLLECTION,
          projectionCollection: USER_REVIEW_PROJECTION_COLLECTION,
          triggerName: "recoverReviewProjections",
          sourcePath: doc.ref.path,
          sourceEventId: `recovery:${summary.runId}:${doc.id}`,
          operation: "rebuild",
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
        projectionName: USER_REVIEW_PROJECTION_COLLECTION,
        scope: "checkpointed_full",
        cursor: nextCursor,
        lastProcessedPath: docs[docs.length - 1]?.ref.path ?? null,
        scannedDelta: docs.length,
        writtenDelta: written,
        failedDelta: failed,
        status: nextCursor ? "partial" : "completed",
      });
    }

    let verification: VerificationResult | null = null;
    let verificationFailures = 0;
    if (request.verify) {
      verification = await verifyReviewDocs(docs, request, `${summary.runId}:verification`);
      await writeVerificationResult(verification);
      await updateProjectionHealthFromVerification(verification);
      verificationFailures =
        verification.missingProjectionCount +
        verification.staleProjectionCount +
        verification.extraProjectionCount;
    }

    summary = await completeRecoveryRun(summary, {
      status: failed > 0 ? "partial" : nextCursor ? "partial" : "completed",
      scanned: docs.length,
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

    return {
      summary,
      verification,
      certification: REVIEW_PROJECTION_NAMES.map((projectionName) => {
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

export const recoverReviewProjections = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  assertRoleFromClaims(caller, "superadmin");
  return recoverReviewProjectionsForRequest(
    request.data as ReviewRecoveryRequest,
    caller.uid
  );
});
