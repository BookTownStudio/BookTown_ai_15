import { admin } from "../firebaseAdmin";

const db = admin.firestore();

export type GlobalMetricField =
  | "totalUsers"
  | "totalPosts"
  | "totalReviews"
  | "totalQuotes"
  | "totalFollows"
  | "totalDeletionRequests"
  | "executedDeletions";

const GLOBAL_FIELDS: readonly GlobalMetricField[] = [
  "totalUsers",
  "totalPosts",
  "totalReviews",
  "totalQuotes",
  "totalFollows",
  "totalDeletionRequests",
  "executedDeletions",
];

const GROWTH_FIELDS: readonly GlobalMetricField[] = ["totalUsers", "totalFollows"];
const ENGAGEMENT_FIELDS: readonly GlobalMetricField[] = [
  "totalPosts",
  "totalReviews",
  "totalQuotes",
];
const MODERATION_FIELDS: readonly GlobalMetricField[] = [
  "totalDeletionRequests",
  "executedDeletions",
];

function buildZeroIncrementPatch(fields: readonly GlobalMetricField[]) {
  const patch: Record<string, unknown> = {
    schemaVersion: 1,
    initializedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  for (const field of fields) {
    patch[field] = admin.firestore.FieldValue.increment(0);
  }

  return patch;
}

let initializationPromise: Promise<void> | null = null;

async function initializeSystemMetricsProjectionOnce(): Promise<void> {
  await Promise.all([
    db.collection("system_metrics")
      .doc("global")
      .set(buildZeroIncrementPatch(GLOBAL_FIELDS), { merge: true }),
    db.collection("system_metrics")
      .doc("growth")
      .set(buildZeroIncrementPatch(GROWTH_FIELDS), { merge: true }),
    db.collection("system_metrics")
      .doc("engagement")
      .set(buildZeroIncrementPatch(ENGAGEMENT_FIELDS), { merge: true }),
    db.collection("system_metrics")
      .doc("moderation")
      .set(buildZeroIncrementPatch(MODERATION_FIELDS), { merge: true }),
  ]);
}

export async function ensureSystemMetricsInitialized(): Promise<void> {
  if (!initializationPromise) {
    initializationPromise = initializeSystemMetricsProjectionOnce().catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }

  await initializationPromise;
}
