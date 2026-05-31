import { admin } from "../firebaseAdmin";
import { recordOperationalMetric } from "./operationalMetrics";
import {
  PROJECTION_RECOVERY_COLLECTIONS,
  type ProjectionFailureClass,
  type ProjectionFailureRecord,
  type ProjectionFailureSeverity,
  type ProjectionRecoveryOperation,
} from "./projectionRecoveryControlPlane";
import { requireProjectionDefinition } from "./projectionRegistry";

const db = admin.firestore();

type RecordProjectionFailureInput = {
  projectionName: string;
  projectionCollection: string;
  triggerName: string;
  sourcePath: string;
  sourceEventId: string;
  operation: ProjectionRecoveryOperation;
  failureClass: ProjectionFailureClass;
  severity?: ProjectionFailureSeverity;
  nextRetryAtIso?: string | null;
  lastErrorMessage: string;
  lastErrorCode?: string;
  operatorNote?: string;
  correlationId?: string;
  emitMetric?: boolean;
};

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeLedgerToken(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9_.:-]+/g, "_")
    .slice(0, 180);
}

export function buildProjectionFailureId(input: {
  projectionName: string;
  sourcePath: string;
  sourceEventId: string;
  operation: ProjectionRecoveryOperation;
}): string {
  return [
    "projection_failure",
    input.projectionName,
    input.operation,
    input.sourceEventId || input.sourcePath,
  ]
    .map(sanitizeLedgerToken)
    .filter(Boolean)
    .join(":")
    .slice(0, 500);
}

export async function recordProjectionFailure(
  input: RecordProjectionFailureInput
): Promise<ProjectionFailureRecord> {
  requireProjectionDefinition(input.projectionName);
  const timestamp = nowIso();
  const failureId = buildProjectionFailureId(input);
  const record: ProjectionFailureRecord = {
    failureId,
    projectionName: input.projectionName,
    projectionCollection: input.projectionCollection,
    triggerName: input.triggerName,
    sourcePath: input.sourcePath,
    sourceEventId: input.sourceEventId,
    operation: input.operation,
    failureClass: input.failureClass,
    severity: input.severity ?? "critical",
    retryStatus: "pending",
    retryCount: 0,
    nextRetryAtIso: input.nextRetryAtIso ?? null,
    lastErrorMessage: input.lastErrorMessage,
    ...(input.lastErrorCode ? { lastErrorCode: input.lastErrorCode } : {}),
    createdAtIso: timestamp,
    updatedAtIso: timestamp,
    ...(input.operatorNote ? { operatorNote: input.operatorNote } : {}),
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
  };

  await db
    .collection(PROJECTION_RECOVERY_COLLECTIONS.failureLedger)
    .doc(failureId)
    .set(
      {
        ...record,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  if (input.emitMetric !== false) {
    await recordOperationalMetric({
      name: "callable_error_rate",
      value: 1,
      unit: "count",
      dimensions: {
        projectionName: input.projectionName,
        failureClass: input.failureClass,
        operation: input.operation,
      },
    });
  }

  return record;
}

export async function updateProjectionFailureRetryStatus(params: {
  failureId: string;
  retryStatus: ProjectionFailureRecord["retryStatus"];
  operatorNote?: string;
  recoveredAtIso?: string;
}): Promise<void> {
  await db
    .collection(PROJECTION_RECOVERY_COLLECTIONS.failureLedger)
    .doc(params.failureId)
    .set(
      {
        retryStatus: params.retryStatus,
        updatedAtIso: nowIso(),
        ...(params.operatorNote ? { operatorNote: params.operatorNote } : {}),
        ...(params.recoveredAtIso ? { recoveredAtIso: params.recoveredAtIso } : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

export async function incrementProjectionFailureRetry(params: {
  failureId: string;
  nextRetryAtIso?: string | null;
}): Promise<void> {
  await db
    .collection(PROJECTION_RECOVERY_COLLECTIONS.failureLedger)
    .doc(params.failureId)
    .set(
      {
        retryStatus: "retrying",
        retryCount: admin.firestore.FieldValue.increment(1),
        nextRetryAtIso: params.nextRetryAtIso ?? null,
        updatedAtIso: nowIso(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

