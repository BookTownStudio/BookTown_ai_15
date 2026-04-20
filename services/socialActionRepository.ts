import {
    doc,
    setDoc,
    deleteDoc,
    getDoc,
    increment,
    runTransaction,
    serverTimestamp,
    collection,
    Firestore,
} from 'firebase/firestore';
import { BookmarkType } from '../types/entities.ts';
import { getFirebaseDb } from '../lib/firebase.ts';

/**
 * SocialActionRepository
 * Authority: POST_INTERACTION_V1 (LOCKED)
 * Truth resides in document existence within user-scoped subcollections.
 */
export interface SocialActionRepository {
    like(postId: string, userId: string): Promise<void>;
    unlike(postId: string, userId: string): Promise<void>;
    repost(postId: string, userId: string): Promise<void>;
    unrepost(postId: string, userId: string): Promise<void>;
    bookmark(entityId: string, userId: string, entityType?: BookmarkType): Promise<void>;
    unbookmark(entityId: string, userId: string, entityType?: BookmarkType): Promise<void>;
    hasBookmarked(entityId: string, userId: string, type: BookmarkType): Promise<boolean>;
    getInteractionStatus(
        userId: string,
        entityId: string,
        entityType: string
    ): Promise<{ like: boolean; bookmark: boolean; repost: boolean }>;
    addComment(postId: string, userId: string, text: string): Promise<void>;
    reportPost(
        postId: string,
        reporterId: string,
        authorId: string,
        reason: string,
        details?: string
    ): Promise<void>;
    reportComment(
        postId: string,
        commentId: string,
        reporterId: string,
        authorId: string,
        reason: string,
        note?: string
    ): Promise<void>;
    blockUser(userId: string, blockedUid: string): Promise<void>;
    isUserBlocked(userId: string, targetUid: string): Promise<boolean>;
    hasReportedComment(userId: string, commentId: string): Promise<boolean>;
}

function requireDb(): Firestore {
    const db = getFirebaseDb();
    if (!db) {
        throw new Error('FIRESTORE_NOT_AVAILABLE');
    }
    return db;
}

function requireId(value: string, field: string): string {
    if (typeof value !== 'string') {
        throw new Error(`INVALID_ARGUMENT:${field}`);
    }

    const normalized = value.trim();
    if (!normalized) {
        throw new Error(`INVALID_ARGUMENT:${field}`);
    }
    return normalized;
}

function bookmarkCollectionForType(type: BookmarkType): string {
    if (type === 'post') return 'post_bookmarks';
    if (type === 'venue') return 'venue_bookmarks';
    if (type === 'event') return 'event_bookmarks';
    return 'bookmarks';
}

function normalizeBookmarkType(type: string): BookmarkType {
    if (type === 'post' || type === 'venue' || type === 'event' || type === 'quote') {
        return type;
    }
    return 'post';
}

function readNonNegativeBookmarkCount(source: unknown): number {
    if (typeof source !== 'number' || !Number.isFinite(source)) {
        return 0;
    }
    return Math.max(0, Math.trunc(source));
}

class UnifiedSocialActionRepository implements SocialActionRepository {
    async like(postId: string, userId: string) {
        const db = requireDb();
        const normalizedPostId = requireId(postId, 'postId');
        const normalizedUserId = requireId(userId, 'userId');

        const ref = doc(db, 'users', normalizedUserId, 'likes', normalizedPostId);
        await setDoc(ref, {
            postId: normalizedPostId,
            timestamp: serverTimestamp(),
            version: 1,
        });
    }

    async unlike(postId: string, userId: string) {
        const db = requireDb();
        const normalizedPostId = requireId(postId, 'postId');
        const normalizedUserId = requireId(userId, 'userId');

        await deleteDoc(doc(db, 'users', normalizedUserId, 'likes', normalizedPostId));
    }

    async repost(postId: string, userId: string) {
        const db = requireDb();
        const normalizedPostId = requireId(postId, 'postId');
        const normalizedUserId = requireId(userId, 'userId');

        const ref = doc(db, 'users', normalizedUserId, 'reposts', normalizedPostId);
        await setDoc(ref, {
            postId: normalizedPostId,
            timestamp: serverTimestamp(),
            version: 1,
        });
    }

