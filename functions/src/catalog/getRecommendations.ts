import { onCall } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import { isPublicReadableBook } from "./catalogBookView";

const db = admin.firestore();
const RECOMMENDATION_LIMIT = 20;
const TRENDING_FETCH_LIMIT = 80;

export const getRecommendations = onCall({ cors: true }, async () => {
  const snap = await db
    .collection("books")
    .orderBy("rating", "desc")
    .limit(TRENDING_FETCH_LIMIT)
    .get();

  const bookIds = snap.docs
    .filter((doc) => isPublicReadableBook((doc.data() || {}) as Record<string, unknown>))
    .map((doc) => doc.id)
    .slice(0, RECOMMENDATION_LIMIT);

  return {
    bookIds,
  };
});
