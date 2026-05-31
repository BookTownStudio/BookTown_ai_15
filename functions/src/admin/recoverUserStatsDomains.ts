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
import { computeProfileCompletionScore, PCS_VERSION } from "../userStats/profileCompletion";

const db = admin.firestore();

const PROJECTION_NAME = "user_stats_domain_split";
export const USER_STATS_DOMAIN_PROJECTIONS = [
  "library_user_stats",
  "shelf_user_stats",
  "content_user_stats",
  "writing_user_stats",
  "profile_quality_stats",
  "storage_user_stats",
] as const;

type DomainProjection = typeof USER_STATS_DOMAIN_PROJECTIONS[number];
type UserStatsScope = "single_user" | "collection_page" | "checkpointed_full";
type ReconciliationMode = "report_only" | "repair";

type UserStatsDomainRecoveryRequest = {
  mode?: RecoveryMode;
  scope: UserStatsScope;
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
  domains?: DomainProjection[];
};

type Candidate = {
  uid: string;
  authorityPath: string;
};

type DomainValues = {
  libraryBooks: number;
  shelvesCreated: number;
  posts: number;
  reviews: number;
  quotes: number;
  projects: number;
  wordsWritten: number;
  profileCompletionScore: number;
  attachmentStorageBytes: number;
  attachmentStorageFiles: number;
};