    async unrepost(postId: string, userId: string) {
        const db = requireDb();
        const normalizedPostId = requireId(postId, 'postId');
        const normalizedUserId = requireId(userId, 'userId');

        await deleteDoc(doc(db, 'users', normalizedUserId, 'reposts', normalizedPostId));
    }

    async bookmark(
        entityId: string,
        userId: string,
        entityType: BookmarkType = 'post'
    ) {
        const db = requireDb();
        const normalizedEntityId = requireId(entityId, 'entityId');
        const normalizedUserId = requireId(userId, 'userId');
        const bookmarkCollection = bookmarkCollectionForType(entityType);
        const bookmarkRef = doc(db, 'users', normalizedUserId, bookmarkCollection, normalizedEntityId);

        await runTransaction(db, async (transaction) => {
            const bookmarkSnap = await transaction.get(bookmarkRef);
            if (bookmarkSnap.exists()) {
                return;
            }

            transaction.set(
                bookmarkRef,
                {
                    type: entityType,
                    entityId: normalizedEntityId,
                    timestamp: serverTimestamp(),
                    version: 1,
                },
                { merge: true }
            );

            if (entityType !== 'post') {
                return;
            }

            const postRef = doc(db, 'posts', normalizedEntityId);
            const postSnap = await transaction.get(postRef);

            if (!postSnap.exists()) {
                throw new Error('POST_NOT_FOUND');
            }

            const postData = postSnap.data() as Record<string, unknown>;
            const counters =
                postData.counters && typeof postData.counters === 'object'
                    ? (postData.counters as Record<string, unknown>)
                    : {};
            const currentBookmarks = readNonNegativeBookmarkCount(
                postData.bookmarksCount ?? counters.bookmarks
            );

            transaction.update(postRef, {
                'counters.bookmarks': increment(1),
                bookmarksCount: currentBookmarks + 1,
            });
        });
    }

    async unbookmark(
        entityId: string,
        userId: string,
        entityType: BookmarkType = 'post'
    ) {
        const db = requireDb();
        const normalizedEntityId = requireId(entityId, 'entityId');
        const normalizedUserId = requireId(userId, 'userId');
        const bookmarkCollection = bookmarkCollectionForType(entityType);
        const bookmarkRef = doc(db, 'users', normalizedUserId, bookmarkCollection, normalizedEntityId);

        await runTransaction(db, async (transaction) => {
            const bookmarkSnap = await transaction.get(bookmarkRef);
            if (!bookmarkSnap.exists()) {
                return;
            }

            transaction.delete(bookmarkRef);

            if (entityType !== 'post') {
                return;
            }

            const postRef = doc(db, 'posts', normalizedEntityId);
            const postSnap = await transaction.get(postRef);
            if (!postSnap.exists()) {
                return;
            }

            const postData = postSnap.data() as Record<string, unknown>;
            const counters =
                postData.counters && typeof postData.counters === 'object'
                    ? (postData.counters as Record<string, unknown>)
                    : {};
            const currentBookmarks = readNonNegativeBookmarkCount(
                postData.bookmarksCount ?? counters.bookmarks
            );

            if (currentBookmarks <= 0) {
                transaction.update(postRef, {
                    'counters.bookmarks': 0,
                    bookmarksCount: 0,
                });
                return;
            }

            transaction.update(postRef, {
                'counters.bookmarks': increment(-1),
                bookmarksCount: currentBookmarks - 1,
            });
        });
    }

    async hasBookmarked(
        entityId: string,
        userId: string,
        type: BookmarkType
    ): Promise<boolean> {
        const db = requireDb();
        const normalizedEntityId = requireId(entityId, 'entityId');
        const normalizedUserId = requireId(userId, 'userId');
        const bookmarkCollection = bookmarkCollectionForType(type);

        const snap = await getDoc(doc(db, 'users', normalizedUserId, bookmarkCollection, normalizedEntityId));
        return snap.exists();
    }

