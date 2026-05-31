import { onDocumentCreated, onDocumentUpdated, onDocumentDeleted } from "firebase-functions/v2/firestore";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import {
    buildSearchFieldsFromTextParts,
    extractHashtags,
    normalizeSearchText,
} from "../search/normalization";

const db = admin.firestore();

/**
 * resolveIndexingEligibility
 * Internal utility to verify if a post meets POST_INDEXING_POLICY_V1 criteria.
 */
export function isEligibleForIndexing(data: any): boolean {
    const visibility =
        typeof data.visibility === "string"
            ? data.visibility
            : data.visibility?.scope;
    const isDeleted =
        data.isDeleted === true
        || data.status === "deleted"
        || data.deletedAt != null
        || data.timestamps?.deletedAt != null;

    return (
        visibility === 'public' &&
        data.status === 'published' &&
        !isDeleted
    );
}

export function buildPostSearchProjection(postId: string, data: any): Record<string, unknown> {
    const rawText =
        typeof data?.content === "string"
            ? data.content
            : typeof data?.content?.text === "string"
                ? data.content.text
                : "";
    const authorName = typeof data?.authorName === "string" ? data.authorName : "";
    const authorHandle = typeof data?.authorHandle === "string" ? data.authorHandle : "";

    const searchFields = buildSearchFieldsFromTextParts([
        rawText,
        authorName,
        authorHandle,
    ]);

    return {
        postId,
        authorId: typeof data?.authorId === "string" ? data.authorId : "",
        authorNameNormalized: normalizeSearchText(authorName),
        authorHandleNormalized: normalizeSearchText(authorHandle),
        textNormalized: normalizeSearchText(rawText),
        hashtags: extractHashtags(rawText),
        searchTokens: searchFields.tokens,
        searchPrefixes: searchFields.prefixes,
        createdAt: data?.timestamps?.createdAt || data?.createdAt || null,
        status: "published",
        visibility: "public",
        contentType: data?.content?.attachments?.[0]?.type || "TEXT",
        indexedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
}

export async function buildSearchFeedProjectionFromAuthorities(
    postId: string,
    data: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
    if (!isEligibleForIndexing(data)) return null;
    const statsSnap = await db.collection("post_stats").doc(postId).get();
    const stats = statsSnap.exists ? (statsSnap.data() || {}) : {};
    return {
        ...buildPostSearchProjection(postId, data),
        likesCount: stats.likesCount || 0,
        commentsCount: stats.commentsCount || 0,
        repostsCount: stats.repostsCount || 0,
        bookmarksCount: stats.bookmarksCount || 0,
    };
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
    const projection = await buildSearchFeedProjectionFromAuthorities(postId, newData);
    if (!projection) return;

    try {
        await indexRef.set(projection);
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
        ...buildPostSearchProjection(postId, data),
        likesCount: 0,
        commentsCount: 0,
        repostsCount: 0,
        bookmarksCount: 0,
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

async function writeBookmarkProjection(params: {
    uid: string;
    entityId: string;
    entityType: 'post' | 'venue' | 'event' | 'quote';
}) {
    const { uid, entityId, entityType } = params;
    await db.collection('search_bookmarks').doc(`${uid}_${entityId}`).set(buildSearchBookmarkProjection({
        uid,
        entityId,
        entityType,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }));
}

export function buildSearchBookmarkProjection(params: {
    uid: string;
    entityId: string;
    entityType: 'post' | 'venue' | 'event' | 'quote';
    createdAt?: unknown;
}): Record<string, unknown> {
    return {
        uid: params.uid,
        entityId: params.entityId,
        entityType: params.entityType,
        createdAt: params.createdAt ?? admin.firestore.FieldValue.serverTimestamp(),
    };
}

async function deleteBookmarkProjection(uid: string, entityId: string) {
    await db.collection('search_bookmarks').doc(`${uid}_${entityId}`).delete();
}

export const syncBookmarkToSearchIndex = onDocumentCreated("users/{uid}/bookmarks/{entityId}", async (event) => {
    const { uid, entityId } = event.params;
    const data = event.data?.data() as Record<string, unknown> | undefined;
    const entityType = data?.type;
    if (
        entityType !== 'post' &&
        entityType !== 'venue' &&
        entityType !== 'event' &&
        entityType !== 'quote'
    ) {
        return;
    }
    await writeBookmarkProjection({ uid, entityId, entityType });
});

export const removeBookmarkFromSearchIndex = onDocumentDeleted("users/{uid}/bookmarks/{entityId}", async (event) => {
    const { uid, entityId } = event.params;
    await deleteBookmarkProjection(uid, entityId);
});

export const syncVenueBookmarkToSearchIndex = onDocumentCreated("users/{uid}/venue_bookmarks/{entityId}", async (event) => {
    const { uid, entityId } = event.params;
    await writeBookmarkProjection({ uid, entityId, entityType: 'venue' });
});

export const removeVenueBookmarkFromSearchIndex = onDocumentDeleted("users/{uid}/venue_bookmarks/{entityId}", async (event) => {
    const { uid, entityId } = event.params;
    await deleteBookmarkProjection(uid, entityId);
});

export const syncEventBookmarkToSearchIndex = onDocumentCreated("users/{uid}/event_bookmarks/{entityId}", async (event) => {
    const { uid, entityId } = event.params;
    await writeBookmarkProjection({ uid, entityId, entityType: 'event' });
});

export const removeEventBookmarkFromSearchIndex = onDocumentDeleted("users/{uid}/event_bookmarks/{entityId}", async (event) => {
    const { uid, entityId } = event.params;
    await deleteBookmarkProjection(uid, entityId);
});

/**
 * syncNotificationToSearchIndex
 * Trigger: onCreate(notifications/{id})
 */
export const syncNotificationToSearchIndex = onDocumentCreated("notifications/{id}", async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const id = event.params.id;
    
    const projection = buildSearchNotificationProjection(id, data);

    await db.collection('search_notifications').doc(id).set(projection);
});

export function buildSearchNotificationProjection(id: string, data: Record<string, unknown>): Record<string, unknown> {
    const actor = data.actor && typeof data.actor === "object" ? data.actor as Record<string, unknown> : {};
    const target = data.target && typeof data.target === "object" ? data.target as Record<string, unknown> : {};
    return {
        uid: data.uid,
        type: data.type,
        actorId: data.actorId || actor.uid || null,
        entityId: data.entityId || target.entity_id || null,
        entityType: data.entityType || target.entity_type || null,
        postId: data.postId || null,
        createdAt: data.createdAt,
        read: data.read === true,
        indexedAt: admin.firestore.FieldValue.serverTimestamp()
    };
}
