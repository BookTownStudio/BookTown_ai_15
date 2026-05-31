import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldPath } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import { assertActiveAuthenticatedUser, assertRoleFromClaims } from "../shared/auth";
import {
  BOOK_QUOTE_PROJECTION_COLLECTION,
  SOCIAL_QUOTE_PROJECTION_COLLECTION,
  USER_QUOTE_PROJECTION_COLLECTION,
  buildQuoteProjectionPayload,
  bookQuoteProjectionId,
  socialQuoteProjectionId,
  userQuoteProjectionId,
  type QuoteProjectionPayload,
} from "../projections/quoteProjections";
import {
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
import {
  evaluateProjectionCertification,
} from "../operations/projectionRecoveryControlPlane";
import {
  getProjectionDefinition,
} from "../operations/projectionRegistry";

const db = admin.firestore();

const QUOTE_RECOVERY_BATCH_DEFAULT = 100;
const QUOTE_RECOVERY_BATCH_MAX = 100;
const QUOTE_PROJECTION_NAMES = [
  USER_QUOTE_PROJECTION_COLLECTION,
  BOOK_QUOTE_PROJECTION_COLLECTION,
  SOCIAL_QUOTE_PROJECTION_COLLECTION,
] as const;

type QuoteRecoveryScope =
  | "single_quote"
  | "owner"
  | "book"
  | "collection_page"
  | "checkpointed_full";

type QuoteRecoveryRequest = {
  mode?: RecoveryMode;
  scope: QuoteRecoveryScope;
  quoteId?: string;
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

type QuoteProjectionTarget = {
  projectionName: typeof QUOTE_PROJECTION_NAMES[number];
  ref: FirebaseFirestore.DocumentReference;
  expected: Record<string, unknown> | null;
  shouldExist: boolean;
};

type QuoteRecoveryResult = {
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

function mapScope(scope: QuoteRecoveryScope): RecoveryScope {
  if (scope === "single_quote") return "single_doc";
  if (scope === "book") return "collection_page";
  return scope;
}

function normalizeQuoteRecoveryRequest(raw: unknown, fallbackUid: string): Required<
  Pick<QuoteRecoveryRequest, "mode" | "scope" | "batchSize" | "maxDocs" | "verify" | "requestedBy" | "reason">
> & Omit<QuoteRecoveryRequest, "mode" | "scope" | "batchSize" | "maxDocs" | "verify" | "requestedBy" | "reason"> {
  const input =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const scope = readString(input.scope, 40) as QuoteRecoveryScope;
  if (
    scope !== "single_quote" &&
    scope !== "owner" &&
    scope !== "book" &&
    scope !== "collection_page" &&
    scope !== "checkpointed_full"
  ) {
    throw new HttpsError("invalid-argument", "Invalid quote recovery scope.");
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
    quoteId: readString(input.quoteId, 180) || undefined,
    ownerId: readString(input.ownerId, 128) || undefined,
    bookId: readString(input.bookId, 180) || undefined,
    cursor: readString(input.cursor, 500) || undefined,
    checkpointId: readString(input.checkpointId, 500) || undefined,
    batchSize: readPositiveInt(input.batchSize, QUOTE_RECOVERY_BATCH_DEFAULT, QUOTE_RECOVERY_BATCH_MAX),
    maxDocs: readPositiveInt(input.maxDocs, QUOTE_RECOVERY_BATCH_DEFAULT, MAX_RECOVERY_BATCH_SIZE),
    verify: readBoolean(input.verify, true),
    requestedBy,
    reason,
    correlationId: readString(input.correlationId, 128) || undefined,
  };
}

function buildRecoveryRequest(input: ReturnType<typeof normalizeQuoteRecoveryRequest>): RecoveryRequest {
  return {
    projectionName: USER_QUOTE_PROJECTION_COLLECTION,
    mode: input.mode,
    scope: mapScope(input.scope),
    targetId: input.quoteId,
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
  quoteId: string,
  projection: QuoteProjectionPayload | null,
  ownerIdHint?: string
): QuoteProjectionTarget[] {
  const ownerId = projection?.ownerId || ownerIdHint || "";
  return [
    {
      projectionName: USER_QUOTE_PROJECTION_COLLECTION,
      ref: db
        .collection(USER_QUOTE_PROJECTION_COLLECTION)
        .doc(ownerId ? userQuoteProjectionId(ownerId, quoteId) : `unknown_${quoteId}`),
      expected: projection ? { ...projection, projectionSurface: "user" } : null,
      shouldExist: !!projection && !!ownerId,
    },
    {
      projectionName: BOOK_QUOTE_PROJECTION_COLLECTION,
      ref: db
        .collection(BOOK_QUOTE_PROJECTION_COLLECTION)
        .doc(bookQuoteProjectionId(quoteId)),
      expected:
        projection && projection.isPublic && projection.status === "active"
          ? { ...projection, projectionSurface: "book" }
          : null,
      shouldExist: !!projection && projection.isPublic && projection.status === "active",
    },
    {
      projectionName: SOCIAL_QUOTE_PROJECTION_COLLECTION,
      ref: db
        .collection(SOCIAL_QUOTE_PROJECTION_COLLECTION)
        .doc(socialQuoteProjectionId(quoteId)),
      expected:
        projection && projection.isPublic && projection.status === "active"
          ? { ...projection, projectionSurface: "social" }
          : null,
      shouldExist: !!projection && projection.isPublic && projection.status === "active",
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

async function loadQuoteDocs(
  request: ReturnType<typeof normalizeQuoteRecoveryRequest>
): Promise<{
  docs: FirebaseFirestore.QueryDocumentSnapshot[];
  nextCursor: string | null;
  checkpointId: string | null;
}> {
  if (request.scope === "single_quote") {
    if (!request.quoteId) {
      throw new HttpsError("invalid-argument", "quoteId is required for single_quote recovery.");
    }
    const snap = await db.collection("quotes").doc(request.quoteId).get();
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
      projectionName: USER_QUOTE_PROJECTION_COLLECTION,
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
    for (const field of ["authorUid", "ownerId"]) {
      let query = db
        .collection("quotes")
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
      .collection("quotes")
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
    .collection("quotes")
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

async function verifyQuoteDocs(
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
  request: ReturnType<typeof normalizeQuoteRecoveryRequest>,
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
    const projection = buildQuoteProjectionPayload(doc.id, source);
    const targets = buildTargets(doc.id, projection, readString(source.authorUid, 128) || readString(source.ownerId, 128));
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

  const failed =
    missingProjectionCount + staleProjectionCount + extraProjectionCount;
  return createVerificationResult({
    verificationId,
    projectionName: USER_QUOTE_PROJECTION_COLLECTION,
    authorityQuery: `quotes scope=${request.scope}`,
    projectionQuery: `${USER_QUOTE_PROJECTION_COLLECTION},${BOOK_QUOTE_PROJECTION_COLLECTION},${SOCIAL_QUOTE_PROJECTION_COLLECTION}`,
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

export async function recoverQuoteProjectionsForRequest(
  rawRequest: QuoteRecoveryRequest,
  fallbackUid = "system"
): Promise<QuoteRecoveryResult> {
  const request = normalizeQuoteRecoveryRequest(rawRequest, fallbackUid);
  const recoveryRequest = buildRecoveryRequest(request);
  let summary = await startRecoveryRun(recoveryRequest);
  const failureLedgerIds: string[] = [];

  try {
    const { docs, nextCursor, checkpointId } = await loadQuoteDocs(request);
    let eligible = 0;
    let wouldWrite = 0;
    let written = 0;
    let skipped = 0;
    let failed = 0;

    for (const doc of docs) {
      try {
        const source = doc.data() as Record<string, unknown>;
        const projection = buildQuoteProjectionPayload(doc.id, source);
        const targets = buildTargets(
          doc.id,
          projection,
          readString(source.authorUid, 128) || readString(source.ownerId, 128)
        );
        eligible += projection ? 1 : 0;
        wouldWrite += targets.length;

        if (request.mode === "write") {
          const batch = db.batch();
          for (const target of targets) {
            if (target.shouldExist && target.expected) {
              batch.set(target.ref, target.expected, { merge: true });
            } else if (target.projectionName !== USER_QUOTE_PROJECTION_COLLECTION || projection?.ownerId) {
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
          projectionName: USER_QUOTE_PROJECTION_COLLECTION,
          projectionCollection: USER_QUOTE_PROJECTION_COLLECTION,
          triggerName: "recoverQuoteProjections",
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
        projectionName: USER_QUOTE_PROJECTION_COLLECTION,
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
      verification = await verifyQuoteDocs(docs, request, `${summary.runId}:verification`);
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
      certification: QUOTE_PROJECTION_NAMES.map((projectionName) => {
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

export const recoverQuoteProjections = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  assertRoleFromClaims(caller, "superadmin");
  return recoverQuoteProjectionsForRequest(
    request.data as QuoteRecoveryRequest,
    caller.uid
  );
});
