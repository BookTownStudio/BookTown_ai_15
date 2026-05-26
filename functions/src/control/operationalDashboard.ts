import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import {
  BETA_OBSERVABILITY_SUMMARY_COLLECTION,
  OPERATIONAL_METRICS_COLLECTION,
  RUNTIME_HEALTH_PROJECTION_COLLECTION,
} from "../operations/operationalMetrics";
import { withControlAuth } from "./withControlAuth";

const db = admin.firestore();

type ControlPayload = Record<string, unknown> | null | undefined;

function readPayload(caller: CallableRequest<ControlPayload>): Record<string, unknown> {
  const payload = caller.data;
  if (payload == null) return {};
  if (typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpsError("invalid-argument", "Callable payload must be an object.");
  }
  return payload as Record<string, unknown>;
}

function readLimit(payload: Record<string, unknown>): number {
  const raw = payload.limit;
  if (raw == null) return 50;
  if (typeof raw !== "number" || !Number.isFinite(raw) || Math.trunc(raw) !== raw) {
    throw new HttpsError("invalid-argument", "limit must be an integer.");
  }
  return Math.max(1, Math.min(100, raw));
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

function mapMetric(doc: FirebaseFirestore.QueryDocumentSnapshot): Record<string, unknown> {
  const data = doc.data();
  return {
    id: doc.id,
    name: typeof data.name === "string" ? data.name : doc.id,
    unit: typeof data.unit === "string" ? data.unit : "count",
    latestValue: typeof data.latestValue === "number" ? data.latestValue : null,
    count: typeof data.count === "number" ? data.count : 0,
    sum: typeof data.sum === "number" ? data.sum : 0,
    updatedAt: toIso(data.updatedAt),
  };
}

async function readProjection(collectionName: string, docId: string): Promise<Record<string, unknown>> {
  const snap = await db.collection(collectionName).doc(docId).get();
  const data = snap.exists ? snap.data() || {} : {};
  return {
    id: snap.id,
    ...data,
    updatedAt: toIso(data.updatedAt),
  };
}

export const getOperationalDashboard = withControlAuth<ControlPayload, {
  metrics: Record<string, unknown>[];
  runtimeHealth: Record<string, unknown>;
  betaSummary: Record<string, unknown>;
}>("moderator", "getOperationalDashboard", async (caller) => {
  const payload = readPayload(caller);
  const limit = readLimit(payload);
  const [metricsSnap, runtimeHealth, betaSummary] = await Promise.all([
    db.collection(OPERATIONAL_METRICS_COLLECTION)
      .orderBy("updatedAt", "desc")
      .limit(limit)
      .get(),
    readProjection(RUNTIME_HEALTH_PROJECTION_COLLECTION, "global"),
    readProjection(BETA_OBSERVABILITY_SUMMARY_COLLECTION, "current"),
  ]);

  return {
    metrics: metricsSnap.docs.map(mapMetric),
    runtimeHealth,
    betaSummary,
  };
});

export const getRuntimeHealthSummary = withControlAuth<ControlPayload, {
  runtimeHealth: Record<string, unknown>;
  betaSummary: Record<string, unknown>;
}>("moderator", "getRuntimeHealthSummary", async () => {
  const [runtimeHealth, betaSummary] = await Promise.all([
    readProjection(RUNTIME_HEALTH_PROJECTION_COLLECTION, "global"),
    readProjection(BETA_OBSERVABILITY_SUMMARY_COLLECTION, "current"),
  ]);

  return {
    runtimeHealth,
    betaSummary,
  };
});
