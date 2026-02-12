import { BookmarkType } from '../types/entities.ts';
import { serverTimestamp } from 'firebase/firestore';
import { getFirebaseDb } from '../lib/firebase.ts';

/**
 * SocialActionRepository
 * Authority: POST_INTERACTION_V1 (LOCKED)
 * 
 * Implements the append-only event principle for social signals.
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

class UnifiedSocialActionRepository implements SocialActionRepository {
    private getDb() {
        const db = getFirebaseDb();
        if (!db) throw new Error('FIRESTORE_NOT_AVAILABLE');
        return db;
    }

    async like(postId: string, userId: string) {
        const db = this.getDb();
        const ref = db.doc('users', userId, 'likes', postId);
        await db.setDoc(ref, {
            postId,
            timestamp: typeof serverTimestamp === 'function'
                ? serverTimestamp()
                : new Date().toISOString(),
            version: 1
        });
    }

    async unlike(postId: string, userId: string) {
        const db = this.getDb();
        const ref = db.doc('users', userId, 'likes', postId);
        await db.deleteDoc(ref);
    }

    async repost(postId: string, userId: string) {
        const db = this.getDb();
        const ref = db.doc('users', userId, 'reposts', postId);
        await db.setDoc(ref, {
            postId,
            timestamp: typeof serverTimestamp === 'function'
                ? serverTimestamp()
                : new Date().toISOString(),
            version: 1
        });
    }

    async unrepost(postId: string, userId: string) {
        const db = this.getDb();
        const ref = db.doc('users', userId, 'reposts', postId);
        await db.deleteDoc(ref);
    }

    async bookmark(
        entityId: string,
        userId: string,
        entityType: BookmarkType = 'post'
    ) {
        const db = this.getDb();
        const ref = db.doc('users', userId, 'bookmarks', entityId);
        await db.setDoc(ref, {
            type: entityType,
            entityId,
            timestamp: typeof serverTimestamp === 'function'
                ? serverTimestamp()
                : new Date().toISOString(),
            version: 1
        });
    }

    async unbookmark(
        entityId: string,
        userId: string,
        entityType: BookmarkType = 'post'
    ) {
        const db = this.getDb();
        await db.deleteDoc(
            db.doc('users', userId, 'bookmarks', entityId)
        );
    }

    async hasBookmarked(
        entityId: string,
        userId: string,
        type: BookmarkType
    ): Promise<boolean> {
        const db = this.getDb();
        const ref = db.doc('users', userId, 'bookmarks', entityId);
        const snap = await db.getDoc(ref);
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

        const db = this.getDb();

        const [likeSnap, bookmarkSnap, repostSnap] = await Promise.all([
            db.getDoc(db.doc('users', userId, 'likes', entityId)),
            db.getDoc(db.doc('users', userId, 'bookmarks', entityId)),
            db.getDoc(db.doc('users', userId, 'reposts', entityId))
        ]);

        return {
            like: likeSnap.exists(),
            bookmark: bookmarkSnap.exists(),
            repost: repostSnap.exists()
        };
    }

    async addComment(postId: string, userId: string, text: string) {
        if (!text.trim()) return;

        const db = this.getDb();
        const commentId = `c_${Date.now()}_${userId.substring(0, 5)}`;
        const commentRef = db.doc('posts', postId, 'comments', commentId);

        await db.setDoc(commentRef, {
            authorId: userId,
            text: text.trim(),
            timestamp: typeof serverTimestamp === 'function'
                ? serverTimestamp()
                : new Date().toISOString(),
            status: 'published',
            version: 1
        });
    }

    async reportPost(
        postId: string,
        reporterId: string,
        authorId: string,
        reason: string,
        details?: string
    ): Promise<void> {
        const db = this.getDb();
        const reportId = `rep_${Date.now()}_${reporterId.substring(0, 5)}`;
        const reportRef = db.doc('reports', reportId);
        const now = typeof serverTimestamp === 'function'
            ? serverTimestamp()
            : new Date().toISOString();

        await db.setDoc(reportRef, {
            entityType: 'post',
            entityId: postId,
            reportedByUid: reporterId,
            postAuthorId: authorId,
            reason: reason.toLowerCase(),
            details: details || "",
            status: 'open',
            createdAt: now,
            updatedAt: now,
            version: 1
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
        const db = this.getDb();
        const reportId = `rep_c_${Date.now()}_${reporterId.substring(0, 5)}`;
        const reportRef = db.doc('reports', reportId);
        const now = typeof serverTimestamp === 'function'
            ? serverTimestamp()
            : new Date().toISOString();

        await db.setDoc(reportRef, {
            entityType: 'comment',
            entityId: commentId,
            postId,
            reportedByUid: reporterId,
            authorId,
            reason,
            note: note || "",
            status: 'open',
            createdAt: now,
            updatedAt: now,
            version: 1
        });

        const signalRef = db.doc('users', reporterId, 'reports', commentId);
        await db.setDoc(signalRef, { timestamp: now });
    }

    async blockUser(userId: string, blockedUid: string) {
        const db = this.getDb();
        const ref = db.doc('users', userId, 'blocks', blockedUid);
        await db.setDoc(ref, {
            blockedUid,
            timestamp: typeof serverTimestamp === 'function'
                ? serverTimestamp()
                : new Date().toISOString()
        });
    }

    async isUserBlocked(userId: string, targetUid: string): Promise<boolean> {
        if (!userId) return false;
        const db = this.getDb();
        const ref = db.doc('users', userId, 'blocks', targetUid);
        const snap = await db.getDoc(ref);
        return snap.exists();
    }

    async hasReportedComment(
        userId: string,
        commentId: string
    ): Promise<boolean> {
        if (!userId) return false;
        const db = this.getDb();
        const ref = db.doc('users', userId, 'reports', commentId);
        const snap = await db.getDoc(ref);
        return snap.exists();
    }
}

export const socialActionRepository: SocialActionRepository =
    new UnifiedSocialActionRepository();