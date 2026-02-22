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

function resolveMetricIncrement(
  field: string,
  value: number
): { metricField: GlobalMetricField; scopeDoc: "growth" | "engagement" | "moderation" } {
  if (!GLOBAL_METRIC_FIELDS.has(field as GlobalMetricField)) {
    throw new Error(`Unsupported global metric field: ${field}`);
  }

  if (!Number.isFinite(value) || Math.trunc(value) !== value || value === 0) {
    throw new Error(`Invalid increment value for ${field}: ${value}`);
  }

  const metricField = field as GlobalMetricField;
  const scopeDoc = FIELD_SCOPE_MAP[metricField];
  return { metricField, scopeDoc };
}

function buildIncrementPatch(metricField: GlobalMetricField, value: number) {
  return {
    [metricField]: admin.firestore.FieldValue.increment(value),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

export function incrementGlobalMetricInTransaction(
  tx: FirebaseFirestore.Transaction,
  field: string,
  value: number
): void {
  const { metricField, scopeDoc } = resolveMetricIncrement(field, value);
  const dateKey = getTodayDateKey();
  const dailyBucketRef = db.collection("system_metrics_daily").doc(dateKey);
  const patch = buildIncrementPatch(metricField, value);

  tx.set(db.collection("system_metrics").doc("global"), patch, { merge: true });
  tx.set(db.collection("system_metrics").doc(scopeDoc), patch, { merge: true });
  tx.set(
    dailyBucketRef,
    {
      dateKey,
      ...patch,
    },
    { merge: true }
  );
}

export async function incrementGlobalMetric(field: string, value: number): Promise<void> {
  const { metricField, scopeDoc } = resolveMetricIncrement(field, value);
  await ensureSystemMetricsInitialized();

  const dateKey = getTodayDateKey();
  const dailyBucketRef = db.collection("system_metrics_daily").doc(dateKey);
  const patch = buildIncrementPatch(metricField, value);

  await Promise.all([
    db.collection("system_metrics").doc("global").set(patch, { merge: true }),
    db.collection("system_metrics").doc(scopeDoc).set(patch, { merge: true }),
    dailyBucketRef.set(
      {
        dateKey,
        ...patch,
      },
      { merge: true }
    ),
  ]);
}
