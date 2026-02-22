import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { admin } from "../firebaseAdmin";

const db = admin.firestore();

const ANALYTICS_EXPORTS_COLLECTION = "analytics_exports";
const SYSTEM_METRICS_COLLECTION = "system_metrics";
const SYSTEM_METRICS_DAILY_COLLECTION = "system_metrics_daily";
const SYSTEM_EVENTS_COLLECTION = "system_events";
const DAY_MS = 24 * 60 * 60 * 1000;

const ENVIRONMENT = process.env.APP_ENV === "staging" ? "staging" : "prod";
const APP_VERSION = process.env.APP_VERSION || "unknown";

type MetricsBlock = {
  totalUsers: number;
  totalPosts: number;
  totalReviews: number;
  totalQuotes: number;
  totalFollows: number;
  totalDeletionRequests: number;
  executedDeletions: number;
  updatedAt: string | null;
};

type DailyMetricsBlock = MetricsBlock & {
  dateKey: string;
};

function getUtcStartOfDayTimestamp(reference: Date): number {
  return Date.UTC(
    reference.getUTCFullYear(),
    reference.getUTCMonth(),
    reference.getUTCDate()
  );
}

function formatDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateKeyForDaysAgo(daysAgo: number): string {
  const utcStart = getUtcStartOfDayTimestamp(new Date());
  return formatDateKey(new Date(utcStart - daysAgo * DAY_MS));
}

function toIsoTimestamp(value: unknown): string | null {
  if (value == null) return null;

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  if (typeof value === "object") {
    const candidate = value as { toDate?: unknown };
    if (typeof candidate.toDate === "function") {
      const parsed = (candidate.toDate as () => Date)();
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
  }

  return null;
}

function readCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function readMetricNumber(
  data: FirebaseFirestore.DocumentData | undefined,
  field: keyof Omit<MetricsBlock, "updatedAt">
): number {
  const value = data?.[field];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function mapMetricsBlock(data: FirebaseFirestore.DocumentData | undefined): MetricsBlock {
  return {
    totalUsers: readMetricNumber(data, "totalUsers"),
    totalPosts: readMetricNumber(data, "totalPosts"),
    totalReviews: readMetricNumber(data, "totalReviews"),
    totalQuotes: readMetricNumber(data, "totalQuotes"),
    totalFollows: readMetricNumber(data, "totalFollows"),
    totalDeletionRequests: readMetricNumber(data, "totalDeletionRequests"),
    executedDeletions: readMetricNumber(data, "executedDeletions"),
    updatedAt: toIsoTimestamp(data?.updatedAt),
  };
}

function mapDailyMetricsBlock(
  dateKey: string,
  data: FirebaseFirestore.DocumentData | undefined
): DailyMetricsBlock {
  return {
    dateKey,
    ...mapMetricsBlock(data),
  };
}

function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  return Number((numerator / denominator).toFixed(6));
}

export const exportDailyAnalyticsSnapshot = onSchedule(
  {
    schedule: "5 0 * * *",
    timeZone: "UTC",
    memory: "256MiB",
    timeoutSeconds: 300,
  },
  async () => {
    const dateKey = getDateKeyForDaysAgo(1);
    const previousDateKey = getDateKeyForDaysAgo(2);

    const [
      globalSnap,
      growthSnap,
      engagementSnap,
      moderationSnap,
      dailySnap,
      previousDailySnap,
      totalEventsCountSnap,
    ] = await Promise.all([
      db.collection(SYSTEM_METRICS_COLLECTION).doc("global").get(),
      db.collection(SYSTEM_METRICS_COLLECTION).doc("growth").get(),
      db.collection(SYSTEM_METRICS_COLLECTION).doc("engagement").get(),
      db.collection(SYSTEM_METRICS_COLLECTION).doc("moderation").get(),
      db.collection(SYSTEM_METRICS_DAILY_COLLECTION).doc(dateKey).get(),
      db.collection(SYSTEM_METRICS_DAILY_COLLECTION).doc(previousDateKey).get(),
      db.collectionGroup(SYSTEM_EVENTS_COLLECTION).count().get(),
    ]);

    const snapshot = {
      global: mapMetricsBlock(globalSnap.data()),
      growth: mapMetricsBlock(growthSnap.data()),
      engagement: mapMetricsBlock(engagementSnap.data()),
      moderation: mapMetricsBlock(moderationSnap.data()),
    };

    const daily = mapDailyMetricsBlock(dateKey, dailySnap.data());
    const previousDaily = previousDailySnap.exists
      ? mapDailyMetricsBlock(previousDateKey, previousDailySnap.data())
      : null;

    const derived = {
      postsPerUser: safeDivide(snapshot.global.totalPosts, snapshot.global.totalUsers),
      reviewsPerPost: safeDivide(snapshot.global.totalReviews, snapshot.global.totalPosts),
      engagementRatio: safeDivide(
        snapshot.global.totalReviews + snapshot.global.totalQuotes,
        snapshot.global.totalPosts
      ),
      growthDeltaPosts:
        previousDaily == null
          ? null
          : Number((daily.totalPosts - previousDaily.totalPosts).toFixed(6)),
    };

    const totalEventsCount = readCount(totalEventsCountSnap.data().count);

    await db
      .collection(ANALYTICS_EXPORTS_COLLECTION)
      .doc(dateKey)
      .set(
        {
          dateKey,
          snapshot,
          daily,
          derived,
          totalEventsCount,
          exportedAt: admin.firestore.FieldValue.serverTimestamp(),
          environment: ENVIRONMENT,
          appVersion: APP_VERSION,
          schemaVersion: 1,
        },
        { merge: true }
      );

    logger.info("[ANALYTICS][DAILY_EXPORT][SUCCESS]", {
      dateKey,
      previousDateKey,
      totalEventsCount,
      environment: ENVIRONMENT,
      appVersion: APP_VERSION,
    });
  }
);
