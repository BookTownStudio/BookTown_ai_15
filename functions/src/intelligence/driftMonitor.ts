import { createHash } from "crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { admin } from "../firebaseAdmin";

const db = admin.firestore();

const AGGREGATE_COLLECTION = "intelligence_aggregates_global";
const AGGREGATE_DOC_ID = "librarian_global_v1";
const CHECKPOINT_COLLECTION = "intelligence_aggregation_checkpoint";
const CHECKPOINT_DOC_ID = "librarian_global_v1";

const DRIFT_METRICS_COLLECTION = "intelligence_drift_metrics";
const DRIFT_ALERTS_COLLECTION = "intelligence_drift_alerts";

const BASELINE_WINDOW_DAYS = 30;
const COMPARISON_WINDOW_DAYS = 7;
const MAX_FIRESTORE_READS = 20;

const DRIFT_THRESHOLDS = {
  acceptance_rate: 0.15,
  engagement_rate: 0.15,
  completion_rate: 0.15,
  positive_rate: 0.1,
} as const;

type MetricName = keyof typeof DRIFT_THRESHOLDS;

type Counts = {
  suggestions: number;
  accepted: number;
  engaged: number;
  completed: number;
  positive: number;
};

type Rates = {
  acceptance_rate: number;
  engagement_rate: number;
  completion_rate: number;
  positive_rate: number;
};

type DriftAlert = {
  metric: MetricName;
  baselineValue: number;
  currentValue: number;
  delta: number;
  type: "performance_improvement" | "performance_degradation";
  severity: "low" | "medium" | "high";
};

type SnapshotDoc = {
  timestamp: Timestamp | null;
  counts: Counts;
};

type ReadBudget = {
  used: number;
  max: number;
};

function stableHash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function clampInt(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.trunc(numeric));
}

function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Number((numerator / denominator).toFixed(6));
}

function toTimestamp(value: unknown): Timestamp | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value;
  if (typeof value === "object" && value !== null) {
    const candidate = value as { toDate?: unknown };
    if (typeof candidate.toDate === "function") {
      const date = (candidate.toDate as () => Date)();
      if (!Number.isNaN(date.getTime())) {
        return Timestamp.fromDate(date);
      }
    }
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return Timestamp.fromDate(parsed);
    }
  }
  return null;
}

function trackReads(budget: ReadBudget, count: number, context: string): void {
  if (count <= 0) return;
  budget.used += count;
  if (budget.used > budget.max) {
    throw new Error(`READ_BUDGET_EXCEEDED:${context}`);
  }
}

function emptyCounts(): Counts {
  return {
    suggestions: 0,
    accepted: 0,
    engaged: 0,
    completed: 0,
    positive: 0,
  };
}

export function sumCountsFromAggregate(modePerformanceRaw: unknown): Counts {
  if (!modePerformanceRaw || typeof modePerformanceRaw !== "object" || Array.isArray(modePerformanceRaw)) {
    return emptyCounts();
  }

  const modePerformance = modePerformanceRaw as Record<string, unknown>;
  const totals = emptyCounts();

  for (const modeData of Object.values(modePerformance)) {
    if (!modeData || typeof modeData !== "object" || Array.isArray(modeData)) continue;
    const row = modeData as Record<string, unknown>;
    totals.suggestions += clampInt(row.suggested);
    totals.accepted += clampInt(row.accepted);
    totals.engaged += clampInt(row.engaged);
    totals.completed += clampInt(row.completed);
    totals.positive += clampInt(row.positive);
  }

  return totals;
}

export function computeRatesFromCounts(counts: Counts): Rates {
  return {
    acceptance_rate: safeDivide(counts.accepted, counts.suggestions),
    engagement_rate: safeDivide(counts.engaged, counts.accepted),
    completion_rate: safeDivide(counts.completed, counts.engaged),
    positive_rate: safeDivide(counts.positive, counts.completed),
  };
}

export function subtractCounts(end: Counts, start: Counts): Counts {
  return {
    suggestions: Math.max(0, end.suggestions - start.suggestions),
    accepted: Math.max(0, end.accepted - start.accepted),
    engaged: Math.max(0, end.engaged - start.engaged),
    completed: Math.max(0, end.completed - start.completed),
    positive: Math.max(0, end.positive - start.positive),
  };
}

export function classifySeverity(deltaAbs: number, threshold: number): "low" | "medium" | "high" {
  if (deltaAbs > threshold * 2) return "high";
  if (deltaAbs > threshold * 1.5) return "medium";
  return "low";
}

