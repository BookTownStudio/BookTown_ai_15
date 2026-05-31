import * as logger from "firebase-functions/logger";
import { admin } from "../firebaseAdmin";

const db = admin.firestore();

export const OPERATIONAL_METRICS_COLLECTION = "operational_metrics";
export const RUNTIME_HEALTH_PROJECTION_COLLECTION = "runtime_health_projection";
export const BETA_OBSERVABILITY_SUMMARY_COLLECTION = "beta_observability_summary";
export const RUNTIME_ANOMALY_PROJECTION_COLLECTION = "runtime_anomaly_projection";
export const RUNTIME_ANOMALY_EVENTS_COLLECTION = "runtime_anomaly_events";

export type OperationalMetricName =
  | "reader_bootstrap_duration"
  | "search_latency"
  | "home_console_latency"
  | "reader_startup_failure"
  | "signed_url_failure"
  | "continuity_migration_success"
  | "continuity_migration_failure"
  | "review_aggregate_retry"
  | "quote_projection_failure"
  | "notification_projection_failure"
  | "notification_projection_reconciliation"
  | "search_projection_reconciliation"
  | "shelf_membership_query_latency"
  | "callable_error_rate"
  | "firestore_read_amplification"
  | "cache_hit_ratio";

type RecordOperationalMetricInput = {
  name: OperationalMetricName;
  value?: number;
  unit?: "ms" | "count" | "ratio";
  dimensions?: Record<string, string | number | boolean | null>;
};

type RuntimeAnomalySeverity = "warning" | "critical";

type RuntimeAnomalyDefinition = {
  detector: string;
  threshold: number;
  comparison: "gte" | "lte";
  severity: RuntimeAnomalySeverity;
};

const RUNTIME_ANOMALY_DETECTORS: Record<OperationalMetricName, RuntimeAnomalyDefinition> = {
  reader_bootstrap_duration: {
    detector: "reader_bootstrap_latency_spike",
    threshold: 2500,
    comparison: "gte",
    severity: "warning",
  },
  search_latency: {
    detector: "search_latency_spike",
    threshold: 1200,
    comparison: "gte",
    severity: "warning",
  },
  home_console_latency: {
    detector: "home_console_latency_spike",
    threshold: 1800,
    comparison: "gte",
    severity: "warning",
  },
  reader_startup_failure: {
    detector: "reader_startup_failure_spike",
    threshold: 1,
    comparison: "gte",
    severity: "critical",
  },
  signed_url_failure: {
    detector: "signed_url_failure_spike",
    threshold: 1,
    comparison: "gte",
    severity: "critical",
  },
  continuity_migration_success: {
    detector: "continuity_migration_success_observed",
    threshold: 1,
    comparison: "gte",
    severity: "warning",
  },
  continuity_migration_failure: {
    detector: "continuity_migration_failures",
    threshold: 1,
    comparison: "gte",
    severity: "critical",
  },
  review_aggregate_retry: {
    detector: "review_aggregate_retry_spike",
    threshold: 1,
    comparison: "gte",
    severity: "warning",
  },
  quote_projection_failure: {
    detector: "quote_projection_failure_spike",
    threshold: 1,
    comparison: "gte",
    severity: "critical",
  },
  notification_projection_failure: {
    detector: "notification_projection_failures",
    threshold: 1,
    comparison: "gte",
    severity: "critical",
  },
  notification_projection_reconciliation: {
    detector: "notification_projection_reconciliation_drift",
    threshold: 1,
    comparison: "gte",
    severity: "warning",
  },
  search_projection_reconciliation: {
    detector: "search_projection_reconciliation_drift",
    threshold: 1,
    comparison: "gte",
    severity: "warning",
  },
  shelf_membership_query_latency: {
    detector: "shelf_membership_latency_spike",
    threshold: 500,
    comparison: "gte",
    severity: "warning",
  },
  callable_error_rate: {
    detector: "callable_error_rate_spike",
    threshold: 1,
    comparison: "gte",
    severity: "critical",
  },
  firestore_read_amplification: {
    detector: "firestore_read_amplification",
    threshold: 50,
    comparison: "gte",
    severity: "warning",
  },
  cache_hit_ratio: {
    detector: "cache_miss_spike",
    threshold: 0.6,
    comparison: "lte",
    severity: "warning",
  },
};

function sanitizeDimensions(
  dimensions: Record<string, string | number | boolean | null> | undefined
): Record<string, string | number | boolean | null> {
  if (!dimensions) return {};
  return Object.fromEntries(
    Object.entries(dimensions)
      .filter(([key]) => key.length > 0 && key.length <= 80)
      .slice(0, 20)
  );
}

