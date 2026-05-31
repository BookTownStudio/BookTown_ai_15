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

const POST_ANALYTICS_PROJECTION = "post_analytics";
const ANALYTICS_EXPORTS_PROJECTION = "analytics_daily_exports";
const DEFAULT_BATCH_SIZE = 100;
const HARD_MAX_BATCH_SIZE = 100;

type ReconciliationMode = "report_only" | "repair";
type PostAnalyticsScope = "single_post" | "collection_page" | "checkpointed_full";
type AnalyticsExportScope = "single_day" | "collection_page" | "checkpointed_full";

type PostAnalyticsRecoveryRequest = {
  mode?: RecoveryMode;
  scope: PostAnalyticsScope;
  postId?: string;
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

type AnalyticsExportRecoveryRequest = {
  mode?: RecoveryMode;
  scope: AnalyticsExportScope;
  dateKey?: string;
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

type PostCandidate = {
  postId: string;
  authorityPath: string;
};

type DayCandidate = {
  dateKey: string;
  authorityPath: string;
};

type ExpectedPostAnalytics = {
  likes: number;
  comments_count: number;
  reposts: number;
  bookmarks: number;
  unique_viewers: number;
  views: number;
};

type MetricsBlock = {
  totalUsers: number;
  totalPosts: number;
  totalReviews: number;
  totalQuotes: number;
  totalFollows: number;
  totalDeletionRequests: number;
  executedDeletions: number;
  updatedAt: string | null;
};

type ExpectedDailyExport = {
  dateKey: string;
  snapshot: Record<"global" | "growth" | "engagement" | "moderation", MetricsBlock>;
  daily: MetricsBlock & { dateKey: string };
  derived: {
    postsPerUser: number;
    reviewsPerPost: number;
    engagementRatio: number;
    growthDeltaPosts: number | null;
  };
  totalEventsCount: number;
  environment: string;
  appVersion: string;
  schemaVersion: 1;
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
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toIsoTimestamp(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (typeof value === "object") {
    const candidate = value as { toDate?: unknown };
    if (typeof candidate.toDate === "function") {
      const parsed = (candidate.toDate as () => Date)();
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
  }
  return null;
}

function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Number((numerator / denominator).toFixed(6));
}

function normalizeCommonRequest<TScope extends string>(
  raw: unknown,
  fallbackUid: string,
  allowedScopes: TScope[],
  invalidMessage: string
) {
  const input =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const scope = readString(input.scope, 40) as TScope;
  if (!allowedScopes.includes(scope)) throw new HttpsError("invalid-argument", invalidMessage);
  const mode: RecoveryMode = readString(input.mode, 20) === "write" ? "write" : "dry_run";
  const reconciliationRaw = readString(input.reconciliationMode, 20);
  const reconciliationMode: ReconciliationMode =
    reconciliationRaw === "repair" || (mode === "write" && reconciliationRaw !== "report_only")
      ? "repair"
      : "report_only";
  const reason = readString(input.reason, 500);
  if (!reason) throw new HttpsError("invalid-argument", "reason is required.");
  return {
    input,
    mode,
    scope,
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

function normalizePostAnalyticsRequest(raw: unknown, fallbackUid: string) {
  const common = normalizeCommonRequest(
    raw,
    fallbackUid,
    ["single_post", "collection_page", "checkpointed_full"] as PostAnalyticsScope[],
    "Invalid post analytics recovery scope."
  );
  return {
    ...common,
    postId: readString(common.input.postId, 190) || undefined,
  };
}

function normalizeAnalyticsExportRequest(raw: unknown, fallbackUid: string) {
  const common = normalizeCommonRequest(
    raw,
    fallbackUid,
    ["single_day", "collection_page", "checkpointed_full"] as AnalyticsExportScope[],
    "Invalid analytics export recovery scope."
  );
  const dateKey = readString(common.input.dateKey, 10) || undefined;
  if (dateKey && !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new HttpsError("invalid-argument", "dateKey must be YYYY-MM-DD.");
  }
  return { ...common, dateKey };
}

function recoveryScope(scope: PostAnalyticsScope | AnalyticsExportScope): RecoveryScope {
  if (scope === "single_post" || scope === "single_day") return "single_doc";
  return scope;
}

function buildRecoveryRequest(
  projectionName: string,
  input: ReturnType<typeof normalizePostAnalyticsRequest> | ReturnType<typeof normalizeAnalyticsExportRequest>,
  targetId?: string
): RecoveryRequest {
  return {
    projectionName,
    mode: input.mode,
    scope: recoveryScope(input.scope),
    targetId,
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

async function loadPostCandidates(request: ReturnType<typeof normalizePostAnalyticsRequest>): Promise<{
  candidates: PostCandidate[];
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
    checkpointId = request.checkpointId || buildRecoveryCheckpointId({
      projectionName: POST_ANALYTICS_PROJECTION,
      scope: "checkpointed_full",
    });
    const checkpoint = await readRecoveryCheckpoint(checkpointId);
    cursor = request.cursor || checkpoint?.cursor || undefined;
  }
  const query = db.collection("posts").orderBy(FieldPath.documentId());
  const snap = await (cursor ? query.startAfter(cursor) : query).limit(limit).get();
  return {
    candidates: snap.docs.map((doc) => ({ postId: doc.id, authorityPath: doc.ref.path })),
    nextCursor: snap.size === limit ? snap.docs[snap.docs.length - 1].id : null,
    checkpointId,
    lastProcessedPath: snap.docs[snap.docs.length - 1]?.ref.path ?? null,
  };
}

async function countActivity(postId: string, verb: string): Promise<number> {
  const snap = await db
    .collection("activity_log")
    .where("object.entity_type", "==", "post")
    .where("object.entity_id", "==", postId)
    .where("verb", "==", verb)
    .count()
    .get();
  return readCounter(snap.data().count);
}

async function computeExpectedPostAnalytics(postId: string): Promise<ExpectedPostAnalytics> {
  const analyticsRef = db.collection("post_analytics").doc(postId);
  const [
    existingSnap,
    liked,
    unliked,
    commented,
    commentRemoved,
    reposted,
    unreposted,
    bookmarked,
    unbookmarked,
    uniqueViewerSnap,
  ] = await Promise.all([
    analyticsRef.get(),
    countActivity(postId, "post_liked"),
    countActivity(postId, "post_unliked"),
    countActivity(postId, "post_commented"),
    countActivity(postId, "post_comment_removed"),
    countActivity(postId, "post_reposted"),
    countActivity(postId, "post_unreposted"),
    countActivity(postId, "post_bookmarked"),
    countActivity(postId, "post_unbookmarked"),
    analyticsRef.collection("viewers").count().get(),
  ]);
  const existing = existingSnap.data() || {};
  return {
    likes: Math.max(0, liked - unliked),
    comments_count: Math.max(0, commented - commentRemoved),
    reposts: Math.max(0, reposted - unreposted),
    bookmarks: Math.max(0, bookmarked - unbookmarked),
    unique_viewers: readCounter(uniqueViewerSnap.data().count),
    views: readCounter(existing.views),
  };
}

function postAnalyticsMatches(expected: ExpectedPostAnalytics, data: Record<string, unknown>): boolean {
  return (
    readCounter(data.likes) === expected.likes &&
    readCounter(data.comments_count) === expected.comments_count &&
    readCounter(data.reposts) === expected.reposts &&
    readCounter(data.bookmarks) === expected.bookmarks &&
    readCounter(data.unique_viewers) === expected.unique_viewers &&
    readCounter(data.views) >= expected.unique_viewers
  );
}

async function writePostAnalytics(postId: string, expected: ExpectedPostAnalytics): Promise<void> {
  await db.collection("post_analytics").doc(postId).set(
    {
      likes: expected.likes,
      comments_count: expected.comments_count,
      reposts: expected.reposts,
      bookmarks: expected.bookmarks,
      unique_viewers: expected.unique_viewers,
      views: Math.max(expected.views, expected.unique_viewers),
      lastRecoveredAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function recordFailure(params: {
  projectionName: string;
  projectionCollection: string;
  sourcePath: string;
  sourceEventId: string;
  operation: "verify" | "reconcile" | "rebuild";
  message: string;
  failureClass?: "validation_failed" | "write_failed" | "authority_missing";
  correlationId?: string;
}) {
  const failure = await recordProjectionFailure({
    projectionName: params.projectionName,
    projectionCollection: params.projectionCollection,
    triggerName: "recoverAnalyticsProjections",
    sourcePath: params.sourcePath,
    sourceEventId: params.sourceEventId,
    operation: params.operation,
    failureClass: params.failureClass ?? "validation_failed",
    lastErrorMessage: params.message,
    correlationId: params.correlationId,
  });
  await updateProjectionHealthFromFailure(failure);
  return failure.failureId;
}

async function verifyPostAnalytics(
  candidates: PostCandidate[],
  request: ReturnType<typeof normalizePostAnalyticsRequest>,
  verificationId: string
): Promise<VerificationResult> {
  let scanned = 0;
  let matched = 0;
  let missingProjectionCount = 0;
  let staleProjectionCount = 0;
  let mismatchCount = 0;
  const sampleFailures: VerificationResult["sampleFailures"] = [];

  for (const candidate of candidates) {
    scanned += 1;
    const [analyticsSnap, expected] = await Promise.all([
      db.collection("post_analytics").doc(candidate.postId).get(),
      computeExpectedPostAnalytics(candidate.postId),
    ]);
    const hasAuthority = expected.likes + expected.comments_count + expected.reposts + expected.bookmarks + expected.unique_viewers > 0;
    if (!analyticsSnap.exists && hasAuthority) {
      missingProjectionCount += 1;
      sampleFailures.push({ authorityPath: candidate.authorityPath, projectionPath: `post_analytics/${candidate.postId}`, reason: "missing_analytics_doc" });
      continue;
    }
    if (!analyticsSnap.exists) {
      matched += 1;
      continue;
    }
    if (postAnalyticsMatches(expected, analyticsSnap.data() || {})) {
      matched += 1;
    } else {
      staleProjectionCount += 1;
      mismatchCount += 1;
      sampleFailures.push({ authorityPath: candidate.authorityPath, projectionPath: `post_analytics/${candidate.postId}`, reason: "activity_or_unique_viewer_drift" });
    }
  }

  return createVerificationResult({
    verificationId,
    projectionName: POST_ANALYTICS_PROJECTION,
    authorityQuery: `activity_log + post_analytics/*/viewers scope=${request.scope}`,
    projectionQuery: "post_analytics",
    status: missingProjectionCount + staleProjectionCount === 0 ? "passed" : "failed",
    scanned,
    matched,
    missingProjectionCount,
    staleProjectionCount,
    mismatchCount,
    extraProjectionCount: 0,
    verificationSuccessRate: scanned > 0 ? Number((matched / scanned).toFixed(6)) : 1,
    sampleFailures: sampleFailures.slice(0, 20),
    nextCursor: null,
  });
}

function previousDateKey(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function mapMetricsBlock(data: FirebaseFirestore.DocumentData | undefined): MetricsBlock {
  return {
    totalUsers: readCounter(data?.totalUsers),
    totalPosts: readCounter(data?.totalPosts),
    totalReviews: readCounter(data?.totalReviews),
    totalQuotes: readCounter(data?.totalQuotes),
    totalFollows: readCounter(data?.totalFollows),
    totalDeletionRequests: readCounter(data?.totalDeletionRequests),
    executedDeletions: readCounter(data?.executedDeletions),
    updatedAt: toIsoTimestamp(data?.updatedAt),
  };
}

async function computeExpectedDailyExport(dateKey: string): Promise<ExpectedDailyExport> {
  const previous = previousDateKey(dateKey);
  const [globalSnap, growthSnap, engagementSnap, moderationSnap, dailySnap, previousDailySnap, eventsCountSnap] =
    await Promise.all([
      db.collection("system_metrics").doc("global").get(),
      db.collection("system_metrics").doc("growth").get(),
      db.collection("system_metrics").doc("engagement").get(),
      db.collection("system_metrics").doc("moderation").get(),
      db.collection("system_metrics_daily").doc(dateKey).get(),
      db.collection("system_metrics_daily").doc(previous).get(),
      db.collection("system_events").count().get(),
    ]);
  const snapshot = {
    global: mapMetricsBlock(globalSnap.data()),
    growth: mapMetricsBlock(growthSnap.data()),
    engagement: mapMetricsBlock(engagementSnap.data()),
    moderation: mapMetricsBlock(moderationSnap.data()),
  };
  const daily = { dateKey, ...mapMetricsBlock(dailySnap.data()) };
  const previousDaily = previousDailySnap.exists ? mapMetricsBlock(previousDailySnap.data()) : null;
  return {
    dateKey,
    snapshot,
    daily,
    derived: {
      postsPerUser: safeDivide(snapshot.global.totalPosts, snapshot.global.totalUsers),
      reviewsPerPost: safeDivide(snapshot.global.totalReviews, snapshot.global.totalPosts),
      engagementRatio: safeDivide(snapshot.global.totalReviews + snapshot.global.totalQuotes, snapshot.global.totalPosts),
      growthDeltaPosts: previousDaily == null ? null : Number((daily.totalPosts - previousDaily.totalPosts).toFixed(6)),
    },
    totalEventsCount: readCounter(eventsCountSnap.data().count),
    environment: process.env.APP_ENV === "staging" ? "staging" : "prod",
    appVersion: process.env.APP_VERSION || "unknown",
    schemaVersion: 1,
  };
}

function exportMatches(expected: ExpectedDailyExport, data: Record<string, unknown>): boolean {
  const snapshot = nestedRecord(data.snapshot);
  const daily = nestedRecord(data.daily);
  const derived = nestedRecord(data.derived);
  return (
    data.dateKey === expected.dateKey &&
    JSON.stringify(snapshot.global) === JSON.stringify(expected.snapshot.global) &&
    JSON.stringify(snapshot.growth) === JSON.stringify(expected.snapshot.growth) &&
    JSON.stringify(snapshot.engagement) === JSON.stringify(expected.snapshot.engagement) &&
    JSON.stringify(snapshot.moderation) === JSON.stringify(expected.snapshot.moderation) &&
    JSON.stringify(daily) === JSON.stringify(expected.daily) &&
    JSON.stringify(derived) === JSON.stringify(expected.derived) &&
    readCounter(data.totalEventsCount) === expected.totalEventsCount &&
    data.schemaVersion === expected.schemaVersion
  );
}

async function writeDailyExport(expected: ExpectedDailyExport): Promise<void> {
  await db.collection("analytics_exports").doc(expected.dateKey).set(
    {
      ...expected,
      exportedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastRecoveredAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function loadDayCandidates(request: ReturnType<typeof normalizeAnalyticsExportRequest>): Promise<{
  candidates: DayCandidate[];
  nextCursor: string | null;
  checkpointId: string | null;
  lastProcessedPath: string | null;
}> {
  if (request.scope === "single_day") {
    if (!request.dateKey) throw new HttpsError("invalid-argument", "dateKey is required.");
    return {
      candidates: [{ dateKey: request.dateKey, authorityPath: `system_metrics_daily/${request.dateKey}` }],
      nextCursor: null,
      checkpointId: null,
      lastProcessedPath: `system_metrics_daily/${request.dateKey}`,
    };
  }
  const limit = Math.min(request.batchSize, request.maxDocs, HARD_MAX_BATCH_SIZE);
  let cursor = request.cursor;
  let checkpointId: string | null = null;
  if (request.scope === "checkpointed_full") {
    checkpointId = request.checkpointId || buildRecoveryCheckpointId({
      projectionName: ANALYTICS_EXPORTS_PROJECTION,
      scope: "checkpointed_full",
    });
    const checkpoint = await readRecoveryCheckpoint(checkpointId);
    cursor = request.cursor || checkpoint?.cursor || undefined;
  }
  const query = db.collection("system_metrics_daily").orderBy(FieldPath.documentId());
  const snap = await (cursor ? query.startAfter(cursor) : query).limit(limit).get();
  return {
    candidates: snap.docs.map((doc) => ({ dateKey: doc.id, authorityPath: doc.ref.path })),
    nextCursor: snap.size === limit ? snap.docs[snap.docs.length - 1].id : null,
    checkpointId,
    lastProcessedPath: snap.docs[snap.docs.length - 1]?.ref.path ?? null,
  };
}

async function verifyDailyExports(
  candidates: DayCandidate[],
  request: ReturnType<typeof normalizeAnalyticsExportRequest>,
  verificationId: string
): Promise<VerificationResult> {
  let scanned = 0;
  let matched = 0;
  let missingProjectionCount = 0;
  let staleProjectionCount = 0;
  let mismatchCount = 0;
  const sampleFailures: VerificationResult["sampleFailures"] = [];
  for (const candidate of candidates) {
    scanned += 1;
    const [exportSnap, expected] = await Promise.all([
      db.collection("analytics_exports").doc(candidate.dateKey).get(),
      computeExpectedDailyExport(candidate.dateKey),
    ]);
    if (!exportSnap.exists) {
      missingProjectionCount += 1;
      sampleFailures.push({ authorityPath: candidate.authorityPath, projectionPath: `analytics_exports/${candidate.dateKey}`, reason: "missing_export" });
      continue;
    }
    if (exportMatches(expected, exportSnap.data() || {})) {
      matched += 1;
    } else {
      staleProjectionCount += 1;
      mismatchCount += 1;
      sampleFailures.push({ authorityPath: candidate.authorityPath, projectionPath: `analytics_exports/${candidate.dateKey}`, reason: "metric_or_export_drift" });
    }
  }
  return createVerificationResult({
    verificationId,
    projectionName: ANALYTICS_EXPORTS_PROJECTION,
    authorityQuery: `system_metrics + system_metrics_daily + system_events scope=${request.scope}`,
    projectionQuery: "analytics_exports",
    status: missingProjectionCount + staleProjectionCount === 0 ? "passed" : "failed",
    scanned,
    matched,
    missingProjectionCount,
    staleProjectionCount,
    mismatchCount,
    extraProjectionCount: 0,
    verificationSuccessRate: scanned > 0 ? Number((matched / scanned).toFixed(6)) : 1,
    sampleFailures: sampleFailures.slice(0, 20),
    nextCursor: null,
  });
}

async function completeRunWithVerification(params: {
  summary: Awaited<ReturnType<typeof startRecoveryRun>>;
  projectionName: string;
  scanned: number;
  wouldWrite: number;
  written: number;
  skipped: number;
  failed: number;
  nextCursor: string | null;
  checkpointUpdated: boolean;
  failureLedgerIds: string[];
  verification: VerificationResult | null;
}) {
  const verificationFailures = params.verification
    ? params.verification.missingProjectionCount +
      params.verification.staleProjectionCount +
      params.verification.mismatchCount +
      params.verification.extraProjectionCount
    : 0;
  const summary = await completeRecoveryRun(params.summary, {
    status: params.failed > 0 ? "partial" : params.nextCursor ? "partial" : "completed",
    scanned: params.scanned,
    eligible: params.scanned,
    wouldWrite: params.wouldWrite,
    written: params.written,
    skipped: params.skipped,
    failed: params.failed,
    verified: params.verification?.scanned ?? 0,
    verificationFailures,
    nextCursor: params.nextCursor,
    checkpointUpdated: params.checkpointUpdated,
    failureLedgerIds: params.failureLedgerIds,
  });
  await updateProjectionHealthFromRecoverySummary(summary);
  const definition = getProjectionDefinition(params.projectionName);
  const certification = definition ? evaluateProjectionCertification(definition) : null;
  return {
    summary,
    verification: params.verification,
    certification: {
      projectionName: params.projectionName,
      passed: certification?.passed ?? false,
      missingRequirements: certification?.missingRequirements ?? ["registered_definition"],
    },
  };
}

export async function recoverPostAnalyticsForRequest(rawRequest: PostAnalyticsRecoveryRequest, fallbackUid = "system") {
  const request = normalizePostAnalyticsRequest(rawRequest, fallbackUid);
  let summary = await startRecoveryRun(buildRecoveryRequest(POST_ANALYTICS_PROJECTION, request, request.postId));
  const failureLedgerIds: string[] = [];
  try {
    const { candidates, nextCursor, checkpointId, lastProcessedPath } = await loadPostCandidates(request);
    let wouldWrite = 0;
    let written = 0;
    let skipped = 0;
    let failed = 0;
    for (const candidate of candidates) {
      try {
        const [analyticsSnap, expected] = await Promise.all([
          db.collection("post_analytics").doc(candidate.postId).get(),
          computeExpectedPostAnalytics(candidate.postId),
        ]);
        const hasAuthority = expected.likes + expected.comments_count + expected.reposts + expected.bookmarks + expected.unique_viewers > 0;
        const needsWrite = hasAuthority && (!analyticsSnap.exists || !postAnalyticsMatches(expected, analyticsSnap.data() || {}));
        if (needsWrite) wouldWrite += 1;
        if (request.mode === "write" && request.reconciliationMode === "repair" && needsWrite) {
          await writePostAnalytics(candidate.postId, expected);
          written += 1;
        } else {
          skipped += needsWrite ? 1 : 0;
        }
      } catch (error) {
        failed += 1;
        failureLedgerIds.push(await recordFailure({
          projectionName: POST_ANALYTICS_PROJECTION,
          projectionCollection: "post_analytics",
          sourcePath: candidate.authorityPath,
          sourceEventId: `post_analytics:${candidate.postId}`,
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
        projectionName: POST_ANALYTICS_PROJECTION,
        scope: "checkpointed_full",
        cursor: nextCursor,
        lastProcessedPath,
        scannedDelta: candidates.length,
        writtenDelta: written,
        failedDelta: failed,
        status: nextCursor ? "partial" : "completed",
      });
    }
    const verification = request.verify
      ? await verifyPostAnalytics(candidates, request, `${summary.runId}:verification`)
      : null;
    if (verification) {
      await writeVerificationResult(verification);
      await updateProjectionHealthFromVerification(verification);
    }
    return completeRunWithVerification({
      summary,
      projectionName: POST_ANALYTICS_PROJECTION,
      scanned: candidates.length,
      wouldWrite,
      written,
      skipped,
      failed,
      nextCursor,
      checkpointUpdated: !!checkpointId,
      failureLedgerIds,
      verification,
    });
  } catch (error) {
    summary = await failRecoveryRun(summary, { failedCount: Math.max(1, summary.failed), failureLedgerIds });
    await updateProjectionHealthFromRecoverySummary(summary);
    throw error;
  }
}

export async function recoverAnalyticsDailyExportsForRequest(rawRequest: AnalyticsExportRecoveryRequest, fallbackUid = "system") {
  const request = normalizeAnalyticsExportRequest(rawRequest, fallbackUid);
  let summary = await startRecoveryRun(buildRecoveryRequest(ANALYTICS_EXPORTS_PROJECTION, request, request.dateKey));
  const failureLedgerIds: string[] = [];
  try {
    const { candidates, nextCursor, checkpointId, lastProcessedPath } = await loadDayCandidates(request);
    let wouldWrite = 0;
    let written = 0;
    let skipped = 0;
    let failed = 0;
    for (const candidate of candidates) {
      try {
        const [exportSnap, expected] = await Promise.all([
          db.collection("analytics_exports").doc(candidate.dateKey).get(),
          computeExpectedDailyExport(candidate.dateKey),
        ]);
        const needsWrite = !exportSnap.exists || !exportMatches(expected, exportSnap.data() || {});
        if (needsWrite) wouldWrite += 1;
        if (request.mode === "write" && request.reconciliationMode === "repair" && needsWrite) {
          await writeDailyExport(expected);
          written += 1;
        } else {
          skipped += needsWrite ? 1 : 0;
        }
      } catch (error) {
        failed += 1;
        failureLedgerIds.push(await recordFailure({
          projectionName: ANALYTICS_EXPORTS_PROJECTION,
          projectionCollection: "analytics_exports",
          sourcePath: candidate.authorityPath,
          sourceEventId: `analytics_export:${candidate.dateKey}`,
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
        projectionName: ANALYTICS_EXPORTS_PROJECTION,
        scope: "checkpointed_full",
        cursor: nextCursor,
        lastProcessedPath,
        scannedDelta: candidates.length,
        writtenDelta: written,
        failedDelta: failed,
        status: nextCursor ? "partial" : "completed",
      });
    }
    const verification = request.verify
      ? await verifyDailyExports(candidates, request, `${summary.runId}:verification`)
      : null;
    if (verification) {
      await writeVerificationResult(verification);
      await updateProjectionHealthFromVerification(verification);
    }
    return completeRunWithVerification({
      summary,
      projectionName: ANALYTICS_EXPORTS_PROJECTION,
      scanned: candidates.length,
      wouldWrite,
      written,
      skipped,
      failed,
      nextCursor,
      checkpointUpdated: !!checkpointId,
      failureLedgerIds,
      verification,
    });
  } catch (error) {
    summary = await failRecoveryRun(summary, { failedCount: Math.max(1, summary.failed), failureLedgerIds });
    await updateProjectionHealthFromRecoverySummary(summary);
    throw error;
  }
}

export const recoverPostAnalytics = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  assertRoleFromClaims(caller, "superadmin");
  return recoverPostAnalyticsForRequest(request.data as PostAnalyticsRecoveryRequest, caller.uid);
});

export const recoverAnalyticsDailyExports = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  assertRoleFromClaims(caller, "superadmin");
  return recoverAnalyticsDailyExportsForRequest(request.data as AnalyticsExportRecoveryRequest, caller.uid);
});
