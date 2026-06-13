export type ProjectionClassification =
  | "fanout_projection"
  | "aggregate_projection"
  | "search_projection"
  | "authority_projection"
  | "media_derivative_projection"
  | "operational_projection"
  | "compatibility_projection";

export type ProjectionMaintainer =
  | "trigger"
  | "scheduled_job"
  | "manual_rebuild"
  | "hybrid";

export type ProjectionCertificationStatus =
  | "not_ready"
  | "beta_ready"
  | "production_ready"
  | "deprecated";

export type RecoveryMode = "dry_run" | "write";

export type RecoveryScope =
  | "single_doc"
  | "owner"
  | "collection_page"
  | "checkpointed_full";

export type RecoveryRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";

export type VerificationStatus =
  | "passed"
  | "failed"
  | "partial"
  | "skipped";

export type ProjectionHealthStatus =
  | "healthy"
  | "degraded"
  | "critical"
  | "unknown";

export type ProjectionFailureClass =
  | "validation_failed"
  | "authority_missing"
  | "permission_denied"
  | "index_missing"
  | "write_failed"
  | "timeout"
  | "partial_fanout"
  | "unknown";

export type ProjectionFailureSeverity = "info" | "warning" | "critical";

export type ProjectionFailureRetryStatus =
  | "pending"
  | "retrying"
  | "recovered"
  | "ignored"
  | "dead_letter";

export type ProjectionRecoveryOperation =
  | "create"
  | "update"
  | "delete"
  | "fanout"
  | "aggregate"
  | "rebuild"
  | "verify"
  | "reconcile";

export type ProjectionCertificationRequirement =
  | "registered_definition"
  | "authority_source_documented"
  | "maintainer_documented"
  | "bounded_rebuild_path"
  | "dry_run_supported"
  | "checkpoint_supported"
  | "idempotent_execution"
  | "restartable_execution"
  | "structured_reporting"
  | "verification_supported"
  | "failure_ledger_supported"
  | "operator_runbook"
  | "required_indexes_documented"
  | "no_global_destructive_rebuild"
  | "bounded_production_queries";

export type ProjectionDefinition = {
  projectionName: string;
  classification: ProjectionClassification;
  authoritySources: string[];
  projectionCollections: string[];
  maintainer: ProjectionMaintainer;
  currentConsumers: string[];
  rebuildSupported: boolean;
  verificationSupported: boolean;
  reconciliationSupported: boolean;
  failureLedgerSupported: boolean;
  dryRunSupported: boolean;
  checkpointSupported: boolean;
  structuredReportingSupported: boolean;
  idempotent: boolean;
  restartable: boolean;
  destructiveRebuildAllowed: false;
  maxBatchSize: number;
  maxRuntimeSeconds: number;
  requiredIndexes: string[];
  runbookPath: string | null;
  currentCertificationStatus: ProjectionCertificationStatus;
  requiredCertificationStatus: ProjectionCertificationStatus;
};

export type RecoveryRequest = {
  projectionName: string;
  mode?: RecoveryMode;
  scope: RecoveryScope;
  targetId?: string;
  ownerId?: string;
  cursor?: string;
  checkpointId?: string;
  batchSize?: number;
  maxDocs?: number;
  verify?: boolean;
  requestedBy: string;
  reason: string;
  correlationId?: string;
};

export type NormalizedRecoveryRequest = Required<
  Pick<RecoveryRequest, "mode" | "batchSize" | "maxDocs" | "verify">
> &
  Omit<RecoveryRequest, "mode" | "batchSize" | "maxDocs" | "verify">;

export type RecoverySummary = {
  runId: string;
  projectionName: string;
  mode: RecoveryMode;
  scope: RecoveryScope;
  status: RecoveryRunStatus;
  startedAtIso: string;
  completedAtIso: string | null;
  scanned: number;
  eligible: number;
  wouldWrite: number;
  written: number;
  skipped: number;
  failed: number;
  verified: number;
  verificationFailures: number;
  nextCursor: string | null;
  checkpointUpdated: boolean;
  failureLedgerIds: string[];
  reportPath: string | null;
};

export type RecoveryCheckpoint = {
  checkpointId: string;
  projectionName: string;
  scope: RecoveryScope;
  cursor: string | null;
  lastProcessedPath: string | null;
  lastProcessedAtIso: string | null;
  batchSize: number;
  totalScanned: number;
  totalWritten: number;
  totalFailed: number;
  status: RecoveryRunStatus;
  leaseOwner: string | null;
  leaseExpiresAtIso: string | null;
  updatedAtIso: string;
};

export type VerificationResult = {
  verificationId: string;
  projectionName: string;
  status: VerificationStatus;
  checkedAtIso: string;
  authorityQuery: string;
  projectionQuery: string;
  scanned: number;
  matched: number;
  missingProjectionCount: number;
  staleProjectionCount: number;
  mismatchCount: number;
  extraProjectionCount: number;
  verificationSuccessRate: number;
  sampleFailures: Array<{
    authorityPath: string | null;
    projectionPath: string | null;
    reason: string;
  }>;
  nextCursor: string | null;
};

