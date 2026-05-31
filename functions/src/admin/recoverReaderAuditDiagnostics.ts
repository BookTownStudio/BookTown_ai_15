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

const PROJECTION_NAME = "reader_audit_diagnostics";
const DEFAULT_BATCH_SIZE = 100;
const HARD_MAX_BATCH_SIZE = 100;
const SAFE_STRING_LENGTH = 160;
const SAFE_SCALAR_KEYS = [
  "bookId",
  "format",
  "engine",
  "phase",
  "category",
  "code",
  "correlationId",
  "manifestVersion",
  "pipelineVersion",
  "locationMapStatus",
  "sectionGraphStatus",
  "stableAnchorMapStatus",
  "navigationIndexStatus",
  "searchIndexStatus",
  "highlightAnchorsStatus",
  "accepted",
  "applied",
  "deduped",
  "rejected",
  "failureRate",
  "durationMs",
  "queueSize",
  "remainingQueueSize",
  "isOffline",
  "recoverable",
] as const;
const FORBIDDEN_KEY_PATTERN = /(text|quote|note|highlight|selection|content|cfi|anchor|url|signed|storagePath)/i;

type ReaderAuditScope = "single_user" | "collection_page" | "checkpointed_full";
type ReconciliationMode = "report_only" | "repair";

type ReaderAuditRecoveryRequest = {
  mode?: RecoveryMode;
  scope: ReaderAuditScope;
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
  eventId: string;
  authorityPath: string;
  projectionPath: string;
  uid: string;
  data: Record<string, unknown>;
};

type ExpectedDiagnostic = {
  uid: string;
  sourceEventId: string;
  sourcePath: string;
  eventName: string;
  severity: "info" | "warn" | "error";
  eventAt: Timestamp | null;
  schemaVersion: 1;
  diagnostics: Record<string, string | number | boolean | null>;
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function safeScalar(value: unknown): string | number | boolean | null | undefined {
  if (typeof value === "string") return value.trim().slice(0, SAFE_STRING_LENGTH);
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? value : Number(value.toFixed(4));
  }
  if (typeof value === "boolean" || value === null) return value;
  return undefined;
}

function normalizeSeverity(data: Record<string, unknown>, eventName: string): ExpectedDiagnostic["severity"] {
  const severity = readString(data.severity, 16);
  if (severity === "warn" || severity === "error" || severity === "info") return severity;
  return /fail|error|denied|invalid/i.test(eventName) ? "error" : "info";
}

function normalizeEventAt(data: Record<string, unknown>): Timestamp | null {
  const candidates = [data.occurredAt, data.timestamp, data.createdAt, data.updatedAt];
  for (const candidate of candidates) {
    if (candidate instanceof Timestamp) return candidate;
    if (candidate && typeof candidate === "object" && typeof (candidate as { toDate?: unknown }).toDate === "function") {
      return candidate as Timestamp;
    }
  }
  return null;
}

function normalizeRequest(
  raw: unknown,
  fallbackUid: string
): Required<
  Pick<
    ReaderAuditRecoveryRequest,
    "mode" | "scope" | "batchSize" | "maxDocs" | "verify" | "reconciliationMode" | "requestedBy" | "reason"
  >
