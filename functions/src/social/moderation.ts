import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";

const db = admin.firestore();

/**
 * applyModerationAction
 * Authority: POST_MODERATION_V1
 * Enforces: Admin-only triggers, immutable audit logging, and visibility effects.
 */
export const applyModerationAction = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
    
    const isAdmin = request.auth.token.admin === true || request.auth.token.role === 'superadmin' || request.auth.token.role === 'moderator';
    if (!isAdmin) throw new HttpsError("permission-denied", "Authority refused.");

    const { postId, action, reportId, note } = request.data;
    
    // Actions: dismiss, hide, restrict, soft_delete, hard_delete
    const VALID_ACTIONS = ["dismiss", "hide", "restrict", "soft_delete", "hard_delete"];
    
    if (!postId || !VALID_ACTIONS.includes(action)) {
        throw new HttpsError("invalid-argument", "Invalid postId or moderation action.");
    }

    const postRef = db.collection('posts').doc(postId);
    const now = admin.firestore.FieldValue.serverTimestamp();

    try {
        await db.runTransaction(async (transaction) => {
            const postSnap = await transaction.get(postRef);
            if (!postSnap.exists && action !== 'hard_delete') {
                throw new HttpsError("not-found", "Post not found.");
            }
            
            const post = postSnap.data();
            const updates: any = { 'timestamps.updatedAt': now };

            // Visibility Effects Mapping
            if (action === "hide") {
                updates.visibility = "private"; // removed_from_feeds
            } else if (action === "restrict") {
                updates.visibility = "restricted"; // limited_distribution
            } else if (action === "soft_delete") {
                updates.status = "deleted"; // author_visible_only per normalization
                updates['timestamps.deletedAt'] = now;
            } else if (action === "hard_delete") {
                transaction.delete(postRef);
            }

            if (action !== 'hard_delete' && action !== 'dismiss') {
                transaction.update(postRef, updates);
            }

            // Update Report State
            if (reportId) {
                transaction.update(db.collection('admin_reports').doc(reportId), {
                    status: action === 'dismiss' ? 'dismissed' : 'action_taken',
                    resolution: action,
                    resolvedBy: request.auth?.uid,
                    resolvedAt: now
                });
            }

            // IMMUTABLE AUDIT LOG (POST_MODERATION_V1)
            const auditRef = db.collection('moderation_log').doc();
            transaction.set(auditRef, {
                action,
                postId,
                authorId: post?.authorId || 'unknown',
                moderatorId: request.auth?.uid,
                note: note || '',
                timestamp: now,
                version: "1.0"
            });
        });

        return { success: true };
    } catch (error: any) {
        logger.error(`[MODERATION][ACTION_ERROR] ${error.message}`);
        throw new HttpsError("internal", "Action failed.");
    }
});

/**
 * transitionModerationStage
 * Helper for UI flow to move reports into review.
 */
export const transitionModerationStage = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
    const isAdmin = request.auth.token.admin === true || request.auth.token.role === 'superadmin' || request.auth.token.role === 'moderator';
    if (!isAdmin) throw new HttpsError("permission-denied", "Authority refused.");

    const { reportId, nextStage } = request.data;
    if (!reportId || !['under_review', 'action_taken', 'dismissed'].includes(nextStage)) {
        throw new HttpsError("invalid-argument", "Invalid stage transition.");
    }

    await db.collection('admin_reports').doc(reportId).update({
        status: nextStage,
        moderatorId: request.auth.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true };
});