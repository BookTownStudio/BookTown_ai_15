import { HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";

const SEARCH_REQUEST_LIMIT = 60;
const SEARCH_REQUEST_WINDOW_MS = 60 * 1000;
const SEARCH_REQUEST_ACTION = "book_search";

export async function enforceSearchRequestQuota(params: {
  db: FirebaseFirestore.Firestore;
  actorKey: string;
  nowMs?: number;
}): Promise<void> {
  const actorKey = typeof params.actorKey === "string" ? params.actorKey.trim() : "";
  if (!actorKey) {
    throw new HttpsError("invalid-argument", "Missing search quota actor key.");
  }

  const nowMs = Number.isFinite(params.nowMs) ? Math.trunc(params.nowMs!) : Date.now();
  const windowStartMs = nowMs - (nowMs % SEARCH_REQUEST_WINDOW_MS);
  const windowEndMs = windowStartMs + SEARCH_REQUEST_WINDOW_MS;
  const logRef = params.db
    .collection("_request_quota")
    .doc(`${SEARCH_REQUEST_ACTION}_${actorKey}_${windowStartMs}`);

  await params.db.runTransaction(async (transaction) => {
    const logSnap = await transaction.get(logRef);
    const countRaw = logSnap.exists ? (logSnap.data()?.count as unknown) : 0;
    const count =
      typeof countRaw === "number" && Number.isFinite(countRaw)
        ? Math.max(0, Math.trunc(countRaw))
        : 0;

    if (count >= SEARCH_REQUEST_LIMIT) {
      const retryAfterSeconds = Math.max(1, Math.ceil((windowEndMs - nowMs) / 1000));
      throw new HttpsError(
        "resource-exhausted",
        "BOOK_SEARCH_RATE_LIMIT_EXCEEDED",
        {
          limit: SEARCH_REQUEST_LIMIT,
          windowMs: SEARCH_REQUEST_WINDOW_MS,
          retryAfterSeconds,
        }
      );
    }

    const nowTs = admin.firestore.Timestamp.now();
    transaction.set(
      logRef,
      {
        actionType: SEARCH_REQUEST_ACTION,
        actorKey,
        count: count + 1,
        limit: SEARCH_REQUEST_LIMIT,
        windowMs: SEARCH_REQUEST_WINDOW_MS,
        windowStartMs,
        windowEndMs,
        updatedAt: nowTs,
        ...(logSnap.exists ? {} : { createdAt: nowTs }),
      },
      { merge: true }
    );
  });
}