export async function recordOperationalMetric(input: RecordOperationalMetricInput): Promise<void> {
  const value = typeof input.value === "number" && Number.isFinite(input.value) ? input.value : 1;
  const unit = input.unit || "count";
  const dimensions = sanitizeDimensions(input.dimensions);
  const metricRef = db.collection(OPERATIONAL_METRICS_COLLECTION).doc(input.name);
  const runtimeRef = db.collection(RUNTIME_HEALTH_PROJECTION_COLLECTION).doc("global");
  const betaRef = db.collection(BETA_OBSERVABILITY_SUMMARY_COLLECTION).doc("current");

  try {
    if (typeof db.runTransaction !== "function") {
      return;
    }
    const fieldValue = (admin.firestore as unknown as {
      FieldValue?: {
        serverTimestamp?: () => unknown;
        increment?: (value: number) => unknown;
      };
    }).FieldValue;
    const now = fieldValue?.serverTimestamp?.() ?? new Date();
    const incrementCount = fieldValue?.increment?.(1) ?? 1;
    const incrementValue = fieldValue?.increment?.(value) ?? value;

    await db.runTransaction(async (tx) => {
      tx.set(metricRef, {
        name: input.name,
        unit,
        latestValue: value,
        latestDimensions: dimensions,
        count: incrementCount,
        sum: incrementValue,
        updatedAt: now,
      }, { merge: true });

      tx.set(runtimeRef, {
        latestMetricName: input.name,
        latestMetricValue: value,
        latestMetricUnit: unit,
        updatedAt: now,
      }, { merge: true });

      tx.set(betaRef, {
        latestMetricName: input.name,
        latestMetricValue: value,
        updatedAt: now,
      }, { merge: true });
    });

    void detectRuntimeAnomaly({
      name: input.name,
      value,
      unit,
      dimensions,
    });
  } catch (error) {
    logger.error("[OPERATIONS][METRIC_WRITE_FAILED]", {
      metricName: input.name,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function detectRuntimeAnomaly(input: {
  name: OperationalMetricName;
  value: number;
  unit: "ms" | "count" | "ratio";
  dimensions: Record<string, string | number | boolean | null>;
}): Promise<void> {
  const definition = RUNTIME_ANOMALY_DETECTORS[input.name];
  const breached =
    definition.comparison === "gte"
      ? input.value >= definition.threshold
      : input.value <= definition.threshold;
  if (!breached) return;

  try {
    if (typeof db.runTransaction !== "function") {
      return;
    }
    const fieldValue = (admin.firestore as unknown as {
      FieldValue?: {
        serverTimestamp?: () => unknown;
        increment?: (value: number) => unknown;
      };
    }).FieldValue;
    const now = fieldValue?.serverTimestamp?.() ?? new Date();
    const incrementOne = fieldValue?.increment?.(1) ?? 1;
    const anomalyId = `${definition.detector}_${Date.now()}`;
    const projectionRef = db
      .collection(RUNTIME_ANOMALY_PROJECTION_COLLECTION)
      .doc(definition.detector);
    const eventRef = db
      .collection(RUNTIME_ANOMALY_EVENTS_COLLECTION)
      .doc(anomalyId);

    await db.runTransaction(async (tx) => {
      const payload = {
        detector: definition.detector,
        metricName: input.name,
        severity: definition.severity,
        threshold: definition.threshold,
        comparison: definition.comparison,
        observedValue: input.value,
        observedUnit: input.unit,
        dimensions: input.dimensions,
        status: "active",
        updatedAt: now,
      };
      tx.set(projectionRef, {
        ...payload,
        anomalyCount: incrementOne,
        lastAnomalyEventId: anomalyId,
      }, { merge: true });
      tx.set(eventRef, {
        ...payload,
        anomalyId,
        createdAt: now,
      });
    });

    logger.warn("[OPERATIONS][RUNTIME_ANOMALY_DETECTED]", {
      detector: definition.detector,
      metricName: input.name,
      severity: definition.severity,
      observedValue: input.value,
      threshold: definition.threshold,
      comparison: definition.comparison,
    });
  } catch (error) {
    logger.error("[OPERATIONS][ANOMALY_DETECTION_FAILED]", {
      metricName: input.name,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "object" && typeof (value as { toDate?: unknown }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

export async function readRuntimeHealthProjection(): Promise<Record<string, unknown>> {
  const snap = await db.collection(RUNTIME_HEALTH_PROJECTION_COLLECTION).doc("global").get();
  const data = snap.exists ? snap.data() || {} : {};
  return {
    latestMetricName: typeof data.latestMetricName === "string" ? data.latestMetricName : null,
    latestMetricValue: typeof data.latestMetricValue === "number" ? data.latestMetricValue : null,
    latestMetricUnit: typeof data.latestMetricUnit === "string" ? data.latestMetricUnit : null,
    updatedAt: toIso(data.updatedAt),
  };
}
