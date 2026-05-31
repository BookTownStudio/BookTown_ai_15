import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldPath } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import { assertActiveAuthenticatedUser, assertRoleFromClaims } from "../shared/auth";
import {
  buildSearchBookmarkProjection,
  buildSearchFeedProjectionFromAuthorities,
  buildSearchNotificationProjection,
} from "../triggers/searchTriggers";
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

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 100;

type ReconciliationMode = "report_only" | "repair";
type SearchRecoveryScope =
  | "single_post"
  | "single_user"
  | "owner"
  | "collection_page"
  | "checkpointed_full";

type SearchRecoveryRequest = {
  mode?: RecoveryMode;
  scope: SearchRecoveryScope;
  postId?: string;
  uid?: string;
  ownerId?: string;
  cursor?: string;
  checkpointId?: string;
  batchSize?: number;
  maxDocs?: number;
  verify?: boolean;
  requestedBy?: string;
  reason?: string;
  correlationId?: string;
  reconciliationMode?: ReconciliationMode;
};

type WorkItem = {
  id: string;
  sourcePath: string;
  ref: FirebaseFirestore.DocumentReference;
  expected: Record<string, unknown> | null;
};

type LoadResult = {
  items: WorkItem[];
  scanned: number;
  nextCursor: string | null;
  checkpointId: string | null;
};

