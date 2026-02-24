import { HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";

export type MutationActionType = "createPost" | "editPost" | "deletePost";

type MutationQuotaConfig = {
  limit: number;
  windowMs: number;
};

const MUTATION_QUOTAS: Record<MutationActionType, MutationQuotaConfig> = {
  createPost: { limit: 20, windowMs: 60 * 60 * 1000 },
  editPost: { limit: 10, windowMs: 10 * 60 * 1000 },
  deletePost: { limit: 5, windowMs: 10 * 60 * 1000 },
};

const getWindowStartMs = (nowMs: number, windowMs: number): number =>
  nowMs - (nowMs % windowMs);

export async function checkUserMutationQuota(
  db: FirebaseFirestore.Firestore,
  transaction: FirebaseFirestore.Transaction,
  uid: string,
  actionType: MutationActionType,
  nowMs: number = Date.now()
): Promise<void> {
  const normalizedUid = typeof uid === "string" ? uid.trim() : "";
  if (!normalizedUid) {
    throw new HttpsError("unauthenticated", "Unauthenticated mutation request.");
  }

  const quota = MUTATION_QUOTAS[actionType];
  const windowStartMs = getWindowStartMs(nowMs, quota.windowMs);
  const windowEndMs = windowStartMs + quota.windowMs;
  const logId = `${normalizedUid}_${actionType}_${windowStartMs}`;
  const logRef = db.collection("user_mutation_logs").doc(logId);
  const logSnap = await transaction.get(logRef);
  const existingCountRaw = logSnap.exists ? (logSnap.data()?.count as unknown) : 0;
  const existingCount =
    typeof existingCountRaw === "number" && Number.isFinite(existingCountRaw)
      ? Math.max(0, Math.trunc(existingCountRaw))
      : 0;

  if (existingCount >= quota.limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((windowEndMs - nowMs) / 1000)
    );
    throw new HttpsError(
      "permission-denied",
      "MUTATION_RATE_LIMIT_EXCEEDED",
      {
        actionType,
        limit: quota.limit,
        windowMs: quota.windowMs,
        retryAfterSeconds,
      }
    );
  }

  const nowTs = admin.firestore.Timestamp.now();
  transaction.set(
    logRef,
    {
      uid: normalizedUid,
      actionType,
      count: existingCount + 1,
      limit: quota.limit,
      windowMs: quota.windowMs,
      windowStartMs,
      windowEndMs,
      updatedAt: nowTs,
      ...(logSnap.exists ? {} : { createdAt: nowTs }),
    },
    { merge: true }
  );
}
