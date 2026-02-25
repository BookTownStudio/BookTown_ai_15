import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import {
    assertActiveAuthenticatedUser,
    getRoleFromClaims,
} from "../shared/auth";
import { assertViewerCanInteractWithPost } from "./postAccess";

const db = admin.firestore();
const COMMENT_EDIT_WINDOW_MINUTES = 15;

/**
 * addSocialComment
 * Authority: POST_INTERACTION_V1
 * Effects: Creates comment, emits activity log.
 */
export const addSocialComment = onCall({ cors: true }, async (request) => {
    const caller = await assertActiveAuthenticatedUser(request.auth);
    
    const { postId, text, parentId } = request.data as {
        postId?: string;
        text?: string;
        parentId?: string;
    };
    const normalizedParentId =
        typeof parentId === "string" && parentId.trim().length > 0
            ? parentId.trim()
            : null;
    const uid = caller.uid;
    const email = typeof caller.token.email === "string" ? caller.token.email : "";

    if (!postId || !text || !text.trim()) {
        throw new HttpsError("invalid-argument", "Missing text.");
    }
    if (normalizedParentId && (normalizedParentId.includes("/") || normalizedParentId.length > 128)) {
        throw new HttpsError("invalid-argument", "INVALID_PARENT_COMMENT_ID");
    }

    const postRef = db.collection('posts').doc(postId);
    const commentId = `c_${Date.now()}_${uid.substring(0, 5)}`;
    const commentRef = postRef.collection('comments').doc(commentId);
    
    const now = admin.firestore.FieldValue.serverTimestamp();

    try {
        await db.runTransaction(async (transaction) => {
            const postSnap = await transaction.get(postRef);
            if (!postSnap.exists) throw new HttpsError("not-found", "Post not found.");
            
            const post = postSnap.data() as Record<string, unknown>;
            const { authorId, visibility } = await assertViewerCanInteractWithPost({
                postId,
                postData: post,
                viewerUid: uid,
                transaction,
            });

            if (normalizedParentId) {
                const parentRef = postRef.collection("comments").doc(normalizedParentId);
                const parentSnap = await transaction.get(parentRef);
                if (!parentSnap.exists) {
                    throw new HttpsError("invalid-argument", "PARENT_COMMENT_NOT_FOUND");
                }
                const parent = parentSnap.data() as Record<string, unknown>;
                if (
                    typeof parent.status === "string" &&
                    parent.status.trim().toLowerCase() !== "published"
                ) {
                    throw new HttpsError(
                        "failed-precondition",
                        "PARENT_COMMENT_NOT_REPLYABLE"
                    );
                }
            }

            // 1. Create comment
            transaction.set(commentRef, {
                authorId: uid,
                authorName: caller.token?.name || email.split('@')[0] || "Anonymous",
                authorHandle: `@${email.split('@')[0] || 'user'}`,
                authorAvatar: caller.token?.picture || `https://api.dicebear.com/8.x/lorelei/svg?seed=${uid}`,
                text: text.trim(),
                timestamp: now,
                parentId: normalizedParentId,
                likesCount: 0,
                status: 'published',
                version: 1
            });

            // 2. Emit activity log (POST_INTERACTION_V1 requirement)
            const activityRef = db.collection('activity_log').doc();
            transaction.set(activityRef, {
                verb: 'post_commented',
                actor: { uid, type: 'user' },
                object: { entity_type: 'post', entity_id: postId },
                context: { 
                    target_owner_uid: authorId, 
                    visibility,
                    commentId: commentId
                },
                createdAt: now,
                version: "1.0"
            });
        });

        return { success: true, commentId };
    } catch (error: any) {
        if (error instanceof HttpsError) throw error;
        logger.error(`[SOCIAL][COMMENT_ADD_FAIL] ${error.message}`);
        throw new HttpsError("internal", "Comment failure.");
    }
});

/**
 * editSocialComment
 */
