import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import {
    assertActiveAuthenticatedUser,
    getRoleFromClaims,
} from "../shared/auth";

/**
 * editSocialPost
 * Authority: POST_EDITING_POLICY_V1 (LOCKED)
 * Enforces: text and visibility edits only, immutable attachment/entity fields, versioned history.
 */
export const editSocialPost = onCall({ cors: true }, async (request) => {
    const caller = await assertActiveAuthenticatedUser(request.auth);

    const payload =
        request.data && typeof request.data === "object"
            ? (request.data as Record<string, unknown>)
            : {};
    const postId = typeof payload.postId === "string" ? payload.postId.trim() : "";
    const text =
        typeof payload.text === "string"
            ? payload.text
            : payload.content &&
                typeof payload.content === "object" &&
                typeof (payload.content as Record<string, unknown>).text === "string"
                ? ((payload.content as Record<string, unknown>).text as string)
                : undefined;
    const visibility =
        typeof payload.visibility === "string" ? payload.visibility.trim() : undefined;
    const uid = caller.uid;
    const isAdmin = getRoleFromClaims(caller) === "superadmin";

    if (!postId) {
        throw new HttpsError("invalid-argument", "postId required.");
    }

    const hasOwn = (obj: Record<string, unknown>, key: string): boolean =>
        Object.prototype.hasOwnProperty.call(obj, key);
    const blockedFields: string[] = [];
    if (hasOwn(payload, "attachments")) blockedFields.push("attachments");
    if (hasOwn(payload, "primaryEntityType")) blockedFields.push("primaryEntityType");
    if (hasOwn(payload, "primaryEntityId")) blockedFields.push("primaryEntityId");
    if (payload.content && typeof payload.content === "object") {
        const content = payload.content as Record<string, unknown>;
        if (hasOwn(content, "attachments")) blockedFields.push("content.attachments");
        if (hasOwn(content, "primaryEntityType")) blockedFields.push("content.primaryEntityType");
        if (hasOwn(content, "primaryEntityId")) blockedFields.push("content.primaryEntityId");
    }
    if (blockedFields.length > 0) {
        throw new HttpsError("failed-precondition", "ATTACHMENT_EDIT_NOT_ALLOWED", {
            errorCode: "ATTACHMENT_EDIT_NOT_ALLOWED",
            blockedFields
        });
    }

    if (
        visibility !== undefined &&
        !["public", "followers", "private", "restricted"].includes(visibility)
    ) {
        throw new HttpsError("invalid-argument", "Invalid visibility.");
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
