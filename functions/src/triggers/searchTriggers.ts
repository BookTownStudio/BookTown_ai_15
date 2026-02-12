import { onDocumentCreated, onDocumentUpdated, onDocumentDeleted } from "firebase-functions/v2/firestore";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";

const db = admin.firestore();

/**
 * resolveIndexingEligibility
 * Internal utility to verify if a post meets POST_INDEXING_POLICY_V1 criteria.
 */
function isEligibleForIndexing(data: any): boolean {
    return (
        data.visibility?.scope === 'public' && 
        data.visibility?.suppressed === false &&
        data.status === 'published' &&
        data.deletedAt == null
    );
}

/**
 * syncPostToSearchIndex
 * Trigger: onUpdate (posts/{postId})
 * Implementation of POST_INDEXING_POLICY_V1 Fan-Out.
 */
export const syncPostToSearchIndex = onDocumentUpdated("posts/{postId}", async (event) => {
    const newData = event.data?.after.data();
    if (!newData) return;

    const postId = event.params.postId;
    const indexRef = db.collection('search_feed').doc(postId);

    // 1. Re-evaluate Eligibility
    if (!isEligibleForIndexing(newData)) {
        logger.info(`[INDEX][PURGE] Post ${postId} no longer eligible. Removing from search_feed.`);
        await indexRef.delete();
        return;
    }
    
    // 2. Construct Canonical Index Document (DATA_CONTRACT_V1)
    // POST_RANKING_POLICY_V1: Baseline is createdAt
    const projection = {
        postId: postId,
        authorId: newData.authorId,
        createdAt: newData.createdAt,
        status: newData.status,
        visibility: 'public', 
        contentType: newData.content?.attachments?.[0]?.type || 'TEXT',
        indexedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    try {
        await indexRef.set(projection, { merge: true });
    } catch (error) {
        logger.error(`[INDEX][ERROR] Failed to sync ${postId} to search_feed`, error);
    }
});

/**
 * syncPostStatsToSearchIndex
 * Trigger: onUpdate (post_stats/{postId})
 * Implementation of POST_RANKING_POLICY_V1 engagement signals.
 * Invariant: Derived stats are additive signals for discovery.
 */
export const syncPostStatsToSearchIndex = onDocumentUpdated("post_stats/{postId}", async (event) => {
    const newData = event.data?.after.data();
    if (!newData) return;

    const postId = event.params.postId;
    const indexRef = db.collection('search_feed').doc(postId);

    // Architectural Rule: Only sync if the post is currently indexed (public/eligible)
    const indexSnap = await indexRef.get();
    if (!indexSnap.exists) return;

    try {
        await indexRef.update({
            likesCount: newData.likesCount || 0,
            commentsCount: newData.commentsCount || 0,
            repostsCount: newData.repostsCount || 0,
            bookmarksCount: newData.bookmarksCount || 0,
            // Track activity velocity baseline
            lastActivityAt: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        logger.error(`[INDEX][STATS_SYNC] Failed for post ${postId}`, error);
    }
});

/**
 * initPostSearchIndex
 * Trigger: onCreate (posts/{postId})
 */
export const initPostSearchIndex = onDocumentCreated("posts/{postId}", async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const postId = event.params.postId;

    if (!isEligibleForIndexing(data)) {
        return;
    }
    
    const projection = {
        postId: postId,
        authorId: data.authorId,
        createdAt: data.createdAt,
        status: data.status,
        visibility: 'public',
        likesCount: 0,
        commentsCount: 0,
        repostsCount: 0,
        bookmarksCount: 0,
        indexedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('search_feed').doc(postId).set(projection);
    logger.info(`[INDEX][ADD] Initialized index for public post ${postId}`);
});

/**
 * removePostFromSearchIndex
 * Trigger: onDelete (posts/{postId})
 */
export const removePostFromSearchIndex = onDocumentDeleted("posts/{postId}", async (event) => {
    await db.collection('search_feed').doc(event.params.postId).delete();
    logger.info(`[INDEX][DELETE] Hard removed post ${event.params.postId} from index.`);
});

/**
 * syncBookmarkToSearchIndex
 * Trigger: onCreate (users/{uid}/bookmarks/{entityId})
 */
export const syncBookmarkToSearchIndex = onDocumentCreated("users/{uid}/bookmarks/{entityId}", async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const { uid, entityId } = event.params;
    const docId = `${uid}_${entityId}`;

    const projection = {
        uid: uid,
        entityId: entityId,
        entityType: data.type || 'post',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection('search_bookmarks').doc(docId).set(projection);
});

export const removeBookmarkFromSearchIndex = onDocumentDeleted("users/{uid}/bookmarks/{entityId}", async (event) => {
    const { uid, entityId } = event.params;
    await db.collection('search_bookmarks').doc(`${uid}_${entityId}`).delete();
});

/**
 * syncNotificationToSearchIndex
 * Trigger: onCreate(notifications/{id})
 */
export const syncNotificationToSearchIndex = onDocumentCreated("notifications/{id}", async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const id = event.params.id;
    
    const projection = {
        uid: data.uid,
        type: data.type,
        actorId: data.actorId,
        entityId: data.entityId,
        createdAt: data.createdAt,
        read: data.isRead || false,
        indexedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('search_notifications').doc(id).set(projection);
});