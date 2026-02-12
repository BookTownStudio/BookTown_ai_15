import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";

const db = admin.firestore();

/**
 * syncActivityToAnalytics
 * Trigger: onCreate(activity_log/{id})
 * Authority: POST_ANALYTICS_V1 incremental updates.
 */
export const syncActivityToAnalytics = onDocumentCreated("activity_log/{activityId}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    const activity = snap.data();

    // Only process post-related metrics
    if (activity.object.entity_type !== 'post') return;

    const postId = activity.object.entity_id;
    const analyticsRef = db.collection('post_analytics').doc(postId);
    const now = admin.firestore.FieldValue.serverTimestamp();

    let field: string | null = null;
    switch (activity.verb) {
        case 'post_liked': field = 'likes'; break;
        case 'post_commented': field = 'comments_count'; break;
        case 'post_reposted': field = 'reposts'; break;
        case 'post_bookmarked': field = 'bookmarks'; break;
    }

    if (!field) return;

    try {
        await analyticsRef.set({
            [field]: admin.firestore.FieldValue.increment(1),
            lastUpdatedAt: now
        }, { merge: true });
        logger.info(`[ANALYTICS][SYNC] Incremented ${field} for post ${postId}`);
    } catch (error) {
        logger.error(`[ANALYTICS][SYNC_ERROR] Post ${postId}:`, error);
    }
});