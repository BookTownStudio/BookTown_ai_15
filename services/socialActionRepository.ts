import {
    doc,
    getDoc,
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
    hasBookmarked(entityId: string, userId: string, type: BookmarkType): Promise<boolean>;
    getInteractionStatus(
        userId: string,
        entityId: string,
        entityType: string
    ): Promise<{ like: boolean; bookmark: boolean; repost: boolean }>;
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
    if (type === 'post') return 'bookmarks';
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

class UnifiedSocialActionRepository implements SocialActionRepository {
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
