import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { assertActiveAuthenticatedUser } from "../shared/auth";

const db = admin.firestore();

/**
 * reportSocialPost
 * Authority: POST_REPORTING_POLICY_V1 (LOCKED)
 * Enforces: Rate limits, canonical reason validation, and auto-hide logic.
 */
export const reportSocialPost = onCall({ cors: true }, async (request) => {
    const caller = await assertActiveAuthenticatedUser(request.auth);

    const { postId, reason, details } = request.data as {
        postId?: string;
        reason?: string;
        details?: string;
    };
    const uid = caller.uid;

    if (!postId || !reason) {
        throw new HttpsError("invalid-argument", "Missing required fields.");
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
            const postRef = db.collection('posts').doc(postId);
            const postSnap = await transaction.get(postRef);
            if (!postSnap.exists) {
                throw new HttpsError("not-found", "Post not found.");
            }
            const post = postSnap.data() || {};
            const authorId =
                typeof post.authorId === "string" && post.authorId.trim()
                    ? post.authorId.trim()
                    : null;

            if (!authorId) {
                throw new HttpsError("failed-precondition", "Post author is missing.");
            }

            // 1. Forbidden Behavior: Reporting own post
            if (uid === authorId) {
                throw new HttpsError("failed-precondition", "POST_REPORT_FORBIDDEN: You cannot report your own content.");
            }

            // 3. Rate Limit Enforcement: Max 10 per day
            const userReportsSnap = await transaction.get(
                db.collection('reports')
                    .where('reportedByUid', '==', uid)
                    .where('createdAt', '>', dayAgo)
            );

            if (userReportsSnap.size >= 10) {
                throw new HttpsError("resource-exhausted", "REPORT_LIMIT_EXCEEDED: You can only submit 10 reports per 24 hours.");
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

/**
 * reportSocialComment
 * Authority: POST_REPORTING_POLICY_V1 (comments)
 * Enforces: rate limit, dedupe and server-derived target ownership.
 */
export const reportSocialComment = onCall({ cors: true }, async (request) => {
    const caller = await assertActiveAuthenticatedUser(request.auth);

    const { postId, commentId, reason, note } = request.data as {
        postId?: string;
        commentId?: string;
        reason?: string;
        note?: string;
    };
    const uid = caller.uid;

    if (!postId || !commentId || !reason) {
        throw new HttpsError("invalid-argument", "Missing required fields.");
    }

    const CANONICAL_REASONS = ["spam", "harassment", "hate_speech", "copyright", "misinformation", "other"];
    if (!CANONICAL_REASONS.includes(reason.toLowerCase())) {
        throw new HttpsError("invalid-argument", "INVALID_REPORT_TYPE: Reason must be one of " + CANONICAL_REASONS.join(", "));
    }

    const now = admin.firestore.Timestamp.now();
    const dayAgo = admin.firestore.Timestamp.fromMillis(now.toMillis() - 24 * 60 * 60 * 1000);

    try {
        return await db.runTransaction(async (transaction) => {
            const commentRef = db.collection('posts').doc(postId).collection('comments').doc(commentId);
            const commentSnap = await transaction.get(commentRef);
            if (!commentSnap.exists) {
                throw new HttpsError("not-found", "Comment not found.");
            }

            const comment = commentSnap.data() || {};
            const authorId =
                typeof comment.authorId === "string" && comment.authorId.trim()
                    ? comment.authorId.trim()
                    : null;

            if (!authorId) {
                throw new HttpsError("failed-precondition", "Comment author is missing.");
            }

            if (uid === authorId) {
                throw new HttpsError("failed-precondition", "COMMENT_REPORT_FORBIDDEN: You cannot report your own content.");
            }

            const userReportsSnap = await transaction.get(
                db.collection('reports')
                    .where('reportedByUid', '==', uid)
                    .where('createdAt', '>', dayAgo)
            );
            if (userReportsSnap.size >= 10) {
                throw new HttpsError("resource-exhausted", "REPORT_LIMIT_EXCEEDED: You can only submit 10 reports per 24 hours.");
            }

            const reportId = `${uid}_${postId}_${commentId}`;
            const reportRef = db.collection('reports').doc(reportId);
            const existingSnap = await transaction.get(reportRef);
            if (existingSnap.exists) {
                return { success: true, alreadyReported: true };
            }

            transaction.set(reportRef, {
                entityType: 'comment',
                entityId: commentId,
                postId,
                reportedByUid: uid,
                authorId,
                reason: reason.toLowerCase(),
                details: typeof note === "string" ? note.trim() : "",
                status: 'open',
                createdAt: now,
                updatedAt: now,
                version: "1.0"
            });

            const activityRef = db.collection('activity_log').doc();
            transaction.set(activityRef, {
                verb: 'comment_reported',
                actor: { uid, type: 'user' },
                object: { entity_type: 'comment', entity_id: commentId },
                context: { target_owner_uid: authorId, reason: reason.toLowerCase(), postId },
                createdAt: now,
                version: "1.0"
            });

            return { success: true };
        });
    } catch (error: any) {
        if (error instanceof HttpsError) throw error;
        logger.error(`[MODERATION][COMMENT_REPORT_ERROR] ${error.message}`);
        throw new HttpsError("internal", "Failed to process report.");
    }
});
