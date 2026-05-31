import { admin } from "../firebaseAdmin";
import {
  normalizeRecoveryRequest,
  PROJECTION_RECOVERY_COLLECTIONS,
  type NormalizedRecoveryRequest,
  type RecoveryRequest,
  type RecoveryRunStatus,
  type RecoverySummary,
} from "./projectionRecoveryControlPlane";
import { requireProjectionDefinition } from "./projectionRegistry";

const db = admin.firestore();

function nowIso(): string {
  return new Date().toISOString();
}

function recoveryRunRef(runId: string) {
  return db.collection(PROJECTION_RECOVERY_COLLECTIONS.recoveryRuns).doc(runId);
}

function assertKnownProjection(projectionName: string): void {
  requireProjectionDefinition(projectionName);
}

export function createInitialRecoverySummary(params: {
  runId: string;
  request: NormalizedRecoveryRequest;
  status?: RecoveryRunStatus;
  startedAtIso?: string;
}): RecoverySummary {
  const startedAtIso = params.startedAtIso ?? nowIso();
  return {
    runId: params.runId,
    projectionName: params.request.projectionName,
    mode: params.request.mode,
    scope: params.request.scope,
    status: params.status ?? "running",
    startedAtIso,
    completedAtIso: null,
    scanned: 0,
    eligible: 0,
    wouldWrite: 0,
    written: 0,
    skipped: 0,
    failed: 0,
    verified: 0,
    verificationFailures: 0,
    nextCursor: params.request.cursor ?? null,
    checkpointUpdated: false,
    failureLedgerIds: [],
    reportPath: `${PROJECTION_RECOVERY_COLLECTIONS.recoveryRuns}/${params.runId}`,
  };
}

export async function startRecoveryRun(
  request: RecoveryRequest
): Promise<RecoverySummary> {
  const normalizedRequest = normalizeRecoveryRequest(request);
  assertKnownProjection(normalizedRequest.projectionName);

  const ref = db.collection(PROJECTION_RECOVERY_COLLECTIONS.recoveryRuns).doc();
  const summary = createInitialRecoverySummary({
    runId: ref.id,
    request: normalizedRequest,
  });

  await ref.set({
    ...summary,
    request: normalizedRequest,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return summary;
}

export async function writeRecoverySummary(
  summary: RecoverySummary
): Promise<RecoverySummary> {
  assertKnownProjection(summary.projectionName);
  await recoveryRunRef(summary.runId).set(
    {
      ...summary,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return summary;
}

export async function completeRecoveryRun(
  summary: RecoverySummary,
  updates: Partial<Omit<RecoverySummary, "runId" | "projectionName" | "mode" | "scope">> = {}
): Promise<RecoverySummary> {
  const completed: RecoverySummary = {
    ...summary,
    ...updates,
    status: updates.status ?? "completed",
    completedAtIso: updates.completedAtIso ?? nowIso(),
  };
  return writeRecoverySummary(completed);
}

export async function failRecoveryRun(
  summary: RecoverySummary,
  params: {
    failedCount?: number;
    failureLedgerIds?: string[];
    nextCursor?: string | null;
  } = {}
): Promise<RecoverySummary> {
  return completeRecoveryRun(summary, {
    status: "failed",
    failed: params.failedCount ?? Math.max(1, summary.failed),
    failureLedgerIds: params.failureLedgerIds ?? summary.failureLedgerIds,
    nextCursor: params.nextCursor ?? summary.nextCursor,
  });
}

export async function readRecoveryRun(
  runId: string
): Promise<RecoverySummary | null> {
  const snap = await recoveryRunRef(runId).get();
  if (!snap.exists) return null;
  return snap.data() as RecoverySummary;
}