type SearchRecoveryResult = {
  summary: RecoverySummary;
  verification: VerificationResult | null;
  reconciliation: {
    mode: ReconciliationMode;
    driftedDocumentCount: number;
    repairedDocumentCount: number;
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

function normalizeRequest(
  raw: unknown,
  fallbackUid: string,
  allowedScopes: readonly SearchRecoveryScope[]
): Required<
  Pick<SearchRecoveryRequest, "mode" | "scope" | "batchSize" | "maxDocs" | "verify" | "requestedBy" | "reason" | "reconciliationMode">
> & Omit<SearchRecoveryRequest, "mode" | "scope" | "batchSize" | "maxDocs" | "verify" | "requestedBy" | "reason" | "reconciliationMode"> {
  const input =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const scope = readString(input.scope, 40) as SearchRecoveryScope;
  if (!allowedScopes.includes(scope)) {
    throw new HttpsError("invalid-argument", "Invalid search recovery scope.");
  }
  const reason = readString(input.reason, 500);
  if (!reason) throw new HttpsError("invalid-argument", "reason is required.");
  const modeRaw = readString(input.mode, 20);
  const reconciliationModeRaw = readString(input.reconciliationMode, 20);
  return {
    mode: modeRaw === "write" ? "write" : "dry_run",
    scope,
    postId: readString(input.postId, 180) || undefined,
    uid: readString(input.uid, 128) || undefined,
    ownerId: readString(input.ownerId, 128) || undefined,
    cursor: readString(input.cursor, 500) || undefined,
    checkpointId: readString(input.checkpointId, 500) || undefined,
    batchSize: readPositiveInt(input.batchSize, DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE),
    maxDocs: readPositiveInt(input.maxDocs, DEFAULT_BATCH_SIZE, MAX_RECOVERY_BATCH_SIZE),
    verify: readBoolean(input.verify, true),
    requestedBy: readString(input.requestedBy, 128) || fallbackUid,
    reason,
    correlationId: readString(input.correlationId, 128) || undefined,
    reconciliationMode: reconciliationModeRaw === "repair" ? "repair" : "report_only",
  };
}

function mapScope(scope: SearchRecoveryScope): RecoveryScope {
  if (scope === "single_post" || scope === "single_user") return "single_doc";
  if (scope === "owner") return "owner";
  return scope;
}

function recoveryRequest(projectionName: string, request: ReturnType<typeof normalizeRequest>): RecoveryRequest {
  return {
    projectionName,
    mode: request.mode,
    scope: mapScope(request.scope),
    targetId: request.postId || request.uid,
    ownerId: request.ownerId || request.uid,
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

function projectionRef(collection: string, id: string): FirebaseFirestore.DocumentReference {
  return db.collection(collection).doc(id);
}

function comparable(data: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!data) return null;
  const copy = { ...data };
  delete copy.indexedAt;
  delete copy.lastActivityAt;
  return copy;
}

function matches(expected: Record<string, unknown> | null, actual: Record<string, unknown> | null): boolean {
  return JSON.stringify(comparable(expected)) === JSON.stringify(comparable(actual));
}

function parseCursor(cursor: string | undefined): Record<string, string | undefined> {
  if (!cursor) return {};
  try {
    return JSON.parse(cursor) as Record<string, string | undefined>;
  } catch {
    return { authorityCursor: cursor, projectionCursor: cursor };
  }
}

function buildCursor(input: Record<string, string | null>): string | null {
  const populated = Object.fromEntries(Object.entries(input).filter(([, value]) => !!value));
  return Object.keys(populated).length > 0 ? JSON.stringify(populated) : null;
}

async function loadSearchFeed(request: ReturnType<typeof normalizeRequest>): Promise<LoadResult> {
  if (request.scope === "single_post") {
    if (!request.postId) throw new HttpsError("invalid-argument", "postId is required.");
    const snap = await db.collection("posts").doc(request.postId).get();
    const expected = snap.exists
      ? await buildSearchFeedProjectionFromAuthorities(request.postId, snap.data() || {})
      : null;
    return {
      items: [{
        id: request.postId,
        sourcePath: `posts/${request.postId}`,
        ref: projectionRef("search_feed", request.postId),
        expected,
      }],
      scanned: 1,
      nextCursor: null,
      checkpointId: null,
    };
  }

  let cursor = request.cursor;
  let checkpointId: string | null = null;
  if (request.scope === "checkpointed_full") {
    checkpointId = request.checkpointId || buildRecoveryCheckpointId({ projectionName: "search_feed", scope: "checkpointed_full" });
    const checkpoint = await readRecoveryCheckpoint(checkpointId);
    cursor = request.cursor || checkpoint?.cursor || undefined;
  }
  const parsed = parseCursor(cursor);
  const limit = Math.min(request.batchSize, request.maxDocs);
  let query = db.collection("posts").orderBy(FieldPath.documentId()).limit(limit);
  if (request.scope === "owner") {
    const ownerId = request.ownerId || request.uid;
    if (!ownerId) throw new HttpsError("invalid-argument", "ownerId is required.");
    query = db.collection("posts").where("authorId", "==", ownerId).orderBy(FieldPath.documentId()).limit(limit);
  }
  if (parsed.authorityCursor) query = query.startAfter(parsed.authorityCursor);
  const authoritySnap = await query.get();

  let projectionQuery = db.collection("search_feed").orderBy(FieldPath.documentId()).limit(limit);
  if (parsed.projectionCursor) projectionQuery = projectionQuery.startAfter(parsed.projectionCursor);
  const projectionSnap = request.scope === "owner" ? { docs: [], size: 0 } as unknown as FirebaseFirestore.QuerySnapshot : await projectionQuery.get();

  const ids = new Map<string, { sourcePath: string; post?: FirebaseFirestore.QueryDocumentSnapshot }>();
  for (const doc of authoritySnap.docs) ids.set(doc.id, { sourcePath: doc.ref.path, post: doc });
  for (const doc of projectionSnap.docs) {
    if (!ids.has(doc.id)) ids.set(doc.id, { sourcePath: `posts/${doc.id}` });
  }
  const items: WorkItem[] = [];
  for (const [id, entry] of ids) {
    let post = entry.post;
    if (!post) {
      const snap = await db.collection("posts").doc(id).get();
      post = snap.exists ? snap as FirebaseFirestore.QueryDocumentSnapshot : undefined;
    }
    const expected = post ? await buildSearchFeedProjectionFromAuthorities(id, post.data() || {}) : null;
    items.push({ id, sourcePath: entry.sourcePath, ref: projectionRef("search_feed", id), expected });
  }
  return {
    items,
    scanned: authoritySnap.size + projectionSnap.size,
    nextCursor: buildCursor({
      authorityCursor: authoritySnap.size === limit ? authoritySnap.docs[authoritySnap.docs.length - 1].id : null,
      projectionCursor: projectionSnap.size === limit ? projectionSnap.docs[projectionSnap.docs.length - 1].id : null,
    }),
    checkpointId,
  };
}

type BookmarkAuthority = {
  uid: string;
  entityId: string;
  entityType: "post" | "venue" | "event" | "quote";
  createdAt?: unknown;
  sourcePath: string;
};

function bookmarkAuthorityFromDoc(doc: FirebaseFirestore.QueryDocumentSnapshot, collectionName: string): BookmarkAuthority | null {
  const segments = doc.ref.path.split("/");
  const usersIndex = segments.indexOf("users");
  const uid = usersIndex >= 0 ? segments[usersIndex + 1] : "";
  const data = doc.data() || {};
  const rawType = collectionName === "venue_bookmarks" ? "venue" : collectionName === "event_bookmarks" ? "event" : readString(data.type, 40);
  if (rawType !== "post" && rawType !== "venue" && rawType !== "event" && rawType !== "quote") return null;
  if (!uid) return null;
  return {
    uid,
    entityId: readString(data.entityId, 190) || doc.id,
    entityType: rawType,
    createdAt: data.timestamp ?? data.createdAt ?? null,
    sourcePath: doc.ref.path,
  };
}

async function loadSearchBookmarks(request: ReturnType<typeof normalizeRequest>): Promise<LoadResult> {
  const limit = Math.min(request.batchSize, request.maxDocs);
  const userId = request.uid || request.ownerId;
  const authorities: BookmarkAuthority[] = [];
  if (request.scope === "single_user" || request.scope === "owner") {
    if (!userId) throw new HttpsError("invalid-argument", "uid or ownerId is required.");
    for (const collectionName of ["bookmarks", "venue_bookmarks", "event_bookmarks"]) {
      const snap = await db.collection("users").doc(userId).collection(collectionName).limit(limit).get();
      for (const doc of snap.docs) {
        const authority = bookmarkAuthorityFromDoc(doc, collectionName);
        if (authority) authorities.push(authority);
      }
    }
    const projectionSnap = await db.collection("search_bookmarks").where("uid", "==", userId).limit(limit).get();
    const byId = new Map<string, WorkItem>();
    for (const authority of authorities.slice(0, limit)) {
      byId.set(`${authority.uid}_${authority.entityId}`, {
        id: `${authority.uid}_${authority.entityId}`,
        sourcePath: authority.sourcePath,
        ref: projectionRef("search_bookmarks", `${authority.uid}_${authority.entityId}`),
        expected: buildSearchBookmarkProjection(authority),
      });
    }
    for (const doc of projectionSnap.docs) {
      if (!byId.has(doc.id)) {
        byId.set(doc.id, { id: doc.id, sourcePath: `users/${userId}/bookmarks`, ref: doc.ref, expected: null });
      }
    }
    return { items: [...byId.values()], scanned: authorities.length + projectionSnap.size, nextCursor: null, checkpointId: null };
  }

  let cursor = request.cursor;
  let checkpointId: string | null = null;
  if (request.scope === "checkpointed_full") {
    checkpointId = request.checkpointId || buildRecoveryCheckpointId({ projectionName: "search_bookmarks", scope: "checkpointed_full" });
    const checkpoint = await readRecoveryCheckpoint(checkpointId);
    cursor = request.cursor || checkpoint?.cursor || undefined;
  }
  const parsed = parseCursor(cursor);
  const authoritySnaps: Array<{
    collectionName: string;
    snap: FirebaseFirestore.QuerySnapshot;
    cursorKey: string;
  }> = [];
  for (const [collectionName, cursorKey] of [
    ["bookmarks", "bookmarksCursor"],
    ["venue_bookmarks", "venueCursor"],
    ["event_bookmarks", "eventCursor"],
  ] as const) {
    let authorityQuery = db.collectionGroup(collectionName).orderBy(FieldPath.documentId()).limit(limit);
    const collectionCursor = parsed[cursorKey] || parsed.authorityCursor;
    if (collectionCursor) authorityQuery = authorityQuery.startAfter(collectionCursor);
    authoritySnaps.push({ collectionName, snap: await authorityQuery.get(), cursorKey });
  }
  let projectionQuery = db.collection("search_bookmarks").orderBy(FieldPath.documentId()).limit(limit);
  if (parsed.projectionCursor) projectionQuery = projectionQuery.startAfter(parsed.projectionCursor);
  const projectionSnap = await projectionQuery.get();
  const byId = new Map<string, WorkItem>();
  for (const { collectionName, snap } of authoritySnaps) {
    for (const doc of snap.docs) {
      if (!doc.ref.path.startsWith("users/")) continue;
      const authority = bookmarkAuthorityFromDoc(doc, collectionName);
      if (!authority) continue;
      const id = `${authority.uid}_${authority.entityId}`;
      byId.set(id, { id, sourcePath: authority.sourcePath, ref: projectionRef("search_bookmarks", id), expected: buildSearchBookmarkProjection(authority) });
    }
  }
  for (const doc of projectionSnap.docs) {
    if (!byId.has(doc.id)) byId.set(doc.id, { id: doc.id, sourcePath: "users/*/bookmarks", ref: doc.ref, expected: null });
  }
  const cursorParts: Record<string, string | null> = {
    projectionCursor: projectionSnap.size === limit ? projectionSnap.docs[projectionSnap.docs.length - 1].id : null,
  };
  for (const { snap, cursorKey } of authoritySnaps) {
    cursorParts[cursorKey] = snap.size === limit ? snap.docs[snap.docs.length - 1].id : null;
  }
  return {
    items: [...byId.values()],
    scanned: authoritySnaps.reduce((total, entry) => total + entry.snap.size, projectionSnap.size),
    nextCursor: buildCursor(cursorParts),
    checkpointId,
  };
}

async function loadSearchNotifications(request: ReturnType<typeof normalizeRequest>): Promise<LoadResult> {
  const limit = Math.min(request.batchSize, request.maxDocs);
  if (request.scope === "single_user") {
    if (!request.uid) throw new HttpsError("invalid-argument", "uid is required.");
    const [authoritySnap, projectionSnap] = await Promise.all([
      db.collection("notifications").where("uid", "==", request.uid).limit(limit).get(),
      db.collection("search_notifications").where("uid", "==", request.uid).limit(limit).get(),
    ]);
    const byId = new Map<string, WorkItem>();
    for (const doc of authoritySnap.docs) {
      byId.set(doc.id, { id: doc.id, sourcePath: doc.ref.path, ref: projectionRef("search_notifications", doc.id), expected: buildSearchNotificationProjection(doc.id, doc.data() || {}) });
    }
    for (const doc of projectionSnap.docs) if (!byId.has(doc.id)) byId.set(doc.id, { id: doc.id, sourcePath: `notifications/${doc.id}`, ref: doc.ref, expected: null });
    return { items: [...byId.values()], scanned: authoritySnap.size + projectionSnap.size, nextCursor: null, checkpointId: null };
  }
  let cursor = request.cursor;
  let checkpointId: string | null = null;
  if (request.scope === "checkpointed_full") {
    checkpointId = request.checkpointId || buildRecoveryCheckpointId({ projectionName: "search_notifications", scope: "checkpointed_full" });
    const checkpoint = await readRecoveryCheckpoint(checkpointId);
    cursor = request.cursor || checkpoint?.cursor || undefined;
  }
  const parsed = parseCursor(cursor);
  let authorityQuery = db.collection("notifications").orderBy(FieldPath.documentId()).limit(limit);
  if (parsed.authorityCursor) authorityQuery = authorityQuery.startAfter(parsed.authorityCursor);
  const authoritySnap = await authorityQuery.get();
  let projectionQuery = db.collection("search_notifications").orderBy(FieldPath.documentId()).limit(limit);
  if (parsed.projectionCursor) projectionQuery = projectionQuery.startAfter(parsed.projectionCursor);
  const projectionSnap = await projectionQuery.get();
  const byId = new Map<string, WorkItem>();
  for (const doc of authoritySnap.docs) byId.set(doc.id, { id: doc.id, sourcePath: doc.ref.path, ref: projectionRef("search_notifications", doc.id), expected: buildSearchNotificationProjection(doc.id, doc.data() || {}) });
  for (const doc of projectionSnap.docs) if (!byId.has(doc.id)) byId.set(doc.id, { id: doc.id, sourcePath: `notifications/${doc.id}`, ref: doc.ref, expected: null });
  return {
    items: [...byId.values()],
    scanned: authoritySnap.size + projectionSnap.size,
    nextCursor: buildCursor({
      authorityCursor: authoritySnap.size === limit ? authoritySnap.docs[authoritySnap.docs.length - 1].id : null,
      projectionCursor: projectionSnap.size === limit ? projectionSnap.docs[projectionSnap.docs.length - 1].id : null,
    }),
    checkpointId,
  };
}

async function verifyItems(projectionName: string, collection: string, items: WorkItem[], verificationId: string): Promise<VerificationResult> {
  let matched = 0;
  let missingProjectionCount = 0;
  let staleProjectionCount = 0;
  let mismatchCount = 0;
  let extraProjectionCount = 0;
  const sampleFailures: VerificationResult["sampleFailures"] = [];
  for (const item of items) {
    const snap = await item.ref.get();
    const actual = snap.exists ? (snap.data() || {}) : null;
    if (item.expected && !actual) {
      missingProjectionCount += 1;
      sampleFailures.length < 20 && sampleFailures.push({ authorityPath: item.sourcePath, projectionPath: item.ref.path, reason: "missing_projection" });
      continue;
    }
    if (!item.expected && actual) {
      extraProjectionCount += 1;
      sampleFailures.length < 20 && sampleFailures.push({ authorityPath: item.sourcePath, projectionPath: item.ref.path, reason: "extra_projection" });
      continue;
    }
    if (item.expected && actual && !matches(item.expected, actual)) {
      staleProjectionCount += 1;
      mismatchCount += 1;
      sampleFailures.length < 20 && sampleFailures.push({ authorityPath: item.sourcePath, projectionPath: item.ref.path, reason: "stale_projection" });
      continue;
    }
    matched += 1;
  }
  const failed = missingProjectionCount + staleProjectionCount + extraProjectionCount;
  return createVerificationResult({
    verificationId,
    projectionName,
    authorityQuery: `${projectionName} canonical authorities`,
    projectionQuery: collection,
    status: failed === 0 ? "passed" : "failed",
    scanned: items.length,
    matched,
    missingProjectionCount,
    staleProjectionCount,
    mismatchCount,
    extraProjectionCount,
    verificationSuccessRate: items.length > 0 ? Number((matched / items.length).toFixed(6)) : 1,
    sampleFailures,
    nextCursor: null,
  });
}

async function runSearchRecovery(params: {
  projectionName: string;
  collection: string;
  rawRequest: SearchRecoveryRequest;
  fallbackUid: string;
  allowedScopes: readonly SearchRecoveryScope[];
  load: (request: ReturnType<typeof normalizeRequest>) => Promise<LoadResult>;
}): Promise<SearchRecoveryResult> {
  const request = normalizeRequest(params.rawRequest, params.fallbackUid, params.allowedScopes);
  let summary = await startRecoveryRun(recoveryRequest(params.projectionName, request));
  const failureLedgerIds: string[] = [];
  let driftedDocumentCount = 0;
  let repairedDocumentCount = 0;
  try {
    const loaded = await params.load(request);
    let written = 0;
    let skipped = 0;
    let failed = 0;
    for (const item of loaded.items) {
      try {
        const snap = await item.ref.get();
        const actual = snap.exists ? (snap.data() || {}) : null;
        const drifted = !matches(item.expected, actual);
        if (drifted) driftedDocumentCount += 1;
        if (request.mode === "write" && drifted) {
          if (item.expected) await item.ref.set(item.expected);
          else await item.ref.delete();
          written += 1;
          repairedDocumentCount += 1;
        } else if (drifted) {
          skipped += 1;
        }
      } catch (error) {
        failed += 1;
        const failure = await recordProjectionFailure({
          projectionName: params.projectionName,
          projectionCollection: params.collection,
          triggerName: `recover${params.projectionName}`,
          sourcePath: item.sourcePath,
          sourceEventId: `recovery:${summary.runId}:${item.id}`,
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
      name: "search_projection_reconciliation",
      value: driftedDocumentCount,
      unit: "count",
      dimensions: { projectionName: params.projectionName, driftedDocumentCount, repairedDocumentCount, failed },
    });
    if (loaded.checkpointId) {
      await updateRecoveryCheckpointProgress({
        checkpointId: loaded.checkpointId,
        projectionName: params.projectionName,
        scope: "checkpointed_full",
        cursor: loaded.nextCursor,
        lastProcessedPath: loaded.nextCursor,
        scannedDelta: loaded.scanned,
        writtenDelta: written,
        failedDelta: failed,
        status: loaded.nextCursor ? "partial" : "completed",
      });
    }
    let verification: VerificationResult | null = null;
    let verificationFailures = 0;
    if (request.verify) {
      verification = await verifyItems(params.projectionName, params.collection, loaded.items, `${summary.runId}:verification`);
      await writeVerificationResult(verification);
      await updateProjectionHealthFromVerification(verification);
      verificationFailures = verification.missingProjectionCount + verification.staleProjectionCount + verification.extraProjectionCount;
    }
    summary = await completeRecoveryRun(summary, {
      status: failed > 0 ? "partial" : loaded.nextCursor ? "partial" : "completed",
      scanned: loaded.scanned,
      eligible: loaded.items.length,
      wouldWrite: driftedDocumentCount,
      written,
      skipped,
      failed,
      verified: verification?.scanned ?? 0,
      verificationFailures,
      nextCursor: loaded.nextCursor,
      checkpointUpdated: !!loaded.checkpointId,
      failureLedgerIds,
    });
    await updateProjectionHealthFromRecoverySummary(summary);
    const definition = getProjectionDefinition(params.projectionName);
    const certification = definition ? evaluateProjectionCertification(definition) : null;
    return {
      summary,
      verification,
      reconciliation: { mode: request.reconciliationMode, driftedDocumentCount, repairedDocumentCount },
      certification: [{
        projectionName: params.projectionName,
        passed: certification?.passed ?? false,
        missingRequirements: certification?.missingRequirements ?? ["registered_definition"],
      }],
    };
  } catch (error) {
    summary = await failRecoveryRun(summary, { failedCount: Math.max(1, summary.failed), failureLedgerIds });
    await updateProjectionHealthFromRecoverySummary(summary);
    throw error;
  }
}

export async function recoverSearchFeedForRequest(rawRequest: SearchRecoveryRequest, fallbackUid = "system") {
  return runSearchRecovery({
    projectionName: "search_feed",
    collection: "search_feed",
    rawRequest,
    fallbackUid,
    allowedScopes: ["single_post", "owner", "collection_page", "checkpointed_full"],
    load: loadSearchFeed,
  });
}

export async function recoverSearchBookmarksForRequest(rawRequest: SearchRecoveryRequest, fallbackUid = "system") {
  return runSearchRecovery({
    projectionName: "search_bookmarks",
    collection: "search_bookmarks",
    rawRequest,
    fallbackUid,
    allowedScopes: ["single_user", "owner", "collection_page", "checkpointed_full"],
    load: loadSearchBookmarks,
  });
}

export async function recoverSearchNotificationsForRequest(rawRequest: SearchRecoveryRequest, fallbackUid = "system") {
  return runSearchRecovery({
    projectionName: "search_notifications",
    collection: "search_notifications",
    rawRequest,
    fallbackUid,
    allowedScopes: ["single_user", "collection_page", "checkpointed_full"],
    load: loadSearchNotifications,
  });
}

export const recoverSearchFeed = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  assertRoleFromClaims(caller, "superadmin");
  return recoverSearchFeedForRequest(request.data as SearchRecoveryRequest, caller.uid);
});

export const recoverSearchBookmarks = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  assertRoleFromClaims(caller, "superadmin");
  return recoverSearchBookmarksForRequest(request.data as SearchRecoveryRequest, caller.uid);
});

export const recoverSearchNotifications = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  assertRoleFromClaims(caller, "superadmin");
  return recoverSearchNotificationsForRequest(request.data as SearchRecoveryRequest, caller.uid);
});