export function detectDriftAlerts(params: {
  baseline: Rates;
  current: Rates;
}): DriftAlert[] {
  const alerts: DriftAlert[] = [];

  for (const metric of Object.keys(DRIFT_THRESHOLDS) as MetricName[]) {
    const threshold = DRIFT_THRESHOLDS[metric];
    const baselineValue = params.baseline[metric];
    const currentValue = params.current[metric];
    const delta = Number((currentValue - baselineValue).toFixed(6));
    const absDelta = Math.abs(delta);

    if (absDelta <= threshold) continue;

    alerts.push({
      metric,
      baselineValue,
      currentValue,
      delta,
      type: delta > 0 ? "performance_improvement" : "performance_degradation",
      severity: classifySeverity(absDelta, threshold),
    });
  }

  return alerts;
}

function parseSnapshotDoc(
  snap: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>
): SnapshotDoc {
  if (!snap.exists) {
    return { timestamp: null, counts: emptyCounts() };
  }
  return {
    timestamp: toTimestamp(snap.get("timestamp")),
    counts: {
      suggestions: clampInt(snap.get("suggestions")),
      accepted: clampInt(snap.get("accepted")),
      engaged: clampInt(snap.get("engaged")),
      completed: clampInt(snap.get("completed")),
      positive: clampInt(snap.get("positive")),
    },
  };
}

async function getLatestSnapshotAtOrBefore(params: {
  at: Timestamp;
  budget: ReadBudget;
}): Promise<SnapshotDoc> {
  const snap = await db
    .collection(DRIFT_METRICS_COLLECTION)
    .where("timestamp", "<=", params.at)
    .orderBy("timestamp", "desc")
    .limit(1)
    .get();
  trackReads(params.budget, snap.size, "drift_metrics_boundary");

  if (snap.empty) return { timestamp: null, counts: emptyCounts() };
  return parseSnapshotDoc(snap.docs[0]);
}

function resolveInvocationTimestamp(event: unknown): Timestamp {
  const scheduleTimeRaw =
    event && typeof event === "object" && "scheduleTime" in (event as Record<string, unknown>)
      ? (event as { scheduleTime?: unknown }).scheduleTime
      : null;
  return toTimestamp(scheduleTimeRaw) ?? Timestamp.now();
}

export function deriveDriftRunId(invocationStart: Timestamp): string {
  const bucketMs = 24 * 60 * 60 * 1000;
  const roundedMs = Math.floor(invocationStart.toMillis() / bucketMs) * bucketMs;
  return `librarian_drift_v1_${roundedMs}`;
}

function alertDocId(runId: string, metric: string): string {
  return stableHash(`${runId}|${metric}`).slice(0, 32);
}

