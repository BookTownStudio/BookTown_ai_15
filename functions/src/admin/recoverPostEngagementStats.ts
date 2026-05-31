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

const PROJECTION_NAME = "post_engagement_stats";
const DEFAULT_BATCH_SIZE = 100;
const HARD_MAX_BATCH_SIZE = 100;

type PostEngagementScope =
  | "single_post"
  | "owner"
  | "collection_page"
  | "checkpointed_full";

type ReconciliationMode = "report_only" | "repair";

type PostEngagementRecoveryRequest = {
  mode?: RecoveryMode;
  scope: PostEngagementScope;
  postId?: string;
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
  postId: string;
  authorityPath: string;
};

type ExpectedCounters = {
  likes: number;
  reposts: number;
  bookmarks: number;
  comments: number;
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

function normalizeRequest(
  raw: unknown,
  fallbackUid: string
): Required<
  Pick<
    PostEngagementRecoveryRequest,
    "mode" | "scope" | "batchSize" | "maxDocs" | "verify" | "reconciliationMode" | "requestedBy" | "reason"
  >
> &
  Omit<
    PostEngagementRecoveryRequest,
    "mode" | "scope" | "batchSize" | "maxDocs" | "verify" | "reconciliationMode" | "requestedBy" | "reason"
  > {
  const input =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const scope = readString(input.scope, 40) as PostEngagementScope;
  if (
    scope !== "single_post" &&
    scope !== "owner" &&
    scope !== "collection_page" &&
    scope !== "checkpointed_full"
  ) {
    throw new HttpsError("invalid-argument", "Invalid post engagement recovery scope.");
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
    postId: readString(input.postId, 190) || undefined,
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

function toRecoveryScope(scope: PostEngagementScope): RecoveryScope {
  if (scope === "single_post") return "single_doc";
  if (scope === "owner") return "owner";
  return scope;
}

function buildRecoveryRequest(input: ReturnType<typeof normalizeRequest>): RecoveryRequest {
  return {
    projectionName: PROJECTION_NAME,
    mode: input.mode,
    scope: toRecoveryScope(input.scope),
    targetId: input.postId,
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

async function loadCandidates(request: ReturnType<typeof normalizeRequest>): Promise<{
  candidates: Candidate[];
  nextCursor: string | null;
  checkpointId: string | null;
  lastProcessedPath: string | null;
}> {
  if (request.scope === "single_post") {
    if (!request.postId) throw new HttpsError("invalid-argument", "postId is required.");
    return {
      candidates: [{ postId: request.postId, authorityPath: `posts/${request.postId}` }],
      nextCursor: null,
      checkpointId: null,
      lastProcessedPath: `posts/${request.postId}`,
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

  const base =
    request.scope === "owner"
      ? db.collection("posts").where("authorId", "==", request.ownerId || "").orderBy(FieldPath.documentId())
      : db.collection("posts").orderBy(FieldPath.documentId());
  if (request.scope === "owner" && !request.ownerId) {
    throw new HttpsError("invalid-argument", "ownerId is required.");
  }
  const snap = await (cursor ? base.startAfter(cursor) : base).limit(limit).get();
  return {
    candidates: snap.docs.map((doc) => ({ postId: doc.id, authorityPath: doc.ref.path })),
    nextCursor: snap.size === limit ? snap.docs[snap.docs.length - 1].id : null,
    checkpointId,
    lastProcessedPath: snap.docs[snap.docs.length - 1]?.ref.path ?? null,
  };
}

async function computeExpected(postId: string): Promise<ExpectedCounters> {
  const [likesSnap, repostsSnap, bookmarksSnap, commentsSnap] = await Promise.all([
    db.collectionGroup("likes").where("postId", "==", postId).count().get(),
    db.collectionGroup("reposts").where("originalPostId", "==", postId).count().get(),
    db
      .collectionGroup("bookmarks")
      .where("entityId", "==", postId)
      .where("type", "==", "post")
      .count()
      .get(),
    db.collection("posts").doc(postId).collection("comments").count().get(),
  ]);
  return {
    likes: readCounter(likesSnap.data().count),
    reposts: readCounter(repostsSnap.data().count),
    bookmarks: readCounter(bookmarksSnap.data().count),
    comments: readCounter(commentsSnap.data().count),
  };
}

function nestedCounters(data: Record<string, unknown>): Record<string, unknown> {
  return data.counters && typeof data.counters === "object"
    ? (data.counters as Record<string, unknown>)
    : {};
}

function statsMatches(expected: ExpectedCounters, stats: Record<string, unknown>): boolean {
  const counters = nestedCounters(stats);
  return (
    readCounter(stats.likesCount) === expected.likes &&
    readCounter(stats.repostsCount) === expected.reposts &&
    readCounter(stats.bookmarksCount) === expected.bookmarks &&
    readCounter(stats.commentsCount) === expected.comments &&
    readCounter(counters.likes) === expected.likes &&
    readCounter(counters.reposts) === expected.reposts &&
    readCounter(counters.bookmarks) === expected.bookmarks &&
    readCounter(counters.comments) === expected.comments
  );
}

function postCountersMatch(expected: ExpectedCounters, post: Record<string, unknown>): boolean {
  const counters = nestedCounters(post);
  return (
    readCounter(counters.likes) === expected.likes &&
    readCounter(counters.reposts) === expected.reposts &&
    readCounter(counters.bookmarks) === expected.bookmarks &&
    readCounter(counters.comments) === expected.comments
  );
}

async function writeExactCounters(postId: string, expected: ExpectedCounters): Promise<void> {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(
    db.collection("post_stats").doc(postId),
    {
      counters: {
        likes: expected.likes,
        reposts: expected.reposts,
        bookmarks: expected.bookmarks,
        comments: expected.comments,
      },
      likesCount: expected.likes,
      repostsCount: expected.reposts,
      bookmarksCount: expected.bookmarks,
      commentsCount: expected.comments,
      lastRecoveredAt: now,
      lastUpdatedAt: now,
    },
    { merge: true }
  );
  batch.set(
    db.collection("posts").doc(postId),
    {
      counters: {
        likes: expected.likes,
        reposts: expected.reposts,
        bookmarks: expected.bookmarks,
        comments: expected.comments,
      },
      updatedAt: now,
    },
    { merge: true }
  );
  await batch.commit();
}

async function recordFailure(params: {
  candidate: Candidate;
  operation: "verify" | "reconcile";
  message: string;
  failureClass?: "validation_failed" | "write_failed" | "authority_missing";
  correlationId?: string;
}) {
  const failure = await recordProjectionFailure({
    projectionName: PROJECTION_NAME,
    projectionCollection: "post_stats,posts.counters",
    triggerName: "recoverPostEngagementStats",
    sourcePath: params.candidate.authorityPath,
    sourceEventId: `post_engagement:${params.candidate.postId}`,
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
    const [postSnap, statsSnap, expected] = await Promise.all([
      db.collection("posts").doc(candidate.postId).get(),
      db.collection("post_stats").doc(candidate.postId).get(),
      computeExpected(candidate.postId),
    ]);
    if (!postSnap.exists && statsSnap.exists) {
      extraProjectionCount += 1;
      sampleFailures.push({
        authorityPath: candidate.authorityPath,
        projectionPath: `post_stats/${candidate.postId}`,
        reason: "orphan_post_stats",
      });
      continue;
    }
    if (!statsSnap.exists) {
      missingProjectionCount += 1;
      sampleFailures.push({
        authorityPath: candidate.authorityPath,
        projectionPath: `post_stats/${candidate.postId}`,
        reason: "missing_post_stats",
      });
      continue;
    }
    const statsOk = statsMatches(expected, statsSnap.data() || {});
    const postCountersOk = postSnap.exists && postCountersMatch(expected, postSnap.data() || {});
    if (statsOk && postCountersOk) {
      matched += 1;
      continue;
    }
    staleProjectionCount += 1;
    mismatchCount += 1;
    sampleFailures.push({
      authorityPath: candidate.authorityPath,
      projectionPath: `post_stats/${candidate.postId}`,
      reason: statsOk ? "posts_counters_drift" : "post_stats_counter_drift",
    });
  }

  const failed = missingProjectionCount + staleProjectionCount + extraProjectionCount;
  return createVerificationResult({
    verificationId,
    projectionName: PROJECTION_NAME,
    authorityQuery: `users/*/likes + users/*/reposts + users/*/bookmarks(type=post) + posts/*/comments scope=${request.scope}`,
    projectionQuery: "post_stats + posts.counters",
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

export async function recoverPostEngagementStatsForRequest(
  rawRequest: PostEngagementRecoveryRequest,
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
        const [postSnap, statsSnap, expected] = await Promise.all([
          db.collection("posts").doc(candidate.postId).get(),
          db.collection("post_stats").doc(candidate.postId).get(),
          computeExpected(candidate.postId),
        ]);
        const needsWrite =
          !statsSnap.exists ||
          !postSnap.exists ||
          !statsMatches(expected, statsSnap.data() || {}) ||
          !postCountersMatch(expected, postSnap.data() || {});
        if (needsWrite) wouldWrite += 1;
        if (request.mode === "write" && request.reconciliationMode === "repair" && needsWrite && postSnap.exists) {
          await writeExactCounters(candidate.postId, expected);
          written += 1;
        } else {
          skipped += needsWrite ? 1 : 0;
        }
        if (!postSnap.exists && statsSnap.exists) {
          failureLedgerIds.push(await recordFailure({
            candidate,
            operation: request.reconciliationMode === "repair" ? "reconcile" : "verify",
            failureClass: "authority_missing",
            message: "post_stats exists for a missing post authority document.",
            correlationId: request.correlationId,
          }));
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

export const recoverPostEngagementStats = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  assertRoleFromClaims(caller, "superadmin");
  return recoverPostEngagementStatsForRequest(
    request.data as PostEngagementRecoveryRequest,
    caller.uid
  );
});
