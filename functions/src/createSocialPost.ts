import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "./firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { recomputeUserStats } from "./userStats/recomputeUserStats";
import { assertActiveAuthenticatedUser } from "./shared/auth";

/**
 * createSocialPost
 * Authoritative backend path for creating social posts.
 * Enforces POST_MODEL_V1 Locked Schema and POST_CREATION_FLOW_V1 principle.
 */
export const createSocialPost = onCall({ cors: true }, async (request) => {
  logger.info("[SOCIAL][PUBLISH_ATTEMPT] Processing publish request");

  const caller = await assertActiveAuthenticatedUser(request.auth);

  const { content, attachments: clientAttachments, publishToken, visibility: clientVisibility } = request.data;
  const uid = caller.uid;
  const email = typeof caller.token.email === "string" ? caller.token.email : "";

  if (!publishToken) {
    throw new HttpsError("invalid-argument", "publishToken is required.");
  }

  const text = typeof content === 'string' ? content.trim() : (content?.text?.trim() || null);
  const contentAttachments = Array.isArray(content?.attachments) ? content.attachments : [];
  const attachments = Array.isArray(clientAttachments)
    ? clientAttachments
    : contentAttachments;
  const visibility = ["public", "followers", "private", "restricted"].includes(clientVisibility)
    ? clientVisibility
    : "public";

  if (!text && attachments.length === 0) {
    throw new HttpsError("invalid-argument", "Text or attachments required.");
  }

  const db = admin.firestore();
  const now = admin.firestore.FieldValue.serverTimestamp();

  // Construct Locked Schema (POST_MODEL_V1)
  const postData: any = {
    authorId: uid,
    authorName: caller.token.name || email.split('@')[0] || "Anonymous",
    authorHandle: `@${email.split('@')[0] || 'user'}`,
    authorAvatar: caller.token.picture || `https://api.dicebear.com/8.x/lorelei/svg?seed=${uid}`,
    
    content: {
        text: text,
        attachments: attachments.map((a: Record<string, any>, index: number) => ({
            attachmentId: a.attachmentId || a.id || 'missing_id',
            type: a.type || 'IMAGE',
            role: index === 0 ? 'primary' : 'secondary',
            renderHint: 'card'
        }))
    },

    visibility,
    status: "published",
    isDeleted: false,

    counters: { 
        likes: 0, 
        comments: 0, 
        reposts: 0, 
        bookmarks: 0 
    },

    timestamps: {
        createdAt: now,
        updatedAt: null,
        publishedAt: now
    },

    flags: {
        edited: false,
        hasAttachments: attachments.length > 0
    },

    publishToken,
    version: 1
  };

  try {
    const result = await db.runTransaction(async (transaction) => {
        // Idempotency check: prevent duplicate publishing from UI glitches
        const idempotencyRef = db.collection('_publish_idempotency').doc(publishToken);
        const idempotencySnap = await transaction.get(idempotencyRef);
        
        if (idempotencySnap.exists) {
            return { success: true, postId: idempotencySnap.data()?.postId, isDuplicate: true };
        }

        const postRef = db.collection('posts').doc();
        transaction.set(postRef, postData);

        transaction.set(idempotencyRef, {
            postId: postRef.id,
            uid,
            createdAt: now
        });

        // Initialize empty stats document (FANOUT_V1)
        const statsRef = db.collection('post_stats').doc(postRef.id);
        transaction.set(statsRef, {
            counters: { likes: 0, comments: 0, reposts: 0, bookmarks: 0 },
            lastUpdatedAt: now
        });

        return { success: true, postId: postRef.id, isDuplicate: false };
    });

    // 🔒 Authoritative Recompute
    await recomputeUserStats(uid);

    return result;

  } catch (error: any) {
    logger.error(`[SOCIAL][PUBLISH_FAILURE] ${error.message}`, { error });
    throw new HttpsError("internal", "Failed to publish post.");
  }
});
