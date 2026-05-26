import { admin } from "../firebaseAdmin";

const db = admin.firestore();
export const NOTIFICATION_SUMMARY_COLLECTION = "notification_summary";

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (typeof value === "object" && typeof (value as { toDate?: unknown }).toDate === "function") {
    const parsed = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

export function notificationSummaryRef(uid: string) {
  return db.collection(NOTIFICATION_SUMMARY_COLLECTION).doc(uid);
}

export function buildNotificationSummaryPatch(params: {
  unreadCount?: FirebaseFirestore.FieldValue | number;
  latestNotificationAt?: FirebaseFirestore.FieldValue | string | null;
  lastReadAt?: FirebaseFirestore.FieldValue | string | null;
}): Record<string, unknown> {
  return {
    projectionVersion: 1,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...(params.unreadCount !== undefined ? { unreadCount: params.unreadCount } : {}),
    ...(params.latestNotificationAt !== undefined
      ? { latestNotificationAt: params.latestNotificationAt }
      : {}),
    ...(params.lastReadAt !== undefined ? { lastReadAt: params.lastReadAt } : {}),
  };
}

export async function readNotificationSummary(uid: string): Promise<{
  unreadCount: number;
  latestNotificationAt: string | null;
  lastReadAt: string | null;
}> {
  const snap = await notificationSummaryRef(uid).get();
  const data = snap.exists ? (snap.data() || {}) : {};
  const unreadCount =
    typeof data.unreadCount === "number" && Number.isFinite(data.unreadCount)
      ? Math.max(0, Math.trunc(data.unreadCount))
      : 0;
  return {
    unreadCount,
    latestNotificationAt: toIso(data.latestNotificationAt),
    lastReadAt: toIso(data.lastReadAt),
  };
}