export type ProjectionFailureRecord = {
  failureId: string;
  projectionName: string;
  projectionCollection: string;
  triggerName: string;
  sourcePath: string;
  sourceEventId: string;
  operation: ProjectionRecoveryOperation;
  failureClass: ProjectionFailureClass;
  severity: ProjectionFailureSeverity;
  retryStatus: ProjectionFailureRetryStatus;
  retryCount: number;
  nextRetryAtIso: string | null;
  lastErrorMessage: string;
  lastErrorCode?: string;
  createdAtIso: string;
  updatedAtIso: string;
  recoveredAtIso?: string;
  operatorNote?: string;
  correlationId?: string;
};

export type ProjectionHealth = {
  projectionName: string;
  status: ProjectionHealthStatus;
  productionStatus: ProjectionCertificationStatus;
  lastSuccessfulRebuildAtIso: string | null;
  lastSuccessfulReconcileAtIso: string | null;
  lastVerificationAtIso: string | null;
  lastFailureAtIso: string | null;
  pendingFailures: number;
  deadLetterFailures: number;
  driftDetected: number;
  driftRepaired: number;
  staleProjectionCount: number;
  missingProjectionCount: number;
  checkedAtIso: string;
};

export type ProjectionCertificationGateResult = {
  projectionName: string;
  requestedStatus: ProjectionCertificationStatus;
  allowedStatus: ProjectionCertificationStatus;
  passed: boolean;
  missingRequirements: ProjectionCertificationRequirement[];
};

export const DEFAULT_RECOVERY_MODE: RecoveryMode = "dry_run";
export const DEFAULT_RECOVERY_BATCH_SIZE = 100;
export const MAX_RECOVERY_BATCH_SIZE = 500;
export const DEFAULT_RECOVERY_MAX_DOCS = 500;
export const MAX_RECOVERY_RUNTIME_SECONDS = 540;

export const PROJECTION_RECOVERY_COLLECTIONS = {
  recoveryRuns: "projection_recovery_runs",
  recoveryCheckpoints: "projection_recovery_checkpoints",
  failureLedger: "projection_failure_ledger",
  projectionHealth: "projection_health",
  recoveryReports: "projection_recovery_reports",
} as const;

export function normalizeRecoveryRequest(
  request: RecoveryRequest
): NormalizedRecoveryRequest {
  const requestedBatchSize =
    typeof request.batchSize === "number" && Number.isFinite(request.batchSize)
      ? Math.trunc(request.batchSize)
      : DEFAULT_RECOVERY_BATCH_SIZE;
  const batchSize = Math.max(
    1,
    Math.min(MAX_RECOVERY_BATCH_SIZE, requestedBatchSize)
  );
  const requestedMaxDocs =
    typeof request.maxDocs === "number" && Number.isFinite(request.maxDocs)
      ? Math.trunc(request.maxDocs)
      : DEFAULT_RECOVERY_MAX_DOCS;
  const maxDocs = Math.max(1, requestedMaxDocs);

  return {
    ...request,
    mode: request.mode ?? DEFAULT_RECOVERY_MODE,
    batchSize,
    maxDocs,
    verify: request.verify ?? true,
  };
}

export function evaluateProjectionCertification(
  definition: ProjectionDefinition
): ProjectionCertificationGateResult {
  const missingRequirements: ProjectionCertificationRequirement[] = [];

  if (!definition.projectionName.trim()) {
    missingRequirements.push("registered_definition");
  }
  if (definition.authoritySources.length === 0) {
    missingRequirements.push("authority_source_documented");
  }
  if (!definition.maintainer) {
    missingRequirements.push("maintainer_documented");
  }
  if (!definition.rebuildSupported) {
    missingRequirements.push("bounded_rebuild_path");
  }
  if (!definition.dryRunSupported) {
    missingRequirements.push("dry_run_supported");
  }
  if (!definition.checkpointSupported) {
    missingRequirements.push("checkpoint_supported");
  }
  if (!definition.idempotent) {
    missingRequirements.push("idempotent_execution");
  }
  if (!definition.restartable) {
    missingRequirements.push("restartable_execution");
  }
  if (!definition.structuredReportingSupported) {
    missingRequirements.push("structured_reporting");
  }
  if (!definition.verificationSupported) {
    missingRequirements.push("verification_supported");
  }
  if (!definition.failureLedgerSupported) {
    missingRequirements.push("failure_ledger_supported");
  }
  if (!definition.runbookPath) {
    missingRequirements.push("operator_runbook");
  }
  if (definition.requiredIndexes.length === 0) {
    missingRequirements.push("required_indexes_documented");
  }
  if (definition.destructiveRebuildAllowed !== false) {
    missingRequirements.push("no_global_destructive_rebuild");
  }
  if (
    definition.maxBatchSize < 1 ||
    definition.maxBatchSize > MAX_RECOVERY_BATCH_SIZE ||
    definition.maxRuntimeSeconds < 1 ||
    definition.maxRuntimeSeconds > MAX_RECOVERY_RUNTIME_SECONDS
  ) {
    missingRequirements.push("bounded_production_queries");
  }

  const passed = missingRequirements.length === 0;
  return {
    projectionName: definition.projectionName,
    requestedStatus: definition.requiredCertificationStatus,
    allowedStatus: passed ? "production_ready" : "not_ready",
    passed,
    missingRequirements,
  };
}
