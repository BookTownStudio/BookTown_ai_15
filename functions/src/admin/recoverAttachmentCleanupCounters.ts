import { onCall, HttpsError } from "firebase-functions/v2/https";
import { AggregateField, FieldPath } from "firebase-admin/firestore";
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
import { completeRecoveryRun, failRecoveryRun, startRecoveryRun } from "../operations/recoveryRunManager";
import { buildRecoveryCheckpointId, readRecoveryCheckpoint, updateRecoveryCheckpointProgress } from "../operations/projectionCheckpointManager";
import { recordProjectionFailure } from "../operations/projectionFailureLedger";
import { createVerificationResult, writeVerificationResult } from "../operations/projectionVerificationReports";
import {
  updateProjectionHealthFromFailure,
  updateProjectionHealthFromRecoverySummary,
  updateProjectionHealthFromVerification,
} from "../operations/projectionHealthManager";
import { getProjectionDefinition } from "../operations/projectionRegistry";

const db = admin.firestore();

const PROJECTION_NAME = "attachment_cleanup_counters";
const DEFAULT_BATCH_SIZE = 100;
const HARD_MAX_BATCH_SIZE = 100;

type AttachmentCleanupScope = "single_user" | "collection_page" | "checkpointed_full";
type ReconciliationMode = "report_only" | "repair";

type AttachmentCleanupRecoveryRequest = {
  mode?: RecoveryMode;
  scope: AttachmentCleanupScope;
  uid?: string;
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
  authorityPath: string;
};

