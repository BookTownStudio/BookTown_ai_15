import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";

const db = admin.firestore();

/**
 * incrementPostView
 * Authority: POST_ANALYTICS_V1 (LOCKED)
 * Purpose: Safe, low-latency increment of view counts and reach tracking.
 * Reach Policy: Unique viewers tracked via subcollection for deduplication.
 */
export const incrementPostView = onCall({ cors: true }, async (request) => {
    const { postId } = request.data;
    const uid = request.auth?.uid || null;

    if (!postId) {
        throw new HttpsError("invalid-argument", "postId required.");
    }

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
        return { success: false }; // Silent failure to avoid breaking UI
    }
});