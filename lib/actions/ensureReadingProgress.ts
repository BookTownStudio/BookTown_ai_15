// lib/actions/ensureReadingProgress.ts

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.ts';

/**
 * ensureReadingProgress
 * --------------------------------------------------
 * Idempotent guard that guarantees a reading_progress
 * document exists for a given (userId, bookId).
 *
 * Purpose:
 * - Bridge legacy shelf interactions with the new
 *   reading_progress–driven architecture.
 *
 * Guarantees:
 * - No overwrites
 * - No progress mutation
 * - Safe to call multiple times
 * - No side effects beyond initialization
 */

interface EnsureReadingProgressArgs {
  userId: string;
  bookId: string;
  status_state?: 'currently_reading' | 'finished';
}

export async function ensureReadingProgress(
  args: EnsureReadingProgressArgs
): Promise<void> {
  const { userId, bookId, status_state } = args;

  // 🔒 Strict guard
  if (!userId) throw new Error('ensureReadingProgress: USER_ID_REQUIRED');
  if (!bookId) throw new Error('ensureReadingProgress: BOOK_ID_REQUIRED');

  // 🔒 If db isn't initialized, we must KNOW (this would fully explain the issue)
  if (!db?.raw) {
    console.error('[ensureReadingProgress] db.raw is missing. Firebase not initialized?');
    throw new Error('ensureReadingProgress: FIRESTORE_NOT_READY');
  }

  const docId = `${userId}_${bookId}`;
  const progressRef = doc(db.raw, 'reading_progress', docId);

  console.log('[ensureReadingProgress] start', {
    collection: 'reading_progress',
    docId,
    userId,
    bookId,
    status_state: status_state || 'currently_reading'
  });

  const snapshot = await getDoc(progressRef);

  if (snapshot.exists()) {
    console.log('[ensureReadingProgress] exists → no-op', { docId });
    return;
  }

  try {
    await setDoc(progressRef, {
      userId,
      bookId,
      progress: 0,
      lastPosition: null,
      status_state: status_state || 'currently_reading',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    console.log('[ensureReadingProgress] created', { docId });
  } catch (err) {
    console.error('[ensureReadingProgress] write failed', { docId, err });
    throw err; // 🔒 do not swallow: we need to see the rejection
  }
}