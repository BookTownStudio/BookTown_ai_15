import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";

const db = admin.firestore();

/**
 * reportSocialPost
 * Authority: POST_REPORTING_POLICY_V1 (LOCKED)
 * Enforces: Rate limits, canonical reason validation, and auto-hide logic.
 */
export const reportSocialPost = onCall({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Authentication required to report content.");
    }

    const { postId, authorId, reason, details } = request.data;
    const uid = request.auth.uid;

    if (!postId || !authorId || !reason) {
        throw new HttpsError("invalid-argument", "Missing required fields.");
    }

    // 1. Forbidden Behavior: Reporting own post
    if (uid === authorId) {
        throw new HttpsError("failed-precondition", "POST_REPORT_FORBIDDEN: You cannot report your own content.");
    }

    // 2. Canonical Report Type Validation (POST_REPORTING_POLICY_V1)
    const CANONICAL_REASONS = ["spam", "harassment", "hate_speech", "copyright", "misinformation", "other"];
    if (!CANONICAL_REASONS.includes(reason.toLowerCase())) {
        throw new HttpsError("invalid-argument", "INVALID_REPORT_TYPE: Reason must be one of " + CANONICAL_REASONS.join(", "));
    }

    const now = admin.firestore.Timestamp.now();
    const dayAgo = admin.firestore.Timestamp.fromMillis(now.toMillis() - 24 * 60 * 60 * 1000);

    try {
        return await db.runTransaction(async (transaction) => {
            // 3. Rate Limit Enforcement: Max 10 per day
            const userReportsSnap = await transaction.get(
                db.collection('reports')
                    .where('reportedByUid', '==', uid)
                    .where('createdAt', '>', dayAgo)
            );

            if (userReportsSnap.size >= 10) {
                throw new HttpsError("resource-exhausted", "REPORT_LIMIT_EXCEADY: You can only submit 10 reports per 24 hours.");
            }

            // 4. Deduplication: One report per user per post
            const existingReportRef = db.collection('reports').doc(`${uid}_${postId}`);
            const existingSnap = await transaction.get(existingReportRef);
            if (existingSnap.exists) {
                return { success: true, alreadyReported: true };
            }

            // 5. Create Report Entry
            transaction.set(existingReportRef, {
                entityType: 'post',
                entityId: postId,
                reportedByUid: uid,
                postAuthorId: authorId,
                reason: reason.toLowerCase(),
                details: details || "",
                status: 'open',
                createdAt: now,
                updatedAt: now,
                version: "1.2"
            });

            // 6. Check Auto-Hide Threshold (POST_REPORTING_POLICY_V1: threshold 5)
            const postReportsSnap = await transaction.get(
                db.collection('reports').where('entityId', '==', postId)
            );
            
            // Note: +1 for the one we are currently adding
            if (postReportsSnap.size + 1 >= 5) {
                const postRef = db.collection('posts').doc(postId);
                transaction.update(postRef, {
                    visibility: 'restricted',
                    'moderation.autoHidden': true,
                    'moderation.hiddenAt': now
                });
                logger.info(`[MODERATION][AUTO_HIDE] Post ${postId} hidden after reaching report threshold.`);
            }

            // 7. Audit Logging
            const activityRef = db.collection('activity_log').doc();
            transaction.set(activityRef, {
                verb: 'post_reported',
                actor: { uid, type: 'user' },
                object: { entity_type: 'post', entity_id: postId },
                context: { target_owner_uid: authorId, reason: reason.toLowerCase() },
                createdAt: now,
                version: "1.2"
            });

            return { success: true };
        });

    } catch (error: any) {
        if (error instanceof HttpsError) throw error;
        logger.error(`[MODERATION][REPORT_ERROR] ${error.message}`);
        throw new HttpsError("internal", "Failed to process report.");
    }
});