> &
  Omit<
    ReaderAuditRecoveryRequest,
    "mode" | "scope" | "batchSize" | "maxDocs" | "verify" | "reconciliationMode" | "requestedBy" | "reason"
  > {
  const input = asRecord(raw);
  const scope = readString(input.scope, 40) as ReaderAuditScope;
  if (scope !== "single_user" && scope !== "collection_page" && scope !== "checkpointed_full") {
    throw new HttpsError("invalid-argument", "Invalid reader audit diagnostics recovery scope.");
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

function toRecoveryScope(scope: ReaderAuditScope): RecoveryScope {
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
  const limit = Math.min(request.batchSize, request.maxDocs, HARD_MAX_BATCH_SIZE);
  let cursor = request.cursor;
  let checkpointId: string | null = null;
  let query: FirebaseFirestore.Query = db.collection("reader_events").orderBy(FieldPath.documentId()).limit(limit);

  if (request.scope === "single_user") {
    if (!request.uid) throw new HttpsError("invalid-argument", "uid is required.");
    query = db.collection("reader_events").where("uid", "==", request.uid).orderBy(FieldPath.documentId()).limit(limit);
  } else if (request.scope === "checkpointed_full") {
    checkpointId = request.checkpointId || buildRecoveryCheckpointId({
      projectionName: PROJECTION_NAME,
      scope: "checkpointed_full",
    });
    const checkpoint = await readRecoveryCheckpoint(checkpointId);
    cursor = request.cursor || checkpoint?.cursor || undefined;
  }

  if (cursor) query = query.startAfter(cursor);
  const snap = await query.get();
  return {
    candidates: snap.docs
      .map((doc) => {
        const data = doc.data() || {};
        const uid = readString(data.uid, 128) || readString(data.userId, 128);
        if (!uid) return null;
        return {
          eventId: doc.id,
          authorityPath: doc.ref.path,
          projectionPath: `reader_audit/${doc.id}`,
          uid,
          data,
        };
      })
      .filter((candidate): candidate is Candidate => candidate !== null),
    nextCursor: snap.size === limit ? snap.docs[snap.docs.length - 1].id : null,
    checkpointId,
    lastProcessedPath: snap.docs[snap.docs.length - 1]?.ref.path ?? null,
  };
}

function buildExpectedDiagnostic(candidate: Candidate): ExpectedDiagnostic {
  const data = candidate.data;
  const eventName =
    readString(data.eventName, 96) ||
    readString(data.event, 96) ||
    readString(data.type, 96) ||
    "reader_event";
  const diagnostics: ExpectedDiagnostic["diagnostics"] = {};
  const payload = asRecord(data.payload);
  for (const key of SAFE_SCALAR_KEYS) {
    if (FORBIDDEN_KEY_PATTERN.test(key)) continue;
    const scalar = safeScalar(data[key] ?? payload[key]);
    if (scalar !== undefined) diagnostics[key] = scalar;
  }
  return {
    uid: candidate.uid,
    sourceEventId: candidate.eventId,
    sourcePath: candidate.authorityPath,
    eventName,
    severity: normalizeSeverity(data, eventName),
    eventAt: normalizeEventAt(data),
    schemaVersion: 1,
    diagnostics,
  };
}

function diagnosticsMatch(expected: ExpectedDiagnostic, actual: Record<string, unknown>): boolean {
  const actualDiagnostics = asRecord(actual.diagnostics);
  if (
    readString(actual.uid, 128) !== expected.uid ||
    readString(actual.sourceEventId, 512) !== expected.sourceEventId ||
    readString(actual.sourcePath, 512) !== expected.sourcePath ||
    readString(actual.eventName, 96) !== expected.eventName ||
    readString(actual.severity, 16) !== expected.severity ||
    actual.schemaVersion !== expected.schemaVersion
  ) {
    return false;
  }
  for (const [key, value] of Object.entries(expected.diagnostics)) {
    if (actualDiagnostics[key] !== value) return false;
  }
  return true;
}

async function writeDiagnosticProjection(candidate: Candidate, expected: ExpectedDiagnostic): Promise<void> {
  await db.collection("reader_audit").doc(candidate.eventId).set(
    {
      ...expected,
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
    projectionCollection: "reader_audit",
    triggerName: "recoverReaderAuditDiagnostics",
    sourcePath: params.candidate.authorityPath,
    sourceEventId: `reader_audit_diagnostics:${params.candidate.eventId}`,
    operation: params.operation,
    failureClass: params.failureClass ?? "validation_failed",
    lastErrorMessage: params.message,
    correlationId: params.correlationId,
  });
  await updateProjectionHealthFromFailure(failure);
  return failure.failureId;
}

async function countOrphanProjections(request: ReturnType<typeof normalizeRequest>): Promise<{
  extraProjectionCount: number;
  sampleFailures: VerificationResult["sampleFailures"];
}> {
  if (request.scope !== "single_user" || !request.uid) {
    return { extraProjectionCount: 0, sampleFailures: [] };
  }
  const auditSnap = await db
    .collection("reader_audit")
    .where("uid", "==", request.uid)
    .orderBy(FieldPath.documentId())
    .limit(Math.min(request.batchSize, HARD_MAX_BATCH_SIZE))
    .get();
  let extraProjectionCount = 0;
  const sampleFailures: VerificationResult["sampleFailures"] = [];
  for (const doc of auditSnap.docs) {
    const data = doc.data() || {};
    const sourceEventId = readString(data.sourceEventId, 512) || doc.id;
    const eventSnap = await db.collection("reader_events").doc(sourceEventId).get();
    if (!eventSnap.exists) {
      extraProjectionCount += 1;
      sampleFailures.push({
        authorityPath: `reader_events/${sourceEventId}`,
        projectionPath: doc.ref.path,
        reason: "orphan_diagnostic_record",
      });
    }
  }
  return { extraProjectionCount, sampleFailures };
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
  const sampleFailures: VerificationResult["sampleFailures"] = [];

  for (const candidate of candidates) {
    scanned += 1;
    const expected = buildExpectedDiagnostic(candidate);
    const projectionSnap = await db.collection("reader_audit").doc(candidate.eventId).get();
    if (!projectionSnap.exists) {
      missingProjectionCount += 1;
      sampleFailures.push({
        authorityPath: candidate.authorityPath,
        projectionPath: candidate.projectionPath,
        reason: "missing_diagnostic_record",
      });
      continue;
    }
    if (diagnosticsMatch(expected, projectionSnap.data() || {})) {
      matched += 1;
    } else {
      staleProjectionCount += 1;
      mismatchCount += 1;
      sampleFailures.push({
        authorityPath: candidate.authorityPath,
        projectionPath: candidate.projectionPath,
        reason: "stale_diagnostic_record",
      });
    }
  }

  const orphanScan = await countOrphanProjections(request);
  const extraProjectionCount = orphanScan.extraProjectionCount;
  sampleFailures.push(...orphanScan.sampleFailures);

  const failed = missingProjectionCount + staleProjectionCount + extraProjectionCount;
  return createVerificationResult({
    verificationId,
    projectionName: PROJECTION_NAME,
    authorityQuery: `reader_events scope=${request.scope}`,
    projectionQuery: "reader_audit",
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

export async function recoverReaderAuditDiagnosticsForRequest(
  rawRequest: ReaderAuditRecoveryRequest,
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
        const expected = buildExpectedDiagnostic(candidate);
        const projectionSnap = await db.collection("reader_audit").doc(candidate.eventId).get();
        const needsWrite = !projectionSnap.exists || !diagnosticsMatch(expected, projectionSnap.data() || {});
        if (needsWrite) wouldWrite += 1;
        if (request.mode === "write" && request.reconciliationMode === "repair" && needsWrite) {
          await writeDiagnosticProjection(candidate, expected);
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

export const recoverReaderAuditDiagnostics = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  assertRoleFromClaims(caller, "superadmin");
  return recoverReaderAuditDiagnosticsForRequest(request.data as ReaderAuditRecoveryRequest, caller.uid);
});
