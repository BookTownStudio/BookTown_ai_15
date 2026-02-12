import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";

const RESTORE_WINDOW_HOURS = 72; // Spec: restoreWindowHours: 72

/**
 * deleteSocialPost
 * Authority: POST_DELETION_POLICY_V1 (LOCKED)
 * Modes: soft (reversible), hard (permanent).
 */
export const deleteSocialPost = onCall({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Auth required.");
    }

    const { postId, type = 'soft' } = request.data;
    const uid = request.auth.uid;
    const isAdmin = request.auth.token.admin === true || request.auth.token.role === 'superadmin';
    const isModerator = isAdmin || request.auth.token.role === 'superuser' || request.auth.token.role === 'moderator';

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
            
            if (type === 'hard' && !isModerator && !isAdmin) {
                throw new HttpsError("permission-denied", "POST_DELETE_FORBIDDEN: Hard delete restricted to moderators.");
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
                // Permanent Cascade: Remove document
                transaction.delete(postRef);

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
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");

    const { postId } = request.data;
    const uid = request.auth.uid;

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