type DomainExpected = {
  domain: DomainProjection;
  values: Partial<DomainValues>;
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
    UserStatsDomainRecoveryRequest,
    "mode" | "scope" | "batchSize" | "maxDocs" | "verify" | "reconciliationMode" | "requestedBy" | "reason" | "domains"
  >
> &
  Omit<
    UserStatsDomainRecoveryRequest,
    "mode" | "scope" | "batchSize" | "maxDocs" | "verify" | "reconciliationMode" | "requestedBy" | "reason" | "domains"
  > {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const scope = readString(input.scope, 40) as UserStatsScope;
  if (scope !== "single_user" && scope !== "collection_page" && scope !== "checkpointed_full") {
    throw new HttpsError("invalid-argument", "Invalid user stats domain recovery scope.");
  }
  const mode: RecoveryMode = readString(input.mode, 20) === "write" ? "write" : "dry_run";
  const reconciliationRaw = readString(input.reconciliationMode, 20);
  const reconciliationMode: ReconciliationMode =
    reconciliationRaw === "repair" || (mode === "write" && reconciliationRaw !== "report_only")
      ? "repair"
      : "report_only";
  const reason = readString(input.reason, 500);
  if (!reason) throw new HttpsError("invalid-argument", "reason is required.");
  const requestedDomains = Array.isArray(input.domains)
    ? input.domains.map((item) => readString(item, 80)).filter((item): item is DomainProjection =>
      USER_STATS_DOMAIN_PROJECTIONS.includes(item as DomainProjection)
    )
    : [];

  return {
    mode,
    scope,
    uid: readString(input.uid, 128) || undefined,
    cursor: readString(input.cursor, 500) || undefined,
    checkpointId: readString(input.checkpointId, 500) || undefined,
    batchSize: readPositiveInt(input.batchSize, 100, 100),
    maxDocs: readPositiveInt(input.maxDocs, 100, MAX_RECOVERY_BATCH_SIZE),
    verify: readBoolean(input.verify, true),
    reconciliationMode,
    requestedBy: readString(input.requestedBy, 128) || fallbackUid,
    reason,
    correlationId: readString(input.correlationId, 128) || undefined,
    domains: requestedDomains.length > 0 ? requestedDomains : [...USER_STATS_DOMAIN_PROJECTIONS],
  };
}

function buildRecoveryRequest(request: ReturnType<typeof normalizeRequest>): RecoveryRequest {
  const scope: RecoveryScope = request.scope === "single_user" ? "owner" : request.scope;
  return {
    projectionName: PROJECTION_NAME,
    mode: request.mode,
    scope,
    ownerId: request.uid,
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

  const collection = request.scope === "collection_page" ? "user_stats" : "users";
  const limit = Math.min(request.batchSize, request.maxDocs, 100);
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

async function count(query: FirebaseFirestore.Query): Promise<number> {
  const snap = await query.count().get();
  return readCounter(snap.data().count);
}

async function sumProjectWords(uid: string): Promise<{ projects: number; wordsWritten: number }> {
  const snap = await db.collection("users").doc(uid).collection("projects").limit(1000).get();
  let wordsWritten = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const stats = data.stats && typeof data.stats === "object"
      ? data.stats as Record<string, unknown>
      : {};
    wordsWritten += readCounter(data.wordCount ?? data.wordsWritten ?? stats.wordCount);
  }
  return { projects: snap.size, wordsWritten };
}

async function computeExpected(uid: string): Promise<DomainValues> {
  const [userSnap, libraryBooks, shelvesCreated, posts, reviews, quotesOwner, quotesAuthor, attachmentsSnap, writing] =
    await Promise.all([
      db.collection("users").doc(uid).get(),
      count(db.collection("user_library_books").where("uid", "==", uid)),
      count(db.collection("shelves").where("ownerId", "==", uid).where("isVirtual", "==", false)),
      count(db.collection("posts").where("authorId", "==", uid)),
      count(db.collection("reviews").where("uid", "==", uid).where("status", "==", "active")),
      count(db.collection("quotes").where("ownerId", "==", uid)),
      count(db.collection("quotes").where("authorUid", "==", uid)),
      db.collection("attachments").where("uploader.uid", "==", uid).limit(1000).get(),
      sumProjectWords(uid),
    ]);
  let attachmentStorageBytes = 0;
  for (const doc of attachmentsSnap.docs) attachmentStorageBytes += readCounter(doc.get("size"));
  const quotes = Math.max(quotesOwner, quotesAuthor);
  const profileCompletionScore = computeProfileCompletionScore({
    hasAvatar: Boolean(userSnap.get("avatarUrl")),
    hasBio: Boolean(userSnap.get("bioEn") || userSnap.get("bioAr")),
    shelvesCreated,
    posts,
    reviews,
    booksRead: libraryBooks,
    wordsWritten: writing.wordsWritten,
  });
  return {
    libraryBooks,
    shelvesCreated,
    posts,
    reviews,
    quotes,
    projects: writing.projects,
    wordsWritten: writing.wordsWritten,
    profileCompletionScore,
    attachmentStorageBytes,
    attachmentStorageFiles: attachmentsSnap.size,
  };
}

function expectedForDomain(domain: DomainProjection, values: DomainValues): DomainExpected {
  if (domain === "library_user_stats") return { domain, values: { libraryBooks: values.libraryBooks } };
  if (domain === "shelf_user_stats") return { domain, values: { shelvesCreated: values.shelvesCreated } };
  if (domain === "content_user_stats") {
    return { domain, values: { posts: values.posts, reviews: values.reviews, quotes: values.quotes } };
  }
  if (domain === "writing_user_stats") {
    return { domain, values: { projects: values.projects, wordsWritten: values.wordsWritten } };
  }
  if (domain === "storage_user_stats") {
    return { domain, values: { attachmentStorageBytes: values.attachmentStorageBytes, attachmentStorageFiles: values.attachmentStorageFiles } };
  }
  return { domain, values: { profileCompletionScore: values.profileCompletionScore } };
}

function statsMatches(stats: Record<string, unknown>, expected: DomainExpected): boolean {
  const counters = stats.counters && typeof stats.counters === "object"
    ? stats.counters as Record<string, unknown>
    : {};
  const values = expected.values;
  return Object.entries(values).every(([key, value]) => {
    if (key === "libraryBooks") return readCounter(stats.libraryBooks) === value || readCounter(counters.totalBooks) === value;
    if (key === "shelvesCreated") return readCounter(stats.shelvesCreated) === value || readCounter(counters.totalShelves) === value;
    if (key === "attachmentStorageBytes") return readCounter(stats.storageUsageBytes) === value || readCounter(counters.attachmentStorageBytes) === value;
    return readCounter(stats[key]) === value || readCounter(counters[key]) === value;
  });
}

function buildPatch(values: DomainValues, domains: DomainProjection[]): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastRecoveredAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (domains.includes("library_user_stats")) {
    patch.libraryBooks = values.libraryBooks;
    patch["counters.totalBooks"] = values.libraryBooks;
  }
  if (domains.includes("shelf_user_stats")) {
    patch.shelvesCreated = values.shelvesCreated;
    patch["counters.totalShelves"] = values.shelvesCreated;
  }
  if (domains.includes("content_user_stats")) {
    patch.posts = values.posts;
    patch.reviews = values.reviews;
    patch.quotes = values.quotes;
    patch["counters.posts"] = values.posts;
    patch["counters.reviews"] = values.reviews;
    patch["counters.quotes"] = values.quotes;
  }
  if (domains.includes("writing_user_stats")) {
    patch.projects = values.projects;
    patch.wordsWritten = values.wordsWritten;
    patch["counters.projects"] = values.projects;
    patch["counters.wordsWritten"] = values.wordsWritten;
  }
  if (domains.includes("storage_user_stats")) {
    patch.storageUsageBytes = values.attachmentStorageBytes;
    patch.attachmentStorageFiles = values.attachmentStorageFiles;
    patch["counters.attachmentStorageBytes"] = values.attachmentStorageBytes;
    patch["counters.attachmentStorageFiles"] = values.attachmentStorageFiles;
  }
  if (domains.includes("profile_quality_stats")) {
    patch.profileCompletionScore = values.profileCompletionScore;
    patch.pcsVersion = PCS_VERSION;
  }
  return patch;
}

async function recordFailure(params: {
  candidate: Candidate;
  projectionName: string;
  operation: "verify" | "reconcile";
  message: string;
  correlationId?: string;
}) {
  const failure = await recordProjectionFailure({
    projectionName: params.projectionName,
    projectionCollection: "user_stats",
    triggerName: "recoverUserStatsDomains",
    sourcePath: params.candidate.authorityPath,
    sourceEventId: `user_stats_domain:${params.candidate.uid}`,
    operation: params.operation,
    failureClass: "write_failed",
    lastErrorMessage: params.message,
    correlationId: params.correlationId,
  });
  await updateProjectionHealthFromFailure(failure);
  return failure.failureId;
}

async function verifyDomain(
  domain: DomainProjection,
  candidates: Candidate[],
  expectedByUid: Map<string, DomainValues>,
  verificationId: string
): Promise<VerificationResult> {
  let scanned = 0;
  let matched = 0;
  let missingProjectionCount = 0;
  let staleProjectionCount = 0;
  let extraProjectionCount = 0;
  const sampleFailures: VerificationResult["sampleFailures"] = [];
  for (const candidate of candidates) {
    scanned += 1;
    const [userSnap, statsSnap] = await Promise.all([
      db.collection("users").doc(candidate.uid).get(),
      db.collection("user_stats").doc(candidate.uid).get(),
    ]);
    if (!userSnap.exists && statsSnap.exists) {
      extraProjectionCount += 1;
      sampleFailures.push({ authorityPath: candidate.authorityPath, projectionPath: `user_stats/${candidate.uid}`, reason: "orphan_stats" });
      continue;
    }
    if (!statsSnap.exists) {
      missingProjectionCount += 1;
      sampleFailures.push({ authorityPath: candidate.authorityPath, projectionPath: `user_stats/${candidate.uid}`, reason: "missing_stats" });
      continue;
    }
    const expected = expectedForDomain(domain, expectedByUid.get(candidate.uid)!);
    if (statsMatches(statsSnap.data() || {}, expected)) matched += 1;
    else {
      staleProjectionCount += 1;
      sampleFailures.push({ authorityPath: candidate.authorityPath, projectionPath: `user_stats/${candidate.uid}`, reason: "domain_drift" });
    }
  }
  const failed = missingProjectionCount + staleProjectionCount + extraProjectionCount;
  return createVerificationResult({
    verificationId: `${verificationId}:${domain}`,
    projectionName: domain,
    authorityQuery: `${domain} authority`,
    projectionQuery: `user_stats/${domain}`,
    status: failed === 0 ? "passed" : "failed",
    scanned,
    matched,
    missingProjectionCount,
    staleProjectionCount,
    mismatchCount: staleProjectionCount,
    extraProjectionCount,
    verificationSuccessRate: scanned > 0 ? Number((matched / scanned).toFixed(6)) : 1,
    sampleFailures: sampleFailures.slice(0, 20),
    nextCursor: null,
  });
}

export async function recoverUserStatsDomainsForRequest(rawRequest: UserStatsDomainRecoveryRequest, fallbackUid = "system") {
  const request = normalizeRequest(rawRequest, fallbackUid);
  let summary = await startRecoveryRun(buildRecoveryRequest(request));
  const failureLedgerIds: string[] = [];
  try {
    const { candidates, nextCursor, checkpointId, lastProcessedPath } = await loadCandidates(request);
    const expectedByUid = new Map<string, DomainValues>();
    let wouldWrite = 0;
    let written = 0;
    let skipped = 0;
    let failed = 0;
    for (const candidate of candidates) {
      try {
        const expected = await computeExpected(candidate.uid);
        expectedByUid.set(candidate.uid, expected);
        const statsSnap = await db.collection("user_stats").doc(candidate.uid).get();
        const needsWrite = request.domains.some((domain) => !statsSnap.exists || !statsMatches(statsSnap.data() || {}, expectedForDomain(domain, expected)));
        if (needsWrite) wouldWrite += 1;
        if (request.mode === "write" && request.reconciliationMode === "repair" && needsWrite) {
          await db.collection("user_stats").doc(candidate.uid).set(buildPatch(expected, request.domains), { merge: true });
          written += 1;
        } else {
          skipped += needsWrite ? 1 : 0;
        }
      } catch (error) {
        failed += 1;
        failureLedgerIds.push(await recordFailure({
          candidate,
          projectionName: PROJECTION_NAME,
          operation: request.reconciliationMode === "repair" ? "reconcile" : "verify",
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
    const verifications: VerificationResult[] = [];
    if (request.verify) {
      for (const domain of request.domains) {
        const verification = await verifyDomain(domain, candidates, expectedByUid, `${summary.runId}:verification`);
        verifications.push(verification);
        await writeVerificationResult(verification);
        await updateProjectionHealthFromVerification(verification);
      }
    }
    const verificationFailures = verifications.reduce(
      (sum, verification) => sum + verification.missingProjectionCount + verification.staleProjectionCount + verification.extraProjectionCount,
      0
    );
    summary = await completeRecoveryRun(summary, {
      status: failed > 0 ? "partial" : nextCursor ? "partial" : "completed",
      scanned: candidates.length,
      eligible: candidates.length,
      wouldWrite,
      written,
      skipped,
      failed,
      verified: verifications.reduce((sum, verification) => sum + verification.scanned, 0),
      verificationFailures,
      nextCursor,
      checkpointUpdated: !!checkpointId,
      failureLedgerIds,
    });
    await updateProjectionHealthFromRecoverySummary(summary);
    return {
      summary,
      verifications,
      certification: [...request.domains, "user_stats"].map((projectionName) => {
        const definition = getProjectionDefinition(projectionName);
        const gate = definition ? evaluateProjectionCertification(definition) : null;
        return {
          projectionName,
          passed: gate?.passed ?? false,
          missingRequirements: gate?.missingRequirements ?? ["registered_definition"],
        };
      }),
    };
  } catch (error) {
    summary = await failRecoveryRun(summary, { failedCount: Math.max(1, summary.failed), failureLedgerIds });
    await updateProjectionHealthFromRecoverySummary(summary);
    throw error;
  }
}

export const recoverUserStatsDomains = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  assertRoleFromClaims(caller, "superadmin");
  return recoverUserStatsDomainsForRequest(request.data as UserStatsDomainRecoveryRequest, caller.uid);
});