type ExpectedStorageCounters = {
  storageUsageBytes: number;
  attachmentStorageFiles: number;
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
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function nestedRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeRequest(
  raw: unknown,
  fallbackUid: string
): Required<
  Pick<
    AttachmentCleanupRecoveryRequest,
    "mode" | "scope" | "batchSize" | "maxDocs" | "verify" | "reconciliationMode" | "requestedBy" | "reason"
  >
> &
  Omit<
    AttachmentCleanupRecoveryRequest,
    "mode" | "scope" | "batchSize" | "maxDocs" | "verify" | "reconciliationMode" | "requestedBy" | "reason"
  > {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const scope = readString(input.scope, 40) as AttachmentCleanupScope;
  if (scope !== "single_user" && scope !== "collection_page" && scope !== "checkpointed_full") {
    throw new HttpsError("invalid-argument", "Invalid attachment cleanup counter recovery scope.");
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

function toRecoveryScope(scope: AttachmentCleanupScope): RecoveryScope {
  return scope === "single_user" ? "owner" : scope;
}

function buildRecoveryRequest(input: ReturnType<typeof normalizeRequest>): RecoveryRequest {
  return {
    projectionName: PROJECTION_NAME,
    mode: input.mode,
    scope: toRecoveryScope(input.scope),
    ownerId: input.uid,
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

async function loadCandidates(request: ReturnType<typeof normalizeRequest>): Promise<{
  candidates: Candidate[];
  nextCursor: string | null;
  checkpointId: string | null;
  lastProcessedPath: string | null;
}> {
  if (request.scope === "single_user") {
    if (!request.uid) throw new HttpsError("invalid-argument", "uid is required.");
    return {
      candidates: [{ uid: request.uid, authorityPath: `users/${request.uid}` }],
      nextCursor: null,
      checkpointId: null,
      lastProcessedPath: `users/${request.uid}`,
    };
  }

  const collection = request.scope === "collection_page" ? "user_stats" : "users";
  const limit = Math.min(request.batchSize, request.maxDocs, HARD_MAX_BATCH_SIZE);
  let cursor = request.cursor;
  let checkpointId: string | null = null;
  if (request.scope === "checkpointed_full") {
    checkpointId = request.checkpointId || buildRecoveryCheckpointId({
      projectionName: PROJECTION_NAME,
      scope: "checkpointed_full",
    });
    const checkpoint = await readRecoveryCheckpoint(checkpointId);
    cursor = request.cursor || checkpoint?.cursor || undefined;
  }
  let query = db.collection(collection).orderBy(FieldPath.documentId()).limit(limit);
  if (cursor) query = query.startAfter(cursor);
  const snap = await query.get();
  return {
    candidates: snap.docs.map((doc) => ({ uid: doc.id, authorityPath: doc.ref.path })),
    nextCursor: snap.size === limit ? snap.docs[snap.docs.length - 1].id : null,
    checkpointId,
    lastProcessedPath: snap.docs[snap.docs.length - 1]?.ref.path ?? null,
  };
}

async function computeExpected(uid: string): Promise<ExpectedStorageCounters> {
  const aggregateSnap = await db
    .collection("attachments")
    .where("uploader.uid", "==", uid)
    .aggregate({
      attachmentStorageFiles: AggregateField.count(),
      storageUsageBytes: AggregateField.sum("size"),
    })
    .get();
  const data = aggregateSnap.data();
  return {
    storageUsageBytes: readCounter(data.storageUsageBytes),
    attachmentStorageFiles: readCounter(data.attachmentStorageFiles),
  };
}

function countersMatch(expected: ExpectedStorageCounters, stats: Record<string, unknown>): boolean {
  const counters = nestedRecord(stats.counters);
  return (
    readCounter(stats.storageUsageBytes) === expected.storageUsageBytes &&
    readCounter(stats.attachmentStorageFiles) === expected.attachmentStorageFiles &&
    readCounter(counters.attachmentStorageBytes) === expected.storageUsageBytes &&
    readCounter(counters.attachmentStorageFiles) === expected.attachmentStorageFiles
  );
}

async function writeExactCounters(uid: string, expected: ExpectedStorageCounters): Promise<void> {
  await db.collection("user_stats").doc(uid).set(
    {
      storageUsageBytes: expected.storageUsageBytes,
      attachmentStorageFiles: expected.attachmentStorageFiles,
      "counters.attachmentStorageBytes": expected.storageUsageBytes,
      "counters.attachmentStorageFiles": expected.attachmentStorageFiles,
      lastRecoveredAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function recordFailure(params: {
  candidate: Candidate;
  operation: "verify" | "reconcile" | "rebuild";
  message: string;
  failureClass?: "validation_failed" | "write_failed" | "authority_missing";
  correlationId?: string;
}) {
  const failure = await recordProjectionFailure({
    projectionName: PROJECTION_NAME,
    projectionCollection: "user_stats.storageUsageBytes,user_stats.attachmentStorageFiles",
    triggerName: "recoverAttachmentCleanupCounters",
    sourcePath: params.candidate.authorityPath,
    sourceEventId: `attachment_cleanup_counters:${params.candidate.uid}`,
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
    const [userSnap, statsSnap, expected] = await Promise.all([
      db.collection("users").doc(candidate.uid).get(),
      db.collection("user_stats").doc(candidate.uid).get(),
      computeExpected(candidate.uid),
    ]);
    const hasStorageAuthority = expected.storageUsageBytes > 0 || expected.attachmentStorageFiles > 0;
    if (!userSnap.exists && statsSnap.exists) {
      extraProjectionCount += 1;
      sampleFailures.push({ authorityPath: candidate.authorityPath, projectionPath: `user_stats/${candidate.uid}`, reason: "orphan_counter_doc" });
      continue;
    }
    if (!statsSnap.exists && hasStorageAuthority) {
      missingProjectionCount += 1;
      sampleFailures.push({ authorityPath: `attachments(uploader.uid=${candidate.uid})`, projectionPath: `user_stats/${candidate.uid}`, reason: "missing_counter_doc" });
      continue;
    }
    if (!statsSnap.exists) {
      matched += 1;
      continue;
    }
    if (countersMatch(expected, statsSnap.data() || {})) {
      matched += 1;
    } else {
      staleProjectionCount += 1;
      mismatchCount += 1;
      sampleFailures.push({ authorityPath: `attachments(uploader.uid=${candidate.uid})`, projectionPath: `user_stats/${candidate.uid}`, reason: "storage_counter_or_attachment_size_drift" });
    }
  }

  const failed = missingProjectionCount + staleProjectionCount + extraProjectionCount;
  return createVerificationResult({
    verificationId,
    projectionName: PROJECTION_NAME,
    authorityQuery: `attachments aggregate by uploader.uid scope=${request.scope}`,
    projectionQuery: "user_stats.storageUsageBytes + user_stats.attachmentStorageFiles",
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

export async function recoverAttachmentCleanupCountersForRequest(
  rawRequest: AttachmentCleanupRecoveryRequest,
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
        const [statsSnap, expected] = await Promise.all([
          db.collection("user_stats").doc(candidate.uid).get(),
          computeExpected(candidate.uid),
        ]);
        const hasStorageAuthority = expected.storageUsageBytes > 0 || expected.attachmentStorageFiles > 0;
        const needsWrite = hasStorageAuthority && (!statsSnap.exists || !countersMatch(expected, statsSnap.data() || {}));
        if (needsWrite) wouldWrite += 1;
        if (request.mode === "write" && request.reconciliationMode === "repair" && needsWrite) {
          await writeExactCounters(candidate.uid, expected);
          written += 1;
        } else {
          skipped += needsWrite ? 1 : 0;
        }
      } catch (error) {
        failed += 1;
        failureLedgerIds.push(await recordFailure({
          candidate,
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
    const verification = request.verify ? await verifyCandidates(candidates, request, `${summary.runId}:verification`) : null;
    if (verification) {
      await writeVerificationResult(verification);
      await updateProjectionHealthFromVerification(verification);
    }
    const verificationFailures = verification
      ? verification.missingProjectionCount + verification.staleProjectionCount + verification.mismatchCount + verification.extraProjectionCount
      : 0;
    summary = await completeRecoveryRun(summary, {
      status: failed > 0 ? "partial" : nextCursor ? "partial" : "completed",
      scanned: candidates.length,
      eligible: candidates.length,
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
    summary = await failRecoveryRun(summary, { failedCount: Math.max(1, summary.failed), failureLedgerIds });
    await updateProjectionHealthFromRecoverySummary(summary);
    throw error;
  }
}

export const recoverAttachmentCleanupCounters = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  assertRoleFromClaims(caller, "superadmin");
  return recoverAttachmentCleanupCountersForRequest(request.data as AttachmentCleanupRecoveryRequest, caller.uid);
});
