import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { assertActiveAuthenticatedUser } from "../shared/auth";
import {
    assertViewerCanInteractWithPost,
} from "./postAccess";
import { z, parseInput } from "../shared/validation";

const db = admin.firestore();

const postInteractionSchema = z
  .object({
    postId: z.string().trim().min(1).max(190),
  })
  .strict();

/**
 * likeSocialPost
 * Authority: POST_INTERACTION_V1
 * Effects: Toggles user-centric signal, emits activity log.
 * Counter sync handled by onPostLikeCreated trigger.
 */
export const likeSocialPost = onCall({ cors: true }, async (request) => {
    const caller = await assertActiveAuthenticatedUser(request.auth);
    const { postId } = parseInput(postInteractionSchema, request.data);
    const uid = caller.uid;

    const likeRef = db.collection('users').doc(uid).collection('likes').doc(postId);
    const postRef = db.collection('posts').doc(postId);

    try {
        return await db.runTransaction(async (transaction) => {
            const likeSnap = await transaction.get(likeRef);
            const postSnap = await transaction.get(postRef);

            if (!postSnap.exists) throw new HttpsError("not-found", "Post not found.");
            
            const post = postSnap.data() as Record<string, unknown>;
            const { authorId, visibility } = await assertViewerCanInteractWithPost({
                postId,
                postData: post,
                viewerUid: uid,
                transaction,
            });
            const isLiking = !likeSnap.exists;
            const now = admin.firestore.FieldValue.serverTimestamp();

            if (isLiking) {
                // 1. Create signal
                transaction.set(likeRef, {
                    postId,
                    createdAt: now,
                    version: 1
                });

                // 2. Emit activity (Triggers notification pipeline)
                const activityRef = db.collection('activity_log').doc();
                transaction.set(activityRef, {
                    verb: 'post_liked',
                    actor: { uid, type: 'user' },
                    object: { entity_type: 'post', entity_id: postId },
                    context: { 
                        target_owner_uid: authorId, 
                        visibility,
                    },
                    createdAt: now,
                    version: "1.0"
                });
            } else {
                // Unlike: Removal of signal
                transaction.delete(likeRef);
                
                // Optional: Emit unlike activity for analytics, though not required for core V1
            }

            return { success: true, liked: isLiking };
        });
    } catch (error: any) {
        if (error instanceof HttpsError) throw error;
        logger.error(`[SOCIAL][LIKE_FAIL] ${error.message}`);
        throw new HttpsError("internal", "Interaction failure.");
    }
});

/**
 * repostSocialPost
 * Authority: POST_INTERACTION_V1
 * Enforces: viewer access only, emits activity log.
 */
export const repostSocialPost = onCall({ cors: true }, async (request) => {
    const caller = await assertActiveAuthenticatedUser(request.auth);
    const { postId } = parseInput(postInteractionSchema, request.data);
    const uid = caller.uid;

    const repostRef = db.collection('users').doc(uid).collection('reposts').doc(postId);
    const postRef = db.collection('posts').doc(postId);

    try {
        return await db.runTransaction(async (transaction) => {
            const postSnap = await transaction.get(postRef);
            if (!postSnap.exists) throw new HttpsError("not-found", "Original post missing.");
            
            const post = postSnap.data() as Record<string, unknown>;
            const { authorId, visibility } = await assertViewerCanInteractWithPost({
                postId,
                postData: post,
                viewerUid: uid,
                transaction,
            });
            
            const repostSnap = await transaction.get(repostRef);
            const isReposting = !repostSnap.exists;
            const now = admin.firestore.FieldValue.serverTimestamp();

            if (isReposting) {
                transaction.set(repostRef, {
                    originalPostId: postId,
                    createdAt: now,
                    version: 1
                });

                // Emit activity
                const activityRef = db.collection('activity_log').doc();
                transaction.set(activityRef, {
                    verb: 'post_reposted',
                    actor: { uid, type: 'user' },
                    object: { entity_type: 'post', entity_id: postId },
                    context: { 
                        target_owner_uid: authorId, 
                        visibility,
                    },
                    createdAt: now,
                    version: "1.0"
                });
            } else {
                transaction.delete(repostRef);
            }

            return { success: true, reposted: isReposting };
        });
    } catch (error: any) {
        if (error instanceof HttpsError) throw error;
        logger.error(`[SOCIAL][REPOST_FAIL] ${error.message}`);
        throw new HttpsError("internal", "Repost process failed.");
    }
});