export const editSocialComment = onCall({ cors: true }, async (request) => {
    const caller = await assertActiveAuthenticatedUser(request.auth);
    
    const { postId, commentId, text } = request.data as {
        postId?: string;
        commentId?: string;
        text?: string;
    };
    const uid = caller.uid;

    if (!postId || !commentId || !text) {
        throw new HttpsError("invalid-argument", "Missing required fields.");
    }

    const postRef = db.collection("posts").doc(postId);
    const commentRef = postRef.collection('comments').doc(commentId);

    try {
        return await db.runTransaction(async (transaction) => {
            const [postSnap, snap] = await Promise.all([
                transaction.get(postRef),
                transaction.get(commentRef),
            ]);
            if (!postSnap.exists) throw new HttpsError("not-found", "Post not found.");
            await assertViewerCanInteractWithPost({
                postId,
                postData: postSnap.data() as Record<string, unknown>,
                viewerUid: uid,
                transaction,
            });

            if (!snap.exists) throw new HttpsError("not-found", "Comment not found.");

            const comment = snap.data()!;
            if (comment.authorId !== uid) {
                throw new HttpsError("permission-denied", "Unauthorized edit attempt.");
            }

            // Window enforcement
            const createdAt =
                comment.timestamp instanceof admin.firestore.Timestamp
                    ? comment.timestamp
                    : comment.createdAt instanceof admin.firestore.Timestamp
                        ? comment.createdAt
                        : null;
            if (!createdAt) {
                throw new HttpsError("failed-precondition", "COMMENT_EDIT_WINDOW_EXCEEDED: Comment timestamp unavailable.");
            }
            const now = admin.firestore.Timestamp.now();
            const diffMs = now.toMillis() - createdAt.toMillis();
            
            if (diffMs > (COMMENT_EDIT_WINDOW_MINUTES * 60 * 1000)) {
                throw new HttpsError("failed-precondition", "COMMENT_EDIT_WINDOW_EXCEEDED: Edits only allowed within 15 mins.");
            }

            transaction.update(commentRef, {
                text: text.trim(),
                edited: true,
                updatedAt: now
            });

            return { success: true };
        });
    } catch (error: any) {
        if (error instanceof HttpsError) throw error;
        logger.error(`[SOCIAL][COMMENT_EDIT_FAIL] ${error.message}`);
        throw new HttpsError("internal", "Failed to update comment.");
    }
});

/**
 * deleteSocialComment
 */
export const deleteSocialComment = onCall({ cors: true }, async (request) => {
    const caller = await assertActiveAuthenticatedUser(request.auth);

    const { postId, commentId } = request.data as {
        postId?: string;
        commentId?: string;
    };
    if (!postId || !commentId) {
        throw new HttpsError("invalid-argument", "postId and commentId are required.");
    }
    const uid = caller.uid;
    const role = getRoleFromClaims(caller);
    const isModerator = role === "moderator" || role === "superadmin";

    const postRef = db.collection("posts").doc(postId);
    const commentRef = postRef.collection('comments').doc(commentId);
    const [postSnap, snap] = await Promise.all([postRef.get(), commentRef.get()]);

    if (!postSnap.exists) throw new HttpsError("not-found", "Post not found.");
    await assertViewerCanInteractWithPost({
        postId,
        postData: postSnap.data() as Record<string, unknown>,
        viewerUid: uid,
    });

    if (!snap.exists) throw new HttpsError("not-found", "Comment missing.");
    
    const comment = snap.data()!;
    if (comment.authorId !== uid && !isModerator) {
        throw new HttpsError("permission-denied", "Unauthorized delete attempt.");
    }

    await commentRef.delete();
    return { success: true };
});

/**
 * likeSocialComment
 * Authority: POST_INTERACTION_V1
 * Effects: Toggles user like signal and updates comment likes counter.
 */
export const likeSocialComment = onCall({ cors: true }, async (request) => {
    const caller = await assertActiveAuthenticatedUser(request.auth);

    const { postId, commentId } = request.data as {
        postId?: string;
        commentId?: string;
    };
    const uid = caller.uid;

    if (!postId || !commentId) {
        throw new HttpsError("invalid-argument", "postId and commentId are required.");
    }

    const postRef = db.collection("posts").doc(postId);
    const commentRef = postRef.collection('comments').doc(commentId);
    const likeRef = db.collection('users').doc(uid).collection('comment_likes').doc(`${postId}_${commentId}`);
    const now = admin.firestore.FieldValue.serverTimestamp();

    try {
        return await db.runTransaction(async (transaction) => {
            const [postSnap, commentSnap, likeSnap] = await Promise.all([
                transaction.get(postRef),
                transaction.get(commentRef),
                transaction.get(likeRef),
            ]);

            if (!postSnap.exists) {
                throw new HttpsError("not-found", "Post not found.");
            }
            await assertViewerCanInteractWithPost({
                postId,
                postData: postSnap.data() as Record<string, unknown>,
                viewerUid: uid,
                transaction,
            });

            if (!commentSnap.exists) {
                throw new HttpsError("not-found", "Comment not found.");
            }

            const liked = !likeSnap.exists;
            const delta = liked ? 1 : -1;

            if (liked) {
                transaction.set(likeRef, {
                    postId,
                    commentId,
                    createdAt: now,
                    version: 1,
                });
            } else {
                transaction.delete(likeRef);
            }

            transaction.update(commentRef, {
                likesCount: admin.firestore.FieldValue.increment(delta),
                updatedAt: now,
            });

            return { success: true, liked };
        });
    } catch (error: any) {
        if (error instanceof HttpsError) throw error;
        logger.error(`[SOCIAL][COMMENT_LIKE_FAIL] ${error.message}`);
        throw new HttpsError("internal", "Failed to update comment interaction.");
    }
});
