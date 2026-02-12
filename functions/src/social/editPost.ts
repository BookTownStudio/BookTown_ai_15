import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";

/**
 * editSocialPost
 * Authority: POST_EDITING_POLICY_V1 (LOCKED)
 * Enforces: text and visibility edits, conditional attachment edits, versioned history.
 */
export const editSocialPost = onCall({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Auth required.");
    }

    const { postId, text, visibility, attachments: clientAttachments } = request.data;
    const uid = request.auth.uid;
    const isAdmin = request.auth.token.admin === true || request.auth.token.role === 'superadmin';

    if (!postId) {
        throw new HttpsError("invalid-argument", "postId required.");
    }

    const db = admin.firestore();
    const postRef = db.collection('posts').doc(postId);

    try {
        const result = await db.runTransaction(async (transaction) => {
            const snap = await transaction.get(postRef);
            if (!snap.exists) throw new HttpsError("not-found", "Post missing.");

            const post = snap.data()!;
            
            // 1. Security Enforcement
            const isOwner = post.authorId === uid;
            if (!isOwner && !isAdmin) {
                throw new HttpsError("permission-denied", "POST_EDIT_FORBIDDEN: Unauthorized editor.");
            }

            // POST_ELLIPSIS_MENU_CONTRACT_V1: blocked_when: post.status !== 'published'
            if (post.status !== 'published') {
                throw new HttpsError("failed-precondition", "POST_EDIT_BLOCKED: Edits only allowed on published posts.");
            }

            // 2. Conditional Attachment Enforcement (POST_EDITING_POLICY_V1)
            const hasInteractions = (post.counters?.likes > 0) || (post.counters?.comments > 0) || (post.counters?.reposts > 0);
            
            if (clientAttachments !== undefined && hasInteractions) {
                throw new HttpsError("failed-precondition", "ATTACHMENT_EDIT_LOCKED: Cannot edit attachments after post has interactions.");
            }

            const now = admin.firestore.Timestamp.now();
            const createdAt = post.timestamps.createdAt instanceof admin.firestore.Timestamp 
                ? post.timestamps.createdAt 
                : admin.firestore.Timestamp.fromDate(new Date(post.timestamps.createdAt));
            
            const secondsSincePublish = now.seconds - createdAt.seconds;
            const GRACE_PERIOD = 900; // 15 minutes (POST_EDITING_POLICY_V1)

            const updates: any = {
                'timestamps.updatedAt': now,
                'lastEditedAt': now,
                'editVersion': admin.firestore.FieldValue.increment(1)
            };

            // 3. Versioning & Audit
            const editHistoryRef = postRef.collection('post_edits').doc();
            transaction.set(editHistoryRef, {
                oldText: post.content.text,
                oldVisibility: post.visibility,
                oldAttachments: post.content.attachments || [],
                editedBy: uid,
                timestamp: now,
                isWithinGracePeriod: secondsSincePublish <= GRACE_PERIOD,
                editVersion: (post.editVersion || 0) + 1
            });

            // 4. Field Updates
            if (text !== undefined && text.trim() !== post.content.text) {
                updates['content.text'] = text.trim();
                updates['flags.edited'] = true;
            }

            if (visibility !== undefined && visibility !== post.visibility) {
                updates['visibility'] = visibility;
            }

            if (clientAttachments !== undefined && !hasInteractions) {
                updates['content.attachments'] = clientAttachments.map((a: any, index: number) => ({
                    attachmentId: a.attachmentId || a.id || 'missing_id',
                    type: a.type || 'IMAGE',
                    role: index === 0 ? 'primary' : 'secondary',
                    renderHint: 'card'
                }));
                updates['flags.hasAttachments'] = clientAttachments.length > 0;
                updates['flags.edited'] = true;
            }

            transaction.update(postRef, updates);

            // 5. Activity Log
            const auditRef = db.collection('activity_log').doc();
            transaction.set(auditRef, {
                verb: 'post_edited',
                actor: { uid, type: 'user' },
                object: { entity_type: 'post', entity_id: postId },
                context: { 
                    target_owner_uid: post.authorId, 
                    isGracePeriod: secondsSincePublish <= GRACE_PERIOD,
                    editVersion: (post.editVersion || 0) + 1
                },
                createdAt: now,
                version: "1.0"
            });

            return { success: true };
        });

        return result;
    } catch (error: any) {
        if (error instanceof HttpsError) throw error;
        logger.error(`[SOCIAL][EDIT_FAILURE] ${error.message}`, { error });
        throw new HttpsError("internal", "An unexpected error occurred during the edit process.");
    }
});