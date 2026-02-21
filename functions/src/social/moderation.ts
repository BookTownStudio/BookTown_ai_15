import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import {
    assertActiveAuthenticatedUser,
    assertRoleFromClaims,
} from "../shared/auth";

const db = admin.firestore();

/**
 * applyModerationAction
 * Authority: POST_MODERATION_V1
 * Enforces: Admin-only triggers, immutable audit logging, and visibility effects.
 */
export const applyModerationAction = onCall({ cors: true }, async (request) => {
    const caller = await assertActiveAuthenticatedUser(request.auth);
    const { uid } = assertRoleFromClaims(caller, ["moderator", "superadmin"]);

    const { postId, action, reportId, note } = request.data;
    
    // Actions: dismiss, hide, restrict, soft_delete, hard_delete
    const VALID_ACTIONS = ["dismiss", "hide", "restrict", "soft_delete", "hard_delete"];
    
    if (!postId || !VALID_ACTIONS.includes(action)) {
        throw new HttpsError("invalid-argument", "Invalid postId or moderation action.");
    }
    if (action === "hard_delete" && !reportId) {
        throw new HttpsError("invalid-argument", "reportId is required for hard delete.");
    }

    const postRef = db.collection('posts').doc(postId);
    const now = admin.firestore.FieldValue.serverTimestamp();

    try {
        await db.runTransaction(async (transaction) => {
            const postSnap = await transaction.get(postRef);
            if (!postSnap.exists && action !== 'hard_delete') {
                throw new HttpsError("not-found", "Post not found.");
            }

            if (reportId) {
                const reportRef = db.collection('reports').doc(reportId);
                const reportSnap = await transaction.get(reportRef);
                if (!reportSnap.exists) {
                    throw new HttpsError("not-found", "Report not found.");
                }

                const reportData = (reportSnap.data() || {}) as Record<string, unknown>;
                const reportEntityType =
                    typeof reportData.entityType === "string" ? reportData.entityType : "";
                const reportEntityId =
                    typeof reportData.entityId === "string" ? reportData.entityId : "";
                const reportStatus =
                    typeof reportData.status === "string" ? reportData.status : "";

                if (reportEntityType !== "post") {
                    throw new HttpsError("failed-precondition", "Report entity type mismatch.");
                }
                if (reportEntityId !== postId) {
                    throw new HttpsError("failed-precondition", "Report target mismatch.");
                }
                if (reportStatus !== "under_review") {
                    throw new HttpsError(
                        "failed-precondition",
                        "Report must be under_review before final action."
                    );
                }
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
                transaction.update(db.collection('reports').doc(reportId), {
                    status: action === 'dismiss' ? 'dismissed' : 'action_taken',
                    resolution: action,
                    resolvedBy: uid,
                    resolvedAt: now
                });
            }

            // IMMUTABLE AUDIT LOG (POST_MODERATION_V1)
            const auditRef = db.collection('moderation_log').doc();
            transaction.set(auditRef, {
                action,
                postId,
                authorId: post?.authorId || 'unknown',
                moderatorId: uid,
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
    const caller = await assertActiveAuthenticatedUser(request.auth);
    const { uid } = assertRoleFromClaims(caller, ["moderator", "superadmin"]);

    const { reportId, nextStage } = request.data;
    if (!reportId || nextStage !== 'under_review') {
        throw new HttpsError("invalid-argument", "Invalid stage transition.");
    }

    await db.runTransaction(async (transaction) => {
        const reportRef = db.collection('reports').doc(reportId);
        const reportSnap = await transaction.get(reportRef);
        if (!reportSnap.exists) {
            throw new HttpsError("not-found", "Report not found.");
        }

        const report = (reportSnap.data() || {}) as Record<string, unknown>;
        const status = typeof report.status === "string" ? report.status : "";
        if (status !== "open") {
            throw new HttpsError("failed-precondition", "Only open reports can enter review.");
        }

        transaction.update(reportRef, {
            status: nextStage,
            moderatorId: uid,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    });

    return { success: true };
});
