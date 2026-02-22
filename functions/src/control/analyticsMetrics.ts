import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import { withControlAuth } from "./withControlAuth";

const db = admin.firestore();

const METRIC_FIELDS = [
  "totalUsers",
  "totalPosts",
  "totalReviews",
  "totalQuotes",
  "totalFollows",
  "totalDeletionRequests",
  "executedDeletions",
] as const;

type MetricField = (typeof METRIC_FIELDS)[number];
type ControlPayload = Record<string, unknown> | null | undefined;

type MetricsBlock = Record<MetricField, number> & {
  updatedAt: string | null;
};

type SystemMetricsSnapshotResponse = {
  snapshot: {
    global: MetricsBlock;
    growth: MetricsBlock;
    engagement: MetricsBlock;
    moderation: MetricsBlock;
  };
};

type SystemMetricsDailyRangeResponse = {
  days: Array<
    MetricsBlock & {
      dateKey: string;
    }
  >;
};

function readPayload(caller: CallableRequest<ControlPayload>): Record<string, unknown> {
  const payload = caller.data;
  if (payload == null) return {};
  if (typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpsError("invalid-argument", "Callable payload must be an object.");
  }
  return payload as Record<string, unknown>;
}

function readOptionalDateKey(payload: Record<string, unknown>, key: string): string | undefined {
  const raw = payload[key];
  if (raw == null) return undefined;
  if (typeof raw !== "string") {
    throw new HttpsError("invalid-argument", `${key} must be a YYYY-MM-DD string.`);
  }

  const normalized = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new HttpsError("invalid-argument", `${key} must match YYYY-MM-DD.`);
  }

  return normalized;
}

function readLimit(payload: Record<string, unknown>, fallback: number, max: number): number {
  const raw = payload.limit;
  if (raw == null) return fallback;
  if (typeof raw !== "number" || !Number.isFinite(raw) || Math.trunc(raw) !== raw) {
    throw new HttpsError("invalid-argument", "limit must be an integer.");
  }
  if (raw <= 0 || raw > max) {
    throw new HttpsError("invalid-argument", `limit must be between 1 and ${max}.`);
  }
  return raw;
}

function readMetricNumber(
  data: FirebaseFirestore.DocumentData | undefined,
  field: MetricField
): number {
  const value = data?.[field];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
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

export const getSystemMetricsSnapshot = withControlAuth<
  ControlPayload,
  SystemMetricsSnapshotResponse
>("moderator", "getSystemMetricsSnapshot", async () => {
  const [globalSnap, growthSnap, engagementSnap, moderationSnap] = await Promise.all([
    db.collection("system_metrics").doc("global").get(),
    db.collection("system_metrics").doc("growth").get(),
    db.collection("system_metrics").doc("engagement").get(),
    db.collection("system_metrics").doc("moderation").get(),
  ]);

  return {
    snapshot: {
      global: mapMetricsBlock(globalSnap.data()),
      growth: mapMetricsBlock(growthSnap.data()),
      engagement: mapMetricsBlock(engagementSnap.data()),
      moderation: mapMetricsBlock(moderationSnap.data()),
    },
  };
});

export const getSystemMetricsDailyRange = withControlAuth<
  ControlPayload,
  SystemMetricsDailyRangeResponse
>("moderator", "getSystemMetricsDailyRange", async (caller) => {
  const payload = readPayload(caller);

  // Keep validation logic for future extension
  const from = readOptionalDateKey(payload, "from");
  const to = readOptionalDateKey(payload, "to");
  if (from && to && from > to) {
    throw new HttpsError("invalid-argument", "from must be less than or equal to to.");
  }

  const limit = readLimit(payload, 30, 180);

  // Simplified safe query (no cursor range filtering to avoid 500/index issues)
  const dailyQuery: FirebaseFirestore.Query = db
    .collection("system_metrics_daily")
    .orderBy("__name__", "desc")
    .limit(limit);

  const dailySnap = await dailyQuery.get();

  const days = dailySnap.docs.map((doc) => ({
    dateKey: doc.id,
    ...mapMetricsBlock(doc.data()),
  }));

  return { days };
});