import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import {
    assertActiveAuthenticatedUser,
    getRoleFromClaims,
} from "../shared/auth";
import { checkUserMutationQuota } from "../utils/mutationQuota";
import { z, parseInput } from "../shared/validation";

const RESTORE_WINDOW_MINUTES = 5;

const deleteSocialPostSchema = z
  .object({
    postId: z.string().trim().min(1).max(190),
    type: z.enum(["soft", "hard"]).optional(),
    reportId: z.string().trim().min(1).max(190).optional(),
  })
  .strict();

const restoreSocialPostSchema = z
  .object({
    postId: z.string().trim().min(1).max(190),
  })
  .strict();

/**
 * deleteSocialPost
 * Authority: POST_DELETION_POLICY_V1 (LOCKED)
 * Modes: soft (reversible), hard (accepted for compatibility, enforced as soft).
 */
export const deleteSocialPost = onCall({ cors: true }, async (request) => {
    const caller = await assertActiveAuthenticatedUser(request.auth);

    const { postId, type = 'soft', reportId } = parseInput(deleteSocialPostSchema, request.data);
    const uid = caller.uid;
    const role = getRoleFromClaims(caller);
    const isModerator = role === "moderator" || role === "superadmin";

    const db = admin.firestore();
    const postRef = db.collection('posts').doc(postId);

    await checkUserMutationQuota(db, uid, "deletePost");

    try {
        const result = await db.runTransaction(async (transaction) => {
            const snap = await transaction.get(postRef);
            if (!snap.exists) {
                throw new HttpsError("not-found", "POST_NOT_FOUND");
            }

            const post = snap.data();
            const isOwner = post?.authorId === uid;
            const requestedType = type === "hard" ? "hard" : "soft";

            // 1. Authorization Authority
            if (!isOwner && !isModerator) {
                throw new HttpsError("permission-denied", "POST_DELETE_FORBIDDEN");
            }

            const now = admin.firestore.Timestamp.now();
            const wasAlreadyDeleted = post?.isDeleted === true || post?.status === "deleted";

            // POST_DELETION_POLICY_V2: always soft delete (retain document)
            if (!wasAlreadyDeleted) {
                transaction.update(postRef, {
                    status: 'deleted',
                    isDeleted: true,
                    deletedBy: uid,
                    deletedAt: now,
                    'timestamps.deletedAt': now,
                    'timestamps.updatedAt': now
                });
            }

            if (typeof reportId === "string" && reportId.trim() && isModerator) {
                const reportRef = db.collection("reports").doc(reportId.trim());
                const reportSnap = await transaction.get(reportRef);
                if (reportSnap.exists) {
                    transaction.update(reportRef, {
                        status: "action_taken",
                        resolution: "soft_delete",
                        resolvedBy: uid,
                        resolvedAt: now,
                    });
                }
            }

            // Audit Log
            const auditRef = db.collection('activity_log').doc();
            transaction.set(auditRef, {
                verb: 'post_deleted',
                actor: { uid, type: 'user' },
                object: { entity_type: 'post', entity_id: postId },
                context: {
                    action: 'soft_delete',
                    requestedType,
                    target_owner_uid: post?.authorId,
                    visibility: 'restricted'
                },
                createdAt: now,
                version: "1.0"
            });

            return { success: true, mode: 'soft' as const };
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
 * Reversal logic for soft-deleted posts within the 5-minute undo window.
 */
export const restoreSocialPost = onCall({ cors: true }, async (request) => {
    const caller = await assertActiveAuthenticatedUser(request.auth);

    const { postId } = parseInput(restoreSocialPostSchema, request.data);
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

            const deletedAt = (post.deletedAt || post.timestamps?.deletedAt) as admin.firestore.Timestamp | undefined;
            if (!deletedAt || typeof deletedAt.seconds !== "number") {
                throw new HttpsError("failed-precondition", "POST_RESTORE_WINDOW_UNAVAILABLE");
            }
            const now = admin.firestore.Timestamp.now();
            const elapsedMinutes = (now.seconds - deletedAt.seconds) / 60;

            if (elapsedMinutes > RESTORE_WINDOW_MINUTES) {
                throw new HttpsError("failed-precondition", "POST_DELETE_WINDOW_EXCEEDED: Restore window (5m) has expired.");
            }

            transaction.update(postRef, {
                status: 'published',
                isDeleted: false,
                deletedBy: null,
                deletedAt: null,
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
