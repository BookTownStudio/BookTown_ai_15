import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import { withControlAuth } from "./withControlAuth";

const db = admin.firestore();
const SYSTEM_EVENTS_COLLECTION = "system_events";
const SYSTEM_METRICS_COLLECTION = "system_metrics";
const SYSTEM_METRICS_DAILY_COLLECTION = "system_metrics_daily";

type ControlPayload = Record<string, unknown> | null | undefined;

type RecentSystemEvent = {
  id: string;
  createdAt: string | null;
  type: string;
  uid: string;
  entityId: string | null;
};

type RecentSystemEventsResponse = {
  events: RecentSystemEvent[];
  nextCursor: string | null;
  totalCountEstimate: number;
};

type SystemHealthSnapshotResponse = {
  health: {
    globalUpdatedAt: string | null;
    latestDailyBucketDate: string | null;
    totalEventsCount: number;
    latestEventType: string | null;
    latestEventCreatedAt: string | null;
    lastPostCreatedAt: string | null;
  };
};

function readPayload(caller: CallableRequest<ControlPayload>): Record<string, unknown> {
  const payload = caller.data;
  if (payload == null) return {};
  if (typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpsError("invalid-argument", "Callable payload must be an object.");
  }
  return payload as Record<string, unknown>;
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

function readOptionalAfterCursor(payload: Record<string, unknown>): string | undefined {
  const raw = payload.afterCursor;
  if (raw == null) return undefined;
  if (typeof raw !== "string") {
    throw new HttpsError("invalid-argument", "afterCursor must be a string.");
  }

  const normalized = raw.trim();
  if (!normalized) {
    throw new HttpsError("invalid-argument", "afterCursor cannot be empty.");
  }

  if (normalized.length > 200) {
    throw new HttpsError("invalid-argument", "afterCursor exceeds maximum length.");
  }

  return normalized;
}

function readCountEstimate(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
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

function readEventType(data: FirebaseFirestore.DocumentData | undefined): string {
  const raw = data?.type;
  if (typeof raw !== "string") return "unknown";
  const normalized = raw.trim();
  return normalized.length > 0 ? normalized : "unknown";
}

function readEventUid(data: FirebaseFirestore.DocumentData | undefined): string {
  const raw = data?.uid;
  if (typeof raw !== "string") return "unknown";
  const normalized = raw.trim();
  return normalized.length > 0 ? normalized : "unknown";
}

function readEventEntityId(data: FirebaseFirestore.DocumentData | undefined): string | null {
  const raw = data?.entityId;
  if (typeof raw !== "string") return null;
  const normalized = raw.trim();
  return normalized.length > 0 ? normalized : null;
}

function mapEventDoc(doc: FirebaseFirestore.QueryDocumentSnapshot): RecentSystemEvent {
  const data = doc.data();
  return {
    id: doc.id,
    createdAt: toIsoTimestamp(data?.createdAt),
    type: readEventType(data),
    uid: readEventUid(data),
    entityId: readEventEntityId(data),
  };
}

export const getRecentSystemEvents = withControlAuth<ControlPayload, RecentSystemEventsResponse>(
  "moderator",
  "getRecentSystemEvents",
  async (caller) => {
    const payload = readPayload(caller);
    const limit = readLimit(payload, 50, 200);
    const afterCursor = readOptionalAfterCursor(payload);

    let eventsQuery: FirebaseFirestore.Query = db
      .collection(SYSTEM_EVENTS_COLLECTION)
      .orderBy("createdAt", "desc")
      .limit(limit);

    if (afterCursor) {
      const cursorSnap = await db.collection(SYSTEM_EVENTS_COLLECTION).doc(afterCursor).get();
      if (!cursorSnap.exists) {
        throw new HttpsError("invalid-argument", "afterCursor document does not exist.");
      }
      eventsQuery = eventsQuery.startAfter(cursorSnap);
    }

    const [eventsSnap, totalCountSnap] = await Promise.all([
      eventsQuery.get(),
      db.collectionGroup(SYSTEM_EVENTS_COLLECTION).count().get(),
    ]);

    const events = eventsSnap.docs.map((doc) => mapEventDoc(doc));
    const nextCursor =
      eventsSnap.docs.length === limit ? eventsSnap.docs[eventsSnap.docs.length - 1]?.id ?? null : null;

    return {
      events,
      nextCursor,
      totalCountEstimate: readCountEstimate(totalCountSnap.data().count),
    };
  }
);

export const getSystemHealthSnapshot = withControlAuth<ControlPayload, SystemHealthSnapshotResponse>(
  "moderator",
  "getSystemHealthSnapshot",
  async () => {
    const latestPostCreatedPromise = db
      .collection(SYSTEM_EVENTS_COLLECTION)
      .where("type", "==", "post_created")
      .orderBy("createdAt", "desc")
      .limit(1)
      .get()
      .catch((error) => {
        console.error("[CONTROL][HEALTH][POST_CREATED_QUERY_FAILED]", error);
        return null;
      });

    const [globalSnap, latestDailySnap, latestEventSnap, totalCountSnap, latestPostCreatedSnap] =
      await Promise.all([
        db.collection(SYSTEM_METRICS_COLLECTION).doc("global").get(),
        db.collection(SYSTEM_METRICS_DAILY_COLLECTION).orderBy("__name__", "desc").limit(1).get(),
        db.collection(SYSTEM_EVENTS_COLLECTION).orderBy("createdAt", "desc").limit(1).get(),
        db.collectionGroup(SYSTEM_EVENTS_COLLECTION).count().get(),
        latestPostCreatedPromise,
      ]);

    const latestEventDoc = latestEventSnap.docs[0];
    const latestEventData = latestEventDoc?.data();
    const latestEventType = latestEventData ? readEventType(latestEventData) : null;

    const latestPostCreatedDoc = latestPostCreatedSnap?.docs[0];
    const latestPostCreatedData = latestPostCreatedDoc?.data();

    return {
      health: {
        globalUpdatedAt: toIsoTimestamp(globalSnap.data()?.updatedAt),
        latestDailyBucketDate: latestDailySnap.empty ? null : latestDailySnap.docs[0].id,
        totalEventsCount: readCountEstimate(totalCountSnap.data().count),
        latestEventType,
        latestEventCreatedAt: toIsoTimestamp(latestEventData?.createdAt),
        lastPostCreatedAt: toIsoTimestamp(latestPostCreatedData?.createdAt),
      },
    };
  }
);
