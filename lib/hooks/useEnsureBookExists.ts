import { useEffect } from 'react';
import { Book } from '../../types/entities.ts';
import { bookPersistenceService } from '../../services/bookPersistenceService.ts';

/**
 * useEnsureBookExists
 * Fire-and-forget hook that triggers the persistence check for a book.
 */
export const useEnsureBookExists = (book: Book | undefined) => {
  const bookId = book?.id;

  useEffect(() => {
    // Only attempt persistence if we have a valid book object with an ID
    if (book && bookId) {
      bookPersistenceService.ensureBookExists(book);
    }
  }, [bookId]); // Strict dependency on bookId ensures one run per book change
};