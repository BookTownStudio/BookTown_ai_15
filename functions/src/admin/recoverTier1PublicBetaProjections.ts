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

const db = admin.firestore();

const DEFAULT_BATCH_SIZE = 100;
const HARD_MAX_BATCH_SIZE = 100;

type Tier1ProjectionName =
  | "reader_authority_projection"
  | "reader_manifests"
  | "reader_epub_indexes"
  | "reader_sync_idempotency"
  | "reading_progress_compatibility_fields"
  | "runtime_health_projection"
  | "runtime_anomaly_projection"
  | "book_search_fields"
  | "deletion_cascade_cleanup_projection";

type Tier1Scope = "single_entity" | "single_user" | "collection_page" | "checkpointed_full";
type ReconciliationMode = "report_only" | "repair";

type Tier1RecoveryRequest = {
  projectionName: Tier1ProjectionName;
  mode?: RecoveryMode;
  scope: Tier1Scope;
  entityId?: string;
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

type ProjectionConfig = {
  projectionName: Tier1ProjectionName;
  authorityCollection: string;
  projectionCollection: string;
  ownerField?: string;
  projectionOwnerField?: string;
  projectionDocId?: (authorityId: string, data: Record<string, unknown>) => string;
  isProjectionMaterialized?: boolean;
  requiredFields?: string[];
};

type Candidate = {
  id: string;
  authorityPath: string;
  projectionPath: string;
  data: Record<string, unknown>;
};

const CONFIGS: Record<Tier1ProjectionName, ProjectionConfig> = {
  reader_authority_projection: {
    projectionName: "reader_authority_projection",
    authorityCollection: "books",
    projectionCollection: "books",
    isProjectionMaterialized: true,
    requiredFields: ["readerAuthority"],
  },
  reader_manifests: {
    projectionName: "reader_manifests",
    authorityCollection: "books",
    projectionCollection: "reader_manifests",
    requiredFields: ["bookId"],
  },
  reader_epub_indexes: {
    projectionName: "reader_epub_indexes",
    authorityCollection: "reader_manifests",
    projectionCollection: "reader_location_map",
    requiredFields: ["bookId"],
  },
  reader_sync_idempotency: {
    projectionName: "reader_sync_idempotency",
    authorityCollection: "reader_sync_idempotency",
    projectionCollection: "reader_sync_idempotency",
    ownerField: "uid",
    projectionOwnerField: "uid",
    isProjectionMaterialized: true,
  },
  reading_progress_compatibility_fields: {
    projectionName: "reading_progress_compatibility_fields",
    authorityCollection: "reading_progress",
    projectionCollection: "reading_progress",
    ownerField: "uid",
    projectionOwnerField: "uid",
    isProjectionMaterialized: true,
    requiredFields: ["uid", "bookId", "status_state"],
  },
  runtime_health_projection: {
    projectionName: "runtime_health_projection",
    authorityCollection: "operational_metrics",
    projectionCollection: "runtime_health_projection",
  },
  runtime_anomaly_projection: {
    projectionName: "runtime_anomaly_projection",
    authorityCollection: "operational_metrics",
    projectionCollection: "runtime_anomaly_projection",
  },
  book_search_fields: {
    projectionName: "book_search_fields",
    authorityCollection: "books",
    projectionCollection: "books",
    isProjectionMaterialized: true,
    requiredFields: ["search"],
  },
  deletion_cascade_cleanup_projection: {
    projectionName: "deletion_cascade_cleanup_projection",
    authorityCollection: "deletion_requests",
    projectionCollection: "deletion_requests",
    ownerField: "targetUid",
    projectionOwnerField: "targetUid",
    isProjectionMaterialized: true,
  },
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

function getConfig(projectionName: string): ProjectionConfig {
  const config = CONFIGS[projectionName as Tier1ProjectionName];
  if (!config) throw new HttpsError("invalid-argument", "Unsupported Tier 1 projection.");
  return config;
}

function normalizeRequest(raw: unknown, fallbackUid: string): Required<
  Pick<Tier1RecoveryRequest, "mode" | "scope" | "batchSize" | "maxDocs" | "verify" | "reconciliationMode" | "requestedBy" | "reason">
> & Omit<Tier1RecoveryRequest, "mode" | "scope" | "batchSize" | "maxDocs" | "verify" | "reconciliationMode" | "requestedBy" | "reason"> {
  const input = asRecord(raw);
  const projectionName = readString(input.projectionName, 120) as Tier1ProjectionName;
  getConfig(projectionName);
  const scope = readString(input.scope, 40) as Tier1Scope;
  if (scope !== "single_entity" && scope !== "single_user" && scope !== "collection_page" && scope !== "checkpointed_full") {
    throw new HttpsError("invalid-argument", "Invalid Tier 1 recovery scope.");
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
    projectionName,
    mode,
    scope,
    entityId: readString(input.entityId, 256) || undefined,
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

function toRecoveryScope(scope: Tier1Scope): RecoveryScope {
  if (scope === "single_entity") return "single_doc";
  if (scope === "single_user") return "owner";
  return scope;
}

function buildRecoveryRequest(input: ReturnType<typeof normalizeRequest>): RecoveryRequest {
  return {
    projectionName: input.projectionName,
    mode: input.mode,
    scope: toRecoveryScope(input.scope),
    targetId: input.entityId,
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

function projectionDocId(config: ProjectionConfig, authorityId: string, data: Record<string, unknown>): string {
  return config.projectionDocId ? config.projectionDocId(authorityId, data) : authorityId;
}

async function loadCandidates(request: ReturnType<typeof normalizeRequest>, config: ProjectionConfig): Promise<{
  candidates: Candidate[];
  nextCursor: string | null;
  checkpointId: string | null;
  lastProcessedPath: string | null;
}> {
  const limit = Math.min(request.batchSize, request.maxDocs, HARD_MAX_BATCH_SIZE);
  let cursor = request.cursor;
  let checkpointId: string | null = null;

  if (request.scope === "single_entity") {
    if (!request.entityId) throw new HttpsError("invalid-argument", "entityId is required.");
    const snap = await db.collection(config.authorityCollection).doc(request.entityId).get();
    if (!snap.exists) {
      return { candidates: [], nextCursor: null, checkpointId: null, lastProcessedPath: `${config.authorityCollection}/${request.entityId}` };
    }
    const data = snap.data() || {};
    return {
      candidates: [{
        id: snap.id,
        authorityPath: snap.ref.path,
        projectionPath: `${config.projectionCollection}/${projectionDocId(config, snap.id, data)}`,
        data,
      }],
      nextCursor: null,
      checkpointId: null,
      lastProcessedPath: snap.ref.path,
    };
  }

  let query: FirebaseFirestore.Query = db.collection(config.authorityCollection).orderBy(FieldPath.documentId()).limit(limit);
  if (request.scope === "single_user") {
    if (!request.uid) throw new HttpsError("invalid-argument", "uid is required.");
    if (!config.ownerField) throw new HttpsError("invalid-argument", "single_user is not supported for this projection.");
    query = db.collection(config.authorityCollection).where(config.ownerField, "==", request.uid).orderBy(FieldPath.documentId()).limit(limit);
  } else if (request.scope === "checkpointed_full") {
    checkpointId = request.checkpointId || buildRecoveryCheckpointId({ projectionName: request.projectionName, scope: "checkpointed_full" });
    const checkpoint = await readRecoveryCheckpoint(checkpointId);
    cursor = request.cursor || checkpoint?.cursor || undefined;
  }

  if (cursor) query = query.startAfter(cursor);
  const snap = await query.get();
  return {
    candidates: snap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        authorityPath: doc.ref.path,
        projectionPath: `${config.projectionCollection}/${projectionDocId(config, doc.id, data)}`,
        data,
      };
    }),
    nextCursor: snap.size === limit ? snap.docs[snap.docs.length - 1].id : null,
    checkpointId,
    lastProcessedPath: snap.docs[snap.docs.length - 1]?.ref.path ?? null,
  };
}

function materializedFieldsMatch(config: ProjectionConfig, candidate: Candidate, projection: Record<string, unknown>): boolean {
  if (!config.requiredFields || config.requiredFields.length === 0) return true;
  return config.requiredFields.every((field) => projection[field] !== undefined);
}

async function readProjection(config: ProjectionConfig, candidate: Candidate) {
  if (config.isProjectionMaterialized && config.authorityCollection === config.projectionCollection) {
    return db.collection(config.projectionCollection).doc(candidate.id).get();
  }
  const id = projectionDocId(config, candidate.id, candidate.data);
  return db.collection(config.projectionCollection).doc(id).get();
}

async function writeCertifiedRepair(config: ProjectionConfig, candidate: Candidate): Promise<void> {
  const id = projectionDocId(config, candidate.id, candidate.data);
  const ref = db.collection(config.projectionCollection).doc(id);
  const patch = {
    phase8aCertifiedProjection: config.projectionName,
    phase8aAuthorityPath: candidate.authorityPath,
    phase8aRecoveredAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await ref.set(patch, { merge: true });
}

async function recordFailure(params: {
  config: ProjectionConfig;
  candidate: Candidate;
  operation: "verify" | "reconcile" | "rebuild";
  message: string;
  failureClass?: "validation_failed" | "write_failed" | "authority_missing";
  correlationId?: string;
}) {
  const failure = await recordProjectionFailure({
    projectionName: params.config.projectionName,
    projectionCollection: params.config.projectionCollection,
    triggerName: "recoverTier1PublicBetaProjection",
    sourcePath: params.candidate.authorityPath,
    sourceEventId: `${params.config.projectionName}:${params.candidate.id}`,
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
  config: ProjectionConfig,
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
    const projectionSnap = await readProjection(config, candidate);
    if (!projectionSnap.exists) {
      missingProjectionCount += 1;
      sampleFailures.push({ authorityPath: candidate.authorityPath, projectionPath: candidate.projectionPath, reason: "missing_record" });
      continue;
    }
    if (materializedFieldsMatch(config, candidate, projectionSnap.data() || {})) {
      matched += 1;
    } else {
      staleProjectionCount += 1;
      mismatchCount += 1;
      sampleFailures.push({ authorityPath: candidate.authorityPath, projectionPath: candidate.projectionPath, reason: "authority_projection_drift" });
    }
  }

  const failed = missingProjectionCount + staleProjectionCount;
  return createVerificationResult({
    verificationId,
    projectionName: config.projectionName,
    authorityQuery: `${config.authorityCollection} scope=${request.scope}`,
    projectionQuery: config.projectionCollection,
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

export async function recoverTier1PublicBetaProjectionForRequest(rawRequest: Tier1RecoveryRequest, fallbackUid = "system") {
  const request = normalizeRequest(rawRequest, fallbackUid);
  const config = getConfig(request.projectionName);
  let summary = await startRecoveryRun(buildRecoveryRequest(request));
  const failureLedgerIds: string[] = [];
  try {
    const { candidates, nextCursor, checkpointId, lastProcessedPath } = await loadCandidates(request, config);
    let wouldWrite = 0;
    let written = 0;
    let skipped = 0;
    let failed = 0;
    for (const candidate of candidates) {
      try {
        const projectionSnap = await readProjection(config, candidate);
        const needsWrite = !projectionSnap.exists || !materializedFieldsMatch(config, candidate, projectionSnap.data() || {});
        if (needsWrite) wouldWrite += 1;
        if (request.mode === "write" && request.reconciliationMode === "repair" && needsWrite) {
          await writeCertifiedRepair(config, candidate);
          written += 1;
        } else {
          skipped += needsWrite ? 1 : 0;
        }
      } catch (error) {
        failed += 1;
        failureLedgerIds.push(await recordFailure({
          config,
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
        projectionName: config.projectionName,
        scope: "checkpointed_full",
        cursor: nextCursor,
        lastProcessedPath,
        scannedDelta: candidates.length,
        writtenDelta: written,
        failedDelta: failed,
        status: nextCursor ? "partial" : "completed",
      });
    }
    const verification = request.verify ? await verifyCandidates(candidates, request, config, `${summary.runId}:verification`) : null;
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
    const definition = getProjectionDefinition(config.projectionName);
    const certification = definition ? evaluateProjectionCertification(definition) : null;
    return {
      summary,
      verification,
      certification: {
        projectionName: config.projectionName,
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

export const recoverTier1PublicBetaProjection = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  assertRoleFromClaims(caller, "superadmin");
  return recoverTier1PublicBetaProjectionForRequest(request.data as Tier1RecoveryRequest, caller.uid);
});
