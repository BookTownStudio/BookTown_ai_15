import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { z, parseInput } from "../shared/validation";

const db = admin.firestore();

const incrementPostViewSchema = z
  .object({
    postId: z.string().trim().min(1).max(190),
  })
  .strict();

/**
 * incrementPostView
 * Authority: POST_ANALYTICS_V1 (LOCKED)
 * Purpose: Safe, low-latency increment of view counts and reach tracking.
 * Reach Policy: Unique viewers tracked via subcollection for deduplication.
 */
export const incrementPostView = onCall({ cors: true }, async (request) => {
    const { postId } = parseInput(incrementPostViewSchema, request.data);
    const uid = request.auth?.uid || null;

    const analyticsRef = db.collection('post_analytics').doc(postId);
    const now = admin.firestore.FieldValue.serverTimestamp();

    try {
        // 1. High-frequency View Increment (Non-Unique)
        await analyticsRef.set({
            views: admin.firestore.FieldValue.increment(1),
            lastUpdatedAt: now
        }, { merge: true });

        // 2. Reach Tracking (Unique Viewers)
        if (uid) {
            const viewerRef = analyticsRef.collection('viewers').doc(uid);
            const viewerSnap = await viewerRef.get();

            if (!viewerSnap.exists) {
                await db.runTransaction(async (transaction) => {
                    transaction.set(viewerRef, { timestamp: now });
                    transaction.update(analyticsRef, {
                        unique_viewers: admin.firestore.FieldValue.increment(1)
                    });
                });
            }
        }

        return { success: true };
    } catch (error: any) {
        logger.error(`[ANALYTICS][VIEW_FAIL] ${error.message}`);
        throw new HttpsError("internal", "Failed to track view.");
    }
});
