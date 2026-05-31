import { admin } from "../firebaseAdmin";
import {
  PROJECTION_RECOVERY_COLLECTIONS,
  type ProjectionFailureRecord,
  type ProjectionHealth,
  type ProjectionHealthStatus,
  type RecoverySummary,
  type VerificationResult,
} from "./projectionRecoveryControlPlane";
import {
  createUnknownProjectionHealth,
  getProjectionHealthDocumentId,
  requireProjectionDefinition,
} from "./projectionRegistry";

const db = admin.firestore();

function nowIso(): string {
  return new Date().toISOString();
}

function healthRef(projectionName: string) {
  return db
    .collection(PROJECTION_RECOVERY_COLLECTIONS.projectionHealth)
    .doc(getProjectionHealthDocumentId(projectionName));
}

function deriveStatus(input: {
  pendingFailures: number;
  deadLetterFailures: number;
  missingProjectionCount: number;
  staleProjectionCount: number;
  verificationFailures?: number;
}): ProjectionHealthStatus {
  if (
    input.deadLetterFailures > 0
  ) {
    return "critical";
  }
  if (
    input.pendingFailures > 0 ||
    input.missingProjectionCount > 0 ||
    input.staleProjectionCount > 0 ||
    input.verificationFailures && input.verificationFailures > 0
  ) {
    return "degraded";
  }
  return "healthy";
}

export async function readProjectionHealth(
  projectionName: string
): Promise<ProjectionHealth | null> {
  requireProjectionDefinition(projectionName);
  const snap = await healthRef(projectionName).get();
  if (!snap.exists) return null;
  return snap.data() as ProjectionHealth;
}

export async function writeProjectionHealth(
  health: ProjectionHealth
): Promise<ProjectionHealth> {
  requireProjectionDefinition(health.projectionName);
  const updated: ProjectionHealth = {
    ...health,
    checkedAtIso: nowIso(),
  };
  await healthRef(updated.projectionName).set(
    {
      ...updated,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return updated;
}

export async function ensureProjectionHealth(
  projectionName: string
): Promise<ProjectionHealth> {
  const existing = await readProjectionHealth(projectionName);
  if (existing) return existing;
  const initial = createUnknownProjectionHealth(projectionName, nowIso());
  return writeProjectionHealth(initial);
}

export async function updateProjectionHealthFromFailure(
  failure: ProjectionFailureRecord
): Promise<ProjectionHealth> {
  const current = await ensureProjectionHealth(failure.projectionName);
  return writeProjectionHealth({
    ...current,
    status: failure.severity === "critical" ? "critical" : "degraded",
    lastFailureAtIso: failure.updatedAtIso,
    pendingFailures:
      failure.retryStatus === "pending"
        ? current.pendingFailures + 1
        : current.pendingFailures,
    deadLetterFailures:
      failure.retryStatus === "dead_letter"
        ? current.deadLetterFailures + 1
        : current.deadLetterFailures,
  });
}

export async function updateProjectionHealthFromVerification(
  result: VerificationResult
): Promise<ProjectionHealth> {
  const current = await ensureProjectionHealth(result.projectionName);
  const status = deriveStatus({
    pendingFailures: current.pendingFailures,
    deadLetterFailures: current.deadLetterFailures,
    missingProjectionCount: result.missingProjectionCount,
    staleProjectionCount: result.staleProjectionCount,
    verificationFailures:
      result.status === "failed"
        ? result.missingProjectionCount + result.staleProjectionCount + result.extraProjectionCount
        : 0,
  });
  return writeProjectionHealth({
    ...current,
    status,
    lastVerificationAtIso: result.checkedAtIso,
    driftDetected:
      current.driftDetected +
      result.missingProjectionCount +
      result.staleProjectionCount +
      result.extraProjectionCount,
    staleProjectionCount: result.staleProjectionCount,
    missingProjectionCount: result.missingProjectionCount,
  });
}

export async function updateProjectionHealthFromRecoverySummary(
  summary: RecoverySummary
): Promise<ProjectionHealth> {
  const current = await ensureProjectionHealth(summary.projectionName);
  const status = deriveStatus({
    pendingFailures: current.pendingFailures,
    deadLetterFailures: current.deadLetterFailures,
    missingProjectionCount: current.missingProjectionCount,
    staleProjectionCount: current.staleProjectionCount,
    verificationFailures: summary.verificationFailures,
  });
  return writeProjectionHealth({
    ...current,
    status,
    lastSuccessfulRebuildAtIso:
      summary.status === "completed"
        ? summary.completedAtIso ?? nowIso()
        : current.lastSuccessfulRebuildAtIso,
    driftRepaired:
      summary.status === "completed"
        ? current.driftRepaired + summary.written
        : current.driftRepaired,
  });
}
