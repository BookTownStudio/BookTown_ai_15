// lib/services/firebaseCatalogService.ts
import { getDownloadURL, ref as storageRef } from 'firebase/storage';
import {
  getFirebaseStorage,
  getFirebaseFunctions,
} from '../firebase';
import { firestoreAdapter } from '../infrastructure/firebase/firestoreAdapter.ts';
import type { Book } from '../../types/entities.ts';
import { httpsCallable } from 'firebase/functions';
import type { FirebaseError } from 'firebase/app';

/**
 * 🔒 AUTHORITATIVE Firebase Catalog Service
 * Reads canonical books from Firestore
 *
 * ERROR DISCIPLINE:
 * - BOOK_NOT_READY → expected materialization delay
 * - Other errors → true failures
 */
export const firebaseCatalogService = {
  async getBook(bookId: string): Promise<Book> {
    if (!bookId) {
      throw new Error('BOOK_ID_MISSING');
    }

    try {
      const book = await firestoreAdapter.getDoc<any>(`books/${bookId}`);

      /**
       * 🔑 MATERIALIZATION GAP
       * Missing immediately after ingestion is EXPECTED.
       */
      if (!book) {
        throw new Error('BOOK_NOT_READY');
      }
      let resolvedCoverUrl = '';

      const coverPath =
        book?.cover?.medium ||
        book?.cover?.original ||
        book?.coverUrl ||
        '';

      if (typeof coverPath === 'string' && coverPath.startsWith('books/')) {
        try {
          const storage = getFirebaseStorage();
          resolvedCoverUrl = await getDownloadURL(
            storageRef(storage, coverPath)
          );
        } catch {
          // Cover resolution must NEVER break rendering
        }
      }

      return {
        id: bookId,
        titleEn: book.titleEn || book.title || '',
        titleAr: book.titleAr || '',
        authorEn: book.authorEn || book.author || '',
        authorAr: book.authorAr || '',
        authorId: book.authorId || null,
        descriptionEn: book.descriptionEn || book.description || '',
        descriptionAr: book.descriptionAr || '',
        coverUrl: resolvedCoverUrl,
        publicationDate: book.publicationDate || null,
        pageCount: book.pageCount || null,
        rating: book.rating || 0,
        ratingsCount: book.ratingsCount || 0,
        isEbookAvailable: Boolean(book.isEbookAvailable || book.hasEbook),
        genresEn: book.categories || [],
        genresAr: [],
      };
    } catch (err: any) {
      /**
       * 🔁 ERROR NORMALIZATION
       * Certain Firebase errors during cold starts or auth
       * are indistinguishable from propagation delay.
       */
      const fbErr = err as FirebaseError;

      if (
        err?.message === 'BOOK_NOT_READY' ||
        fbErr?.code === 'permission-denied' ||
        fbErr?.code === 'unavailable' ||
        fbErr?.code === 'not-found'
      ) {
        throw new Error('BOOK_NOT_READY');
      }

      throw err;
    }
  },

  async getRecommendations(): Promise<Book[]> {
    return [];
  },

  async ingestBook(params: {
    bookId: string;
    source: 'googleBooks' | 'openLibrary';
    rawBook: any;
  }) {
    const functions = getFirebaseFunctions();
    const ingestFn = httpsCallable(functions, 'ingestBook');
    const result = await ingestFn(params);
    return result.data;
  },

  /**
   * --------------------------------------------------
   * ✍️ ADD / UPDATE REVIEW (Authoritative Write Path)
   * --------------------------------------------------
   * RULES (LOCKED):
   * - One review per user per book
   * - UID is the document ID
   * - Create OR overwrite (idempotent)
   * - No aggregation logic here (handled by triggers)
   */
  async addReview(
    uid: string,
    review: {
      bookId: string;
      rating: number;
      text: string;
      authorName: string;
      authorHandle?: string;
      authorAvatar?: string | null;
    }
  ): Promise<void> {
    const {
      bookId,
      rating,
      text,
      authorName,
      authorHandle,
      authorAvatar,
    } = review;

    if (!uid || !bookId) {
      throw new Error('INVALID_REVIEW_IDENTITY');
    }

    if (rating < 1 || rating > 5) {
      throw new Error('INVALID_REVIEW_RATING');
    }

    const reviewPath = `books/${bookId}/reviews/${uid}`;
    const payload = {
      bookId,
      userId: uid,
      rating,
      text,
      authorName,
      authorHandle: authorHandle || null,
      authorAvatar: authorAvatar || null,
      updatedAt: firestoreAdapter.serverTimestamp(),
      createdAt: firestoreAdapter.serverTimestamp(),
    };

    await firestoreAdapter.setDoc(reviewPath, payload);
 },
  /**
   * --------------------------------------------------
   * 🗑️ DELETE REVIEW (Authoritative Delete Path)
   * --------------------------------------------------
   * RULES (LOCKED):
   * - Only owner can delete
   * - UID is the document ID
   * - Aggregates handled by triggers
   */
  async deleteReview(uid: string, bookId: string): Promise<void> {
    if (!uid || !bookId) {
      throw new Error('INVALID_REVIEW_IDENTITY');
    }

    const reviewPath = `books/${bookId}/reviews/${uid}`;
    await firestoreAdapter.deleteDoc(reviewPath);
  },
};
