import * as logger from "firebase-functions/logger";
import { admin } from "../firebaseAdmin";

const db = admin.firestore();

export const OPERATIONAL_METRICS_COLLECTION = "operational_metrics";
export const RUNTIME_HEALTH_PROJECTION_COLLECTION = "runtime_health_projection";
export const BETA_OBSERVABILITY_SUMMARY_COLLECTION = "beta_observability_summary";

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
  } catch (error) {
    logger.error("[OPERATIONS][METRIC_WRITE_FAILED]", {
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
