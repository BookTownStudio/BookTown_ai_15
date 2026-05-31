import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldPath } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import { assertActiveAuthenticatedUser, assertRoleFromClaims } from "../shared/auth";
import {
  buildPostRenderProjection,
  buildRenderProjectionEntity,
  type AttachmentRefProjection,
  type StructuredEntityType,
} from "../social/postRenderProjection";
import { SOCIAL_QUOTE_PROJECTION_COLLECTION } from "../projections/quoteProjections";
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

const RENDER_PROJECTION = "social_post_render_projection";
const VIEWER_STATE_PROJECTION = "projected_viewer_state";
const DEFAULT_BATCH_SIZE = 100;
const HARD_MAX_BATCH_SIZE = 100;

type ReconciliationMode = "report_only" | "repair";
type SocialRenderScope = "single_post" | "collection_page" | "checkpointed_full";
type ViewerStateScope = "single_user" | "collection_page" | "checkpointed_full";

type SocialRenderRecoveryRequest = {
  mode?: RecoveryMode;
  scope: SocialRenderScope;
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

type ViewerStateRecoveryRequest = {
  mode?: RecoveryMode;
  scope: ViewerStateScope;
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

type PostCandidate = { postId: string; authorityPath: string; data: Record<string, unknown> };
type UserCandidate = { uid: string; authorityPath: string };
type ViewerStateCandidate = {
  uid: string;
  postId: string;
  authorityPath: string;
  projectionPath: string;
};
type ExpectedViewerState = { liked: boolean; bookmarked: boolean; reposted: boolean };

const STRUCTURED_TYPES = new Set<StructuredEntityType>(["book", "author", "quote", "shelf", "venue", "publication"]);

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
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeCommon<TScope extends string>(
  raw: unknown,
  fallbackUid: string,
  allowedScopes: TScope[],
  invalidMessage: string
) {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
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

function normalizeRenderRequest(raw: unknown, fallbackUid: string) {
  const common = normalizeCommon(
    raw,
    fallbackUid,
    ["single_post", "collection_page", "checkpointed_full"] as SocialRenderScope[],
    "Invalid social render projection recovery scope."
  );
  return { ...common, postId: readString(common.input.postId, 190) || undefined };
}

function normalizeViewerRequest(raw: unknown, fallbackUid: string) {
  const common = normalizeCommon(
    raw,
    fallbackUid,
    ["single_user", "collection_page", "checkpointed_full"] as ViewerStateScope[],
    "Invalid projected viewer state recovery scope."
  );
  return { ...common, uid: readString(common.input.uid, 128) || undefined };
}

function toRecoveryScope(scope: SocialRenderScope | ViewerStateScope): RecoveryScope {
  if (scope === "single_post") return "single_doc";
  if (scope === "single_user") return "owner";
  return scope;
}

function buildRecoveryRequest(
  projectionName: string,
  request: ReturnType<typeof normalizeRenderRequest> | ReturnType<typeof normalizeViewerRequest>,
  targetId?: string,
  ownerId?: string
): RecoveryRequest {
  return {
    projectionName,
    mode: request.mode,
    scope: toRecoveryScope(request.scope),
    targetId,
    ownerId,
    cursor: request.cursor,
    checkpointId: request.checkpointId,
    batchSize: request.batchSize,
    maxDocs: request.maxDocs,
    verify: request.verify,
    requestedBy: request.requestedBy,
    reason: request.reason,
    correlationId: request.correlationId,
  };
}

async function loadPostCandidates(request: ReturnType<typeof normalizeRenderRequest>): Promise<{
  candidates: PostCandidate[];
  nextCursor: string | null;
  checkpointId: string | null;
  lastProcessedPath: string | null;
}> {
  if (request.scope === "single_post") {
    if (!request.postId) throw new HttpsError("invalid-argument", "postId is required.");
    const snap = await db.collection("posts").doc(request.postId).get();
    return {
      candidates: snap.exists ? [{ postId: snap.id, authorityPath: snap.ref.path, data: snap.data() || {} }] : [],
      nextCursor: null,
      checkpointId: null,
      lastProcessedPath: `posts/${request.postId}`,
    };
  }
  const limit = Math.min(request.batchSize, request.maxDocs, HARD_MAX_BATCH_SIZE);
  let cursor = request.cursor;
  let checkpointId: string | null = null;
  if (request.scope === "checkpointed_full") {
    checkpointId = request.checkpointId || buildRecoveryCheckpointId({ projectionName: RENDER_PROJECTION, scope: "checkpointed_full" });
    const checkpoint = await readRecoveryCheckpoint(checkpointId);
    cursor = request.cursor || checkpoint?.cursor || undefined;
  }
  const query = db.collection("posts").orderBy(FieldPath.documentId());
  const snap = await (cursor ? query.startAfter(cursor) : query).limit(limit).get();
  return {
    candidates: snap.docs.map((doc) => ({ postId: doc.id, authorityPath: doc.ref.path, data: doc.data() || {} })),
    nextCursor: snap.size === limit ? snap.docs[snap.docs.length - 1].id : null,
    checkpointId,
    lastProcessedPath: snap.docs[snap.docs.length - 1]?.ref.path ?? null,
  };
}

function normalizeAttachmentRefs(raw: unknown): AttachmentRefProjection[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 20).flatMap((item) => {
    const record = nestedRecord(item);
    const attachmentId = readString(record.attachmentId || record.id || record.entityId, 256);
    const type = readString(record.type, 64).toLowerCase();
    if (!attachmentId || !type) return [];
    return [{
      attachmentId,
      ...(readString(record.entityId, 256) ? { entityId: readString(record.entityId, 256) } : {}),
      ...(readString(record.entityOwnerId || record.ownerId || record.quoteOwnerId, 256)
        ? { entityOwnerId: readString(record.entityOwnerId || record.ownerId || record.quoteOwnerId, 256) }
        : {}),
      type,
      role: readString(record.role, 64) || "attachment",
      renderHint: readString(record.renderHint, 64) || "inline",
    }];
  });
}

async function hydrateEntity(
  type: StructuredEntityType | null,
  id: string | null,
  ownerId?: string
) {
  if (!type || !id) return null;
  const collection =
    type === "book" ? "books" :
      type === "author" ? "authors" :
        type === "quote" ? SOCIAL_QUOTE_PROJECTION_COLLECTION :
          type === "shelf" ? "shelves" :
            type === "venue" ? "venues" :
              "publications";
  const snap = await db.collection(collection).doc(id).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  const resolvedOwnerId = ownerId || readString(data.ownerId || data.authorUid, 128) || undefined;
  return buildRenderProjectionEntity({ type, id, ownerId: resolvedOwnerId, data });
}

async function buildExpectedRender(candidate: PostCandidate) {
  const content = nestedRecord(candidate.data.content);
  const textValue = content.text;
  const contentText = typeof textValue === "string" ? textValue.trim().slice(0, 10000) : textValue === null ? null : null;
  const attachments = normalizeAttachmentRefs(content.attachments);
  const primaryEntityType = STRUCTURED_TYPES.has(readString(candidate.data.primaryEntityType, 64).toLowerCase() as StructuredEntityType)
    ? readString(candidate.data.primaryEntityType, 64).toLowerCase() as StructuredEntityType
    : null;
  const primaryEntityId = readString(candidate.data.primaryEntityId, 256) || null;
  const ownerId = attachments.find((attachment) => attachment.entityId === primaryEntityId)?.entityOwnerId;
  const hydratedEntity = await hydrateEntity(primaryEntityType, primaryEntityId, ownerId);
  return buildPostRenderProjection({
    contentText,
    attachments,
    visibility: readString(candidate.data.visibility, 64) || "public",
    primaryEntityType,
    primaryEntityId,
    hydratedEntity,
  });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function writeRenderProjection(postId: string, expected: unknown): Promise<void> {
  await db.collection("posts").doc(postId).set({
    renderProjection: expected,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastRenderProjectionRecoveredAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function loadUserCandidates(request: ReturnType<typeof normalizeViewerRequest>): Promise<{
  candidates: UserCandidate[];
  nextCursor: string | null;
  checkpointId: string | null;
  lastProcessedPath: string | null;
}> {
  if (request.scope === "single_user") {
    if (!request.uid) throw new HttpsError("invalid-argument", "uid is required.");
    return { candidates: [{ uid: request.uid, authorityPath: `users/${request.uid}` }], nextCursor: null, checkpointId: null, lastProcessedPath: `users/${request.uid}` };
  }
  const limit = Math.min(request.batchSize, request.maxDocs, HARD_MAX_BATCH_SIZE);
  let cursor = request.cursor;
  let checkpointId: string | null = null;
  if (request.scope === "checkpointed_full") {
    checkpointId = request.checkpointId || buildRecoveryCheckpointId({ projectionName: VIEWER_STATE_PROJECTION, scope: "checkpointed_full" });
    const checkpoint = await readRecoveryCheckpoint(checkpointId);
    cursor = request.cursor || checkpoint?.cursor || undefined;
  }
  const query = db.collection("users").orderBy(FieldPath.documentId());
  const snap = await (cursor ? query.startAfter(cursor) : query).limit(limit).get();
  return {
    candidates: snap.docs.map((doc) => ({ uid: doc.id, authorityPath: doc.ref.path })),
    nextCursor: snap.size === limit ? snap.docs[snap.docs.length - 1].id : null,
    checkpointId,
    lastProcessedPath: snap.docs[snap.docs.length - 1]?.ref.path ?? null,
  };
}

async function loadViewerStateCandidates(uid: string, limit: number): Promise<ViewerStateCandidate[]> {
  const [likes, bookmarks, reposts, states] = await Promise.all([
    db.collection("users").doc(uid).collection("likes").limit(limit).get(),
    db.collection("users").doc(uid).collection("bookmarks").where("type", "==", "post").limit(limit).get(),
    db.collection("users").doc(uid).collection("reposts").limit(limit).get(),
    db.collection("users").doc(uid).collection("post_interaction_state").limit(limit).get(),
  ]);
  const postIds = new Set<string>();
  likes.docs.forEach((doc) => postIds.add(doc.id));
  bookmarks.docs.forEach((doc) => postIds.add(doc.id));
  reposts.docs.forEach((doc) => postIds.add(doc.id));
  states.docs.forEach((doc) => postIds.add(doc.id));
  return Array.from(postIds).slice(0, limit).map((postId) => ({
    uid,
    postId,
    authorityPath: `users/${uid}/likes|bookmarks|reposts/${postId}`,
    projectionPath: `users/${uid}/post_interaction_state/${postId}`,
  }));
}

async function computeExpectedViewerState(uid: string, postId: string): Promise<ExpectedViewerState> {
  const [likeSnap, bookmarkSnap, repostSnap] = await Promise.all([
    db.collection("users").doc(uid).collection("likes").doc(postId).get(),
    db.collection("users").doc(uid).collection("bookmarks").doc(postId).get(),
    db.collection("users").doc(uid).collection("reposts").doc(postId).get(),
  ]);
  return {
    liked: likeSnap.exists,
    bookmarked: bookmarkSnap.exists && bookmarkSnap.get("type") === "post",
    reposted: repostSnap.exists,
  };
}

function viewerStateMatches(expected: ExpectedViewerState, data: Record<string, unknown>): boolean {
  return data.liked === expected.liked && data.bookmarked === expected.bookmarked && data.reposted === expected.reposted;
}

async function writeViewerState(uid: string, postId: string, expected: ExpectedViewerState): Promise<void> {
  await db.collection("users").doc(uid).collection("post_interaction_state").doc(postId).set({
    postId,
    liked: expected.liked,
    bookmarked: expected.bookmarked,
    reposted: expected.reposted,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastRecoveredAt: admin.firestore.FieldValue.serverTimestamp(),
    version: 1,
  }, { merge: true });
}

async function recordFailure(params: {
  projectionName: string;
  projectionCollection: string;
  sourcePath: string;
  sourceEventId: string;
  operation: "verify" | "reconcile" | "rebuild";
  message: string;
  correlationId?: string;
}) {
  const failure = await recordProjectionFailure({
    projectionName: params.projectionName,
    projectionCollection: params.projectionCollection,
    triggerName: "recoverSocialRenderAndViewerState",
    sourcePath: params.sourcePath,
    sourceEventId: params.sourceEventId,
    operation: params.operation,
    failureClass: "write_failed",
    lastErrorMessage: params.message,
    correlationId: params.correlationId,
  });
  await updateProjectionHealthFromFailure(failure);
  return failure.failureId;
}

async function verifyRender(candidates: PostCandidate[], request: ReturnType<typeof normalizeRenderRequest>, verificationId: string): Promise<VerificationResult> {
  let scanned = 0, matched = 0, missingProjectionCount = 0, staleProjectionCount = 0, mismatchCount = 0;
  const sampleFailures: VerificationResult["sampleFailures"] = [];
  for (const candidate of candidates) {
    scanned += 1;
    const expected = await buildExpectedRender(candidate);
    const existing = candidate.data.renderProjection;
    if (!existing) {
      missingProjectionCount += 1;
      sampleFailures.push({ authorityPath: candidate.authorityPath, projectionPath: `${candidate.authorityPath}.renderProjection`, reason: "missing_render_projection" });
    } else if (stableJson(existing) === stableJson(expected)) {
      matched += 1;
    } else {
      staleProjectionCount += 1;
      mismatchCount += 1;
      sampleFailures.push({ authorityPath: candidate.authorityPath, projectionPath: `${candidate.authorityPath}.renderProjection`, reason: "stale_render_projection" });
    }
  }
  const failed = missingProjectionCount + staleProjectionCount;
  return createVerificationResult({
    verificationId,
    projectionName: RENDER_PROJECTION,
    authorityQuery: `posts + books/authors/quotes/shelves scope=${request.scope}`,
    projectionQuery: "posts.renderProjection",
    status: failed === 0 ? "passed" : "failed",
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

async function verifyViewerState(candidates: ViewerStateCandidate[], request: ReturnType<typeof normalizeViewerRequest>, verificationId: string): Promise<VerificationResult> {
  let scanned = 0, matched = 0, missingProjectionCount = 0, staleProjectionCount = 0, mismatchCount = 0, extraProjectionCount = 0;
  const sampleFailures: VerificationResult["sampleFailures"] = [];
  for (const candidate of candidates) {
    scanned += 1;
    const [stateSnap, expected] = await Promise.all([
      db.collection("users").doc(candidate.uid).collection("post_interaction_state").doc(candidate.postId).get(),
      computeExpectedViewerState(candidate.uid, candidate.postId),
    ]);
    const hasAuthority = expected.liked || expected.bookmarked || expected.reposted;
    if (!stateSnap.exists && hasAuthority) {
      missingProjectionCount += 1;
      sampleFailures.push({ authorityPath: candidate.authorityPath, projectionPath: candidate.projectionPath, reason: "missing_viewer_state" });
    } else if (stateSnap.exists && !hasAuthority) {
      extraProjectionCount += 1;
      sampleFailures.push({ authorityPath: candidate.authorityPath, projectionPath: candidate.projectionPath, reason: "orphan_viewer_state" });
    } else if (!stateSnap.exists) {
      matched += 1;
    } else if (viewerStateMatches(expected, stateSnap.data() || {})) {
      matched += 1;
    } else {
      staleProjectionCount += 1;
      mismatchCount += 1;
      sampleFailures.push({ authorityPath: candidate.authorityPath, projectionPath: candidate.projectionPath, reason: "viewer_state_drift" });
    }
  }
  const failed = missingProjectionCount + staleProjectionCount + extraProjectionCount;
  return createVerificationResult({
    verificationId,
    projectionName: VIEWER_STATE_PROJECTION,
    authorityQuery: `users/*/likes + bookmarks + reposts scope=${request.scope}`,
    projectionQuery: "users/*/post_interaction_state",
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

export async function recoverSocialPostRenderProjectionForRequest(rawRequest: SocialRenderRecoveryRequest, fallbackUid = "system") {
  const request = normalizeRenderRequest(rawRequest, fallbackUid);
  let summary = await startRecoveryRun(buildRecoveryRequest(RENDER_PROJECTION, request, request.postId));
  const failureLedgerIds: string[] = [];
  try {
    const { candidates, nextCursor, checkpointId, lastProcessedPath } = await loadPostCandidates(request);
    let wouldWrite = 0, written = 0, skipped = 0, failed = 0;
    for (const candidate of candidates) {
      try {
        const expected = await buildExpectedRender(candidate);
        const needsWrite = !candidate.data.renderProjection || stableJson(candidate.data.renderProjection) !== stableJson(expected);
        if (needsWrite) wouldWrite += 1;
        if (request.mode === "write" && request.reconciliationMode === "repair" && needsWrite) {
          await writeRenderProjection(candidate.postId, expected);
          written += 1;
        } else skipped += needsWrite ? 1 : 0;
      } catch (error) {
        failed += 1;
        failureLedgerIds.push(await recordFailure({
          projectionName: RENDER_PROJECTION,
          projectionCollection: "posts.renderProjection",
          sourcePath: candidate.authorityPath,
          sourceEventId: `render_projection:${candidate.postId}`,
          operation: request.reconciliationMode === "repair" ? "reconcile" : "verify",
          message: error instanceof Error ? error.message : String(error),
          correlationId: request.correlationId,
        }));
      }
    }
    if (checkpointId) await updateRecoveryCheckpointProgress({
      checkpointId, projectionName: RENDER_PROJECTION, scope: "checkpointed_full", cursor: nextCursor,
      lastProcessedPath, scannedDelta: candidates.length, writtenDelta: written, failedDelta: failed,
      status: nextCursor ? "partial" : "completed",
    });
    const verification = request.verify ? await verifyRender(candidates, request, `${summary.runId}:verification`) : null;
    if (verification) {
      await writeVerificationResult(verification);
      await updateProjectionHealthFromVerification(verification);
    }
    const verificationFailures = verification ? verification.missingProjectionCount + verification.staleProjectionCount + verification.extraProjectionCount : 0;
    summary = await completeRecoveryRun(summary, {
      status: failed > 0 ? "partial" : nextCursor ? "partial" : "completed",
      scanned: candidates.length, eligible: candidates.length, wouldWrite, written, skipped, failed,
      verified: verification?.scanned ?? 0, verificationFailures, nextCursor, checkpointUpdated: !!checkpointId, failureLedgerIds,
    });
    await updateProjectionHealthFromRecoverySummary(summary);
    const definition = getProjectionDefinition(RENDER_PROJECTION);
    const gate = definition ? evaluateProjectionCertification(definition) : null;
    return { summary, verification, certification: { projectionName: RENDER_PROJECTION, passed: gate?.passed ?? false, missingRequirements: gate?.missingRequirements ?? ["registered_definition"] } };
  } catch (error) {
    summary = await failRecoveryRun(summary, { failedCount: Math.max(1, summary.failed), failureLedgerIds });
    await updateProjectionHealthFromRecoverySummary(summary);
    throw error;
  }
}

export async function recoverProjectedViewerStateForRequest(rawRequest: ViewerStateRecoveryRequest, fallbackUid = "system") {
  const request = normalizeViewerRequest(rawRequest, fallbackUid);
  let summary = await startRecoveryRun(buildRecoveryRequest(VIEWER_STATE_PROJECTION, request, undefined, request.uid));
  const failureLedgerIds: string[] = [];
  try {
    const { candidates: users, nextCursor, checkpointId, lastProcessedPath } = await loadUserCandidates(request);
    const stateCandidates = (await Promise.all(users.map((user) => loadViewerStateCandidates(user.uid, Math.min(request.batchSize, HARD_MAX_BATCH_SIZE))))).flat();
    let wouldWrite = 0, written = 0, skipped = 0, failed = 0;
    for (const candidate of stateCandidates) {
      try {
        const [stateSnap, expected] = await Promise.all([
          db.collection("users").doc(candidate.uid).collection("post_interaction_state").doc(candidate.postId).get(),
          computeExpectedViewerState(candidate.uid, candidate.postId),
        ]);
        const hasAuthority = expected.liked || expected.bookmarked || expected.reposted;
        const needsWrite = hasAuthority && (!stateSnap.exists || !viewerStateMatches(expected, stateSnap.data() || {}));
        if (needsWrite) wouldWrite += 1;
        if (request.mode === "write" && request.reconciliationMode === "repair" && needsWrite) {
          await writeViewerState(candidate.uid, candidate.postId, expected);
          written += 1;
        } else skipped += needsWrite ? 1 : 0;
      } catch (error) {
        failed += 1;
        failureLedgerIds.push(await recordFailure({
          projectionName: VIEWER_STATE_PROJECTION,
          projectionCollection: "users/*/post_interaction_state",
          sourcePath: candidate.authorityPath,
          sourceEventId: `viewer_state:${candidate.uid}:${candidate.postId}`,
          operation: request.reconciliationMode === "repair" ? "reconcile" : "verify",
          message: error instanceof Error ? error.message : String(error),
          correlationId: request.correlationId,
        }));
      }
    }
    if (checkpointId) await updateRecoveryCheckpointProgress({
      checkpointId, projectionName: VIEWER_STATE_PROJECTION, scope: "checkpointed_full", cursor: nextCursor,
      lastProcessedPath, scannedDelta: users.length, writtenDelta: written, failedDelta: failed,
      status: nextCursor ? "partial" : "completed",
    });
    const verification = request.verify ? await verifyViewerState(stateCandidates, request, `${summary.runId}:verification`) : null;
    if (verification) {
      await writeVerificationResult(verification);
      await updateProjectionHealthFromVerification(verification);
    }
    const verificationFailures = verification ? verification.missingProjectionCount + verification.staleProjectionCount + verification.extraProjectionCount : 0;
    summary = await completeRecoveryRun(summary, {
      status: failed > 0 ? "partial" : nextCursor ? "partial" : "completed",
      scanned: users.length, eligible: stateCandidates.length, wouldWrite, written, skipped, failed,
      verified: verification?.scanned ?? 0, verificationFailures, nextCursor, checkpointUpdated: !!checkpointId, failureLedgerIds,
    });
    await updateProjectionHealthFromRecoverySummary(summary);
    const definition = getProjectionDefinition(VIEWER_STATE_PROJECTION);
    const gate = definition ? evaluateProjectionCertification(definition) : null;
    return { summary, verification, certification: { projectionName: VIEWER_STATE_PROJECTION, passed: gate?.passed ?? false, missingRequirements: gate?.missingRequirements ?? ["registered_definition"] } };
  } catch (error) {
    summary = await failRecoveryRun(summary, { failedCount: Math.max(1, summary.failed), failureLedgerIds });
    await updateProjectionHealthFromRecoverySummary(summary);
    throw error;
  }
}

export const recoverSocialPostRenderProjection = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  assertRoleFromClaims(caller, "superadmin");
  return recoverSocialPostRenderProjectionForRequest(request.data as SocialRenderRecoveryRequest, caller.uid);
});

export const recoverProjectedViewerState = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  assertRoleFromClaims(caller, "superadmin");
  return recoverProjectedViewerStateForRequest(request.data as ViewerStateRecoveryRequest, caller.uid);
});