    async getInteractionStatus(
        userId: string,
        entityId: string,
        entityType: string
    ) {
        if (!userId || !entityId) {
            return { like: false, bookmark: false, repost: false };
        }

        const db = requireDb();
        const normalizedEntityId = requireId(entityId, 'entityId');
        const normalizedUserId = requireId(userId, 'userId');
        const normalizedType = normalizeBookmarkType(entityType);
        const bookmarkCollection = bookmarkCollectionForType(normalizedType);

        const [likeSnap, bookmarkSnap, repostSnap] = await Promise.all([
            getDoc(doc(db, 'users', normalizedUserId, 'likes', normalizedEntityId)),
            getDoc(doc(db, 'users', normalizedUserId, bookmarkCollection, normalizedEntityId)),
            getDoc(doc(db, 'users', normalizedUserId, 'reposts', normalizedEntityId)),
        ]);

        return {
            like: likeSnap.exists(),
            bookmark: bookmarkSnap.exists(),
            repost: repostSnap.exists(),
        };
    }

    async addComment(postId: string, userId: string, text: string) {
        const normalizedText = text.trim();
        if (!normalizedText) return;

        const db = requireDb();
        const normalizedPostId = requireId(postId, 'postId');
        const normalizedUserId = requireId(userId, 'userId');

        const commentRef = doc(collection(db, 'posts', normalizedPostId, 'comments'));

        await setDoc(commentRef, {
            authorId: normalizedUserId,
            text: normalizedText,
            timestamp: serverTimestamp(),
            status: 'published',
            version: 1,
        });
    }

    async reportPost(
        postId: string,
        reporterId: string,
        authorId: string,
        reason: string,
        details?: string
    ): Promise<void> {
        const db = requireDb();
        const normalizedPostId = requireId(postId, 'postId');
        const normalizedReporterId = requireId(reporterId, 'reporterId');
        const normalizedAuthorId = requireId(authorId, 'authorId');
        const normalizedReason = requireId(reason, 'reason').toLowerCase();

        const reportRef = doc(collection(db, 'reports'));

        await setDoc(reportRef, {
            entityType: 'post',
            entityId: normalizedPostId,
            reportedByUid: normalizedReporterId,
            postAuthorId: normalizedAuthorId,
            reason: normalizedReason,
            details: details?.trim() || '',
            status: 'open',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            version: 1,
        });
    }

    async reportComment(
        postId: string,
        commentId: string,
        reporterId: string,
        authorId: string,
        reason: string,
        note?: string
    ) {
        const db = requireDb();
        const normalizedPostId = requireId(postId, 'postId');
        const normalizedCommentId = requireId(commentId, 'commentId');
        const normalizedReporterId = requireId(reporterId, 'reporterId');
        const normalizedAuthorId = requireId(authorId, 'authorId');
        const normalizedReason = requireId(reason, 'reason');

        const reportRef = doc(collection(db, 'reports'));

        await setDoc(reportRef, {
            entityType: 'comment',
            entityId: normalizedCommentId,
            postId: normalizedPostId,
            reportedByUid: normalizedReporterId,
            authorId: normalizedAuthorId,
            reason: normalizedReason,
            note: note?.trim() || '',
            status: 'open',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            version: 1,
        });

        await setDoc(doc(db, 'users', normalizedReporterId, 'reports', normalizedCommentId), {
            timestamp: serverTimestamp(),
        });
    }

    async blockUser(userId: string, blockedUid: string) {
        const db = requireDb();
        const normalizedUserId = requireId(userId, 'userId');
        const normalizedBlockedUid = requireId(blockedUid, 'blockedUid');

        await setDoc(doc(db, 'users', normalizedUserId, 'blocks', normalizedBlockedUid), {
            blockedUid: normalizedBlockedUid,
            timestamp: serverTimestamp(),
        });
    }

    async isUserBlocked(userId: string, targetUid: string): Promise<boolean> {
        if (!userId) return false;

        const db = requireDb();
        const normalizedUserId = requireId(userId, 'userId');
        const normalizedTargetUid = requireId(targetUid, 'targetUid');

        const snap = await getDoc(doc(db, 'users', normalizedUserId, 'blocks', normalizedTargetUid));
        return snap.exists();
    }

    async hasReportedComment(
        userId: string,
        commentId: string
    ): Promise<boolean> {
        if (!userId) return false;

        const db = requireDb();
        const normalizedUserId = requireId(userId, 'userId');
        const normalizedCommentId = requireId(commentId, 'commentId');

        const snap = await getDoc(doc(db, 'users', normalizedUserId, 'reports', normalizedCommentId));
        return snap.exists();
    }
}

export const socialActionRepository: SocialActionRepository =
    new UnifiedSocialActionRepository();
