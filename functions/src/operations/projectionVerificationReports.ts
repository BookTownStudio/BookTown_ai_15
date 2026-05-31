import { admin } from "../firebaseAdmin";
import {
  PROJECTION_RECOVERY_COLLECTIONS,
  type VerificationResult,
  type VerificationStatus,
} from "./projectionRecoveryControlPlane";
import { requireProjectionDefinition } from "./projectionRegistry";

const db = admin.firestore();

function nowIso(): string {
  return new Date().toISOString();
}

export function createVerificationResult(params: {
  verificationId: string;
  projectionName: string;
  authorityQuery: string;
  projectionQuery: string;
  status?: VerificationStatus;
  scanned?: number;
  matched?: number;
  missingProjectionCount?: number;
  staleProjectionCount?: number;
  mismatchCount?: number;
  extraProjectionCount?: number;
  verificationSuccessRate?: number;
  sampleFailures?: VerificationResult["sampleFailures"];
  nextCursor?: string | null;
}): VerificationResult {
  requireProjectionDefinition(params.projectionName);
  return {
    verificationId: params.verificationId,
    projectionName: params.projectionName,
    status: params.status ?? "skipped",
    checkedAtIso: nowIso(),
    authorityQuery: params.authorityQuery,
    projectionQuery: params.projectionQuery,
    scanned: params.scanned ?? 0,
    matched: params.matched ?? 0,
    missingProjectionCount: params.missingProjectionCount ?? 0,
    staleProjectionCount: params.staleProjectionCount ?? 0,
    mismatchCount: params.mismatchCount ?? params.staleProjectionCount ?? 0,
    extraProjectionCount: params.extraProjectionCount ?? 0,
    verificationSuccessRate:
      params.verificationSuccessRate ??
      (params.scanned && params.scanned > 0
        ? Number(((params.matched ?? 0) / params.scanned).toFixed(6))
        : 1),
    sampleFailures: params.sampleFailures ?? [],
    nextCursor: params.nextCursor ?? null,
  };
}

export async function writeVerificationResult(
  result: VerificationResult
): Promise<VerificationResult> {
  requireProjectionDefinition(result.projectionName);
  await db
    .collection(PROJECTION_RECOVERY_COLLECTIONS.recoveryReports)
    .doc(result.verificationId)
    .set(
      {
        ...result,
        reportType: "verification",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  return result;
}

export async function readVerificationResult(
  verificationId: string
): Promise<VerificationResult | null> {
  const snap = await db
    .collection(PROJECTION_RECOVERY_COLLECTIONS.recoveryReports)
    .doc(verificationId)
    .get();
  if (!snap.exists) return null;
  return snap.data() as VerificationResult;
}
