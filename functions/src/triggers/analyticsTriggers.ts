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
    const activity = snap.data() as Record<string, unknown>;

    const objectData =
        activity.object && typeof activity.object === "object"
            ? (activity.object as Record<string, unknown>)
            : null;
    if (!objectData) return;
    if (objectData.entity_type !== 'post') return;
    if (typeof objectData.entity_id !== "string" || objectData.entity_id.trim().length === 0) return;

    const postId = objectData.entity_id.trim();
    const analyticsRef = db.collection('post_analytics').doc(postId);
    const now = admin.firestore.FieldValue.serverTimestamp();

    const metricByVerb: Record<string, { field: string; delta: number }> = {
        post_liked: { field: "likes", delta: 1 },
        post_unliked: { field: "likes", delta: -1 },
        post_commented: { field: "comments_count", delta: 1 },
        post_comment_removed: { field: "comments_count", delta: -1 },
        post_reposted: { field: "reposts", delta: 1 },
        post_unreposted: { field: "reposts", delta: -1 },
        post_bookmarked: { field: "bookmarks", delta: 1 },
        post_unbookmarked: { field: "bookmarks", delta: -1 },
    };

    const metric =
        typeof activity.verb === "string" ? metricByVerb[activity.verb] : undefined;
    if (!metric) return;

    try {
        await analyticsRef.set({
            [metric.field]: admin.firestore.FieldValue.increment(metric.delta),
            lastUpdatedAt: now
        }, { merge: true });
        logger.info(`[ANALYTICS][SYNC] Applied ${metric.delta} to ${metric.field} for post ${postId}`);
    } catch (error) {
        logger.error(`[ANALYTICS][SYNC_ERROR] Post ${postId}:`, error);
    }
});
