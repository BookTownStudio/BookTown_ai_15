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

const PROJECTION_NAME = "event_stats";
const DEFAULT_BATCH_SIZE = 100;
const HARD_MAX_BATCH_SIZE = 100;

type EventStatsScope = "single_event" | "collection_page" | "checkpointed_full";
type ReconciliationMode = "report_only" | "repair";

type EventStatsRecoveryRequest = {
  mode?: RecoveryMode;
  scope: EventStatsScope;
  eventId?: string;
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
  eventId: string;
  authorityPath: string;
};

export type ExpectedEventStatsCounters = {
  rsvps: number;
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

function hasTimestampLike(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === "object" &&
      "toMillis" in value &&
      typeof (value as { toMillis?: unknown }).toMillis === "function"
  );
}

function normalizeRequest(
  raw: unknown,
  fallbackUid: string
): Required<
  Pick<
    EventStatsRecoveryRequest,
    "mode" | "scope" | "batchSize" | "maxDocs" | "verify" | "reconciliationMode" | "requestedBy" | "reason"
  >
> &
  Omit<
    EventStatsRecoveryRequest,
    "mode" | "scope" | "batchSize" | "maxDocs" | "verify" | "reconciliationMode" | "requestedBy" | "reason"
  > {
  const input =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const scope = readString(input.scope, 40) as EventStatsScope;
  if (
    scope !== "single_event" &&
    scope !== "collection_page" &&
    scope !== "checkpointed_full"
  ) {
    throw new HttpsError("invalid-argument", "Invalid event stats recovery scope.");
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
    eventId: readString(input.eventId, 180) || undefined,
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

function toRecoveryScope(scope: EventStatsScope): RecoveryScope {
  if (scope === "single_event") return "single_doc";
  return scope;
}

function buildRecoveryRequest(input: ReturnType<typeof normalizeRequest>): RecoveryRequest {
  return {
    projectionName: PROJECTION_NAME,
    mode: input.mode,
    scope: toRecoveryScope(input.scope),
    targetId: input.eventId,
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
  if (request.scope === "single_event") {
    if (!request.eventId) throw new HttpsError("invalid-argument", "eventId is required.");
    return {
      candidates: [{ eventId: request.eventId, authorityPath: `events/${request.eventId}` }],
      nextCursor: null,
      checkpointId: null,
      lastProcessedPath: `events/${request.eventId}`,
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

  const collection = request.scope === "collection_page" ? "event_stats" : "events";
  const base = db.collection(collection).orderBy(FieldPath.documentId());
  const snap = await (cursor ? base.startAfter(cursor) : base).limit(limit).get();
  return {
    candidates: snap.docs.map((doc) => ({
      eventId: doc.id,
      authorityPath: request.scope === "collection_page" ? `event_stats/${doc.id}` : doc.ref.path,
    })),
    nextCursor: snap.size === limit ? snap.docs[snap.docs.length - 1].id : null,
    checkpointId,
    lastProcessedPath: snap.docs[snap.docs.length - 1]?.ref.path ?? null,
  };
}

export async function computeExpectedEventStats(eventId: string): Promise<ExpectedEventStatsCounters> {
  const rsvpsSnap = await db.collection("events").doc(eventId).collection("rsvps").count().get();
  return { rsvps: readCounter(rsvpsSnap.data().count) };
}

function nestedCounters(data: Record<string, unknown>): Record<string, unknown> {
  return data.counters && typeof data.counters === "object"
    ? (data.counters as Record<string, unknown>)
    : {};
}

export function eventStatsMatches(
  expected: ExpectedEventStatsCounters,
  stats: Record<string, unknown>
): boolean {
  const counters = nestedCounters(stats);
  return (
    readCounter(stats.rsvps) === expected.rsvps &&
    readCounter(stats.rsvpsCount) === expected.rsvps &&
    readCounter(counters.rsvps) === expected.rsvps &&
    hasTimestampLike(stats.updatedAt)
  );
}

async function writeExactEventCounters(eventId: string, expected: ExpectedEventStatsCounters): Promise<void> {
  const now = admin.firestore.FieldValue.serverTimestamp();
  await db.collection("event_stats").doc(eventId).set(
    {
      counters: {
        rsvps: expected.rsvps,
      },
      rsvps: expected.rsvps,
      rsvpsCount: expected.rsvps,
      lastRecoveredAt: now,
      lastUpdatedAt: now,
      updatedAt: now,
    },
    { merge: true }
  );
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
    projectionCollection: "event_stats",
    triggerName: "recoverEventStats",
    sourcePath: params.candidate.authorityPath,
    sourceEventId: `event_stats:${params.candidate.eventId}`,
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
    const [eventSnap, statsSnap, expected] = await Promise.all([
      db.collection("events").doc(candidate.eventId).get(),
      db.collection("event_stats").doc(candidate.eventId).get(),
      computeExpectedEventStats(candidate.eventId),
    ]);
    if (!eventSnap.exists && statsSnap.exists) {
      extraProjectionCount += 1;
      sampleFailures.push({
        authorityPath: candidate.authorityPath,
        projectionPath: `event_stats/${candidate.eventId}`,
        reason: "orphan_event_stats",
      });
      continue;
    }
    if (!statsSnap.exists) {
      missingProjectionCount += 1;
      sampleFailures.push({
        authorityPath: candidate.authorityPath,
        projectionPath: `event_stats/${candidate.eventId}`,
        reason: "missing_event_stats",
      });
      continue;
    }
    if (eventStatsMatches(expected, statsSnap.data() || {})) {
      matched += 1;
      continue;
    }
    staleProjectionCount += 1;
    mismatchCount += 1;
    sampleFailures.push({
      authorityPath: candidate.authorityPath,
      projectionPath: `event_stats/${candidate.eventId}`,
      reason: "rsvp_count_drift",
    });
  }

  const failed = missingProjectionCount + staleProjectionCount + extraProjectionCount;
  return createVerificationResult({
    verificationId,
    projectionName: PROJECTION_NAME,
    authorityQuery: `events/{eventId}/rsvps/{userId} scope=${request.scope}`,
    projectionQuery: "event_stats",
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

export async function recoverEventStatsForRequest(
  rawRequest: EventStatsRecoveryRequest,
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
        const [eventSnap, statsSnap, expected] = await Promise.all([
          db.collection("events").doc(candidate.eventId).get(),
          db.collection("event_stats").doc(candidate.eventId).get(),
          computeExpectedEventStats(candidate.eventId),
        ]);
        const needsWrite =
          !statsSnap.exists ||
          !eventSnap.exists ||
          !eventStatsMatches(expected, statsSnap.data() || {});
        if (needsWrite) wouldWrite += 1;
        if (request.mode === "write" && request.reconciliationMode === "repair" && needsWrite && eventSnap.exists) {
          await writeExactEventCounters(candidate.eventId, expected);
          written += 1;
        } else {
          skipped += needsWrite ? 1 : 0;
        }
        if (!eventSnap.exists && statsSnap.exists) {
          failureLedgerIds.push(await recordFailure({
            candidate,
            operation: request.reconciliationMode === "repair" ? "reconcile" : "verify",
            failureClass: "authority_missing",
            message: "event_stats exists for a missing event authority document.",
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

export const recoverEventStats = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  assertRoleFromClaims(caller, "superadmin");
  return recoverEventStatsForRequest(request.data as EventStatsRecoveryRequest, caller.uid);
});
