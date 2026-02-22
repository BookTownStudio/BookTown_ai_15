import { admin } from "../firebaseAdmin";
import {
  type GlobalMetricField,
  ensureSystemMetricsInitialized,
} from "./initMetrics";

const db = admin.firestore();

const GLOBAL_METRIC_FIELDS = new Set<GlobalMetricField>([
  "totalUsers",
  "totalPosts",
  "totalReviews",
  "totalQuotes",
  "totalFollows",
  "totalDeletionRequests",
  "executedDeletions",
]);

const FIELD_SCOPE_MAP: Record<GlobalMetricField, "growth" | "engagement" | "moderation"> = {
  totalUsers: "growth",
  totalPosts: "engagement",
  totalReviews: "engagement",
  totalQuotes: "engagement",
  totalFollows: "growth",
  totalDeletionRequests: "moderation",
  executedDeletions: "moderation",
};

export function getTodayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function incrementGlobalMetric(field: string, value: number): Promise<void> {
  if (!GLOBAL_METRIC_FIELDS.has(field as GlobalMetricField)) {
    throw new Error(`Unsupported global metric field: ${field}`);
  }

  if (!Number.isFinite(value) || Math.trunc(value) !== value || value === 0) {
    throw new Error(`Invalid increment value for ${field}: ${value}`);
  }

  await ensureSystemMetricsInitialized();

  const metricField = field as GlobalMetricField;
  const scopeDoc = FIELD_SCOPE_MAP[metricField];
  const dateKey = getTodayDateKey();
  const patch = {
    [metricField]: admin.firestore.FieldValue.increment(value),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await Promise.all([
    db.collection("system_metrics").doc("global").set(patch, { merge: true }),
    db.collection("system_metrics").doc(scopeDoc).set(patch, { merge: true }),
    db
      .collection("system_metrics")
      .doc("daily")
      .collection("days")
      .doc(dateKey)
      .set(
        {
          dateKey,
          ...patch,
        },
        { merge: true }
      ),
  ]);
}
