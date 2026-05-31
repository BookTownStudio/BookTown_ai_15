import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
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

const SOCIAL_PROJECTION_NAME = "social_user_stats";
const PUBLIC_COUNTERS_PROJECTION_NAME = "public_profile_counters";
const DEFAULT_BATCH_SIZE = 100;
const HARD_MAX_BATCH_SIZE = 100;

type FollowGraphScope =
  | "single_edge"
  | "single_user"
  | "collection_page"
  | "checkpointed_full";

type ReconciliationMode = "report_only" | "repair";

type FollowGraphRecoveryRequest = {
  mode?: RecoveryMode;
  scope: FollowGraphScope;
  followerUid?: string;
  targetUid?: string;
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

type CandidateUser = {
  uid: string;
  authorityPath: string;
};

type EdgeCheck = {
  followerUid: string;
  targetUid: string;
  followerPath: string;
  followingPath: string;
  followerExists: boolean;
  followingExists: boolean;
  schemaMismatch: boolean;
  createdAtMismatch: boolean;
};

type UserExpectedCounters = {
  uid: string;
  followers: number;
  following: number;
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

function normalizeRequest(
  raw: unknown,
  fallbackUid: string
): Required<
  Pick<
    FollowGraphRecoveryRequest,
    "mode" | "scope" | "batchSize" | "maxDocs" | "verify" | "reconciliationMode" | "requestedBy" | "reason"
  >
> &
  Omit<
    FollowGraphRecoveryRequest,
    "mode" | "scope" | "batchSize" | "maxDocs" | "verify" | "reconciliationMode" | "requestedBy" | "reason"
  > {
  const input =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const scope = readString(input.scope, 40) as FollowGraphScope;
  if (
    scope !== "single_edge" &&
    scope !== "single_user" &&
    scope !== "collection_page" &&
    scope !== "checkpointed_full"
  ) {
    throw new HttpsError("invalid-argument", "Invalid follow graph recovery scope.");
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
    followerUid: readString(input.followerUid, 128) || undefined,
    targetUid: readString(input.targetUid, 128) || undefined,
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

function toRecoveryScope(scope: FollowGraphScope): RecoveryScope {
  if (scope === "single_edge") return "single_doc";
  if (scope === "single_user") return "owner";
  return scope;
}

function buildRecoveryRequest(input: ReturnType<typeof normalizeRequest>): RecoveryRequest {
  return {
    projectionName: SOCIAL_PROJECTION_NAME,
    mode: input.mode,
    scope: toRecoveryScope(input.scope),
    targetId:
      input.scope === "single_edge" && input.followerUid && input.targetUid
        ? `follow:${input.followerUid}:${input.targetUid}`
        : input.targetUid,
    ownerId: input.uid || input.followerUid,
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

function edgeId(followerUid: string, targetUid: string): string {
  return `follow_${followerUid}_${targetUid}`.replace(/[^A-Za-z0-9_.:-]+/g, "_").slice(0, 500);
}

function normalizeCreatedAt(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    const ms = value.toMillis();
    return typeof ms === "number" && Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function createdAtEquivalent(left: unknown, right: unknown): boolean {
  const leftMs = normalizeCreatedAt(left);
  const rightMs = normalizeCreatedAt(right);
  if (leftMs === null || rightMs === null) return leftMs === rightMs;
  return Math.abs(leftMs - rightMs) <= 1000;
}

async function loadCandidateUsers(request: ReturnType<typeof normalizeRequest>): Promise<{
  candidates: CandidateUser[];
  nextCursor: string | null;
  checkpointId: string | null;
  lastProcessedPath: string | null;
}> {
  if (request.scope === "single_edge") {
    if (!request.followerUid || !request.targetUid) {
      throw new HttpsError("invalid-argument", "followerUid and targetUid are required.");
    }
    return {
      candidates: [
        { uid: request.followerUid, authorityPath: `users/${request.followerUid}` },
        { uid: request.targetUid, authorityPath: `users/${request.targetUid}` },
      ],
      nextCursor: null,
      checkpointId: null,
      lastProcessedPath: `users/${request.targetUid}/followers/${request.followerUid}`,
    };
  }

  if (request.scope === "single_user") {
    if (!request.uid) throw new HttpsError("invalid-argument", "uid is required.");
    return {
      candidates: [{ uid: request.uid, authorityPath: `users/${request.uid}` }],
      nextCursor: null,
      checkpointId: null,
      lastProcessedPath: `users/${request.uid}`,
    };
  }

  let cursor = request.cursor;
  let checkpointId: string | null = null;
  if (request.scope === "checkpointed_full") {
    checkpointId =
      request.checkpointId ||
      buildRecoveryCheckpointId({ projectionName: SOCIAL_PROJECTION_NAME, scope: "checkpointed_full" });
    const checkpoint = await readRecoveryCheckpoint(checkpointId);
    cursor = request.cursor || checkpoint?.cursor || undefined;
  }

  const limit = Math.min(request.batchSize, request.maxDocs, HARD_MAX_BATCH_SIZE);
  const base = db.collection("users").orderBy(FieldPath.documentId());
  const snap = await (cursor ? base.startAfter(cursor) : base).limit(limit).get();
  return {
    candidates: snap.docs.map((doc) => ({ uid: doc.id, authorityPath: doc.ref.path })),
    nextCursor: snap.size === limit ? snap.docs[snap.docs.length - 1].id : null,
    checkpointId,
    lastProcessedPath: snap.docs[snap.docs.length - 1]?.ref.path ?? null,
  };
}

async function computeExpectedCounters(uid: string): Promise<UserExpectedCounters> {
  const [followersSnap, followingSnap] = await Promise.all([
    db.collection("users").doc(uid).collection("followers").count().get(),
    db.collection("users").doc(uid).collection("following").count().get(),
  ]);
  return {
    uid,
    followers: Math.max(0, Math.trunc(followersSnap.data().count || 0)),
    following: Math.max(0, Math.trunc(followingSnap.data().count || 0)),
  };
}

function counterMatches(value: unknown, expected: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && Math.max(0, Math.trunc(value)) === expected;
}

async function checkEdge(followerUid: string, targetUid: string): Promise<EdgeCheck> {
  const followerRef = db.collection("users").doc(targetUid).collection("followers").doc(followerUid);
  const followingRef = db.collection("users").doc(followerUid).collection("following").doc(targetUid);
  const [followerSnap, followingSnap] = await Promise.all([followerRef.get(), followingRef.get()]);
  const followerData = (followerSnap.data() || {}) as Record<string, unknown>;
  const followingData = (followingSnap.data() || {}) as Record<string, unknown>;
  const followerSchemaMismatch =
    followerSnap.exists &&
    (readString(followerData.followerUid ?? followerData.uid, 128) !== followerUid ||
      readString(followerData.targetUid, 128) !== targetUid);
  const followingSchemaMismatch =
    followingSnap.exists &&
    (readString(followingData.followerUid, 128) !== followerUid ||
      readString(followingData.targetUid ?? followingData.uid, 128) !== targetUid);
  return {
    followerUid,
    targetUid,
    followerPath: followerRef.path,
    followingPath: followingRef.path,
    followerExists: followerSnap.exists,
    followingExists: followingSnap.exists,
    schemaMismatch: followerSchemaMismatch || followingSchemaMismatch,
    createdAtMismatch:
      followerSnap.exists &&
      followingSnap.exists &&
      !createdAtEquivalent(followerData.createdAt, followingData.createdAt),
  };
}

async function loadEdgeChecksForUser(uid: string, limit: number): Promise<EdgeCheck[]> {
  const [followersSnap, followingSnap] = await Promise.all([
    db.collection("users").doc(uid).collection("followers").orderBy(FieldPath.documentId()).limit(limit).get(),
    db.collection("users").doc(uid).collection("following").orderBy(FieldPath.documentId()).limit(limit).get(),
  ]);
  const keys = new Map<string, { followerUid: string; targetUid: string }>();
  for (const doc of followersSnap.docs) {
    const data = (doc.data() || {}) as Record<string, unknown>;
    const followerUid = doc.id;
    const targetUid = readString(data.targetUid, 128) || uid;
    keys.set(edgeId(followerUid, targetUid), { followerUid, targetUid });
  }
  for (const doc of followingSnap.docs) {
    const data = (doc.data() || {}) as Record<string, unknown>;
    const followerUid = readString(data.followerUid, 128) || uid;
    const targetUid = doc.id;
    keys.set(edgeId(followerUid, targetUid), { followerUid, targetUid });
  }
  const checks: EdgeCheck[] = [];
  for (const key of keys.values()) {
    checks.push(await checkEdge(key.followerUid, key.targetUid));
  }
  return checks;
}

async function repairEdgeSchema(check: EdgeCheck): Promise<void> {
  const [followerSnap, followingSnap] = await Promise.all([
    db.doc(check.followerPath).get(),
    db.doc(check.followingPath).get(),
  ]);
  const followerData = (followerSnap.data() || {}) as Record<string, unknown>;
  const followingData = (followingSnap.data() || {}) as Record<string, unknown>;
  const createdAt =
    followerData.createdAt ||
    followingData.createdAt ||
    admin.firestore.FieldValue.serverTimestamp();
  const canonical = {
    followerUid: check.followerUid,
    targetUid: check.targetUid,
    createdAt,
  };
  const batch = db.batch();
  if (check.followerExists || check.followingExists) {
    batch.set(db.doc(check.followerPath), { ...canonical, uid: check.followerUid }, { merge: true });
    batch.set(db.doc(check.followingPath), { ...canonical, uid: check.targetUid }, { merge: true });
  }
  await batch.commit();
}

async function repairCounters(expected: UserExpectedCounters): Promise<void> {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(
    db.collection("public_profiles").doc(expected.uid),
    {
      followerCount: expected.followers,
      followingCount: expected.following,
      updatedAt: new Date().toISOString(),
      followGraphRecoveredAt: now,
    },
    { merge: true }
  );
  batch.set(
    db.collection("user_stats").doc(expected.uid),
    {
      followers: expected.followers,
      following: expected.following,
      socialStatsRecoveredAt: now,
      updatedAt: now,
    },
    { merge: true }
  );
  await batch.commit();
}

function edgeFailed(check: EdgeCheck): boolean {
  return (
    check.followerExists !== check.followingExists ||
    check.schemaMismatch ||
    check.createdAtMismatch
  );
}

async function verifyUsers(
  candidates: CandidateUser[],
  request: ReturnType<typeof normalizeRequest>,
  verificationId: string
): Promise<{ social: VerificationResult; publicCounters: VerificationResult }> {
  let scanned = 0;
  let matched = 0;
  let missing = 0;
  let stale = 0;
  let mismatch = 0;
  let extra = 0;
  const sampleFailures: VerificationResult["sampleFailures"] = [];

  let publicScanned = 0;
  let publicMatched = 0;
  let publicMissing = 0;
  let publicStale = 0;
  const publicFailures: VerificationResult["sampleFailures"] = [];

  for (const candidate of candidates) {
    const expected = await computeExpectedCounters(candidate.uid);
    const [statsSnap, publicSnap] = await Promise.all([
      db.collection("user_stats").doc(candidate.uid).get(),
      db.collection("public_profiles").doc(candidate.uid).get(),
    ]);
    scanned += 1;
    const stats = (statsSnap.data() || {}) as Record<string, unknown>;
    const statsOk = counterMatches(stats.followers, expected.followers) && counterMatches(stats.following, expected.following);
    if (statsOk) matched += 1;
    else {
      stale += 1;
      mismatch += 1;
      sampleFailures.push({
        authorityPath: candidate.authorityPath,
        projectionPath: `user_stats/${candidate.uid}`,
        reason: "social_user_stats_counter_drift",
      });
    }

    publicScanned += 1;
    if (!publicSnap.exists) {
      publicMissing += 1;
      publicFailures.push({
        authorityPath: candidate.authorityPath,
        projectionPath: `public_profiles/${candidate.uid}`,
        reason: "missing_public_profile",
      });
    } else {
      const publicData = (publicSnap.data() || {}) as Record<string, unknown>;
      const publicOk =
        counterMatches(publicData.followerCount ?? publicData.followers, expected.followers) &&
        counterMatches(publicData.followingCount ?? publicData.following, expected.following);
      if (publicOk) publicMatched += 1;
      else {
        publicStale += 1;
        publicFailures.push({
          authorityPath: candidate.authorityPath,
          projectionPath: `public_profiles/${candidate.uid}`,
          reason: "public_profile_counter_drift",
        });
      }
    }

    const edgeChecks =
      request.scope === "single_edge" && request.followerUid && request.targetUid
        ? [await checkEdge(request.followerUid, request.targetUid)]
        : await loadEdgeChecksForUser(candidate.uid, Math.min(20, request.batchSize));
    for (const check of edgeChecks) {
      if (!edgeFailed(check)) continue;
      mismatch += 1;
      if (!check.followerExists || !check.followingExists) missing += 1;
      if (check.schemaMismatch || check.createdAtMismatch) stale += 1;
      if (check.followerExists && !check.followingExists) extra += 1;
      sampleFailures.push({
        authorityPath: check.followerPath,
        projectionPath: check.followingPath,
        reason: !check.followerExists || !check.followingExists
          ? "orphan_mirror_doc"
          : check.schemaMismatch
            ? "path_field_mismatch"
            : "created_at_mismatch",
      });
    }
  }

  const socialFailed = missing + stale + extra;
  const publicFailed = publicMissing + publicStale;
  return {
    social: createVerificationResult({
      verificationId: `${verificationId}:social_user_stats`,
      projectionName: SOCIAL_PROJECTION_NAME,
      authorityQuery: `users/*/followers + users/*/following scope=${request.scope}`,
      projectionQuery: "user_stats.followers,user_stats.following plus mirror edges",
      status: socialFailed === 0 ? "passed" : "failed",
      scanned,
      matched,
      missingProjectionCount: missing,
      staleProjectionCount: stale,
      mismatchCount: mismatch,
      extraProjectionCount: extra,
      verificationSuccessRate: scanned > 0 ? Number((matched / scanned).toFixed(6)) : 1,
      sampleFailures: sampleFailures.slice(0, 20),
    }),
    publicCounters: createVerificationResult({
      verificationId: `${verificationId}:public_profile_counters`,
      projectionName: PUBLIC_COUNTERS_PROJECTION_NAME,
      authorityQuery: `users/*/followers + users/*/following scope=${request.scope}`,
      projectionQuery: "public_profiles.followerCount,public_profiles.followingCount",
      status: publicFailed === 0 ? "passed" : "failed",
      scanned: publicScanned,
      matched: publicMatched,
      missingProjectionCount: publicMissing,
      staleProjectionCount: publicStale,
      mismatchCount: publicStale,
      extraProjectionCount: 0,
      verificationSuccessRate: publicScanned > 0 ? Number((publicMatched / publicScanned).toFixed(6)) : 1,
      sampleFailures: publicFailures.slice(0, 20),
    }),
  };
}

async function recordFollowFailure(params: {
  projectionName: string;
  projectionCollection: string;
  triggerName: string;
  sourcePath: string;
  sourceEventId: string;
  operation: "verify" | "reconcile";
  failureClass: "validation_failed" | "write_failed" | "partial_fanout";
  message: string;
  correlationId?: string;
}) {
  const failure = await recordProjectionFailure({
    projectionName: params.projectionName,
    projectionCollection: params.projectionCollection,
    triggerName: params.triggerName,
    sourcePath: params.sourcePath,
    sourceEventId: params.sourceEventId,
    operation: params.operation,
    failureClass: params.failureClass,
    lastErrorMessage: params.message,
    correlationId: params.correlationId,
  });
  await updateProjectionHealthFromFailure(failure);
  return failure.failureId;
}

export async function recoverFollowGraphForRequest(
  rawRequest: FollowGraphRecoveryRequest,
  fallbackUid = "system"
) {
  const request = normalizeRequest(rawRequest, fallbackUid);
  let summary = await startRecoveryRun(buildRecoveryRequest(request));
  const failureLedgerIds: string[] = [];

  try {
    const { candidates, nextCursor, checkpointId, lastProcessedPath } = await loadCandidateUsers(request);
    let wouldWrite = 0;
    let written = 0;
    let skipped = 0;
    let failed = 0;

    for (const candidate of candidates) {
      try {
        const expected = await computeExpectedCounters(candidate.uid);
        const [statsSnap, publicSnap] = await Promise.all([
          db.collection("user_stats").doc(candidate.uid).get(),
          db.collection("public_profiles").doc(candidate.uid).get(),
        ]);
        const stats = (statsSnap.data() || {}) as Record<string, unknown>;
        const publicData = (publicSnap.data() || {}) as Record<string, unknown>;
        const counterDrift =
          !counterMatches(stats.followers, expected.followers) ||
          !counterMatches(stats.following, expected.following) ||
          !publicSnap.exists ||
          !counterMatches(publicData.followerCount ?? publicData.followers, expected.followers) ||
          !counterMatches(publicData.followingCount ?? publicData.following, expected.following);

        const edgeChecks =
          request.scope === "single_edge" && request.followerUid && request.targetUid
            ? [await checkEdge(request.followerUid, request.targetUid)]
            : await loadEdgeChecksForUser(candidate.uid, Math.min(20, request.batchSize));
        const failedEdges = edgeChecks.filter(edgeFailed);
        const needsWrite = counterDrift || failedEdges.length > 0;
        if (needsWrite) wouldWrite += 1;

        if (request.mode === "write" && request.reconciliationMode === "repair" && needsWrite) {
          await repairCounters(expected);
          for (const edge of failedEdges) {
            await repairEdgeSchema(edge);
          }
          written += 1;
        } else {
          skipped += needsWrite ? 1 : 0;
        }

        for (const edge of failedEdges) {
          const failureId = await recordFollowFailure({
            projectionName: SOCIAL_PROJECTION_NAME,
            projectionCollection: "users/*/followers,users/*/following",
            triggerName: "recoverFollowGraph",
            sourcePath: edge.followerPath,
            sourceEventId: edgeId(edge.followerUid, edge.targetUid),
            operation: request.reconciliationMode === "repair" ? "reconcile" : "verify",
            failureClass: edge.followerExists !== edge.followingExists ? "partial_fanout" : "validation_failed",
            message: edge.followerExists !== edge.followingExists
              ? "Follow mirror is missing one side."
              : edge.schemaMismatch
                ? "Follow mirror canonical fields do not match path."
                : "Follow mirror createdAt fields do not match.",
            correlationId: request.correlationId,
          });
          failureLedgerIds.push(failureId);
        }
      } catch (error) {
        failed += 1;
        const failureId = await recordFollowFailure({
          projectionName: SOCIAL_PROJECTION_NAME,
          projectionCollection: "users/*/followers,users/*/following",
          triggerName: "recoverFollowGraph",
          sourcePath: candidate.authorityPath,
          sourceEventId: `recovery:${summary.runId}:${candidate.uid}`,
          operation: request.reconciliationMode === "repair" ? "reconcile" : "verify",
          failureClass: "write_failed",
          message: error instanceof Error ? error.message : String(error),
          correlationId: request.correlationId,
        });
        failureLedgerIds.push(failureId);
      }
    }

    if (checkpointId) {
      await updateRecoveryCheckpointProgress({
        checkpointId,
        projectionName: SOCIAL_PROJECTION_NAME,
        scope: "checkpointed_full",
        cursor: nextCursor,
        lastProcessedPath,
        scannedDelta: candidates.length,
        writtenDelta: written,
        failedDelta: failed,
        status: nextCursor ? "partial" : "completed",
      });
    }

    let socialVerification: VerificationResult | null = null;
    let publicVerification: VerificationResult | null = null;
    let verificationFailures = 0;
    if (request.verify) {
      const verification = await verifyUsers(candidates, request, `${summary.runId}:verification`);
      socialVerification = verification.social;
      publicVerification = verification.publicCounters;
      await writeVerificationResult(socialVerification);
      await writeVerificationResult(publicVerification);
      await updateProjectionHealthFromVerification(socialVerification);
      await updateProjectionHealthFromVerification(publicVerification);
      verificationFailures =
        socialVerification.missingProjectionCount +
        socialVerification.staleProjectionCount +
        socialVerification.extraProjectionCount +
        publicVerification.missingProjectionCount +
        publicVerification.staleProjectionCount;
    }

    summary = await completeRecoveryRun(summary, {
      status: failed > 0 ? "partial" : nextCursor ? "partial" : "completed",
      scanned: candidates.length,
      eligible: candidates.length,
      wouldWrite,
      written,
      skipped,
      failed,
      verified: (socialVerification?.scanned ?? 0) + (publicVerification?.scanned ?? 0),
      verificationFailures,
      nextCursor,
      checkpointUpdated: !!checkpointId,
      failureLedgerIds,
    });
    await updateProjectionHealthFromRecoverySummary(summary);

    const socialDefinition = getProjectionDefinition(SOCIAL_PROJECTION_NAME);
    const publicDefinition = getProjectionDefinition(PUBLIC_COUNTERS_PROJECTION_NAME);
    const socialCertification = socialDefinition ? evaluateProjectionCertification(socialDefinition) : null;
    const publicCertification = publicDefinition ? evaluateProjectionCertification(publicDefinition) : null;
    return {
      summary,
      verification: {
        socialUserStats: socialVerification,
        publicProfileCounters: publicVerification,
      },
      certification: {
        socialUserStats: {
          projectionName: SOCIAL_PROJECTION_NAME,
          passed: socialCertification?.passed ?? false,
          missingRequirements: socialCertification?.missingRequirements ?? ["registered_definition"],
        },
        publicProfileCounters: {
          projectionName: PUBLIC_COUNTERS_PROJECTION_NAME,
          passed: publicCertification?.passed ?? false,
          missingRequirements: publicCertification?.missingRequirements ?? ["registered_definition"],
        },
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

export const recoverFollowGraph = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  assertRoleFromClaims(caller, "superadmin");
  return recoverFollowGraphForRequest(
    request.data as FollowGraphRecoveryRequest,
    caller.uid
  );
});
