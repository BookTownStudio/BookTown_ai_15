import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldPath } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import { assertActiveAuthenticatedUser, assertRoleFromClaims } from "../shared/auth";
import {
  NOTIFICATION_SUMMARY_COLLECTION,
  notificationSummaryRef,
} from "../notifications/notificationSummary";
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
import { recordOperationalMetric } from "../operations/operationalMetrics";

const db = admin.firestore();

const NOTIFICATION_SUMMARY_RECOVERY_BATCH_DEFAULT = 100;
const NOTIFICATION_SUMMARY_RECOVERY_BATCH_MAX = 100;
const NOTIFICATION_SUMMARY_PROJECTION_NAME = "notification_summary";

type NotificationSummaryScope =
  | "single_user"
  | "user_batch"
  | "collection_page"
  | "checkpointed_full";

type NotificationSummaryRecoveryRequest = {
  mode?: RecoveryMode;
  scope: NotificationSummaryScope;
  uid?: string;
  userIds?: string[];
  cursor?: string;
  checkpointId?: string;
  batchSize?: number;
  maxDocs?: number;
  verify?: boolean;
  requestedBy?: string;
  reason?: string;
  correlationId?: string;
  reconciliationMode?: "report_only" | "repair";
};

type ExpectedNotificationSummary = {
  projectionVersion: 1;
  unreadCount: number;
  latestNotificationAt: string | null;
  lastReadAt: string | null;
  sourceCollection: "notifications";
};

type NotificationSummaryRecoveryResult = {
  summary: RecoverySummary;
  verification: VerificationResult | null;
  reconciliation: {
    mode: "report_only" | "repair";
    driftedUserCount: number;
    repairedUserCount: number;
  };
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

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    const parsed = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return null;
}

function maxIso(current: string | null, candidate: string | null): string | null {
  if (!candidate) return current;
  if (!current) return candidate;
  return new Date(candidate).getTime() > new Date(current).getTime() ? candidate : current;
}

function normalizeUserIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  for (const entry of value) {
    const uid = readString(entry, 128);
    if (uid) ids.add(uid);
    if (ids.size >= NOTIFICATION_SUMMARY_RECOVERY_BATCH_MAX) break;
  }
  return [...ids];
}

function parseDualCursor(cursor: string | undefined): {
  notificationsCursor?: string;
  summariesCursor?: string;
} {
  if (!cursor) return {};
  try {
    const parsed = JSON.parse(cursor) as Record<string, unknown>;
    return {
      notificationsCursor: readString(parsed.notificationsCursor, 500) || undefined,
      summariesCursor: readString(parsed.summariesCursor, 500) || undefined,
    };
  } catch {
    return {
      notificationsCursor: cursor,
      summariesCursor: cursor,
    };
  }
}

function buildDualCursor(params: {
  notificationsCursor: string | null;
  summariesCursor: string | null;
}): string | null {
  if (!params.notificationsCursor && !params.summariesCursor) return null;
  return JSON.stringify(params);
}

function normalizeNotificationSummaryRequest(
  raw: unknown,
  fallbackUid: string
): Required<
  Pick<NotificationSummaryRecoveryRequest, "mode" | "scope" | "batchSize" | "maxDocs" | "verify" | "requestedBy" | "reason" | "reconciliationMode">
> & Omit<NotificationSummaryRecoveryRequest, "mode" | "scope" | "batchSize" | "maxDocs" | "verify" | "requestedBy" | "reason" | "reconciliationMode"> {
  const input =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const scope = readString(input.scope, 40) as NotificationSummaryScope;
  if (
    scope !== "single_user" &&
    scope !== "user_batch" &&
    scope !== "collection_page" &&
    scope !== "checkpointed_full"
  ) {
    throw new HttpsError("invalid-argument", "Invalid notification summary recovery scope.");
  }

  const modeRaw = readString(input.mode, 20);
  const mode: RecoveryMode = modeRaw === "write" ? "write" : "dry_run";
  const reconciliationModeRaw = readString(input.reconciliationMode, 20);
  const reconciliationMode = reconciliationModeRaw === "repair" ? "repair" : "report_only";
  const requestedBy = readString(input.requestedBy, 128) || fallbackUid;
  const reason = readString(input.reason, 500);
  if (!reason) {
    throw new HttpsError("invalid-argument", "reason is required.");
  }

  return {
    mode,
    scope,
    uid: readString(input.uid, 128) || undefined,
    userIds: normalizeUserIds(input.userIds),
    cursor: readString(input.cursor, 500) || undefined,
    checkpointId: readString(input.checkpointId, 500) || undefined,
    batchSize: readPositiveInt(
      input.batchSize,
      NOTIFICATION_SUMMARY_RECOVERY_BATCH_DEFAULT,
      NOTIFICATION_SUMMARY_RECOVERY_BATCH_MAX
    ),
    maxDocs: readPositiveInt(input.maxDocs, NOTIFICATION_SUMMARY_RECOVERY_BATCH_DEFAULT, MAX_RECOVERY_BATCH_SIZE),
    verify: readBoolean(input.verify, true),
    requestedBy,
    reason,
    correlationId: readString(input.correlationId, 128) || undefined,
    reconciliationMode,
  };
}

