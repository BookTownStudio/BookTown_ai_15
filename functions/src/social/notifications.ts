import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import { assertActiveAuthenticatedUser } from "../shared/auth";
import { z, parseInput } from "../shared/validation";

const db = admin.firestore();
const MARK_ALL_LIMIT = 500;
const BATCH_SIZE = 250;

const markNotificationReadSchema = z
  .object({
    notificationId: z.string().trim().min(1).max(240),
  })
  .strict();

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export const markNotificationRead = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const uid = caller.uid;
  const { notificationId } = parseInput(markNotificationReadSchema, request.data);
  const notificationRef = db.collection("notifications").doc(notificationId);

  let updated = false;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(notificationRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", "Notification not found.");
    }

    const data = snap.data() as Record<string, unknown>;
    if (data.uid !== uid) {
      throw new HttpsError("permission-denied", "Notification does not belong to caller.");
    }

    if (data.read === true) {
      return;
    }

    tx.update(notificationRef, {
      read: true,
      readAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    updated = true;
  });

  return {
    notificationId,
    updated,
  };
});

export const markAllNotificationsRead = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const uid = caller.uid;
  parseInput(z.object({}).strict(), request.data ?? {});

  const snap = await db
    .collection("notifications")
    .where("uid", "==", uid)
    .where("read", "==", false)
    .limit(MARK_ALL_LIMIT)
    .get();

  const docs = snap.docs;
  for (const group of chunk(docs, BATCH_SIZE)) {
    const batch = db.batch();
    group.forEach((docSnap) => {
      batch.update(docSnap.ref, {
        read: true,
        readAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }

  return {
    updatedCount: docs.length,
    complete: docs.length < MARK_ALL_LIMIT,
  };
});
