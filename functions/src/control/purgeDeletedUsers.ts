import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { admin } from "../firebaseAdmin";

const db = admin.firestore();
const auth = admin.auth();

const USERS_COLLECTION = "users";
const RETENTION_DAYS = 30;
const PURGE_BATCH_LIMIT = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

function getPurgeCutoff(): FirebaseFirestore.Timestamp {
  return admin.firestore.Timestamp.fromMillis(Date.now() - RETENTION_DAYS * DAY_MS);
}

function isAuthUserNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "auth/user-not-found";
}

export const purgeDeletedUsers = onSchedule("every 24 hours", async () => {
  const cutoff = getPurgeCutoff();
  const candidatesSnap = await db
    .collection(USERS_COLLECTION)
    .where("deletedAt", "<=", cutoff)
    .orderBy("deletedAt", "asc")
    .limit(PURGE_BATCH_LIMIT)
    .get();

  if (candidatesSnap.empty) {
    logger.info("[CONTROL][PURGE] No deleted users eligible for purge.");
    return;
  }

  let purgedCount = 0;
  let missingAuthCount = 0;

  for (const userDoc of candidatesSnap.docs) {
    const uid = userDoc.id;
    const status = userDoc.get("status");
    if (status !== "deleted") {
      continue;
    }

    await db
      .collection(USERS_COLLECTION)
      .doc(uid)
      .set(
        {
          email: null,
          displayName: null,
          name: null,
          avatarUrl: null,
          bannerUrl: null,
          bioEn: null,
          bioAr: null,
          anonymized: true,
          purgedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    try {
      await auth.deleteUser(uid);
    } catch (error) {
      if (isAuthUserNotFound(error)) {
        missingAuthCount += 1;
      } else {
        throw error;
      }
    }

    purgedCount += 1;
  }

  logger.info("[CONTROL][PURGE] Completed deleted user purge batch.", {
    cutoffIso: cutoff.toDate().toISOString(),
    processed: candidatesSnap.size,
    purgedCount,
    missingAuthCount,
    batchLimit: PURGE_BATCH_LIMIT,
  });
});