async function persistAlerts(params: {
  runId: string;
  alerts: DriftAlert[];
}): Promise<void> {
  if (params.alerts.length === 0) return;

  const batch = db.batch();
  for (const alert of params.alerts) {
    const ref = db.collection(DRIFT_ALERTS_COLLECTION).doc(alertDocId(params.runId, alert.metric));
    batch.set(
      ref,
      {
        runId: params.runId,
        metric: alert.metric,
        baselineValue: alert.baselineValue,
        currentValue: alert.currentValue,
        delta: alert.delta,
        type: alert.type,
        severity: alert.severity,
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
  await batch.commit();
}

export async function runIntelligenceDriftMonitor(params?: {
  invocationStart?: Timestamp;
}): Promise<{
  runId: string;
  alertsDetected: number;
  comparisonRates: Rates;
  baselineRates: Rates;
}> {
  const invocationStart = params?.invocationStart ?? Timestamp.now();
  const runId = deriveDriftRunId(invocationStart);
  const budget: ReadBudget = { used: 0, max: MAX_FIRESTORE_READS };

  logger.info("[INTELLIGENCE][DRIFT][drift_monitor_start]", {
    runId,
    baselineWindowDays: BASELINE_WINDOW_DAYS,
    comparisonWindowDays: COMPARISON_WINDOW_DAYS,
  });

  const [aggregateSnap, checkpointSnap] = await Promise.all([
    db.collection(AGGREGATE_COLLECTION).doc(AGGREGATE_DOC_ID).get(),
    db.collection(CHECKPOINT_COLLECTION).doc(CHECKPOINT_DOC_ID).get(),
  ]);
  trackReads(budget, 2, "aggregate_and_checkpoint");

  if (!aggregateSnap.exists) {
    throw new Error(`MISSING_AGGREGATE_DOC:${AGGREGATE_DOC_ID}`);
  }

  const cumulativeCounts = sumCountsFromAggregate(aggregateSnap.get("modePerformance"));
  const comparisonWindowStart = Timestamp.fromMillis(
    invocationStart.toMillis() - COMPARISON_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );
  const baselineWindowStart = Timestamp.fromMillis(
    comparisonWindowStart.toMillis() - BASELINE_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );

  const [comparisonStartSnapshot, baselineStartSnapshot] = await Promise.all([
    getLatestSnapshotAtOrBefore({ at: comparisonWindowStart, budget }),
    getLatestSnapshotAtOrBefore({ at: baselineWindowStart, budget }),
  ]);

  const comparisonCounts = subtractCounts(cumulativeCounts, comparisonStartSnapshot.counts);
  const baselineCounts = subtractCounts(comparisonStartSnapshot.counts, baselineStartSnapshot.counts);
  const comparisonRates = computeRatesFromCounts(comparisonCounts);
  const baselineRates = computeRatesFromCounts(baselineCounts);

  const checkpointLastProcessedAt = checkpointSnap.exists
    ? toTimestamp(checkpointSnap.get("lastProcessedAt"))
    : null;
  const checkpointUpdatedAt = checkpointSnap.exists
    ? toTimestamp(checkpointSnap.get("updatedAt"))
    : null;
  const checkpointVersion = checkpointSnap.exists
    ? clampInt(checkpointSnap.get("aggregationVersion"))
    : 0;

  await db
    .collection(DRIFT_METRICS_COLLECTION)
    .doc(runId)
    .set(
      {
        runId,
        timestamp: invocationStart,
        acceptanceRate: comparisonRates.acceptance_rate,
        engagementRate: comparisonRates.engagement_rate,
        completionRate: comparisonRates.completion_rate,
        positiveRate: comparisonRates.positive_rate,
        suggestions: comparisonCounts.suggestions,
        accepted: comparisonCounts.accepted,
        engaged: comparisonCounts.engaged,
        completed: comparisonCounts.completed,
        positive: comparisonCounts.positive,
        baselineWindowDays: BASELINE_WINDOW_DAYS,
        comparisonWindowDays: COMPARISON_WINDOW_DAYS,
        baselineRates,
        deltas: {
          acceptance_rate: Number((comparisonRates.acceptance_rate - baselineRates.acceptance_rate).toFixed(6)),
          engagement_rate: Number((comparisonRates.engagement_rate - baselineRates.engagement_rate).toFixed(6)),
          completion_rate: Number((comparisonRates.completion_rate - baselineRates.completion_rate).toFixed(6)),
          positive_rate: Number((comparisonRates.positive_rate - baselineRates.positive_rate).toFixed(6)),
        },
        cumulativeCounts,
        checkpoint: {
          lastProcessedAt: checkpointLastProcessedAt,
          updatedAt: checkpointUpdatedAt,
          aggregationVersion: checkpointVersion,
        },
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  logger.info("[INTELLIGENCE][DRIFT][metric_computed]", {
    runId,
    comparisonRates,
    baselineRates,
    comparisonCounts,
    baselineCounts,
    readCount: budget.used,
  });

  const alerts = detectDriftAlerts({
    baseline: baselineRates,
    current: comparisonRates,
  });

  await persistAlerts({
    runId,
    alerts,
  });

  for (const alert of alerts) {
    logger.warn("[INTELLIGENCE][DRIFT][drift_detected]", {
      runId,
      metric: alert.metric,
      baselineValue: alert.baselineValue,
      currentValue: alert.currentValue,
      delta: alert.delta,
      type: alert.type,
      severity: alert.severity,
    });
  }

  logger.info("[INTELLIGENCE][DRIFT][drift_summary]", {
    runId,
    alertsDetected: alerts.length,
    readCount: budget.used,
    baselineWindowDays: BASELINE_WINDOW_DAYS,
    comparisonWindowDays: COMPARISON_WINDOW_DAYS,
  });

  return {
    runId,
    alertsDetected: alerts.length,
    comparisonRates,
    baselineRates,
  };
}

export const scheduledIntelligenceDriftMonitor = onSchedule(
  {
    schedule: "every 24 hours",
    timeZone: "UTC",
    memory: "256MiB",
    timeoutSeconds: 60,
    maxInstances: 1,
    retryCount: 3,
  },
  async (event) => {
    const invocationStart = resolveInvocationTimestamp(event);
    await runIntelligenceDriftMonitor({ invocationStart });
  }
);

