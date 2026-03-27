// lib/hooks/useBookShelfStatus.ts

import { useMemo, useCallback } from 'react';
import { useUserShelves } from './useUserShelves.ts';
import { useCurrentlyReading } from './useCurrentlyReading.ts';

/**
 * System shelf identifiers
 */
const SYSTEM_CURRENTLY_READING_SHELF_ID = 'currently-reading';

/**
 * useBookShelfStatus
 * ------------------------------------------------
 * Canonical hook to determine a book's perceived
 * shelf membership for UI purposes.
 *
 * SOURCES OF TRUTH:
 * - shelves.entries              (user-managed shelves)
 * - reading_progress.status_state (system-managed)
 *
 * GUARANTEES:
 * - Backward compatible
 * - Virtual shelf aware
 * - No writes
 * - UI-stable during migration
 */
export const useBookShelfStatus = (bookId?: string) => {
  const { data: shelves, isLoading: isLoadingShelves } = useUserShelves();
  const {
    items: currentlyReading,
    isLoading: isLoadingProgress,
  } = useCurrentlyReading(200);

  /**
   * 🔒 Physical shelf membership
   * (user-managed shelves only)
   */
  const shelvesWithBook = useMemo(() => {
    if (!shelves || !bookId) return [];

    return shelves.filter(
      shelf =>
        shelf.entries &&
        Object.prototype.hasOwnProperty.call(shelf.entries, bookId)
    );
  }, [shelves, bookId]);

  /**
   * 🔒 Virtual system shelf membership
   * (derived from reading_progress)
   */
  const isCurrentlyReading = useMemo(() => {
    if (!bookId) return false;
    return currentlyReading.some(item => item.bookId === bookId);
  }, [currentlyReading, bookId]);

  /**
   * 🔒 Unified shelf membership check
   * Abstracts away physical vs virtual shelves
   */
  const isOnShelf = useCallback(
    (shelfId: string) => {
      if (shelfId === SYSTEM_CURRENTLY_READING_SHELF_ID) {
        return isCurrentlyReading;
      }

      return shelvesWithBook.some(shelf => shelf.id === shelfId);
    },
    [shelvesWithBook, isCurrentlyReading]
  );

  /**
   * 🔒 Unified "saved" state
   * A book is considered saved if it belongs
   * to ANY shelf (physical or virtual)
   */
  const isSavedOnPhysicalShelf = shelvesWithBook.length > 0;
  const isCurrentlyReadingFromProgress = isCurrentlyReading;
  const isSaved = shelvesWithBook.length > 0 || isCurrentlyReading;

  return {
    shelvesWithBook,
    isSavedOnPhysicalShelf,
    isCurrentlyReadingFromProgress,
    isSaved,
    isOnShelf,
    isLoading: isLoadingShelves || isLoadingProgress,
  };
};
