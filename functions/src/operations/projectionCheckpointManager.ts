import { admin } from "../firebaseAdmin";
import {
  DEFAULT_RECOVERY_BATCH_SIZE,
  PROJECTION_RECOVERY_COLLECTIONS,
  type RecoveryCheckpoint,
  type RecoveryRunStatus,
  type RecoveryScope,
} from "./projectionRecoveryControlPlane";
import { requireProjectionDefinition } from "./projectionRegistry";

const db = admin.firestore();

function nowIso(): string {
  return new Date().toISOString();
}

function checkpointRef(checkpointId: string) {
  return db
    .collection(PROJECTION_RECOVERY_COLLECTIONS.recoveryCheckpoints)
    .doc(checkpointId);
}

export function buildRecoveryCheckpointId(params: {
  projectionName: string;
  scope: RecoveryScope;
  ownerId?: string;
  targetId?: string;
}): string {
  const suffix = params.ownerId || params.targetId || "global";
  return `${params.projectionName}:${params.scope}:${suffix}`
    .replace(/[^A-Za-z0-9_.:-]+/g, "_")
    .slice(0, 500);
}

export function createRecoveryCheckpoint(params: {
  checkpointId: string;
  projectionName: string;
  scope: RecoveryScope;
  batchSize?: number;
  status?: RecoveryRunStatus;
}): RecoveryCheckpoint {
  requireProjectionDefinition(params.projectionName);
  return {
    checkpointId: params.checkpointId,
    projectionName: params.projectionName,
    scope: params.scope,
    cursor: null,
    lastProcessedPath: null,
    lastProcessedAtIso: null,
    batchSize: params.batchSize ?? DEFAULT_RECOVERY_BATCH_SIZE,
    totalScanned: 0,
    totalWritten: 0,
    totalFailed: 0,
    status: params.status ?? "queued",
    leaseOwner: null,
    leaseExpiresAtIso: null,
    updatedAtIso: nowIso(),
  };
}

export async function readRecoveryCheckpoint(
  checkpointId: string
): Promise<RecoveryCheckpoint | null> {
  const snap = await checkpointRef(checkpointId).get();
  if (!snap.exists) return null;
  return snap.data() as RecoveryCheckpoint;
}

export async function writeRecoveryCheckpoint(
  checkpoint: RecoveryCheckpoint
): Promise<RecoveryCheckpoint> {
  requireProjectionDefinition(checkpoint.projectionName);
  const updated: RecoveryCheckpoint = {
    ...checkpoint,
    updatedAtIso: nowIso(),
  };
  await checkpointRef(updated.checkpointId).set(
    {
      ...updated,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return updated;
}

export async function updateRecoveryCheckpointProgress(params: {
  checkpointId: string;
  projectionName: string;
  scope: RecoveryScope;
  cursor: string | null;
  lastProcessedPath: string | null;
  scannedDelta: number;
  writtenDelta: number;
  failedDelta: number;
  status?: RecoveryRunStatus;
}): Promise<RecoveryCheckpoint> {
  const existing =
    (await readRecoveryCheckpoint(params.checkpointId)) ??
    createRecoveryCheckpoint({
      checkpointId: params.checkpointId,
      projectionName: params.projectionName,
      scope: params.scope,
    });
  const updated: RecoveryCheckpoint = {
    ...existing,
    cursor: params.cursor,
    lastProcessedPath: params.lastProcessedPath,
    lastProcessedAtIso: nowIso(),
    totalScanned: existing.totalScanned + Math.max(0, Math.trunc(params.scannedDelta)),
    totalWritten: existing.totalWritten + Math.max(0, Math.trunc(params.writtenDelta)),
    totalFailed: existing.totalFailed + Math.max(0, Math.trunc(params.failedDelta)),
    status: params.status ?? existing.status,
  };
  return writeRecoveryCheckpoint(updated);
}

export async function acquireRecoveryCheckpointLease(params: {
  checkpointId: string;
  projectionName: string;
  scope: RecoveryScope;
  leaseOwner: string;
  leaseDurationMs: number;
}): Promise<RecoveryCheckpoint> {
  const ref = checkpointRef(params.checkpointId);
  const nowMs = Date.now();
  const leaseExpiresAtIso = new Date(nowMs + params.leaseDurationMs).toISOString();

  let leased: RecoveryCheckpoint | null = null;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists
      ? (snap.data() as RecoveryCheckpoint)
      : createRecoveryCheckpoint({
          checkpointId: params.checkpointId,
          projectionName: params.projectionName,
          scope: params.scope,
        });
    const existingLeaseMs = existing.leaseExpiresAtIso
      ? new Date(existing.leaseExpiresAtIso).getTime()
      : 0;
    if (existing.leaseOwner && existingLeaseMs > nowMs) {
      throw new Error(`Checkpoint lease is active: ${params.checkpointId}`);
    }
    leased = {
      ...existing,
      leaseOwner: params.leaseOwner,
      leaseExpiresAtIso,
      status: "running",
      updatedAtIso: nowIso(),
    };
    tx.set(
      ref,
      {
        ...leased,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  if (!leased) {
    throw new Error(`Failed to acquire checkpoint lease: ${params.checkpointId}`);
  }
  return leased;
}

