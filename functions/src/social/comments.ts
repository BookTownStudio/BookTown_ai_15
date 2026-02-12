import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";

const db = admin.firestore();
const COMMENT_EDIT_WINDOW_MINUTES = 15;

/**
 * addSocialComment
 * Authority: POST_INTERACTION_V1
 * Effects: Creates comment, emits activity log.
 */
export const addSocialComment = onCall({ cors: true }, async (request) => {
    const auth = request.auth;
    if (!auth) {
        throw new Error("unauthenticated");
    }
    
    const { postId, text } = request.data;
    const uid = auth.uid;
    const email = auth.token ? (auth.token.email || "") : "";

    if (!postId || !text || !text.trim()) {
        throw new HttpsError("invalid-argument", "Missing text.");
    }

    const postRef = db.collection('posts').doc(postId);
    const commentId = `c_${Date.now()}_${uid.substring(0, 5)}`;
    const commentRef = postRef.collection('comments').doc(commentId);
    
    const now = admin.firestore.FieldValue.serverTimestamp();

    try {
        await db.runTransaction(async (transaction) => {
            const postSnap = await transaction.get(postRef);
            if (!postSnap.exists) throw new HttpsError("not-found", "Post not found.");
            
            const post = postSnap.data()!;

            // 1. Create comment
            transaction.set(commentRef, {
                authorId: uid,
                authorName: auth.token?.name || email.split('@')[0] || "Anonymous",
                authorHandle: `@${email.split('@')[0] || 'user'}`,
                authorAvatar: auth.token?.picture || `https://api.dicebear.com/8.x/lorelei/svg?seed=${uid}`,
                text: text.trim(),
                timestamp: now,
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
                    target_owner_uid: post.authorId, 
                    visibility: post.visibility || 'public',
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
    const auth = request.auth;
    if (!auth) {
        throw new Error("unauthenticated");
    }
    
    const { postId, commentId, text } = request.data;
    const uid = auth.uid;

    if (!postId || !commentId || !text) {
        throw new HttpsError("invalid-argument", "Missing required fields.");
    }

    const commentRef = db.collection('posts').doc(postId).collection('comments').doc(commentId);

    try {
        return await db.runTransaction(async (transaction) => {
            const snap = await transaction.get(commentRef);
            if (!snap.exists) throw new HttpsError("not-found", "Comment not found.");

            const comment = snap.data()!;
            if (comment.authorId !== uid) {
                throw new HttpsError("permission-denied", "Unauthorized edit attempt.");
            }

            // Window enforcement
            const createdAt = comment.timestamp as admin.firestore.Timestamp;
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
    const auth = request.auth;
    if (!auth) {
        throw new Error("unauthenticated");
    }

    const { postId, commentId } = request.data;
    const uid = auth.uid;
    const isAdmin = auth.token ? (auth.token.admin === true) : false;

    const commentRef = db.collection('posts').doc(postId).collection('comments').doc(commentId);
    const snap = await commentRef.get();

    if (!snap.exists) throw new HttpsError("not-found", "Comment missing.");
    
    const comment = snap.data()!;
    if (comment.authorId !== uid && !isAdmin) {
        throw new HttpsError("permission-denied", "Unauthorized delete attempt.");
    }

    await commentRef.delete();
    return { success: true };
});