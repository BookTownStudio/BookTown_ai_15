import { admin } from "../firebaseAdmin";
import { computeProfileCompletionScore, PCS_VERSION } from "./profileCompletion";
import * as logger from "firebase-functions/logger";

const db = admin.firestore();

/**
 * recomputeUserStats
 * ------------------------------------------------
 * Authoritative orchestrator for derived user metadata.
 * Fetches identity and counter signals to persist versioned score.
 */
export async function recomputeUserStats(uid: string): Promise<void> {
  if (!uid) return;

  try {
    const [userSnap, statsSnap] = await Promise.all([
      db.collection("users").doc(uid).get(),
      db.collection("user_stats").doc(uid).get()
    ]);

    if (!userSnap.exists) {
      logger.warn(`[STATS][RECOMPUTE] Aborting: User ${uid} doc missing.`);
      return;
    }

    const user = userSnap.data();
    const stats = statsSnap.data() || {};
    const counters = stats.counters || {};

    const score = computeProfileCompletionScore({
      hasAvatar: !!user?.avatarUrl,
      hasBio: !!(user?.bioEn || user?.bioAr),
      shelvesCreated: counters.totalShelves || 0,
      posts: counters.posts || 0,
      reviews: counters.reviews || 0,
      booksRead: counters.booksRead || 0,
      wordsWritten: counters.wordsWritten || 0
    });

    await db.collection("user_stats").doc(uid).set({
      profileCompletionScore: score,
      pcsVersion: PCS_VERSION,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    logger.info(`[STATS][RECOMPUTE] Score updated for ${uid}: ${score}%`);
  } catch (error) {
    logger.error(`[STATS][RECOMPUTE_FAILED] User ${uid}:`, error);
  }
}