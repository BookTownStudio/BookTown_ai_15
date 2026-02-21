import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import {
    assertActiveAuthenticatedUser,
    getRoleFromClaims,
} from "../shared/auth";

const RESTORE_WINDOW_HOURS = 72; // Spec: restoreWindowHours: 72

/**
 * deleteSocialPost
 * Authority: POST_DELETION_POLICY_V1 (LOCKED)
 * Modes: soft (reversible), hard (permanent).
 */
export const deleteSocialPost = onCall({ cors: true }, async (request) => {
    const caller = await assertActiveAuthenticatedUser(request.auth);

    const { postId, type = 'soft', reportId } = request.data as {
        postId?: string;
        type?: 'soft' | 'hard';
        reportId?: string;
    };
    const uid = caller.uid;
    const role = getRoleFromClaims(caller);
    const isModerator = role === "moderator" || role === "superadmin";

    if (!postId) {
        throw new HttpsError("invalid-argument", "postId required.");
    }

    const db = admin.firestore();
    const postRef = db.collection('posts').doc(postId);

    try {
        const result = await db.runTransaction(async (transaction) => {
            const snap = await transaction.get(postRef);
            // FIX: Replaced 'action' with 'type' and checked for 'hard' deletion mode to resolve the "Cannot find name 'action'" error.
            if (!snap.exists && type !== 'hard') {
                throw new HttpsError("not-found", "POST_NOT_FOUND");
            }

            const post = snap.data();
            const isOwner = post?.authorId === uid;

            // 1. Authorization Authority (Spec Enforcement)
            if (type === 'soft' && !isOwner && !isModerator) {
                throw new HttpsError("permission-denied", "POST_DELETE_FORBIDDEN");
            }
            
            if (type === 'hard' && !isModerator) {
                throw new HttpsError("permission-denied", "POST_DELETE_FORBIDDEN: Hard delete restricted to moderators.");
            }
            if (type === 'hard' && (!reportId || typeof reportId !== "string")) {
                throw new HttpsError("invalid-argument", "reportId is required for hard delete.");
            }

            const now = admin.firestore.Timestamp.now();

            if (type === 'soft') {
                // POST_DELETION_POLICY_V1: isDeleted: true, deletedAt, deletedBy
                transaction.update(postRef, {
                    status: 'deleted',
                    isDeleted: true,
                    deletedBy: uid,
                    'timestamps.deletedAt': now,
                    'timestamps.updatedAt': now
                });

                // Audit Log
                const auditRef = db.collection('activity_log').doc();
                transaction.set(auditRef, {
                    verb: 'post_deleted',
                    actor: { uid, type: 'user' },
                    object: { entity_type: 'post', entity_id: postId },
                    context: { 
                        action: 'soft_delete',
                        target_owner_uid: post?.authorId,
                        visibility: 'restricted'
                    },
                    createdAt: now,
                    version: "1.0"
                });

                return { success: true, mode: 'soft' };
            } 
            
            if (type === 'hard') {
                const hardDeleteReportId = reportId as string;
                const reportRef = db.collection('reports').doc(hardDeleteReportId);
                const reportSnap = await transaction.get(reportRef);
                if (!reportSnap.exists) {
                    throw new HttpsError("not-found", "Report not found.");
                }

                const report = (reportSnap.data() || {}) as Record<string, unknown>;
                const reportStatus = typeof report.status === "string" ? report.status : "";
                const reportEntityId = typeof report.entityId === "string" ? report.entityId : "";
                if (reportStatus !== "under_review") {
                    throw new HttpsError("failed-precondition", "Report must be under_review for hard delete.");
                }
                if (reportEntityId !== postId) {
                    throw new HttpsError("failed-precondition", "Report target mismatch for hard delete.");
                }

                // Permanent Cascade: Remove document
                transaction.delete(postRef);
                transaction.update(reportRef, {
                    status: "action_taken",
                    resolution: "hard_delete",
                    resolvedBy: uid,
                    resolvedAt: now,
                });

                // In a production environment, this would trigger a cleanup function for storage assets
                const auditRef = db.collection('activity_log').doc();
                transaction.set(auditRef, {
                    verb: 'post_deleted',
                    actor: { uid, type: 'user' },
                    object: { entity_type: 'post', entity_id: postId },
                    context: { 
                        action: 'hard_delete',
                        target_owner_uid: post?.authorId,
                        visibility: 'hidden'
                    },
                    createdAt: now,
                    version: "1.0"
                });

                return { success: true, mode: 'hard' };
            }

            throw new HttpsError("invalid-argument", "Invalid deletion type.");
        });

        return result;
    } catch (error: any) {
        if (error instanceof HttpsError) throw error;
        logger.error(`[SOCIAL][DELETE_FAILURE] ${error.message}`, { error });
        throw new HttpsError("internal", "Server-side deletion process failed.");
    }
});

/**
 * restoreSocialPost
 * Reversal logic for soft-deleted posts within the 72-hour window.
 */
export const restoreSocialPost = onCall({ cors: true }, async (request) => {
    const caller = await assertActiveAuthenticatedUser(request.auth);

    const { postId } = request.data;
    const uid = caller.uid;

    const db = admin.firestore();
    const postRef = db.collection('posts').doc(postId);

    try {
        return await db.runTransaction(async (transaction) => {
            const snap = await transaction.get(postRef);
            if (!snap.exists) throw new HttpsError("not-found", "POST_NOT_FOUND");

            const post = snap.data()!;
            if (post.authorId !== uid) throw new HttpsError("permission-denied", "POST_RESTORE_FORBIDDEN");
            if (!post.isDeleted) throw new HttpsError("failed-precondition", "Post is not deleted.");

            const deletedAt = post.timestamps?.deletedAt as admin.firestore.Timestamp;
            const now = admin.firestore.Timestamp.now();
            const elapsedHours = (now.seconds - deletedAt.seconds) / 3600;

            if (elapsedHours > RESTORE_WINDOW_HOURS) {
                throw new HttpsError("failed-precondition", "POST_DELETE_WINDOW_EXCEEDED: Restore window (72h) has expired.");
            }

            transaction.update(postRef, {
                status: 'published',
                isDeleted: false,
                deletedBy: null,
                'timestamps.deletedAt': null,
                'timestamps.updatedAt': now
            });

            return { success: true };
        });
    } catch (error: any) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "Restoration failed.");
    }
});