function mapScope(scope: NotificationSummaryScope): RecoveryScope {
  if (scope === "single_user") return "single_doc";
  if (scope === "user_batch") return "owner";
  return scope;
}

function buildRecoveryRequest(input: ReturnType<typeof normalizeNotificationSummaryRequest>): RecoveryRequest {
  return {
    projectionName: NOTIFICATION_SUMMARY_PROJECTION_NAME,
    mode: input.mode,
    scope: mapScope(input.scope),
    targetId: input.uid,
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

function normalizeActualSummary(data: Record<string, unknown>): ExpectedNotificationSummary {
  const unreadCount =
    typeof data.unreadCount === "number" && Number.isFinite(data.unreadCount)
      ? Math.max(0, Math.trunc(data.unreadCount))
      : 0;
  return {
    projectionVersion: 1,
    unreadCount,
    latestNotificationAt: toIso(data.latestNotificationAt),
    lastReadAt: toIso(data.lastReadAt),
    sourceCollection: "notifications",
  };
}

function summaryMatches(expected: ExpectedNotificationSummary, actual: ExpectedNotificationSummary): boolean {
  return (
    expected.unreadCount === actual.unreadCount &&
    expected.latestNotificationAt === actual.latestNotificationAt &&
    expected.lastReadAt === actual.lastReadAt
  );
}

async function computeNotificationSummary(uid: string): Promise<ExpectedNotificationSummary> {
  const snap = await db
    .collection("notifications")
    .where("uid", "==", uid)
    .get();

  let unreadCount = 0;
  let latestNotificationAt: string | null = null;
  let lastReadAt: string | null = null;

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    if (data.read !== true) unreadCount += 1;
    latestNotificationAt = maxIso(
      latestNotificationAt,
      toIso(data.lastUpdatedAt) ?? toIso(data.createdAt)
    );
    if (data.read === true) {
      lastReadAt = maxIso(lastReadAt, toIso(data.readAt));
    }
  }

  return {
    projectionVersion: 1,
    unreadCount,
    latestNotificationAt,
    lastReadAt,
    sourceCollection: "notifications",
  };
}

async function loadNotificationSummaryUsers(
  request: ReturnType<typeof normalizeNotificationSummaryRequest>
): Promise<{
  userIds: string[];
  scannedAuthorityDocs: number;
  nextCursor: string | null;
  checkpointId: string | null;
}> {
  if (request.scope === "single_user") {
    if (!request.uid) {
      throw new HttpsError("invalid-argument", "uid is required for single_user recovery.");
    }
    return {
      userIds: [request.uid],
      scannedAuthorityDocs: 1,
      nextCursor: null,
      checkpointId: null,
    };
  }

  if (request.scope === "user_batch") {
    if (!request.userIds || request.userIds.length === 0) {
      throw new HttpsError("invalid-argument", "userIds is required for user_batch recovery.");
    }
    return {
      userIds: request.userIds.slice(0, Math.min(request.batchSize, request.maxDocs)),
      scannedAuthorityDocs: request.userIds.length,
      nextCursor: null,
      checkpointId: null,
    };
  }

  let cursor = request.cursor;
  let checkpointId: string | null = null;
  if (request.scope === "checkpointed_full") {
    checkpointId = request.checkpointId || buildRecoveryCheckpointId({
      projectionName: NOTIFICATION_SUMMARY_PROJECTION_NAME,
      scope: "checkpointed_full",
    });
    const checkpoint = await readRecoveryCheckpoint(checkpointId);
    cursor = request.cursor || checkpoint?.cursor || undefined;
  }

  const limit = Math.min(request.batchSize, request.maxDocs);
  const parsedCursor = parseDualCursor(cursor);
  let query = db
    .collection("notifications")
    .orderBy(FieldPath.documentId())
    .limit(limit);
  if (parsedCursor.notificationsCursor) query = query.startAfter(parsedCursor.notificationsCursor);
  const snap = await query.get();

  let summaryQuery = db
    .collection(NOTIFICATION_SUMMARY_COLLECTION)
    .orderBy(FieldPath.documentId())
    .limit(limit);
  if (parsedCursor.summariesCursor) summaryQuery = summaryQuery.startAfter(parsedCursor.summariesCursor);
  const summarySnap = await summaryQuery.get();

  const userIds = new Set<string>();
  for (const doc of snap.docs) {
    const uid = readString(doc.get("uid"), 128);
    if (uid) userIds.add(uid);
  }
  for (const doc of summarySnap.docs) {
    const uid = readString(doc.id, 128);
    if (uid) userIds.add(uid);
  }

  const notificationsCursor =
    snap.size === limit ? snap.docs[snap.docs.length - 1].id : null;
  const summariesCursor =
    summarySnap.size === limit ? summarySnap.docs[summarySnap.docs.length - 1].id : null;

  return {
    userIds: [...userIds],
    scannedAuthorityDocs: snap.size + summarySnap.size,
    nextCursor: buildDualCursor({ notificationsCursor, summariesCursor }),
    checkpointId,
  };
}

async function verifyNotificationSummaryUsers(
  userIds: string[],
  verificationId: string
): Promise<VerificationResult> {
  let scanned = 0;
  let matched = 0;
  let missingProjectionCount = 0;
  let staleProjectionCount = 0;
  let mismatchCount = 0;
  let extraProjectionCount = 0;
  const sampleFailures: VerificationResult["sampleFailures"] = [];

  for (const uid of userIds) {
    scanned += 1;
    const expected = await computeNotificationSummary(uid);
    const summaryRef = notificationSummaryRef(uid);
    const snap = await summaryRef.get();
    const shouldExist =
      expected.unreadCount > 0 ||
      expected.latestNotificationAt !== null ||
      expected.lastReadAt !== null;

    if (shouldExist && !snap.exists) {
      missingProjectionCount += 1;
      if (sampleFailures.length < 20) {
        sampleFailures.push({
          authorityPath: `notifications where uid=${uid}`,
          projectionPath: summaryRef.path,
          reason: "missing_projection",
        });
      }
      continue;
    }

    if (!shouldExist && snap.exists) {
      extraProjectionCount += 1;
      if (sampleFailures.length < 20) {
        sampleFailures.push({
          authorityPath: `notifications where uid=${uid}`,
          projectionPath: summaryRef.path,
          reason: "extra_projection",
        });
      }
      continue;
    }

    if (snap.exists) {
      const actual = normalizeActualSummary(snap.data() || {});
      if (!summaryMatches(expected, actual)) {
        staleProjectionCount += 1;
        mismatchCount += 1;
        if (sampleFailures.length < 20) {
          sampleFailures.push({
            authorityPath: `notifications where uid=${uid}`,
            projectionPath: summaryRef.path,
            reason: "stale_projection",
          });
        }
        continue;
      }
    }

    matched += 1;
  }

  const failed = missingProjectionCount + staleProjectionCount + extraProjectionCount;
  return createVerificationResult({
    verificationId,
    projectionName: NOTIFICATION_SUMMARY_PROJECTION_NAME,
    authorityQuery: "notifications grouped by uid",
    projectionQuery: NOTIFICATION_SUMMARY_COLLECTION,
    status: failed === 0 ? "passed" : "failed",
    scanned,
    matched,
    missingProjectionCount,
    staleProjectionCount,
    mismatchCount,
    extraProjectionCount,
    verificationSuccessRate: scanned > 0 ? Number((matched / scanned).toFixed(6)) : 1,
    sampleFailures,
    nextCursor: null,
  });
}

async function writeExpectedSummary(uid: string, expected: ExpectedNotificationSummary): Promise<void> {
  const ref = notificationSummaryRef(uid);
  const shouldExist =
    expected.unreadCount > 0 ||
    expected.latestNotificationAt !== null ||
    expected.lastReadAt !== null;
  if (!shouldExist) {
    await ref.delete();
    return;
  }
  await ref.set(
    {
      ...expected,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function recoverNotificationSummaryForRequest(
  rawRequest: NotificationSummaryRecoveryRequest,
  fallbackUid = "system"
): Promise<NotificationSummaryRecoveryResult> {
  const request = normalizeNotificationSummaryRequest(rawRequest, fallbackUid);
  const recoveryRequest = buildRecoveryRequest(request);
  let summary = await startRecoveryRun(recoveryRequest);
  const failureLedgerIds: string[] = [];
  let driftedUserCount = 0;
  let repairedUserCount = 0;

  try {
    const { userIds, scannedAuthorityDocs, nextCursor, checkpointId } =
      await loadNotificationSummaryUsers(request);
    let eligible = 0;
    let wouldWrite = 0;
    let written = 0;
    let skipped = 0;
    let failed = 0;

    for (const uid of userIds) {
      try {
        const expected = await computeNotificationSummary(uid);
        const snap = await notificationSummaryRef(uid).get();
        const actual = snap.exists ? normalizeActualSummary(snap.data() || {}) : null;
        const shouldExist =
          expected.unreadCount > 0 ||
          expected.latestNotificationAt !== null ||
          expected.lastReadAt !== null;
        const drifted = (shouldExist && !actual) || (!shouldExist && !!actual) || (!!actual && !summaryMatches(expected, actual));
        eligible += 1;
        wouldWrite += drifted ? 1 : 0;
        if (drifted) driftedUserCount += 1;

        const shouldRepair = request.mode === "write";
        if (shouldRepair && drifted) {
          await writeExpectedSummary(uid, expected);
          written += 1;
          repairedUserCount += 1;
        } else {
          skipped += drifted ? 1 : 0;
        }
      } catch (error) {
        failed += 1;
        const failure = await recordProjectionFailure({
          projectionName: NOTIFICATION_SUMMARY_PROJECTION_NAME,
          projectionCollection: NOTIFICATION_SUMMARY_COLLECTION,
          triggerName: "recoverNotificationSummary",
          sourcePath: `notifications?uid=${uid}`,
          sourceEventId: `recovery:${summary.runId}:${uid}`,
          operation: "reconcile",
          failureClass: "write_failed",
          lastErrorMessage: error instanceof Error ? error.message : String(error),
          correlationId: request.correlationId,
        });
        failureLedgerIds.push(failure.failureId);
        await updateProjectionHealthFromFailure(failure);
      }
    }

    await recordOperationalMetric({
      name: "notification_projection_reconciliation",
      value: driftedUserCount,
      unit: "count",
      dimensions: {
        projectionName: NOTIFICATION_SUMMARY_PROJECTION_NAME,
        operation: request.reconciliationMode,
        driftedUserCount,
        repairedUserCount,
        failed,
      },
    });

    if (checkpointId) {
      await updateRecoveryCheckpointProgress({
        checkpointId,
        projectionName: NOTIFICATION_SUMMARY_PROJECTION_NAME,
        scope: "checkpointed_full",
        cursor: nextCursor,
        lastProcessedPath: nextCursor,
        scannedDelta: scannedAuthorityDocs,
        writtenDelta: written,
        failedDelta: failed,
        status: nextCursor ? "partial" : "completed",
      });
    }

    let verification: VerificationResult | null = null;
    let verificationFailures = 0;
    if (request.verify) {
      verification = await verifyNotificationSummaryUsers(userIds, `${summary.runId}:verification`);
      await writeVerificationResult(verification);
      await updateProjectionHealthFromVerification(verification);
      verificationFailures =
        verification.missingProjectionCount +
        verification.staleProjectionCount +
        verification.extraProjectionCount;
    }

    summary = await completeRecoveryRun(summary, {
      status: failed > 0 ? "partial" : nextCursor ? "partial" : "completed",
      scanned: scannedAuthorityDocs,
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

    const definition = getProjectionDefinition(NOTIFICATION_SUMMARY_PROJECTION_NAME);
    const certification = definition ? evaluateProjectionCertification(definition) : null;
    return {
      summary,
      verification,
      reconciliation: {
        mode: request.reconciliationMode,
        driftedUserCount,
        repairedUserCount,
      },
      certification: [
        {
          projectionName: NOTIFICATION_SUMMARY_PROJECTION_NAME,
          passed: certification?.passed ?? false,
          missingRequirements: certification?.missingRequirements ?? ["registered_definition"],
        },
      ],
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

export const recoverNotificationSummary = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  assertRoleFromClaims(caller, "superadmin");
  return recoverNotificationSummaryForRequest(
    request.data as NotificationSummaryRecoveryRequest,
    caller.uid
  );
});
