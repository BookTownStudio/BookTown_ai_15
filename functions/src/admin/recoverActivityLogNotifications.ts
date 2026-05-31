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

const PROJECTION_NAME = "activity_log_notifications";
const DEFAULT_BATCH_SIZE = 100;
const HARD_MAX_BATCH_SIZE = 100;

const CANONICAL_PREFS = {
  channels: { in_app: true, email: false, push: false },
  categories: {
    likes: true,
    comments: true,
    reposts: true,
    follows: true,
    mentions: true,
    quotes: true,
    system: true,
    messages: true,
  },
};

type ActivityNotificationScope =
  | "single_activity"
  | "single_user"
  | "collection_page"
  | "checkpointed_full";

type ReconciliationMode = "report_only" | "repair";

type ActivityNotificationRecoveryRequest = {
  mode?: RecoveryMode;
  scope: ActivityNotificationScope;
  activityId?: string;
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

type NotificationCategory = "likes" | "comments" | "reposts" | "follows";
type NotificationPriority = "low" | "medium" | "high";

type Candidate = {
  activityId: string;
  authorityPath: string;
  data: Record<string, unknown>;
};

type ExpectedNotification = {
  eligible: boolean;
  suppressedReason?: string;
  notificationId?: string;
  recipientUid?: string;
  type?: string;
  category?: NotificationCategory;
  priority?: NotificationPriority;
  entityType?: string;
  entityId?: string;
  actorUid?: string;
  actorName?: string;
  dedupeId?: string;
  sourceActivityId?: string;
  count?: number;
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

function nestedRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeRequest(
  raw: unknown,
  fallbackUid: string
): Required<
  Pick<
    ActivityNotificationRecoveryRequest,
    "mode" | "scope" | "batchSize" | "maxDocs" | "verify" | "reconciliationMode" | "requestedBy" | "reason"
  >
> &
  Omit<
    ActivityNotificationRecoveryRequest,
    "mode" | "scope" | "batchSize" | "maxDocs" | "verify" | "reconciliationMode" | "requestedBy" | "reason"
  > {
  const input =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const scope = readString(input.scope, 40) as ActivityNotificationScope;
  if (
    scope !== "single_activity" &&
    scope !== "single_user" &&
    scope !== "collection_page" &&
    scope !== "checkpointed_full"
  ) {
    throw new HttpsError("invalid-argument", "Invalid activity notification recovery scope.");
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
    activityId: readString(input.activityId, 190) || undefined,
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

function toRecoveryScope(scope: ActivityNotificationScope): RecoveryScope {
  if (scope === "single_activity") return "single_doc";
  if (scope === "single_user") return "owner";
  return scope;
}

function buildRecoveryRequest(input: ReturnType<typeof normalizeRequest>): RecoveryRequest {
  return {
    projectionName: PROJECTION_NAME,
    mode: input.mode,
    scope: toRecoveryScope(input.scope),
    targetId: input.activityId,
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

function resolveNotificationKind(verb: unknown): {
  category: NotificationCategory;
  type: string;
  priority: NotificationPriority;
  entityType: string;
} | null {
  if (verb === "post_liked") return { category: "likes", type: "like", priority: "low", entityType: "post" };
  if (verb === "post_commented") return { category: "comments", type: "comment", priority: "medium", entityType: "post" };
  if (verb === "post_reposted") return { category: "reposts", type: "repost", priority: "medium", entityType: "post" };
  if (verb === "user_followed") return { category: "follows", type: "follow", priority: "medium", entityType: "profile" };
  return null;
}

function buildDedupeId(params: {
  recipientUid: string;
  type: string;
  actorUid: string;
  entityId: string;
}): string {
  return `${params.recipientUid}_${params.type}_${params.actorUid}_${params.entityId}`;
}

function notificationMatches(
  expected: ExpectedNotification,
  notification: Record<string, unknown>
): boolean {
  if (!expected.eligible) return false;
  const actor = nestedRecord(notification.actor);
  const target = nestedRecord(notification.target);
  return (
    notification.uid === expected.recipientUid &&
    notification.type === expected.type &&
    notification.priority === expected.priority &&
    notification.actorId === expected.actorUid &&
    actor.uid === expected.actorUid &&
    notification.entityType === expected.entityType &&
    notification.entityId === expected.entityId &&
    notification.postId === (expected.entityType === "post" ? expected.entityId : null) &&
    notification.dedupeId === expected.dedupeId &&
    target.entity_type === expected.entityType &&
    target.entity_id === expected.entityId &&
    readPositiveInt(notification.count, 0, Number.MAX_SAFE_INTEGER) === expected.count
  );
}

async function loadCandidates(request: ReturnType<typeof normalizeRequest>): Promise<{
  candidates: Candidate[];
  nextCursor: string | null;
  checkpointId: string | null;
  lastProcessedPath: string | null;
}> {
  if (request.scope === "single_activity") {
    if (!request.activityId) throw new HttpsError("invalid-argument", "activityId is required.");
    const snap = await db.collection("activity_log").doc(request.activityId).get();
    if (!snap.exists) {
      return { candidates: [], nextCursor: null, checkpointId: null, lastProcessedPath: `activity_log/${request.activityId}` };
    }
    return {
      candidates: [{ activityId: snap.id, authorityPath: snap.ref.path, data: snap.data() || {} }],
      nextCursor: null,
      checkpointId: null,
      lastProcessedPath: snap.ref.path,
    };
  }

  if (request.scope === "single_user" && !request.uid) {
    throw new HttpsError("invalid-argument", "uid is required.");
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

  const base =
    request.scope === "single_user"
      ? db.collection("activity_log").where("context.target_owner_uid", "==", request.uid || "").orderBy(FieldPath.documentId())
      : db.collection("activity_log").orderBy(FieldPath.documentId());
  const snap = await (cursor ? base.startAfter(cursor) : base).limit(limit).get();
  return {
    candidates: snap.docs.map((doc) => ({ activityId: doc.id, authorityPath: doc.ref.path, data: doc.data() || {} })),
    nextCursor: snap.size === limit ? snap.docs[snap.docs.length - 1].id : null,
    checkpointId,
    lastProcessedPath: snap.docs[snap.docs.length - 1]?.ref.path ?? null,
  };
}

async function preferencesAllow(recipientUid: string, category: NotificationCategory): Promise<boolean> {
  const prefSnap = await db.collection("notification_preferences").doc(recipientUid).get();
  const prefs = prefSnap.exists ? nestedRecord(prefSnap.data()) : CANONICAL_PREFS;
  const channels = nestedRecord(prefs.channels);
  const categories = nestedRecord(prefs.categories);
  return channels.in_app !== false && categories[category] !== false;
}

async function buildExpected(candidate: Candidate): Promise<ExpectedNotification> {
  const activity = candidate.data;
  const actor = nestedRecord(activity.actor);
  const object = nestedRecord(activity.object);
  const context = nestedRecord(activity.context);
  const kind = resolveNotificationKind(activity.verb);
  if (!kind) return { eligible: false, suppressedReason: "ineligible_verb" };

  const recipientUid = readString(context.target_owner_uid, 128);
  const actorUid = readString(actor.uid, 128);
  const entityId = readString(object.entity_id, 190);
  if (!recipientUid || !actorUid || !entityId) {
    return { eligible: false, suppressedReason: "missing_required_activity_fields" };
  }
  if (recipientUid === actorUid) {
    return { eligible: false, suppressedReason: "self_notification_suppressed" };
  }
  if (!(await preferencesAllow(recipientUid, kind.category))) {
    return { eligible: false, suppressedReason: "preference_suppressed" };
  }

  const dedupeId = buildDedupeId({
    recipientUid,
    type: kind.type,
    actorUid,
    entityId,
  });
  const duplicateSnap = await db
    .collection("activity_log")
    .where("context.target_owner_uid", "==", recipientUid)
    .where("actor.uid", "==", actorUid)
    .where("object.entity_id", "==", entityId)
    .where("verb", "==", activity.verb)
    .limit(HARD_MAX_BATCH_SIZE)
    .get();
  const actorSnap = await db.collection("users").doc(actorUid).get();
  const actorName = actorSnap.exists ? readString(actorSnap.data()?.name, 120) || "Someone" : "Someone";

  return {
    eligible: true,
    notificationId: dedupeId,
    recipientUid,
    type: kind.type,
    category: kind.category,
    priority: kind.priority,
    entityType: kind.entityType,
    entityId,
    actorUid,
    actorName,
    dedupeId,
    sourceActivityId: candidate.activityId,
    count: Math.max(1, duplicateSnap.size),
  };
}

async function writeExpectedNotification(expected: ExpectedNotification): Promise<void> {
  if (!expected.eligible || !expected.notificationId) return;
  const ref = db.collection("notifications").doc(expected.notificationId);
  const existing = await ref.get();
  const existingData = existing.exists ? existing.data() || {} : {};
  const now = admin.firestore.FieldValue.serverTimestamp();
  await ref.set(
    {
      uid: expected.recipientUid,
      type: expected.type,
      priority: expected.priority,
      actor: { uid: expected.actorUid, name: expected.actorName },
      target: { entity_type: expected.entityType, entity_id: expected.entityId },
      actorId: expected.actorUid,
      actorType: "user",
      entityType: expected.entityType,
      entityId: expected.entityId,
      postId: expected.entityType === "post" ? expected.entityId : null,
      sourceActivityId: existingData.sourceActivityId ?? expected.sourceActivityId,
      dedupeId: expected.dedupeId,
      message: `${expected.actorName} interacted with your ${expected.entityType}`,
      read: existingData.read === true,
      readAt: existingData.readAt ?? null,
      count: expected.count,
      createdAt: existingData.createdAt ?? now,
      lastRecoveredAt: now,
      lastUpdatedAt: now,
    },
    { merge: true }
  );
}

async function findOrphanNotifications(request: ReturnType<typeof normalizeRequest>): Promise<{
  extraProjectionCount: number;
  sampleFailures: VerificationResult["sampleFailures"];
}> {
  if (request.scope !== "single_user" || !request.uid) {
    return { extraProjectionCount: 0, sampleFailures: [] };
  }
  const snap = await db
    .collection("notifications")
    .where("uid", "==", request.uid)
    .orderBy(FieldPath.documentId())
    .limit(Math.min(request.batchSize, HARD_MAX_BATCH_SIZE))
    .get();
  let extraProjectionCount = 0;
  const sampleFailures: VerificationResult["sampleFailures"] = [];
  for (const doc of snap.docs) {
    const sourceActivityId = readString(doc.data().sourceActivityId, 190);
    if (!sourceActivityId) {
      extraProjectionCount += 1;
      sampleFailures.push({
        authorityPath: null,
        projectionPath: doc.ref.path,
        reason: "orphan_notification_missing_source_activity_id",
      });
      continue;
    }
    const activitySnap = await db.collection("activity_log").doc(sourceActivityId).get();
    if (!activitySnap.exists) {
      extraProjectionCount += 1;
      sampleFailures.push({
        authorityPath: `activity_log/${sourceActivityId}`,
        projectionPath: doc.ref.path,
        reason: "orphan_notification_missing_activity",
      });
    }
  }
  return { extraProjectionCount, sampleFailures };
}

async function recordFailure(params: {
  candidate: Candidate;
  operation: "verify" | "reconcile" | "rebuild";
  message: string;
  failureClass?: "validation_failed" | "write_failed" | "authority_missing" | "partial_fanout";
  correlationId?: string;
}) {
  const failure = await recordProjectionFailure({
    projectionName: PROJECTION_NAME,
    projectionCollection: "notifications",
    triggerName: "recoverActivityLogNotifications",
    sourcePath: params.candidate.authorityPath,
    sourceEventId: `activity_notification:${params.candidate.activityId}`,
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
    const expected = await buildExpected(candidate);
    if (!expected.eligible) {
      matched += 1;
      continue;
    }
    const notificationRef = db.collection("notifications").doc(expected.notificationId!);
    const [notificationSnap, duplicatesSnap] = await Promise.all([
      notificationRef.get(),
      db.collection("notifications").where("dedupeId", "==", expected.dedupeId).limit(3).get(),
    ]);
    if (!notificationSnap.exists) {
      missingProjectionCount += 1;
      sampleFailures.push({
        authorityPath: candidate.authorityPath,
        projectionPath: notificationRef.path,
        reason: "missing_notification",
      });
      continue;
    }
    if (duplicatesSnap.size > 1) {
      extraProjectionCount += duplicatesSnap.size - 1;
      sampleFailures.push({
        authorityPath: candidate.authorityPath,
        projectionPath: notificationRef.path,
        reason: "duplicate_notification_records",
      });
    }
    if (notificationMatches(expected, notificationSnap.data() || {})) {
      matched += 1;
    } else {
      staleProjectionCount += 1;
      mismatchCount += 1;
      sampleFailures.push({
        authorityPath: candidate.authorityPath,
        projectionPath: notificationRef.path,
        reason: "activity_to_notification_mismatch_or_collapse_drift",
      });
    }
  }

  const orphanScan = await findOrphanNotifications(request);
  extraProjectionCount += orphanScan.extraProjectionCount;
  sampleFailures.push(...orphanScan.sampleFailures);

  const failed = missingProjectionCount + staleProjectionCount + extraProjectionCount;
  return createVerificationResult({
    verificationId,
    projectionName: PROJECTION_NAME,
    authorityQuery: `activity_log scope=${request.scope}`,
    projectionQuery: "notifications",
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

export async function recoverActivityLogNotificationsForRequest(
  rawRequest: ActivityNotificationRecoveryRequest,
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
        const expected = await buildExpected(candidate);
        if (!expected.eligible) {
          skipped += 1;
          continue;
        }
        const notificationSnap = await db.collection("notifications").doc(expected.notificationId!).get();
        const needsWrite =
          !notificationSnap.exists || !notificationMatches(expected, notificationSnap.data() || {});
        if (needsWrite) wouldWrite += 1;
        if (request.mode === "write" && request.reconciliationMode === "repair" && needsWrite) {
          await writeExpectedNotification(expected);
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

    let verification: VerificationResult | null = null;
    let verificationFailures = 0;
    if (request.verify) {
      verification = await verifyCandidates(candidates, request, `${summary.runId}:verification`);
      await writeVerificationResult(verification);
      await updateProjectionHealthFromVerification(verification);
      verificationFailures =
        verification.missingProjectionCount +
        verification.staleProjectionCount +
        verification.mismatchCount +
        verification.extraProjectionCount;
    }

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
    summary = await failRecoveryRun(summary, {
      failedCount: Math.max(1, summary.failed),
      failureLedgerIds,
    });
    await updateProjectionHealthFromRecoverySummary(summary);
    throw error;
  }
}

export const recoverActivityLogNotifications = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  assertRoleFromClaims(caller, "superadmin");
  return recoverActivityLogNotificationsForRequest(
    request.data as ActivityNotificationRecoveryRequest,
    caller.uid
  );
});
